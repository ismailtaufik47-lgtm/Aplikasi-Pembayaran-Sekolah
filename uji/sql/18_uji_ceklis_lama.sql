-- =====================================================================
-- 18 — UJI CEKLIS LAMA SETELAH GANTI DASAR PENILAIAN (0054) — ROLLBACK SAJA
--
--  Jalankan SESUDAH 0054_ceklis_indikator_lama.sql. Tidak ada data yang
--  berubah: semua langkah di BAGIAN 1 di-ROLLBACK di akhir.
--  Sekolah uji dipilih otomatis (sama dengan uji 16): sekolah pertama yang
--  punya kepala, admin, dan siswa aktif.
--
--  BAGIAN 0  pemeriksaan bawaan (fungsi sudah versi 0054, hak panggil)
--  BAGIAN 1  alur: guru menilai & menerbitkan → kepala mengganti dasar
--            penilaian → guru tetap bisa melihat nilai lama (tidak bisa
--            mengubahnya) → guru memilih indikator baru → orang tua tetap
--            melihat nilai lama + baru.
--  Hasil tiap BAGIAN = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pemeriksaan bawaan
-- #####################################################################
with cek as (
  select 1 u, 'kelas_ceklis sudah versi 0054 (mengirim indikator lama)' cek,
         case when pg_get_functiondef('public.kelas_ceklis(uuid)'::regprocedure) like '%''lama''%' then 'LULUS' else 'GAGAL' end hasil,
         'kalau GAGAL: jalankan 0054 dulu' rincian
  union all
  select 2, 'kelas_nilai_simpan sudah menolak indikator lama',
         case when pg_get_functiondef('public.kelas_nilai_simpan(uuid,uuid,jsonb)'::regprocedure) like '%hanya bisa dilihat%' then 'LULUS' else 'GAGAL' end, ''
  union all
  select 3, 'Fungsi ceklis tidak bisa dipanggil tanpa login',
         case when has_function_privilege('anon', 'public.kelas_ceklis(uuid)', 'execute')
                or has_function_privilege('anon', 'public.kelas_nilai_simpan(uuid,uuid,jsonb)', 'execute') then 'GAGAL' else 'LULUS' end, ''
  union all
  select 4, 'Fungsi ceklis bisa dipanggil akun yang login',
         case when has_function_privilege('authenticated', 'public.kelas_ceklis(uuid)', 'execute')
               and has_function_privilege('authenticated', 'public.kelas_nilai_simpan(uuid,uuid,jsonb)', 'execute') then 'LULUS' else 'GAGAL' end, ''
),
ringkas as (
  select 0 u, '== KESIMPULAN ==' cek,
         case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
         count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
    from cek
)
select * from ringkas union all select * from cek order by u;


-- #####################################################################
-- BAGIAN 1 — alur ganti dasar penilaian (semua di-ROLLBACK)
-- #####################################################################
begin;

create temp table hasil_ceklis (u serial, kelompok text, cek text, hasil text, rincian text) on commit drop;

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
  insert into hasil_ceklis (kelompok, cek, hasil, rincian) values (p_kel, p_cek, case when p_ok then 'LULUS' else 'GAGAL' end, left(coalesce(p_rinci, ''), 160));
$f$;

