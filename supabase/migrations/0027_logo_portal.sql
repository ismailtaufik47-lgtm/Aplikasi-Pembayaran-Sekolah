-- =====================================================================
-- 0027 — Logo sekolah di portal orang tua
--
-- Logo yang diunggah kepala sekolah di Profil sekolah (sekolah_ttd.logo,
-- dari 0025) sekarang juga tampil di pojok kiri atas portal orang tua.
--
-- Sengaja dibuat fungsi TERPISAH (bukan mengubah portal_wali) supaya:
--   • data utama portal tidak ikut membesar karena gambar logo, dan
--   • kalau file ini belum dijalankan, portal tetap berjalan normal —
--     aplikasi hanya menampilkan ikon 🏫 sebagai pengganti logo.
--
-- Aman dijalankan berulang kali.
-- =====================================================================

create or replace function portal_logo(p_token text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_sekolah uuid;
begin
  select sekolah_id into v_sekolah from wali where token = p_token;
  if v_sekolah is null then
    return null;
  end if;
  return (select t.logo from sekolah_ttd t where t.sekolah_id = v_sekolah);
end $$;

revoke all on function portal_logo(text) from public;
grant execute on function portal_logo(text) to anon, authenticated;
