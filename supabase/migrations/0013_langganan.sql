-- =====================================================================
-- Langganan: trial 14 hari, lalu wajib berlangganan.
--
-- Alur:
--   • Sekolah baru (daftarkan_sekolah) otomatis dapat trial 14 hari
--     sejak kolom trial_berakhir dibuat (default now() + 14 hari).
--   • Selama trial ATAU selama langganan_berakhir masih di masa depan,
--     langganan_aktif() = true dan aplikasi berjalan normal.
--   • Begitu keduanya lewat, langganan_aktif() = false. RLS menolak
--     semua INSERT/UPDATE/DELETE ke data sekolah (siswa, biaya,
--     pembayaran, wali, kode aktivasi) — data lama tetap bisa DIBACA
--     (supaya sekolah tidak merasa kehilangan data), tapi aplikasi di
--     sisi klien mengunci seluruh layar dan hanya menampilkan ajakan
--     berlangganan + tombol WhatsApp ke pengelola aplikasi.
--   • Pembayaran dikonfirmasi manual lewat WhatsApp ke pengembang
--     (bukan payment gateway). Setelah dikonfirmasi, PENGEMBANG
--     (bukan kepala sekolah) menjalankan perpanjang_langganan_admin()
--     lewat halaman /admin di aplikasi ini, atau langsung lewat SQL
--     editor Supabase kalau perlu.
-- =====================================================================

-- ---------- kolom langganan di sekolah ----------
alter table sekolah add column if not exists status_langganan text not null default 'trial'
  check (status_langganan in ('trial', 'aktif'));
alter table sekolah add column if not exists trial_berakhir timestamptz not null default (now() + interval '14 days');
alter table sekolah add column if not exists langganan_berakhir timestamptz;
alter table sekolah add column if not exists catatan_langganan text;

comment on column sekolah.status_langganan is
  'trial: masih dalam 14 hari percobaan. aktif: sudah pernah berlangganan (dicek tetap lewat langganan_berakhir, bukan status ini saja).';
comment on column sekolah.trial_berakhir is
  'Batas akhir masa percobaan 14 hari, diisi otomatis saat sekolah didaftarkan.';
comment on column sekolah.langganan_berakhir is
  'Batas akhir langganan berbayar. NULL berarti belum pernah bayar. Diperpanjang oleh pengembang lewat perpanjang_langganan_admin() setelah pembayaran dikonfirmasi via WhatsApp.';
comment on column sekolah.catatan_langganan is
  'Catatan bebas dari pengembang, mis. riwayat konfirmasi pembayaran WA.';

-- ---------- PENTING: sekolah yang SUDAH ADA sebelum migrasi ini ----------
-- ALTER TABLE ADD COLUMN ... DEFAULT (now() + interval '14 days') di atas
-- menghitung now() SEKALI saat migrasi ini dijalankan dan menuliskannya ke
-- SEMUA baris yang sudah ada — termasuk sekolah yang sudah lama dipakai
-- sungguhan, bukan cuma pendaftar baru. Tanpa baris di bawah ini, semua
-- sekolah yang sudah eksis akan mendadak dianggap "trial, sisa 14 hari"
-- dan terkunci 2 minggu lagi walau sudah lama jadi pelanggan.
--
-- Beri mereka masa tenggang yang jauh lebih panjang (90 hari) supaya ada
-- waktu menghubungi satu per satu dan memindahkan ke status berlangganan
-- yang sesungguhnya lewat perpanjang_langganan_admin() — bukan mendadak
-- terkunci begitu migrasi ini jalan. Jalankan baris ini SEKALI saja, tepat
-- setelah ALTER TABLE di atas (baris ini aman diulang; kalau dijalankan
-- dua kali pun cuma memperpanjang lagi, bukan memperpendek).
update sekolah set trial_berakhir = now() + interval '90 days';

