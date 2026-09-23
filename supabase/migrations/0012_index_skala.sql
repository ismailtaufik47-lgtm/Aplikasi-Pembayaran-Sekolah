-- =====================================================================
-- Index tambahan untuk skala ratusan sekolah aktif.
--
-- Catatan penting soal KAPAN index dibutuhkan: bukan soal seberapa
-- SERING transaksi tercatat (SPP/kegiatan memang tidak sesering
-- tabungan harian), tapi soal SEBERAPA BESAR tabel dan POLA QUERY-nya.
-- Tiap kali guru buka aplikasi, SEMUA data sekolahnya (siswa, biaya,
-- pembayaran) dimuat sekaligus lalu diproses di browser — jadi yang
-- menentukan cepat/lambat adalah: "seberapa cepat Postgres menemukan
-- baris-baris milik SATU sekolah dari total baris SEMUA sekolah". Tanpa
-- index yang tepat, itu jadi sequential scan (baca satu-satu) yang
-- makin lambat seiring makin banyak sekolah. Dengan index yang tepat,
-- pencarian tetap cepat (index scan) walau ada ratusan sekolah lain.
--
-- Dua index di bawah melengkapi yang sudah ada sejak migrasi awal
-- (0001_skema.sql sudah mengindex sekolah_id di semua tabel utama).
-- =====================================================================

-- Tab Alumni (DaftarSiswa.jsx) query: WHERE sekolah_id = ? AND status_siswa = 'alumni'.
-- Index lama siswa_sekolah_idx(sekolah_id, kelas) cuma bantu sebagian
-- (prefix sekolah_id-nya), tapi filter status_siswa masih harus
-- disaring manual dari situ. Index khusus ini membuat query alumni
-- langsung index scan penuh, bukan setengah-setengah.
create index if not exists siswa_status_idx on siswa(sekolah_id, status_siswa);

-- ambilLinkWali() dan sinkronisasi nama wali di ubahSiswa() sama-sama
-- query wali_siswa DENGAN ARAH TERBALIK dari primary key-nya (primary
-- key wali_siswa itu (wali_id, siswa_id) — cuma optimal kalau dicari
-- mulai dari wali_id). Tapi kedua fungsi itu mencari .eq('siswa_id', ..),
-- dan ambilLinkWali() dipanggil TIAP KALI kartu siswa dibuka (buat
-- tombol "Kirim ke WA orang tua") — jalur yang cukup sering diakses.
create index if not exists wali_siswa_siswa_idx on wali_siswa(siswa_id);
