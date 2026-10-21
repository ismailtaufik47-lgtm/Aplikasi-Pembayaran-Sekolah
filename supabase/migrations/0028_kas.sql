-- =====================================================================
-- 0028 — Buku kas sekolah (tahap 1 laporan keuangan)
--
-- Pemasukan SPP & biaya kegiatan TIDAK dicatat ulang di sini — aplikasi
-- mengambilnya langsung dari tabel pembayaran. Tabel kas hanya berisi:
--   • pengeluaran (honor guru, ATK, listrik, konsumsi, …)
--   • pemasukan LAIN di luar pembayaran orang tua (donasi, dana BOP, …)
--
-- Aturan:
--   • Semua staf sekolah boleh MELIHAT kas sekolahnya.
--   • Hanya kepala sekolah & admin/TU yang boleh MENCATAT dan MEMBATALKAN.
--   • Transaksi tidak pernah dihapus. Salah catat → dibatalkan dengan
--     alasan, dan tetap terlihat (dicoret) supaya ada jejaknya.
--   • Saldo awal diisi sekali saat mulai memakai fitur kas.
--
-- Aman dijalankan berulang kali. Butuh 0024 (fungsi cek_gambar).
-- =====================================================================

-- ---------- saldo awal kas per sekolah ----------
create table if not exists kas_pengaturan (
  sekolah_id  uuid primary key references sekolah(id) on delete cascade,
  saldo_awal  bigint not null default 0 check (saldo_awal between -1000000000000 and 1000000000000),
  mulai       date not null,
  diubah_oleh text,
  diubah_pada timestamptz not null default now()
);
alter table kas_pengaturan enable row level security;
drop policy if exists kas_pengaturan_baca on kas_pengaturan;
create policy kas_pengaturan_baca on kas_pengaturan for select using (sekolah_id = sekolah_saya());

-- ---------- transaksi kas ----------
create table if not exists kas (
  id              uuid primary key default gen_random_uuid(),
  sekolah_id      uuid not null references sekolah(id) on delete cascade,
  jenis           text not null check (jenis in ('masuk', 'keluar')),
  tanggal         date not null,
  kategori        text not null check (length(trim(kategori)) between 1 and 40),
  nominal         bigint not null check (nominal > 0 and nominal <= 1000000000000),
  keterangan      text check (keterangan is null or length(keterangan) <= 300),
  nota            text,
  dicatat_oleh    uuid,
  dicatat_nama    text,
  dibuat_pada     timestamptz not null default now(),
  dibatalkan_pada timestamptz,
  dibatalkan_nama text,
  alasan_batal    text
);
create index if not exists kas_sekolah_tanggal_idx on kas(sekolah_id, tanggal);
-- Penanda ada/tidaknya foto nota, supaya daftar kas bisa dimuat TANPA ikut
-- mengunduh semua foto (foto diambil satu per satu saat dibuka).
alter table kas add column if not exists ada_nota boolean generated always as (nota is not null) stored;

comment on table kas is 'Pengeluaran & pemasukan lain sekolah. Pemasukan SPP/kegiatan ada di tabel pembayaran.';
comment on column kas.nota is 'Foto nota/kuitansi (data URL JPG/PNG, maks ~700 KB). Opsional.';

alter table kas enable row level security;
-- Hanya boleh DIBACA langsung. Menulis wajib lewat fungsi di bawah.
drop policy if exists kas_baca on kas;
create policy kas_baca on kas for select using (sekolah_id = sekolah_saya());

-- Masa langganan habis → tidak bisa mencatat transaksi baru (sama seperti pembayaran).
drop trigger if exists kas_cek_langganan on kas;
create trigger kas_cek_langganan before insert on kas
  for each row execute function cegah_jika_langganan_habis();

-- ---------- pemeriksa peran ----------
create or replace function kas_cek_pencatat() returns profil
language plpgsql stable security definer set search_path = public as $$
declare p profil%rowtype;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if p.peran not in ('kepala', 'admin') then
    raise exception 'Hanya kepala sekolah dan admin/TU yang bisa mencatat kas.';
  end if;
  return p;
end $$;

-- ---------- catat transaksi ----------
create or replace function kas_catat(
  p_jenis text, p_tanggal date, p_kategori text, p_nominal bigint,
  p_keterangan text default null, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; v_id uuid;
begin
  p := kas_cek_pencatat();
  if p_jenis not in ('masuk', 'keluar') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tidak boleh di masa depan.';
  end if;
  if coalesce(p_nominal, 0) <= 0 then raise exception 'Nominal harus lebih dari nol.'; end if;
  if length(trim(coalesce(p_kategori, ''))) = 0 then raise exception 'Kategori wajib diisi.'; end if;
  perform cek_gambar(p_nota, 'Foto nota');

  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota, dicatat_oleh, dicatat_nama)
  values (p.sekolah_id, p_jenis, p_tanggal, left(trim(p_kategori), 40), p_nominal,
          nullif(left(trim(coalesce(p_keterangan, '')), 300), ''), p_nota, p.id, p.nama)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- batalkan transaksi (tidak dihapus) ----------
create or replace function kas_batalkan(p_id uuid, p_alasan text)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype;
begin
  p := kas_cek_pencatat();
  if length(trim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'Tuliskan alasan pembatalan.';
  end if;
  update kas
     set dibatalkan_pada = now(), dibatalkan_nama = p.nama, alasan_batal = left(trim(p_alasan), 200)
   where id = p_id and sekolah_id = p.sekolah_id and dibatalkan_pada is null;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;
end $$;

-- ---------- atur saldo awal ----------
create or replace function kas_atur_saldo_awal(p_saldo bigint, p_mulai date)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype;
begin
  p := kas_cek_pencatat();
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if p_mulai > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal mulai tidak boleh di masa depan.';
  end if;
  insert into kas_pengaturan as k (sekolah_id, saldo_awal, mulai, diubah_oleh, diubah_pada)
  values (p.sekolah_id, coalesce(p_saldo, 0), p_mulai, p.nama, now())
  on conflict (sekolah_id) do update
    set saldo_awal = excluded.saldo_awal, mulai = excluded.mulai,
        diubah_oleh = excluded.diubah_oleh, diubah_pada = now();
end $$;

revoke all on function kas_cek_pencatat() from public;
revoke all on function kas_catat(text, date, text, bigint, text, text) from public;
revoke all on function kas_batalkan(uuid, text) from public;
revoke all on function kas_atur_saldo_awal(bigint, date) from public;
grant execute on function kas_catat(text, date, text, bigint, text, text) to authenticated;
grant execute on function kas_batalkan(uuid, text) to authenticated;
grant execute on function kas_atur_saldo_awal(bigint, date) to authenticated;
