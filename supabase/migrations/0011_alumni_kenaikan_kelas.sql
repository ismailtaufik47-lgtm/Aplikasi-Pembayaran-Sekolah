-- =====================================================================
-- Alumni & Kenaikan Kelas
--
-- Strategi: siswa tidak pernah dihapus dari database. Status membedakan:
--   'aktif'  — siswa yang sedang bersekolah (default existing data)
--   'alumni' — sudah lulus, tersembunyi di daftar aktif tapi tetap bisa
--              dilihat di tab Alumni dan riwayat pembayarannya utuh
--
-- Kolom `aktif` (boolean) tetap dipertahankan agar kode lama tidak
-- rusak — nilainya di-sync otomatis lewat trigger setiap kali
-- `status_siswa` diubah.
-- =====================================================================

alter table siswa add column if not exists status_siswa text
  not null default 'aktif'
  check (status_siswa in ('aktif', 'alumni'));

alter table siswa add column if not exists tahun_lulus text;

comment on column siswa.status_siswa is
  'aktif = sedang bersekolah; alumni = sudah lulus (tetap bisa dilihat & riwayat pembayaran utuh)';
comment on column siswa.tahun_lulus is
  'Tahun ajaran saat lulus, mis: 2026/2027. Diisi otomatis saat proses kelulusan.';

-- Sync kolom `aktif` yang lama supaya query lama tetap jalan
update siswa set status_siswa = 'aktif' where aktif = true;

create or replace function sync_aktif_dari_status()
returns trigger language plpgsql as $$
begin
  new.aktif := (new.status_siswa = 'aktif');
  return new;
end $$;

drop trigger if exists siswa_sync_aktif on siswa;
create trigger siswa_sync_aktif
  before insert or update of status_siswa on siswa
  for each row execute function sync_aktif_dari_status();
