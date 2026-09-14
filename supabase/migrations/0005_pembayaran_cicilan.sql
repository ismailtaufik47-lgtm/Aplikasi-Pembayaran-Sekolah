-- =====================================================================
-- Izinkan pembayaran sebagian (cicilan).
--
-- Sebelumnya satu siswa hanya boleh punya SATU baris pembayaran per
-- bulan SPP dan per kegiatan (indeks unik di 0001_skema.sql) — cocok
-- untuk "sekali bayar lunas", tapi menolak transaksi kedua kalau guru
-- mau mencatat cicilan (mis. bayar Rp100.000 dulu, Rp50.000 menyusul).
--
-- Sejak migrasi ini, satu bulan/kegiatan boleh punya beberapa baris
-- pembayaran. "Sudah dibayar" dihitung dari JUMLAH semua baris itu
-- (dilakukan di aplikasi, lihat bentuk() di src/lib/api.js), dan
-- "lunas" berarti jumlahnya sudah mencapai nominal target — bukan lagi
-- sekadar "ada satu baris pembayaran".
-- =====================================================================

drop index if exists pembayaran_spp_unik;
drop index if exists pembayaran_kegiatan_unik;

comment on table pembayaran is
$$Satu baris = satu transaksi. Satu bulan SPP atau satu kegiatan boleh
punya beberapa baris (cicilan) — jumlahkan nominal untuk tahu status
lunas/sebagian, jangan asumsikan satu baris = satu periode.$$;
