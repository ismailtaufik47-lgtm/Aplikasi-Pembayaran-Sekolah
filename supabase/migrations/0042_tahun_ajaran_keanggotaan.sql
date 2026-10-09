-- =====================================================================
-- 0042 — Tahun ajaran sebagai "tanggal operasional" sekolah
--
--  1. tahun_ajaran   : satu baris per sekolah per tahun ajaran — tarif SPP
--                      standar + tarif khusus per kelas (mis. B1 = 175.000).
--  2. siswa_tahun    : keanggotaan siswa per tahun ajaran — kelas, bulan mulai
--                      ditagih, bulan terakhir (keluar/pindah), hasil akhir
--                      tahun (naik / tinggal kelas / lulus / tidak lanjut).
--                      Riwayat kelas tiap anak bisa dilacak; rekap per kelas
--                      tahun lalu memakai kelas SAAT ITU.
--  3. biaya.tahun_ajaran : kegiatan milik satu tahun ajaran.
--  4. Pergantian tahun otomatis (seperti ganti tanggal operasional):
--     pertama kali aplikasi / portal / pencatatan dipakai pada tahun ajaran
--     baru, pastikan_ta() "membuka" tahun itu: tarif disalin dari tahun lalu,
--     siswa aktif dibawa ke kelas yang sama (kalau wizard kenaikan belum
--     dijalankan), siswa yang diluluskan jadi alumni, kelas siswa diperbarui.
--  5. Tagihan hanya untuk bulan & kegiatan saat siswa terdaftar.
--  6. Status siswa baru: 'keluar' (keluar / pindah sekolah di tengah tahun).
--
--  Butuh 0041. Aman dijalankan ulang. Data lama otomatis diisi:
--   • tahun berjalan : semua siswa aktif terdaftar sejak Juli di kelasnya sekarang
--   • tahun lalu     : dari pembayaran SPP tahun itu (mulai = bulan pertama dibayar)
--   • alumni         : tercatat lulus di tahun_lulus-nya
--   • kegiatan       : tahun ajaran dari tanggal kegiatan (tanpa tanggal = tahun berjalan)
-- =====================================================================

-- ---------- helper kode tahun ajaran ----------
create or replace function ta_valid(p text) returns boolean
language sql immutable as $$
  select p ~ '^[0-9]{4}/[0-9]{4}$' and split_part(p, '/', 2)::int = split_part(p, '/', 1)::int + 1
$$;

create or replace function ta_geser(p text, n int) returns text
language sql immutable as $$
  select (split_part(p, '/', 1)::int + n) || '/' || (split_part(p, '/', 1)::int + n + 1)
$$;

-- ---------- 1. tahun ajaran & tarif ----------
create table if not exists tahun_ajaran (
  sekolah_id    uuid not null references sekolah(id) on delete cascade,
  kode          text not null check (ta_valid(kode)),
  spp_nominal   integer not null check (spp_nominal >= 0),
  spp_kelas     jsonb not null default '{}'::jsonb,   -- {"B1": 175000, "B2": 175000}
  dibuka_pada   timestamptz,                         -- pergantian tahun sudah diproses
  kenaikan_pada timestamptz,                         -- wizard kenaikan kelas KE tahun ini sudah dijalankan
  dibuat_pada   timestamptz not null default now(),
  primary key (sekolah_id, kode),
  constraint tahun_ajaran_spp_kelas_objek check (jsonb_typeof(spp_kelas) = 'object')
);

-- ---------- 2. keanggotaan siswa per tahun ajaran ----------
create table if not exists siswa_tahun (
  sekolah_id   uuid not null references sekolah(id) on delete cascade,
  siswa_id     uuid not null references siswa(id) on delete cascade,
  tahun_ajaran text not null check (ta_valid(tahun_ajaran)),
  kelas        text not null check (length(trim(kelas)) between 1 and 40),
  mulai        smallint not null default 0 check (mulai between 0 and 11),     -- bulan pertama ditagih (0 = Juli)
  selesai      smallint check (selesai between 0 and 11),                      -- bulan terakhir ditagih; null = s/d Juni
  akhir        text check (akhir in ('naik', 'tinggal', 'lulus', 'tidak_lanjut', 'keluar', 'pindah')),
  catatan      text check (length(catatan) <= 200),
  diubah_pada  timestamptz not null default now(),
  primary key (siswa_id, tahun_ajaran),
  constraint siswa_tahun_urut check (selesai is null or selesai >= mulai)
);
create index if not exists siswa_tahun_sekolah_idx on siswa_tahun (sekolah_id, tahun_ajaran);

alter table tahun_ajaran enable row level security;
alter table siswa_tahun  enable row level security;
drop policy if exists tahun_ajaran_baca on tahun_ajaran;
drop policy if exists siswa_tahun_baca on siswa_tahun;
create policy tahun_ajaran_baca on tahun_ajaran for select using (sekolah_id = sekolah_saya());
create policy siswa_tahun_baca  on siswa_tahun  for select using (sekolah_id = sekolah_saya());
-- tulis HANYA lewat fungsi resmi di bawah (cek hak akses + aturan pembayaran)
revoke insert, update, delete on tahun_ajaran from anon, authenticated;
revoke insert, update, delete on siswa_tahun  from anon, authenticated;
grant select on tahun_ajaran, siswa_tahun to authenticated;

-- ---------- 3. kegiatan per tahun ajaran ----------
alter table biaya add column if not exists tahun_ajaran text;
update biaya set tahun_ajaran = tahun_ajaran_berjalan(tanggal) where tahun_ajaran is null and tanggal is not null;
update biaya set tahun_ajaran = tahun_ajaran_berjalan() where tahun_ajaran is null;
alter table biaya alter column tahun_ajaran set default tahun_ajaran_berjalan();
alter table biaya alter column tahun_ajaran set not null;
alter table biaya drop constraint if exists biaya_tahun_ajaran_valid;
alter table biaya add constraint biaya_tahun_ajaran_valid check (ta_valid(tahun_ajaran));
create index if not exists biaya_sekolah_ta_idx on biaya (sekolah_id, tahun_ajaran) where aktif;

-- ---------- 6. status siswa 'keluar' ----------
alter table siswa drop constraint if exists siswa_status_siswa_check;
alter table siswa add constraint siswa_status_siswa_check check (status_siswa in ('aktif', 'alumni', 'keluar'));

-- ---------- isi data lama ----------
-- tahun berjalan: kelas siswa sekarang sudah benar → dianggap sudah "naik kelas" (tidak muncul pengingat)
insert into tahun_ajaran (sekolah_id, kode, spp_nominal, dibuka_pada, kenaikan_pada)
select s.id, tahun_ajaran_berjalan(), coalesce(s.spp_nominal, 0), now(), now() from sekolah s
on conflict (sekolah_id, kode) do update set dibuka_pada = coalesce(tahun_ajaran.dibuka_pada, now()),
                                             kenaikan_pada = coalesce(tahun_ajaran.kenaikan_pada, now());

