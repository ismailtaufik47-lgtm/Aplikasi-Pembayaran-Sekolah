-- =====================================================================
-- 0051 — KUNCI PIN TERBUKA SENDIRI SETELAH 10 MENIT
--
--  Sebelumnya (0008/0050): salah PIN 3× = terkunci sampai kepala sekolah
--  membuka. Sekarang:
--   • salah 3× = terkunci 10 menit, lalu terbuka sendiri (3 percobaan lagi).
--   • kepala sekolah tetap bisa membuka lebih cepat lewat Profil Sekolah.
--   • masuk lewat Google lalu atur PIN baru (pin_atur) = kunci langsung terbuka.
--  Keamanan: penebak paling banyak 3 tebakan per 10 menit (±430/hari dari
--  1 juta kemungkinan PIN).
--
--  Butuh 0050. Butuh src/lib/api.js + MasukPin.jsx versi v37 untuk pesan baru
--  (aplikasi v36 tetap jalan, hanya pesannya masih menyebut kepala sekolah).
--  Tidak mengubah data selain membuka kunci lama yang sudah lewat 10 menit.
--  Aman dijalankan berulang kali.
-- =====================================================================

do $cek$ begin
  if to_regprocedure('public.pin_masuk(text,text)') is null then
    raise exception 'Jalankan 0050_pin_aman.sql dulu.';
  end if;
end $cek$;

alter table profil add column if not exists pin_terkunci_sampai timestamptz;
comment on column profil.pin_terkunci_sampai is 'Kunci PIN berlaku sampai waktu ini (0051). Lewat dari itu = terbuka sendiri.';

-- kunci lama (dari sebelum 0051) tidak punya batas waktu → dianggap sudah lewat
update profil set pin_terkunci = false, pin_percobaan_gagal = 0
 where pin_terkunci and pin_terkunci_sampai is null;

-- ---------- login PIN ----------
-- Hasil (jsonb):
--   {status:'ok', kunci:'…64 hex…', lama:bool}
--   {status:'salah', sisa:n}
--   {status:'terkunci', baru:bool, menit:n}   menit = sisa waktu kunci (dibulatkan ke atas)
create or replace function pin_masuk(p_email text, p_pin text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, auth as $$
declare
  c_menit constant int := 10;
  v_id    uuid;
  v_pass  text;
  p       profil%rowtype;
  r_hash  text;
  r_versi int;
  v_ok    boolean := false;
  v_lama  boolean := false;
  v_gagal int;
begin
  select u.id, u.encrypted_password into v_id, v_pass
    from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_id is null then
    perform pg_sleep(0.05);
    return jsonb_build_object('status', 'salah', 'sisa', 3);
  end if;

  select * into p from profil where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'salah', 'sisa', 3);
  end if;

  if p.pin_terkunci then
    if p.pin_terkunci_sampai is not null and p.pin_terkunci_sampai > now() then
      return jsonb_build_object('status', 'terkunci', 'baru', false,
        'menit', greatest(1, ceil(extract(epoch from p.pin_terkunci_sampai - now()) / 60)::int));
    end if;
    -- waktu kunci sudah lewat → terbuka sendiri, hitungan mulai dari nol
    update profil set pin_terkunci = false, pin_percobaan_gagal = 0, pin_terkunci_sampai = null where id = v_id;
    p.pin_percobaan_gagal := 0;
  end if;

  if coalesce(p_pin, '') ~ '^\d{6}$' then
    select hash, versi into r_hash, r_versi from pin_rahasia where id = v_id;
    if r_hash is not null then
      v_ok := extensions.crypt(p_pin, r_hash) = r_hash;
    elsif p.pin_aktif and coalesce(v_pass, '') like '$2%' then
      v_ok   := extensions.crypt(p_pin, v_pass) = v_pass;
      v_lama := v_ok;
    end if;
  end if;

  if not v_ok then
    v_gagal := least(p.pin_percobaan_gagal + 1, 3);
    update profil set pin_percobaan_gagal = v_gagal,
                      pin_terkunci        = (v_gagal >= 3),
                      pin_terkunci_sampai = case when v_gagal >= 3 then now() + make_interval(mins => c_menit) end
     where id = v_id;
    if v_gagal >= 3 then
      return jsonb_build_object('status', 'terkunci', 'baru', true, 'menit', c_menit);
    end if;
    return jsonb_build_object('status', 'salah', 'sisa', 3 - v_gagal);
  end if;

  update profil set pin_percobaan_gagal = 0 where id = v_id;

  if v_lama then
    insert into pin_rahasia (id, hash, versi)
      values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 1)
      on conflict (id) do update
        set hash = excluded.hash, versi = pin_rahasia.versi + 1, diubah_pada = now()
      returning versi into r_versi;
  end if;

  return jsonb_build_object('status', 'ok', 'kunci', pin_kunci_turunan(v_id, r_versi), 'lama', v_lama);
