-- =====================================================================
-- Aplikasi Pembayaran TK — skema dasar
-- Jalankan di Supabase: SQL Editor > New query > tempel > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- sekolah (satu baris per TK) ----------
create table if not exists sekolah (
  id                   uuid primary key default gen_random_uuid(),
  nama                 text not null,
  tahun_ajaran         text not null default '2026/2027',
  spp_nominal          integer not null default 150000 check (spp_nominal >= 0),
  tanggal_jatuh_tempo  smallint not null default 10 check (tanggal_jatuh_tempo between 1 and 28),
  rekening             jsonb not null default '[]'::jsonb,
  dibuat_pada          timestamptz not null default now()
);

comment on column sekolah.rekening is
  'Contoh: [{"bank":"BSI","nomor":"7123456789","atasNama":"Yayasan Tunas Ceria"}]';

-- ---------- staf sekolah yang bisa login ----------
create table if not exists profil (
  id          uuid primary key references auth.users(id) on delete cascade,
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  nama        text not null,
  peran       text not null default 'guru' check (peran in ('guru', 'admin')),
  dibuat_pada timestamptz not null default now()
);
create index if not exists profil_sekolah_idx on profil(sekolah_id);

-- ---------- siswa ----------
create table if not exists siswa (
  id            uuid primary key default gen_random_uuid(),
  sekolah_id    uuid not null references sekolah(id) on delete cascade,
  nama          text not null,
  panggilan     text,
  jenis_kelamin char(1) not null default 'P' check (jenis_kelamin in ('L', 'P')),
  kelas         text not null,
  nis           text not null,
  wali          text,
  hp            text,
  guru          text,
  avatar        smallint check (avatar between 0 and 5),
  foto          text,
  aktif         boolean not null default true,
  dibuat_pada   timestamptz not null default now(),
  unique (sekolah_id, nis)
);
create index if not exists siswa_sekolah_idx on siswa(sekolah_id, kelas);

comment on column siswa.jenis_kelamin is 'Menentukan kumpulan avatar yang dipakai (L atau P)';
comment on column siswa.avatar is 'Nomor avatar pilihan guru (0-5). Kosong = dipilih otomatis dari nama.';
comment on column siswa.foto is 'Opsional. Kalau diisi URL foto, avatar ilustrasi diganti foto asli.';

-- ---------- jenis biaya kegiatan (bisa berbeda tiap sekolah) ----------
create table if not exists biaya (
  id         uuid primary key default gen_random_uuid(),
  sekolah_id uuid not null references sekolah(id) on delete cascade,
  nama       text not null,
  nominal    integer not null check (nominal >= 0),
  urutan     smallint not null default 0,
  aktif      boolean not null default true
);
create index if not exists biaya_sekolah_idx on biaya(sekolah_id, urutan);

-- ---------- pembayaran ----------
-- SPP  : periode 0..11 mengikuti siklus tahun ajaran (0 = Juli, 11 = Juni)
-- Kegiatan : mengacu ke satu baris biaya
create table if not exists pembayaran (
  id           uuid primary key default gen_random_uuid(),
  sekolah_id   uuid not null references sekolah(id) on delete cascade,
  siswa_id     uuid not null references siswa(id) on delete cascade,
  jenis        text not null check (jenis in ('spp', 'kegiatan')),
  periode      smallint check (periode between 0 and 11),
  biaya_id     uuid references biaya(id) on delete restrict,
  keterangan   text not null,
  nominal      integer not null check (nominal > 0),
  metode       text not null default 'Tunai' check (metode in ('Tunai', 'Transfer')),
  petugas      text,
  dicatat_oleh uuid references auth.users(id) on delete set null,
  dibayar_pada timestamptz not null default now(),
  constraint pembayaran_isi_sesuai_jenis check (
    (jenis = 'spp'      and periode is not null and biaya_id is null) or
    (jenis = 'kegiatan' and biaya_id is not null and periode is null)
  )
);

-- satu siswa tidak bisa tercatat dua kali untuk bulan / kegiatan yang sama
create unique index if not exists pembayaran_spp_unik
  on pembayaran (siswa_id, periode) where jenis = 'spp';
create unique index if not exists pembayaran_kegiatan_unik
  on pembayaran (siswa_id, biaya_id) where jenis = 'kegiatan';
create index if not exists pembayaran_sekolah_idx
  on pembayaran (sekolah_id, dibayar_pada desc);

-- ---------- wali murid + tautan portal ----------
create table if not exists wali (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  nama        text not null,
  hp          text,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  dibuat_pada timestamptz not null default now()
);

create table if not exists wali_siswa (
  wali_id  uuid not null references wali(id) on delete cascade,
  siswa_id uuid not null references siswa(id) on delete cascade,
  primary key (wali_id, siswa_id)
);

comment on column wali.token is
  'Dipakai pada tautan portal: https://domain-sekolah/ortu/<token>';
