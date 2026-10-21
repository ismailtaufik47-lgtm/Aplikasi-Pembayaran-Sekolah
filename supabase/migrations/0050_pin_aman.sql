-- =====================================================================
-- 0050 — PIN LOGIN AMAN (lanjutan review keamanan v35, temuan no. 3 & 8)
--
-- Masalah: sejak 0007, PIN 6 angka dipakai langsung sebagai PASSWORD akun
-- Supabase. Kunci "3× salah" (0008) hanya dijalankan oleh aplikasi, jadi
-- orang yang menebak langsung ke server login Supabase tidak terkena kunci.
--
-- Perbaikan (tanpa perubahan tampilan):
--   • PIN diperiksa DI DATABASE oleh pin_masuk(). Kunci 3× salah dicatat di
--     fungsi yang sama — tidak bisa dilewati.
--   • Password akun Supabase diganti menjadi kode acak 64 karakter
--     (HMAC dari kunci rahasia server). Kode itu hanya diberikan pin_masuk()
--     kalau PIN benar. Menebak password langsung ke server login = mustahil.
--   • PIN disimpan sebagai hash bcrypt (pgcrypto) di tabel pin_rahasia —
--     tidak bisa dibaca siapa pun lewat API.
--   • Akun yang sudah punya PIN (format lama) TIDAK perlu atur ulang:
--     pin_masuk() mencocokkan PIN dengan password lama, lalu aplikasi
--     memindahkannya ke format baru saat login itu juga.
--   • catat_pin_gagal() tidak bisa dipanggil dari luar lagi (dulu siapa pun
--     bisa memanggilnya untuk mengunci akun orang lain tanpa mencoba PIN).
--
-- Butuh src/lib/api.js versi v36 (masukPin & aturPin memakai fungsi baru).
-- Tidak mengubah data yang ada. Aman dijalankan berulang kali.
-- =====================================================================

-- ---------- 1. tempat penyimpanan (tidak bisa dibaca lewat API) ----------
create table if not exists pin_rahasia (
  id          uuid primary key references auth.users(id) on delete cascade,
  hash        text,                        -- bcrypt PIN; null = PIN dimatikan / format lama
  versi       int  not null default 1,     -- naik setiap PIN diatur/dimatikan → kode lama tak berlaku
  diubah_pada timestamptz not null default now()
);
alter table pin_rahasia enable row level security;
revoke all on table pin_rahasia from public, anon, authenticated;

create table if not exists pin_kunci_server (
  id     int primary key default 1 check (id = 1),
  pepper bytea not null
);
alter table pin_kunci_server enable row level security;
revoke all on table pin_kunci_server from public, anon, authenticated;
insert into pin_kunci_server (id, pepper)
  values (1, extensions.gen_random_bytes(32))
  on conflict (id) do nothing;              -- dijalankan ulang: kunci lama tetap

comment on table pin_rahasia is 'Hash bcrypt PIN staf (0050). Hanya dibaca fungsi pin_masuk/pin_atur.';
comment on table pin_kunci_server is 'Kunci rahasia untuk membuat password akun dari PIN (0050). Jangan dihapus — semua login PIN akan gagal.';

-- ---------- 2. fungsi bantu internal ----------
-- Password akun Supabase untuk (akun, versi). 64 karakter hex.
create or replace function pin_kunci_turunan(p_id uuid, p_versi int)
returns text language sql stable security definer
set search_path = public, extensions as $$
  select encode(extensions.hmac(convert_to(p_id::text || ':' || p_versi, 'UTF8'),
                                (select pepper from pin_kunci_server where id = 1), 'sha256'), 'hex')
$$;

-- Sama dengan pinLemah() di aplikasi: angka sama semua, urut naik/turun
-- (termasuk yang "muter" lewat 0/9), pola 121212, pola 123123.
create or replace function pin_lemah(p_pin text)
returns boolean language plpgsql immutable as $$
declare
  d int[]; i int; naik boolean := true; turun boolean := true;
begin
  if p_pin is null or p_pin !~ '^\d{6}$' then return true; end if;
  d := array(select substr(p_pin, k, 1)::int from generate_series(1, 6) k);
  if p_pin ~ '^(\d)\1{5}$' then return true; end if;
  for i in 2..6 loop
    if (d[i-1] + 1) % 10 <> d[i] then naik := false; end if;
    if (d[i-1] + 9) % 10 <> d[i] then turun := false; end if;
  end loop;
  if naik or turun then return true; end if;
  if d[1] = d[3] and d[3] = d[5] and d[2] = d[4] and d[4] = d[6] then return true; end if;
  if substr(p_pin, 1, 3) = substr(p_pin, 4, 3) then return true; end if;
  return false;
