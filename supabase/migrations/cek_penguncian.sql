-- =====================================================================
-- CEK SAJA (tidak mengubah apa pun) — jalankan di SQL Editor Supabase
-- untuk mencari tahu kenapa siswa/pembayaran masih bisa dicatat walau
-- langganan sudah kadaluarsa.
-- =====================================================================

-- 1) Apakah trigger penguncian benar-benar ada & aktif?
--    Harus muncul 2 baris: siswa_cek_langganan & pembayaran_cek_langganan,
--    kolom tgenabled = 'O' (artinya aktif/Origin).
select tgname as nama_trigger, tgrelid::regclass as tabel, tgenabled as aktif
from pg_trigger
where tgname in ('siswa_cek_langganan', 'pembayaran_cek_langganan');

-- 2) Status setiap sekolah saat ini menurut perhitungan yang sama
--    dipakai trigger — cek sekolah yang Anda pakai untuk tes.
select id, nama, trial_mulai, langganan_sampai,
       hitung_status_langganan(trial_mulai, langganan_sampai) as detail
from sekolah
order by dibuat_pada desc;