-- ---------- util: status langganan sekolah ----------
-- true kalau sekolah itu masih dalam masa trial ATAU langganan berbayarnya
-- masih berlaku. Dipakai di RLS (harus STABLE + SECURITY DEFINER supaya
-- bisa dipanggil dari kebijakan tanpa peduli siapa pemanggilnya) dan dari
-- aplikasi lewat info_langganan().
create or replace function langganan_aktif(p_sekolah_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (trial_berakhir > now()) or (langganan_berakhir is not null and langganan_berakhir > now())
     from sekolah where id = coalesce(p_sekolah_id, sekolah_saya())),
    false
  )
$$;

revoke all on function langganan_aktif(uuid) from public;
grant execute on function langganan_aktif(uuid) to authenticated, anon;

-- ---------- info langganan untuk ditampilkan di aplikasi ----------
create or replace function info_langganan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s sekolah%rowtype;
  v_aktif boolean;
  v_hari_tersisa int;
begin
  select * into s from sekolah where id = sekolah_saya();
  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;

  v_aktif := langganan_aktif(s.id);

  v_hari_tersisa := case
    when s.langganan_berakhir is not null and s.langganan_berakhir > now()
      then ceil(extract(epoch from (s.langganan_berakhir - now())) / 86400)::int
    when s.trial_berakhir > now()
      then ceil(extract(epoch from (s.trial_berakhir - now())) / 86400)::int
    else 0
  end;

  return jsonb_build_object(
    'status', s.status_langganan,
    'aktif', v_aktif,
    'trialBerakhir', s.trial_berakhir,
    'langgananBerakhir', s.langganan_berakhir,
    'hariTersisa', v_hari_tersisa,
    -- true kalau yang membuat aplikasi tetap jalan sekarang adalah masa
    -- trial (bukan langganan berbayar) — dipakai untuk warna/pesan banner.
    'masihTrial', s.langganan_berakhir is null or s.langganan_berakhir <= now()
  );
end $$;

revoke all on function info_langganan() from public;
grant execute on function info_langganan() to authenticated;

-- =====================================================================
-- Sisi pengembang (bukan kepala sekolah) — konfirmasi pembayaran manual.
-- =====================================================================

-- Daftar akun yang boleh mengelola langganan semua sekolah. Diisi manual
-- lewat SQL editor Supabase (insert into admin_aplikasi values ('email')).
create table if not exists admin_aplikasi (
  email       text primary key,
  dibuat_pada timestamptz not null default now()
);
alter table admin_aplikasi enable row level security;
-- sengaja tanpa policy apa pun untuk authenticated/anon — tabel ini hanya
-- boleh dibaca lewat fungsi security definer di bawah, tidak langsung.

create or replace function is_admin_aplikasi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_aplikasi where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

revoke all on function is_admin_aplikasi() from public;
grant execute on function is_admin_aplikasi() to authenticated;

