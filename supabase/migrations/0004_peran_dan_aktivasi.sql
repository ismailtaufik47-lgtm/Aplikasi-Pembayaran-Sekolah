-- =====================================================================
-- Peran kepala sekolah + pendaftaran mandiri lewat aplikasi.
--
-- Sebelum ini, akun baru dihubungkan ke sekolah lewat SQL manual
-- (insert into profil ...). Mulai migrasi ini, ada dua jalur otomatis
-- yang dipanggil dari aplikasi setelah login Google:
--
--   daftarkan_sekolah()  -> akun pertama di sekolah itu, jadi 'kepala'
--   aktivasi_kode(kode)  -> guru masukkan kode dari kepala sekolah
--
-- Keduanya SECURITY DEFINER, jadi boleh menulis ke tabel sekolah/profil
-- walau pemanggilnya belum punya baris profil sama sekali (RLS normal
-- akan menolak ini kalau dipanggil lewat query biasa).
-- =====================================================================

-- ---------- peran baru: kepala ----------
alter table profil drop constraint if exists profil_peran_check;
alter table profil add constraint profil_peran_check
  check (peran in ('guru', 'admin', 'kepala'));
comment on column profil.peran is
  'guru/admin: mencatat pembayaran. kepala: dasbor monitoring, tanpa akses tulis (RLS-nya disiapkan menyusul).';

-- ---------- kode aktivasi ----------
create table if not exists kode_aktivasi (
  id           uuid primary key default gen_random_uuid(),
  sekolah_id   uuid not null references sekolah(id) on delete cascade,
  kode         text not null unique,
  peran        text not null default 'guru' check (peran in ('guru', 'admin')),
  dibuat_oleh  uuid references auth.users(id) on delete set null,
  dipakai_oleh uuid references auth.users(id) on delete set null,
  dipakai_pada timestamptz,
  dibuat_pada  timestamptz not null default now()
);
create index if not exists kode_aktivasi_sekolah_idx on kode_aktivasi(sekolah_id);

alter table kode_aktivasi enable row level security;

-- staf boleh MELIHAT kode sekolahnya sendiri (untuk halaman "kelola kode"
-- nanti), tapi tidak ada kebijakan insert/update/delete langsung ke tabel
-- ini — pembuatan dan pemakaian kode wajib lewat fungsi di bawah, supaya
-- keunikan kode dan aturan "sekali pakai" selalu ditegakkan.
drop policy if exists kode_aktivasi_baca on kode_aktivasi;
create policy kode_aktivasi_baca on kode_aktivasi
  for select to authenticated using (sekolah_id = sekolah_saya());

-- ---------- util: nama tampilan dari akun Google ----------
create or replace function nama_dari_google(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  )
  from auth.users where id = p_user_id
$$;

-- ---------- util: buat kode 6 karakter yang mudah dibaca ----------
create or replace function kode_acak()
returns text language plpgsql as $$
declare
  aksara text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- tanpa 0/O dan 1/I
  hasil  text := '';
  i      int;
begin
  for i in 1..6 loop
    hasil := hasil || substr(aksara, (floor(random() * length(aksara)) + 1)::int, 1);
  end loop;
  return hasil;
end $$;

-- =====================================================================
-- daftarkan_sekolah — dipanggil saat akun Google baru pertama kali
-- masuk dan memilih "Saya kepala sekolah / admin".
-- =====================================================================
create or replace function daftarkan_sekolah(p_nama text, p_tahun_ajaran text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_id uuid;
  v_nama       text;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk. Silakan login ulang.';
  end if;
  if exists (select 1 from profil where id = auth.uid()) then
    raise exception 'Akun ini sudah terhubung ke sekolah lain.';
  end if;
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama sekolah belum diisi.';
  end if;

  insert into sekolah (nama, tahun_ajaran)
  values (trim(p_nama), coalesce(nullif(trim(p_tahun_ajaran), ''), '2026/2027'))
  returning id into v_sekolah_id;

  v_nama := nama_dari_google(auth.uid());

  insert into profil (id, sekolah_id, nama, peran)
  values (auth.uid(), v_sekolah_id, v_nama, 'kepala');

  return jsonb_build_object('sekolahId', v_sekolah_id, 'nama', p_nama, 'peran', 'kepala');
end $$;

revoke all on function daftarkan_sekolah(text, text) from public;
grant execute on function daftarkan_sekolah(text, text) to authenticated;

-- =====================================================================
-- buat_kode_aktivasi — dipanggil kepala sekolah/admin dari dasbornya
-- untuk membuat kode yang nanti dibagikan ke guru baru.
-- =====================================================================
create or replace function buat_kode_aktivasi(p_peran text default 'guru')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_id uuid;
  v_peran_saya text;
  v_kode       text;
  v_percobaan  int := 0;
begin
  select sekolah_id, peran into v_sekolah_id, v_peran_saya from profil where id = auth.uid();
  if v_sekolah_id is null then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  if v_peran_saya not in ('kepala', 'admin') then
    raise exception 'Hanya kepala sekolah atau admin yang bisa membuat kode aktivasi.';
  end if;
  if p_peran not in ('guru', 'admin') then
    raise exception 'Peran kode tidak dikenal.';
  end if;

  loop
    v_kode := kode_acak();
    v_percobaan := v_percobaan + 1;
    exit when not exists (select 1 from kode_aktivasi where kode = v_kode);
    if v_percobaan > 20 then
      raise exception 'Gagal membuat kode unik, coba lagi.';
    end if;
  end loop;

  insert into kode_aktivasi (sekolah_id, kode, peran, dibuat_oleh)
  values (v_sekolah_id, v_kode, p_peran, auth.uid());

  return jsonb_build_object('kode', v_kode, 'peran', p_peran);
end $$;

revoke all on function buat_kode_aktivasi(text) from public;
grant execute on function buat_kode_aktivasi(text) to authenticated;

-- =====================================================================
-- aktivasi_kode — dipanggil guru/TU saat pertama kali masuk dan
-- memasukkan kode yang didapat dari kepala sekolah.
-- =====================================================================
create or replace function aktivasi_kode(p_kode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kode    kode_aktivasi%rowtype;
  v_sekolah text;
  v_nama    text;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk. Silakan login ulang.';
  end if;
  if exists (select 1 from profil where id = auth.uid()) then
    raise exception 'Akun ini sudah terhubung ke sekolah lain.';
  end if;

  select * into v_kode from kode_aktivasi
  where kode = upper(trim(p_kode)) and dipakai_oleh is null;

  if not found then
    raise exception 'Kode aktivasi tidak ditemukan atau sudah dipakai.';
  end if;

  v_nama := nama_dari_google(auth.uid());

  insert into profil (id, sekolah_id, nama, peran)
  values (auth.uid(), v_kode.sekolah_id, v_nama, v_kode.peran);

  update kode_aktivasi
  set dipakai_oleh = auth.uid(), dipakai_pada = now()
  where id = v_kode.id;

  select nama into v_sekolah from sekolah where id = v_kode.sekolah_id;

  return jsonb_build_object('sekolahId', v_kode.sekolah_id, 'sekolah', v_sekolah, 'peran', v_kode.peran);
end $$;

revoke all on function aktivasi_kode(text) from public;
grant execute on function aktivasi_kode(text) to authenticated;
