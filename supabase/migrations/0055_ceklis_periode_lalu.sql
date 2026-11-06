-- =====================================================================
-- 0055: guru kelas mengisi ceklis periode yang sudah lewat
--       (bulan / minggu sebelumnya, di tahun ajaran berjalan)
--
--  • kelas_daftar_periode()            : daftar periode SEBELUM periode berjalan,
--                                        sejak 1 Juli (awal tahun ajaran), terbaru
--                                        dulu, + status (terbit, anak dinilai).
--                                        Bulanan: semua sejak Juli; mingguan: 8
--                                        terakhir; 2 mingguan: 6 terakhir.
--  • kelas_periode_lalu_buka(tgl, fokus): buka / buat ceklis periode lalu. Dengan
--                                        fokus = simpan indikator yang dinilai.
--                                        Ikut mengirim "saran" = indikator periode
--                                        terdekat (untuk isian awal pilihan).
--
--  Mengisi nilai & menerbitkan memakai fungsi yang sudah ada (kelas_ceklis,
--  kelas_nilai_simpan, kelas_periode_terbit) — semuanya sudah dijaga sekolah &
--  kelas guru. Isian awal ceklis = nilai periode SEBELUM periode itu.
--  Portal orang tua mengurutkan periode menurut tanggal → bulan yang diisi
--  belakangan tetap tampil di urutan yang benar.
--
--  Periode "tema" tidak termasuk (guru cukup membuat tema baru).
--  Tidak mengubah tabel / data. Jalankan SETELAH 0054. Aman dijalankan berkali-kali.
-- =====================================================================

-- ---------- 1. daftar periode yang sudah lewat ----------
create or replace function kelas_daftar_periode()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g record; r tumbuh_atur; h record; p tumbuh_periode;
  d date; awal date := tumbuh_awal_ta()::date; maks int; n int := 0;
  hasil jsonb := '[]'::jsonb;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  select * into r from tumbuh_atur where sekolah_id = g.sekolah_id;
  if r.sekolah_id is null or r.skala = 'tanpa' or r.periode = 'tema' then return hasil; end if;

  maks := case r.periode when 'minggu' then 8 when '2minggu' then 6 else 12 end;
  select * into h from tumbuh_hitung_periode(r.periode, current_date);
  d := h.mulai - 1;  -- mulai dari periode tepat sebelum periode berjalan
  loop
    select * into h from tumbuh_hitung_periode(r.periode, d);
    exit when h.mulai < awal or n >= maks;
    select * into p from tumbuh_periode where sekolah_id = g.sekolah_id and kelas = g.kelas and kode = h.kode;
    hasil := hasil || jsonb_build_array(
      coalesce(tumbuh_periode_json(p), jsonb_build_object(
        'id', null, 'jenis', r.periode, 'label', h.label, 'pendek', h.pendek, 'mulai', h.mulai, 'selesai', h.selesai,
        'fokus', '[]'::jsonb, 'terbit', null, 'dinilai', 0,
        'anak', (select count(*) from siswa x where x.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif)))
      || jsonb_build_object('kode', h.kode,
           'terisi', case when p.id is null then 0 else (select count(*) from tumbuh_nilai v where v.periode_id = p.id) end));
    n := n + 1;
    d := h.mulai - 1;
  end loop;
  return hasil;
end $$;

-- ---------- 2. buka / buat ceklis periode lalu ----------
create or replace function kelas_periode_lalu_buka(p_tgl date, p_fokus uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; r tumbuh_atur; h record; kini record; p tumbuh_periode; saran uuid[];
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  r := tumbuh_pastikan(g.sekolah_id);
  if r.skala = 'tanpa' then raise exception 'Sekolah ini tidak memakai ceklis (catatan saja).'; end if;
  if r.periode = 'tema' then raise exception 'Penilaian per tema tidak bisa diisi mundur. Buat tema baru saja.'; end if;
  if p_tgl is null then raise exception 'Periode belum dipilih.'; end if;

  select * into kini from tumbuh_hitung_periode(r.periode, current_date);
  select * into h from tumbuh_hitung_periode(r.periode, p_tgl);
  if h.mulai >= kini.mulai then raise exception 'Periode ini belum lewat. Pakai ceklis periode berjalan.'; end if;
  if h.mulai < tumbuh_awal_ta()::date then raise exception 'Hanya periode di tahun ajaran ini yang bisa diisi.'; end if;

  select * into p from tumbuh_periode where sekolah_id = g.sekolah_id and kelas = g.kelas and kode = h.kode;
  if p.id is null then
    insert into tumbuh_periode (sekolah_id, kelas, jenis, kode, label, pendek, mulai, selesai, fokus, dibuat_oleh)
    values (g.sekolah_id, g.kelas, r.periode, h.kode, h.label, h.pendek, h.mulai, h.selesai, '{}', auth.uid())
    on conflict (sekolah_id, kelas, kode) do update set kode = excluded.kode
    returning * into p;
  end if;

  if p_fokus is not null then
    if cardinality(p_fokus) = 0 then raise exception 'Pilih minimal 1 indikator.'; end if;
    if cardinality(p_fokus) > 8 then raise exception 'Maksimal 8 indikator fokus per periode.'; end if;
    if exists (select 1 from unnest(p_fokus) f where not exists (
                 select 1 from tumbuh_indikator i where i.id = f and i.sekolah_id = g.sekolah_id and not i.arsip)) then
      raise exception 'Indikator tidak ditemukan.';
    end if;
    update tumbuh_periode set fokus = p_fokus where id = p.id returning * into p;
  end if;

  -- saran: indikator periode terdekat (yang sebelumnya dulu) dan masih aktif
  select coalesce(array_agg(u.x order by u.o), '{}') into saran
    from (select q.fokus from tumbuh_periode q
           where q.sekolah_id = g.sekolah_id and q.kelas = g.kelas and q.id <> p.id and cardinality(q.fokus) > 0
           order by (q.mulai > p.mulai), abs(q.mulai - p.mulai) limit 1) z
    cross join lateral unnest(z.fokus) with ordinality as u(x, o)
   where exists (select 1 from tumbuh_indikator i where i.id = u.x and not i.arsip);

  return tumbuh_periode_json(p) || jsonb_build_object('kode', p.kode, 'saran', to_jsonb(saran));
end $$;

-- ---------- 3. hak panggil: hanya akun yang login (fungsi memeriksa guru & kelas) ----------
revoke all on function kelas_daftar_periode() from public, anon;
grant execute on function kelas_daftar_periode() to authenticated;
revoke all on function kelas_periode_lalu_buka(date, uuid[]) from public, anon;
grant execute on function kelas_periode_lalu_buka(date, uuid[]) to authenticated;
