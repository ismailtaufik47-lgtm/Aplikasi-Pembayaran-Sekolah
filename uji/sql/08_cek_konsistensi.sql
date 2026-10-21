-- =====================================================================
-- 08 — CEK KONSISTENSI SEMUA LAPORAN (otomatis, BACA SAJA)
--
--  Untuk memastikan "sudah dicatat tapi di laporan tidak muncul / angkanya beda"
--  TIDAK terjadi. Setiap angka yang ditampilkan aplikasi dihitung ulang langsung
--  dari tabel transaksi, lalu dicocokkan:
--    A. Laporan › Tahunan, tiap tahun ajaran (SPP, target, tunggakan, per kelas,
--       per bulan, kegiatan, PMB/DU, buku kas, saldo awal = saldo akhir tahun lalu)
--    B. Laporan › Keuangan / Kas, tiap bulan sejak kas dicatat (masuk, keluar,
--       saldo berantai, saldo = saldo kas hari itu)
--    C. Tagihan & Tanya SAKU tahun berjalan (rekap bulan, status SPP, daftar
--       tunggakan, tunggakan tahun lalu)
--    D. Data yang ditarik saat aplikasi dibuka (tidak ada pembayaran yang
--       tertinggal, ringkasan tunggakan lama tepat)
--    E. Tagihan › sudah lulus / keluar
--    F. Portal orang tua (anak yang tampil & jumlah pembayarannya)
--    G. Kerapian data (tidak ada yang terbayar melebihi tagihan, dsb.)
--    H. Kuitansi
--
--  Aman dijalankan di database mana pun, kapan pun (termasuk data sekolah asli):
--  semua dijalankan di dalam transaksi lalu DI-ROLLBACK — tidak ada data berubah.
--  Sekolah yang dicek: ubah baris "v_saring" di bawah (bawaan: semua sekolah).
--  Waktu: ±1 detik per sekolah kecil, ±3 detik per sekolah 300 siswa.
--
--  Hasil (tabel di bawah editor): satu baris per pemeriksaan —
--  "LULUS" atau "GAGAL" + contoh angka yang tidak cocok.
-- =====================================================================
begin;

create temp table cek_hasil (urut serial, sekolah text, kelompok text, cek text, ok boolean, rincian text) on commit drop;
create or replace function pg_temp.catat(p_sek text, p_kel text, p_cek text, p_ok boolean, p_rinci text default null)
returns void language sql as $$
  insert into cek_hasil (sekolah, kelompok, cek, ok, rincian) values (p_sek, p_kel, p_cek, coalesce(p_ok, false), p_rinci) $$;
create or replace function pg_temp.rp(n numeric) returns text language sql immutable as $$
  select 'Rp' || replace(to_char(coalesce(n, 0), 'FM999,999,999,990'), ',', '.') $$;

do $$
declare
  v_saring text := '%';             -- ← contoh: 'UJI CONTOH%' untuk satu sekolah saja
  s      record;
  akun   uuid;
  kini   text := tahun_ajaran_berjalan();
  hari   date := (now() at time zone 'Asia/Jakarta')::date;
  bln    int;
  ta     text;
  L      jsonb;
  Ldpn   jsonb;
  d      jsonb;
  v      jsonb;
  x      record;
  m      date;
  n1 numeric; n2 numeric; n3 numeric; n4 numeric; n5 numeric;
  t1 text;
  mulai_kas date;
