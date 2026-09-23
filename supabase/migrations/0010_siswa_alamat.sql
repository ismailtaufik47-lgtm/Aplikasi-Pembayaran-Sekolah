-- Tambah kolom alamat ke tabel siswa.
-- Opsional (nullable) — sekolah yang tidak pakai tidak perlu khawatir.
alter table siswa add column if not exists alamat text;
comment on column siswa.alamat is 'Alamat rumah siswa — opsional, untuk keperluan administrasi sekolah.';