end $$;
revoke all on function pin_masuk(text, text) from public;
grant execute on function pin_masuk(text, text) to anon, authenticated;

-- ---------- atur PIN baru (sesudah masuk Google) = kunci ikut terbuka ----------
create or replace function pin_atur(p_pin text)
returns text language plpgsql volatile security definer
set search_path = public, extensions as $$
declare
  v_id    uuid := auth.uid();
  v_versi int;
begin
  if v_id is null then
    raise exception 'Harus login dulu.' using errcode = '42501';
  end if;
  if not exists (select 1 from profil where id = v_id) then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  if pin_lemah(p_pin) then
    raise exception 'PIN terlalu mudah ditebak — hindari angka sama semua atau berurutan (contoh: 111111, 123456).';
  end if;

  insert into pin_rahasia (id, hash, versi)
    values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 1)
    on conflict (id) do update
      set hash = excluded.hash, versi = pin_rahasia.versi + 1, diubah_pada = now()
    returning versi into v_versi;

  update profil set pin_aktif = true, pin_terkunci = false, pin_percobaan_gagal = 0, pin_terkunci_sampai = null
   where id = v_id;
  return pin_kunci_turunan(v_id, v_versi);
end $$;
revoke all on function pin_atur(text) from public, anon;
grant execute on function pin_atur(text) to authenticated;

-- ---------- status_pin: "terkunci" hanya kalau waktunya belum lewat ----------
create or replace function status_pin(p_email text)
returns table(terkunci boolean, percobaan int, aktif boolean)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return query select false, 0, false;
    return;
  end if;
  return query
    select (p.pin_terkunci and coalesce(p.pin_terkunci_sampai > now(), false)),
           case when p.pin_terkunci and coalesce(p.pin_terkunci_sampai <= now(), true) then 0 else p.pin_percobaan_gagal end,
           p.pin_aktif
      from profil p where p.id = v_id;
end $$;
revoke all on function status_pin(text) from public;
grant execute on function status_pin(text) to anon, authenticated;

-- ---------- kepala sekolah: daftar & buka kunci ----------
drop function if exists daftar_staf_terkunci();
create or replace function daftar_staf_terkunci()
returns table(id uuid, nama text, peran text, menit int)
language plpgsql security definer set search_path = public as $$
declare
  v_sekolah uuid;
  v_peran   text;
begin
  select pr.sekolah_id, pr.peran into v_sekolah, v_peran from profil pr where pr.id = auth.uid();
  if v_peran is distinct from 'kepala' then
    raise exception 'Cuma kepala sekolah yang bisa melihat daftar ini.' using errcode = '42501';
  end if;
  return query
    select p.id, p.nama, p.peran,
           greatest(1, ceil(extract(epoch from p.pin_terkunci_sampai - now()) / 60)::int)
      from profil p
     where p.sekolah_id = v_sekolah and p.pin_terkunci and p.pin_terkunci_sampai > now()
     order by p.nama;
end $$;
revoke all on function daftar_staf_terkunci() from public, anon;
grant execute on function daftar_staf_terkunci() to authenticated;

create or replace function buka_kunci_pin(p_profil_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_pemanggil uuid;
  v_peran_pemanggil   text;
  v_sekolah_target    uuid;
begin
  if auth.uid() is null then
    raise exception 'Harus login sebagai kepala sekolah.' using errcode = '42501';
  end if;
  select sekolah_id, peran into v_sekolah_pemanggil, v_peran_pemanggil from profil where id = auth.uid();
  if v_peran_pemanggil is distinct from 'kepala' then
    raise exception 'Cuma kepala sekolah yang bisa membuka kunci PIN.' using errcode = '42501';
  end if;
  select sekolah_id into v_sekolah_target from profil where id = p_profil_id;
  if v_sekolah_target is null or v_sekolah_target <> v_sekolah_pemanggil then
    raise exception 'Staf itu tidak ditemukan di sekolah Anda.';
  end if;
  update profil set pin_terkunci = false, pin_percobaan_gagal = 0, pin_terkunci_sampai = null where id = p_profil_id;
end $$;
revoke all on function buka_kunci_pin(uuid) from public, anon;
grant execute on function buka_kunci_pin(uuid) to authenticated;