begin
  for s in select k.* from sekolah k where k.nama like v_saring order by k.nama loop
    select p.id into akun from profil p where p.sekolah_id = s.id and p.aktif order by (p.peran = 'kepala') desc, p.dibuat_pada limit 1;
    if akun is null then
      perform pg_temp.catat(s.nama, '-', 'Ada akun staf untuk memeriksa', false, 'sekolah ini belum punya akun — dilewati');
      continue;
    end if;
    -- menyamar sebagai kepala sekolah itu (semua laporan dibaca dengan hak aksesnya)
    perform set_config('request.jwt.claims', json_build_object('sub', akun, 'role', 'authenticated')::text, true);
    bln := ai_indeks_bulan(hari) + case when hari > ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', hari)::date) then 1 else 0 end;
    select g.mulai into mulai_kas from kas_pengaturan g where g.sekolah_id = s.id;

    -- ================= A. Laporan › Tahunan, tiap tahun ajaran =================
    for d in select e from jsonb_array_elements(daftar_tahun_ajaran()) e loop
      ta := d ->> 'kode';
      L := laporan_tahunan(ta);

      -- A1 SPP terkumpul
      select coalesce(sum(nominal), 0) into n1 from pembayaran where sekolah_id = s.id and jenis = 'spp' and tahun_ajaran = ta;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'SPP terkumpul = semua pembayaran SPP tahun itu',
        (L -> 'spp' ->> 'masuk')::numeric = n1 and (d ->> 'sppMasuk')::numeric = n1,
        format('laporan %s · daftar tahun %s · transaksi %s', pg_temp.rp((L -> 'spp' ->> 'masuk')::numeric), pg_temp.rp((d ->> 'sppMasuk')::numeric), pg_temp.rp(n1)));

      -- A2 target SPP = tarif kelas × bulan terdaftar
      select coalesce(sum(spp_target(st.siswa_id, ta, g.i)), 0) into n1
        from siswa_tahun st cross join generate_series(0, 11) g(i)
       where st.sekolah_id = s.id and st.tahun_ajaran = ta;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Target SPP = tarif kelas × bulan terdaftar',
        (L -> 'spp' ->> 'target')::numeric = n1 and (d ->> 'sppTarget')::numeric = n1,
        format('laporan %s · daftar tahun %s · hitung ulang %s', pg_temp.rp((L -> 'spp' ->> 'target')::numeric), pg_temp.rp((d ->> 'sppTarget')::numeric), pg_temp.rp(n1)));

      -- A3 tunggakan SPP (tahun lalu: semua bulan; tahun ini: bulan yang sudah lewat — sama dengan menu Tagihan)
      select coalesce(sum(greatest(0, t.target - t.bayar)), 0) into n1 from (
        select spp_target(st.siswa_id, ta, g.i) target,
               coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp'
                          and p.tahun_ajaran = ta and p.periode = g.i), 0) bayar
          from siswa_tahun st cross join generate_series(0, 11) g(i)
         where st.sekolah_id = s.id and st.tahun_ajaran = ta and (ta < kini or g.i < ai_indeks_bulan(hari))) t;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Tunggakan SPP',
        (L -> 'spp' ->> 'tunggakan')::numeric = n1 and (L -> 'tunggakan' ->> 'spp')::numeric = n1,
        format('laporan %s / daftar menunggak %s · hitung ulang %s', pg_temp.rp((L -> 'spp' ->> 'tunggakan')::numeric),
               pg_temp.rp((L -> 'tunggakan' ->> 'spp')::numeric), pg_temp.rp(n1)));

      -- A4 rincian per kelas & per bulan = total
      select coalesce(sum((e ->> 'target')::numeric), 0), coalesce(sum((e ->> 'masuk')::numeric), 0), coalesce(sum((e ->> 'tunggakan')::numeric), 0)
        into n1, n2, n3 from jsonb_array_elements(L -> 'spp' -> 'perKelas') e;
      select coalesce(sum((e ->> 'target')::numeric), 0), coalesce(sum((e ->> 'masuk')::numeric), 0) into n4, n5
        from jsonb_array_elements(L -> 'spp' -> 'perBulan') e;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Rincian per kelas & per bulan = total',
        n1 = (L -> 'spp' ->> 'target')::numeric and n2 = (L -> 'spp' ->> 'masuk')::numeric and n3 = (L -> 'spp' ->> 'tunggakan')::numeric
          and n4 = (L -> 'spp' ->> 'target')::numeric and n5 = (L -> 'spp' ->> 'masuk')::numeric,
        format('per kelas: target %s masuk %s tunggakan %s · per bulan: target %s masuk %s', pg_temp.rp(n1), pg_temp.rp(n2), pg_temp.rp(n3), pg_temp.rp(n4), pg_temp.rp(n5)));

      -- A5 kegiatan: semua kegiatan tahun itu tampil & uangnya sama
      select count(*), count(*) filter (where (e ->> 'masuk')::numeric is distinct from
               (select coalesce(sum(p.nominal), 0) from pembayaran p where p.biaya_id = (e ->> 'id')::uuid and p.jenis = 'kegiatan'))
        into n1, n2 from jsonb_array_elements(L -> 'kegiatan') e;
      select count(*) into n3 from biaya b where b.sekolah_id = s.id and b.tahun_ajaran = ta and b.aktif;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Kegiatan: semua tampil & uang masuk sama',
        n1 = n3 and n2 = 0, format('%s kegiatan di laporan, %s di data, %s yang uangnya beda', n1, n3, n2));

      -- A6 tunggakan kegiatan (tahun lalu: semua; tahun ini: yang tanggalnya sudah lewat)
      select coalesce(sum(greatest(0, b.nominal - coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id
                       and p.jenis = 'kegiatan' and p.biaya_id = b.id), 0))), 0) into n1
        from biaya b join siswa_tahun st on st.sekolah_id = b.sekolah_id and st.tahun_ajaran = b.tahun_ajaran
       where b.sekolah_id = s.id and b.tahun_ajaran = ta and b.aktif and kegiatan_wajib(st.siswa_id, b.id)
         and (ta < kini or (b.tanggal is not null and b.tanggal < hari));
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Tunggakan kegiatan',
        (L -> 'tunggakan' ->> 'kegiatan')::numeric = n1,
        format('laporan %s · hitung ulang %s', pg_temp.rp((L -> 'tunggakan' ->> 'kegiatan')::numeric), pg_temp.rp(n1)));

      -- A7 PMB & daftar ulang
      select count(*) filter (where (e ->> 'masuk')::numeric is distinct from
               (select coalesce(sum(p.nominal), 0) from pembayaran p where p.paket_id = (e ->> 'id')::uuid and p.jenis = 'paket'))
        into n1 from jsonb_array_elements(L -> 'paket') e;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'PMB & daftar ulang: uang masuk sama', n1 = 0, format('%s paket yang angkanya beda', n1));

      -- A8 buku kas tahunan = jumlah laporan bulanan
      if L -> 'kas' is not null and jsonb_typeof(L -> 'kas') = 'object' and mulai_kas is not null and mulai_kas <= (L ->> 'sampai')::date then
        select coalesce(sum((kas_laporan_bulan(to_char(m2, 'YYYY-MM')) ->> 'totalMasuk')::numeric), 0),
               coalesce(sum((kas_laporan_bulan(to_char(m2, 'YYYY-MM')) ->> 'totalKeluar')::numeric), 0)
          into n1, n2
          from generate_series(date_trunc('month', (L ->> 'mulai')::date), date_trunc('month', (L ->> 'sampai')::date), interval '1 month') m2;
        perform pg_temp.catat(s.nama, 'A ' || ta, 'Buku kas tahunan = jumlah 12 laporan bulanan',
          (L -> 'kas' ->> 'masuk')::numeric = n1 and (L -> 'kas' ->> 'keluar')::numeric = n2,
          format('tahunan masuk %s keluar %s · bulanan masuk %s keluar %s', pg_temp.rp((L -> 'kas' ->> 'masuk')::numeric),
                 pg_temp.rp((L -> 'kas' ->> 'keluar')::numeric), pg_temp.rp(n1), pg_temp.rp(n2)));
        n3 := kas_saldo_per(s.id, (L ->> 'sampai')::date);
        perform pg_temp.catat(s.nama, 'A ' || ta, 'Saldo akhir = saldo kas pada tanggal itu',
          (L -> 'kas' ->> 'saldoAkhir')::numeric = n3
            and (L -> 'kas' ->> 'saldoAkhir')::numeric = (L -> 'kas' ->> 'saldoAwal')::numeric + (L -> 'kas' ->> 'masuk')::numeric - (L -> 'kas' ->> 'keluar')::numeric,
          format('saldo awal %s + masuk − keluar → %s · saldo kas %s', pg_temp.rp((L -> 'kas' ->> 'saldoAwal')::numeric),
                 pg_temp.rp((L -> 'kas' ->> 'saldoAkhir')::numeric), pg_temp.rp(n3)));
        if ta < kini then
          Ldpn := laporan_tahunan(ta_geser(ta, 1));
          perform pg_temp.catat(s.nama, 'A ' || ta, 'Saldo akhir tahun = saldo awal tahun berikutnya',
            (L -> 'kas' ->> 'saldoAkhir')::numeric = (Ldpn -> 'kas' ->> 'saldoAwal')::numeric,
            format('%s → %s', pg_temp.rp((L -> 'kas' ->> 'saldoAkhir')::numeric), pg_temp.rp((Ldpn -> 'kas' ->> 'saldoAwal')::numeric)));
        end if;
      end if;

      -- A9 jumlah siswa
      select count(*) into n1 from siswa_tahun where sekolah_id = s.id and tahun_ajaran = ta;
      perform pg_temp.catat(s.nama, 'A ' || ta, 'Jumlah siswa terdaftar',
        (L -> 'siswa' ->> 'jumlah')::numeric = n1 and (d ->> 'siswa')::numeric = n1,
        format('laporan %s · daftar tahun %s · data %s', L -> 'siswa' ->> 'jumlah', d ->> 'siswa', n1));
    end loop;

    -- ================= B. Laporan keuangan bulanan (sejak kas dicatat) =================
    if mulai_kas is not null then
      n4 := null; t1 := '';
      for m in select generate_series(date_trunc('month', mulai_kas), date_trunc('month', hari), interval '1 month')::date loop
        v := kas_laporan_bulan(to_char(m, 'YYYY-MM'));
        select coalesce(sum(nominal), 0) into n1 from pembayaran p
         where p.sekolah_id = s.id and (p.dibayar_pada at time zone 'Asia/Jakarta')::date between greatest(m, mulai_kas) and (m + interval '1 month - 1 day')::date;
        select coalesce(sum(nominal) filter (where jenis = 'masuk'), 0), coalesce(sum(nominal) filter (where jenis = 'keluar'), 0) into n2, n3
          from kas k where k.sekolah_id = s.id and k.dibatalkan_pada is null and k.tanggal between greatest(m, mulai_kas) and (m + interval '1 month - 1 day')::date;
        if (v ->> 'totalMasuk')::numeric <> n1 + n2 or (v ->> 'totalKeluar')::numeric <> n3 then
          t1 := t1 || format('%s: laporan masuk %s keluar %s, transaksi masuk %s keluar %s; ', to_char(m, 'YYYY-MM'),
                  pg_temp.rp((v ->> 'totalMasuk')::numeric), pg_temp.rp((v ->> 'totalKeluar')::numeric), pg_temp.rp(n1 + n2), pg_temp.rp(n3));
        end if;
        if n4 is not null and (v ->> 'saldoAwal')::numeric <> n4 then
          t1 := t1 || format('%s: saldo awal %s ≠ saldo akhir bulan lalu %s; ', to_char(m, 'YYYY-MM'), pg_temp.rp((v ->> 'saldoAwal')::numeric), pg_temp.rp(n4));
        end if;
        if (v ->> 'saldoAkhir')::numeric <> kas_saldo_per(s.id, least(hari, (m + interval '1 month - 1 day')::date)) then
          t1 := t1 || format('%s: saldo akhir %s ≠ saldo kas %s; ', to_char(m, 'YYYY-MM'), pg_temp.rp((v ->> 'saldoAkhir')::numeric),
                  pg_temp.rp(kas_saldo_per(s.id, least(hari, (m + interval '1 month - 1 day')::date))));
        end if;
        n4 := (v ->> 'saldoAkhir')::numeric;
      end loop;
      perform pg_temp.catat(s.nama, 'B kas bulanan', 'Laporan bulanan: masuk/keluar = transaksi, saldo berantai',
        t1 = '', coalesce(nullif(t1, ''), 'semua bulan sejak ' || to_char(mulai_kas, 'YYYY-MM') || ' cocok'));
    end if;

    -- ================= C. Tahun berjalan: SAKU & tagihan =================
    t1 := '';
    for x in select g.i from generate_series(0, least(ai_indeks_bulan(hari), 11)) g(i) loop
      v := ai_status_spp(x.i, null);
      select coalesce(sum(spp_target(st.siswa_id, kini, x.i)), 0),
             coalesce(sum(least(spp_target(st.siswa_id, kini, x.i),
                     coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = kini and p.periode = x.i), 0))), 0)
        into n1, n2
        from siswa_tahun st join siswa z on z.id = st.siswa_id and (z.aktif or z.status_siswa = 'keluar')
       where st.sekolah_id = s.id and st.tahun_ajaran = kini;
      d := ai_rekap_bulan(x.i);
      if (v ->> 'target')::numeric <> n1 or (v ->> 'terkumpul')::numeric <> n2
         or (d -> 'spp_bulan_ini' ->> 'target_rupiah')::numeric <> n1 or (d -> 'spp_bulan_ini' ->> 'sudah_masuk_rupiah')::numeric <> n2 then
        t1 := t1 || format('%s: status SPP %s/%s, rekap %s/%s, hitung ulang %s/%s; ', ai_nama_bulan(x.i),
                pg_temp.rp((v ->> 'terkumpul')::numeric), pg_temp.rp((v ->> 'target')::numeric),
                pg_temp.rp((d -> 'spp_bulan_ini' ->> 'sudah_masuk_rupiah')::numeric), pg_temp.rp((d -> 'spp_bulan_ini' ->> 'target_rupiah')::numeric),
                pg_temp.rp(n2), pg_temp.rp(n1));
      end if;
      -- uang masuk selama bulan kalender itu
      m := make_date(split_part(kini, '/', 1)::int + case when x.i >= 6 then 1 else 0 end, ((x.i + 6) % 12) + 1, 1);
      select coalesce(sum(nominal), 0) into n3 from pembayaran p where p.sekolah_id = s.id
         and (p.dibayar_pada at time zone 'Asia/Jakarta')::date between m and (m + interval '1 month - 1 day')::date;
      -- bulan yang sama di Laporan › Tahunan (tahun ini)
      select (e ->> 'target')::numeric, (e ->> 'masuk')::numeric into n4, n5
        from jsonb_array_elements(laporan_tahunan(kini) -> 'spp' -> 'perBulan') e where (e ->> 'i')::int = x.i;
      if n4 <> (v ->> 'target')::numeric or n5 <> (v ->> 'terkumpul')::numeric then
        t1 := t1 || format('%s: Laporan › Tahunan %s/%s ≠ status SPP %s/%s; ', ai_nama_bulan(x.i), pg_temp.rp(n5), pg_temp.rp(n4),
                pg_temp.rp((v ->> 'terkumpul')::numeric), pg_temp.rp((v ->> 'target')::numeric));
      end if;
      if (d -> 'uang_masuk_selama_bulan_ini' ->> 'total')::numeric <> n3 then
        t1 := t1 || format('%s: uang masuk SAKU %s, transaksi %s; ', ai_nama_bulan(x.i), pg_temp.rp((d -> 'uang_masuk_selama_bulan_ini' ->> 'total')::numeric), pg_temp.rp(n3));
      end if;
    end loop;
    perform pg_temp.catat(s.nama, 'C tahun ini', 'SAKU rekap bulan & status SPP tiap bulan = transaksi', t1 = '', nullif(t1, ''));

    -- tunggakan tahun ini yang perlu dibayar sekarang (dipakai Tagihan, Beranda, SAKU daftar tunggakan)
    v := ai_daftar_tunggakan(null, null, 0, false);
    select coalesce(sum(greatest(0, spp_target(st.siswa_id, kini, g.i)
             - coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = kini and p.periode = g.i), 0))), 0)
      into n1
      from siswa_tahun st join siswa z on z.id = st.siswa_id and (z.aktif or z.status_siswa = 'keluar') cross join generate_series(0, 11) g(i)
     where st.sekolah_id = s.id and st.tahun_ajaran = kini and g.i < bln;
    perform pg_temp.catat(s.nama, 'C tahun ini', 'SAKU daftar tunggakan = SPP yang perlu dibayar sekarang (bulan lalu + bulan ini lewat jatuh tempo)',
      (v ->> 'total_kurang_spp_rupiah')::numeric = n1,
      format('SAKU %s · hitung ulang %s', pg_temp.rp((v ->> 'total_kurang_spp_rupiah')::numeric), pg_temp.rp(n1)));

    -- tunggakan tahun lalu: SAKU = jumlah dari Laporan › Tahunan tiap tahun yang sudah lewat
    v := ai_tunggakan_lalu(null, null);
    select coalesce(sum((laporan_tahunan(e ->> 'kode') -> 'tunggakan' ->> 'spp')::numeric + (laporan_tahunan(e ->> 'kode') -> 'tunggakan' ->> 'kegiatan')::numeric), 0)
      into n1 from jsonb_array_elements(daftar_tahun_ajaran()) e where e ->> 'kode' < kini;
    perform pg_temp.catat(s.nama, 'C tahun ini', 'SAKU tunggakan tahun lalu = Laporan › Tahunan tahun-tahun lalu',
      (v ->> 'total_kurang_rupiah')::numeric = n1,
      format('SAKU %s · laporan tahunan %s', pg_temp.rp((v ->> 'total_kurang_rupiah')::numeric), pg_temp.rp(n1)));

    -- ================= D. Data yang ditarik saat aplikasi dibuka =================
    select count(*) into n1 from pembayaran p where p.sekolah_id = s.id
       and (p.dibayar_pada >= (make_date(split_part(kini, '/', 1)::int, 7, 1)::timestamp at time zone 'Asia/Jakarta') or (p.jenis = 'spp' and p.tahun_ajaran >= kini))
       and not exists (select 1 from pembayaran_dimuat() q where q.id = p.id);
    perform pg_temp.catat(s.nama, 'D aplikasi dibuka', 'Semua pembayaran tahun ini ikut termuat', n1 = 0, format('%s pembayaran tertinggal', n1));

    v := ringkasan_tunggakan_lalu();
    -- setiap bulan lama siswa aktif / keluar tahun ini: (ada di ringkasan dengan angka dibayar yang benar) ⇔ (belum lunas)
    select count(*) into n1 from (
      select st.siswa_id, st.tahun_ajaran, g.i, spp_target(st.siswa_id, st.tahun_ajaran, g.i) target,
             coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = st.tahun_ajaran and p.periode = g.i), 0) bayar,
             (select (e ->> 3)::numeric from jsonb_array_elements(v -> 'spp') e
               where (e ->> 0)::uuid = st.siswa_id and e ->> 1 = st.tahun_ajaran and (e ->> 2)::int = g.i) ringkas
        from siswa_tahun st join siswa z on z.id = st.siswa_id and (z.aktif or (z.status_siswa = 'keluar' and exists (select 1 from siswa_tahun y where y.siswa_id = z.id and y.tahun_ajaran = kini))) cross join generate_series(0, 11) g(i)
       where st.sekolah_id = s.id and st.tahun_ajaran < kini) q
     where q.target > 0 and ((q.bayar < q.target) is distinct from (q.ringkas is not null) or (q.ringkas is not null and q.ringkas <> q.bayar));
    select count(*) into n2 from (
      select b.id, st.siswa_id, b.nominal,
             coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'kegiatan' and p.biaya_id = b.id), 0) bayar,
             (select (e ->> 2)::numeric from jsonb_array_elements(v -> 'kegiatan') e where (e ->> 0)::uuid = st.siswa_id and (e ->> 1)::uuid = b.id) ringkas
        from biaya b join siswa_tahun st on st.sekolah_id = b.sekolah_id and st.tahun_ajaran = b.tahun_ajaran
        join siswa z on z.id = st.siswa_id and (z.aktif or (z.status_siswa = 'keluar' and exists (select 1 from siswa_tahun y where y.siswa_id = z.id and y.tahun_ajaran = kini)))
       where b.sekolah_id = s.id and b.tahun_ajaran < kini and b.aktif and kegiatan_wajib(st.siswa_id, b.id)) q
     where (q.bayar < q.nominal) is distinct from (q.ringkas is not null) or (q.ringkas is not null and q.ringkas <> q.bayar);
    perform pg_temp.catat(s.nama, 'D aplikasi dibuka', 'Ringkasan tunggakan tahun lalu tepat (bulan & kegiatan lama)',
      n1 = 0 and n2 = 0, format('%s bulan SPP & %s kegiatan yang tidak cocok', n1, n2));

    -- ================= E. Tagihan › sudah lulus / keluar =================
    v := tunggakan_nonaktif();
    select coalesce(sum(r.target - r.dibayar), 0), count(distinct r.siswa_id) into n1, n2
      from tunggakan_rinci(s.id, null, true) r join siswa z on z.id = r.siswa_id and z.status_siswa in ('alumni', 'keluar');
    select coalesce(sum((e ->> 'total')::numeric), 0), count(*) into n3, n4 from jsonb_array_elements(v) e;
    perform pg_temp.catat(s.nama, 'E lulus/keluar', 'Daftar lulus/keluar yang menunggak lengkap',
      n1 = n3 and n2 = n4, format('Tagihan %s siswa %s · hitung ulang %s siswa %s', n4, pg_temp.rp(n3), n2, pg_temp.rp(n1)));

    -- ================= F. Portal orang tua =================
    t1 := '';
    for x in select w.id, w.token, (select z.nis from wali_siswa ws join siswa z on z.id = ws.siswa_id where ws.wali_id = w.id
                                      and (z.aktif or siswa_ada_tunggakan(z.id)) order by z.nis limit 1) nis
               from wali w where w.sekolah_id = s.id order by w.id limit 40 loop
      continue when x.nis is null;
      v := portal_wali(x.token, x.nis);
      if v ? 'gerbang' then t1 := t1 || 'NIS ditolak untuk satu wali; '; continue; end if;
      select count(*) into n1 from wali_siswa ws join siswa z on z.id = ws.siswa_id
       where ws.wali_id = x.id and (z.aktif or siswa_ada_tunggakan(z.id));
      select coalesce(sum(p.nominal), 0) into n2 from pembayaran p join wali_siswa ws on ws.siswa_id = p.siswa_id where ws.wali_id = x.id;
      select coalesce(sum((e ->> 'nominal')::numeric), 0) into n3 from jsonb_array_elements(v -> 'pembayaran') e;
      if jsonb_array_length(v -> 'siswa') <> n1 or n2 <> n3 then
        t1 := t1 || format('wali %s: anak %s/%s, pembayaran %s/%s; ', left(x.id::text, 8), jsonb_array_length(v -> 'siswa'), n1, pg_temp.rp(n3), pg_temp.rp(n2));
      end if;
    end loop;
    perform pg_temp.catat(s.nama, 'F portal', 'Portal: anak yang tampil & pembayarannya', t1 = '', nullif(t1, ''));

    -- ================= G. Kerapian data =================
    select count(*) into n1 from (
      select p.siswa_id, p.tahun_ajaran, p.periode, sum(p.nominal) bayar from pembayaran p
       where p.sekolah_id = s.id and p.jenis = 'spp' group by 1, 2, 3) q
     where q.bayar > spp_target(q.siswa_id, q.tahun_ajaran, q.periode);
    select count(*) into n2 from (
      select p.siswa_id, p.biaya_id, sum(p.nominal) bayar from pembayaran p where p.sekolah_id = s.id and p.jenis = 'kegiatan' group by 1, 2) q
      join biaya b on b.id = q.biaya_id
     where q.bayar > b.nominal or not kegiatan_wajib(q.siswa_id, q.biaya_id);
    select count(*) into n3 from (
      select p.siswa_id, p.paket_id, sum(p.nominal) bayar from pembayaran p where p.sekolah_id = s.id and p.jenis = 'paket' group by 1, 2) q
      join paket_biaya k on k.id = q.paket_id where q.bayar > k.total;
    perform pg_temp.catat(s.nama, 'G kerapian', 'Tidak ada tagihan terbayar melebihi nominal / di luar masa terdaftar',
      n1 = 0 and n2 = 0 and n3 = 0, format('SPP %s · kegiatan %s · paket %s', n1, n2, n3));
    select count(*) into n1 from siswa z where z.sekolah_id = s.id and z.aktif
       and not exists (select 1 from siswa_tahun st where st.siswa_id = z.id and st.tahun_ajaran >= kini);
    select count(*) into n2 from siswa z join siswa_tahun st on st.siswa_id = z.id and st.tahun_ajaran = kini
     where z.sekolah_id = s.id and z.aktif and z.kelas <> st.kelas;
    perform pg_temp.catat(s.nama, 'G kerapian', 'Siswa aktif terdaftar di tahun ini & kelasnya sama',
      n1 = 0 and n2 = 0, format('%s siswa aktif tanpa tahun ajaran · %s kelas beda', n1, n2));

    -- ================= H. Kuitansi (10 pembayaran terakhir) =================
    select count(*) into n1 from (select p.* from pembayaran p where p.sekolah_id = s.id order by p.dibayar_pada desc limit 10) p
     where (data_kuitansi(p.id) ->> 'nominal')::numeric is distinct from p.nominal;
    perform pg_temp.catat(s.nama, 'H kuitansi', 'Kuitansi: nominal sama dengan transaksi', n1 = 0, format('%s kuitansi beda', n1));
  end loop;
end $$;

-- ---------- hasil ----------
select case when count(*) = 0 then 'TIDAK ADA DATA' when bool_and(ok) then 'LULUS' else 'ADA YANG GAGAL' end as hasil,
       count(*) as pemeriksaan, count(*) filter (where not ok) as gagal, count(distinct sekolah) as sekolah,
       case when count(*) = 0 then 'Belum ada sekolah yang cocok dengan v_saring (atau belum ada data sama sekali)'
            when bool_and(ok) then 'Semua angka laporan cocok dengan data transaksi'
            else 'Lihat baris GAGAL di tabel berikutnya (jalankan bagian bawah saja kalau editor hanya menampilkan satu tabel)' end as catatan
  from cek_hasil;

select sekolah, kelompok, cek, case when ok then 'LULUS' else 'GAGAL' end as hasil, rincian
  from cek_hasil
 order by ok, sekolah, urut;

rollback;
