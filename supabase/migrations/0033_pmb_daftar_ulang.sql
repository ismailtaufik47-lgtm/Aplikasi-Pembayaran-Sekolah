-- =====================================================================
-- 0033 — Biaya PMB (pendaftaran murid baru) & Daftar ulang
--
-- Konsep: "paket biaya" milik satu tahun ajaran, berisi RINCIAN (untuk
-- informasi orang tua: formulir, uang gedung, seragam, …) dan JADWAL
-- CICILAN opsional (tahap + tanggal jatuh tempo). Orang tua boleh membayar
-- berapa saja; uang yang masuk mengisi tahap paling awal yang belum lunas
-- (dihitung di aplikasi). Paket ditagihkan ke siswa tertentu (paket_siswa).
--
--   paket_biaya   : satu baris per paket (PMB 2026/2027, Daftar ulang 2026/2027)
--   paket_siswa   : siswa yang ditagih paket itu
--   pembayaran    : jenis baru 'paket' + kolom paket_id
--
-- Tidak ada menu baru: diatur di Jenis biaya, dipantau di Tagihan.
--
-- Juga di file ini:
--   • Biaya kegiatan bernama "PMB"/"Daftar ulang" (cara lama) otomatis
--     DIPINDAHKAN menjadi paket tahun ajaran berjalan, lengkap dengan
--     pembayarannya. Tidak ada uang/riwayat yang hilang.
--   • Pembayaran hanya bisa dicatat untuk siswa, kegiatan & paket milik
--     sekolah yang sama (sebelumnya hanya dicek sekolah_id-nya saja).
--   • Pembatalan, kuitansi, portal orang tua, buku kas & SAKU ikut
--     mengenali pembayaran PMB/DU.
--   • Format rupiah di pesan database: "Rp 150.000" (pakai spasi).
--
-- Aman dijalankan berulang kali. Jalankan SETELAH 0032.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. tahun ajaran berjalan (Juli–Juni, zona WIB)
-- ---------------------------------------------------------------------
create or replace function tahun_ajaran_berjalan(p_hari date default null) returns text
language sql stable as $$
  with d as (select coalesce(p_hari, (now() at time zone 'Asia/Jakarta')::date) as h)
  select case when extract(month from h) >= 7
              then extract(year from h)::int || '/' || (extract(year from h)::int + 1)
              else (extract(year from h)::int - 1) || '/' || extract(year from h)::int end
    from d
$$;

-- rupiah dengan spasi: "Rp 150.000"
create or replace function kas_rp(p bigint) returns text
language sql immutable as $$
  select case when p < 0 then '-' else '' end || 'Rp ' ||
         replace(to_char(abs(coalesce(p, 0)), 'FM999,999,999,999,990'), ',', '.')
$$;

-- ---------------------------------------------------------------------
-- 1. tabel paket
-- ---------------------------------------------------------------------
create table if not exists paket_biaya (
  id            uuid primary key default gen_random_uuid(),
  sekolah_id    uuid not null references sekolah(id) on delete cascade,
  jenis         text not null check (jenis in ('pmb', 'du')),
  tahun_ajaran  text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  nama          text not null check (length(trim(nama)) between 1 and 80),
  rincian       jsonb not null default '[]'::jsonb,
  tahap         jsonb not null default '[]'::jsonb,
  total         integer not null check (total > 0),
  aktif         boolean not null default true,
  dibuat_pada   timestamptz not null default now()
);
comment on table paket_biaya is
$$Paket biaya PMB / Daftar ulang satu tahun ajaran.
rincian: [{"nama":"Uang gedung","nominal":2000000}, …]  — total = jumlah rincian (diisi otomatis)
tahap  : [{"nama":"Tahap 1","jatuhTempo":"2026-07-15","nominal":1500000}, …] — boleh kosong;
         kalau diisi, jumlahnya harus sama dengan total dan tanggalnya berurutan.$$;

create unique index if not exists paket_biaya_satu_per_ta
  on paket_biaya (sekolah_id, jenis, tahun_ajaran) where aktif;
create index if not exists paket_biaya_sekolah_idx on paket_biaya (sekolah_id, tahun_ajaran);

create table if not exists paket_siswa (
  paket_id    uuid not null references paket_biaya(id) on delete cascade,
  siswa_id    uuid not null references siswa(id) on delete cascade,
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  primary key (paket_id, siswa_id)
);
create index if not exists paket_siswa_siswa_idx on paket_siswa (siswa_id);
create index if not exists paket_siswa_sekolah_idx on paket_siswa (sekolah_id);

