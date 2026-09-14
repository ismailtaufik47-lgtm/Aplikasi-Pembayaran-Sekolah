-- =====================================================================
-- Data contoh satu sekolah. Jalankan setelah 0001 dan 0002.
-- Aman dijalankan ulang: data lama sekolah dengan nama sama dihapus dulu.
-- =====================================================================
do $$
declare
  s_id  uuid;
  w_id  uuid;
  b     record;
  murid record;
begin
  delete from sekolah where nama = 'TK Tunas Ceria';

  insert into sekolah (nama, tahun_ajaran, spp_nominal, tanggal_jatuh_tempo, rekening)
  values (
    'TK Tunas Ceria', '2026/2027', 150000, 10,
    '[{"bank":"BSI","nomor":"7123 4567 89","atasNama":"Yayasan Tunas Ceria"},
      {"bank":"BJB","nomor":"0045 8891 2","atasNama":"Yayasan Tunas Ceria"}]'::jsonb
  ) returning id into s_id;

  insert into biaya (sekolah_id, nama, nominal, urutan) values
    (s_id, 'PMB', 350000, 1),
    (s_id, 'Dana usaha', 100000, 2),
    (s_id, 'Manasik haji', 150000, 3),
    (s_id, 'Outing class', 200000, 4),
    (s_id, 'Pas foto', 20000, 5),
    (s_id, 'Pentas seni', 185000, 6),
    (s_id, 'Aksera / porseni', 75000, 7),
    (s_id, 'Peduli ramadhan', 50000, 8);

  insert into siswa (sekolah_id, nama, panggilan, jenis_kelamin, kelas, nis, wali, hp, guru, avatar) values
    (s_id, 'Aisyah Nur Fadilah',     'Aisyah', 'P', 'A', '2026-001', 'Ibu Wulan',    '081211223344', 'Bu Rina',  0),
    (s_id, 'Muhammad Zidan',         'Zidan',  'L', 'A', '2026-002', 'Bapak Hendra', '081355667788', 'Bu Rina',  2),
    (s_id, 'Qaisha Putri Maheswari', 'Qaisha', 'P', 'A', '2026-004', 'Bapak Aditya', '083877882211', 'Bu Rina',  4),
    (s_id, 'Arkan Zaidan Fadilah',   'Arkan',  'L', 'B', '2026-009', 'Ibu Wulan',    '081211223344', 'Bu Yanti', 1),
    (s_id, 'Raffasya Putra',         'Raffa',  'L', 'B', '2026-011', 'Ibu Sari',     '082144331122', 'Bu Yanti', 3),
    (s_id, 'Khansa Aulia',           'Khansa', 'P', 'B', '2026-015', 'Ibu Dewi',     '085722119900', 'Bu Yanti', 2),
    (s_id, 'Zafran Alkhalifi',       'Zafran', 'L', 'B', '2026-018', 'Ibu Ratna',    '085233445566', 'Bu Yanti', 5);

  -- SPP Juli lunas untuk semua siswa kecuali satu
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, keterangan, nominal, metode, petugas, dibayar_pada)
  select s_id, x.id, 'spp', 0, 'SPP bulanan — Juli', 150000, 'Tunai', x.guru, now() - interval '45 days'
  from siswa x where x.sekolah_id = s_id and x.nis <> '2026-018';

  -- SPP Agustus lunas untuk sebagian siswa
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, keterangan, nominal, metode, petugas, dibayar_pada)
  select s_id, x.id, 'spp', 1, 'SPP bulanan — Agustus', 150000, 'Tunai', x.guru, now() - interval '12 days'
  from siswa x where x.sekolah_id = s_id and x.nis in ('2026-004', '2026-009', '2026-011');

  -- semua siswa sudah bayar PMB
  select * into b from biaya where sekolah_id = s_id and nama = 'PMB';
  insert into pembayaran (sekolah_id, siswa_id, jenis, biaya_id, keterangan, nominal, metode, petugas, dibayar_pada)
  select s_id, x.id, 'kegiatan', b.id, 'Biaya kegiatan — PMB', b.nominal, 'Transfer', 'Kantor TK', now() - interval '50 days'
  from siswa x where x.sekolah_id = s_id;

  -- sebagian siswa sudah bayar outing class
  select * into b from biaya where sekolah_id = s_id and nama = 'Outing class';
  insert into pembayaran (sekolah_id, siswa_id, jenis, biaya_id, keterangan, nominal, metode, petugas, dibayar_pada)
  select s_id, x.id, 'kegiatan', b.id, 'Biaya kegiatan — Outing class', b.nominal, 'Transfer', x.guru, now() - interval '30 days'
  from siswa x where x.sekolah_id = s_id and x.kelas = 'A';

  -- satu wali dengan dua anak, untuk mencoba pemilih anak di portal
  insert into wali (sekolah_id, nama, hp, token)
  values (s_id, 'Ibu Wulan', '081211223344', 'demo-wulan')
  returning id into w_id;

  insert into wali_siswa (wali_id, siswa_id)
  select w_id, x.id from siswa x
  where x.sekolah_id = s_id and x.nis in ('2026-001', '2026-009');

  raise notice 'Selesai. Tautan portal orang tua: /ortu/demo-wulan';
end $$;

-- Setelah membuat user staf di Authentication > Users, hubungkan ke sekolah:
--
-- insert into profil (id, sekolah_id, nama, peran)
-- select u.id, s.id, 'Bu Rina', 'admin'
-- from auth.users u, sekolah s
-- where u.email = 'guru@tunasceria.sch.id' and s.nama = 'TK Tunas Ceria';
