-- =====================================================================
-- Ubah nama sendiri (Profil Akun).
--
-- Tabel `profil` sengaja TIDAK diberi kebijakan UPDATE umum di
-- 0002_keamanan.sql — supaya orang tidak bisa mengubah `peran` atau
-- `sekolah_id` miliknya sendiri lewat query biasa. Fungsi ini membuka
-- satu celah kecil dan terkontrol: hanya kolom `nama`, hanya milik
-- sendiri (auth.uid()).
-- =====================================================================

create or replace function ubah_nama_saya(p_nama text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama tidak boleh kosong.';
  end if;

  update profil set nama = trim(p_nama) where id = auth.uid();

  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
end $$;

revoke all on function ubah_nama_saya(text) from public;
grant execute on function ubah_nama_saya(text) to authenticated;
