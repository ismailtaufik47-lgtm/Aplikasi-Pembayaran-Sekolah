-- =====================================================================
-- 0022: emoji jenis kegiatan + avatar akun staf.
--
-- 1. biaya.emoji   — emoji pilihan guru untuk satu jenis kegiatan.
--                    NULL = aplikasi menebak otomatis dari nama kegiatan
--                    (mis. "Manasik haji" → 🕋). Diubah lewat update biasa
--                    (kebijakan UPDATE biaya untuk staf sudah ada).
-- 2. profil.avatar — nomor avatar pilihan staf (0–11). NULL = huruf depan
--                    nama. Diubah lewat ubah_avatar_saya() karena tabel
--                    profil sengaja tidak punya kebijakan UPDATE umum.
--
-- Jalankan SETELAH 0021. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

alter table biaya add column if not exists emoji text;
comment on column biaya.emoji is
  'Emoji pilihan untuk jenis kegiatan. NULL = ditebak otomatis dari nama (lib/emojiKegiatan.js).';

alter table profil add column if not exists avatar smallint;
alter table profil drop constraint if exists profil_avatar_check;
alter table profil add constraint profil_avatar_check check (avatar between 0 and 11);
comment on column profil.avatar is 'Nomor avatar staf (0–11, lihat AVATAR_STAF di Avatar.jsx). NULL = huruf depan nama.';

-- Ubah avatar sendiri — hanya kolom avatar, hanya milik sendiri.
create or replace function ubah_avatar_saya(p_avatar int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_avatar is not null and (p_avatar < 0 or p_avatar > 11) then
    raise exception 'Avatar tidak dikenal.';
  end if;

  update profil set avatar = p_avatar where id = auth.uid();

  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
end $$;

revoke all on function ubah_avatar_saya(int) from public;
grant execute on function ubah_avatar_saya(int) to authenticated;
