-- =====================================================================
-- 19 — UJI CEKLIS PERIODE LALU (0055) — ROLLBACK SAJA
--
--  Jalankan SESUDAH 0055_ceklis_periode_lalu.sql. Tidak ada data yang
--  berubah: semua langkah di BAGIAN 1 di-ROLLBACK di akhir.
--  Sekolah uji dipilih otomatis (sama dengan uji 16 & 18): sekolah pertama
--  yang punya kepala, admin, dan siswa aktif.
--
--  BAGIAN 0  pemeriksaan bawaan (fungsi ada, hak panggil)
--  BAGIAN 1  alur: daftar periode lalu → guru mengisi & menerbitkan bulan
--            lalu → isian awal & urutan benar → orang tua melihatnya di
--            urutan tanggal → batas & serangan.
--  Hasil tiap BAGIAN = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pemeriksaan bawaan
-- #####################################################################
with cek as (
  select 1 u, 'Fungsi ceklis periode lalu sudah ada (0055)' cek,
         case when to_regprocedure('public.kelas_daftar_periode()') is not null
               and to_regprocedure('public.kelas_periode_lalu_buka(date,uuid[])') is not null then 'LULUS' else 'GAGAL' end hasil,
         'kalau GAGAL: jalankan 0055 dulu' rincian
  union all
  select 2, 'Tidak bisa dipanggil tanpa login',
         case when to_regprocedure('public.kelas_daftar_periode()') is null then 'GAGAL'
              when has_function_privilege('anon', 'public.kelas_daftar_periode()', 'execute')
                or has_function_privilege('anon', 'public.kelas_periode_lalu_buka(date,uuid[])', 'execute') then 'GAGAL' else 'LULUS' end, ''
  union all
  select 3, 'Bisa dipanggil akun yang login',
         case when to_regprocedure('public.kelas_daftar_periode()') is null then 'GAGAL'
              when has_function_privilege('authenticated', 'public.kelas_daftar_periode()', 'execute')
               and has_function_privilege('authenticated', 'public.kelas_periode_lalu_buka(date,uuid[])', 'execute') then 'LULUS' else 'GAGAL' end, ''
),
ringkas as (
  select 0 u, '== KESIMPULAN ==' cek,
         case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
         count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
    from cek
)
select * from ringkas union all select * from cek order by u;


-- #####################################################################
-- BAGIAN 1 — alur ceklis periode lalu (semua di-ROLLBACK)
-- #####################################################################
begin;

create temp table hasil_lalu (u serial, kelompok text, cek text, hasil text, rincian text) on commit drop;