insert into tahun_ajaran (sekolah_id, kode, spp_nominal, dibuka_pada)
select distinct p.sekolah_id, p.tahun_ajaran, coalesce(s.spp_nominal, 0), now()
  from pembayaran p join sekolah s on s.id = p.sekolah_id
 where p.jenis = 'spp' and p.tahun_ajaran is not null and p.tahun_ajaran < tahun_ajaran_berjalan()
on conflict do nothing;

insert into tahun_ajaran (sekolah_id, kode, spp_nominal, dibuka_pada)
select distinct b.sekolah_id, b.tahun_ajaran, coalesce(s.spp_nominal, 0), now()
  from biaya b join sekolah s on s.id = b.sekolah_id
 where b.tahun_ajaran < tahun_ajaran_berjalan()
on conflict do nothing;

-- siswa aktif → terdaftar tahun berjalan sejak Juli
insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
select x.sekolah_id, x.id, tahun_ajaran_berjalan(), x.kelas, 0
  from siswa x where x.status_siswa = 'aktif' and x.aktif
on conflict do nothing;

-- alumni → tercatat lulus di tahun_lulus-nya
insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, akhir)
select x.sekolah_id, x.id, x.tahun_lulus, x.kelas, 0, 'lulus'
  from siswa x where x.status_siswa = 'alumni' and ta_valid(coalesce(x.tahun_lulus, ''))
on conflict (siswa_id, tahun_ajaran) do update set akhir = 'lulus';

-- tahun ajaran lalu dari pembayaran SPP (mulai = bulan pertama yang dibayar)
insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
select p.sekolah_id, p.siswa_id, p.tahun_ajaran, min(x.kelas), min(p.periode)
  from pembayaran p join siswa x on x.id = p.siswa_id
 where p.jenis = 'spp' and p.tahun_ajaran < tahun_ajaran_berjalan()
 group by p.sekolah_id, p.siswa_id, p.tahun_ajaran
on conflict do nothing;

-- tahun ajaran lalu dari pembayaran kegiatan tahun itu (yang belum tercatat di atas)
insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
select p.sekolah_id, p.siswa_id, b.tahun_ajaran, min(x.kelas), 0
  from pembayaran p join biaya b on b.id = p.biaya_id join siswa x on x.id = p.siswa_id
 where p.jenis = 'kegiatan' and b.tahun_ajaran < tahun_ajaran_berjalan()
 group by p.sekolah_id, p.siswa_id, b.tahun_ajaran
on conflict do nothing;

-- =====================================================================
-- Fungsi inti
-- =====================================================================

-- Tarif SPP satu kelas pada satu tahun ajaran (kelas khusus → standar tahun itu → nominal sekolah)
create or replace function spp_tarif(p_sekolah uuid, p_ta text, p_kelas text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce((t.spp_kelas ->> p_kelas)::int, t.spp_nominal) from tahun_ajaran t
      where t.sekolah_id = p_sekolah and t.kode = p_ta),
    (select spp_nominal from sekolah where id = p_sekolah), 0)
$$;

-- Target SPP satu siswa untuk satu bulan (0 = tidak ditagih: belum terdaftar / sudah keluar)
create or replace function spp_target(p_siswa uuid, p_ta text, p_bulan int) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when p_bulan between st.mulai and coalesce(st.selesai, 11)
                then spp_tarif(st.sekolah_id, st.tahun_ajaran, st.kelas) else 0 end
      from siswa_tahun st where st.siswa_id = p_siswa and st.tahun_ajaran = p_ta), 0)
$$;

-- Apakah siswa ditagih kegiatan ini? Terdaftar di tahun ajaran kegiatannya,
-- dan (kalau kegiatannya bertanggal) tanggalnya di dalam masa terdaftar.
create or replace function kegiatan_wajib(p_siswa uuid, p_biaya uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from biaya b join siswa_tahun st on st.siswa_id = p_siswa and st.tahun_ajaran = b.tahun_ajaran
     where b.id = p_biaya
       and (b.tanggal is null
            or ((extract(month from b.tanggal)::int + 5) % 12) between st.mulai and coalesce(st.selesai, 11)))
$$;

-- Nama bulan + tahun kalender untuk pesan ("Juli 2026")
create or replace function ta_nama_bulan(p_ta text, p_bulan int) returns text
language sql immutable as $$
  select (array['Juli','Agustus','September','Oktober','November','Desember','Januari','Februari','Maret','April','Mei','Juni'])[p_bulan + 1]
         || ' ' || (split_part(p_ta, '/', 1)::int + case when p_bulan >= 6 then 1 else 0 end)
$$;

-- ---------- pergantian tahun ajaran (otomatis, sekali per tahun per sekolah) ----------
create or replace function pastikan_ta(p_sekolah uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ta   text := tahun_ajaran_berjalan();
  v_lalu text := ta_geser(tahun_ajaran_berjalan(), -1);
begin
  if p_sekolah is null then return; end if;
  if exists (select 1 from tahun_ajaran where sekolah_id = p_sekolah and kode = v_ta and dibuka_pada is not null) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('buka-ta:' || p_sekolah::text, 0));
  if exists (select 1 from tahun_ajaran where sekolah_id = p_sekolah and kode = v_ta and dibuka_pada is not null) then
    return;
  end if;

  -- tarif tahun baru: salin dari tahun lalu (kalau wizard belum membuatnya)
  insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas)
  select p_sekolah, v_ta,
         coalesce((select spp_nominal from tahun_ajaran where sekolah_id = p_sekolah and kode = v_lalu),
                  (select spp_nominal from sekolah where id = p_sekolah), 0),
         coalesce((select spp_kelas from tahun_ajaran where sekolah_id = p_sekolah and kode = v_lalu), '{}'::jsonb)
  on conflict do nothing;

  -- siswa aktif yang belum diproses wizard → dibawa ke kelas yang sama
  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
  select x.sekolah_id, x.id, v_ta, coalesce(l.kelas, x.kelas), 0
    from siswa x
    left join siswa_tahun l on l.siswa_id = x.id and l.tahun_ajaran = v_lalu
   where x.sekolah_id = p_sekolah and x.status_siswa = 'aktif' and x.aktif
     and coalesce(l.akhir, '') not in ('lulus', 'tidak_lanjut', 'keluar', 'pindah')
     and (l.siswa_id is not null or not exists (select 1 from siswa_tahun z where z.siswa_id = x.id and z.tahun_ajaran > v_ta))
  on conflict do nothing;

  -- yang diluluskan / tidak melanjutkan di tahun lalu → status berubah sekarang
  update siswa x set status_siswa = 'alumni', tahun_lulus = v_lalu
    from siswa_tahun l
   where l.siswa_id = x.id and l.tahun_ajaran = v_lalu and l.akhir = 'lulus'
     and x.sekolah_id = p_sekolah and x.status_siswa = 'aktif';
  update siswa x set status_siswa = 'keluar'
    from siswa_tahun l
   where l.siswa_id = x.id and l.tahun_ajaran = v_lalu and l.akhir = 'tidak_lanjut'
     and x.sekolah_id = p_sekolah and x.status_siswa = 'aktif'
     and not exists (select 1 from siswa_tahun z where z.siswa_id = x.id and z.tahun_ajaran = v_ta);

  -- kelas "sekarang" di data siswa mengikuti keanggotaan tahun berjalan
  update siswa x set kelas = st.kelas
    from siswa_tahun st
   where st.siswa_id = x.id and st.tahun_ajaran = v_ta and x.sekolah_id = p_sekolah and x.kelas is distinct from st.kelas;

  update tahun_ajaran set dibuka_pada = now() where sekolah_id = p_sekolah and kode = v_ta;
  update sekolah s set spp_nominal = t.spp_nominal
    from tahun_ajaran t where t.sekolah_id = s.id and t.kode = v_ta and s.id = p_sekolah and s.spp_nominal is distinct from t.spp_nominal;
