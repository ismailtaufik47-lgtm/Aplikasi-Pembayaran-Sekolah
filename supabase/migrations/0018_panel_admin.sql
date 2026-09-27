-- =====================================================================
-- Panel admin aplikasi (halaman /admin).
--
-- Menambah:
--   1. sekolah.dinonaktifkan_admin — admin bisa menonaktifkan paksa sebuah
--      sekolah kapan saja (di luar hitungan tanggal). Efeknya sama dengan
--      kadaluarsa: tambah siswa & catat pembayaran dikunci, data tetap bisa
--      dilihat. Portal orang tua TIDAK ikut ditutup (tetap ramah wali murid).
--   2. riwayat_langganan — setiap perpanjangan tercatat (nominal, jumlah
--      siswa, tarif, periode). Ini sumber grafik pendapatan per bulan.
--   3. RPC khusus admin: admin_perpanjang, admin_batalkan_perpanjang,
--      admin_set_nonaktif, admin_riwayat_langganan; daftar_langganan
--      diperbarui (tanggal, kontak, total dibayar).
--
-- Semua fungsi admin dijaga saya_admin_aplikasi() — email Anda harus ada
-- di tabel admin_aplikasi:
--   insert into admin_aplikasi (email) values ('email-anda@gmail.com')
--   on conflict do nothing;
--
-- Jalankan SETELAH 0013–0017. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- ---------- 1. kolom nonaktif paksa ----------
alter table sekolah
  add column if not exists dinonaktifkan_admin boolean not null default false;

comment on column sekolah.dinonaktifkan_admin is
  'TRUE = dinonaktifkan paksa oleh admin aplikasi (status dianggap kadaluarsa walau tanggal masih berlaku). Diubah lewat admin_set_nonaktif().';

-- Versi 3 parameter: sama dengan versi 2 parameter (0013), tapi status
-- dipaksa 'kadaluarsa' kalau dinonaktifkan admin. Tanggal-tanggal lain
-- (aktifSampai, portalSampai, sisaHari) tetap apa adanya.
create or replace function hitung_status_langganan(
  p_trial_mulai timestamptz,
  p_langganan_sampai date,
  p_nonaktif boolean
) returns jsonb
language sql stable as $$
  select case when coalesce(p_nonaktif, false)
    then hitung_status_langganan(p_trial_mulai, p_langganan_sampai)
         || jsonb_build_object('status', 'kadaluarsa', 'nonaktifAdmin', true)
    else hitung_status_langganan(p_trial_mulai, p_langganan_sampai)
         || jsonb_build_object('nonaktifAdmin', false)
  end
$$;

-- Trigger pengunci tambah siswa / catat pembayaran: ikut hormati nonaktif paksa.
create or replace function cegah_jika_langganan_habis()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select hitung_status_langganan(trial_mulai, langganan_sampai, dinonaktifkan_admin) ->> 'status'
    into v_status
    from sekolah where id = new.sekolah_id;

  if v_status = 'kadaluarsa' then
    raise exception 'Masa langganan sekolah sedang tidak aktif. Perpanjang langganan dulu untuk melanjutkan.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- status_langganan() untuk sekolah sendiri: ikut hormati nonaktif paksa.
create or replace function status_langganan()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sekolah%rowtype;
begin
  select * into s from sekolah where id = sekolah_saya();
  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  return hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin)
         || jsonb_build_object(
              'sekolahId', s.id,
              'namaSekolah', s.nama,
              'hargaPerSiswa', s.harga_per_siswa,
              'jumlahSiswaAktif', (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif)
            );
end $$;

revoke all on function status_langganan() from public;
grant execute on function status_langganan() to authenticated;

