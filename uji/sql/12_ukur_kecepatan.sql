-- =====================================================================
-- 12 — UKUR KECEPATAN (UJI BEBAN) + UJI ISOLASI DENGAN MENYAMAR
--
--  Jalankan SESUDAH 11_isi_50_sekolah.sql (dan boleh juga sesudah 07c — sekolah
--  Kipo ikut diukur kalau punya akun). Tidak perlu menempel id apa pun:
--  sekolah yang diukur dipilih otomatis:
--     • UJI B terbesar (300 siswa) · UJI B sedang (±100) · UJI B terkecil
--     • sekolah Kipo (cfe3bdcd-…) kalau ada
--
--  Setiap fungsi dijalankan PERSIS seperti aplikasi memanggilnya: menyamar sebagai
--  akun Admin/TU sekolah itu (request.jwt.claims + role authenticated, jadi RLS
--  berlaku), atau sebagai pengunjung tanpa login (anon) untuk portal orang tua.
--  Waktu diambil dari EXPLAIN ANALYZE ("Execution Time"), 3× → yang ditampilkan
--  nilai tengah. Angka ini waktu DI SERVER saja; di HP ditambah internet ±100–300 ms
--  per permintaan.
--
--  Semua di dalam satu transaksi yang di-ROLLBACK di akhir: pembayaran uji yang
--  dicatat & dibatalkan, tarif SPP & kegiatan yang dinaikkan sementara, dll. TIDAK tersimpan.
--
--  BAGIAN 1  ukur kecepatan per layar             ±1–3 menit
--  BAGIAN 2  uji isolasi 50 sekolah (menyamar)    ±20 detik
--
--  Hasil = SATU tabel; baris paling atas = kesimpulan.
--  Kolom status:  OK       = di bawah batas
--                 LAMBAT   = di atas batas (lihat kolom batas_ms)
--                 GALAT    = fungsi gagal (pesan di kolom catatan)
-- =====================================================================


-- #####################################################################
-- BAGIAN 1 — ukur kecepatan per layar
-- #####################################################################
begin;

create temp table ukur (urut serial, sekolah text, siswa int, layar text, fungsi text, ms numeric, ms_pertama numeric,
                        baris bigint, kb numeric, batas_ms int, catatan text) on commit drop;

do $$
declare
  kini  text := tahun_ajaran_berjalan();
  t1    text := ta_geser(tahun_ajaran_berjalan(), -1);
  t2    text := ta_geser(tahun_ajaran_berjalan(), -2);
  hari  date := (now() at time zone 'Asia/Jakarta')::date;
  bi    int;
  s     record;
  akun  uuid;
  surel text;
  q     record;
  j     json;
  w     double precision[];
  v_baris bigint;
  v_kb  numeric;
  v_err text;
  k     int;
  v_tot bigint;
  v_hal int;
  v_tok text; v_nis text; v_tok2 text; v_nis2 text;
  v_siswa uuid; v_bulan int; v_tarif int; v_id uuid; v_kelas jsonb; v_std int;
