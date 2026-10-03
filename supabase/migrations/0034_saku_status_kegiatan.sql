-- =====================================================================
-- 0034 — SAKU lebih teliti: status biaya kegiatan & SPP per bulan sudah
--        DIKELOMPOKKAN oleh database (lunas / sebagian / belum bayar).
--
-- Masalah sebelumnya: SAKU hanya punya daftar "yang BELUM lunas" dan
-- status per siswa satu-satu. Pertanyaan "siapa yang sudah lunas biaya
-- kegiatan" membuat AI mengurangkan sendiri semua siswa − yang nunggak,
-- dan bisa ada nama yang tertinggal (kasus: siswa sudah lunas 9 kegiatan
-- tapi tidak disebut). Sekarang pengelompokan dilakukan di sini, AI
-- tinggal menyalin daftar beserta jumlahnya.
--
-- Aman dijalankan berulang. Tidak mengubah data apa pun (hanya fungsi baca).
-- =====================================================================

create or replace function ai_status_kegiatan(p_kegiatan text default null, p_kelas text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  v_kelas  text[];
  v_biaya  uuid[];
  v_hasil  jsonb;
begin
  -- ---------- saring kelas ----------
  if nullif(trim(p_kelas), '') is not null then
    select array_agg(kelas) into v_kelas from ai_kelas_cocok(v_sk, p_kelas);
    if v_kelas is null then
      return jsonb_build_object('galat', 'Kelas "' || p_kelas || '" tidak ditemukan.',
        'kelas_yang_ada', (select jsonb_agg(distinct kelas) from siswa where sekolah_id = v_sk and aktif));
    end if;
  end if;

  -- ---------- saring kegiatan (nama persis dulu, lalu mengandung kata) ----------
  if nullif(trim(p_kegiatan), '') is not null then
    select array_agg(id) into v_biaya from biaya
     where sekolah_id = v_sk and aktif and lower(trim(nama)) = lower(trim(p_kegiatan));
    if v_biaya is null then
      select array_agg(id) into v_biaya from biaya
       where sekolah_id = v_sk and aktif and lower(nama) like '%' || lower(trim(p_kegiatan)) || '%';
    end if;
    if v_biaya is null then
      return jsonb_build_object('galat', 'Kegiatan "' || p_kegiatan || '" tidak ditemukan.',
        'kegiatan_yang_ada', (select jsonb_agg(nama order by urutan) from biaya where sekolah_id = v_sk and aktif));
    end if;
  end if;

  with sw as (
    select x.id, x.nama, x.kelas from siswa x
     where x.sekolah_id = v_sk and x.aktif and (v_kelas is null or x.kelas = any (v_kelas))
  ),
  bi as (
    select b.id, b.nama, b.nominal, b.urutan, b.tanggal from biaya b
     where b.sekolah_id = v_sk and b.aktif and (v_biaya is null or b.id = any (v_biaya))
  ),
  st as (
    select bi.id as biaya_id, sw.id as siswa_id, sw.nama, sw.kelas, bi.nominal,
           coalesce((select sum(p.nominal) from pembayaran p
                      where p.siswa_id = sw.id and p.jenis = 'kegiatan' and p.biaya_id = bi.id), 0)::bigint as dibayar
      from bi cross join sw
  ),
  st2 as (
    select st.*, case when dibayar >= nominal then 'lunas' when dibayar > 0 then 'sebagian' else 'belum' end as status
      from st
  ),
  per_kegiatan as (
    select bi.urutan, jsonb_build_object(
      'kegiatan', bi.nama,
      'tanggal', to_char(bi.tanggal, 'YYYY-MM-DD'),
      'nominal_per_siswa', bi.nominal,
      'jumlah_siswa', (select count(*) from st2 where st2.biaya_id = bi.id),
      'target', (select coalesce(sum(nominal), 0) from st2 where st2.biaya_id = bi.id),
      'terkumpul', (select coalesce(sum(least(dibayar, nominal)), 0) from st2 where st2.biaya_id = bi.id),
      'kekurangan', (select coalesce(sum(greatest(0, nominal - dibayar)), 0) from st2 where st2.biaya_id = bi.id),
      'lunas', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'lunas'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas) order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'lunas'), '[]')),
      'sebagian', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'sebagian'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas, 'dibayar', dibayar,
                                                               'kurang', nominal - dibayar) order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'sebagian'), '[]')),
      'belum_bayar', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'belum'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas, 'kurang', nominal)
                                            order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'belum'), '[]'))
    ) as o
    from bi
  ),
  per_siswa as (
    select sw.id, sw.nama, sw.kelas,
           count(st2.biaya_id) as n_kegiatan,
           count(st2.biaya_id) filter (where st2.status = 'lunas') as n_lunas,
           coalesce(sum(greatest(0, st2.nominal - st2.dibayar)), 0) as kurang,
           jsonb_agg(jsonb_build_object('kegiatan', bi.nama, 'kurang', st2.nominal - st2.dibayar,
                                        'status', case when st2.status = 'sebagian' then 'sebagian' else 'belum bayar' end)
                     order by bi.urutan) filter (where st2.status <> 'lunas') as belum
      from sw
      left join st2 on st2.siswa_id = sw.id
      left join bi on bi.id = st2.biaya_id
     group by sw.id, sw.nama, sw.kelas
  )
  select jsonb_build_object(
    'catatan_untuk_ai',
      'Daftar di sini SUDAH dikelompokkan oleh sistem. Salin nama apa adanya dari kelompok yang ditanyakan; ' ||
      'jumlah baris yang kamu tampilkan HARUS sama dengan angka "jumlah". Jangan memindahkan siswa antar kelompok.',
    'kelas', coalesce(to_jsonb(v_kelas), '"semua kelas"'),
    'jumlah_siswa_aktif', (select count(*) from sw),
    'jumlah_kegiatan', (select count(*) from bi),
    'kegiatan', coalesce((select jsonb_agg(o order by urutan) from per_kegiatan), '[]'),
    'rekap_per_siswa', jsonb_build_object(
      'penjelasan', 'Gabungan SEMUA kegiatan di atas per siswa.',
      'lunas_semua_kegiatan', jsonb_build_object(
        'jumlah', (select count(*) from per_siswa where n_kegiatan > 0 and n_lunas = n_kegiatan),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas) order by kelas, nama)
                             from per_siswa where n_kegiatan > 0 and n_lunas = n_kegiatan), '[]')),
      'masih_ada_kekurangan', jsonb_build_object(
        'jumlah', (select count(*) from per_siswa where n_lunas < n_kegiatan),
        'total_kurang', (select coalesce(sum(kurang), 0) from per_siswa where n_lunas < n_kegiatan),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas,
                                                               'lunas', n_lunas || ' dari ' || n_kegiatan || ' kegiatan',
                                                               'total_kurang', kurang, 'belum_lunas', belum)
                                            order by kelas, nama)
                             from per_siswa where n_lunas < n_kegiatan), '[]'))
    )
  ) into v_hasil;

  return v_hasil;
