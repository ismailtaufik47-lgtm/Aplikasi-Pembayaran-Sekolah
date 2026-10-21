-- =====================================================================
-- 14 — UJI KEAMANAN (menyamar sebagai akun sungguhan) — BACA / ROLLBACK SAJA
--
--  Jalankan SESUDAH 0049_perbaikan_keamanan.sql. Boleh juga SEBELUM 0049
--  untuk melihat celah yang ditutup 0049 (akan muncul GAGAL).
--  Tidak ada data yang berubah: setiap BAGIAN di-ROLLBACK.
--
--  Sekolah yang dipakai dipilih otomatis (tanpa menempel id):
--     A = UJI B01 kalau ada, kalau tidak: sekolah pertama yang punya akun kepala & admin
--     B = sekolah lain mana pun
--  Kalau hanya ada SATU sekolah, uji "LINTAS sekolah" dilewati.
--
--  BAGIAN 0  pemeriksaan bawaan (RLS, aturan akses lama, fungsi terbuka)
--  BAGIAN 1  serangan: kepala, admin, anon, lintas sekolah, PIN, kode aktivasi
--  Hasil = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pemeriksaan bawaan
-- #####################################################################
with
tabel as (
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
cek as (
  select 1 u, 'Semua tabel memakai RLS' cek,
         case when count(*) filter (where not c.relrowsecurity) = 0 then 'LULUS' else 'GAGAL' end hasil,
         coalesce(string_agg(c.relname, ', ') filter (where not c.relrowsecurity), '') rincian
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 2, 'Aturan akses lama 0013 sudah dihapus',
         case when count(*) = 0 then 'LULUS' else 'GAGAL' end, coalesce(string_agg(c.relname || '.' || p.polname, ', '), '')
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where p.polname in ('pembayaran_tulis', 'pembayaran_ubah', 'pembayaran_hapus', 'biaya_ubah', 'biaya_hapus',
                       'wali_ubah', 'wali_hapus', 'wali_siswa_hapus')
  union all
  select 3, 'Tidak ada aturan akses yang hanya bersyarat "langganan aktif"',
         case when count(*) = 0 then 'LULUS' else 'GAGAL' end, coalesce(string_agg(c.relname || '.' || p.polname, ', '), '')
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'langganan_aktif'
  union all
  select 4, 'Pembayaran tidak bisa diubah / dihapus langsung (hak UPDATE/DELETE dicabut)',
         case when has_table_privilege('authenticated', 'public.pembayaran', 'UPDATE')
                or has_table_privilege('authenticated', 'public.pembayaran', 'DELETE') then 'GAGAL' else 'LULUS' end, ''
  union all
  select 5, 'Fungsi bantu internal tidak bisa dipanggil langsung',
         case when count(*) = 0 then 'LULUS' else 'GAGAL' end, coalesce(string_agg(p.proname, ', '), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('spp_tarif', 'spp_target', 'kegiatan_wajib', 'sinkron_status_langganan', 'kode_acak',
                       'ai_kegiatan_siswa', 'ai_ringkas_siswa', 'ai_spp_siswa', 'ai_kelas_cocok')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  select 6, 'buka_kunci_pin tidak bisa dipanggil tanpa login',
         case when has_function_privilege('anon', 'public.buka_kunci_pin(uuid)', 'execute') then 'GAGAL' else 'LULUS' end, ''
  union all
  select 8, 'Tidak ada wali yang terhubung ke siswa sekolah lain (data yang sudah ada)',
         case when count(*) = 0 then 'LULUS' else 'GAGAL' end, coalesce(count(*) || ' hubungan: ' || string_agg(w.nama || ' → ' || x.nama, ', '), '')
    from wali_siswa ws join wali w on w.id = ws.wali_id join siswa x on x.id = ws.siswa_id
   where w.sekolah_id <> x.sekolah_id
  union all
  select 9, 'Tidak ada siswa di paket sekolah lain (data yang sudah ada)',
         case when count(*) = 0 then 'LULUS' else 'GAGAL' end, coalesce(count(*)::text, '')
    from paket_siswa ps join siswa x on x.id = ps.siswa_id where ps.sekolah_id <> x.sekolah_id
  union all
  select 7, 'Tabel pembatasan percobaan kode aktivasi ada (0049)',
         case when to_regclass('public.aktivasi_percobaan') is not null then 'LULUS' else 'GAGAL' end, ''
)
select * from (
  select 0 u, '== KESIMPULAN ==' cek,
         case when count(*) filter (where hasil <> 'LULUS') = 0 then 'LULUS' else 'GAGAL' end hasil,
         count(*) || ' pemeriksaan · ' || count(*) filter (where hasil <> 'LULUS') || ' gagal' rincian from cek
  union all select * from cek
) x order by u;


-- #####################################################################
-- BAGIAN 1 — serangan (menyamar), semua di-ROLLBACK
-- #####################################################################
begin;

create temp table serang (urut serial, kelompok text, peran text, aksi text, harap text, baris int, galat text) on commit drop;
grant all on serang to anon, authenticated;
grant usage on sequence serang_urut_seq to anon, authenticated;

do $$
declare
  skA uuid; skB uuid; kep uuid; kepE text; adm uuid; admE text; tanpa uuid;
  sisA uuid; sisB uuid; byA uuid; byB uuid; biA uuid; biB uuid; waA uuid; waB uuid; kepB uuid;
  sisS uuid; blnS int; trfS int; adaTanpa boolean := true;
  q record; n int; who record; j jsonb; i int;
begin
  -- pilih sekolah A (punya kepala & admin) dan B
  select s.id into skA from sekolah s
   where exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'kepala' and p.aktif)
     and exists (select 1 from profil p where p.sekolah_id = s.id and p.peran = 'admin' and p.aktif)
   order by (s.nama like 'UJI B01 %') desc, s.dibuat_pada limit 1;
  if skA is null then raise exception 'Tidak ada sekolah yang punya akun kepala DAN admin/TU untuk diuji.'; end if;
  select s.id into skB from sekolah s where s.id <> skA order by (s.nama like 'UJI B02 %') desc, s.dibuat_pada limit 1;

  select p.id, u.email into kep, kepE from profil p join auth.users u on u.id = p.id where p.sekolah_id = skA and p.peran = 'kepala' and p.aktif limit 1;
  select p.id, u.email into adm, admE from profil p join auth.users u on u.id = p.id where p.sekolah_id = skA and p.peran = 'admin' and p.aktif limit 1;
  select id into kepB from profil where sekolah_id = skB limit 1;
  select id into sisA from siswa where sekolah_id = skA and aktif limit 1;
  select id into sisB from siswa where sekolah_id = skB limit 1;
  select id into byA from pembayaran where sekolah_id = skA limit 1;
  select id into byB from pembayaran where sekolah_id = skB limit 1;
  select id into biA from biaya where sekolah_id = skA limit 1;
  select id into biB from biaya where sekolah_id = skB limit 1;
  select id into waA from wali where sekolah_id = skA limit 1;
  select id into waB from wali where sekolah_id = skB limit 1;
  -- SPP yang belum dibayar (supaya yang menolak adalah ATURAN AKSES, bukan pengecek lunas)
  select st.siswa_id, g.i, spp_target(st.siswa_id, st.tahun_ajaran, g.i) into sisS, blnS, trfS
    from siswa_tahun st join siswa x on x.id = st.siswa_id and x.aktif
    cross join lateral generate_series(st.mulai, coalesce(st.selesai, 11)) g(i)
   where st.sekolah_id = skA and st.tahun_ajaran = tahun_ajaran_berjalan()
     and spp_target(st.siswa_id, st.tahun_ajaran, g.i) > 0
     and not exists (select 1 from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = st.tahun_ajaran and p.periode = g.i)
   order by g.i desc limit 1;
  -- akun login tanpa sekolah (untuk uji kode aktivasi): dibuat sementara, ikut di-ROLLBACK
  tanpa := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (tanpa, 'uji-keamanan-' || left(tanpa::text, 8) || '@contoh.test');
  exception when others then adaTanpa := false;
  end;

  for who in select * from (values ('kepala', kep, kepE), ('admin/TU', adm, admE), ('tanpa login', null::uuid, null::text)) v(peran, uid, email) loop
    for q in select * from (values
      -- kelompok, aksi, sql, harap ('tolak' / 'boleh:<peran>')
      ('A Pembayaran', 'ubah nominal pembayaran',            format('update pembayaran set nominal = nominal + 1 where id = %L', byA), 'tolak'),
      ('A Pembayaran', 'hapus pembayaran tanpa jejak',        format('delete from pembayaran where id = %L', byA), 'tolak'),
      ('A Pembayaran', 'catat pembayaran langsung (SPP yang belum dibayar)', format('insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, metode, petugas) values (%L, %L, ''spp'', %s, tahun_ajaran_berjalan(), ''uji keamanan'', %s, ''Tunai'', ''uji'')', skA, sisS, coalesce(blnS, 0), coalesce(trfS, 1)), 'tolak-kepala'),
      ('B Data sekolah', 'ubah biaya kegiatan',               format('update biaya set nama = nama where id = %L', biA), 'tolak-kepala'),
      ('B Data sekolah', 'ubah / hapus wali (tautan portal)', format('update wali set nama = nama where id = %L', waA), 'tolak-kepala'),
      ('B Data sekolah', 'ubah data siswa',                   format('update siswa set nama = nama where id = %L', sisA), 'tolak-kepala'),
      ('B Data sekolah', 'tulis buku kas langsung',           format('insert into kas (sekolah_id, jenis, tanggal, kategori, nominal) values (%L, ''keluar'', current_date, ''x'', 1)', skA), 'tolak'),
      ('C Langganan', 'perpanjang sendiri (kolom lama)',     format('update sekolah set langganan_berakhir = now() + interval ''5 years'' where id = %L', skA), 'tolak'),
      ('C Langganan', 'perpanjang sendiri (kolom baru)',     format('update sekolah set langganan_sampai = current_date + 1000 where id = %L', skA), 'tolak'),
      ('C Langganan', 'ubah hak akses / kuota AI sendiri',   format('update sekolah set ai_batas_harian = 9999 where id = %L', skA), 'tolak'),
      ('D Akun', 'ubah peran diri sendiri',                   'update profil set peran = ''kepala'' where id = auth.uid()', 'tolak'),
      ('D Akun', 'pindah diri ke sekolah lain',               format('update profil set sekolah_id = %L where id = auth.uid()', skB), 'tolak'),
      ('D Akun', 'buat kode aktivasi langsung (tabel)',       format('insert into kode_aktivasi (sekolah_id, kode, peran) values (%L, ''ZZZZZZ'', ''kepala'')', skA), 'tolak'),
      ('D Akun', 'buka kunci PIN akun lain',                  format('select buka_kunci_pin(%L)', adm), 'tolak-bukan-kepala'),
      ('D Akun', 'baca arsip & tabel admin aplikasi',         'select (select count(*) from admin_aplikasi) + (select count(*) from aktivasi_percobaan)', 'tolak'),
      ('E Lintas sekolah', 'baca pembayaran sekolah lain',    format('select count(*) from pembayaran where sekolah_id = %L', skB), 'tolak'),
      ('E Lintas sekolah', 'ubah siswa sekolah lain',         format('update siswa set nama = ''x'' where id = %L', sisB), 'tolak'),
      ('E Lintas sekolah', 'pindahkan siswa lain ke sekolah sendiri', format('update siswa set sekolah_id = %L where id = %L', skA, sisB), 'tolak'),
      ('E Lintas sekolah', 'ubah biaya sekolah lain',         format('update biaya set nominal = 1 where id = %L', biB), 'tolak'),
      ('E Lintas sekolah', 'hapus wali sekolah lain',         format('delete from wali where id = %L', waB), 'tolak'),
      ('E Lintas sekolah', 'catat pembayaran ke sekolah lain', format('insert into pembayaran (sekolah_id, siswa_id, jenis, keterangan, nominal, petugas) values (%L, %L, ''kegiatan'', ''x'', 1, ''x'')', skB, sisB), 'tolak'),
      ('E Lintas sekolah', 'hubungkan wali sendiri ke siswa lain', format('insert into wali_siswa (wali_id, siswa_id) values (%L, %L)', waA, sisB), 'tolak'),
      ('E Lintas sekolah', 'daftarkan siswa lain ke paket sendiri', format('insert into paket_siswa (sekolah_id, paket_id, siswa_id) select %L, k.id, %L from paket_biaya k where k.sekolah_id = %L limit 1', skA, sisB, skA), 'tolak'),
      ('E Lintas sekolah', 'catat pembayaran sekolah sendiri untuk siswa lain', format('insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, metode, petugas) values (%L, %L, ''spp'', 0, tahun_ajaran_berjalan(), ''x'', 1, ''Tunai'', ''x'')', skA, sisB), 'tolak'),
      ('E Lintas sekolah', 'buka kunci PIN staf sekolah lain', format('select buka_kunci_pin(%L)', kepB), 'tolak'),
      ('E Lintas sekolah', 'tarif SPP sekolah lain (fungsi bantu)', format('select spp_tarif(%L, tahun_ajaran_berjalan(), ''A'')', skB), 'tolak'),
      ('E Lintas sekolah', 'kuitansi pembayaran sekolah lain', format('select kuitansi_staf(%L)', byB), 'tolak')
    ) v(kelompok, aksi, sql, harap) loop
      if q.kelompok like 'E%' and skB is null then continue; end if;
      begin
        if who.uid is null then
          perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who.uid, 'role', 'authenticated', 'email', who.email)::text, true);
          execute 'set local role authenticated';
        end if;
        if q.sql like 'select buka_kunci_pin%' then
          execute q.sql; n := 1;   -- fungsi tanpa hasil: tidak ada galat = berhasil membuka kunci
        elsif q.sql like 'select%' then
          -- select fungsi yang "berhasil" tapi hasilnya kosong / 0 baris dianggap ditolak
          execute q.sql into j;
          n := case when j is null or j::text in ('0', '""', 'null', '{}', '[]') or j::text like '%"sah": false%' then 0 else 1 end;
        else
          execute q.sql; get diagnostics n = row_count;
        end if;
        execute 'reset role';
        insert into serang (kelompok, peran, aksi, harap, baris) values (q.kelompok, who.peran, q.aksi, q.harap, n);
      exception when others then
        execute 'reset role';
        insert into serang (kelompok, peran, aksi, harap, galat) values (q.kelompok, who.peran, q.aksi, q.harap, left(sqlerrm, 90));
      end;
    end loop;
  end loop;

  -- KONTROL: admin/TU tetap bisa bekerja normal (uji ini tidak "lulus" karena semuanya terblokir)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'email', admE)::text, true);
  begin
    execute 'set local role authenticated';
    execute format('update siswa set nama = nama where id = %L', sisA); get diagnostics n = row_count;
    execute 'reset role';
    insert into serang (kelompok, peran, aksi, harap, baris) values ('F Kontrol', 'admin/TU', 'admin tetap bisa mengubah data siswa sendiri', 'boleh', n);
  exception when others then execute 'reset role';
    insert into serang (kelompok, peran, aksi, harap, galat) values ('F Kontrol', 'admin/TU', 'admin tetap bisa mengubah data siswa sendiri', 'boleh', left(sqlerrm, 90));
  end;
  begin
    execute 'set local role authenticated';
    execute 'select count(*) from pembayaran' into n;
    execute 'reset role';
    insert into serang (kelompok, peran, aksi, harap, baris) values ('F Kontrol', 'admin/TU', 'admin tetap bisa membaca pembayaran sekolahnya', 'boleh', least(n, 1));
  exception when others then execute 'reset role';
    insert into serang (kelompok, peran, aksi, harap, galat) values ('F Kontrol', 'admin/TU', 'admin tetap bisa membaca pembayaran sekolahnya', 'boleh', left(sqlerrm, 90));
  end;

  -- G. tebak kode aktivasi: akun baru tanpa sekolah menebak 6 kali → harus terkunci
  if not adaTanpa then
    insert into serang (kelompok, peran, aksi, harap, baris, galat) values ('G Tebak kode', 'akun baru', 'menebak kode aktivasi (dilewati: tidak bisa membuat akun uji)', 'kunci', 1, 'dilewati');
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tanpa, 'role', 'authenticated')::text, true);
  n := 0;
  for i in 1..6 loop
    begin
      execute 'set local role authenticated';
      execute format('select aktivasi_kode(%L)', 'Q' || i || 'Q' || i || 'Q' || i) into j;
      execute 'reset role';
      if j ? 'sekolahId' then n := 99; end if;
      if coalesce(j ->> 'galat', '') ~ 'Terlalu banyak' and n = 0 then n := i; end if;
    exception when others then execute 'reset role';
    end;
  end loop;
  insert into serang (kelompok, peran, aksi, harap, baris, galat)
  values ('G Tebak kode', 'akun baru', 'menebak kode aktivasi berkali-kali → dikunci sesudah 5 salah', 'kunci', n,
          case when n = 0 then 'tidak pernah dikunci' when n = 99 then 'tebakan berhasil masuk!' else 'dikunci pada tebakan ke-' || n end);