end $$;

/** Dipanggil aplikasi saat dibuka. → { ta, kenaikanSudah, taDepan, kenaikanDepanSudah } */
create or replace function siapkan_tahun_ajaran() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); v_ta text := tahun_ajaran_berjalan();
begin
  if v_sk is null then return null; end if;
  perform pastikan_ta(v_sk);
  return jsonb_build_object(
    'ta', v_ta,
    'kenaikanSudah', (select kenaikan_pada is not null from tahun_ajaran where sekolah_id = v_sk and kode = v_ta),
    'taDepan', ta_geser(v_ta, 1),
    'kenaikanDepanSudah', coalesce((select kenaikan_pada is not null from tahun_ajaran where sekolah_id = v_sk and kode = ta_geser(v_ta, 1)), false));
end $$;

-- ---------- sinkron data siswa ↔ keanggotaan ----------
create or replace function siswa_ke_keanggotaan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ta text := tahun_ajaran_berjalan();
begin
  if tg_op = 'INSERT' then
    -- siswa baru: terdaftar tahun berjalan sejak Juli (aplikasi bisa mengubah bulan mulai sesudahnya)
    if new.status_siswa = 'aktif' and new.aktif then
      insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
      values (new.sekolah_id, new.id, v_ta, new.kelas, 0) on conflict do nothing;
    end if;
    return new;
  end if;
  -- kelas diubah dari form siswa → kelas tahun berjalan ikut
  if new.kelas is distinct from old.kelas then
    update siswa_tahun set kelas = new.kelas, diubah_pada = now()
     where siswa_id = new.id and tahun_ajaran = v_ta and kelas is distinct from new.kelas;
  end if;
  -- diluluskan langsung (cara lama) → catat lulus di tahun lulusnya
  if new.status_siswa = 'alumni' and old.status_siswa is distinct from 'alumni' and ta_valid(coalesce(new.tahun_lulus, '')) then
    insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, akhir)
    values (new.sekolah_id, new.id, new.tahun_lulus, new.kelas, 0, 'lulus')
    on conflict (siswa_id, tahun_ajaran) do update set akhir = 'lulus', diubah_pada = now();
  end if;
  -- alumni / keluar dikembalikan aktif → hapus tanda lulus/keluar, pastikan terdaftar tahun berjalan
  if new.status_siswa = 'aktif' and old.status_siswa <> 'aktif' then
    update siswa_tahun set akhir = null, selesai = case when akhir in ('keluar', 'pindah') then null else selesai end, diubah_pada = now()
     where siswa_id = new.id and akhir in ('lulus', 'keluar', 'pindah', 'tidak_lanjut')
       and tahun_ajaran >= coalesce(old.tahun_lulus, ta_geser(v_ta, -1));
    insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
    values (new.sekolah_id, new.id, v_ta, new.kelas, 0) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists siswa_keanggotaan on siswa;
create trigger siswa_keanggotaan after insert or update of kelas, status_siswa on siswa
  for each row execute function siswa_ke_keanggotaan();

create or replace function keanggotaan_ke_siswa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tahun_ajaran = tahun_ajaran_berjalan() then
    update siswa set kelas = new.kelas where id = new.siswa_id and kelas is distinct from new.kelas;
  end if;
  return new;
end $$;

drop trigger if exists siswa_tahun_kelas on siswa_tahun;
create trigger siswa_tahun_kelas after insert or update of kelas on siswa_tahun
  for each row execute function keanggotaan_ke_siswa();

-- nominal SPP diubah dari layar lama (Jenis biaya › SPP) → tarif standar tahun berjalan ikut
create or replace function sekolah_ke_tarif() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.spp_nominal is distinct from old.spp_nominal then
    insert into tahun_ajaran (sekolah_id, kode, spp_nominal, dibuka_pada)
    values (new.id, tahun_ajaran_berjalan(), new.spp_nominal, now())
    on conflict (sekolah_id, kode) do update set spp_nominal = excluded.spp_nominal
     where tahun_ajaran.spp_nominal is distinct from excluded.spp_nominal;
  end if;
  return new;
end $$;

drop trigger if exists sekolah_tarif_spp on sekolah;
create trigger sekolah_tarif_spp after update of spp_nominal on sekolah
  for each row execute function sekolah_ke_tarif();

-- =====================================================================
-- Fungsi untuk aplikasi (semua cek hak akses)
-- =====================================================================