-- Cermin kolom status_langganan (0015/0016): ikut hormati nonaktif paksa.
create or replace function sinkron_status_langganan(p_sekolah_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update sekolah s
     set status_langganan = (hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status')
   where (p_sekolah_id is null or s.id = p_sekolah_id)
     and s.status_langganan is distinct from
         (hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status');
end $$;

revoke all on function sinkron_status_langganan(uuid) from public;
grant execute on function sinkron_status_langganan(uuid) to authenticated;

-- Trigger sinkron: sekarang juga saat dinonaktifkan_admin berubah.
drop trigger if exists sekolah_sinkron_status on sekolah;
create trigger sekolah_sinkron_status
  after insert or update of trial_mulai, langganan_sampai, dinonaktifkan_admin on sekolah
  for each row execute function trg_sinkron_status_sekolah();

-- ---------- 2. riwayat perpanjangan (sumber grafik pendapatan) ----------
create table if not exists riwayat_langganan (
  id             uuid primary key default gen_random_uuid(),
  sekolah_id     uuid not null references sekolah(id) on delete cascade,
  bulan          int not null check (bulan >= 1),
  jumlah_siswa   int not null,
  tarif          numeric not null,
  nominal        numeric not null,
  periode_mulai  date not null,
  sampai_lama    date,            -- langganan_sampai sebelum diperpanjang (untuk pembatalan)
  sampai_baru    date not null,
  dicatat_oleh   text,
  dibuat_pada    timestamptz not null default now()
);
create index if not exists riwayat_langganan_sekolah_idx on riwayat_langganan (sekolah_id, dibuat_pada desc);
create index if not exists riwayat_langganan_waktu_idx   on riwayat_langganan (dibuat_pada desc);

-- Tanpa kebijakan RLS sama sekali → hanya bisa disentuh lewat fungsi
-- security definer di bawah (khusus admin), bukan dari akun sekolah.
alter table riwayat_langganan enable row level security;

comment on table riwayat_langganan is
  'Satu baris = satu perpanjangan langganan yang dikonfirmasi admin. Nominal = siswa aktif × tarif × bulan saat itu.';

grant execute on function saya_admin_aplikasi() to authenticated;

-- ---------- 3a. perpanjang + catat riwayat ----------
-- Periode baru:
--   • masih aktif / masih trial → disambung dari hari terakhir masa aktif
--     (sisa trial/sewa tidak hangus), selesai tepat N bulan setelahnya.
--   • sudah lewat → mulai hari ini, berlaku N bulan penuh.
-- Nominal otomatis = siswa aktif × tarif sekolah (atau p_tarif_default
-- kalau sekolah tidak punya tarif khusus) × N bulan.
create or replace function admin_perpanjang(
  p_sekolah_id    uuid,
  p_bulan         int default 1,
  p_tarif_default numeric default 5000
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s           sekolah%rowtype;
  v_akhir     date;
  v_mulai     date;
  v_baru      date;
  v_n         int;
  v_tarif     numeric;
  v_nominal   numeric;
  v_id        uuid;
begin
  if not saya_admin_aplikasi() then
    raise exception 'Hanya admin aplikasi yang boleh memperpanjang langganan.';
  end if;
  if p_bulan is null or p_bulan < 1 then
    raise exception 'Jumlah bulan minimal 1.';
  end if;

  select * into s from sekolah where id = p_sekolah_id for update;
  if not found then
    raise exception 'Sekolah tidak ditemukan.';
  end if;

  -- hari terakhir masa aktif saat ini (trial atau sewa, mana yang lebih akhir)
  v_akhir := greatest(s.trial_mulai::date + 15, coalesce(s.langganan_sampai, s.trial_mulai::date + 15));

  if v_akhir >= current_date then
    v_mulai := v_akhir + 1;
    v_baru  := (v_akhir + make_interval(months => p_bulan))::date;
  else
    v_mulai := current_date;
    v_baru  := (current_date + make_interval(months => p_bulan))::date - 1;
  end if;

  select count(*) into v_n from siswa x where x.sekolah_id = s.id and x.aktif;
  v_tarif   := case when s.harga_per_siswa > 0 then s.harga_per_siswa else p_tarif_default end;
  v_nominal := v_n * v_tarif * p_bulan;

  update sekolah set langganan_sampai = v_baru where id = s.id;

  insert into riwayat_langganan
    (sekolah_id, bulan, jumlah_siswa, tarif, nominal, periode_mulai, sampai_lama, sampai_baru, dicatat_oleh)
  values
    (s.id, p_bulan, v_n, v_tarif, v_nominal, v_mulai, s.langganan_sampai, v_baru,
     (select email from auth.users where id = auth.uid()))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'sekolahId', s.id, 'bulan', p_bulan,
    'jumlahSiswa', v_n, 'tarif', v_tarif, 'nominal', v_nominal,
    'periodeMulai', v_mulai, 'langgananSampai', v_baru
  );
end $$;

revoke all on function admin_perpanjang(uuid, int, numeric) from public;
grant execute on function admin_perpanjang(uuid, int, numeric) to authenticated;

-- Fungsi lama (0013) dijadikan pembungkus supaya perpanjangan lewat SQL
-- Editor pun tetap tercatat di riwayat & grafik. 5000 = tarif default,
-- samakan dengan HARGA_PER_SISWA_DEFAULT di src/lib/langganan.js.
create or replace function perpanjang_langganan(p_sekolah_id uuid, p_bulan int default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return admin_perpanjang(p_sekolah_id, p_bulan, 5000);
end $$;

revoke all on function perpanjang_langganan(uuid, int) from public;
grant execute on function perpanjang_langganan(uuid, int) to authenticated;

-- ---------- 3b. batalkan perpanjangan (salah klik) ----------
-- Hanya transaksi TERAKHIR sebuah sekolah yang boleh dibatalkan, supaya
-- tanggal jatuh tempo bisa dikembalikan dengan pasti.
create or replace function admin_batalkan_perpanjang(p_riwayat_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r riwayat_langganan%rowtype; v_terakhir uuid;
begin
  if not saya_admin_aplikasi() then
    raise exception 'Hanya admin aplikasi.';
  end if;

  select * into r from riwayat_langganan where id = p_riwayat_id;
  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  select id into v_terakhir from riwayat_langganan
   where sekolah_id = r.sekolah_id
   order by dibuat_pada desc limit 1;
  if v_terakhir <> r.id then
    raise exception 'Hanya perpanjangan terakhir sekolah ini yang bisa dibatalkan.';
  end if;

  update sekolah set langganan_sampai = r.sampai_lama where id = r.sekolah_id;
  delete from riwayat_langganan where id = r.id;

  return jsonb_build_object('sekolahId', r.sekolah_id, 'langgananSampai', r.sampai_lama);
end $$;

revoke all on function admin_batalkan_perpanjang(uuid) from public;
grant execute on function admin_batalkan_perpanjang(uuid) to authenticated;

-- ---------- 3c. nonaktifkan / aktifkan paksa ----------
create or replace function admin_set_nonaktif(p_sekolah_id uuid, p_nonaktif boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then
    raise exception 'Hanya admin aplikasi.';
  end if;
  update sekolah set dinonaktifkan_admin = coalesce(p_nonaktif, false) where id = p_sekolah_id;
  if not found then
    raise exception 'Sekolah tidak ditemukan.';
  end if;
  return jsonb_build_object('sekolahId', p_sekolah_id, 'dinonaktifkanAdmin', coalesce(p_nonaktif, false));
end $$;

revoke all on function admin_set_nonaktif(uuid, boolean) from public;
grant execute on function admin_set_nonaktif(uuid, boolean) to authenticated;

-- ---------- 3d. daftar sekolah untuk panel admin ----------
create or replace function daftar_langganan()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then
    raise exception 'Khusus admin aplikasi.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'nama', s.nama,
      'dibuatPada', s.dibuat_pada,
      'trialMulai', s.trial_mulai,
      'langgananSampai', s.langganan_sampai,
      'hargaPerSiswa', s.harga_per_siswa,
      'dinonaktifkanAdmin', s.dinonaktifkan_admin,
      'jumlahSiswaAktif', (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif),
      'status', hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin),
      -- awal periode yang sedang/terakhir berjalan: periode sewa terakhir,
      -- atau tanggal mulai trial kalau belum pernah bayar
      'aktifSejak', coalesce(
        (select r.periode_mulai from riwayat_langganan r
          where r.sekolah_id = s.id order by r.dibuat_pada desc limit 1),
        s.trial_mulai::date),
      'terakhirBayar', (select max(r.dibuat_pada) from riwayat_langganan r where r.sekolah_id = s.id),
      'totalDibayar', coalesce((select sum(r.nominal) from riwayat_langganan r where r.sekolah_id = s.id), 0),
      -- kontak: kepala sekolah dulu, kalau tidak ada admin sekolah
      'kontak', (
        select jsonb_build_object('nama', p.nama, 'email', u.email, 'peran', p.peran)
          from profil p join auth.users u on u.id = p.id
         where p.sekolah_id = s.id
         order by case p.peran when 'kepala' then 0 when 'admin' then 1 else 2 end, p.dibuat_pada
         limit 1)
    ) order by s.dibuat_pada desc)
    from sekolah s
  ), '[]'::jsonb);
end $$;

revoke all on function daftar_langganan() from public;
grant execute on function daftar_langganan() to authenticated;

-- ---------- 3e. riwayat transaksi (untuk grafik & halaman riwayat) ----------
create or replace function admin_riwayat_langganan(p_bulan_terakhir int default 24)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then
    raise exception 'Khusus admin aplikasi.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'sekolahId', r.sekolah_id,
      'namaSekolah', s.nama,
      'bulan', r.bulan,
      'jumlahSiswa', r.jumlah_siswa,
      'tarif', r.tarif,
      'nominal', r.nominal,
      'periodeMulai', r.periode_mulai,
      'sampaiLama', r.sampai_lama,
      'sampaiBaru', r.sampai_baru,
      'dicatatOleh', r.dicatat_oleh,
      'dibuatPada', r.dibuat_pada
    ) order by r.dibuat_pada desc)
    from riwayat_langganan r
    join sekolah s on s.id = r.sekolah_id
    where r.dibuat_pada >= date_trunc('month', now()) - make_interval(months => greatest(p_bulan_terakhir, 1) - 1)
  ), '[]'::jsonb);
end $$;

revoke all on function admin_riwayat_langganan(int) from public;
grant execute on function admin_riwayat_langganan(int) to authenticated;

-- Rapikan cermin status untuk semua sekolah.
select sinkron_status_langganan();