end $$;

select * from (
  select 0 u, '== KESIMPULAN ==' kelompok, null peran, null aksi,
         case when count(*) filter (where h <> 'LULUS') = 0 then 'LULUS' else 'GAGAL' end hasil,
         count(*) || ' serangan dicoba · ' || count(*) filter (where h <> 'LULUS') || ' lolos' keterangan
    from (select case
                   when harap = 'boleh' then case when coalesce(baris, 0) > 0 then 'LULUS' else 'GAGAL' end
                   when harap = 'kunci' then case when baris between 1 and 6 then 'LULUS' else 'GAGAL' end
                   when harap = 'tolak-kepala' and peran = 'admin/TU' then 'LULUS'
                   when harap = 'tolak-bukan-kepala' and peran = 'kepala' then 'LULUS'
                   when galat is not null or coalesce(baris, 0) = 0 then 'LULUS' else 'GAGAL' end h
            from serang) z
  union all
  select urut, kelompok, peran, aksi,
         case
           when harap = 'boleh' then case when coalesce(baris, 0) > 0 then 'LULUS' else 'GAGAL' end
           when harap = 'kunci' then case when baris between 1 and 6 then 'LULUS' else 'GAGAL' end
           when harap = 'tolak-kepala' and peran = 'admin/TU' then 'LULUS'
           when harap = 'tolak-bukan-kepala' and peran = 'kepala' then 'LULUS'
           when galat is not null or coalesce(baris, 0) = 0 then 'LULUS' else 'GAGAL' end,
         case
           when harap in ('tolak-kepala') and peran = 'admin/TU' then 'boleh untuk admin/TU (sesuai hak akses)'
           when harap = 'tolak-bukan-kepala' and peran = 'kepala' then 'boleh untuk kepala sekolahnya sendiri'
           when galat is not null then 'ditolak: ' || galat
           when coalesce(baris, 0) = 0 and harap not in ('boleh', 'kunci') then 'ditolak (0 baris terkena)'
           when harap = 'kunci' then galat
           else coalesce(baris, 0) || ' baris terkena'
         end
    from serang
) x order by u;

rollback;