-- Tarif SPP satu tahun ajaran: standar + per kelas. Kelas yang nominalnya sama
-- dengan standar tidak disimpan.
create or replace function atur_tarif_spp(p_ta text, p_standar int, p_kelas jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); v_kelas jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if v_sk is null or not boleh('biaya') then
    raise exception 'Akun ini tidak punya akses mengubah nominal SPP.' using errcode = '42501';
  end if;
  if not ta_valid(coalesce(p_ta, '')) or p_ta > ta_geser(tahun_ajaran_berjalan(), 1) then
    raise exception 'Tahun ajaran tidak valid.';
  end if;
  if p_standar is null or p_standar < 0 or p_standar > 100000000 then
    raise exception 'Nominal SPP tidak valid.';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_kelas, '{}'::jsonb)) loop
    if length(trim(k)) between 1 and 40 and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 100000000
       and (v #>> '{}')::int <> p_standar then
      v_kelas := v_kelas || jsonb_build_object(trim(k), (v #>> '{}')::int);
    end if;
  end loop;
  perform pastikan_ta(v_sk);
  insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada)
  values (v_sk, p_ta, p_standar, v_kelas, case when p_ta <= tahun_ajaran_berjalan() then now() end)
  on conflict (sekolah_id, kode) do update set spp_nominal = excluded.spp_nominal, spp_kelas = excluded.spp_kelas;
  if p_ta = tahun_ajaran_berjalan() then
    update sekolah set spp_nominal = p_standar where id = v_sk and spp_nominal is distinct from p_standar;
  end if;
  return jsonb_build_object('ta', p_ta, 'standar', p_standar, 'kelas', v_kelas);
end $$;

-- Ubah keanggotaan satu siswa di satu tahun ajaran: kelas & bulan mulai/terakhir ditagih.
-- Dipakai: tambah siswa (bulan mulai), Kartu siswa › Riwayat kelas.
create or replace function atur_keanggotaan(p_siswa uuid, p_ta text, p_kelas text, p_mulai int default 0, p_selesai int default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); v_bentrok int;
begin
  if v_sk is null or not boleh('siswa') then
    raise exception 'Akun ini tidak punya akses mengubah data siswa.' using errcode = '42501';
  end if;
  if not exists (select 1 from siswa where id = p_siswa and sekolah_id = v_sk) then
    raise exception 'Siswa tidak ditemukan di sekolah ini.';
  end if;
  if not ta_valid(coalesce(p_ta, '')) or p_ta > ta_geser(tahun_ajaran_berjalan(), 1) then
    raise exception 'Tahun ajaran tidak valid.';
  end if;
  if length(trim(coalesce(p_kelas, ''))) not between 1 and 40 then raise exception 'Nama kelas wajib diisi.'; end if;
  if p_mulai not between 0 and 11 or (p_selesai is not null and (p_selesai not between 0 and 11 or p_selesai < p_mulai)) then
    raise exception 'Bulan mulai / terakhir tidak valid.';
  end if;
  perform pastikan_ta(v_sk);
  -- jangan sampai ada pembayaran SPP di luar masa terdaftar yang baru
  select min(periode) into v_bentrok from pembayaran
   where siswa_id = p_siswa and jenis = 'spp' and tahun_ajaran = p_ta
     and (periode < p_mulai or periode > coalesce(p_selesai, 11));
  if v_bentrok is not null then
    raise exception 'Sudah ada pembayaran SPP % — masa terdaftar harus mencakup bulan itu (batalkan dulu pembayarannya kalau salah catat).',
      ta_nama_bulan(p_ta, v_bentrok);
  end if;
  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, selesai)
  values (v_sk, p_siswa, p_ta, trim(p_kelas), p_mulai, p_selesai)
  on conflict (siswa_id, tahun_ajaran) do update
    set kelas = excluded.kelas, mulai = excluded.mulai, selesai = excluded.selesai, diubah_pada = now();
end $$;

-- Siswa baru yang baru masuk TAHUN AJARAN DEPAN (daftar lewat PMB): hapus keanggotaan
-- tahun berjalan (tidak ditagih SPP/kegiatan tahun ini), daftarkan di tahun depan.
create or replace function daftarkan_tahun_depan(p_siswa uuid, p_kelas text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); v_ta text := tahun_ajaran_berjalan();
begin
  if v_sk is null or not boleh('siswa') then
    raise exception 'Akun ini tidak punya akses mengubah data siswa.' using errcode = '42501';
  end if;
  if not exists (select 1 from siswa where id = p_siswa and sekolah_id = v_sk) then
    raise exception 'Siswa tidak ditemukan di sekolah ini.';
  end if;
  if exists (select 1 from pembayaran p left join biaya b on b.id = p.biaya_id
              where p.siswa_id = p_siswa and ((p.jenis = 'spp' and p.tahun_ajaran = v_ta) or (p.jenis = 'kegiatan' and b.tahun_ajaran = v_ta))) then
    raise exception 'Siswa ini sudah punya pembayaran SPP/kegiatan tahun ajaran %, jadi tidak bisa dipindah ke tahun depan.', v_ta;
  end if;
  delete from siswa_tahun where siswa_id = p_siswa and tahun_ajaran = v_ta;
  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
  values (v_sk, p_siswa, ta_geser(v_ta, 1), trim(p_kelas), 0)
  on conflict (siswa_id, tahun_ajaran) do update set kelas = excluded.kelas, diubah_pada = now();
end $$;

-- Keluar / pindah sekolah di tengah tahun. p_bulan_terakhir = bulan terakhir yang masih ditagih SPP.
create or replace function keluarkan_siswa(p_siswa uuid, p_bulan_terakhir int, p_alasan text, p_catatan text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); v_ta text := tahun_ajaran_berjalan(); r siswa_tahun%rowtype; v_bentrok int;
begin
  if v_sk is null or not boleh('siswa') then
    raise exception 'Akun ini tidak punya akses mengubah data siswa.' using errcode = '42501';
  end if;
  if p_alasan not in ('keluar', 'pindah') then raise exception 'Alasan harus keluar atau pindah.'; end if;
  perform pastikan_ta(v_sk);
  select * into r from siswa_tahun where siswa_id = p_siswa and tahun_ajaran = v_ta and sekolah_id = v_sk;
  if r.siswa_id is null then
    -- belum terdaftar tahun ini (mis. didaftarkan untuk tahun depan) → cukup hapus rencana tahun depan
    if not exists (select 1 from siswa where id = p_siswa and sekolah_id = v_sk) then
      raise exception 'Siswa tidak ditemukan di sekolah ini.';
    end if;
    delete from siswa_tahun st where st.siswa_id = p_siswa and st.tahun_ajaran > v_ta
       and not exists (select 1 from pembayaran p where p.siswa_id = p_siswa and p.jenis = 'spp' and p.tahun_ajaran = st.tahun_ajaran);
  else
    if p_bulan_terakhir is not null and (p_bulan_terakhir < r.mulai - 1 or p_bulan_terakhir > 11) then
      raise exception 'Bulan terakhir tidak valid.';
    end if;
    select max(periode) into v_bentrok from pembayaran
     where siswa_id = p_siswa and jenis = 'spp' and tahun_ajaran = v_ta and periode > coalesce(p_bulan_terakhir, 11);
    if v_bentrok is not null then
      raise exception 'Sudah ada pembayaran SPP % — bulan terakhir minimal bulan itu.', ta_nama_bulan(v_ta, v_bentrok);
    end if;
    if p_bulan_terakhir < r.mulai then
      -- keluar sebelum mulai ditagih: tidak ada tagihan tahun ini sama sekali
      if exists (select 1 from pembayaran p join biaya b on b.id = p.biaya_id where p.siswa_id = p_siswa and b.tahun_ajaran = v_ta) then
        raise exception 'Siswa ini sudah membayar kegiatan tahun ini — bulan terakhir minimal %.', ta_nama_bulan(v_ta, r.mulai);
      end if;
      delete from siswa_tahun where siswa_id = p_siswa and tahun_ajaran = v_ta;
    else
      update siswa_tahun set selesai = p_bulan_terakhir, akhir = p_alasan, catatan = nullif(left(trim(coalesce(p_catatan, '')), 200), ''), diubah_pada = now()
       where siswa_id = p_siswa and tahun_ajaran = v_ta;
    end if;
    delete from siswa_tahun where siswa_id = p_siswa and tahun_ajaran > v_ta;
  end if;
  update siswa set status_siswa = 'keluar' where id = p_siswa and sekolah_id = v_sk;
end $$;

/**
 * Kenaikan kelas — dari tahun p_dari ke tahun berikutnya.
 *   p_rencana: [{ "siswa": uuid, "aksi": "naik"|"tinggal"|"lulus"|"tidak_lanjut", "kelas": "B1" }]
 *   • dijalankan SEBELUM 1 Juli (tahun depan belum mulai): kelas & status siswa
 *     baru berubah saat tahun ajaran baru dibuka (pastikan_ta).
 *   • dijalankan SESUDAH 1 Juli (terlambat): siswa sudah dibawa otomatis ke
 *     kelas yang sama — rencana langsung menimpa keanggotaan tahun berjalan.
 *   Boleh dijalankan ulang (rencana terakhir yang berlaku).
 */
create or replace function proses_kenaikan(p_dari text, p_rencana jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sk uuid := sekolah_saya();
  v_ta text := tahun_ajaran_berjalan();
  v_ke text;
  v_aktif boolean;       -- tahun tujuan sudah berjalan?
  r jsonb; v_siswa uuid; v_aksi text; v_kelas text; v_kelas_lama text;
  n_naik int := 0; n_tinggal int := 0; n_lulus int := 0; n_tidak int := 0;
begin
  if v_sk is null or not boleh('siswa') then
    raise exception 'Akun ini tidak punya akses kenaikan kelas.' using errcode = '42501';
  end if;
  if p_dari not in (v_ta, ta_geser(v_ta, -1)) then
    raise exception 'Kenaikan kelas hanya dari tahun ajaran % atau %.', ta_geser(v_ta, -1), v_ta;
  end if;
  if jsonb_typeof(p_rencana) <> 'array' or jsonb_array_length(p_rencana) = 0 then
    raise exception 'Belum ada siswa yang diproses.';
  end if;
  perform pastikan_ta(v_sk);
  v_ke := ta_geser(p_dari, 1);
  v_aktif := v_ke <= v_ta;

  -- tarif tahun tujuan (salin tahun asal kalau belum ada)
  insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada)
  select v_sk, v_ke, t.spp_nominal, t.spp_kelas, case when v_aktif then now() end
    from tahun_ajaran t where t.sekolah_id = v_sk and t.kode = p_dari
  on conflict do nothing;

  for r in select * from jsonb_array_elements(p_rencana) loop
    v_siswa := (r ->> 'siswa')::uuid;
    v_aksi  := r ->> 'aksi';
    v_kelas := nullif(trim(coalesce(r ->> 'kelas', '')), '');
    select kelas into v_kelas_lama from siswa_tahun where siswa_id = v_siswa and tahun_ajaran = p_dari and sekolah_id = v_sk;
    if v_kelas_lama is null then
      raise exception 'Ada siswa yang tidak terdaftar di tahun ajaran %.', p_dari;
    end if;
    if v_aksi not in ('naik', 'tinggal', 'lulus', 'tidak_lanjut') then raise exception 'Aksi tidak dikenal: %', v_aksi; end if;
    if v_aksi = 'naik' and (v_kelas is null or length(v_kelas) > 40) then raise exception 'Kelas tujuan wajib diisi.'; end if;
    if v_aksi = 'tinggal' then v_kelas := coalesce(v_kelas, v_kelas_lama); end if;

    update siswa_tahun set akhir = v_aksi, diubah_pada = now() where siswa_id = v_siswa and tahun_ajaran = p_dari;

    if v_aksi in ('naik', 'tinggal') then
      insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai)
      values (v_sk, v_siswa, v_ke, v_kelas, 0)
      on conflict (siswa_id, tahun_ajaran) do update set kelas = excluded.kelas, akhir = null, diubah_pada = now();
      if v_aksi = 'naik' then n_naik := n_naik + 1; else n_tinggal := n_tinggal + 1; end if;
      if v_aktif then update siswa set status_siswa = 'aktif' where id = v_siswa and status_siswa <> 'aktif'; end if;
    else
      if exists (select 1 from pembayaran p left join biaya b on b.id = p.biaya_id
                  where p.siswa_id = v_siswa and ((p.jenis = 'spp' and p.tahun_ajaran = v_ke) or (p.jenis = 'kegiatan' and b.tahun_ajaran = v_ke))) then
        raise exception '% sudah punya pembayaran tahun ajaran % — tidak bisa diluluskan / dikeluarkan dari tahun itu.',
          (select nama from siswa where id = v_siswa), v_ke;
      end if;
      delete from siswa_tahun where siswa_id = v_siswa and tahun_ajaran = v_ke;
      if v_aksi = 'lulus' then n_lulus := n_lulus + 1; else n_tidak := n_tidak + 1; end if;
      if v_aktif then
        update siswa set status_siswa = case when v_aksi = 'lulus' then 'alumni' else 'keluar' end,
                         tahun_lulus = case when v_aksi = 'lulus' then p_dari else tahun_lulus end
         where id = v_siswa;
      end if;
    end if;
  end loop;

  update tahun_ajaran set kenaikan_pada = now() where sekolah_id = v_sk and kode = v_ke;
  if v_aktif then
    update siswa x set kelas = st.kelas from siswa_tahun st
     where st.siswa_id = x.id and st.tahun_ajaran = v_ta and x.sekolah_id = v_sk and x.kelas is distinct from st.kelas;
  end if;
  return jsonb_build_object('ke', v_ke, 'langsung', v_aktif, 'naik', n_naik, 'tinggal', n_tinggal, 'lulus', n_lulus, 'tidakLanjut', n_tidak);
