-- =====================================================================
-- Login PIN — PIN disimpan di SISI SERVER, bukan di perangkat/browser.
--
-- PIN-nya sendiri TIDAK disimpan di kolom baru bikinan kita (itu akan
-- berarti kita menyimpan & meng-hash kredensial sendiri, riskan kalau
-- salah implementasi). Sebagai gantinya, PIN dipakai sebagai PASSWORD
-- akun Supabase Auth orang itu sendiri — Supabase yang meng-hash
-- (bcrypt) dan menyimpannya di auth.users, infrastruktur yang sudah
-- teruji, bukan buatan kita. Login PIN = supabase.auth.signInWithPassword
-- dengan PIN sebagai password. Kolom `pin_aktif` di sini CUMA penanda
-- UI ("apakah akun ini punya PIN yang aktif"), bukan tempat PIN
-- disimpan.
-- =====================================================================

alter table profil add column if not exists pin_aktif boolean not null default false;

comment on column profil.pin_aktif is
  'Penanda UI saja — PIN sesungguhnya adalah password akun ini di Supabase Auth (auth.users), di-hash oleh Supabase sendiri.';

-- Dipanggil klien SETELAH berhasil supabase.auth.updateUser({ password: pin })
-- — menandai di baris profil bahwa PIN sudah aktif.
create or replace function tandai_pin_aktif()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profil set pin_aktif = true where id = auth.uid();
  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
end $$;

-- Dipanggil klien SETELAH berhasil mengganti password ke string acak
-- (supaya PIN lama tidak bisa dipakai login lagi) — menandai nonaktif.
create or replace function matikan_pin()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profil set pin_aktif = false where id = auth.uid();
end $$;

revoke all on function tandai_pin_aktif() from public;
revoke all on function matikan_pin() from public;
grant execute on function tandai_pin_aktif() to authenticated;
grant execute on function matikan_pin() to authenticated;