begin
  bi := case when extract(month from hari) >= 7 then extract(month from hari)::int - 7 else extract(month from hari)::int + 5 end;

  for s in
    with uji as (
      select k.id, k.nama, (select count(*) from siswa x where x.sekolah_id = k.id and x.aktif) n
        from sekolah k where k.nama like 'UJI B__ TK %'
    )
    select * from (
      (select id, nama, n, 1 u from uji order by n desc, nama limit 1)
      union all (select id, nama, n, 2 from uji where n between 80 and 120 order by abs(n - 100), nama limit 1)
      union all (select id, nama, n, 3 from uji order by n, nama limit 1)
      union all (select k.id, k.nama, (select count(*) from siswa x where x.sekolah_id = k.id and x.aktif), 4
                   from sekolah k where k.id = 'cfe3bdcd-b5f0-40d9-8e7d-ff968f642c43')
    ) z order by u
  loop
    select p.id, u.email into akun, surel from profil p join auth.users u on u.id = p.id
     where p.sekolah_id = s.id and p.aktif order by (p.peran = 'admin') desc, p.dibuat_pada limit 1;
    if akun is null then
      insert into ukur (sekolah, siswa, layar, fungsi, catatan) values (s.nama, s.n, '-', '-', 'sekolah ini belum punya akun — dilewati');
      continue;
    end if;

    -- bahan uji yang dipilih otomatis (tanpa menempel id)
    v_tok := null; v_nis := null; v_tok2 := null; v_nis2 := null;
    select w.token, x.nis into v_tok, v_nis from wali w join wali_siswa ws on ws.wali_id = w.id join siswa x on x.id = ws.siswa_id
     where w.sekolah_id = s.id and x.aktif order by (select count(*) from wali_siswa z where z.wali_id = w.id) desc, x.nis limit 1;
    select w.token, x.nis into v_tok2, v_nis2 from wali w join wali_siswa ws on ws.wali_id = w.id join siswa x on x.id = ws.siswa_id
     where w.sekolah_id = s.id and x.status_siswa = 'alumni' order by x.nis limit 1;

    for q in
      select * from (values
        -- urut, layar, fungsi (label), sql, batas ms, peran ('a' = admin login, 'n' = anon)
        (1,  'Aplikasi dibuka', 'siapkan_tahun_ajaran()', 'select siapkan_tahun_ajaran()', 100, 'a'),
        (2,  'Aplikasi dibuka', 'pembayaran_dimuat() — 1 halaman (1.000 baris, + hitung total)',
             'with s as (select * from pembayaran_dimuat()) select (select count(*) from s) total, x.* from (select * from s order by dibayar_pada desc, id limit 1000) x', 400, 'a'),
        (3,  'Aplikasi dibuka', 'ringkasan_tunggakan_lalu()', 'select ringkasan_tunggakan_lalu()', 200, 'a'),
        (4,  'Aplikasi dibuka', 'siswa aktif (tabel, RLS)', 'select * from siswa where sekolah_id = $SK and aktif order by nama, id', 100, 'a'),
        (5,  'Aplikasi dibuka', 'siswa_tahun semua tahun (tabel, RLS)', 'select * from siswa_tahun where sekolah_id = $SK order by siswa_id, tahun_ajaran', 100, 'a'),
        (6,  'Aplikasi dibuka', 'biaya + paket + paket_siswa (tabel, RLS)',
             'select (select count(*) from biaya where sekolah_id = $SK and aktif), (select count(*) from paket_biaya where sekolah_id = $SK and aktif), (select count(*) from paket_siswa where sekolah_id = $SK)', 100, 'a'),
        (10, 'Laporan › Tahunan', 'daftar_tahun_ajaran()', 'select daftar_tahun_ajaran()', 500, 'a'),
        (11, 'Laporan › Tahunan', 'laporan_tahunan(tahun ini)', 'select laporan_tahunan($KINI)', 500, 'a'),
        (12, 'Laporan › Tahunan', 'laporan_tahunan(tahun lalu)', 'select laporan_tahunan($T1)', 500, 'a'),
        (13, 'Laporan › Tahunan', 'laporan_tahunan(2 tahun lalu)', 'select laporan_tahunan($T2)', 500, 'a'),
        (20, 'Transaksi › tahun lalu', 'pembayaran_daftar(tahun lalu, 300 baris)', 'select pembayaran_daftar($D1, $S1, 0, 300)', 300, 'a'),
        (21, 'Transaksi › tahun lalu', 'kas_daftar(pengeluaran tahun lalu)', 'select kas_daftar(''keluar'', $D1, $S1, 0, 30, ''semua'', ''semua'', null)', 200, 'a'),
        (22, 'Transaksi', 'pembayaran_daftar(bulan ini)', 'select pembayaran_daftar(date_trunc(''month'', $HARI)::date, $HARI, 0, 300)', 200, 'a'),
        (30, 'Tagihan › lulus/keluar', 'tunggakan_nonaktif()', 'select tunggakan_nonaktif()', 300, 'a'),
        (40, 'Laporan Keuangan / Kas', 'kas_ringkasan()', 'select kas_ringkasan()', 200, 'a'),
        (41, 'Laporan Keuangan / Kas', 'kas_laporan_bulan(bulan ini)', 'select kas_laporan_bulan(to_char($HARI, ''YYYY-MM''))', 200, 'a'),
        (42, 'Laporan Keuangan / Kas', 'kas_arus(6 bulan)', 'select kas_arus(to_char($HARI, ''YYYY-MM''), 6)', 200, 'a'),
        (43, 'Laporan Keuangan / Kas', 'kas_riwayat(bulan ini)', 'select kas_riwayat(date_trunc(''month'', $HARI)::date, $HARI, 0, 30, ''semua'')', 200, 'a'),
        (44, 'Laporan Keuangan / Kas', 'kas_saldo_per(hari ini) — dipakai di dalam laporan', 'select kas_saldo_per($SK, $HARI)', 100, 'p'),
        (50, 'Portal orang tua', 'portal_gerbang(token)', 'select portal_gerbang($TOK)', 150, 'n'),
        (51, 'Portal orang tua', 'portal_wali(token, NIS) — anak aktif', 'select portal_wali($TOK, $NIS)', 300, 'n'),
        (52, 'Portal orang tua', 'portal_wali(token, NIS) — alumni', 'select portal_wali($TOK2, $NIS2)', 300, 'n'),
        (53, 'Portal orang tua', 'portal_cek_nis(token, NIS) — dipakai di dalam portal_wali', 'select portal_cek_nis($TOK, $NIS)', 150, 'p'),
        (60, 'Tanya SAKU', 'ai_rekap_bulan(bulan ini)', 'select ai_rekap_bulan($BI)', 300, 'a'),
        (61, 'Tanya SAKU', 'ai_status_spp(bulan ini)', 'select ai_status_spp($BI, null)', 300, 'a'),
        (62, 'Tanya SAKU', 'ai_tunggakan_lalu()', 'select ai_tunggakan_lalu(null, null)', 300, 'a'),
        (63, 'Tanya SAKU', 'ai_rekap_tahun(tahun lalu) — gabungan daftar_tahun_ajaran + laporan_tahunan', 'select ai_rekap_tahun($T1)', 800, 'a'),
        (64, 'Tanya SAKU', 'ai_daftar_tunggakan()', 'select ai_daftar_tunggakan(null, null, null, true)', 300, 'a')
      ) v(urut, layar, fungsi, kueri, batas, peran)
      order by urut
    loop
      w := array[]::double precision[];
      v_baris := null; v_kb := null; v_err := null;
      if (position('$TOK2' in q.kueri) > 0 and v_tok2 is null) or (position('$TOK' in replace(q.kueri, '$TOK2', '')) > 0 and v_tok is null) then
        insert into ukur (sekolah, siswa, layar, fungsi, batas_ms, catatan)
        values (s.nama, s.n, q.layar, q.fungsi, q.batas, 'dilewati: belum ada wali (tautan portal) untuk ' ||
                case when position('$TOK2' in q.kueri) > 0 then 'alumni' else 'siswa aktif' end);
        continue;
      end if;
      begin
        for k in 1 .. 3 loop
          if q.peran = 'a' then
            perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
            execute 'set local role authenticated';
          elsif q.peran = 'n' then
            perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
            execute 'set local role anon';
          end if;
          execute 'explain (analyze, format json) ' ||
            replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(q.kueri,
              '$SK', quote_literal(s.id) || '::uuid'), '$KINI', quote_literal(kini)), '$T1', quote_literal(t1)), '$T2', quote_literal(t2)),
              '$D1', quote_literal(split_part(t1, '/', 1) || '-07-01') || '::date'), '$S1', quote_literal(split_part(t1, '/', 2) || '-06-30') || '::date'),
              '$HARI', quote_literal(hari) || '::date'), '$BI', bi::text), '$TOK2', coalesce(quote_literal(v_tok2), 'null')),
              '$NIS2', coalesce(quote_literal(v_nis2), 'null')), '$TOK', coalesce(quote_literal(v_tok), 'null')), '$NIS', coalesce(quote_literal(v_nis), 'null'))
            into j;
          execute 'reset role';
          w := w || ((j -> 0 ->> 'Execution Time')::double precision);
          if k = 1 then v_baris := (j -> 0 -> 'Plan' ->> 'Actual Rows')::bigint; end if;
        end loop;
        -- besar data yang dikirim ke HP (JSON) — hanya untuk data saat aplikasi dibuka
        if q.urut between 2 and 6 then
          if q.peran = 'a' then
            perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
            execute 'set local role authenticated';
          end if;
          execute 'select coalesce(sum(octet_length(row_to_json(x)::text)), 0) / 1024.0 from (' ||
                  replace(q.kueri, '$SK', quote_literal(s.id) || '::uuid') || ') x' into v_kb;
          execute 'reset role';
          if q.urut = 2 then
            perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
            execute 'set local role authenticated';
            select count(*) into v_tot from pembayaran_dimuat();
            execute 'reset role';
            v_hal := greatest(1, ceil(v_tot / 1000.0)::int);
            v_err := format('%s baris dimuat → %s halaman (permintaan berurutan); total di server ±%s ms',
                            v_tot, v_hal, round((select percentile_disc(.5) within group (order by x) from unnest(w) x)::numeric * v_hal));
          end if;
        end if;
      exception when others then
        execute 'reset role';
        v_err := 'GALAT: ' || sqlerrm;
      end;
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, kb, batas_ms, catatan)
      values (s.nama, s.n, q.layar, q.fungsi,
              round((select percentile_disc(.5) within group (order by x) from unnest(w) x)::numeric, 1),
              round(w[1]::numeric, 1), v_baris, round(v_kb, 1), q.batas, v_err);
    end loop;

    -- ---------- catat & batal pembayaran (trigger cek milik / tahun / lunas, + 0046 bila ada) ----------
    begin
      select st.siswa_id, g.i, spp_target(st.siswa_id, kini, g.i) into v_siswa, v_bulan, v_tarif
        from siswa_tahun st join siswa x on x.id = st.siswa_id and x.aktif
        cross join lateral generate_series(st.mulai, least(coalesce(st.selesai, 11), bi)) g(i)
       where st.sekolah_id = s.id and st.tahun_ajaran = kini
         and not exists (select 1 from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = kini and p.periode = g.i)
       order by st.siswa_id, g.i limit 1;
      if v_siswa is null then raise exception 'tidak ada SPP yang belum dibayar untuk dicoba'; end if;
      perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
      execute 'set local role authenticated';
      execute format('explain (analyze, format json) insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, metode, petugas, dicatat_oleh) '
                     'values (%L, %L, ''spp'', %s, %L, ''SPP bulanan — uji beban'', %s, ''Tunai'', ''Uji beban'', %L)',
                     s.id, v_siswa, v_bulan, kini, v_tarif, akun) into j;
      execute 'reset role';
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, batas_ms, catatan)
      values (s.nama, s.n, 'Catat & batal', 'catat pembayaran SPP (insert + trigger)', round((j -> 0 ->> 'Execution Time')::numeric, 1),
              round((j -> 0 ->> 'Execution Time')::numeric, 1), 1, 50, ta_nama_bulan(kini, v_bulan));
      select id into v_id from pembayaran where siswa_id = v_siswa and jenis = 'spp' and tahun_ajaran = kini and periode = v_bulan and petugas = 'Uji beban';
      perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
      execute 'set local role authenticated';
      execute format('explain (analyze, format json) select batalkan_pembayaran(%L, ''uji beban — dibatalkan'')', v_id) into j;
      execute 'reset role';
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, batas_ms, catatan)
      values (s.nama, s.n, 'Catat & batal', 'batalkan_pembayaran() (arsip + cek saldo kas)', round((j -> 0 ->> 'Execution Time')::numeric, 1),
              round((j -> 0 ->> 'Execution Time')::numeric, 1), 1, 150, null);
    exception when others then
      execute 'reset role';
      insert into ukur (sekolah, siswa, layar, fungsi, catatan) values (s.nama, s.n, 'Catat & batal', 'catat + batal pembayaran', 'GALAT: ' || sqlerrm);
    end;

    -- ---------- simpan tarif SPP tahun ini (trigger 0046 memeriksa SEMUA pembayaran tahun ini) ----------
    begin
      select spp_nominal, spp_kelas into v_std, v_kelas from tahun_ajaran where sekolah_id = s.id and kode = kini;
      -- tarif NAIK Rp5.000 (standar & tiap kelas) → trigger 0046 benar-benar memeriksa SEMUA pembayaran SPP
      -- tahun ini (tarif yang sama persis dilewati trigger). Naik tidak pernah membuat lebih bayar.
      -- Semua di-ROLLBACK di akhir BAGIAN ini → tarif asli tidak berubah.
      v_std := coalesce(v_std, 0) + 5000;
      select coalesce(jsonb_object_agg(e.key, (e.value::text)::int + 5000), '{}'::jsonb) into v_kelas
        from jsonb_each(coalesce(v_kelas, '{}'::jsonb)) e;
      perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated', 'email', surel)::text, true);
      execute 'set local role authenticated';
      execute format('explain (analyze, format json) select atur_tarif_spp(%L, %s, %L::jsonb)', kini, v_std, v_kelas) into j;
      execute 'reset role';
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, batas_ms, catatan)
      values (s.nama, s.n, 'Jenis biaya › SPP', 'simpan tarif SPP tahun ini (atur_tarif_spp + trigger 0046)', round((j -> 0 ->> 'Execution Time')::numeric, 1),
              round((j -> 0 ->> 'Execution Time')::numeric, 1), null, 300, null);
    exception when others then
      execute 'reset role';
      insert into ukur (sekolah, siswa, layar, fungsi, catatan) values (s.nama, s.n, 'Jenis biaya › SPP', 'simpan tarif SPP', 'GALAT: ' || sqlerrm);
    end;

    -- ---------- trigger 0046 lain: ubah masa terdaftar 1 siswa & naikkan nominal 1 kegiatan ----------
    -- (diukur sebagai pemilik database; yang diukur biaya trigger-nya. Tetap di-ROLLBACK.)
    begin
      execute format('explain (analyze, format json) update siswa_tahun set selesai = coalesce(selesai, 11) '
                     'where siswa_id = (select st.siswa_id from siswa_tahun st join pembayaran p on p.siswa_id = st.siswa_id and p.tahun_ajaran = st.tahun_ajaran '
                     'where st.sekolah_id = %L and st.tahun_ajaran = %L and st.selesai is null group by 1 order by count(*) desc limit 1) and tahun_ajaran = %L',
                     s.id, kini, kini) into j;
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, batas_ms, catatan)
      values (s.nama, s.n, 'Siswa › keanggotaan', 'ubah kelas / bulan terakhir 1 siswa (trigger 0046)', round((j -> 0 ->> 'Execution Time')::numeric, 1),
              round((j -> 0 ->> 'Execution Time')::numeric, 1), null, 150, null);
      execute format('explain (analyze, format json) update biaya set nominal = nominal + 5000 '
                     'where id = (select b.id from biaya b join pembayaran p on p.biaya_id = b.id where b.sekolah_id = %L and b.tahun_ajaran = %L '
                     'group by b.id order by count(*) desc limit 1)', s.id, kini) into j;
      insert into ukur (sekolah, siswa, layar, fungsi, ms, ms_pertama, baris, batas_ms, catatan)
      values (s.nama, s.n, 'Jenis biaya › kegiatan', 'ubah nominal kegiatan (trigger 0046)', round((j -> 0 ->> 'Execution Time')::numeric, 1),
              round((j -> 0 ->> 'Execution Time')::numeric, 1), null, 300, null);
    exception when others then
      insert into ukur (sekolah, siswa, layar, fungsi, catatan) values (s.nama, s.n, 'Siswa / kegiatan', 'trigger 0046 keanggotaan & kegiatan', 'GALAT: ' || sqlerrm);
    end;
  end loop;
