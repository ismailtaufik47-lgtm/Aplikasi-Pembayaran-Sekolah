-- =====================================================================
-- 0039 — Hasil uji beban & isolasi 100 sekolah (lihat folder uji/)
--
--  1. Indeks pembayaran per siswa.
--     Tanpa indeks ini, setiap kali mencatat pembayaran, membuka portal wali,
--     membuat kuitansi, atau bertanya ke Tanya SAKU, database membaca SELURUH
--     pembayaran SEMUA sekolah. Diukur dengan 100 sekolah / 78 ribu pembayaran:
--        Tanya SAKU "daftar tunggakan"  6.955 ms → 33 ms
--        portal wali dibuka               31 ms → 2 ms
--        catat pembayaran                 16 ms → 1 ms
--        kuitansi                         13 ms → 1 ms
--     Makin banyak sekolah, makin lambat — indeks ini membuatnya tetap cepat.
--
--  2. Dua fungsi internal tidak boleh dipanggil langsung dari internet:
--     • data_kuitansi(id)    — isi kuitansi LENGKAP (nama siswa, NIS, nama wali,
--                              nominal) bisa dibuka siapa saja, bahkan tanpa login,
--                              asal tahu ID pembayaran (ID itu ada di QR kuitansi).
--                              Aplikasi memakai kuitansi_staf() / kuitansi_portal()
--                              yang memeriksa pemiliknya — keduanya tetap jalan.
--     • nama_dari_google(id) — nama akun mana pun bisa dibaca dari ID-nya.
--     QR "cek keaslian kuitansi" (verifikasi_dokumen) tetap terbuka seperti biasa.
--
--  Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================

create index if not exists pembayaran_siswa_jenis_idx on pembayaran (siswa_id, jenis);
analyze pembayaran;

revoke execute on function data_kuitansi(uuid) from public, anon, authenticated;
revoke execute on function nama_dari_google(uuid) from public, anon, authenticated;