end $$;

revoke all on function pin_kunci_turunan(uuid, int) from public, anon, authenticated;
revoke all on function pin_lemah(text)              from public, anon, authenticated;

-- ---------- 3. login PIN (dipanggil sebelum login → anon) ----------
-- Hasil (jsonb):
--   {status:'ok', kunci:'…64 hex…', lama:false|true}
--   {status:'salah', sisa:n}
--   {status:'terkunci', baru:true|false}   baru = terkunci karena percobaan ini
create or replace function pin_masuk(p_email text, p_pin text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, auth as $$
declare
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
    perform pg_sleep(0.05);                          -- samakan waktu dengan email terdaftar
    return jsonb_build_object('status', 'salah', 'sisa', 3);
  end if;

  select * into p from profil where id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'salah', 'sisa', 3);
  end if;
  if p.pin_terkunci then
    return jsonb_build_object('status', 'terkunci', 'baru', false);
  end if;

  if coalesce(p_pin, '') ~ '^\d{6}$' then
    select hash, versi into r_hash, r_versi from pin_rahasia where id = v_id;
    if r_hash is not null then
      v_ok := extensions.crypt(p_pin, r_hash) = r_hash;
    elsif p.pin_aktif and coalesce(v_pass, '') like '$2%' then
      -- format lama: PIN masih menjadi password Supabase
      v_ok   := extensions.crypt(p_pin, v_pass) = v_pass;
      v_lama := v_ok;
    end if;
  end if;

  if not v_ok then
    v_gagal := least(p.pin_percobaan_gagal + 1, 3);
    update profil set pin_percobaan_gagal = v_gagal, pin_terkunci = (v_gagal >= 3) where id = v_id;
    if v_gagal >= 3 then
      return jsonb_build_object('status', 'terkunci', 'baru', true);
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

-- ---------- 4. atur / ganti PIN (sudah login) ----------
-- Mengembalikan password baru akun; aplikasi lalu memanggil
-- supabase.auth.updateUser({ password }) dengan nilai itu.
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

  update profil set pin_aktif = true where id = v_id;
  return pin_kunci_turunan(v_id, v_versi);
end $$;

revoke all on function pin_atur(text) from public, anon;
grant execute on function pin_atur(text) to authenticated;

-- ---------- 5. matikan PIN: hash dihapus, versi naik ----------
create or replace function matikan_pin()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profil set pin_aktif = false where id = auth.uid();
  update pin_rahasia set hash = null, versi = versi + 1, diubah_pada = now() where id = auth.uid();
end $$;
revoke all on function matikan_pin() from public, anon;
grant execute on function matikan_pin() to authenticated;

-- tandai_pin_aktif() dipakai aplikasi versi lama (PIN = password). Tetap
-- dibiarkan supaya aplikasi lama yang belum dideploy tidak error; akun itu
-- diperlakukan sebagai format lama dan dipindah saat login berikutnya.
create or replace function tandai_pin_aktif()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profil set pin_aktif = true where id = auth.uid();
  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  update pin_rahasia set hash = null, versi = versi + 1, diubah_pada = now() where id = auth.uid();
end $$;
revoke all on function tandai_pin_aktif() from public, anon;
grant execute on function tandai_pin_aktif() to authenticated;

-- ---------- 6. tutup jalan lama ----------
-- Penghitung gagal kini dicatat di pin_masuk(); fungsi ini tidak dipakai lagi
-- dan dulu bisa dipakai siapa pun untuk mengunci akun orang lain.
revoke all on function catat_pin_gagal(text) from public, anon, authenticated;

-- ---------- 7. pantauan: berapa akun masih format lama ----------
-- Hanya untuk dibaca di SQL Editor (tidak bisa dipanggil dari aplikasi).
create or replace function pin_format_lama()
returns table(sekolah text, nama text, peran text)
language sql stable security definer set search_path = public as $$
  select s.nama, p.nama, p.peran
    from profil p
    left join sekolah s on s.id = p.sekolah_id
    left join pin_rahasia r on r.id = p.id
   where p.pin_aktif and r.hash is null
   order by 1, 2
$$;
revoke all on function pin_format_lama() from public, anon, authenticated;
