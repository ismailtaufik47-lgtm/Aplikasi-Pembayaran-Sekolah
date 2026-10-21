-- =====================================================================
-- 07 — SEKOLAH CONTOH DENGAN DATA 3 TAHUN AJARAN
--
--  ⚠ JALANKAN HANYA DI PROJECT SUPABASE UJI (skrip berhenti sendiri kalau ada sekolah asli).
--
--  Untuk mencoba SEMUA fitur tanpa harus mencatat transaksi satu per satu
--  di bulan & tahun yang berbeda. Membuat SATU sekolah baru:
--      "UJI CONTOH TK Pelangi"
--  berisi 2 tahun ajaran yang sudah lewat + tahun ajaran berjalan
--  (dihitung dari tanggal hari ini — skrip ini tetap benar dijalankan kapan saja).
--
--  Masuk ke aplikasi lewat layar PIN:
--      uji-contoh-kepala@contoh.test   PIN 123456   (kepala sekolah)
--      uji-contoh-admin@contoh.test    PIN 123456   (Admin/TU)
--  Portal orang tua: tautan & NIS ditampilkan di hasil paling bawah.
--
--  Isinya (semua lewat aturan aplikasi yang sama — cek kepemilikan, cek lunas, dst.):
--    • ±40 siswa: lulus 2 tahun lalu, lulus tahun lalu, naik kelas KB → A → B,
--      tinggal kelas, tidak melanjutkan, pindah di tengah tahun (tahun lalu & tahun ini),
--      siswa pindahan (masuk Oktober / Januari), pendaftar tahun depan
--    • tarif SPP berbeda tiap tahun & per kelas, kegiatan per tahun, PMB & daftar ulang
--    • pembayaran tepat waktu, telat, dicicil, menunggak; tunggakan tahun lalu yang
--      dilunasi tahun ini; 2 pembayaran dibatalkan
--    • buku kas sejak 2 tahun lalu: honor, listrik, belanja, dana BOP, pengeluaran
--      kegiatan (ada yang nombok), 1 transaksi kas dibatalkan per tahun
--
--  Tidak menyentuh sekolah lain. Aman diulang (kalau sudah ada, dilewati).
--  Hapus: 07b_hapus_sekolah_contoh.sql (atau 09_hapus_data_uji.sql untuk semua data UJI).
--  Sesudahnya jalankan 08_cek_konsistensi.sql → semua laporan dicocokkan otomatis.
-- =====================================================================

begin;  -- satu transaksi: kalau ada yang gagal, tidak ada yang tersimpan setengah jadi

-- ---------- pengaman: hanya di project UJI ----------
do $$ begin
  if exists (select 1 from sekolah where nama not like 'UJI %') then
    raise exception 'DIHENTIKAN: database ini berisi sekolah asli. Jalankan 07 hanya di project Supabase khusus uji (08_cek_konsistensi boleh di project asli).';
  end if;
end $$;

-- ---------- alat bantu (sementara, hilang sendiri setelah skrip selesai) ----------
create or replace function pg_temp.u(t text) returns uuid language sql immutable as $$ select md5('kasceria-contoh-' || t)::uuid $$;
create or replace function pg_temp.r(t text) returns double precision language sql immutable as $$
  select ('x' || substr(md5('kc-' || t), 1, 8))::bit(32)::bigint / 4294967296.0 $$;
-- tanggal hari ke-d pada bulan ke-i (0 = Juli) tahun ajaran ta
create or replace function pg_temp.tgl(ta text, i int, d int) returns date language sql immutable as $$
  select make_date(split_part(ta, '/', 1)::int + case when i >= 6 then 1 else 0 end, ((i + 6) % 12) + 1, least(greatest(d, 1), 28)) $$;

-- ---------- akun login ----------
do $$
declare
  v_lengkap boolean := exists (select 1 from information_schema.columns
                               where table_schema = 'auth' and table_name = 'users' and column_name = 'aud');
  v_pw text;
