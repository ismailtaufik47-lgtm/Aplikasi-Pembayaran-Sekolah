-- =====================================================================
-- 0021: jatuh tempo SPP boleh "akhir bulan".
--
-- tanggal_jatuh_tempo sekarang 1–28 (tanggal tetap) atau 31 yang
-- berarti AKHIR BULAN. Aplikasi otomatis menyesuaikan dengan jumlah
-- hari tiap bulan: 30 September, 31 Oktober, 28/29 Februari, dst.
-- (Nilai 29–30 juga diterima dan diperlakukan sama: mentok di hari
-- terakhir bulan pendek, tapi dari aplikasi yang tersimpan hanya 1–28
-- atau 31.)
--
-- Jalankan SETELAH 0020. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

alter table sekolah drop constraint if exists sekolah_tanggal_jatuh_tempo_check;
alter table sekolah add constraint sekolah_tanggal_jatuh_tempo_check
  check (tanggal_jatuh_tempo between 1 and 31);

comment on column sekolah.tanggal_jatuh_tempo is
  'Tanggal jatuh tempo SPP tiap bulan: 1–28, atau 31 = akhir bulan (menyesuaikan jumlah hari bulan itu).';
