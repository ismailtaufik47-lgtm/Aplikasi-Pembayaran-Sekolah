-- =====================================================================
-- 0054: ceklis lama tetap bisa dilihat guru setelah dasar penilaian diganti
--
--  Masalah: kalau dasar penilaian (Kurikulum Merdeka / STPPA / buat sendiri)
--  diganti SESUDAH ceklis periode berjalan terbit, indikator lama diarsipkan
--  (nilainya tetap tersimpan). Aplikasi Tumbuh hanya mengenal indikator aktif,
--  sehingga layar "Lihat / ubah ceklis" kosong.
--
--  • kelas_ceklis        : ikut mengirim "lama" = indikator yang sudah
--                          diarsipkan tapi masih fokus periode itu atau punya
--                          nilai di periode itu (nama + aspeknya).
--  • kelas_nilai_simpan  : nilai indikator yang sudah diarsipkan hanya bisa
--                          dilihat, tidak bisa diubah lagi.
--
--  Tidak mengubah tabel / data. Portal orang tua tidak berubah (sejak 0052
--  sudah menampilkan aspek lama yang punya nilai).
--  Jalankan SETELAH 0053. Aman dijalankan berkali-kali.
-- =====================================================================

-- ---------- 1. isi ceklis + indikator lama ----------
create or replace function kelas_ceklis(p_periode uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record; p tumbuh_periode;
begin
  select * into g from guru_saya();
  select * into p from tumbuh_periode where id = p_periode and sekolah_id = g.sekolah_id and kelas = g.kelas;
  if g.sekolah_id is null or p.id is null then raise exception 'Periode tidak ditemukan.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'periode', tumbuh_periode_json(p),
    'nilai', coalesce((select jsonb_agg(jsonb_build_object('s', n.siswa_id, 'i', n.indikator_id, 'n', n.nilai))
                         from tumbuh_nilai n where n.periode_id = p.id), '[]'::jsonb),
    'awal', coalesce((select jsonb_agg(jsonb_build_object('s', z.siswa_id, 'i', z.indikator_id, 'n', z.nilai)) from (
                        select distinct on (n.siswa_id, n.indikator_id) n.siswa_id, n.indikator_id, n.nilai
                          from tumbuh_nilai n join tumbuh_periode q on q.id = n.periode_id
                          join siswa x on x.id = n.siswa_id
                         where q.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif and q.id <> p.id
                           and n.indikator_id = any(p.fokus) and (q.mulai, q.dibuat_pada) < (p.mulai, p.dibuat_pada)
                         order by n.siswa_id, n.indikator_id, q.mulai desc, q.dibuat_pada desc) z), '[]'::jsonb),
    -- indikator yang sudah diganti / dihapus sekolah, tapi masih dipakai periode ini
    'lama', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'nama', i.nama, 'keterangan', i.keterangan, 'khas', i.khas,
                        'aspek', jsonb_build_object('id', a.id, 'nama', a.nama, 'pendek', a.pendek))
                        order by a.urutan, a.dibuat_pada, i.urutan, i.dibuat_pada)
                        from tumbuh_indikator i join tumbuh_aspek a on a.id = i.aspek_id
                       where i.sekolah_id = g.sekolah_id and i.arsip
                         and (i.id = any(p.fokus)
                              or exists (select 1 from tumbuh_nilai n where n.periode_id = p.id and n.indikator_id = i.id))), '[]'::jsonb)
  );
end $$;

-- ---------- 2. simpan nilai: indikator lama hanya dilihat ----------
create or replace function kelas_nilai_simpan(p_periode uuid, p_indikator uuid, p_nilai jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; p tumbuh_periode; v int;
begin
  select * into g from guru_saya();
  select * into p from tumbuh_periode where id = p_periode and sekolah_id = g.sekolah_id and kelas = g.kelas;
  if g.sekolah_id is null or p.id is null then raise exception 'Periode tidak ditemukan.' using errcode = '42501'; end if;
  if not (p_indikator = any(p.fokus)) then raise exception 'Indikator ini bukan fokus periode ini.'; end if;
  if exists (select 1 from tumbuh_indikator i where i.id = p_indikator and i.arsip) then
    raise exception 'Indikator ini sudah diganti sekolah. Nilainya hanya bisa dilihat.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_nilai, '[]')) e
              where not exists (select 1 from siswa x where x.id = (e->>'s')::uuid and x.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif)
                 or (e->>'n')::int not between 1 and 4) then
    raise exception 'Data nilai tidak sah (anak di luar kelas atau nilai di luar skala).';
  end if;
  insert into tumbuh_nilai (periode_id, siswa_id, indikator_id, nilai, diubah_oleh, diubah_pada)
  select p.id, (e->>'s')::uuid, p_indikator, (e->>'n')::smallint, auth.uid(), now()
    from jsonb_array_elements(coalesce(p_nilai, '[]')) e
  on conflict (periode_id, siswa_id, indikator_id) do update
    set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada
    where tumbuh_nilai.nilai is distinct from excluded.nilai;
  get diagnostics v = row_count;
  select * into p from tumbuh_periode where id = p.id;
  return tumbuh_periode_json(p) || jsonb_build_object('tersimpan', v);
end $$;

-- ---------- 3. hak panggil (sama dengan 0052) ----------
revoke all on function kelas_ceklis(uuid) from public, anon;
grant execute on function kelas_ceklis(uuid) to authenticated;
revoke all on function kelas_nilai_simpan(uuid, uuid, jsonb) from public, anon;
grant execute on function kelas_nilai_simpan(uuid, uuid, jsonb) to authenticated;