-- Daftar seluruh sekolah + status langganannya, khusus admin aplikasi.
create or replace function daftar_sekolah_admin()
returns table (
  id                  uuid,
  nama                text,
  tahun_ajaran        text,
  status_langganan    text,
  trial_berakhir      timestamptz,
  langganan_berakhir  timestamptz,
  aktif               boolean,
  catatan_langganan   text,
  jumlah_siswa        bigint,
  dibuat_pada         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_aplikasi() then
    raise exception 'Bukan admin aplikasi.';
  end if;

  return query
    select
      s.id, s.nama, s.tahun_ajaran, s.status_langganan, s.trial_berakhir,
      s.langganan_berakhir, langganan_aktif(s.id),
      s.catatan_langganan,
      (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif),
      s.dibuat_pada
    from sekolah s
    order by s.dibuat_pada desc;
end $$;

revoke all on function daftar_sekolah_admin() from public;
grant execute on function daftar_sekolah_admin() to authenticated;

-- Perpanjang langganan satu sekolah p_bulan bulan, dipanggil admin
-- aplikasi SETELAH pembayaran dikonfirmasi manual lewat WhatsApp.
-- Dasar perhitungan: yang lebih akhir antara langganan_berakhir lama
-- (kalau masih berlaku) atau sekarang — supaya perpanjangan sebelum
-- jatuh tempo tidak menghilangkan sisa waktu yang belum terpakai.
create or replace function perpanjang_langganan_admin(p_sekolah_id uuid, p_bulan int, p_catatan text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dasar timestamptz;
  v_baru  timestamptz;
begin
  if not is_admin_aplikasi() then
    raise exception 'Bukan admin aplikasi.';
  end if;
  if p_bulan is null or p_bulan <= 0 then
    raise exception 'Jumlah bulan tidak valid.';
  end if;
  if not exists (select 1 from sekolah where id = p_sekolah_id) then
    raise exception 'Sekolah tidak ditemukan.';
  end if;

  select greatest(now(), coalesce(langganan_berakhir, now())) into v_dasar
  from sekolah where id = p_sekolah_id;

  v_baru := v_dasar + (p_bulan || ' months')::interval;

  update sekolah set
    status_langganan = 'aktif',
    langganan_berakhir = v_baru,
    catatan_langganan = case
      when p_catatan is null or trim(p_catatan) = '' then catatan_langganan
      else trim(
        coalesce(catatan_langganan || E'\n', '') ||
        to_char(now(), 'DD Mon YYYY HH24:MI') || ' — ' || trim(p_catatan)
      )
    end
  where id = p_sekolah_id;

  return jsonb_build_object('sekolahId', p_sekolah_id, 'langgananBerakhir', v_baru);
end $$;

revoke all on function perpanjang_langganan_admin(uuid, int, text) from public;
grant execute on function perpanjang_langganan_admin(uuid, int, text) to authenticated;

-- =====================================================================
-- RLS: kunci TULIS (bukan baca) untuk sekolah yang langganannya habis.
--
-- Kebijakan lama (0002_keamanan.sql) menggabungkan select/insert/update/
-- delete jadi satu policy "_semua" per tabel. Di sini dipecah jadi baca
-- (tidak disyaratkan langganan aktif, supaya sekolah tetap bisa melihat
-- data lamanya) dan tulis (disyaratkan langganan_aktif()).
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['siswa', 'biaya', 'pembayaran', 'wali'] loop
    execute format('drop policy if exists %I_semua on %I', t, t);

    execute format($f$
      create policy %I_baca on %I
        for select to authenticated
        using (sekolah_id = sekolah_saya())
    $f$, t, t);

    execute format($f$
      create policy %I_tulis on %I
        for insert to authenticated
        with check (sekolah_id = sekolah_saya() and langganan_aktif())
    $f$, t, t);

    execute format($f$
      create policy %I_ubah on %I
        for update to authenticated
        using (sekolah_id = sekolah_saya() and langganan_aktif())
        with check (sekolah_id = sekolah_saya() and langganan_aktif())
    $f$, t, t);

    execute format($f$
      create policy %I_hapus on %I
        for delete to authenticated
        using (sekolah_id = sekolah_saya() and langganan_aktif())
    $f$, t, t);
  end loop;
end $$;

-- wali_siswa: tabel penghubung, tidak punya kolom sekolah_id langsung.
drop policy if exists wali_siswa_semua on wali_siswa;

create policy wali_siswa_baca on wali_siswa
  for select to authenticated
  using (exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya()));

create policy wali_siswa_tulis on wali_siswa
  for insert to authenticated
  with check (
    exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya())
    and langganan_aktif()
  );

create policy wali_siswa_hapus on wali_siswa
  for delete to authenticated
  using (
    exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya())
    and langganan_aktif()
  );

-- kode_aktivasi tidak dibuat lewat RLS insert (lihat 0004), jadi
-- penguncian ditaruh langsung di fungsi buat_kode_aktivasi().
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
  if not langganan_aktif(v_sekolah_id) then
    raise exception 'Masa trial/langganan sekolah ini sudah berakhir. Aktifkan langganan dulu untuk mengundang staf baru.';
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