begin
  if exists (select 1 from sekolah where id = pg_temp.u('sekolah')) then return; end if;
  begin
    v_pw := crypt('123456', gen_salt('bf'));
  exception when others then
    v_pw := extensions.crypt('123456', extensions.gen_salt('bf'));
  end;
  if v_lengkap then
    execute $q$
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      select '00000000-0000-0000-0000-000000000000', pg_temp.u('akun-' || j), 'authenticated', 'authenticated',
             'uji-contoh-' || j || '@contoh.test', $1, now(),
             '{"provider":"email","providers":["email"]}',
             jsonb_build_object('full_name', case j when 'kepala' then 'Bu Kepala Contoh' else 'Bu TU Contoh' end),
             now(), now(), '', '', '', ''
        from (values ('kepala'), ('admin')) v(j)
      on conflict (id) do nothing $q$ using v_pw;
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
      select gen_random_uuid(), u.id, u.id::text, 'email',
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
        from auth.users u
       where u.email like 'uji-contoh-%@contoh.test'
         and not exists (select 1 from auth.identities x where x.user_id = u.id and x.provider = 'email') $q$;
  else
    insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
    select pg_temp.u('akun-' || j), 'uji-contoh-' || j || '@contoh.test',
           jsonb_build_object('full_name', case j when 'kepala' then 'Bu Kepala Contoh' else 'Bu TU Contoh' end), v_pw
      from (values ('kepala'), ('admin')) v(j)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------- sekolah & seluruh isinya ----------
do $$
declare
  sk    uuid := pg_temp.u('sekolah');
  kep   uuid := pg_temp.u('akun-kepala');
  adm   uuid := pg_temp.u('akun-admin');
  kini  text := tahun_ajaran_berjalan();
  t1    text := ta_geser(tahun_ajaran_berjalan(), -1);   -- tahun lalu
  t2    text := ta_geser(tahun_ajaran_berjalan(), -2);   -- 2 tahun lalu
  v_depan text := ta_geser(tahun_ajaran_berjalan(), 1);
  hari  date := (now() at time zone 'Asia/Jakarta')::date;
  bi    int;   -- bulan berjalan (0 = Juli)
  y2    int := split_part(ta_geser(tahun_ajaran_berjalan(), -2), '/', 1)::int;
  nd text[] := array['Aisyah','Zidan','Nayla','Rafa','Keisha','Arka','Alya','Fathan','Salsabila','Bima','Kirana','Daffa',
                     'Hana','Raka','Zahra','Gibran','Nadia','Farel','Aira','Kenzo','Shafa','Rayyan','Qiana','Elang',
                     'Naura','Athar','Kayla','Abizar','Medina','Haikal','Syifa','Omar','Lubna','Fikri','Talita','Rasya',
                     'Hafsah','Yusuf','Inara','Dzaky'];
  nb text[] := array['Putri','Pratama','Ramadhan','Nur','Maulana','Azzahra','Saputra','Lestari','Hidayat','Permata','Wijaya','Anggraini'];
  r record;
  b record;
  n int;
  v_spp int;
  v_tgl timestamptz;