end $$;

revoke all on function ai_status_kegiatan(text, text) from public, anon;
grant execute on function ai_status_kegiatan(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- SPP satu bulan, dikelompokkan: lunas / sebagian / nunggak / belum bayar
-- (bulan berjalan lewat jatuh tempo) / belum jatuh tempo.
-- Status sama persis dengan aplikasi (ai_spp_siswa = cermin statusSpp()).
-- ---------------------------------------------------------------------
create or replace function ai_status_spp(p_bulan int default null, p_kelas text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk    uuid := ai_sekolah_wajib();
  v_hari  date := ai_hari_ini();
  v_bulan int  := coalesce(p_bulan, ai_indeks_bulan(ai_hari_ini()));
  v_kelas text[];
begin
  if v_bulan < 0 or v_bulan > 11 then
    raise exception 'Bulan tidak dikenal. Pakai 0 = Juli sampai 11 = Juni.';
  end if;
  if nullif(trim(p_kelas), '') is not null then
    select array_agg(kelas) into v_kelas from ai_kelas_cocok(v_sk, p_kelas);
    if v_kelas is null then
      return jsonb_build_object('galat', 'Kelas "' || p_kelas || '" tidak ditemukan.',
        'kelas_yang_ada', (select jsonb_agg(distinct kelas) from siswa where sekolah_id = v_sk and aktif));
    end if;
  end if;

  return (
    with t as (
      select x.nama, x.kelas, sp.dibayar, sp.target, sp.status
        from ai_spp_siswa(v_sk, v_hari) sp
        join siswa x on x.id = sp.siswa_id
       where sp.periode = v_bulan and (v_kelas is null or x.kelas = any (v_kelas))
    ),
    grup as (
      select g.kunci, g.status from (values ('lunas', 'lunas'), ('sebagian', 'sebagian'), ('nunggak', 'nunggak'),
                                            ('belum_bayar_lewat_jatuh_tempo', 'belum-bayar'),
                                            ('belum_jatuh_tempo', 'menunggu')) as g(kunci, status)
    )
    select jsonb_build_object(
      'catatan_untuk_ai',
        'Daftar di sini SUDAH dikelompokkan oleh sistem. Salin nama apa adanya dari kelompok yang ditanyakan; ' ||
        'jumlah baris yang kamu tampilkan HARUS sama dengan angka "jumlah".',
      'bulan', ai_nama_bulan(v_bulan),
      'kelas', coalesce(to_jsonb(v_kelas), '"semua kelas"'),
      'nominal_spp', (select max(target) from t),
      'jumlah_siswa', (select count(*) from t),
      'target', (select coalesce(sum(target), 0) from t),
      'terkumpul', (select coalesce(sum(least(dibayar, target)), 0) from t),
      'kekurangan', (select coalesce(sum(greatest(0, target - dibayar)), 0) from t),
      'kelompok', (select jsonb_object_agg(g.kunci, jsonb_build_object(
          'jumlah', (select count(*) from t where t.status = g.status),
          'siswa', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                'nama', t.nama, 'kelas', t.kelas,
                                'dibayar', case when t.status = 'sebagian' then t.dibayar end,
                                'kurang', case when t.status <> 'lunas' then t.target - t.dibayar end))
                              order by t.kelas, t.nama)
                               from t where t.status = g.status), '[]')))
        from grup g)
    )
  );
end $$;

revoke all on function ai_status_spp(int, text) from public, anon;
grant execute on function ai_status_spp(int, text) to authenticated;