end $$;

-- ---------- hasil: satu tabel (baris pertama = kesimpulan) ----------
select * from (
  select 0 as u, '== KESIMPULAN ==' as sekolah, null::int as siswa,
         case when count(*) filter (where catatan like 'GALAT%') > 0 then 'ADA GALAT'
              when count(*) filter (where ms > batas_ms) > 0 then 'ADA YANG LAMBAT'
              else 'SEMUA OK' end as layar,
         count(*) filter (where ms is not null) || ' diukur · ' || count(*) filter (where ms > batas_ms) || ' lambat · '
           || count(*) filter (where catatan like 'GALAT%') || ' galat' as fungsi,
         null::numeric as ms_tengah, null::numeric as ms_pertama, null::int as batas_ms, null::text as status, null::bigint as baris,
         null::numeric as data_kb, 'waktu di server (tanpa internet); ms_tengah = nilai tengah dari 3 kali' as catatan
    from ukur
  union all
  select urut, sekolah, siswa, layar, fungsi, ms, ms_pertama, batas_ms,
         case when catatan like 'GALAT%' then 'GALAT' when ms is null then '-' when ms > batas_ms then 'LAMBAT' else 'OK' end,
         baris, kb, catatan
    from ukur
) h
order by (u > 0), siswa desc nulls first, sekolah, u;