begin
  if exists (select 1 from sekolah where id = sk) then
    raise notice 'Sekolah contoh sudah ada — dilewati. Hapus dulu dengan 07b_hapus_sekolah_contoh.sql kalau ingin dibuat ulang.';
    return;
  end if;
  bi := case when extract(month from hari) >= 7 then extract(month from hari)::int - 7 else extract(month from hari)::int + 5 end;

  insert into sekolah (id, nama, spp_nominal, tanggal_jatuh_tempo, kepala_sekolah, alamat, wa, langganan_sampai, trial_mulai)
  values (sk, 'UJI CONTOH TK Pelangi', 150000, 10, 'Bu Kepala Contoh', 'Jl. Contoh No. 3, Bandung', '081200000003',
          hari + 365, make_date(y2, 6, 1));
  insert into profil (id, sekolah_id, nama, peran, pin_aktif) values
    (kep, sk, 'Bu Kepala Contoh', 'kepala', true),
    (adm, sk, 'Bu TU Contoh', 'admin', true);

  -- tarif SPP per tahun ajaran (tahun lalu & tahun ini: kelas B lebih mahal)
  insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada, kenaikan_pada) values
    (sk, t2,   125000, '{}'::jsonb,                 make_date(y2, 7, 1), make_date(y2 + 1, 6, 20)),
    (sk, t1,   140000, '{"B": 150000}'::jsonb,      make_date(y2 + 1, 7, 1), make_date(y2 + 2, 6, 20)),
    (sk, kini, 150000, '{"B": 165000}'::jsonb,      make_date(y2 + 2, 7, 1), make_date(y2 + 2, 7, 1));

  -- ---------- rencana siswa: kode kelompok, nomor, kelas tiap tahun, akhir tiap tahun ----------
  --  L2 lulus 2 tahun lalu · L1 lulus tahun lalu · Y masuk KB 2 tahun lalu (sekarang B)
  --  Z masuk KB tahun lalu (sekarang A) · W siswa baru tahun ini (KB)
  create temp table c_rencana (
    kode text, no int, k2 text, k1 text, k0 text, m2 int, m1 int, m0 int, s2 int, s1 int, s0 int,
    a2 text, a1 text, a0 text, status text, lulus text, depan text
  ) on commit drop;
  insert into c_rencana
  select 'L2', g, 'B', null, null, 0, null, null, null, null, null, 'lulus', null, null, 'alumni', t2, null from generate_series(1, 8) g;
  insert into c_rencana
  select 'L1', g, 'A', 'B', null, case when g = 8 then 4 else 0 end, 0, null, null, null, null, 'naik', 'lulus', null, 'alumni', t1, null from generate_series(1, 8) g;
  insert into c_rencana
  select 'Y', g, 'KB',
         'A',
         case when g in (6, 8) then null when g = 7 then 'A' else 'B' end,
         0, 0, case when g in (6, 8) then null else 0 end,
         null, case when g = 8 then 7 else null end, null,
         'naik', case g when 6 then 'tidak_lanjut' when 7 then 'tinggal' when 8 then 'pindah' else 'naik' end, null,
         case when g in (6, 8) then 'keluar' else 'aktif' end, null, null
    from generate_series(1, 8) g;
  insert into c_rencana
  select 'Z', g, null, 'KB', 'A', null, case g when 1 then 3 when 2 then 6 else 0 end, 0,
         null, null, case when g = 8 then 1 else null end,
         null, 'naik', case when g = 8 then 'pindah' else null end,
         case when g = 8 then 'keluar' else 'aktif' end, null, null
    from generate_series(1, 8) g;
  insert into c_rencana
  select 'W', g, null, null, case when g = 6 then null else 'KB' end, null, null, case when g = 1 then 2 else 0 end,
         null, null, null, null, null, null, 'aktif', null, case when g = 6 then 'KB' end
    from generate_series(1, 6) g;

  -- siswa (dibuat aktif dulu; status lulus/keluar dipasang di akhir)
  n := 0;
  for r in select * from c_rencana order by kode, no loop
    n := n + 1;
    insert into siswa (id, sekolah_id, nama, panggilan, jenis_kelamin, kelas, nis, wali, hp, guru, avatar)
    values (pg_temp.u('s-' || r.kode || r.no), sk,
            nd[n] || ' ' || nb[1 + (n * 5) % 12], nd[n], case when n % 2 = 0 then 'L' else 'P' end,
            coalesce(r.k0, r.depan, r.k1, r.k2),
            'CT-' || r.kode || lpad(r.no::text, 2, '0'),
            case when r.kode = 'Y' and r.no = 1 or r.kode = 'L1' and r.no = 1 then 'Ibu Wulan Contoh'
                 else (case when n % 3 = 0 then 'Bapak ' else 'Ibu ' end) || nb[1 + (n + 3) % 12] end,
            case when r.kode = 'Y' and r.no = 1 or r.kode = 'L1' and r.no = 1 then '081300000001' else '0813' || lpad((7000000 + n)::text, 8, '0') end,
            'Bu Guru ' || coalesce(r.k0, r.k1, r.k2, 'KB'), n % 6);
  end loop;

  -- keanggotaan per tahun ajaran (menimpa baris otomatis dari pembuatan siswa)
  delete from siswa_tahun where sekolah_id = sk;
  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, selesai, akhir)
  select sk, pg_temp.u('s-' || kode || no), t2, k2, m2, s2, a2 from c_rencana where k2 is not null
  union all select sk, pg_temp.u('s-' || kode || no), t1, k1, m1, s1, a1 from c_rencana where k1 is not null
  union all select sk, pg_temp.u('s-' || kode || no), kini, k0, m0, s0, a0 from c_rencana where k0 is not null
  union all select sk, pg_temp.u('s-' || kode || no), v_depan, depan, 0, null, null from c_rencana where depan is not null;
  -- kelas di data siswa = kelas terakhir (tahun ini / terakhir terdaftar)
  update siswa x set kelas = coalesce(c.k0, c.depan, c.k1, c.k2)
    from c_rencana c where x.id = pg_temp.u('s-' || c.kode || c.no) and x.kelas is distinct from coalesce(c.k0, c.depan, c.k1, c.k2);

  -- ---------- biaya kegiatan per tahun ajaran ----------
  insert into biaya (id, sekolah_id, nama, nominal, urutan, tanggal, tahun_ajaran, emoji) values
    (pg_temp.u('b-' || t2 || '-1'), sk, 'Manasik haji',        150000, 1, pg_temp.tgl(t2, 3, 15), t2, '🕋'),
    (pg_temp.u('b-' || t2 || '-2'), sk, 'Outing class',        200000, 2, pg_temp.tgl(t2, 7, 20), t2, '🚌'),
    (pg_temp.u('b-' || t2 || '-3'), sk, 'Pentas akhir tahun',  250000, 3, pg_temp.tgl(t2, 11, 12), t2, '🎭'),
    (pg_temp.u('b-' || t1 || '-1'), sk, 'Manasik haji',        160000, 1, pg_temp.tgl(t1, 3, 14), t1, '🕋'),
    (pg_temp.u('b-' || t1 || '-2'), sk, 'Outing class',        220000, 2, pg_temp.tgl(t1, 8, 5), t1, '🚌'),
    (pg_temp.u('b-' || t1 || '-3'), sk, 'Pentas akhir tahun',  250000, 3, pg_temp.tgl(t1, 11, 11), t1, '🎭'),
    (pg_temp.u('b-' || t1 || '-4'), sk, 'Seragam olahraga',    120000, 4, null, t1, '👕'),
    (pg_temp.u('b-' || kini || '-1'), sk, 'Manasik haji',      175000, 1, pg_temp.tgl(kini, 2, 20), kini, '🕋'),
    (pg_temp.u('b-' || kini || '-2'), sk, 'Outing class',      240000, 2, pg_temp.tgl(kini, 7, 18), kini, '🚌'),
    (pg_temp.u('b-' || kini || '-3'), sk, 'Buku & LKS',        180000, 3, null, kini, '📚');

  -- ---------- PMB (siswa baru) & daftar ulang (siswa lama) per tahun ----------
  insert into paket_biaya (id, sekolah_id, jenis, tahun_ajaran, nama, rincian, tahap, total)
  select pg_temp.u('pk-' || j || '-' || ta), sk, j, ta, case j when 'pmb' then 'PMB ' else 'Daftar ulang ' end || ta,
         case j when 'pmb' then '[{"nama":"Formulir","nominal":150000},{"nama":"Uang gedung","nominal":1500000},{"nama":"Seragam","nominal":550000}]'::jsonb
                else '[{"nama":"Kegiatan setahun","nominal":600000},{"nama":"Buku & alat tulis","nominal":400000}]'::jsonb end,
         jsonb_build_array(
           jsonb_build_object('nama', 'Tahap 1', 'jatuhTempo', pg_temp.tgl(ta, 0, 15), 'nominal', case j when 'pmb' then 1200000 else 500000 end),
           jsonb_build_object('nama', 'Tahap 2', 'jatuhTempo', pg_temp.tgl(ta, 3, 15), 'nominal', case j when 'pmb' then 1000000 else 500000 end)),
         case j when 'pmb' then 2200000 else 1000000 end
    from (values (t2), (t1), (kini)) t(ta) cross join (values ('pmb'), ('du')) v(j);
  -- PMB: siswa yang masuk tahun itu · DU: siswa lama yang lanjut tahun itu
  insert into paket_siswa (paket_id, siswa_id, sekolah_id)
  select pg_temp.u('pk-pmb-' || t2), pg_temp.u('s-' || kode || no), sk from c_rencana where kode = 'Y'
  union all select pg_temp.u('pk-du-' || t2), pg_temp.u('s-' || kode || no), sk from c_rencana where kode in ('L2', 'L1')
  union all select pg_temp.u('pk-pmb-' || t1), pg_temp.u('s-' || kode || no), sk from c_rencana where kode = 'Z'
  union all select pg_temp.u('pk-du-' || t1), pg_temp.u('s-' || kode || no), sk from c_rencana where kode in ('L1', 'Y')
  union all select pg_temp.u('pk-pmb-' || kini), pg_temp.u('s-' || kode || no), sk from c_rencana where kode = 'W' and no < 6
  union all select pg_temp.u('pk-du-' || kini), pg_temp.u('s-' || kode || no), sk from c_rencana where kode in ('Y', 'Z') and k0 is not null;

  -- ---------- rencana pembayaran ----------
  create temp table c_bayar (siswa uuid, jenis text, ta text, periode int, biaya uuid, paket uuid, nominal int, tgl timestamptz, ket text, metode text) on commit drop;

  -- SPP: tiap bulan terdaftar; tahun lalu: lunas kecuali yang sengaja ditinggal menunggak
  for r in
    select c.kode, c.no, st.siswa_id, st.tahun_ajaran ta, g.i, spp_target(st.siswa_id, st.tahun_ajaran, g.i) target,
           pg_temp.r(st.siswa_id::text || 'pola') pola
      from siswa_tahun st
      join c_rencana c on pg_temp.u('s-' || c.kode || c.no) = st.siswa_id
      cross join lateral generate_series(st.mulai, coalesce(st.selesai, 11)) g(i)
     where st.sekolah_id = sk and st.tahun_ajaran <= kini
  loop
    continue when r.target <= 0;
    if r.ta < kini then
      -- tunggakan yang SENGAJA dibiarkan (untuk mencoba menu Tagihan, portal alumni, SAKU)
      continue when r.kode = 'L2' and r.no = 1 and r.i >= 10;                 -- alumni: Mei–Juni belum
      continue when r.kode = 'L1' and r.no = 1 and r.i = 11 and r.ta = t1;    -- alumni (kakak Y1): Juni belum
      continue when r.kode = 'Y' and r.no = 2 and r.ta = t1 and r.i >= 9;     -- aktif: April–Juni tahun lalu
      continue when r.kode = 'Y' and r.no = 3 and r.ta = t2 and r.i = 5;      -- aktif: Desember 2 tahun lalu
      continue when r.kode = 'Y' and r.no = 8 and r.i = 7;                    -- pindah: bulan terakhir belum
      if r.kode = 'L2' and r.no = 2 and r.i = 11 then                         -- dicicil, sisanya dilunasi TAHUN INI
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target / 2, pg_temp.tgl(r.ta, r.i, 8) + interval '9 hours', 'cicil', 'Tunai');
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target - r.target / 2,
                                    least(pg_temp.tgl(kini, 1, 6) + interval '10 hours', now() - interval '2 hours'), 'pelunasan', 'Transfer');
        continue;
      end if;
      if r.kode = 'Z' and r.no = 4 and r.ta = t1 and r.i = 11 then            -- dicicil, sisanya masih kurang
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, 70000, pg_temp.tgl(r.ta, r.i, 9) + interval '9 hours', 'cicil', 'Tunai');
        continue;
      end if;
      if r.pola < .70 then         -- tepat waktu
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target, pg_temp.tgl(r.ta, r.i, 3 + (r.pola * 20)::int) + interval '9 hours', null,
                                    case when pg_temp.r(r.siswa_id::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
      elsif r.pola < .85 then      -- telat sebulan (bulan Juni dibayar di bulan yang sama supaya tetap di tahun itu)
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target,
                                    pg_temp.tgl(r.ta, least(r.i + 1, 11), 12) + interval '10 hours', null, 'Transfer');
      else                         -- dicicil dua kali
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target / 2, pg_temp.tgl(r.ta, r.i, 5) + interval '9 hours', null, 'Tunai');
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target - r.target / 2, pg_temp.tgl(r.ta, r.i, 20) + interval '9 hours', null, 'Tunai');
      end if;
    else
      -- tahun berjalan: hanya sampai hari ini, pola rajin / telat / nunggak / mencicil
      continue when r.i > bi;
      continue when r.kode = 'Z' and r.no = 8 and r.i = 1;                    -- pindah tahun ini: Agustus belum
      if r.pola < .55 then
        continue when r.i = bi and extract(day from hari) < 8;
        v_tgl := pg_temp.tgl(kini, r.i, 3 + (r.pola * 10)::int) + interval '9 hours';
      elsif r.pola < .75 then
        continue when r.i >= bi;
        v_tgl := pg_temp.tgl(kini, r.i, 25) + interval '10 hours';
      elsif r.pola < .88 then
        continue when r.i >= bi - 1;
        v_tgl := pg_temp.tgl(kini, r.i, 15) + interval '10 hours';
      else
        continue when r.i > bi - 1;
        insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target / 2,
                                    least(pg_temp.tgl(kini, r.i, 9) + interval '9 hours', now() - interval '3 hours'), null, 'Tunai');
        continue;
      end if;
      insert into c_bayar values (r.siswa_id, 'spp', r.ta, r.i, null, null, r.target, least(v_tgl, now() - interval '3 hours'), null,
                                  case when pg_temp.r(r.siswa_id::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
    end if;
  end loop;
  -- tunggakan Desember 2 tahun lalu milik Y3 dilunasi TAHUN INI (muncul di Transaksi tahun ini)
  insert into c_bayar select pg_temp.u('s-Y3'), 'spp', t2, 5, null, null, 125000,
         least(pg_temp.tgl(kini, 0, 20) + interval '11 hours', now() - interval '2 hours'), 'pelunasan', 'Tunai';

  -- kegiatan: siswa yang ditagih (terdaftar di bulan kegiatannya)
  for b in select x.*, pg_temp.r(x.id::text || 'k') kr from biaya x where x.sekolah_id = sk loop
    for r in select st.siswa_id, c.kode, c.no, pg_temp.r(st.siswa_id::text || b.id::text) p
               from siswa_tahun st join c_rencana c on pg_temp.u('s-' || c.kode || c.no) = st.siswa_id
              where st.sekolah_id = sk and kegiatan_wajib(st.siswa_id, b.id) and st.tahun_ajaran = b.tahun_ajaran loop
      v_tgl := least(coalesce(b.tanggal - 10, pg_temp.tgl(b.tahun_ajaran, 1, 10)) + interval '10 hours', now() - interval '3 hours');
      continue when v_tgl < pg_temp.tgl(b.tahun_ajaran, 0, 1);
      if b.tahun_ajaran < kini then
        continue when r.kode = 'L2' and r.no = 1 and b.nama = 'Pentas akhir tahun';               -- alumni: belum
        continue when r.kode = 'Z' and r.no = 3 and b.nama = 'Pentas akhir tahun';                -- aktif: belum
        if r.kode = 'L1' and r.no = 1 and b.nama = 'Outing class' then                            -- alumni: baru separuh
          insert into c_bayar values (r.siswa_id, 'kegiatan', null, null, b.id, null, b.nominal / 2, v_tgl, null, 'Tunai');
          continue;
        end if;
        insert into c_bayar values (r.siswa_id, 'kegiatan', null, null, b.id, null, b.nominal, v_tgl, null, 'Tunai');
      else
        -- tahun ini: kegiatan yang sudah lewat 80% lunas, yang akan datang 40% sudah bayar
        continue when r.p > case when b.tanggal is not null and b.tanggal < hari then .8 else .4 end;
        insert into c_bayar values (r.siswa_id, 'kegiatan', null, null, b.id, null,
                                    case when r.p < .15 then b.nominal / 2 else b.nominal end, v_tgl, null,
                                    case when r.p < .5 then 'Tunai' else 'Transfer' end);
      end if;
    end loop;
  end loop;

  -- PMB & daftar ulang: tahap 1 hampir semua, tahap 2 sebagian (tahun lalu: lunas)
  insert into c_bayar
  select ps.siswa_id, 'paket', null, null, null, k.id, (t.e ->> 'nominal')::int,
         least((t.e ->> 'jatuhTempo')::date - 5 + interval '11 hours', now() - interval '3 hours'), null, 'Transfer'
    from paket_siswa ps
    join paket_biaya k on k.id = ps.paket_id
    cross join lateral jsonb_array_elements(k.tahap) with ordinality t(e, o)
   where k.sekolah_id = sk
     and ((t.e ->> 'jatuhTempo')::date - 5 <= hari)
     and (k.tahun_ajaran < kini or pg_temp.r(ps.siswa_id::text || k.id || t.o) < case t.o when 1 then .9 else .5 end);

  -- simpan lewat aturan aplikasi (cek milik, cek tahun, cek lunas) — urut tanggal
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, biaya_id, paket_id, keterangan, nominal, metode, petugas, dicatat_oleh, dibayar_pada)
  select sk, c.siswa, c.jenis, c.periode, c.ta, c.biaya, c.paket,
         case c.jenis when 'spp' then 'SPP bulanan — ' || ta_nama_bulan(c.ta, c.periode)
                      when 'kegiatan' then 'Biaya kegiatan — ' || (select nama || ' ' || tahun_ajaran from biaya where id = c.biaya)
                      else (select nama from paket_biaya where id = c.paket) end,
         c.nominal, c.metode, 'Bu TU Contoh', adm, c.tgl
    from c_bayar c
   order by c.tgl;

  -- 2 pembayaran dibatalkan (tercatat di Transaksi › Dibatalkan, tidak dihitung di mana pun)
  insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, metode, petugas, dicatat_oleh,
                                dibayar_pada, dibatalkan_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
  values
    (pg_temp.u('batal-1'), sk, pg_temp.u('s-Y4'), 'spp', 2, t1, 'SPP bulanan — ' || ta_nama_bulan(t1, 2), 140000, 'Tunai', 'Bu TU Contoh', adm,
     pg_temp.tgl(t1, 2, 4) + interval '9 hours', pg_temp.tgl(t1, 2, 4) + interval '10 hours', kep, 'Bu Kepala Contoh', 'Dobel catat'),
    (pg_temp.u('batal-2'), sk, pg_temp.u('s-W2'), 'spp', 0, kini, 'SPP bulanan — ' || ta_nama_bulan(kini, 0), 150000, 'Transfer', 'Bu TU Contoh', adm,
     least(pg_temp.tgl(kini, 0, 6) + interval '9 hours', now() - interval '5 hours'), least(pg_temp.tgl(kini, 0, 6) + interval '11 hours', now() - interval '4 hours'),
     kep, 'Bu Kepala Contoh', 'Salah pilih siswa');

  -- ---------- buku kas sejak 2 tahun lalu ----------
  insert into kas_pengaturan (sekolah_id, saldo_awal, mulai, diubah_oleh) values (sk, 8000000, make_date(y2, 7, 1), 'Bu Kepala Contoh');
  -- honor guru & listrik tiap bulan
  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota_file, dicatat_oleh, dicatat_nama)
  select sk, 'keluar', d.tgl, d.kat, d.nom, d.ket, array[sk::text || '/' || pg_temp.u('nota-' || d.ket || d.tgl) || '.jpg'], adm, 'Bu TU Contoh'
    from (
      select pg_temp.tgl(ta, i, 25) tgl, 'Honor guru' kat,
             case ta when t2 then 4500000 when t1 then 5000000 else 5500000 end::bigint nom,
             'Honor guru & staf ' || ta_nama_bulan(ta, i) ket
        from (values (t2), (t1), (kini)) t(ta), generate_series(0, 11) i
      union all
      select pg_temp.tgl(ta, i, 6), 'Listrik & air', (350000 + round(pg_temp.r(ta || i || 'l') * 200) * 1000)::bigint, 'Listrik & air ' || ta_nama_bulan(ta, i)
        from (values (t2), (t1), (kini)) t(ta), generate_series(0, 11) i
    ) d
   where d.tgl <= hari;
  -- belanja kecil (2 per bulan), sebagian tanpa nota; satu per tahun dibatalkan
  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota_file, dicatat_oleh, dicatat_nama,
                   dibatalkan_pada, dibatalkan_nama, alasan_batal)
  select sk, 'keluar', d.tgl, (array['ATK','Konsumsi','Perawatan gedung','Transport'])[1 + (pg_temp.r(d.k) * 4)::int % 4],
         (50 + round(pg_temp.r(d.k || 'n') * 250))::bigint * 1000, 'Belanja ' || d.k,
         case when pg_temp.r(d.k || 'nota') < .8 then array[sk::text || '/' || pg_temp.u('nota-' || d.k) || '.jpg'] end,
         adm, 'Bu TU Contoh',
         case when d.i = 4 and d.j = 1 then d.tgl + interval '1 day' end,
         case when d.i = 4 and d.j = 1 then 'Bu Kepala Contoh' end,
         case when d.i = 4 and d.j = 1 then 'Salah ketik nominal' end
    from (select ta, i, j, pg_temp.tgl(ta, i, 4 + j * 11 + (pg_temp.r(ta || i || j) * 6)::int) tgl, ta || '-' || i || '-' || j k
            from (values (t2), (t1), (kini)) t(ta), generate_series(0, 11) i, generate_series(1, 2) j) d
   where d.tgl <= hari;
  -- dana BOP masuk 2x setahun
  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, dicatat_oleh, dicatat_nama)
  select sk, 'masuk', pg_temp.tgl(ta, i, 15), 'Dana BOP', 1800000, 'BOP semester ' || case i when 0 then '1' else '2' end || ' ' || ta, kep, 'Bu Kepala Contoh'
    from (values (t2), (t1), (kini)) t(ta), (values (0), (6)) v(i)
   where pg_temp.tgl(ta, i, 15) <= hari;
  -- pengeluaran kegiatan (berlabel) — Outing tahun lalu sengaja nombok
  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, biaya_id, nota_file, dicatat_oleh, dicatat_nama)
  select sk, 'keluar', x.tanggal - 3, kk.kat,
         (round(x.nominal * (select count(distinct st.siswa_id) from siswa_tahun st where st.sekolah_id = sk and kegiatan_wajib(st.siswa_id, x.id))
                * (case when x.nama = 'Outing class' and x.tahun_ajaran = t1 then 1.15 else .75 end) * kk.porsi / 1000) * 1000)::bigint,
         x.nama || ' — ' || lower(kk.kat), x.id, array[sk::text || '/' || pg_temp.u('nota-' || x.id || kk.kat) || '.jpg'], adm, 'Bu TU Contoh'
    from biaya x
    cross join (values ('Transportasi', .6), ('Konsumsi', .4)) kk(kat, porsi)
   where x.sekolah_id = sk and x.tanggal is not null and x.tanggal - 3 <= hari;

  -- ---------- wali & tautan portal (Ibu Wulan Contoh: Y1 aktif + kakaknya L1-1 alumni yang masih menunggak) ----------
  insert into wali (id, sekolah_id, nama, hp, token)
  select pg_temp.u('w-' || c.kode || c.no), sk, s.wali, s.hp, md5('kasceria-contoh-token-' || c.kode || c.no)
    from c_rencana c join siswa s on s.id = pg_temp.u('s-' || c.kode || c.no)
   where not (c.kode = 'L1' and c.no = 1);
  insert into wali_siswa (wali_id, siswa_id)
  select pg_temp.u('w-' || c.kode || c.no), pg_temp.u('s-' || c.kode || c.no) from c_rencana c where not (c.kode = 'L1' and c.no = 1)
  union all select pg_temp.u('w-Y1'), pg_temp.u('s-L11');

  -- ---------- status akhir: lulus / keluar ----------
  update siswa x set status_siswa = 'alumni', tahun_lulus = c.lulus
    from c_rencana c where x.id = pg_temp.u('s-' || c.kode || c.no) and c.status = 'alumni';
  update siswa x set status_siswa = 'keluar'
    from c_rencana c where x.id = pg_temp.u('s-' || c.kode || c.no) and c.status = 'keluar';

  raise notice 'Sekolah contoh dibuat: % siswa, % pembayaran, % transaksi kas',
    (select count(*) from siswa where sekolah_id = sk), (select count(*) from pembayaran where sekolah_id = sk),
    (select count(*) from kas where sekolah_id = sk);
end $$;

analyze siswa, siswa_tahun, pembayaran, kas, biaya, paket_biaya, paket_siswa;

-- ---------- ringkasan & cara mencoba ----------
select 'Login aplikasi' as apa, 'uji-contoh-kepala@contoh.test / uji-contoh-admin@contoh.test — PIN 123456' as isi
union all
select 'Portal orang tua (Ibu Wulan Contoh: 1 anak aktif + 1 alumni menunggak)',
       '/ortu/' || md5('kasceria-contoh-token-Y1') || '   NIS: CT-Y01'
union all
select 'Tahun ajaran berisi data', string_agg(distinct tahun_ajaran, ', ' order by tahun_ajaran)
  from siswa_tahun where sekolah_id = md5('kasceria-contoh-sekolah')::uuid
union all
select 'Isi', (select count(*) from siswa where sekolah_id = md5('kasceria-contoh-sekolah')::uuid) || ' siswa · '
           || (select count(*) from pembayaran where sekolah_id = md5('kasceria-contoh-sekolah')::uuid) || ' pembayaran · '
           || (select count(*) from kas where sekolah_id = md5('kasceria-contoh-sekolah')::uuid) || ' transaksi kas';

commit;