-- Rincian & tahap dirapikan dan diperiksa di database, bukan hanya di layar.
create or replace function paket_biaya_cek() returns trigger
language plpgsql as $$
declare r jsonb; v_total bigint := 0; v_tahap bigint := 0; v_tgl date; v_sblm date; n int := 0; m int := 0;
begin
  if jsonb_typeof(new.rincian) <> 'array' or jsonb_array_length(new.rincian) = 0 then
    raise exception 'Isi minimal satu rincian biaya.';
  end if;
  if jsonb_array_length(new.rincian) > 20 then raise exception 'Rincian biaya maksimal 20 baris.'; end if;
  for r in select value from jsonb_array_elements(new.rincian) loop
    n := n + 1;
    if length(trim(coalesce(r ->> 'nama', ''))) = 0 then raise exception 'Nama rincian ke-% belum diisi.', n; end if;
    if length(r ->> 'nama') > 80 then raise exception 'Nama rincian ke-% terlalu panjang (maks. 80 huruf).', n; end if;
    if coalesce((r ->> 'nominal')::numeric, 0) <= 0 or (r ->> 'nominal')::numeric <> trunc((r ->> 'nominal')::numeric) then
      raise exception 'Nominal rincian "%" belum benar.', r ->> 'nama';
    end if;
    v_total := v_total + (r ->> 'nominal')::bigint;
  end loop;
  if v_total > 2000000000 then raise exception 'Total paket terlalu besar.'; end if;
  new.total := v_total;
  new.rincian := (select jsonb_agg(jsonb_build_object('nama', trim(e ->> 'nama'), 'nominal', (e ->> 'nominal')::int) order by o)
                    from jsonb_array_elements(new.rincian) with ordinality as x(e, o));

  if jsonb_typeof(new.tahap) <> 'array' then new.tahap := '[]'::jsonb; end if;
  if jsonb_array_length(new.tahap) > 12 then raise exception 'Jadwal cicilan maksimal 12 tahap.'; end if;
  for r in select value from jsonb_array_elements(new.tahap) loop
    m := m + 1;
    begin
      v_tgl := (r ->> 'jatuhTempo')::date;
    exception when others then
      raise exception 'Tanggal jatuh tempo tahap ke-% belum benar.', m;
    end;
    if v_tgl is null then raise exception 'Tanggal jatuh tempo tahap ke-% belum diisi.', m; end if;
    if v_sblm is not null and v_tgl <= v_sblm then
      raise exception 'Tanggal tahap ke-% harus setelah tahap sebelumnya.', m;
    end if;
    if coalesce((r ->> 'nominal')::numeric, 0) <= 0 then raise exception 'Nominal tahap ke-% belum diisi.', m; end if;
    v_tahap := v_tahap + (r ->> 'nominal')::bigint;
    v_sblm := v_tgl;
  end loop;
  if m > 0 and v_tahap <> v_total then
    raise exception 'Jumlah semua tahap (%) harus sama dengan total paket (%).', kas_rp(v_tahap), kas_rp(v_total);
  end if;
  new.tahap := coalesce((select jsonb_agg(jsonb_build_object(
                   'nama', coalesce(nullif(trim(e ->> 'nama'), ''), 'Tahap ' || o),
                   'jatuhTempo', (e ->> 'jatuhTempo')::date,
                   'nominal', (e ->> 'nominal')::int) order by o)
                 from jsonb_array_elements(new.tahap) with ordinality as x(e, o)), '[]'::jsonb);
  new.nama := trim(new.nama);
  return new;
end $$;

drop trigger if exists paket_biaya_cek on paket_biaya;
create trigger paket_biaya_cek before insert or update of rincian, tahap, nama on paket_biaya
  for each row execute function paket_biaya_cek();

-- siswa & paket harus satu sekolah
create or replace function paket_siswa_cek() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from paket_biaya p where p.id = new.paket_id and p.sekolah_id = new.sekolah_id)
     or not exists (select 1 from siswa s where s.id = new.siswa_id and s.sekolah_id = new.sekolah_id) then
    raise exception 'Siswa dan paket harus dari sekolah yang sama.';
  end if;
  return new;
end $$;
drop trigger if exists paket_siswa_cek on paket_siswa;
create trigger paket_siswa_cek before insert or update on paket_siswa
  for each row execute function paket_siswa_cek();

-- RLS: semua staf boleh membaca; mengubah butuh hak "biaya"
alter table paket_biaya enable row level security;
alter table paket_siswa enable row level security;
drop policy if exists paket_biaya_baca on paket_biaya;
drop policy if exists paket_biaya_tulis on paket_biaya;
create policy paket_biaya_baca on paket_biaya for select using (sekolah_id = sekolah_saya());
create policy paket_biaya_tulis on paket_biaya for all
  using (sekolah_id = sekolah_saya() and boleh('biaya'))
  with check (sekolah_id = sekolah_saya() and boleh('biaya'));
drop policy if exists paket_siswa_baca on paket_siswa;
drop policy if exists paket_siswa_tulis on paket_siswa;
create policy paket_siswa_baca on paket_siswa for select using (sekolah_id = sekolah_saya());
create policy paket_siswa_tulis on paket_siswa for all
  using (sekolah_id = sekolah_saya() and boleh('biaya'))
  with check (sekolah_id = sekolah_saya() and boleh('biaya'));

-- ---------------------------------------------------------------------
-- 2. pembayaran jenis 'paket'
-- ---------------------------------------------------------------------
alter table pembayaran add column if not exists paket_id uuid references paket_biaya(id) on delete restrict;
alter table pembayaran drop constraint if exists pembayaran_jenis_check;
alter table pembayaran add constraint pembayaran_jenis_check check (jenis in ('spp', 'kegiatan', 'paket'));
alter table pembayaran drop constraint if exists pembayaran_isi_sesuai_jenis;
alter table pembayaran add constraint pembayaran_isi_sesuai_jenis check (
  (jenis = 'spp'      and periode is not null and biaya_id is null and paket_id is null) or
  (jenis = 'kegiatan' and biaya_id is not null and periode is null and paket_id is null) or
  (jenis = 'paket'    and paket_id is not null and periode is null and biaya_id is null)
);
create index if not exists pembayaran_paket_idx on pembayaran (paket_id, siswa_id) where paket_id is not null;

alter table pembayaran_batal add column if not exists paket_id uuid;