end $$;

-- Salin kegiatan dari tahun ajaran lain ke tahun berjalan / depan (nama, nominal, emoji, info).
-- Tanggal dikosongkan — diisi lagi oleh sekolah.
create or replace function salin_kegiatan(p_dari text, p_ke text, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya(); n int;
begin
  if v_sk is null or not boleh('biaya') then
    raise exception 'Akun ini tidak punya akses mengubah jenis biaya.' using errcode = '42501';
  end if;
  if not ta_valid(coalesce(p_ke, '')) or p_ke > ta_geser(tahun_ajaran_berjalan(), 1) or p_ke = p_dari then
    raise exception 'Tahun ajaran tujuan tidak valid.';
  end if;
  insert into biaya (sekolah_id, nama, nominal, urutan, emoji, waktu, lokasi, deskripsi, perlengkapan, tahun_ajaran)
  select v_sk, b.nama, b.nominal, b.urutan, b.emoji, b.waktu, b.lokasi, b.deskripsi, b.perlengkapan, p_ke
    from biaya b
   where b.sekolah_id = v_sk and b.tahun_ajaran = p_dari and b.aktif and b.id = any (p_ids)
     and not exists (select 1 from biaya c where c.sekolah_id = v_sk and c.tahun_ajaran = p_ke and c.aktif
                                            and lower(trim(c.nama)) = lower(trim(b.nama)));
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- Fungsi lama yang disesuaikan (definisi live + perubahan 0042)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pembayaran_cek_milik()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pastikan_ta(new.sekolah_id);
  if not exists (select 1 from siswa s where s.id = new.siswa_id and s.sekolah_id = new.sekolah_id) then
    raise exception 'Siswa tidak ditemukan di sekolah ini.';
  end if;
  if new.biaya_id is not null and not exists (select 1 from biaya b where b.id = new.biaya_id and b.sekolah_id = new.sekolah_id) then
    raise exception 'Jenis kegiatan tidak ditemukan di sekolah ini.';
  end if;
  if new.jenis = 'kegiatan' and new.biaya_id is not null and not kegiatan_wajib(new.siswa_id, new.biaya_id) then
    raise exception 'Siswa ini tidak ditagih kegiatan % (tidak terdaftar di tahun ajaran / bulan kegiatannya).',
      (select nama || ' ' || tahun_ajaran from biaya where id = new.biaya_id);
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
end $function$;

CREATE OR REPLACE FUNCTION public.pembayaran_cek_lunas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_target bigint; v_sudah bigint; v_sisa bigint; v_label text;
begin
  if new.jenis = 'spp' then
    v_target := spp_target(new.siswa_id, new.tahun_ajaran, new.periode);
    if v_target <= 0 then
      raise exception 'SPP % tidak ditagihkan untuk siswa ini (belum terdaftar / sudah keluar pada bulan itu). Periksa masa terdaftar di Kartu siswa.',
        ta_nama_bulan(new.tahun_ajaran, new.periode);
    end if;
    v_label := 'SPP ' || coalesce(ai_nama_bulan(new.periode), 'bulan ini')
               || case when new.tahun_ajaran is distinct from tahun_ajaran_berjalan() then ' ' || coalesce(new.tahun_ajaran, '') else '' end;
  elsif new.jenis = 'kegiatan' then
    select nominal, nama into v_target, v_label from biaya where id = new.biaya_id and sekolah_id = new.sekolah_id;
  elsif new.jenis = 'paket' then
    select total, nama into v_target, v_label from paket_biaya where id = new.paket_id and sekolah_id = new.sekolah_id;
  else
    return new;
  end if;
  if coalesce(v_target, 0) <= 0 then return new; end if;

  -- antrekan pencatatan untuk siswa + tagihan yang sama
  perform pg_advisory_xact_lock(hashtextextended('bayar:' || new.siswa_id::text || ':' || new.jenis || ':' || coalesce(new.tahun_ajaran, '') || ':' ||
                                                 coalesce(new.periode::text, new.biaya_id::text, new.paket_id::text, ''), 0));
  select coalesce(sum(nominal), 0) into v_sudah
    from pembayaran
   where siswa_id = new.siswa_id and jenis = new.jenis
     and (case new.jenis when 'spp' then periode = new.periode and tahun_ajaran is not distinct from new.tahun_ajaran
                         when 'kegiatan' then biaya_id = new.biaya_id
                         else paket_id = new.paket_id end);
  v_sisa := v_target - v_sudah;
  if v_sisa <= 0 then
    raise exception '% sudah lunas — pembayaran tidak dicatat.', v_label;
  end if;
  if new.nominal > v_sisa then
    raise exception 'Nominal % melebihi sisa tagihan % (%). Maksimal %.', kas_rp(new.nominal), v_label, kas_rp(v_sisa), kas_rp(v_sisa);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.data_kuitansi(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p.id,
    'nomor', nomor_dokumen('KW', p.id, p.dibayar_pada),
    'dibayarPada', p.dibayar_pada,
    'jenis', p.jenis,
    'periode', p.periode,
    'tahunAjaran', p.tahun_ajaran,
    'keterangan', p.keterangan,
    'nominal', p.nominal,
    'metode', p.metode,
    'petugas', p.petugas,
    'target', case when p.jenis = 'spp' then spp_target(p.siswa_id, p.tahun_ajaran, p.periode) when p.jenis = 'paket' then k.total else b.nominal end,
    'terbayarSampaiIni', (
      select coalesce(sum(q.nominal), 0) from pembayaran q
       where q.siswa_id = p.siswa_id and q.jenis = p.jenis
         and q.periode is not distinct from p.periode and q.tahun_ajaran is not distinct from p.tahun_ajaran and q.biaya_id is not distinct from p.biaya_id
         and q.paket_id is not distinct from p.paket_id
         and (q.dibayar_pada, q.id) <= (p.dibayar_pada, p.id)),
    'paket', case when p.jenis = 'paket' then jsonb_build_object('nama', k.nama, 'jenis', k.jenis, 'rincian', k.rincian) end,
    'siswa', jsonb_build_object('nama', x.nama, 'kelas', coalesce((select st.kelas from siswa_tahun st where st.siswa_id = x.id
                                and st.tahun_ajaran = coalesce(p.tahun_ajaran, b.tahun_ajaran, k.tahun_ajaran,
                                                               tahun_ajaran_berjalan((p.dibayar_pada at time zone 'Asia/Jakarta')::date))), x.kelas), 'nis', x.nis, 'wali', x.wali),
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
$function$;

CREATE OR REPLACE FUNCTION public.ai_spp_siswa(p_sekolah uuid, p_hari date)
 RETURNS TABLE(siswa_id uuid, periode integer, dibayar bigint, target integer, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with s as (select * from sekolah where id = p_sekolah),
  ctx as (
    select ai_indeks_bulan(p_hari) as kini,
           p_hari > ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', p_hari)::date) as lewat
      from s
  ),
  bayar as (
    select p.siswa_id, p.periode::int as periode, sum(p.nominal)::bigint as total
      from pembayaran p
     where p.sekolah_id = p_sekolah and p.jenis = 'spp'
       and coalesce(p.tahun_ajaran, tahun_ajaran_berjalan(p_hari)) = tahun_ajaran_berjalan(p_hari)
     group by 1, 2
  )
  select x.id, g.i, coalesce(b.total, 0), coalesce((t.spp_kelas ->> st.kelas)::int, t.spp_nominal, 0),
         case
           when coalesce(b.total, 0) >= coalesce((t.spp_kelas ->> st.kelas)::int, t.spp_nominal, 0) then 'lunas'
           when coalesce(b.total, 0) > 0         then 'sebagian'
           when g.i < c.kini                     then 'nunggak'
           when g.i = c.kini and c.lewat         then 'belum-bayar'
           else 'menunggu'
         end
    from siswa x
    join siswa_tahun st on st.siswa_id = x.id and st.tahun_ajaran = tahun_ajaran_berjalan(p_hari)
    left join tahun_ajaran t on t.sekolah_id = p_sekolah and t.kode = st.tahun_ajaran
   cross join generate_series(0, 11) as g(i)
   cross join ctx c
    left join bayar b on b.siswa_id = x.id and b.periode = g.i
   where x.sekolah_id = p_sekolah and x.aktif
     and g.i between st.mulai and coalesce(st.selesai, 11)
$function$;

CREATE OR REPLACE FUNCTION public.ai_kegiatan_siswa(p_sekolah uuid)
 RETURNS TABLE(siswa_id uuid, biaya_id uuid, nama text, urutan integer, nominal integer, dibayar bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select x.id, b.id, b.nama, b.urutan::int, b.nominal,
         coalesce((select sum(p.nominal) from pembayaran p
                    where p.siswa_id = x.id and p.jenis = 'kegiatan' and p.biaya_id = b.id), 0)::bigint
    from siswa x
    join siswa_tahun st on st.siswa_id = x.id and st.tahun_ajaran = tahun_ajaran_berjalan()
    join biaya b on b.sekolah_id = x.sekolah_id and b.aktif and b.tahun_ajaran = st.tahun_ajaran
               -- sama dengan kegiatan_wajib(): tanggal kegiatan di dalam masa terdaftar
               and (b.tanggal is null or ((extract(month from b.tanggal)::int + 5) % 12) between st.mulai and coalesce(st.selesai, 11))
   where x.sekolah_id = p_sekolah and x.aktif
$function$;

CREATE OR REPLACE FUNCTION public.ai_status_kegiatan(p_kegiatan text DEFAULT NULL::text, p_kelas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sk     uuid := ai_sekolah_wajib();
  v_kelas  text[];
  v_biaya  uuid[];
  v_hasil  jsonb;
begin
  -- ---------- saring kelas ----------
  if nullif(trim(p_kelas), '') is not null then
    select array_agg(kelas) into v_kelas from ai_kelas_cocok(v_sk, p_kelas);
    if v_kelas is null then
      return jsonb_build_object('galat', 'Kelas "' || p_kelas || '" tidak ditemukan.',
        'kelas_yang_ada', (select jsonb_agg(distinct kelas) from siswa where sekolah_id = v_sk and aktif));
    end if;
  end if;

  -- ---------- saring kegiatan (nama persis dulu, lalu mengandung kata) ----------
  if nullif(trim(p_kegiatan), '') is not null then
    select array_agg(id) into v_biaya from biaya
     where sekolah_id = v_sk and aktif and tahun_ajaran = tahun_ajaran_berjalan() and lower(trim(nama)) = lower(trim(p_kegiatan));
    if v_biaya is null then
      select array_agg(id) into v_biaya from biaya
       where sekolah_id = v_sk and aktif and tahun_ajaran = tahun_ajaran_berjalan() and lower(nama) like '%' || lower(trim(p_kegiatan)) || '%';
    end if;
    if v_biaya is null then
      return jsonb_build_object('galat', 'Kegiatan "' || p_kegiatan || '" tidak ditemukan.',
        'kegiatan_yang_ada', (select jsonb_agg(nama order by urutan) from biaya where sekolah_id = v_sk and aktif and tahun_ajaran = tahun_ajaran_berjalan()));
    end if;
  end if;

  with sw as (
    select x.id, x.nama, x.kelas from siswa x
     where x.sekolah_id = v_sk and x.aktif and (v_kelas is null or x.kelas = any (v_kelas))
  ),
  bi as (
    select b.id, b.nama, b.nominal, b.urutan, b.tanggal from biaya b
     where b.sekolah_id = v_sk and b.aktif and b.tahun_ajaran = tahun_ajaran_berjalan() and (v_biaya is null or b.id = any (v_biaya))
  ),
  st as (
    select bi.id as biaya_id, sw.id as siswa_id, sw.nama, sw.kelas, bi.nominal,
           coalesce((select sum(p.nominal) from pembayaran p
                      where p.siswa_id = sw.id and p.jenis = 'kegiatan' and p.biaya_id = bi.id), 0)::bigint as dibayar
      from bi cross join sw
     where kegiatan_wajib(sw.id, bi.id)
  ),
  st2 as (
    select st.*, case when dibayar >= nominal then 'lunas' when dibayar > 0 then 'sebagian' else 'belum' end as status
      from st
  ),
  per_kegiatan as (
    select bi.urutan, jsonb_build_object(
      'kegiatan', bi.nama,
      'tanggal', to_char(bi.tanggal, 'YYYY-MM-DD'),
      'nominal_per_siswa', bi.nominal,
      'jumlah_siswa', (select count(*) from st2 where st2.biaya_id = bi.id),
      'target', (select coalesce(sum(nominal), 0) from st2 where st2.biaya_id = bi.id),
      'terkumpul', (select coalesce(sum(least(dibayar, nominal)), 0) from st2 where st2.biaya_id = bi.id),
      'kekurangan', (select coalesce(sum(greatest(0, nominal - dibayar)), 0) from st2 where st2.biaya_id = bi.id),
      'lunas', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'lunas'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas) order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'lunas'), '[]')),
      'sebagian', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'sebagian'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas, 'dibayar', dibayar,
                                                               'kurang', nominal - dibayar) order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'sebagian'), '[]')),
      'belum_bayar', jsonb_build_object(
        'jumlah', (select count(*) from st2 where st2.biaya_id = bi.id and status = 'belum'),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas, 'kurang', nominal)
                                            order by kelas, nama)
                             from st2 where st2.biaya_id = bi.id and status = 'belum'), '[]'))
    ) as o
    from bi
  ),
  per_siswa as (
    select sw.id, sw.nama, sw.kelas,
           count(st2.biaya_id) as n_kegiatan,
           count(st2.biaya_id) filter (where st2.status = 'lunas') as n_lunas,
           coalesce(sum(greatest(0, st2.nominal - st2.dibayar)), 0) as kurang,
           jsonb_agg(jsonb_build_object('kegiatan', bi.nama, 'kurang', st2.nominal - st2.dibayar,
                                        'status', case when st2.status = 'sebagian' then 'sebagian' else 'belum bayar' end)
                     order by bi.urutan) filter (where st2.status <> 'lunas') as belum
      from sw
      left join st2 on st2.siswa_id = sw.id
      left join bi on bi.id = st2.biaya_id
     group by sw.id, sw.nama, sw.kelas
  )
  select jsonb_build_object(
    'catatan_untuk_ai',
      'Daftar di sini SUDAH dikelompokkan oleh sistem. Salin nama apa adanya dari kelompok yang ditanyakan; ' ||
      'jumlah baris yang kamu tampilkan HARUS sama dengan angka "jumlah". Jangan memindahkan siswa antar kelompok.',
    'kelas', coalesce(to_jsonb(v_kelas), '"semua kelas"'),
    'jumlah_siswa_aktif', (select count(*) from sw),
    'jumlah_kegiatan', (select count(*) from bi),
    'kegiatan', coalesce((select jsonb_agg(o order by urutan) from per_kegiatan), '[]'),
    'rekap_per_siswa', jsonb_build_object(
      'penjelasan', 'Gabungan SEMUA kegiatan di atas per siswa.',
      'lunas_semua_kegiatan', jsonb_build_object(
        'jumlah', (select count(*) from per_siswa where n_kegiatan > 0 and n_lunas = n_kegiatan),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas) order by kelas, nama)
                             from per_siswa where n_kegiatan > 0 and n_lunas = n_kegiatan), '[]')),
      'masih_ada_kekurangan', jsonb_build_object(
        'jumlah', (select count(*) from per_siswa where n_lunas < n_kegiatan),
        'total_kurang', (select coalesce(sum(kurang), 0) from per_siswa where n_lunas < n_kegiatan),
        'siswa', coalesce((select jsonb_agg(jsonb_build_object('nama', nama, 'kelas', kelas,
                                                               'lunas', n_lunas || ' dari ' || n_kegiatan || ' kegiatan',
                                                               'total_kurang', kurang, 'belum_lunas', belum)
                                            order by kelas, nama)
                             from per_siswa where n_lunas < n_kegiatan), '[]'))
    )
  ) into v_hasil;

  return v_hasil;
