-- =====================================================================
-- 16 — UJI TUMBUH KEMBANG (0052) — BACA / ROLLBACK SAJA
--
--  Jalankan SESUDAH 0052_tumbuh_kembang.sql. Tidak ada data yang berubah:
--  BAGIAN 1 memakai akun sungguhan sementara (menyamar) lalu di-ROLLBACK.
--  Sekolah uji dipilih otomatis: sekolah pertama yang punya kepala & admin
--  dan kelas berisi siswa. Sekolah "lain" untuk uji lintas sekolah dibuat
--  sementara di dalam transaksi (ikut di-ROLLBACK).
--
--  BAGIAN 0  pemeriksaan bawaan (tabel tertutup, fungsi internal, Storage)
--  BAGIAN 1  alur lengkap + serangan: admin, kepala, guru kelas, orang tua,
--            lintas kelas & lintas sekolah.
--  Hasil = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pemeriksaan bawaan
-- #####################################################################
with tb as (
  select unnest(array['guru_kelas', 'tumbuh_atur', 'tumbuh_aspek', 'tumbuh_indikator', 'tumbuh_periode',
                      'tumbuh_nilai', 'tumbuh_catatan', 'tumbuh_kabar']) t
),
cek as (
  select 1 u, 'Tabel tumbuh kembang ada & memakai RLS' cek,
         case when (select count(*) from pg_class c join tb on tb.t = c.relname
                     where c.relnamespace = 'public'::regnamespace and c.relrowsecurity) = 8 then 'LULUS' else 'GAGAL' end hasil, '' rincian
  union all
  select 2, 'Tabel tumbuh kembang tertutup untuk API (hanya lewat fungsi)',
         case when exists (select 1 from information_schema.role_table_grants g join tb on tb.t = g.table_name
                            where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC'))
              then 'GAGAL' else 'LULUS' end, ''
  union all
  select 3, 'Fungsi internal tidak bisa dipanggil dari luar',
         case when bool_or(has_function_privilege(r, f, 'execute')) then 'GAGAL' else 'LULUS' end,
         coalesce(string_agg(case when has_function_privilege(r, f, 'execute') then r || ': ' || f end, ', '), '')
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.guru_saya()', 'public.boleh_tumbuh()', 'public.tumbuh_pastikan(uuid)',
                      'public.tumbuh_isi_template(uuid,text)', 'public.tumbuh_cek_foto(uuid,text[],integer)',
                      'public.tumbuh_periode_kini(uuid,text,text,boolean,text)']) f
  union all
  select 4, 'Fungsi guru & pengaturan tidak bisa dipanggil tanpa login',
         case when bool_or(has_function_privilege('anon', f, 'execute')) then 'GAGAL' else 'LULUS' end, ''
    from unnest(array['public.kelas_awal()', 'public.kelas_nilai_simpan(uuid,uuid,jsonb)', 'public.tumbuh_atur_ambil()',
                      'public.tumbuh_pakai_dasar(text)', 'public.buat_kode_aktivasi(text,text)']) f
  union all
  select 5, 'Portal orang tua bisa memanggil portal_tumbuh',
         case when has_function_privilege('anon', 'public.portal_tumbuh(text,text)', 'execute') then 'LULUS' else 'GAGAL' end, ''
  union all
  select 6, 'Kode undangan menerima peran guru (per kelas)',
         case when exists (select 1 from information_schema.columns where table_name = 'kode_aktivasi' and column_name = 'kelas')
               and pg_get_constraintdef((select oid from pg_constraint where conname = 'kode_aktivasi_peran_check')) like '%guru%'
              then 'LULUS' else 'GAGAL' end, ''
  union all
  select 7, 'Storage: bucket "tumbuh" ada + aturan unggah/hapus per sekolah',
         case when to_regclass('storage.buckets') is null then 'LULUS'
              when exists (select 1 from storage.buckets where id = 'tumbuh')
               and (select count(*) from pg_policy where polrelid = 'storage.objects'::regclass and polname in ('tumbuh_unggah', 'tumbuh_hapus')) = 2
              then 'LULUS' else 'GAGAL' end,
         case when to_regclass('storage.buckets') is null then 'storage tidak ada (bukan Supabase)' else '' end
),
ringkas as (
  select 0 u, '== KESIMPULAN ==' cek,
         case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
         count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
    from cek
)
select * from ringkas union all select * from cek order by u;


-- #####################################################################
-- BAGIAN 1 — alur lengkap & serangan (semua di-ROLLBACK)
-- #####################################################################
begin;