-- Siswa, kegiatan & paket yang dibayar harus milik sekolah yang sama, dan
-- paket hanya bisa dibayar oleh siswa yang memang ditagih paket itu.
create or replace function pembayaran_cek_milik() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from siswa s where s.id = new.siswa_id and s.sekolah_id = new.sekolah_id) then
    raise exception 'Siswa tidak ditemukan di sekolah ini.';
  end if;
  if new.biaya_id is not null and not exists (select 1 from biaya b where b.id = new.biaya_id and b.sekolah_id = new.sekolah_id) then
    raise exception 'Jenis kegiatan tidak ditemukan di sekolah ini.';
  end if;
  if new.paket_id is not null then
    if not exists (select 1 from paket_biaya p where p.id = new.paket_id and p.sekolah_id = new.sekolah_id) then
      raise exception 'Paket PMB/daftar ulang tidak ditemukan di sekolah ini.';
    end if;
    if not exists (select 1 from paket_siswa ps where ps.paket_id = new.paket_id and ps.siswa_id = new.siswa_id) then
      raise exception 'Siswa ini tidak ditagih paket tersebut. Tambahkan dulu di Jenis biaya › PMB & Daftar ulang.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pembayaran_cek_milik on pembayaran;
create trigger pembayaran_cek_milik before insert on pembayaran
  for each row execute function pembayaran_cek_milik();

-- Siswa yang sudah membayar paket tidak bisa dikeluarkan dari paket itu
-- (riwayat & kuitansinya harus tetap punya induk).
create or replace function paket_siswa_cegah_hapus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pembayaran p where p.paket_id = old.paket_id and p.siswa_id = old.siswa_id)
     and exists (select 1 from paket_biaya k where k.id = old.paket_id) then
    raise exception 'Siswa % sudah membayar paket ini, jadi tidak bisa dikeluarkan. Batalkan dulu pembayarannya kalau memang salah.',
      (select nama from siswa where id = old.siswa_id);
  end if;
  return old;
end $$;
drop trigger if exists paket_siswa_cegah_hapus on paket_siswa;
create trigger paket_siswa_cegah_hapus before delete on paket_siswa
  for each row execute function paket_siswa_cegah_hapus();

-- ---------------------------------------------------------------------
-- 3. simpan / hapus paket (satu transaksi: data paket + siswa yang ditagih)
-- ---------------------------------------------------------------------
create or replace function paket_simpan(p_id uuid, p_data jsonb, p_siswa uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); k paket_biaya%rowtype; v_jenis text; v_ta text;
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('biaya') then raise exception 'Akun ini tidak punya akses mengatur jenis biaya.'; end if;
  perform wajib_langganan_aktif(v_sk);

  v_jenis := p_data ->> 'jenis';
  v_ta    := p_data ->> 'tahunAjaran';
  if v_jenis not in ('pmb', 'du') then raise exception 'Jenis paket harus PMB atau Daftar ulang.'; end if;
  if v_ta !~ '^[0-9]{4}/[0-9]{4}$' or split_part(v_ta, '/', 2)::int <> split_part(v_ta, '/', 1)::int + 1 then
    raise exception 'Tahun ajaran belum benar.';
  end if;

  if p_id is null then
    if exists (select 1 from paket_biaya where sekolah_id = v_sk and jenis = v_jenis and tahun_ajaran = v_ta and aktif) then
      raise exception 'Paket % tahun ajaran % sudah ada. Ubah paket yang sudah ada saja.',
        case v_jenis when 'pmb' then 'PMB' else 'daftar ulang' end, v_ta;
    end if;
    insert into paket_biaya (sekolah_id, jenis, tahun_ajaran, nama, rincian, tahap, total)
    values (v_sk, v_jenis, v_ta, coalesce(p_data ->> 'nama', ''), coalesce(p_data -> 'rincian', '[]'), coalesce(p_data -> 'tahap', '[]'), 1)
    returning * into k;
  else
    select * into k from paket_biaya where id = p_id and sekolah_id = v_sk and aktif for update;
    if not found then raise exception 'Paket tidak ditemukan.'; end if;
    if exists (select 1 from paket_biaya where sekolah_id = v_sk and jenis = v_jenis and tahun_ajaran = v_ta and aktif and id <> p_id) then
      raise exception 'Sudah ada paket lain untuk jenis & tahun ajaran itu.';
    end if;
    update paket_biaya set jenis = v_jenis, tahun_ajaran = v_ta, nama = coalesce(p_data ->> 'nama', nama),
           rincian = coalesce(p_data -> 'rincian', rincian), tahap = coalesce(p_data -> 'tahap', tahap)
     where id = p_id returning * into k;
  end if;

  if p_siswa is not null then
    -- keluarkan yang tidak dipilih lagi (ditolak trigger kalau sudah membayar)
    delete from paket_siswa where paket_id = k.id and not (siswa_id = any (p_siswa));
    insert into paket_siswa (paket_id, siswa_id, sekolah_id)
    select k.id, s.id, v_sk from siswa s where s.id = any (p_siswa) and s.sekolah_id = v_sk
    on conflict do nothing;
  end if;

  return to_jsonb(k) || jsonb_build_object('siswa', coalesce((select jsonb_agg(siswa_id) from paket_siswa where paket_id = k.id), '[]'));
end $$;