end $function$;

CREATE OR REPLACE FUNCTION public.ai_dana_kegiatan(p_kegiatan text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sk uuid := ai_kas_akses();
begin
  return (
    with keg as (
      select 'kegiatan' as jenis, b.id, b.nama, b.urutan as urut,
             (select coalesce(sum(p.nominal), 0) from pembayaran p where p.biaya_id = b.id and p.jenis = 'kegiatan') as masuk
        from biaya b where b.sekolah_id = v_sk and b.aktif and b.tahun_ajaran = tahun_ajaran_berjalan()
      union all
      select pb.jenis, pb.id, pb.nama, 1000,
             (select coalesce(sum(p.nominal), 0) from pembayaran p where p.paket_id = pb.id and p.jenis = 'paket')
        from paket_biaya pb where pb.sekolah_id = v_sk and pb.aktif
    ),
    dipilih as (
      select * from keg
       where nullif(trim(p_kegiatan), '') is null or lower(nama) like '%' || lower(trim(p_kegiatan)) || '%'
    ),
    kel as (
      select coalesce(k.biaya_id, k.paket_id) as kid, k.kategori, k.nominal, k.keterangan, k.tanggal
        from kas k
       where k.sekolah_id = v_sk and k.dibatalkan_pada is null and k.jenis = 'keluar'
         and (k.biaya_id is not null or k.paket_id is not null)
    )
    select jsonb_build_object(
      'catatan_untuk_ai', 'Uang masuk = pembayaran orang tua untuk kegiatan itu. Terpakai = pengeluaran kas berlabel kegiatan itu. ' ||
                          'Sisa = uang masuk − terpakai (minus = nombok, ditutup dari kas sekolah). Pakai angka apa adanya.',
      'kegiatan', coalesce((select jsonb_agg(jsonb_build_object(
          'kegiatan', d.nama,
          'uang_masuk', d.masuk,
          'terpakai', (select coalesce(sum(nominal), 0) from kel where kid = d.id),
          'sisa', d.masuk - (select coalesce(sum(nominal), 0) from kel where kid = d.id),
          'per_kategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                                      from (select kategori, sum(nominal) n from kel where kid = d.id group by kategori) q), '[]'),
          'rincian', coalesce((select jsonb_agg(jsonb_build_object('tanggal', tanggal, 'uraian', keterangan, 'kategori', kategori, 'nominal', nominal)
                                                order by tanggal)
                                 from kel where kid = d.id), '[]'))
        order by d.urut, d.nama) from dipilih d), '[]')
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.ai_mulai(p_batas integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'nominal_spp', spp_tarif(v_sk, tahun_ajaran_berjalan(v_hari), null),
    'nominal_spp_kelas_khusus', coalesce((select spp_kelas from tahun_ajaran where sekolah_id = v_sk and kode = tahun_ajaran_berjalan(v_hari)), '{}'::jsonb),
    'jatuh_tempo_spp', case when s.tanggal_jatuh_tempo >= 29 then 'akhir bulan'
                            else 'tanggal ' || s.tanggal_jatuh_tempo end,
    'jatuh_tempo_bulan_ini', to_char(ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', v_hari)::date), 'YYYY-MM-DD'),
    'kelas', coalesce((select jsonb_agg(jsonb_build_object('kelas', k.kelas, 'jumlah_siswa', k.n) order by k.kelas)
                         from (select kelas, count(*) n from siswa where sekolah_id = v_sk and aktif group by kelas) k), '[]'),
    'jumlah_siswa_aktif', (select count(*) from siswa where sekolah_id = v_sk and aktif),
    'jenis_kegiatan', coalesce((select jsonb_agg(jsonb_build_object('nama', b.nama, 'nominal', b.nominal) order by b.urutan)
                                  from biaya b where b.sekolah_id = v_sk and b.aktif and b.tahun_ajaran = tahun_ajaran_berjalan(v_hari)), '[]'),
    'pmb_dan_daftar_ulang', ai_paket_ringkas(v_sk),
    'kas', v_kas,
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas),
    'kunci_pemakaian', v_kunci
  );
end $function$;

CREATE OR REPLACE FUNCTION public.ai_rekap_bulan(p_bulan integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'nominal_spp_per_siswa', spp_tarif(v_sk, tahun_ajaran_berjalan(v_awal), null),
    'nominal_spp_kelas_khusus', coalesce((select spp_kelas from tahun_ajaran where sekolah_id = v_sk and kode = tahun_ajaran_berjalan(v_awal)), '{}'::jsonb),
    'jumlah_siswa_aktif', (select count(*) from siswa where sekolah_id = v_sk and aktif),
    'spp_bulan_ini', v_spp,
    'uang_masuk_selama_bulan_ini', v_masuk
  );
end $function$;

CREATE OR REPLACE FUNCTION public.portal_wali(p_token text, p_nis text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform pastikan_ta(w.sekolah_id);
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
    'siswa_tahun', coalesce((
      select jsonb_agg(to_jsonb(st) order by st.tahun_ajaran)
      from siswa_tahun st join wali_siswa ws on ws.siswa_id = st.siswa_id
      where ws.wali_id = w.id
    ), '[]'::jsonb),
    'tahun_ajaran', coalesce((
      select jsonb_agg(jsonb_build_object('kode', t.kode, 'spp_nominal', t.spp_nominal, 'spp_kelas', t.spp_kelas) order by t.kode)
      from tahun_ajaran t where t.sekolah_id = w.sekolah_id
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
end $function$;

-- =====================================================================
-- Hak panggil
-- =====================================================================
revoke all on tahun_ajaran, siswa_tahun from anon;
revoke all on function pastikan_ta(uuid) from public, anon, authenticated;
revoke all on function spp_tarif(uuid, text, text) from public, anon;
revoke all on function spp_target(uuid, text, int) from public, anon;
revoke all on function kegiatan_wajib(uuid, uuid) from public, anon;
grant execute on function spp_tarif(uuid, text, text), spp_target(uuid, text, int), kegiatan_wajib(uuid, uuid) to authenticated;
revoke all on function siapkan_tahun_ajaran() from public, anon;
revoke all on function atur_tarif_spp(text, int, jsonb) from public, anon;
revoke all on function atur_keanggotaan(uuid, text, text, int, int) from public, anon;
revoke all on function daftarkan_tahun_depan(uuid, text) from public, anon;
revoke all on function keluarkan_siswa(uuid, int, text, text) from public, anon;
revoke all on function proses_kenaikan(text, jsonb) from public, anon;
revoke all on function salin_kegiatan(text, text, uuid[]) from public, anon;
grant execute on function siapkan_tahun_ajaran(), atur_tarif_spp(text, int, jsonb), atur_keanggotaan(uuid, text, text, int, int),
  daftarkan_tahun_depan(uuid, text), keluarkan_siswa(uuid, int, text, text), proses_kenaikan(text, jsonb),
  salin_kegiatan(text, text, uuid[]) to authenticated;
-- data_kuitansi tetap tertutup (0039): hanya lewat kuitansi_staf / kuitansi_portal
revoke all on function data_kuitansi(uuid) from public, anon, authenticated;
