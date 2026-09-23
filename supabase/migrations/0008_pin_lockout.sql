-- =====================================================================
-- Lockout PIN — 3x salah berturut-turut = terkunci, cuma kepala sekolah
-- (di sekolah yang sama) yang bisa membuka lagi.
--
-- Penghitung disimpan di SERVER (kolom di sini), bukan di browser —
-- supaya orang tidak bisa lolos lockout cuma dengan refresh halaman
-- atau ganti perangkat.
--
-- Catatan jujur soal trade-off: mekanisme lockout seperti ini punya
-- risiko bawaan yang dikenal luas di dunia keamanan — orang lain yang
-- tahu email seseorang (tanpa tahu PIN-nya) bisa sengaja masukkan PIN
-- salah 3x untuk MENGUNCI akun itu (denial-of-service kecil-kecilan).
-- Ini trade-off yang disadari, bukan bug — karena tanpa lockout, PIN
-- 6 digit jauh lebih rawan ditebak lewat percobaan berulang. Kalau ini
-- pernah jadi masalah nyata, mitigasinya nanti bisa ditambah rate-limit
-- per-IP di depan (Edge Function / Cloudflare), bukan di lapisan ini.
-- =====================================================================

alter table profil add column if not exists pin_percobaan_gagal int not null default 0;
alter table profil add column if not exists pin_terkunci boolean not null default false;

comment on column profil.pin_percobaan_gagal is 'Jumlah percobaan PIN salah berturut-turut, sejak login PIN terakhir berhasil atau dibuka kepala sekolah.';
comment on column profil.pin_terkunci is 'true kalau sudah 3x salah berturut-turut — login PIN diblok sampai kepala sekolah membuka lagi.';

-- ---------------------------------------------------------------------
-- Dicek klien SEBELUM mencoba signInWithPassword, supaya tidak buang
-- percobaan sign-in kalau memang sudah pasti diblokir. Bisa dipanggil
-- tanpa login (anon) karena orang yang mau masuk PIN belum terautentikasi.
-- ---------------------------------------------------------------------
create or replace function status_pin(p_email text)
returns table(terkunci boolean, percobaan int)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return query select false, 0;
    return;
  end if;
  return query select p.pin_terkunci, p.pin_percobaan_gagal from profil p where p.id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- Dipanggil klien setelah signInWithPassword gagal (PIN salah). Anon,
-- dengan alasan yang sama seperti status_pin. Otomatis mengunci begitu
-- hitungan mencapai 3.
-- ---------------------------------------------------------------------
create or replace function catat_pin_gagal(p_email text)
returns table(terkunci boolean, percobaan int)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return query select false, 0;
    return;
  end if;

  update profil
    set pin_percobaan_gagal = least(pin_percobaan_gagal + 1, 3),
        pin_terkunci = (pin_percobaan_gagal + 1) >= 3
    where id = v_id;

  return query select p.pin_terkunci, p.pin_percobaan_gagal from profil p where p.id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- Dipanggil klien setelah login PIN BERHASIL — reset hitungan gagal.
-- Ini authenticated (dipanggil oleh diri sendiri, auth.uid() sudah ada
-- karena signInWithPassword sudah sukses duluan).
-- ---------------------------------------------------------------------
create or replace function reset_percobaan_pin_saya()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profil set pin_percobaan_gagal = 0 where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Daftar staf yang PIN-nya terkunci, di sekolah kepala sekolah yang
-- memanggil. Cuma kepala yang boleh — guru/TU tidak bisa lihat daftar
-- staf lain lewat sini.
-- ---------------------------------------------------------------------
create or replace function daftar_staf_terkunci()
returns table(id uuid, nama text, peran text)
language plpgsql security definer set search_path = public as $$
declare
  v_sekolah uuid;
  v_peran text;
begin
  select pr.sekolah_id, pr.peran into v_sekolah, v_peran from profil pr where pr.id = auth.uid();
  if v_peran <> 'kepala' then
    raise exception 'Cuma kepala sekolah yang bisa melihat daftar ini.';
  end if;

  return query
    select p.id, p.nama, p.peran
    from profil p
    where p.sekolah_id = v_sekolah and p.pin_terkunci = true
    order by p.nama;
end $$;

-- ---------------------------------------------------------------------
-- Buka kunci PIN satu staf. Cuma kepala sekolah, dan cuma untuk staf di
-- SEKOLAH YANG SAMA — supaya kepala sekolah A tidak bisa buka kunci
-- staf sekolah B.
-- ---------------------------------------------------------------------
create or replace function buka_kunci_pin(p_profil_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_pemanggil uuid;
  v_peran_pemanggil text;
  v_sekolah_target uuid;
begin
  select sekolah_id, peran into v_sekolah_pemanggil, v_peran_pemanggil from profil where id = auth.uid();
  if v_peran_pemanggil <> 'kepala' then
    raise exception 'Cuma kepala sekolah yang bisa membuka kunci PIN.';
  end if;

  select sekolah_id into v_sekolah_target from profil where id = p_profil_id;
  if v_sekolah_target is null or v_sekolah_target <> v_sekolah_pemanggil then
    raise exception 'Staf itu tidak ditemukan di sekolah Anda.';
  end if;

  update profil set pin_terkunci = false, pin_percobaan_gagal = 0 where id = p_profil_id;
end $$;

revoke all on function status_pin(text) from public;
revoke all on function catat_pin_gagal(text) from public;
revoke all on function reset_percobaan_pin_saya() from public;
revoke all on function daftar_staf_terkunci() from public;
revoke all on function buka_kunci_pin(uuid) from public;

grant execute on function status_pin(text) to anon, authenticated;
grant execute on function catat_pin_gagal(text) to anon, authenticated;
grant execute on function reset_percobaan_pin_saya() to authenticated;
grant execute on function daftar_staf_terkunci() to authenticated;
grant execute on function buka_kunci_pin(uuid) to authenticated;