/** Tagihkan / lepaskan satu siswa dari paket (dipakai form Tambah siswa). */
create or replace function paket_atur_siswa(p_paket uuid, p_siswa uuid, p_ikut boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not (boleh('biaya') or boleh('siswa')) then raise exception 'Akun ini tidak punya akses mengatur tagihan siswa.'; end if;
  if not exists (select 1 from paket_biaya where id = p_paket and sekolah_id = v_sk and aktif) then raise exception 'Paket tidak ditemukan.'; end if;
  if p_ikut then
    insert into paket_siswa (paket_id, siswa_id, sekolah_id) values (p_paket, p_siswa, v_sk) on conflict do nothing;
  else
    delete from paket_siswa where paket_id = p_paket and siswa_id = p_siswa;
  end if;
end $$;

/** Hapus paket: yang sudah ada pembayarannya hanya dinonaktifkan (riwayat tetap utuh). */
create or replace function paket_hapus(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('biaya') then raise exception 'Akun ini tidak punya akses mengatur jenis biaya.'; end if;
  if not exists (select 1 from paket_biaya where id = p_id and sekolah_id = v_sk) then raise exception 'Paket tidak ditemukan.'; end if;
  if exists (select 1 from pembayaran where paket_id = p_id) then
    update paket_biaya set aktif = false where id = p_id;
    return 'diarsipkan';
  end if;
  delete from paket_biaya where id = p_id;
  return 'dihapus';
end $$;

-- ---------------------------------------------------------------------
-- 4. pindahkan biaya kegiatan "PMB"/"Daftar ulang" (cara lama) ke paket
-- ---------------------------------------------------------------------
create or replace function paket_dari_biaya_internal(p_biaya uuid, p_jenis text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b biaya%rowtype; v_ta text := tahun_ajaran_berjalan(); v_id uuid; v_nama text;
begin
  select * into b from biaya where id = p_biaya and aktif for update;
  if not found then raise exception 'Biaya kegiatan tidak ditemukan.'; end if;
  if b.nominal <= 0 then raise exception 'Nominal biaya "%" masih nol.', b.nama; end if;
  v_nama := case p_jenis when 'pmb' then 'PMB ' else 'Daftar ulang ' end || v_ta;

  select id into v_id from paket_biaya where sekolah_id = b.sekolah_id and jenis = p_jenis and tahun_ajaran = v_ta and aktif;
  if found then
    -- paket tahun ini sudah ada: tambahkan sebagai rincian baru (kalau belum ada jadwal cicilan)
    if exists (select 1 from paket_biaya where id = v_id and jsonb_array_length(tahap) > 0) then
      raise exception 'Paket % sudah punya jadwal cicilan. Tambahkan "%" sebagai rincian dari Jenis biaya.', v_nama, b.nama;
    end if;
    update paket_biaya set rincian = rincian || jsonb_build_array(jsonb_build_object('nama', b.nama, 'nominal', b.nominal))
     where id = v_id;
  else
    insert into paket_biaya (sekolah_id, jenis, tahun_ajaran, nama, rincian, tahap, total)
    values (b.sekolah_id, p_jenis, v_ta, v_nama, jsonb_build_array(jsonb_build_object('nama', b.nama, 'nominal', b.nominal)), '[]', b.nominal)
    returning id into v_id;
  end if;

  -- Cara lama menagih kegiatan ke SEMUA siswa aktif → paket juga (sekolah bisa mengurangi nanti),
  -- plus siswa lain yang pernah membayarnya.
  insert into paket_siswa (paket_id, siswa_id, sekolah_id)
  select v_id, s.id, b.sekolah_id from siswa s where s.sekolah_id = b.sekolah_id and s.aktif
  union
  select v_id, p.siswa_id, b.sekolah_id from pembayaran p where p.biaya_id = b.id
  on conflict do nothing;

  update pembayaran set jenis = 'paket', paket_id = v_id, biaya_id = null, keterangan = v_nama
   where biaya_id = b.id and jenis = 'kegiatan';
  update biaya set aktif = false where id = b.id;
  return v_id;
end $$;

create or replace function pindahkan_biaya_ke_paket(p_biaya uuid, p_jenis text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('biaya') then raise exception 'Akun ini tidak punya akses mengatur jenis biaya.'; end if;
  if p_jenis not in ('pmb', 'du') then raise exception 'Pilih PMB atau Daftar ulang.'; end if;
  if not exists (select 1 from biaya where id = p_biaya and sekolah_id = v_sk) then raise exception 'Biaya kegiatan tidak ditemukan.'; end if;
  return paket_dari_biaya_internal(p_biaya, p_jenis);
end $$;

-- otomatis: nama yang jelas-jelas PMB / daftar ulang
do $$
declare r record;
begin
  for r in
    select id, case when nama ~* 'daftar\s*ulang|^\s*du\s*$|registrasi\s*ulang|her[- ]?registrasi' then 'du' else 'pmb' end as jenis
      from biaya
     where aktif and (
       nama ~* '^\s*(pmb|ppdb|spmb|du)\s*([0-9/ -]*)?$'
       or nama ~* '^\s*(biaya\s+)?(penerimaan|pendaftaran)\s+(murid|siswa|peserta\s+didik)\s+baru'
       or nama ~* '^\s*(biaya\s+)?(pendaftaran|daftar\s*ulang|registrasi\s*ulang|her[- ]?registrasi|uang\s+pangkal)\s*([0-9/ -]*)?$')
     order by sekolah_id, urutan
  loop
    begin
      perform paket_dari_biaya_internal(r.id, r.jenis);
    exception when others then
      raise notice 'Biaya % tidak dipindahkan otomatis: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. pembatalan menyimpan paket_id
-- ---------------------------------------------------------------------
create or replace function batalkan_pembayaran(p_id uuid, p_alasan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr profil%rowtype; b pembayaran%rowtype; g kas_pengaturan%rowtype; r record; v_tgl date;
begin
  select * into pr from profil where id = auth.uid() and aktif;
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Tuliskan alasan pembatalan.'; end if;
  perform wajib_langganan_aktif(pr.sekolah_id);

  perform kas_kunci(pr.sekolah_id);
  select * into b from pembayaran where id = p_id and sekolah_id = pr.sekolah_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;

  insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, biaya_id, paket_id, keterangan, nominal, metode,
                                petugas, dicatat_oleh, dibayar_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
  values (b.id, b.sekolah_id, b.siswa_id, b.jenis, b.periode, b.biaya_id, b.paket_id, b.keterangan, b.nominal, b.metode,
          b.petugas, b.dicatat_oleh, b.dibayar_pada, pr.id, pr.nama, left(trim(p_alasan), 200));
  delete from pembayaran where id = b.id;

  select * into g from kas_pengaturan where sekolah_id = pr.sekolah_id;
  if found then
    v_tgl := (b.dibayar_pada at time zone 'Asia/Jakarta')::date;
    if v_tgl >= g.mulai then
      select * into r from kas_saldo_terendah(pr.sekolah_id, v_tgl);
      if r.saldo < 0 then
        raise exception 'Pembayaran ini tidak bisa dibatalkan: saldo kas akan minus (% pada %). Kalau salah siswa/bulan, catat dulu pembayaran yang benar lalu batalkan yang ini. Kalau uangnya memang tidak ada, batalkan dulu pengeluaran kas yang memakainya.',
          kas_rp(r.saldo), kas_tgl(r.tanggal);
      end if;
    end if;
  end if;

  return jsonb_build_object('id', b.id, 'nominal', b.nominal, 'keterangan', b.keterangan);
end $$;

-- ---------------------------------------------------------------------
-- 6. kuitansi: target & total terbayar untuk paket
-- ---------------------------------------------------------------------
create or replace function data_kuitansi(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'nomor', nomor_dokumen('KW', p.id, p.dibayar_pada),
    'dibayarPada', p.dibayar_pada,
    'jenis', p.jenis,
    'periode', p.periode,
    'keterangan', p.keterangan,
    'nominal', p.nominal,
    'metode', p.metode,
    'petugas', p.petugas,
    'target', case when p.jenis = 'spp' then s.spp_nominal when p.jenis = 'paket' then k.total else b.nominal end,
    'terbayarSampaiIni', (
      select coalesce(sum(q.nominal), 0) from pembayaran q
       where q.siswa_id = p.siswa_id and q.jenis = p.jenis
         and q.periode is not distinct from p.periode and q.biaya_id is not distinct from p.biaya_id
         and q.paket_id is not distinct from p.paket_id
         and (q.dibayar_pada, q.id) <= (p.dibayar_pada, p.id)),
    'paket', case when p.jenis = 'paket' then jsonb_build_object('nama', k.nama, 'jenis', k.jenis, 'rincian', k.rincian) end,
    'siswa', jsonb_build_object('nama', x.nama, 'kelas', x.kelas, 'nis', x.nis, 'wali', x.wali),
    'sekolah', jsonb_build_object('nama', s.nama, 'alamat', s.alamat, 'kepalaSekolah', s.kepala_sekolah, 'logo', t.logo),
    'ttd', jsonb_build_object(
      'nama', coalesce(t.nama_penandatangan, s.kepala_sekolah),
      'jabatan', case when t.nama_penandatangan is null then 'Kepala Sekolah'
                      else coalesce(t.jabatan, 'Bendahara') end,
      'gambar', t.ttd,
      'stempel', t.stempel)
  )
  from pembayaran p
  join siswa x   on x.id = p.siswa_id
  join sekolah s on s.id = p.sekolah_id
  left join biaya b on b.id = p.biaya_id
  left join paket_biaya k on k.id = p.paket_id
  left join sekolah_ttd t on t.sekolah_id = p.sekolah_id
  where p.id = p_id
$$;
revoke all on function data_kuitansi(uuid) from public;

-- ---------------------------------------------------------------------
-- 7. portal orang tua: paket anak-anak wali ini
-- ---------------------------------------------------------------------
create or replace function portal_wali(p_token text, p_nis text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  w   wali%rowtype;
  sk  sekolah%rowtype;
  v   jsonb;
begin
  v := portal_cek_nis(p_token, p_nis);
  if v is not null then
    return jsonb_build_object('gerbang', v);
  end if;
  select * into w from wali where token = p_token;
  select * into sk from sekolah where id = w.sekolah_id;

  return jsonb_build_object(
    'wali', jsonb_build_object('nama', w.nama),
    'sekolah', to_jsonb(sk) - 'hak_akses' - 'ai_batas_harian' - 'harga_per_siswa' - 'status_langganan',
    'biaya', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.urutan, b.nama)
      from biaya b where b.sekolah_id = w.sekolah_id and b.aktif
    ), '[]'::jsonb),
    'siswa', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nama)
      from siswa x
      join wali_siswa ws on ws.siswa_id = x.id
      where ws.wali_id = w.id and x.aktif
    ), '[]'::jsonb),
    'pembayaran', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.dibayar_pada desc)
      from pembayaran p
      join wali_siswa ws on ws.siswa_id = p.siswa_id
      where ws.wali_id = w.id
    ), '[]'::jsonb),
    'paket', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.tahun_ajaran, k.jenis)
      from paket_biaya k
      where k.aktif and exists (select 1 from paket_siswa ps join wali_siswa ws on ws.siswa_id = ps.siswa_id
                                 where ps.paket_id = k.id and ws.wali_id = w.id)
    ), '[]'::jsonb),
    'paket_siswa', coalesce((
      select jsonb_agg(jsonb_build_object('paket_id', ps.paket_id, 'siswa_id', ps.siswa_id))
      from paket_siswa ps join wali_siswa ws on ws.siswa_id = ps.siswa_id
      join paket_biaya k on k.id = ps.paket_id and k.aktif
      where ws.wali_id = w.id
    ), '[]'::jsonb)
  );
