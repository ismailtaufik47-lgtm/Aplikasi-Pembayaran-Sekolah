-- =====================================================================
-- 07b — HAPUS SEKOLAH CONTOH (dibuat oleh 07_sekolah_contoh_3_tahun.sql)
--
--  Menghapus HANYA "UJI CONTOH TK Pelangi" beserta seluruh isinya (siswa,
--  pembayaran, kas, wali, paket, riwayat) dan 2 akun loginnya
--  (uji-contoh-kepala@contoh.test, uji-contoh-admin@contoh.test).
--  Sekolah lain — termasuk sekolah UJI 001–020 untuk uji beban — tidak disentuh.
--
--  Setelah dihapus, 07 boleh dijalankan lagi untuk membuat ulang sekolah contoh
--  dengan tanggal yang mengikuti hari ini.
-- =====================================================================

begin;

create temp table sk_contoh on commit drop as
  select id from sekolah where id = md5('kasceria-contoh-sekolah')::uuid and nama like 'UJI CONTOH%';

-- urutan penting: pembayaran dulu (biaya & paket tidak boleh dihapus selama
-- masih ada pembayarannya), lalu peserta paket, baru sekolahnya.
delete from pembayaran       where sekolah_id in (select id from sk_contoh);
delete from pembayaran_batal where sekolah_id in (select id from sk_contoh);
delete from kas              where sekolah_id in (select id from sk_contoh);
delete from paket_siswa      where sekolah_id in (select id from sk_contoh);
delete from sekolah          where id in (select id from sk_contoh);   -- sisanya ikut terhapus (on delete cascade)

delete from auth.users where email like 'uji-contoh-%@contoh.test';

select (select count(*) from sk_contoh) as sekolah_contoh_dihapus,
       (select count(*) from sekolah where id = md5('kasceria-contoh-sekolah')::uuid) as sisa_sekolah_contoh,
       (select count(*) from auth.users where email like 'uji-contoh-%@contoh.test') as sisa_akun_contoh,
       (select count(*) from sekolah where nama like 'UJI %') as sekolah_uji_lain_tetap_ada;

commit;
