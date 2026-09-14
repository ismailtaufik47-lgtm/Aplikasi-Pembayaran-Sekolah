-- =====================================================================
-- Kolom avatar pilihan guru.
-- Jalankan hanya kalau database sudah terlanjur dibuat dengan 0001 versi
-- lama; instalasi baru sudah memuat kolom ini.
-- =====================================================================
alter table siswa add column if not exists avatar smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'siswa_avatar_check'
  ) then
    alter table siswa add constraint siswa_avatar_check
      check (avatar is null or avatar between 0 and 5);
  end if;
end $$;

comment on column siswa.avatar is
  'Nomor avatar pilihan guru (0-5). Kosong = dipilih otomatis dari nama siswa.';