end $$;
revoke all on function portal_wali(text, text) from public;
grant execute on function portal_wali(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. buku kas: kategori pemasukan PMB / Daftar ulang
-- ---------------------------------------------------------------------
create or replace function kas_gerakan(p_sk uuid, p_dari date default null, p_sampai date default null)
returns table(sumber text, id uuid, tanggal date, jenis text, kategori text, nominal bigint, keterangan text, urut timestamptz)
language sql stable security definer set search_path = public as $$
  with m as (
    select greatest(coalesce((select g.mulai from kas_pengaturan g where g.sekolah_id = p_sk), '-infinity'::date),
                    coalesce(p_dari, '-infinity'::date)) as dari,
           coalesce(p_sampai, 'infinity'::date) as sampai
  )
  select 'bayar', b.id, (b.dibayar_pada at time zone 'Asia/Jakarta')::date, 'masuk',
         case when b.jenis = 'spp' then 'SPP'
              when b.jenis = 'paket' then (select case k.jenis when 'pmb' then 'PMB' else 'Daftar ulang' end from paket_biaya k where k.id = b.paket_id)
              else 'Biaya kegiatan' end,
         b.nominal::bigint, b.keterangan, b.dibayar_pada
    from pembayaran b, m
   where b.sekolah_id = p_sk
     and (m.dari = '-infinity'::date or b.dibayar_pada >= (m.dari::timestamp at time zone 'Asia/Jakarta'))
     and (m.sampai = 'infinity'::date or b.dibayar_pada < ((m.sampai + 1)::timestamp at time zone 'Asia/Jakarta'))
  union all
  select 'kas', k.id, k.tanggal, k.jenis, k.kategori, k.nominal, k.keterangan, k.dibuat_pada
    from kas k, m
   where k.sekolah_id = p_sk and k.dibatalkan_pada is null
     and k.tanggal >= m.dari and k.tanggal <= m.sampai
$$;
revoke all on function kas_gerakan(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. SAKU (Tanya AI) mengenal PMB & daftar ulang
-- ---------------------------------------------------------------------
create or replace function ai_paket_ringkas(p_sk uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'nama', k.nama,
           'jenis', case k.jenis when 'pmb' then 'PMB (pendaftaran murid baru)' else 'Daftar ulang' end,
           'tahun_ajaran', k.tahun_ajaran,
           'nominal_per_siswa', k.total,
           'rincian', k.rincian,
           'jadwal_cicilan', k.tahap,
           'jumlah_siswa_ditagih', x.n,
           'sudah_lunas', x.lunas,
           'belum_lunas', x.n - x.lunas,
           'target_rupiah', k.total::bigint * x.n,
           'terkumpul_rupiah', x.masuk,
           'kekurangan_rupiah', x.kurang,
           'siswa_belum_lunas', x.belum) order by k.tahun_ajaran desc, k.jenis), '[]'::jsonb)
    from paket_biaya k
    cross join lateral (
      select count(*) n,
             count(*) filter (where d.bayar >= k.total) lunas,
             coalesce(sum(least(d.bayar, k.total)), 0) masuk,
             coalesce(sum(greatest(0, k.total - d.bayar)), 0) kurang,
             coalesce(jsonb_agg(jsonb_build_object('siswa', d.nama, 'kelas', d.kelas, 'sudah_bayar', d.bayar, 'kurang', k.total - d.bayar)
                                order by d.kelas, d.nama) filter (where d.bayar < k.total), '[]') belum
        from (select s.nama, s.kelas,
                     coalesce((select sum(p.nominal) from pembayaran p where p.paket_id = k.id and p.siswa_id = s.id), 0) bayar
                from paket_siswa ps join siswa s on s.id = ps.siswa_id
               where ps.paket_id = k.id and s.aktif) d
    ) x
   where k.sekolah_id = p_sk and k.aktif