rollback;


-- #####################################################################
-- BAGIAN 2 — uji isolasi: setiap akun UJI B hanya melihat sekolahnya sendiri
--   Bawaan: 10 sekolah (B05, B10, … B50) ±20–40 detik. Semua 50: ubah v_semua → true (±2–4 menit).
--   Menyamar sebagai Admin/TU tiap sekolah UJI B, lalu menghitung baris yang
--   terlihat di setiap tabel. Harus: baris sekolah lain = 0, baris sekolah
--   sendiri = jumlah sebenarnya, dan UPDATE ke sekolah lain mengenai 0 baris.
-- #####################################################################
begin;

create temp table isolasi (sekolah text, tabel text, terlihat_lain bigint, terlihat_sendiri bigint, sebenarnya bigint, ubah_lain bigint) on commit drop;

do $$
declare
  v_semua boolean := false;          -- ← true = uji ke-50 sekolah
  s record; t text; v_lain bigint; v_sendiri bigint; v_asli bigint; v_ubah bigint;
  -- tabel yang dibaca aplikasi langsung (RLS). kas & kas_pengaturan: bisa dibaca peran yang boleh lihat kas.
  tabel text[] := array['siswa', 'siswa_tahun', 'tahun_ajaran', 'pembayaran', 'biaya', 'paket_biaya', 'paket_siswa',
                        'kas', 'kas_pengaturan', 'wali', 'profil', 'sekolah', 'pembayaran_batal'];