do $uji$
declare
  skA uuid; kep uuid; adm uuid; gur uuid; kls text; nK int; anakK uuid; nisK text; ortu_token text;
  v text; j jsonb; per uuid; ind1 uuid; ind2 uuid; ind3 uuid; aspekBaru uuid;
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

  -- pengaturan awal yang pasti: skala BB–BSB, bulanan, Kurikulum Merdeka baru
  perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan('bmbsh', 'bulan', true)::text$$);
  v := pg_temp.jalan(kep, $$select tumbuh_pakai_dasar('merdeka')::text$$);
  j := case when v like 'GALAT%' then null else v::jsonb end;
  select (j->0->'indikator'->0->>'id')::uuid, (j->1->'indikator'->0->>'id')::uuid into ind1, ind2;
  perform pg_temp.catat('A Persiapan', 'Kepala memakai Kurikulum Merdeka (indikator baru)', ind1 is not null and ind2 is not null, left(v, 80));

  -- akun guru kelas (sementara)
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

  -- ---------- B. guru menilai lalu menerbitkan ----------
  v := pg_temp.jalan(gur, format('select kelas_periode_buka(array[%L, %L]::uuid[])::text', ind1, ind2));
  per := case when v like 'GALAT%' then null else (v::jsonb->>'id')::uuid end;
  perform pg_temp.catat('B Sebelum ganti', 'Guru membuka ceklis bulan ini (2 indikator)', per is not null, left(v, 80));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 3)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, per, ind1));
  perform pg_temp.catat('B Sebelum ganti', 'Guru menilai indikator 1 untuk ' || nK || ' anak', v like '%"tersimpan": ' || nK || '%', left(v, 100));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 2)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, per, ind2));
  perform pg_temp.catat('B Sebelum ganti', 'Guru menilai indikator 2', v like '%"tersimpan": ' || nK || '%', left(v, 100));
  v := pg_temp.jalan(gur, format('select kelas_periode_terbit(%L)::text', per));
  perform pg_temp.catat('B Sebelum ganti', 'Guru menerbitkan ceklis', v like '%"terbit": "2%', left(v, 80));
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', per));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('B Sebelum ganti', 'Ceklis terbaca, indikatornya belum "lama"',
    j is not null and not exists (select 1 from jsonb_array_elements(j->'lama') x where (x->>'id')::uuid in (ind1, ind2)), left(v, 80));

  -- ---------- C. kepala mengganti dasar penilaian ----------
  v := pg_temp.jalan(kep, $$select tumbuh_pakai_dasar('stppa')::text$$);
  perform pg_temp.catat('C Ganti dasar', 'Kepala mengganti ke 6 aspek STPPA', v not like 'GALAT%' and jsonb_array_length(v::jsonb) = 6, left(v, 60));
  v := pg_temp.jalan(gur, 'select kelas_awal()::text');
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('C Ganti dasar', 'Aplikasi guru: daftar indikator aktif sudah STPPA (indikator lama tidak ada)',
    j is not null and jsonb_array_length(j->'aspek') = 6
      and not exists (select 1 from jsonb_array_elements(j->'aspek') a, jsonb_array_elements(a->'indikator') i where (i->>'id')::uuid in (ind1, ind2)), '');
  perform pg_temp.catat('C Ganti dasar', 'Ceklis yang sudah terbit tetap memakai indikator lama (penyebab layar kosong)',
    j is not null and j->'periode'->'fokus' @> to_jsonb(array[ind1, ind2]::text[]), coalesce(j->'periode'->>'fokus', ''));
  select (a->'indikator'->0->>'id')::uuid, (a->>'id')::uuid into ind3, aspekBaru from jsonb_array_elements(j->'aspek') a limit 1;

  -- ---------- D. guru tetap bisa melihat nilai lama ----------
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', per));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('D Nilai lama', 'Ceklis mengirim 2 indikator lama lengkap dengan nama & aspek',
    j is not null and (select count(*) from jsonb_array_elements(j->'lama') x
                        where (x->>'id')::uuid in (ind1, ind2) and length(x->>'nama') > 0 and length(x->'aspek'->>'pendek') > 0) = 2, left(v, 80));
  perform pg_temp.catat('D Nilai lama', 'Nilai lama tetap terbaca (' || nK * 2 || ' nilai)',
    j is not null and (select count(*) from jsonb_array_elements(j->'nilai') x where (x->>'i')::uuid in (ind1, ind2)) = nK * 2, '');
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, jsonb_build_array(jsonb_build_object('s', %L, 'n', 4)))::text$$, per, ind1, anakK));
  perform pg_temp.catat('D Nilai lama', 'Mengubah nilai indikator lama → ditolak (hanya dilihat)', v like 'GALAT%hanya bisa dilihat%', v);
  perform pg_temp.catat('D Nilai lama', 'Nilai lama tidak berubah',
    (select nilai from tumbuh_nilai where periode_id = per and siswa_id = anakK and indikator_id = ind1) = 3, '');

  -- ---------- E. guru memilih indikator baru ----------
  v := pg_temp.jalan(gur, format('select kelas_periode_buka(array[%L]::uuid[])::text', ind1));
  perform pg_temp.catat('E Indikator baru', 'Memilih indikator lama sebagai fokus → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select kelas_periode_buka(array[%L]::uuid[])::text', ind3));
  perform pg_temp.catat('E Indikator baru', 'Guru memilih indikator STPPA untuk ceklis yang sama',
    v not like 'GALAT%' and (v::jsonb->>'id')::uuid = per and v::jsonb->'fokus' = to_jsonb(array[ind3::text]), left(v, 100));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 4)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, per, ind3));
  perform pg_temp.catat('E Indikator baru', 'Guru menilai indikator baru', v like '%"tersimpan": ' || nK || '%', left(v, 100));
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', per));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('E Indikator baru', 'Nilai indikator lama tetap bisa dilihat walau bukan fokus lagi',
    j is not null and (select count(*) from jsonb_array_elements(j->'lama') x where (x->>'id')::uuid in (ind1, ind2)) = 2
      and not exists (select 1 from jsonb_array_elements(j->'lama') x where (x->>'id')::uuid = ind3), '');

  -- ---------- F. portal orang tua ----------
  select w.token into ortu_token from wali w join wali_siswa ws on ws.wali_id = w.id where ws.siswa_id = anakK limit 1;
  if ortu_token is null then
    insert into wali (sekolah_id, nama, token) values (skA, 'Wali Uji', 'uji-ceklis-' || replace(gen_random_uuid()::text, '-', ''))
      returning token into ortu_token;
    insert into wali_siswa (wali_id, siswa_id) select id, anakK from wali where token = ortu_token;
  end if;
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', ortu_token, nisK));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('F Portal ortu', 'Orang tua melihat nilai indikator lama & baru di ceklis yang sama',
    j is not null and exists (select 1 from jsonb_array_elements(j->'anak') a, jsonb_array_elements(a->'periode') q
                               where (a->>'siswaId')::uuid = anakK and (q->>'id')::uuid = per
                                 and q->'nilai' ? ind1::text and q->'nilai' ? ind3::text), left(v, 80));
  perform pg_temp.catat('F Portal ortu', 'Aspek lama ikut terkirim ke portal (grafik lama tidak hilang)',
    j is not null and exists (select 1 from jsonb_array_elements(j->'aspek') a, jsonb_array_elements(a->'indikator') i
                               where (i->>'id')::uuid = ind1 and (a->>'arsip')::boolean), '');

  -- ---------- G. serangan ----------
  v := pg_temp.jalan(null, format('select kelas_ceklis(%L)::text', per));
  perform pg_temp.catat('G Serangan', 'Tanpa login membuka ceklis → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(kep, format('select kelas_ceklis(%L)::text', per));
  perform pg_temp.catat('G Serangan', 'Kepala sekolah memanggil fungsi guru → ditolak', v like 'GALAT%', v);
end $uji$;

select 0 u, '' kelompok, '== KESIMPULAN ==' cek,
       case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
       count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
  from hasil_ceklis
union all
select u, kelompok, cek, hasil, rincian from hasil_ceklis
order by u;

rollback;