$$;
revoke all on function ai_paket_ringkas(uuid) from public, anon, authenticated;

-- ai_mulai: konteks awal SAKU ikut membawa ringkasan PMB & daftar ulang
create or replace function ai_mulai(p_batas integer default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  s        sekolah%rowtype;
  v_hari   date := ai_hari_ini();
  v_kini   int  := ai_indeks_bulan(v_hari);
  v_batas  int;
  v_jumlah int;
  v_awal   int;
  v_kunci  uuid;
  v_kas    jsonb;
begin
  if not boleh('ai') then
    raise exception 'Akun ini tidak punya akses ke SAKU.';
  end if;

  select * into s from sekolah where id = v_sk;
  if hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status' = 'kadaluarsa' then
    raise exception 'Masa langganan sedang tidak aktif. SAKU bisa dipakai lagi setelah langganan diperpanjang.';
  end if;

  v_batas := coalesce(s.ai_batas_harian, p_batas);
  if v_batas <= 0 then
    raise exception 'SAKU sedang dimatikan untuk sekolah ini. Hubungi admin aplikasi kalau ingin mengaktifkannya.';
  end if;

  insert into ai_pemakaian as a (sekolah_id, tanggal, jumlah)
  values (v_sk, v_hari, 1)
  on conflict (sekolah_id, tanggal) do update set jumlah = a.jumlah + 1
  returning jumlah into v_jumlah;

  if v_jumlah > v_batas then
    raise exception 'Batas % pertanyaan hari ini sudah tercapai. SAKU bisa dipakai lagi besok.', v_batas;
  end if;

  delete from ai_permintaan where sekolah_id = v_sk and dibuat_pada < now() - interval '1 day';
  insert into ai_permintaan (sekolah_id, tanggal) values (v_sk, v_hari) returning id into v_kunci;

  v_awal := case when extract(month from v_hari) >= 7 then extract(year from v_hari)::int
                 else extract(year from v_hari)::int - 1 end;

  if boleh('kas', 'lihat') or boleh('lap_keuangan', 'lihat') then
    v_kas := jsonb_build_object(
      'akses', true,
      'saldo_awal_diisi', exists (select 1 from kas_pengaturan g where g.sekolah_id = v_sk),
      'tanggal_mulai_kas', (select g.mulai from kas_pengaturan g where g.sekolah_id = v_sk),
      'saldo_kas_saat_ini', kas_saldo_per(v_sk, v_hari));
  else
    v_kas := jsonb_build_object('akses', false,
      'catatan', 'Akun ini tidak punya akses melihat kas sekolah, jadi data kas tidak boleh dibacakan.');
  end if;

  return jsonb_build_object(
    'nama_asisten', 'SAKU (Sahabat Keuangan Sekolah)',
    'nama_sekolah', s.nama,
    'kepala_sekolah', s.kepala_sekolah,
    'penanya', (select nama || ' (' || case peran when 'kepala' then 'kepala sekolah' else 'admin/TU sekolah' end || ')'
                  from profil where id = auth.uid()),
    'hari_ini', to_char(v_hari, 'YYYY-MM-DD'),
    'tahun_ajaran', v_awal || '/' || (v_awal + 1),
    'bulan_berjalan', jsonb_build_object('periode', v_kini, 'nama', ai_nama_bulan(v_kini)),
    'nominal_spp', s.spp_nominal,
    'jatuh_tempo_spp', case when s.tanggal_jatuh_tempo >= 29 then 'akhir bulan'
                            else 'tanggal ' || s.tanggal_jatuh_tempo end,
    'jatuh_tempo_bulan_ini', to_char(ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', v_hari)::date), 'YYYY-MM-DD'),
    'kelas', coalesce((select jsonb_agg(jsonb_build_object('kelas', k.kelas, 'jumlah_siswa', k.n) order by k.kelas)
                         from (select kelas, count(*) n from siswa where sekolah_id = v_sk and aktif group by kelas) k), '[]'),
    'jumlah_siswa_aktif', (select count(*) from siswa where sekolah_id = v_sk and aktif),
    'jenis_kegiatan', coalesce((select jsonb_agg(jsonb_build_object('nama', b.nama, 'nominal', b.nominal) order by b.urutan)
                                  from biaya b where b.sekolah_id = v_sk and b.aktif), '[]'),
    'pmb_dan_daftar_ulang', ai_paket_ringkas(v_sk),
    'kas', v_kas,
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas),
    'kunci_pemakaian', v_kunci
  );
end $$;

-- rekap bulan & transaksi: pisahkan uang PMB/daftar ulang
create or replace function ai_rekap_bulan(p_bulan int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk    uuid := ai_sekolah_wajib();
  s       sekolah%rowtype;
  v_hari  date := ai_hari_ini();
  v_kini  int  := ai_indeks_bulan(v_hari);
  v_i     int  := coalesce(p_bulan, ai_indeks_bulan(ai_hari_ini()));
  v_awal  date;
  v_akhir date;
  v_spp   jsonb;
  v_masuk jsonb;
begin
  if v_i < 0 or v_i > 11 then
    raise exception 'Bulan tidak dikenal. Pakai 0 = Juli sampai 11 = Juni.';
  end if;
  select * into s from sekolah where id = v_sk;
  v_awal  := ai_awal_periode(v_i, v_hari);
  v_akhir := (v_awal + interval '1 month')::date;

  select jsonb_build_object(
           'lunas',                   count(*) filter (where status = 'lunas'),
           'bayar_sebagian',          count(*) filter (where status = 'sebagian'),
           'belum_bayar_sama_sekali', count(*) filter (where status in ('nunggak', 'belum-bayar')),
           'belum_jatuh_tempo',       count(*) filter (where status = 'menunggu'),
           'target_rupiah',           coalesce(sum(target), 0),
           'sudah_masuk_rupiah',      coalesce(sum(dibayar), 0),
           'kekurangan_rupiah',       coalesce(sum(greatest(0, target - dibayar)), 0))
    into v_spp
    from ai_spp_siswa(v_sk, v_hari) where periode = v_i;

  select jsonb_build_object(
           'keterangan', 'Semua uang yang dicatat masuk pada tanggal ' || to_char(v_awal, 'YYYY-MM-DD')
                         || ' s.d. ' || to_char(v_akhir - 1, 'YYYY-MM-DD')
                         || ' (termasuk SPP bulan lain, kegiatan, PMB & daftar ulang). Bisa beda dengan "SPP bulan ini".',
           'jumlah_transaksi', count(*),
           'total',    coalesce(sum(p.nominal), 0),
           'spp',      coalesce(sum(p.nominal) filter (where p.jenis = 'spp'), 0),
           'kegiatan', coalesce(sum(p.nominal) filter (where p.jenis = 'kegiatan'), 0),
           'pmb_dan_daftar_ulang', coalesce(sum(p.nominal) filter (where p.jenis = 'paket'), 0),
           'tunai',    coalesce(sum(p.nominal) filter (where p.metode = 'Tunai'), 0),
           'transfer', coalesce(sum(p.nominal) filter (where p.metode = 'Transfer'), 0),
           'tabungan', coalesce(sum(p.nominal) filter (where p.metode = 'Tabungan'), 0),
           'per_kegiatan', coalesce((
              select jsonb_agg(jsonb_build_object('kegiatan', b.nama, 'total', t.total) order by t.total desc)
                from (select q.biaya_id, sum(q.nominal) total from pembayaran q
                       where q.sekolah_id = v_sk and q.jenis = 'kegiatan'
                         and (q.dibayar_pada at time zone 'Asia/Jakarta')::date >= v_awal
                         and (q.dibayar_pada at time zone 'Asia/Jakarta')::date <  v_akhir
                       group by q.biaya_id) t
                join biaya b on b.id = t.biaya_id), '[]'))
    into v_masuk
    from pembayaran p
   where p.sekolah_id = v_sk
     and (p.dibayar_pada at time zone 'Asia/Jakarta')::date >= v_awal
     and (p.dibayar_pada at time zone 'Asia/Jakarta')::date <  v_akhir;

  return jsonb_build_object(
    'bulan', ai_nama_bulan(v_i) || ' ' || extract(year from v_awal),
    'periode', v_i,
    'keadaan_bulan', case when v_i < v_kini then 'sudah lewat'
                          when v_i = v_kini then 'sedang berjalan' else 'belum datang' end,
    'jatuh_tempo_spp', to_char(ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, v_awal), 'YYYY-MM-DD'),
    'nominal_spp_per_siswa', s.spp_nominal,
    'jumlah_siswa_aktif', (select count(*) from siswa where sekolah_id = v_sk and aktif),
    'spp_bulan_ini', v_spp,
    'uang_masuk_selama_bulan_ini', v_masuk
  );
end $$;

create or replace function ai_transaksi(p_dari date default null, p_sampai date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  v_dari   date := coalesce(p_dari, p_sampai, ai_hari_ini());
  v_sampai date := coalesce(p_sampai, p_dari, ai_hari_ini());
begin
  if v_sampai < v_dari then
    raise exception 'Tanggal akhir lebih awal dari tanggal mulai.';
  end if;
  if v_sampai - v_dari > 92 then
    raise exception 'Rentang tanggal maksimal 3 bulan.';
  end if;

  return (
    with t as (
      select p.*, x.nama as nama_siswa, x.kelas, b.nama as nama_kegiatan, k.nama as nama_paket,
             p.dibayar_pada at time zone 'Asia/Jakarta' as waktu
        from pembayaran p
        join siswa x on x.id = p.siswa_id
        left join biaya b on b.id = p.biaya_id
        left join paket_biaya k on k.id = p.paket_id
       where p.sekolah_id = v_sk
         and (p.dibayar_pada at time zone 'Asia/Jakarta')::date between v_dari and v_sampai
    )
    select jsonb_build_object(
      'dari', to_char(v_dari, 'YYYY-MM-DD'),
      'sampai', to_char(v_sampai, 'YYYY-MM-DD'),
      'jumlah_transaksi', (select count(*) from t),
      'total', (select coalesce(sum(nominal), 0) from t),
      'spp', (select coalesce(sum(nominal), 0) from t where jenis = 'spp'),
      'kegiatan', (select coalesce(sum(nominal), 0) from t where jenis = 'kegiatan'),
      'pmb_dan_daftar_ulang', (select coalesce(sum(nominal), 0) from t where jenis = 'paket'),
      'tunai', (select coalesce(sum(nominal), 0) from t where metode = 'Tunai'),
      'transfer', (select coalesce(sum(nominal), 0) from t where metode = 'Transfer'),
      'tabungan', (select coalesce(sum(nominal), 0) from t where metode = 'Tabungan'),
      'per_petugas', coalesce((select jsonb_agg(jsonb_build_object('petugas', petugas, 'jumlah', n, 'total', total) order by total desc)
                                 from (select coalesce(nullif(petugas, ''), '-') petugas, count(*) n, sum(nominal) total
                                         from t group by 1) q), '[]'),
      'ditampilkan', least(1000, (select count(*) from t)),
      'transaksi', coalesce((select jsonb_agg(o order by w) from (
          select t.waktu as w, jsonb_build_object(
                   'waktu', to_char(t.waktu, 'YYYY-MM-DD HH24:MI'),
                   'siswa', t.nama_siswa, 'kelas', t.kelas,
                   'untuk', t.keterangan,
                   'jenis', case when t.jenis = 'spp' then 'SPP ' || ai_nama_bulan(t.periode)
                                 when t.jenis = 'paket' then coalesce(t.nama_paket, 'PMB/Daftar ulang')
                                 else 'Kegiatan ' || coalesce(t.nama_kegiatan, '') end,
                   'nominal', t.nominal, 'metode', t.metode, 'petugas', nullif(t.petugas, '')) as o
            from t order by t.waktu limit 1000) z), '[]')
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- 10. hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function tahun_ajaran_berjalan(date) from public;
revoke all on function paket_simpan(uuid, jsonb, uuid[]) from public;
revoke all on function paket_atur_siswa(uuid, uuid, boolean) from public;
revoke all on function paket_hapus(uuid) from public;
revoke all on function paket_dari_biaya_internal(uuid, text) from public, anon, authenticated;
revoke all on function pindahkan_biaya_ke_paket(uuid, text) from public;
revoke all on function batalkan_pembayaran(uuid, text) from public;
revoke all on function ai_mulai(integer) from public;
revoke all on function ai_rekap_bulan(int) from public;
revoke all on function ai_transaksi(date, date) from public;
grant execute on function tahun_ajaran_berjalan(date) to authenticated;
grant execute on function paket_simpan(uuid, jsonb, uuid[]) to authenticated;
grant execute on function paket_atur_siswa(uuid, uuid, boolean) to authenticated;
grant execute on function paket_hapus(uuid) to authenticated;
grant execute on function pindahkan_biaya_ke_paket(uuid, text) to authenticated;
grant execute on function batalkan_pembayaran(uuid, text) to authenticated;
grant execute on function ai_mulai(integer) to authenticated;
grant execute on function ai_rekap_bulan(int) to authenticated;
grant execute on function ai_transaksi(date, date) to authenticated;
grant select, insert, update, delete on paket_biaya, paket_siswa to authenticated;
