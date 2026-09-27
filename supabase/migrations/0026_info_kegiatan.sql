-- =====================================================================
-- 0026 — Info kegiatan untuk orang tua
--
-- Setiap biaya kegiatan (Manasik haji, Porseni, Outing class, …) sekarang
-- bisa diberi keterangan oleh sekolah: tanggal, jam, lokasi, deskripsi,
-- dan barang yang perlu dibawa. Orang tua melihatnya di portal
-- (Tagihan → Biaya kegiatan → ketuk kegiatannya).
--
-- Tidak perlu fungsi/kebijakan baru:
--   • Staf sekolah sudah boleh mengubah baris biaya sekolahnya sendiri
--     (kebijakan biaya_semua di 0002_keamanan.sql).
--   • portal_wali(token) sudah mengirim seluruh kolom biaya lewat
--     to_jsonb(b), jadi kolom baru otomatis ikut terbaca di portal.
--
-- Aman dijalankan berulang kali.
-- =====================================================================

alter table biaya add column if not exists tanggal         date;
alter table biaya add column if not exists tanggal_selesai date;
alter table biaya add column if not exists waktu           text;
alter table biaya add column if not exists lokasi          text;
alter table biaya add column if not exists deskripsi       text;
alter table biaya add column if not exists perlengkapan    text;

comment on column biaya.tanggal         is 'Tanggal pelaksanaan kegiatan (opsional).';
comment on column biaya.tanggal_selesai is 'Tanggal selesai kalau kegiatan lebih dari satu hari (opsional).';
comment on column biaya.waktu           is 'Jam pelaksanaan, teks bebas, mis. "07.30 – 11.00 WIB".';
comment on column biaya.lokasi          is 'Tempat kegiatan, mis. "Lapangan Gasibu, Bandung".';
comment on column biaya.deskripsi       is 'Penjelasan kegiatan untuk orang tua.';
comment on column biaya.perlengkapan    is 'Yang perlu dibawa/dipakai anak, satu baris satu barang.';

-- Batas panjang wajar, supaya portal orang tua tetap ringan dimuat.
alter table biaya drop constraint if exists biaya_info_panjang;
alter table biaya add constraint biaya_info_panjang check (
      coalesce(length(waktu), 0)        <= 60
  and coalesce(length(lokasi), 0)       <= 150
  and coalesce(length(deskripsi), 0)    <= 3000
  and coalesce(length(perlengkapan), 0) <= 1000
);

-- Tanggal selesai hanya boleh diisi kalau tanggal mulai ada, dan tidak
-- boleh lebih awal dari tanggal mulai.
alter table biaya drop constraint if exists biaya_tanggal_urut;
alter table biaya add constraint biaya_tanggal_urut check (
  tanggal_selesai is null or (tanggal is not null and tanggal_selesai >= tanggal)
);