begin
  for s in select k.id, k.nama, p.id akun, u.email from sekolah k
             join profil p on p.sekolah_id = k.id and p.peran = 'admin'
             join auth.users u on u.id = p.id
            where k.nama like 'UJI B__ TK %'
              and (v_semua or right(split_part(k.nama, ' ', 2), 1) in ('0', '5'))
            order by k.nama loop
    foreach t in array tabel loop
      execute format('select count(*) from %I where %s = %L', t, case t when 'sekolah' then 'id' else 'sekolah_id' end, s.id) into v_asli;
      perform set_config('request.jwt.claims', json_build_object('sub', s.akun, 'role', 'authenticated', 'email', s.email)::text, true);
      execute 'set local role authenticated';
      begin
        execute format('select count(*) filter (where %1$s <> %2$L), count(*) filter (where %1$s = %2$L) from %3$I',
                       case t when 'sekolah' then 'id' else 'sekolah_id' end, s.id, t) into v_lain, v_sendiri;
      exception when insufficient_privilege then v_lain := 0; v_sendiri := -1;
      end;
      begin
        if t in ('siswa', 'pembayaran', 'biaya', 'wali', 'kas', 'sekolah') then
          execute format('update %I set %s = %s where %s <> %L', t,
                         case t when 'siswa' then 'nama' when 'pembayaran' then 'nominal' when 'biaya' then 'nama' when 'wali' then 'nama'
                                when 'kas' then 'keterangan' else 'nama' end,
                         case t when 'siswa' then 'nama' when 'pembayaran' then 'nominal' when 'biaya' then 'nama' when 'wali' then 'nama'
                                when 'kas' then 'keterangan' else 'nama' end,
                         case t when 'sekolah' then 'id' else 'sekolah_id' end, s.id);
          get diagnostics v_ubah = row_count;
        else
          v_ubah := 0;
        end if;
      exception when others then v_ubah := 0;   -- ditolak = aman
      end;
      execute 'reset role';
      -- arsip pembatalan sengaja tidak bisa dibaca langsung (hanya lewat riwayat_pembatalan())
      if t = 'pembayaran_batal' and v_sendiri = 0 then v_asli := 0; end if;
      insert into isolasi values (s.nama, t, v_lain, v_sendiri, v_asli, v_ubah);
    end loop;
  end loop;
end $$;

-- hasil: satu tabel (baris pertama = kesimpulan; baris berikutnya hanya kalau ada yang bocor)
select * from (
  select 0 as u, case when count(*) = 0 then 'TIDAK ADA DATA'
                      when bool_and(terlihat_lain = 0 and ubah_lain = 0) then 'LULUS — tidak ada data sekolah lain yang terlihat / bisa diubah'
                      else 'BOCOR — lihat baris di bawah' end as hasil,
         count(distinct sekolah) || ' sekolah · ' || count(*) || ' pemeriksaan · '
           || count(*) filter (where terlihat_sendiri >= 0 and terlihat_sendiri <> sebenarnya) || ' data sendiri tidak lengkap' as rincian,
         null::text as tabel, null::bigint as terlihat_lain, null::bigint as terlihat_sendiri, null::bigint as sebenarnya, null::bigint as ubah_lain
    from isolasi
  union all
  select 1, sekolah, null, tabel, terlihat_lain, terlihat_sendiri, sebenarnya, ubah_lain
    from isolasi where terlihat_lain > 0 or ubah_lain > 0 or (terlihat_sendiri >= 0 and terlihat_sendiri <> sebenarnya)
) h order by u, hasil, tabel;

rollback;