create temp table hasil_tumbuh (u serial, kelompok text, cek text, hasil text, rincian text) on commit drop;

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
  insert into hasil_tumbuh (kelompok, cek, hasil, rincian) values (p_kel, p_cek, case when p_ok then 'LULUS' else 'GAGAL' end, left(coalesce(p_rinci, ''), 160));
$f$;

do $uji$
declare
  skA uuid; skB uuid; kep uuid; adm uuid; gur uuid; ortu_token text; nisK text;
  kls text; kls2 text; anakK uuid; anakK2 uuid; anakB uuid; nK int;
  v text; j jsonb; per uuid; ind1 uuid; ind2 uuid; perB uuid; catId uuid; kabId uuid;
  baru boolean := true;
begin
  -- ---------- pilih sekolah, akun, kelas ----------
  select s.id into skA from sekolah s
   where exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'kepala' and p.aktif)
     and exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'admin' and p.aktif)
     and exists (select 1 from siswa x where x.sekolah_id = s.id and x.aktif)
   order by s.dibuat_pada limit 1;
  if skA is null then perform pg_temp.catat('0 Persiapan', 'Ada sekolah dengan kepala, admin & siswa', false, ''); return; end if;
  select id into kep from profil where sekolah_id = skA and peran = 'kepala' and aktif limit 1;
  select id into adm from profil where sekolah_id = skA and peran = 'admin' and aktif limit 1;
  select kelas, count(*) into kls, nK from siswa where sekolah_id = skA and aktif group by kelas order by count(*) desc limit 1;
  select kelas into kls2 from siswa where sekolah_id = skA and aktif and kelas <> kls limit 1;
  select id, nis into anakK, nisK from siswa where sekolah_id = skA and aktif and kelas = kls order by nama limit 1;
  select id into anakK2 from siswa where sekolah_id = skA and aktif and kelas = kls2 limit 1;

  -- sekolah lain (sementara) untuk uji lintas sekolah
  insert into sekolah (nama) values ('UJI TUMBUH LAIN') returning id into skB;
  insert into siswa (sekolah_id, nama, kelas, nis) values (skB, 'Anak Sekolah Lain', 'A', 'UJI-T-001') returning id into anakB;
  insert into tumbuh_atur (sekolah_id) values (skB);
  insert into tumbuh_periode (sekolah_id, kelas, jenis, kode, label, pendek, mulai) values (skB, 'A', 'bulan', 'x', 'x', 'x', current_date) returning id into perB;

  -- ---------- A. admin / kepala: pengaturan ----------
  v := pg_temp.jalan(adm, 'select tumbuh_atur_ambil()::text');
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('A Pengaturan', 'Admin membuka pengaturan → template Kurikulum Merdeka terisi',
    j is not null and jsonb_array_length(j->'aspek') >= 1 and (j->>'bolehUbah')::boolean, coalesce(left(v, 80), ''));
  perform pg_temp.catat('A Pengaturan', 'Daftar kelas berisi kelas ' || kls,
    j is not null and exists (select 1 from jsonb_array_elements(j->'kelas') k where k->>'kelas' = kls), '');
  select (j->'aspek'->0->'indikator'->0->>'id')::uuid, (j->'aspek'->1->'indikator'->0->>'id')::uuid into ind1, ind2;

  v := pg_temp.jalan(kep, $$select tumbuh_atur_simpan('bmbsh', 'bulan', true)::text$$);
  perform pg_temp.catat('A Pengaturan', 'Kepala mengubah skala/periode/foto', v not like 'GALAT%', v);
  v := pg_temp.jalan(kep, $$select tumbuh_indikator_simpan(null, '$$ || (j->'aspek'->0->>'id') || $$', 'Hafalan surat pendek', true)::text$$);
  perform pg_temp.catat('A Pengaturan', 'Kepala menambah indikator khas sekolah', v not like 'GALAT%', v);
  v := pg_temp.jalan(adm, format('select buat_kode_aktivasi(%L, %L)::text', 'guru', kls));
  perform pg_temp.catat('A Pengaturan', 'Admin membuat kode undangan guru ' || kls, v like '%"peran": "guru"%', v);
  v := pg_temp.jalan(adm, format('select buat_kode_aktivasi(%L, %L)::text', 'guru', 'KELAS-TIDAK-ADA'));
  perform pg_temp.catat('A Pengaturan', 'Kode undangan untuk kelas yang tidak ada → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(null, 'select tumbuh_atur_ambil()::text');
  perform pg_temp.catat('A Pengaturan', 'Tanpa login membuka pengaturan → ditolak', v like 'GALAT%', v);

  -- ---------- akun guru (sementara) ----------
  gur := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (gur, 'uji-guru-' || left(gur::text, 8) || '@contoh.test');
  exception when others then baru := false;
  end;
  if baru then
    -- jalur sungguhan: kode undangan → aktivasi
    select kode into v from kode_aktivasi where sekolah_id = skA and peran = 'guru' and kelas = kls and dipakai_oleh is null order by dibuat_pada desc limit 1;
    v := pg_temp.jalan(gur, format('select aktivasi_kode(%L)::text', v));
    perform pg_temp.catat('B Guru kelas', 'Akun baru memakai kode undangan → jadi guru ' || kls, v like '%"peran": "guru"%', v);
  else
    -- auth.users tidak bisa ditulis dari SQL Editor: admin dijadikan guru sementara
    gur := adm;
    update profil set peran = 'guru' where id = gur;
    insert into guru_kelas (profil_id, sekolah_id, kelas) values (gur, skA, kls);
    perform pg_temp.catat('B Guru kelas', 'Akun guru uji (admin dijadikan guru sementara)', true, 'aktivasi diuji di database tiruan');
  end if;

  -- ---------- B. guru: tidak bisa membaca data lama ----------
  v := pg_temp.jalan(gur, 'select count(*)::text from siswa');
  perform pg_temp.catat('B Guru kelas', 'Guru membaca tabel siswa langsung → 0 baris', v = '0', v);
  v := pg_temp.jalan(gur, 'select count(*)::text from pembayaran');
  perform pg_temp.catat('B Guru kelas', 'Guru membaca pembayaran → 0 baris', v = '0' or v like 'GALAT%', v);
  v := pg_temp.jalan(gur, 'select count(*)::text from kas');
  perform pg_temp.catat('B Guru kelas', 'Guru membaca kas → 0 baris', v = '0' or v like 'GALAT%', v);
  v := pg_temp.jalan(gur, 'select count(*)::text from wali');
  perform pg_temp.catat('B Guru kelas', 'Guru membaca wali & token portal → 0 baris', v = '0' or v like 'GALAT%', v);
  v := pg_temp.jalan(gur, 'select tumbuh_atur_ambil()::text');
  perform pg_temp.catat('B Guru kelas', 'Guru membuka pengaturan admin → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select buat_kode_aktivasi(%L)::text', 'admin'));
  perform pg_temp.catat('B Guru kelas', 'Guru membuat kode Admin/TU → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, 'select count(*)::text from tumbuh_nilai');
  perform pg_temp.catat('B Guru kelas', 'Guru membaca tabel nilai langsung → ditolak', v like 'GALAT%', v);

  -- ---------- C. guru: alur kerja ----------
  v := pg_temp.jalan(gur, 'select kelas_awal()::text');
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('C Alur guru', 'Guru membuka kelasnya → hanya anak ' || kls || ' (' || nK || ')',
    j is not null and j->>'kelas' = kls and jsonb_array_length(j->'siswa') = nK, left(v, 80));
  perform pg_temp.catat('C Alur guru', 'Data anak untuk guru tanpa NIS/HP/alamat/wali',
    j is not null and not exists (select 1 from jsonb_array_elements(j->'siswa') x where x ? 'nis' or x ? 'hp' or x ? 'alamat' or x ? 'wali'), '');
  v := pg_temp.jalan(gur, format('select kelas_periode_buka(array[%L, %L]::uuid[])::text', ind1, ind2));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  per := (j->>'id')::uuid;
  perform pg_temp.catat('C Alur guru', 'Buka ceklis bulan ini dengan 2 indikator fokus', per is not null and jsonb_array_length(j->'fokus') = 2, left(v, 90));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 3)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, per, ind1));
  perform pg_temp.catat('C Alur guru', 'Simpan nilai indikator 1 untuk seluruh kelas', v like '%"tersimpan": ' || nK || '%', left(v, 120));
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, (select jsonb_agg(jsonb_build_object('s', x->>'id', 'n', 4)) from jsonb_array_elements(kelas_awal()->'siswa') x))::text$$, per, ind2));
  perform pg_temp.catat('C Alur guru', 'Kedua indikator terisi → semua anak "sudah dinilai"', v like '%"dinilai": ' || nK || '%', left(v, 120));
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', per));
  perform pg_temp.catat('C Alur guru', 'Isi ceklis terbaca kembali', v like '%"nilai": [%' and v not like 'GALAT%', left(v, 60));
  v := pg_temp.jalan(gur, format('select kelas_periode_terbit(%L)::text', per));
  perform pg_temp.catat('C Alur guru', 'Terbitkan ceklis', v like '%"terbit": "2%', left(v, 80));
  v := pg_temp.jalan(gur, format($$select kelas_catatan_simpan(null, %L, 'Hari ini berani bercerita di depan kelas.', null, '{}', true)::text$$, anakK));
  catId := case when v like 'GALAT%' then null else v::uuid end;
  perform pg_temp.catat('C Alur guru', 'Tulis & terbitkan catatan anak (tanpa foto)', catId is not null, v);
  v := pg_temp.jalan(gur, format($$select kelas_catatan_simpan(null, %L, 'Draf saja.', null, '{}', false)::text$$, anakK));
  perform pg_temp.catat('C Alur guru', 'Simpan catatan sebagai draf', v not like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_kabar_simpan(null, 'Menanam kacang hijau.', array[%L], true)::text$$, skA || '/' || gen_random_uuid() || '.jpg'));
  kabId := case when v like 'GALAT%' then null else v::uuid end;
  perform pg_temp.catat('C Alur guru', 'Tulis & terbitkan kabar kelas dengan 1 foto', kabId is not null, v);

  -- ---------- D. guru: serangan ----------
  v := pg_temp.jalan(gur, format($$select kelas_catatan_simpan(null, %L, 'x', null, '{}', true)::text$$, anakK2));
  perform pg_temp.catat('D Serangan guru', 'Catatan untuk anak kelas lain → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_catatan_simpan(null, %L, 'x', null, '{}', true)::text$$, anakB));
  perform pg_temp.catat('D Serangan guru', 'Catatan untuk anak sekolah lain → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, jsonb_build_array(jsonb_build_object('s', %L, 'n', 2)))::text$$, per, ind1, anakK2));
  perform pg_temp.catat('D Serangan guru', 'Nilai untuk anak kelas lain → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_nilai_simpan(%L, %L, jsonb_build_array(jsonb_build_object('s', %L, 'n', 9)))::text$$, per, ind1, anakK));
  perform pg_temp.catat('D Serangan guru', 'Nilai di luar skala (9) → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format('select kelas_ceklis(%L)::text', perB));
  perform pg_temp.catat('D Serangan guru', 'Membuka ceklis sekolah lain → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_kabar_simpan(null, 'x', array[%L], true)::text$$, skB || '/' || gen_random_uuid() || '.jpg'));
  perform pg_temp.catat('D Serangan guru', 'Foto berlokasi folder sekolah lain → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, format($$select kelas_kabar_simpan(null, 'x', array[%L, %L, %L, %L], true)::text$$,
         skA || '/' || gen_random_uuid() || '.jpg', skA || '/' || gen_random_uuid() || '.jpg', skA || '/' || gen_random_uuid() || '.jpg', skA || '/' || gen_random_uuid() || '.jpg'));
  perform pg_temp.catat('D Serangan guru', 'Kabar dengan 4 foto (maks. 3) → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(kep, 'select kelas_awal()::text');
  perform pg_temp.catat('D Serangan guru', 'Kepala sekolah memanggil fungsi guru → ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(null, 'select kelas_awal()::text');
  perform pg_temp.catat('D Serangan guru', 'Tanpa login memanggil fungsi guru → ditolak', v like 'GALAT%', v);

  -- foto dimatikan sekolah → guru tidak bisa menambah foto
  perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan(null, null, false)::text$$);
  v := pg_temp.jalan(gur, format($$select kelas_kabar_simpan(null, 'x', array[%L], true)::text$$, skA || '/' || gen_random_uuid() || '.jpg'));
  perform pg_temp.catat('D Serangan guru', 'Foto dimatikan sekolah → kabar berfoto ditolak', v like 'GALAT%', v);
  v := pg_temp.jalan(gur, $$select kelas_kabar_simpan(null, 'Teks saja.', '{}', true)::text$$);
  perform pg_temp.catat('D Serangan guru', 'Foto dimatikan → kabar teks tetap bisa', v not like 'GALAT%', v);
  perform pg_temp.jalan(kep, $$select tumbuh_atur_simpan(null, null, true)::text$$);

  -- ---------- E. portal orang tua ----------
  select w.token into ortu_token from wali w join wali_siswa ws on ws.wali_id = w.id where ws.siswa_id = anakK limit 1;
  if ortu_token is null then
    insert into wali (sekolah_id, nama, token) values (skA, 'Wali Uji', 'uji-tumbuh-' || replace(gen_random_uuid()::text, '-', ''))
      returning token into ortu_token;
    insert into wali_siswa (wali_id, siswa_id) select id, anakK from wali where token = ortu_token;
  end if;
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', ortu_token, nisK));
  j := case when v like 'GALAT%' then null else v::jsonb end;
  perform pg_temp.catat('E Portal ortu', 'Orang tua melihat ceklis terbit (1 periode)',
    j is not null and exists (select 1 from jsonb_array_elements(j->'anak') a where (a->>'siswaId')::uuid = anakK and jsonb_array_length(a->'periode') = 1), left(v, 80));
  perform pg_temp.catat('E Portal ortu', 'Orang tua melihat catatan terbit saja (draf tidak)',
    j is not null and exists (select 1 from jsonb_array_elements(j->'anak') a where (a->>'siswaId')::uuid = anakK and jsonb_array_length(a->'catatan') = 1), '');
  perform pg_temp.catat('E Portal ortu', 'Orang tua melihat kabar kelas anaknya',
    j is not null and exists (select 1 from jsonb_array_elements(j->'anak') a where (a->>'siswaId')::uuid = anakK and jsonb_array_length(a->'kabar') >= 1), '');
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', ortu_token, 'NIS-SALAH-999'));
  perform pg_temp.catat('E Portal ortu', 'NIS salah → hanya gerbang, tanpa data', v like '%"gerbang"%' and v not like '%"anak"%', left(v, 80));
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', 'token-ngawur', nisK));
  perform pg_temp.catat('E Portal ortu', 'Token salah → tanpa data', v not like '%"anak"%', left(v, 80));
  -- draf ceklis tidak terlihat
  perform pg_temp.jalan(gur, format('select kelas_periode_terbit(%L, false)::text', per));
  v := pg_temp.jalan(null, format('select portal_tumbuh(%L, %L)::text', ortu_token, nisK));
  perform pg_temp.catat('E Portal ortu', 'Ceklis ditarik ke draf → hilang dari portal', v like '%"periode": []%', '');

  -- ---------- F. Storage ----------
  if to_regclass('storage.objects') is not null then
    v := pg_temp.jalan(gur, format($$insert into storage.objects (bucket_id, name) values ('tumbuh', %L) returning 'ok'$$, skA || '/' || gen_random_uuid() || '.jpg'));
    perform pg_temp.catat('F Storage', 'Guru mengunggah foto ke folder sekolahnya', v = 'ok', v);
    v := pg_temp.jalan(gur, format($$insert into storage.objects (bucket_id, name) values ('tumbuh', %L) returning 'ok'$$, skB || '/' || gen_random_uuid() || '.jpg'));
    perform pg_temp.catat('F Storage', 'Guru mengunggah ke folder sekolah lain → ditolak', v like 'GALAT%', v);
    v := pg_temp.jalan(null, format($$insert into storage.objects (bucket_id, name) values ('tumbuh', %L) returning 'ok'$$, skA || '/' || gen_random_uuid() || '.jpg'));
    perform pg_temp.catat('F Storage', 'Tanpa login mengunggah → ditolak', v like 'GALAT%', v);
    v := pg_temp.jalan(null, $$select count(*)::text from storage.objects where bucket_id = 'tumbuh'$$);
    perform pg_temp.catat('F Storage', 'Tanpa login mendaftar isi bucket → 0', v = '0' or v like 'GALAT%', v);
  end if;

  -- ---------- G. perubahan & akun nonaktif ----------
  v := pg_temp.jalan(kep, $$select tumbuh_pakai_dasar('stppa')::text$$);
  perform pg_temp.catat('G Perubahan', 'Ganti dasar ke 6 aspek STPPA', v not like 'GALAT%' and jsonb_array_length(v::jsonb) = 6, left(v, 60));
  perform pg_temp.catat('G Perubahan', 'Nilai lama tetap tersimpan (indikator lama diarsipkan)',
    exists (select 1 from tumbuh_indikator where id = ind1 and arsip) and exists (select 1 from tumbuh_nilai where indikator_id = ind1), '');
  update profil set aktif = false where id = gur;
  v := pg_temp.jalan(gur, 'select kelas_awal()::text');
  perform pg_temp.catat('G Perubahan', 'Guru dinonaktifkan kepala → tidak bisa membuka kelas', v like 'GALAT%', v);
end $uji$;

select 0 u, '' kelompok, '== KESIMPULAN ==' cek,
       case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
       count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
  from hasil_tumbuh
union all
select u, kelompok, cek, hasil, rincian from hasil_tumbuh
order by u;

rollback;