-- jalankan SQL sebagai akun tertentu (null = tanpa login); kembalikan teks hasil atau 'GALAT: …'
create function pg_temp.jalan(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute p_sql into v;
  exception when others then
    v := 'GALAT: ' || sqlerrm;
  end;
  execute 'reset role';
  return coalesce(v, '');
end $f$;

create function pg_temp.catat(p_kel text, p_cek text, p_ok boolean, p_rinci text) returns void language sql as $f$
  insert into hasil_lalu (kelompok, cek, hasil, rincian) values (p_kel, p_cek, case when p_ok then 'LULUS' else 'GAGAL' end, left(coalesce(p_rinci, ''), 160));
$f$;

do $uji$
declare
  skA uuid; kep uuid; adm uuid; gur uuid; kls text; nK int; anakK uuid; nisK text; ortu_token text;
  v text; j jsonb; daftar jsonb; nLalu int; nHarap int; jenis text := 'bulan';
  ind1 uuid; ind2 uuid; awalTa date := tumbuh_awal_ta()::date; kiniMulai date;
  tLama date; tBaru date; perLama uuid; perBaru uuid; perKini uuid; nTerdekat int;
  baru boolean := true;
begin
  -- ---------- persiapan: sekolah, akun, kelas ----------
  select s.id into skA from sekolah s
   where exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'kepala' and p.aktif)
     and exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'admin' and p.aktif)
     and exists (select 1 from siswa x where x.sekolah_id = s.id and x.aktif)
   order by s.dibuat_pada limit 1;
  if skA is null then perform pg_temp.catat('0 Persiapan', 'Ada sekolah dengan kepala, admin & siswa', false, ''); return; end if;
  select id into kep from profil where sekolah_id = skA and peran = 'kepala' and aktif limit 1;
  select id into adm from profil where sekolah_id = skA and peran = 'admin' and aktif limit 1;
  select kelas, count(*) into kls, nK from siswa where sekolah_id = skA and aktif group by kelas order by count(*) desc limit 1;
  select id, nis into anakK, nisK from siswa where sekolah_id = skA and aktif and kelas = kls order by nama limit 1;

  -- pengaturan yang pasti: skala BB–BSB, bulanan, indikator Kurikulum Merdeka baru
  perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan('bmbsh', 'bulan', true)::text$$);
  v := pg_temp.jalan(kep, $$select tumbuh_pakai_dasar('merdeka')::text$$);
  j := case when v like 'GALAT%' then null else v::jsonb end;
  select (j->0->'indikator'->0->>'id')::uuid, (j->1->'indikator'->0->>'id')::uuid into ind1, ind2;
  perform pg_temp.catat('A Persiapan', 'Kepala memakai Kurikulum Merdeka, ceklis bulanan', ind1 is not null and ind2 is not null, left(v, 80));

  gur := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (gur, 'uji-guru-' || left(gur::text, 8) || '@contoh.test');
  exception when others then baru := false;
  end;
  if baru then
    v := pg_temp.jalan(adm, format('select buat_kode_aktivasi(%L, %L)->>%L', 'guru', kls, 'kode'));
    v := pg_temp.jalan(gur, format('select aktivasi_kode(%L)::text', v));
    perform pg_temp.catat('A Persiapan', 'Akun guru uji untuk kelas ' || kls, v like '%"peran": "guru"%', v);
  else
    gur := adm;
    update profil set peran = 'guru' where id = gur;
    insert into guru_kelas (profil_id, sekolah_id, kelas) values (gur, skA, kls);
    perform pg_temp.catat('A Persiapan', 'Akun guru uji (admin dijadikan guru sementara)', true, '');
  end if;

  -- ---------- B. daftar periode lalu ----------
  nHarap := (extract(year from current_date)::int * 12 + extract(month from current_date)::int)
          - (extract(year from awalTa)::int * 12 + extract(month from awalTa)::int);
  if nHarap = 0 then
    -- bulan Juli (awal tahun ajaran) belum punya bulan lalu → uji dengan periode mingguan
    jenis := 'minggu';
    perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan(null, 'minggu', null)::text$$);
  end if;
  select mulai into kiniMulai from tumbuh_hitung_periode(jenis, current_date);
  v := pg_temp.jalan(gur, 'select kelas_daftar_periode()::text');
  daftar := case when v like 'GALAT%' then null else v::jsonb end;
  nLalu := coalesce(jsonb_array_length(daftar), 0);
  perform pg_temp.catat('B Daftar', 'Guru melihat daftar ' || nLalu || ' periode lalu (' || jenis || ') sejak awal tahun ajaran',
    daftar is not null and (jenis = 'minggu' or nLalu = nHarap) and nLalu > 0, left(v, 100));
  if nLalu = 0 then
    perform pg_temp.catat('B Daftar', 'Tidak ada periode lalu untuk diuji (minggu pertama tahun ajaran)', true, 'sisa uji dilewati');
    return;
  end if;
  perform pg_temp.catat('B Daftar', 'Urut terbaru dulu, semua sebelum periode berjalan & sesudah 1 Juli',
    (daftar->0->>'mulai')::date < kiniMulai and (daftar->(nLalu - 1)->>'mulai')::date >= awalTa
      and (nLalu = 1 or (daftar->0->>'mulai')::date > (daftar->(nLalu - 1)->>'mulai')::date), '');
  tLama := (daftar->(nLalu - 1)->>'mulai')::date;
  tBaru := (daftar->0->>'mulai')::date;

  -- ---------- C. guru mengisi periode paling lama ----------
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L)::text', tLama));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perLama := (j->>'id')::uuid;
  perform pg_temp.catat('C Isi periode lalu', 'Membuka ceklis ' || coalesce(j->>'label', '?'),
    perLama is not null and j->>'label' = daftar->(nLalu - 1)->>'label' and j ? 'saran', left(v, 100));
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L, array[%L, %L]::uuid[])::text', tLama, ind1, ind2));
  perform pg_temp.catat('C Isi periode lalu', 'Memilih 2 indikator untuk periode itu',
    v not like 'GALAT%' and (v::jsonb->>'id')::uuid = perLama and jsonb_array_length(v::jsonb->'fokus') = 2, left(v, 100));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 2)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, perLama, ind1));
  perform pg_temp.catat('C Isi periode lalu', 'Menilai indikator 1 untuk ' || nK || ' anak', v like '%"tersimpan": ' || nK || '%', left(v, 100));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 2)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, perLama, ind2));
  perform pg_temp.catat('C Isi periode lalu', 'Menilai indikator 2 → semua anak "sudah dinilai"', v like '%"dinilai": ' || nK || '%', left(v, 100));
  v := pg_temp.jalan(gur, format('select kelas_periode_terbit(%L)::text', perLama));
  perform pg_temp.catat('C Isi periode lalu', 'Menerbitkan ceklis periode lalu', v like '%"terbit": "2%', left(v, 80));
  v := pg_temp.jalan(gur, 'select kelas_daftar_periode()::text');
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('C Isi periode lalu', 'Daftar menunjukkan periode itu terbit & ' || nK || ' anak dinilai',
    j is not null and j->(nLalu - 1)->>'terbit' is not null and (j->(nLalu - 1)->>'dinilai')::int = nK
      and (j->(nLalu - 1)->>'terisi')::int = nK * 2, left((j->(nLalu - 1))::text, 120));

  -- ---------- D. isian awal & urutan ----------
  nTerdekat := 2;
  if nLalu >= 2 then
    v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L, array[%L]::uuid[])::text', tBaru, ind1));
    perBaru := case when v like 'GALAT%' then null else (v::jsonb->>'id')::uuid end;
    v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', perBaru));
    perform pg_temp.catat('D Isian awal', 'Periode lalu yang lebih baru: isian awal dari periode sebelumnya',
      v not like 'GALAT%' and exists (select 1 from jsonb_array_elements(v::jsonb->'awal') a
                                       where (a->>'s')::uuid = anakK and (a->>'i')::uuid = ind1 and (a->>'n')::int = 2), left(v, 80));
    v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, jsonb_build_array(jsonb_build_object('s', %L, 'n', 3)))::text$$, perBaru, ind1, anakK));
    nTerdekat := 3;
  end if;
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', perLama));
  perform pg_temp.catat('D Isian awal', 'Periode paling lama tidak memakai nilai periode sesudahnya',
    v not like 'GALAT%' and not exists (select 1 from jsonb_array_elements(v::jsonb->'awal') a where (a->>'i')::uuid = ind1), left(v, 80));
  v := pg_temp.jalan(gur, format('select kelas_periode_buka(array[%L, %L]::uuid[])::text', ind1, ind2));
  perKini := case when v like 'GALAT%' then null else (v::jsonb->>'id')::uuid end;
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', perKini));
  perform pg_temp.catat('D Isian awal', 'Ceklis periode berjalan: isian awal = nilai periode lalu terdekat (' || nTerdekat || ')',
    v not like 'GALAT%' and exists (select 1 from jsonb_array_elements(v::jsonb->'awal') a
                                     where (a->>'s')::uuid = anakK and (a->>'i')::uuid = ind1 and (a->>'n')::int = nTerdekat), left(v, 80));
  v := pg_temp.jalan(gur, 'select kelas_awal()::text');
  perform pg_temp.catat('D Isian awal', 'Beranda guru tetap membuka periode berjalan',
    v not like 'GALAT%' and (v::jsonb->'periode'->>'id')::uuid = perKini, '');

  -- ---------- E. portal orang tua ----------
  perform pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 4)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, perKini, ind1));
  perform pg_temp.jalan(gur, format('select kelas_periode_terbit(%L)::text', perKini));
  select w.token into ortu_token from wali w join wali_siswa ws on ws.wali_id = w.id where ws.siswa_id = anakK limit 1;
  if ortu_token is null then
    insert into wali (sekolah_id, nama, token) values (skA, 'Wali Uji', 'uji-lalu-' || replace(gen_random_uuid()::text, '-', ''))
      returning token into ortu_token;
    insert into wali_siswa (wali_id, siswa_id) select id, anakK from wali where token = ortu_token;
  end if;
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', ortu_token, nisK));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('E Portal ortu', 'Orang tua melihat periode lalu SEBELUM periode berjalan (urut tanggal)',
    j is not null and exists (
      select 1 from jsonb_array_elements(j->'anak') a,
             jsonb_array_elements(a->'periode') with ordinality q1(x, i1),
             jsonb_array_elements(a->'periode') with ordinality q2(y, i2)
       where (a->>'siswaId')::uuid = anakK and (q1.x->>'id')::uuid = perLama and (q2.y->>'id')::uuid = perKini and i1 < i2), left(v, 80));

  -- ---------- F. batas & serangan ----------
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L)::text', current_date));
  perform pg_temp.catat('F Batas', 'Periode berjalan lewat jalur "periode lalu" → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L)::text', current_date + 45));
  perform pg_temp.catat('F Batas', 'Periode yang akan datang → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L)::text', awalTa - 1));
  perform pg_temp.catat('F Batas', 'Periode tahun ajaran lalu → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L, %L::uuid[])::text', tLama, '{}'));
  perform pg_temp.catat('F Batas', 'Tanpa indikator → ditolak', v like 'GALAT%', v);
  perform pg_temp.jalan(kep, format('select tumbuh_indikator_hapus(%L)::text', ind2));
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L, array[%L]::uuid[])::text', tLama, ind2));
  perform pg_temp.catat('F Batas', 'Indikator yang sudah dihapus sekolah → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(null, 'select kelas_daftar_periode()::text');
  perform pg_temp.catat('F Serangan', 'Tanpa login melihat daftar → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(null, format('select kelas_periode_lalu_buka(%L)::text', tLama));
  perform pg_temp.catat('F Serangan', 'Tanpa login membuka periode lalu → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(kep, 'select kelas_daftar_periode()::text');
  perform pg_temp.catat('F Serangan', 'Kepala sekolah memanggil fungsi guru → ditolak', v like 'GALAT%', v);
  perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan(null, 'tema', null)::text$$);
  v := pg_temp.jalan(gur, 'select kelas_daftar_periode()::text');
  perform pg_temp.catat('F Batas', 'Penilaian per tema → daftar kosong', v = '[]', v);
  v := pg_temp.jalan(gur, format('select kelas_periode_lalu_buka(%L)::text', tLama));
  perform pg_temp.catat('F Batas', 'Penilaian per tema → buka periode lalu ditolak', v like 'GALAT%', v);
end $uji$;

select 0 u, '' kelompok, '== KESIMPULAN ==' cek,
       case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
       count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
  from hasil_lalu
union all
select u, kelompok, cek, hasil, rincian from hasil_lalu
order by u;

rollback;
