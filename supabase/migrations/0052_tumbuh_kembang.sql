-- =====================================================================
-- 0052 — TUMBUH KEMBANG ANAK (tahap 1)
--
--  • Peran baru "guru" (guru kelas): bergabung lewat kode undangan per kelas.
--    Guru kelas TIDAK bisa membaca data lama (siswa lengkap, tagihan, kas, dll.)
--    karena sekolah_saya() kini hanya berlaku untuk kepala & admin.
--    Semua akses guru lewat fungsi kelas_*() yang memeriksa kelasnya.
--  • Parameter penilaian per sekolah: dasar (Kurikulum Merdeka / STPPA / sendiri),
--    skala (BB-MB-BSH-BSB / bintang / tanpa), periode ceklis, foto boleh/tidak.
--  • Data: aspek, indikator, periode ceklis per kelas, nilai, catatan anak, kabar kelas.
--  • Portal orang tua: portal_tumbuh(token, nis) — gerbang NIS yang sama dengan portal.
--  • Foto: bucket Storage "tumbuh" (nama file acak per sekolah). Opsional.
--
--  Semua tabel baru: RLS aktif & tertutup untuk API — hanya lewat fungsi.
--  Butuh 0049–0051. Tidak mengubah data lama. Aman dijalankan berulang kali.
-- =====================================================================

do $cek$ begin
  if to_regprocedure('public.portal_cek_nis(text,text)') is null or to_regprocedure('public.pin_masuk(text,text)') is null then
    raise exception 'Jalankan migrasi sampai 0051 dulu.';
  end if;
end $cek$;

-- ---------------------------------------------------------------------
-- 1. Peran guru & kode undangan per kelas
-- ---------------------------------------------------------------------
alter table profil drop constraint if exists profil_peran_check;
alter table profil add constraint profil_peran_check check (peran in ('kepala', 'admin', 'guru'));

alter table kode_aktivasi drop constraint if exists kode_aktivasi_peran_check;
alter table kode_aktivasi add constraint kode_aktivasi_peran_check check (peran in ('admin', 'guru'));
alter table kode_aktivasi add column if not exists kelas text;

-- Hanya kepala & admin yang "masuk" ke data sekolah lewat aturan akses lama.
create or replace function sekolah_saya()
returns uuid language sql stable security definer set search_path = public as $$
  select sekolah_id from profil where id = auth.uid() and aktif and peran in ('kepala', 'admin')
$$;

create table if not exists guru_kelas (
  profil_id   uuid primary key references profil(id) on delete cascade,
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  kelas       text not null,
  dibuat_pada timestamptz not null default now()
);
create index if not exists guru_kelas_sekolah on guru_kelas (sekolah_id, kelas);

-- sekolah & kelas guru yang sedang login (null kalau bukan guru aktif)
create or replace function guru_saya(out sekolah_id uuid, out kelas text)
language sql stable security definer set search_path = public as $$
  select g.sekolah_id, g.kelas from guru_kelas g join profil p on p.id = g.profil_id
   where g.profil_id = auth.uid() and p.aktif and p.peran = 'guru'
$$;

-- staf yang boleh mengatur penilaian (kepala, atau admin yang mengelola siswa)
create or replace function boleh_tumbuh()
returns boolean language sql stable security definer set search_path = public as $$
  select sekolah_saya() is not null and (boleh('sekolah') or boleh('siswa'))
$$;

-- sekolah siapa pun yang login (staf ATAU guru) — untuk folder foto Storage
create or replace function tumbuh_sekolah_saya()
returns uuid language sql stable security definer set search_path = public as $$
  select sekolah_id from profil where id = auth.uid() and aktif
$$;

-- ---------------------------------------------------------------------
-- 2. Tabel
-- ---------------------------------------------------------------------
create table if not exists tumbuh_atur (
  sekolah_id  uuid primary key references sekolah(id) on delete cascade,
  dasar       text not null default 'merdeka' check (dasar in ('merdeka', 'stppa', 'sendiri')),
  skala       text not null default 'bmbsh'   check (skala in ('bmbsh', 'bintang', 'tanpa')),
  periode     text not null default 'bulan'   check (periode in ('minggu', '2minggu', 'bulan', 'tema')),
  foto        boolean not null default true,
  diubah_pada timestamptz not null default now()
);

create table if not exists tumbuh_aspek (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  nama        text not null check (length(trim(nama)) between 1 and 120),
  pendek      text not null check (length(trim(pendek)) between 1 and 40),
  urutan      int  not null default 0,
  arsip       boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists tumbuh_aspek_sekolah on tumbuh_aspek (sekolah_id, arsip, urutan);

create table if not exists tumbuh_indikator (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  aspek_id    uuid not null references tumbuh_aspek(id) on delete cascade,
  nama        text not null check (length(trim(nama)) between 1 and 160),
  keterangan  text check (keterangan is null or length(keterangan) <= 400),
  khas        boolean not null default false,
  urutan      int  not null default 0,
  arsip       boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists tumbuh_indikator_aspek on tumbuh_indikator (aspek_id, arsip, urutan);

create table if not exists tumbuh_periode (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  kelas       text not null,
  jenis       text not null check (jenis in ('minggu', '2minggu', 'bulan', 'tema')),
  kode        text not null,
  label       text not null,
  pendek      text not null,
  mulai       date not null,
  selesai     date,
  fokus       uuid[] not null default '{}',
  terbit_pada timestamptz,
  dibuat_oleh uuid references profil(id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  unique (sekolah_id, kelas, kode)
);
create index if not exists tumbuh_periode_kelas on tumbuh_periode (sekolah_id, kelas, mulai desc);

create table if not exists tumbuh_nilai (
  periode_id   uuid not null references tumbuh_periode(id) on delete cascade,
  siswa_id     uuid not null references siswa(id) on delete cascade,
  indikator_id uuid not null references tumbuh_indikator(id) on delete cascade,
  nilai        smallint not null check (nilai between 1 and 4),
  diubah_oleh  uuid references profil(id) on delete set null,
  diubah_pada  timestamptz not null default now(),
  primary key (periode_id, siswa_id, indikator_id)
);
create index if not exists tumbuh_nilai_siswa on tumbuh_nilai (siswa_id, indikator_id);

create table if not exists tumbuh_catatan (
  id           uuid primary key default gen_random_uuid(),
  sekolah_id   uuid not null references sekolah(id) on delete cascade,
  siswa_id     uuid not null references siswa(id) on delete cascade,
  penulis      uuid references profil(id) on delete set null,
  penulis_nama text,
  aspek_id     uuid references tumbuh_aspek(id) on delete set null,
  teks         text not null check (length(trim(teks)) between 1 and 2000),
  foto         text[] not null default '{}',
  terbit_pada  timestamptz,                       -- null = draf
  dibuat_pada  timestamptz not null default now(),
  diubah_pada  timestamptz not null default now()
);
create index if not exists tumbuh_catatan_siswa on tumbuh_catatan (siswa_id, terbit_pada desc);
create index if not exists tumbuh_catatan_sekolah on tumbuh_catatan (sekolah_id, dibuat_pada desc);

create table if not exists tumbuh_kabar (
  id           uuid primary key default gen_random_uuid(),
  sekolah_id   uuid not null references sekolah(id) on delete cascade,
  kelas        text not null,
  penulis      uuid references profil(id) on delete set null,
  penulis_nama text,
  teks         text not null check (length(trim(teks)) between 1 and 2000),
  foto         text[] not null default '{}',
  terbit_pada  timestamptz,
  dibuat_pada  timestamptz not null default now(),
  diubah_pada  timestamptz not null default now()
);
create index if not exists tumbuh_kabar_kelas on tumbuh_kabar (sekolah_id, kelas, terbit_pada desc);

do $t$
declare t text;
begin
  foreach t in array array['guru_kelas', 'tumbuh_atur', 'tumbuh_aspek', 'tumbuh_indikator', 'tumbuh_periode',
                           'tumbuh_nilai', 'tumbuh_catatan', 'tumbuh_kabar'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from public, anon, authenticated', t);
  end loop;
end $t$;

-- ---------------------------------------------------------------------
-- 3. Fungsi bantu (internal, tidak bisa dipanggil dari luar)
-- ---------------------------------------------------------------------
-- isi aspek & indikator dari template
create or replace function tumbuh_isi_template(p_sekolah uuid, p_dasar text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t jsonb; a jsonb; v_aspek uuid; i int := 0; j int;
begin
  t := case p_dasar
    when 'merdeka' then '[
      {"nama":"Nilai Agama & Budi Pekerti","pendek":"Agama & budi pekerti","ind":["Berdoa sebelum & sesudah kegiatan","Mengucap salam, maaf & terima kasih","Menyayangi teman & makhluk ciptaan Tuhan"]},
      {"nama":"Jati Diri","pendek":"Jati diri","ind":["Mau berbagi & bergantian","Mandiri ke toilet & merapikan barang","Mengenali & mengungkapkan perasaan"]},
      {"nama":"Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa & Seni","pendek":"Literasi, numerasi & seni","ind":["Mengenal huruf & bunyinya","Membilang benda 1–20","Menggambar lalu menceritakannya"]}
    ]'::jsonb
    when 'stppa' then '[
      {"nama":"Nilai Agama & Moral","pendek":"Agama & moral","ind":["Berdoa sebelum & sesudah kegiatan","Berperilaku jujur & sopan"]},
      {"nama":"Fisik-Motorik","pendek":"Fisik-motorik","ind":["Melompat & menjaga keseimbangan","Menggunting & meronce"]},
      {"nama":"Kognitif","pendek":"Kognitif","ind":["Mengelompokkan benda menurut warna & bentuk","Membilang benda 1–20"]},
      {"nama":"Bahasa","pendek":"Bahasa","ind":["Menceritakan pengalaman","Mengenal huruf & bunyinya"]},
      {"nama":"Sosial-Emosional","pendek":"Sosial-emosional","ind":["Mau berbagi & bergantian","Mengenali & mengungkapkan perasaan"]},
      {"nama":"Seni","pendek":"Seni","ind":["Menyanyi & bergerak mengikuti irama","Menggambar lalu menceritakannya"]}
    ]'::jsonb
    else '[]'::jsonb end;
  for a in select * from jsonb_array_elements(t) loop
    i := i + 1;
    insert into tumbuh_aspek (sekolah_id, nama, pendek, urutan) values (p_sekolah, a->>'nama', a->>'pendek', i)
      returning id into v_aspek;
    j := 0;
    insert into tumbuh_indikator (sekolah_id, aspek_id, nama, urutan)
      select p_sekolah, v_aspek, x, row_number() over () from jsonb_array_elements_text(a->'ind') x;
  end loop;
end $$;

-- pengaturan & template pertama kali (sekali per sekolah)
create or replace function tumbuh_pastikan(p_sekolah uuid)
returns tumbuh_atur language plpgsql security definer set search_path = public as $$
declare r tumbuh_atur;
begin
  select * into r from tumbuh_atur where sekolah_id = p_sekolah;
  if found then return r; end if;
  insert into tumbuh_atur (sekolah_id) values (p_sekolah) on conflict (sekolah_id) do nothing;
  if not exists (select 1 from tumbuh_aspek where sekolah_id = p_sekolah) then
    perform tumbuh_isi_template(p_sekolah, 'merdeka');
  end if;
  select * into r from tumbuh_atur where sekolah_id = p_sekolah;
  return r;
end $$;

-- periode berjalan menurut jenisnya (tema: ditentukan guru, bukan dihitung)
create or replace function tumbuh_hitung_periode(p_jenis text, p_tgl date,
  out kode text, out label text, out pendek text, out mulai date, out selesai date)
language plpgsql immutable as $$
declare
  bln text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  bpk text[] := array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  m date;
begin
  if p_jenis = 'bulan' then
    mulai := date_trunc('month', p_tgl)::date; selesai := (mulai + interval '1 month - 1 day')::date;
    kode := to_char(mulai, 'YYYY-MM');
    label := bln[extract(month from mulai)::int] || ' ' || extract(year from mulai);
    pendek := bpk[extract(month from mulai)::int];
  elsif p_jenis in ('minggu', '2minggu') then
    m := date_trunc('week', p_tgl)::date;
    if p_jenis = '2minggu' and extract(week from m)::int % 2 = 0 then m := m - 7; end if;
    mulai := m; selesai := m + case when p_jenis = 'minggu' then 6 else 13 end;
    kode := to_char(mulai, 'IYYY') || '-' || case when p_jenis = 'minggu' then 'P' else 'D' end || to_char(mulai, 'IW');
    label := extract(day from mulai) || ' ' || bpk[extract(month from mulai)::int] || ' – '
             || extract(day from selesai) || ' ' || bpk[extract(month from selesai)::int] || ' ' || extract(year from selesai);
    pendek := extract(day from mulai) || ' ' || bpk[extract(month from mulai)::int];
  else
    raise exception 'Jenis periode tidak dikenal.';
  end if;
end $$;

-- foto: harus di folder sekolah sendiri, jumlah dibatasi
create or replace function tumbuh_cek_foto(p_sekolah uuid, p_foto text[], p_maks int)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare f text; a tumbuh_atur;
begin
  p_foto := coalesce(p_foto, '{}');
  if cardinality(p_foto) = 0 then return p_foto; end if;
  select * into a from tumbuh_atur where sekolah_id = p_sekolah;
  if not coalesce(a.foto, true) then raise exception 'Sekolah ini tidak memakai foto.'; end if;
  if cardinality(p_foto) > p_maks then raise exception 'Maksimal % foto.', p_maks; end if;
  foreach f in array p_foto loop
    if f !~ ('^' || p_sekolah::text || '/[0-9a-f-]{36}\.(jpg|jpeg|webp|png)$') then
      raise exception 'Alamat foto tidak sah.';
    end if;
  end loop;
  return p_foto;
end $$;

-- satu aspek beserta indikator aktif → jsonb
create or replace function tumbuh_aspek_json(p_sekolah uuid, p_staf boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nama', a.nama, 'pendek', a.pendek, 'urutan', a.urutan,
           'indikator', coalesce((
             select jsonb_agg(jsonb_build_object('id', i.id, 'nama', i.nama, 'keterangan', i.keterangan, 'khas', i.khas, 'urutan', i.urutan)
                              || case when p_staf then jsonb_build_object('dipakai', exists (select 1 from tumbuh_nilai n where n.indikator_id = i.id)) else '{}'::jsonb end
                              order by i.urutan, i.dibuat_pada)
               from tumbuh_indikator i where i.aspek_id = a.id and not i.arsip), '[]'::jsonb))
         order by a.urutan, a.dibuat_pada), '[]'::jsonb)
    from tumbuh_aspek a where a.sekolah_id = p_sekolah and not a.arsip
$$;

create or replace function tumbuh_atur_json(r tumbuh_atur)
returns jsonb language sql immutable as $$
  select jsonb_build_object('dasar', r.dasar, 'skala', r.skala, 'periode', r.periode, 'foto', r.foto)
$$;

-- pemakaian foto (kalau skema storage ada)
create or replace function tumbuh_foto_info(p_sekolah uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if to_regclass('storage.objects') is null then
    return jsonb_build_object('jumlah', 0, 'byte', 0);
  end if;
  execute $q$select jsonb_build_object('jumlah', count(*), 'byte', coalesce(sum((metadata->>'size')::bigint), 0))
               from storage.objects where bucket_id = 'tumbuh' and name like $1$q$
     into v using p_sekolah::text || '/%';
  return v;
end $$;

-- awal tahun ajaran berjalan (1 Juli)
create or replace function tumbuh_awal_ta()
returns timestamptz language sql stable as $$
  select make_date(case when extract(month from now()) >= 7 then extract(year from now())::int
                        else extract(year from now())::int - 1 end, 7, 1)::timestamptz
$$;

-- ---------------------------------------------------------------------
-- 4. Admin / kepala: pengaturan
-- ---------------------------------------------------------------------
create or replace function tumbuh_atur_ambil()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya(); r tumbuh_atur;
begin
  if s is null then raise exception 'Akun ini tidak punya akses.' using errcode = '42501'; end if;
  r := tumbuh_pastikan(s);
  return jsonb_build_object(
    'bolehUbah', boleh_tumbuh(),
    'atur', tumbuh_atur_json(r),
    'aspek', tumbuh_aspek_json(s, true),
    'kelas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kelas', k.kelas, 'jumlah', k.jumlah,
               'guru', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'avatar', p.avatar, 'aktif', p.aktif) order by p.nama)
                                   from guru_kelas g join profil p on p.id = g.profil_id
                                  where g.sekolah_id = s and g.kelas = k.kelas), '[]'::jsonb),
               'kode', (select jsonb_build_object('kode', ka.kode, 'dibuat', ka.dibuat_pada) from kode_aktivasi ka
                         where ka.sekolah_id = s and ka.peran = 'guru' and ka.kelas = k.kelas and ka.dipakai_oleh is null
                           and ka.dibuat_pada > now() - interval '7 days' order by ka.dibuat_pada desc limit 1))
             order by k.kelas)
        from (select x.kelas, count(*) jumlah from siswa x where x.sekolah_id = s and x.aktif group by x.kelas) k
    ), '[]'::jsonb),
    'foto', tumbuh_foto_info(s),
    'fotoLama', (select count(*) from (
        select unnest(foto) from tumbuh_catatan where sekolah_id = s and dibuat_pada < tumbuh_awal_ta()
        union all select unnest(foto) from tumbuh_kabar where sekolah_id = s and dibuat_pada < tumbuh_awal_ta()) f)
  );
end $$;

create or replace function tumbuh_atur_simpan(p_skala text, p_periode text, p_foto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya(); r tumbuh_atur;
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  perform tumbuh_pastikan(s);
  update tumbuh_atur set skala = coalesce(p_skala, skala), periode = coalesce(p_periode, periode),
                         foto = coalesce(p_foto, foto), diubah_pada = now()
   where sekolah_id = s returning * into r;
  return tumbuh_atur_json(r);
end $$;

-- ganti dasar penilaian: aspek/indikator lama yang sudah pernah dinilai diarsipkan, sisanya dihapus
create or replace function tumbuh_pakai_dasar(p_dasar text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya();
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  if p_dasar not in ('merdeka', 'stppa', 'sendiri') then raise exception 'Dasar penilaian tidak dikenal.'; end if;
  perform tumbuh_pastikan(s);
  update tumbuh_indikator i set arsip = true
   where i.sekolah_id = s and exists (select 1 from tumbuh_nilai n where n.indikator_id = i.id);
  delete from tumbuh_indikator i where i.sekolah_id = s and not i.arsip;
  update tumbuh_aspek a set arsip = true
   where a.sekolah_id = s and exists (select 1 from tumbuh_indikator i where i.aspek_id = a.id);
  update tumbuh_catatan c set aspek_id = null where c.sekolah_id = s and c.aspek_id in (select id from tumbuh_aspek where sekolah_id = s and not arsip);
  delete from tumbuh_aspek a where a.sekolah_id = s and not a.arsip;
  perform tumbuh_isi_template(s, p_dasar);
  update tumbuh_atur set dasar = p_dasar, diubah_pada = now() where sekolah_id = s;
  -- fokus periode yang masih berjalan dikosongkan (guru memilih ulang)
  update tumbuh_periode set fokus = '{}' where sekolah_id = s and terbit_pada is null;
  return tumbuh_aspek_json(s, true);
end $$;

create or replace function tumbuh_aspek_simpan(p_id uuid, p_nama text, p_pendek text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya(); v uuid;
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  p_nama := trim(coalesce(p_nama, '')); p_pendek := trim(coalesce(nullif(trim(p_pendek), ''), left(p_nama, 40)));
  if p_nama = '' then raise exception 'Nama aspek wajib diisi.'; end if;
  if p_id is null then
    if (select count(*) from tumbuh_aspek where sekolah_id = s and not arsip) >= 6 then
      raise exception 'Maksimal 6 aspek supaya grafik untuk orang tua tetap mudah dibaca.';
    end if;
    insert into tumbuh_aspek (sekolah_id, nama, pendek, urutan)
    values (s, p_nama, left(p_pendek, 40), coalesce((select max(urutan) from tumbuh_aspek where sekolah_id = s), 0) + 1)
    returning id into v;
  else
    update tumbuh_aspek set nama = p_nama, pendek = left(p_pendek, 40) where id = p_id and sekolah_id = s and not arsip returning id into v;
    if v is null then raise exception 'Aspek tidak ditemukan.'; end if;
  end if;
  return v;
end $$;

create or replace function tumbuh_aspek_hapus(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya();
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  if not exists (select 1 from tumbuh_aspek where id = p_id and sekolah_id = s) then raise exception 'Aspek tidak ditemukan.'; end if;
  update tumbuh_indikator i set arsip = true where i.aspek_id = p_id and exists (select 1 from tumbuh_nilai n where n.indikator_id = i.id);
  delete from tumbuh_indikator i where i.aspek_id = p_id and not i.arsip;
  if exists (select 1 from tumbuh_indikator where aspek_id = p_id) then
    update tumbuh_aspek set arsip = true where id = p_id;
  else
    update tumbuh_catatan set aspek_id = null where aspek_id = p_id;
    delete from tumbuh_aspek where id = p_id;
  end if;
end $$;

create or replace function tumbuh_indikator_simpan(p_id uuid, p_aspek uuid, p_nama text, p_khas boolean default false, p_keterangan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya(); v uuid;
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  p_nama := trim(coalesce(p_nama, ''));
  if p_nama = '' then raise exception 'Nama indikator wajib diisi.'; end if;
  if p_id is null then
    if not exists (select 1 from tumbuh_aspek where id = p_aspek and sekolah_id = s and not arsip) then raise exception 'Aspek tidak ditemukan.'; end if;
    insert into tumbuh_indikator (sekolah_id, aspek_id, nama, khas, keterangan, urutan)
    values (s, p_aspek, p_nama, coalesce(p_khas, false), nullif(trim(p_keterangan), ''),
            coalesce((select max(urutan) from tumbuh_indikator where aspek_id = p_aspek), 0) + 1)
    returning id into v;
  else
    update tumbuh_indikator set nama = p_nama, khas = coalesce(p_khas, khas), keterangan = nullif(trim(p_keterangan), '')
     where id = p_id and sekolah_id = s and not arsip returning id into v;
    if v is null then raise exception 'Indikator tidak ditemukan.'; end if;
  end if;
  return v;
end $$;

create or replace function tumbuh_indikator_hapus(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya();
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengubah pengaturan penilaian.' using errcode = '42501'; end if;
  if not exists (select 1 from tumbuh_indikator where id = p_id and sekolah_id = s) then raise exception 'Indikator tidak ditemukan.'; end if;
  update tumbuh_periode set fokus = array_remove(fokus, p_id) where sekolah_id = s and p_id = any(fokus) and terbit_pada is null;
  if exists (select 1 from tumbuh_nilai where indikator_id = p_id) then
    update tumbuh_indikator set arsip = true where id = p_id;
  else
    delete from tumbuh_indikator where id = p_id;
  end if;
end $$;

-- pindahkan guru ke kelas lain (mis. tahun ajaran baru)
create or replace function tumbuh_guru_pindah(p_profil uuid, p_kelas text)
returns void language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya();
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa mengatur guru kelas.' using errcode = '42501'; end if;
  if not exists (select 1 from siswa where sekolah_id = s and aktif and kelas = p_kelas) then raise exception 'Kelas tidak ditemukan.'; end if;
  update guru_kelas set kelas = p_kelas where profil_id = p_profil and sekolah_id = s;
  if not found then raise exception 'Guru kelas tidak ditemukan di sekolah Anda.'; end if;
end $$;

-- foto tahun ajaran lalu: dikosongkan di data, alamatnya dikembalikan untuk dihapus dari Storage oleh aplikasi
create or replace function tumbuh_foto_lama_bersihkan()
returns text[] language plpgsql security definer set search_path = public as $$
declare s uuid := sekolah_saya(); v text[];
begin
  if not boleh_tumbuh() then raise exception 'Akun ini tidak bisa menghapus foto.' using errcode = '42501'; end if;
  select coalesce(array_agg(f), '{}') into v from (
    select unnest(foto) f from tumbuh_catatan where sekolah_id = s and dibuat_pada < tumbuh_awal_ta()
    union all select unnest(foto) from tumbuh_kabar where sekolah_id = s and dibuat_pada < tumbuh_awal_ta()) x;
  update tumbuh_catatan set foto = '{}' where sekolah_id = s and dibuat_pada < tumbuh_awal_ta() and cardinality(foto) > 0;
  update tumbuh_kabar   set foto = '{}' where sekolah_id = s and dibuat_pada < tumbuh_awal_ta() and cardinality(foto) > 0;
  return v;
end $$;

-- kode undangan: Admin/TU (seperti dulu) atau guru kelas (per kelas)
drop function if exists buat_kode_aktivasi(text);
create or replace function buat_kode_aktivasi(p_peran text default 'admin', p_kelas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_id uuid := sekolah_saya();
  v_kode       text;
  v_percobaan  int := 0;
begin
  if v_sekolah_id is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if coalesce(p_peran, '') = 'admin' then
    if not boleh('sekolah') then raise exception 'Akun ini tidak punya akses membuat kode aktivasi.'; end if;
    p_kelas := null;
  elsif p_peran = 'guru' then
    if not boleh_tumbuh() then raise exception 'Akun ini tidak punya akses mengundang guru kelas.'; end if;
    if not exists (select 1 from siswa where sekolah_id = v_sekolah_id and aktif and kelas = p_kelas) then
      raise exception 'Kelas tidak ditemukan.';
    end if;
  else
    raise exception 'Peran tidak dikenal.';
  end if;

  loop
    v_kode := kode_acak();
    v_percobaan := v_percobaan + 1;
    exit when not exists (select 1 from kode_aktivasi where kode = v_kode);
    if v_percobaan > 20 then raise exception 'Gagal membuat kode unik, coba lagi.'; end if;
  end loop;

  insert into kode_aktivasi (sekolah_id, kode, peran, kelas, dibuat_oleh)
  values (v_sekolah_id, v_kode, p_peran, p_kelas, auth.uid());
  return jsonb_build_object('kode', v_kode, 'peran', p_peran, 'kelas', p_kelas);
end $$;

-- aktivasi: sama seperti 0049, plus mencatat kelas untuk guru
create or replace function aktivasi_kode(p_kode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kode    kode_aktivasi%rowtype;
  v_sekolah text;
  v_nama    text;
  c         aktivasi_percobaan%rowtype;
  v_batas   int := 5;
begin
  if auth.uid() is null then raise exception 'Belum masuk. Silakan login ulang.'; end if;
  if exists (select 1 from profil where id = auth.uid()) then raise exception 'Akun ini sudah terhubung ke sekolah lain.'; end if;

  select * into c from aktivasi_percobaan where pengguna = auth.uid();
  if c.kunci_sampai is not null and c.kunci_sampai > now() then
    return jsonb_build_object('galat', format('Terlalu banyak kode salah. Coba lagi dalam %s menit.',
                                              greatest(1, ceil(extract(epoch from c.kunci_sampai - now()) / 60)::int)));
  end if;

  select * into v_kode from kode_aktivasi
   where kode = upper(trim(coalesce(p_kode, ''))) and dipakai_oleh is null
     and dibuat_pada > now() - interval '7 days';

  if not found then
    insert into aktivasi_percobaan as a (pengguna, gagal, diperbarui) values (auth.uid(), 1, now())
    on conflict (pengguna) do update
      set gagal = case when a.kunci_sampai is not null and a.kunci_sampai <= now() then 1 else a.gagal + 1 end,
          kunci_sampai = null, diperbarui = now()
    returning * into c;
    if c.gagal >= v_batas then
      update aktivasi_percobaan set gagal = 0, kunci_sampai = now() + interval '15 minutes' where pengguna = auth.uid();
      return jsonb_build_object('galat', 'Terlalu banyak kode salah. Coba lagi dalam 15 menit.');
    end if;
    return jsonb_build_object('galat', 'Kode aktivasi tidak ditemukan atau sudah dipakai (kode berlaku 7 hari).');
  end if;

  v_nama := nama_dari_google(auth.uid());
  insert into profil (id, sekolah_id, nama, peran) values (auth.uid(), v_kode.sekolah_id, v_nama, v_kode.peran);
  if v_kode.peran = 'guru' then
    insert into guru_kelas (profil_id, sekolah_id, kelas) values (auth.uid(), v_kode.sekolah_id, v_kode.kelas);
  end if;
  update kode_aktivasi set dipakai_oleh = auth.uid(), dipakai_pada = now() where id = v_kode.id;
  delete from aktivasi_percobaan where pengguna = auth.uid();

  select nama into v_sekolah from sekolah where id = v_kode.sekolah_id;
  return jsonb_build_object('sekolahId', v_kode.sekolah_id, 'sekolah', v_sekolah, 'peran', v_kode.peran, 'kelas', v_kode.kelas);
end $$;

-- ---------------------------------------------------------------------
-- 5. Guru kelas
-- ---------------------------------------------------------------------
-- periode berjalan kelas guru (dibuat kalau belum ada; tema: periode tema terakhir)
create or replace function tumbuh_periode_kini(p_sekolah uuid, p_kelas text, p_jenis text, p_buat boolean, p_tema text default null)
returns tumbuh_periode language plpgsql security definer set search_path = public as $$
declare r tumbuh_periode; h record; n int; f uuid[];
  v_kode text; v_label text; v_pendek text; v_mulai date; v_selesai date;
begin
  if p_jenis = 'tema' then
    if p_tema is null then
      select * into r from tumbuh_periode where sekolah_id = p_sekolah and kelas = p_kelas and jenis = 'tema' order by mulai desc, dibuat_pada desc limit 1;
      return r;
    end if;
    select count(*) + 1 into n from tumbuh_periode where sekolah_id = p_sekolah and kelas = p_kelas and jenis = 'tema';
    v_kode := 'tema-' || n; v_label := left(trim(p_tema), 60); v_pendek := left(trim(p_tema), 12);
    v_mulai := current_date; v_selesai := null;
  else
    select * into h from tumbuh_hitung_periode(p_jenis, current_date);
    v_kode := h.kode; v_label := h.label; v_pendek := h.pendek; v_mulai := h.mulai; v_selesai := h.selesai;
    select * into r from tumbuh_periode where sekolah_id = p_sekolah and kelas = p_kelas and kode = v_kode;
    if found or not p_buat then return r; end if;
  end if;
  -- fokus awal = fokus periode sebelumnya yang masih aktif
  select coalesce(array_agg(x), '{}') into f from (
    select unnest(p.fokus) x from (select fokus from tumbuh_periode where sekolah_id = p_sekolah and kelas = p_kelas order by mulai desc, dibuat_pada desc limit 1) p) y
   where exists (select 1 from tumbuh_indikator i where i.id = y.x and not i.arsip);
  insert into tumbuh_periode (sekolah_id, kelas, jenis, kode, label, pendek, mulai, selesai, fokus, dibuat_oleh)
  values (p_sekolah, p_kelas, p_jenis, v_kode, v_label, v_pendek, v_mulai, v_selesai, f, auth.uid())
  on conflict (sekolah_id, kelas, kode) do update set kode = excluded.kode
  returning * into r;
  return r;
end $$;

create or replace function tumbuh_periode_json(p tumbuh_periode)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'jenis', p.jenis, 'label', p.label, 'pendek', p.pendek, 'mulai', p.mulai, 'selesai', p.selesai,
    'fokus', to_jsonb(p.fokus), 'terbit', p.terbit_pada,
    'dinilai', (select count(*) from siswa x where x.sekolah_id = p.sekolah_id and x.kelas = p.kelas and x.aktif
                  and cardinality(p.fokus) > 0
                  and (select count(*) from tumbuh_nilai n where n.periode_id = p.id and n.siswa_id = x.id and n.indikator_id = any(p.fokus)) >= cardinality(p.fokus)),
    'anak', (select count(*) from siswa x where x.sekolah_id = p.sekolah_id and x.kelas = p.kelas and x.aktif)) end
$$;

create or replace function kelas_awal()
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; r tumbuh_atur; me profil%rowtype; p tumbuh_periode;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  select * into me from profil where id = auth.uid();
  r := tumbuh_pastikan(g.sekolah_id);
  if r.skala <> 'tanpa' then p := tumbuh_periode_kini(g.sekolah_id, g.kelas, r.periode, r.periode <> 'tema'); end if;
  return jsonb_build_object(
    'guru', jsonb_build_object('id', me.id, 'nama', me.nama, 'avatar', me.avatar, 'pinAktif', me.pin_aktif),
    'sekolah', (select jsonb_build_object('id', s.id, 'nama', s.nama, 'alamat', s.alamat) from sekolah s where s.id = g.sekolah_id),
    'kelas', g.kelas,
    'atur', tumbuh_atur_json(r),
    'aspek', tumbuh_aspek_json(g.sekolah_id),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'panggilan', x.panggilan,
                                 'jenis', x.jenis_kelamin, 'avatar', x.avatar, 'foto', x.foto) order by x.nama)
                         from siswa x where x.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif), '[]'::jsonb),
    'periode', tumbuh_periode_json(p),
    'tulisan', kelas_tulisan(null)
  );
end $$;

-- daftar tulisan (catatan & kabar) kelas ini, terbaru dulu, 20 per halaman
create or replace function kelas_tulisan(p_sebelum timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(u.t order by u.w desc) from (
      select t, w from (
        select jsonb_build_object('jenis', 'catatan', 'id', c.id, 'siswaId', c.siswa_id, 'aspekId', c.aspek_id, 'teks', c.teks,
                                  'foto', to_jsonb(c.foto), 'terbit', c.terbit_pada, 'penulis', c.penulis_nama, 'waktu', c.diubah_pada) t,
               c.diubah_pada w
          from tumbuh_catatan c join siswa x on x.id = c.siswa_id
         where c.sekolah_id = g.sekolah_id and x.kelas = g.kelas and (p_sebelum is null or c.diubah_pada < p_sebelum)
        union all
        select jsonb_build_object('jenis', 'kabar', 'id', k.id, 'teks', k.teks, 'foto', to_jsonb(k.foto), 'terbit', k.terbit_pada,
                                  'penulis', k.penulis_nama, 'waktu', k.diubah_pada), k.diubah_pada
          from tumbuh_kabar k
         where k.sekolah_id = g.sekolah_id and k.kelas = g.kelas and (p_sebelum is null or k.diubah_pada < p_sebelum)
      ) z order by w desc limit 20) u), '[]'::jsonb);
end $$;

-- buka / ganti fokus periode berjalan
create or replace function kelas_periode_buka(p_fokus uuid[] default null, p_tema text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; r tumbuh_atur; p tumbuh_periode;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  r := tumbuh_pastikan(g.sekolah_id);
  if r.skala = 'tanpa' then raise exception 'Sekolah ini tidak memakai ceklis (catatan saja).'; end if;
  if r.periode = 'tema' and nullif(trim(p_tema), '') is not null then
    p := tumbuh_periode_kini(g.sekolah_id, g.kelas, 'tema', true, p_tema);
  else
    p := tumbuh_periode_kini(g.sekolah_id, g.kelas, r.periode, true);
  end if;
  if p.id is null then raise exception 'Tulis nama tema dulu untuk memulai ceklis.'; end if;
  if p_fokus is not null then
    if cardinality(p_fokus) > 8 then raise exception 'Maksimal 8 indikator fokus per periode.'; end if;
    if exists (select 1 from unnest(p_fokus) f where not exists (
                 select 1 from tumbuh_indikator i where i.id = f and i.sekolah_id = g.sekolah_id and not i.arsip)) then
      raise exception 'Indikator tidak ditemukan.';
    end if;
    update tumbuh_periode set fokus = p_fokus where id = p.id returning * into p;
  end if;
  return tumbuh_periode_json(p);
end $$;

-- isi ceklis: nilai periode ini + isian awal (nilai terakhir sebelumnya per anak & indikator)
create or replace function kelas_ceklis(p_periode uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record; p tumbuh_periode;
begin
  select * into g from guru_saya();
  select * into p from tumbuh_periode where id = p_periode and sekolah_id = g.sekolah_id and kelas = g.kelas;
  if g.sekolah_id is null or p.id is null then raise exception 'Periode tidak ditemukan.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'periode', tumbuh_periode_json(p),
    'nilai', coalesce((select jsonb_agg(jsonb_build_object('s', n.siswa_id, 'i', n.indikator_id, 'n', n.nilai))
                         from tumbuh_nilai n where n.periode_id = p.id), '[]'::jsonb),
    'awal', coalesce((select jsonb_agg(jsonb_build_object('s', z.siswa_id, 'i', z.indikator_id, 'n', z.nilai)) from (
                        select distinct on (n.siswa_id, n.indikator_id) n.siswa_id, n.indikator_id, n.nilai
                          from tumbuh_nilai n join tumbuh_periode q on q.id = n.periode_id
                          join siswa x on x.id = n.siswa_id
                         where q.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif and q.id <> p.id
                           and n.indikator_id = any(p.fokus) and (q.mulai, q.dibuat_pada) < (p.mulai, p.dibuat_pada)
                         order by n.siswa_id, n.indikator_id, q.mulai desc, q.dibuat_pada desc) z), '[]'::jsonb)
  );
end $$;

-- simpan nilai satu indikator untuk banyak anak: p_nilai = [{"s": siswa_id, "n": 1..4}, ...]
create or replace function kelas_nilai_simpan(p_periode uuid, p_indikator uuid, p_nilai jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; p tumbuh_periode; v int;
begin
  select * into g from guru_saya();
  select * into p from tumbuh_periode where id = p_periode and sekolah_id = g.sekolah_id and kelas = g.kelas;
  if g.sekolah_id is null or p.id is null then raise exception 'Periode tidak ditemukan.' using errcode = '42501'; end if;
  if not (p_indikator = any(p.fokus)) then raise exception 'Indikator ini bukan fokus periode ini.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_nilai, '[]')) e
              where not exists (select 1 from siswa x where x.id = (e->>'s')::uuid and x.sekolah_id = g.sekolah_id and x.kelas = g.kelas and x.aktif)
                 or (e->>'n')::int not between 1 and 4) then
    raise exception 'Data nilai tidak sah (anak di luar kelas atau nilai di luar skala).';
  end if;
  insert into tumbuh_nilai (periode_id, siswa_id, indikator_id, nilai, diubah_oleh, diubah_pada)
  select p.id, (e->>'s')::uuid, p_indikator, (e->>'n')::smallint, auth.uid(), now()
    from jsonb_array_elements(coalesce(p_nilai, '[]')) e
  on conflict (periode_id, siswa_id, indikator_id) do update
    set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada
    where tumbuh_nilai.nilai is distinct from excluded.nilai;
  get diagnostics v = row_count;
  select * into p from tumbuh_periode where id = p.id;
  return tumbuh_periode_json(p) || jsonb_build_object('tersimpan', v);
end $$;

create or replace function kelas_periode_terbit(p_periode uuid, p_terbit boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; p tumbuh_periode;
begin
  select * into g from guru_saya();
  update tumbuh_periode set terbit_pada = case when p_terbit then coalesce(terbit_pada, now()) end
   where id = p_periode and sekolah_id = g.sekolah_id and kelas = g.kelas returning * into p;
  if g.sekolah_id is null or p.id is null then raise exception 'Periode tidak ditemukan.' using errcode = '42501'; end if;
  return tumbuh_periode_json(p);
end $$;

create or replace function kelas_catatan_simpan(p_id uuid, p_siswa uuid, p_teks text, p_aspek uuid, p_foto text[], p_terbit boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare g record; v uuid; nama text;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  if not exists (select 1 from siswa where id = p_siswa and sekolah_id = g.sekolah_id and kelas = g.kelas and aktif) then
    raise exception 'Anak ini tidak ada di kelas Anda.';
  end if;
  if p_aspek is not null and not exists (select 1 from tumbuh_aspek where id = p_aspek and sekolah_id = g.sekolah_id) then
    raise exception 'Aspek tidak ditemukan.';
  end if;
  p_foto := tumbuh_cek_foto(g.sekolah_id, p_foto, 1);
  select p.nama into nama from profil p where p.id = auth.uid();
  if p_id is null then
    insert into tumbuh_catatan (sekolah_id, siswa_id, penulis, penulis_nama, aspek_id, teks, foto, terbit_pada)
    values (g.sekolah_id, p_siswa, auth.uid(), nama, p_aspek, trim(p_teks), p_foto, case when p_terbit then now() end)
    returning id into v;
  else
    update tumbuh_catatan c set siswa_id = p_siswa, aspek_id = p_aspek, teks = trim(p_teks), foto = p_foto,
           terbit_pada = case when p_terbit then coalesce(c.terbit_pada, now()) end, diubah_pada = now()
     where c.id = p_id and c.sekolah_id = g.sekolah_id
       and exists (select 1 from siswa x where x.id = c.siswa_id and x.kelas = g.kelas)
    returning c.id into v;
    if v is null then raise exception 'Catatan tidak ditemukan.'; end if;
  end if;
  return v;
end $$;

create or replace function kelas_kabar_simpan(p_id uuid, p_teks text, p_foto text[], p_terbit boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare g record; v uuid; nama text;
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  p_foto := tumbuh_cek_foto(g.sekolah_id, p_foto, 3);
  select p.nama into nama from profil p where p.id = auth.uid();
  if p_id is null then
    insert into tumbuh_kabar (sekolah_id, kelas, penulis, penulis_nama, teks, foto, terbit_pada)
    values (g.sekolah_id, g.kelas, auth.uid(), nama, trim(p_teks), p_foto, case when p_terbit then now() end)
    returning id into v;
  else
    update tumbuh_kabar k set teks = trim(p_teks), foto = p_foto,
           terbit_pada = case when p_terbit then coalesce(k.terbit_pada, now()) end, diubah_pada = now()
     where k.id = p_id and k.sekolah_id = g.sekolah_id and k.kelas = g.kelas
    returning k.id into v;
    if v is null then raise exception 'Kabar tidak ditemukan.'; end if;
  end if;
  return v;
end $$;

-- hapus catatan/kabar; mengembalikan alamat foto untuk dihapus dari Storage oleh aplikasi
create or replace function kelas_tulisan_hapus(p_jenis text, p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare g record; v text[];
begin
  select * into g from guru_saya();
  if g.sekolah_id is null then raise exception 'Akun ini bukan guru kelas yang aktif.' using errcode = '42501'; end if;
  if p_jenis = 'catatan' then
    delete from tumbuh_catatan c where c.id = p_id and c.sekolah_id = g.sekolah_id
       and exists (select 1 from siswa x where x.id = c.siswa_id and x.kelas = g.kelas)
    returning c.foto into v;
  elsif p_jenis = 'kabar' then
    delete from tumbuh_kabar k where k.id = p_id and k.sekolah_id = g.sekolah_id and k.kelas = g.kelas returning k.foto into v;
  end if;
  if v is null then raise exception 'Tulisan tidak ditemukan.'; end if;
  return v;
end $$;

-- aspek untuk portal: yang aktif + yang sudah diarsipkan tapi punya nilai anak-anak wali ini
-- (supaya grafik lama tidak hilang saat sekolah mengganti dasar penilaian)
create or replace function tumbuh_aspek_portal(p_sekolah uuid, p_wali uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with dinilai as (
    select distinct n.indikator_id from tumbuh_nilai n join wali_siswa ws on ws.siswa_id = n.siswa_id
     join tumbuh_periode q on q.id = n.periode_id and q.terbit_pada is not null
     where ws.wali_id = p_wali)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nama', a.nama, 'pendek', a.pendek, 'urutan', a.urutan, 'arsip', a.arsip,
           'indikator', coalesce((
             select jsonb_agg(jsonb_build_object('id', i.id, 'nama', i.nama, 'khas', i.khas, 'arsip', i.arsip) order by i.arsip, i.urutan, i.dibuat_pada)
               from tumbuh_indikator i where i.aspek_id = a.id and (not i.arsip or i.id in (select indikator_id from dinilai))), '[]'::jsonb))
         order by a.arsip, a.urutan, a.dibuat_pada), '[]'::jsonb)
    from tumbuh_aspek a
   where a.sekolah_id = p_sekolah
     and (not a.arsip or exists (select 1 from tumbuh_indikator i where i.aspek_id = a.id and i.id in (select indikator_id from dinilai)))
$$;

-- ---------------------------------------------------------------------
-- 6. Portal orang tua (gerbang token + NIS yang sama dengan portal_wali)
-- ---------------------------------------------------------------------
create or replace function portal_tumbuh(p_token text, p_nis text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w wali%rowtype; v jsonb; r tumbuh_atur;
begin
  v := portal_cek_nis(p_token, p_nis);
  if v is not null then return jsonb_build_object('gerbang', v); end if;
  select * into w from wali where token = p_token;
  select * into r from tumbuh_atur where sekolah_id = w.sekolah_id;
  if r.sekolah_id is null then return jsonb_build_object('anak', '[]'::jsonb); end if;

  return jsonb_build_object(
    'atur', tumbuh_atur_json(r),
    'aspek', tumbuh_aspek_portal(w.sekolah_id, w.id),
    'anak', coalesce((select jsonb_agg(jsonb_build_object(
      'siswaId', x.id,
      'kelas', x.kelas,
      'guru', (select string_agg(p.nama, ', ' order by p.nama) from guru_kelas g join profil p on p.id = g.profil_id
                where g.sekolah_id = x.sekolah_id and g.kelas = x.kelas and p.aktif),
      'periode', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'label', q.label, 'pendek', q.pendek, 'mulai', q.mulai,
                                   'nilai', (select jsonb_object_agg(n.indikator_id, n.nilai) from tumbuh_nilai n
                                              where n.periode_id = q.id and n.siswa_id = x.id)) order by q.mulai, q.dibuat_pada)
                             from (select q.* from tumbuh_periode q
                                    where q.sekolah_id = x.sekolah_id and q.terbit_pada is not null
                                      and exists (select 1 from tumbuh_nilai n where n.periode_id = q.id and n.siswa_id = x.id)
                                    order by q.mulai desc, q.dibuat_pada desc limit 6) q), '[]'::jsonb),
      'catatan', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'teks', c.teks, 'foto', to_jsonb(c.foto), 'aspekId', c.aspek_id,
                                   'penulis', c.penulis_nama, 'avatar', (select avatar from profil where id = c.penulis),
                                   'waktu', c.terbit_pada) order by c.terbit_pada desc)
                             from (select * from tumbuh_catatan c where c.siswa_id = x.id and c.terbit_pada is not null
                                    order by c.terbit_pada desc limit 20) c), '[]'::jsonb),
      'kabar', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'teks', k.teks, 'foto', to_jsonb(k.foto),
                                 'penulis', k.penulis_nama, 'waktu', k.terbit_pada) order by k.terbit_pada desc)
                           from (select * from tumbuh_kabar k where k.sekolah_id = x.sekolah_id and k.kelas = x.kelas
                                    and k.terbit_pada is not null order by k.terbit_pada desc limit 10) k), '[]'::jsonb)
    ) order by x.nama)
      from siswa x join wali_siswa ws on ws.siswa_id = x.id
     where ws.wali_id = w.id and x.aktif), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 7. Hak panggil fungsi
-- ---------------------------------------------------------------------
do $g$
declare f text;
begin
  -- internal: tidak bisa dipanggil dari luar
  foreach f in array array[
    'guru_saya()', 'boleh_tumbuh()', 'tumbuh_sekolah_saya()', 'tumbuh_isi_template(uuid,text)', 'tumbuh_pastikan(uuid)',
    'tumbuh_hitung_periode(text,date)', 'tumbuh_cek_foto(uuid,text[],integer)', 'tumbuh_aspek_json(uuid,boolean)',
    'tumbuh_atur_json(tumbuh_atur)', 'tumbuh_foto_info(uuid)', 'tumbuh_awal_ta()',
    'tumbuh_periode_kini(uuid,text,text,boolean,text)', 'tumbuh_periode_json(tumbuh_periode)', 'tumbuh_aspek_portal(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- hanya untuk akun yang login (fungsinya sendiri memeriksa peran & sekolah)
  foreach f in array array[
    'tumbuh_atur_ambil()', 'tumbuh_atur_simpan(text,text,boolean)', 'tumbuh_pakai_dasar(text)',
    'tumbuh_aspek_simpan(uuid,text,text)', 'tumbuh_aspek_hapus(uuid)',
    'tumbuh_indikator_simpan(uuid,uuid,text,boolean,text)', 'tumbuh_indikator_hapus(uuid)',
    'tumbuh_guru_pindah(uuid,text)', 'tumbuh_foto_lama_bersihkan()', 'buat_kode_aktivasi(text,text)', 'aktivasi_kode(text)',
    'kelas_awal()', 'kelas_tulisan(timestamptz)', 'kelas_periode_buka(uuid[],text)', 'kelas_ceklis(uuid)',
    'kelas_nilai_simpan(uuid,uuid,jsonb)', 'kelas_periode_terbit(uuid,boolean)',
    'kelas_catatan_simpan(uuid,uuid,text,uuid,text[],boolean)', 'kelas_kabar_simpan(uuid,text,text[],boolean)',
    'kelas_tulisan_hapus(text,uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- portal orang tua: tanpa login, dijaga token + NIS
  revoke all on function portal_tumbuh(text, text) from public;
  grant execute on function portal_tumbuh(text, text) to anon, authenticated;
end $g$;

-- ---------------------------------------------------------------------
-- 8. Storage: bucket "tumbuh" (foto kabar & catatan)
--    Bucket publik-baca dengan nama file acak (seperti tautan portal): orang
--    yang tidak diberi alamatnya tidak bisa menemukan foto. Tidak ada izin
--    daftar (list) untuk siapa pun. Unggah/hapus: staf & guru sekolah itu,
--    hanya di folder sekolahnya sendiri.
-- ---------------------------------------------------------------------
do $s$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Skema storage tidak ada (bukan Supabase) — bucket tumbuh dilewati.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('tumbuh', 'tumbuh', true, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

  execute 'drop policy if exists tumbuh_unggah on storage.objects';
  execute 'drop policy if exists tumbuh_hapus on storage.objects';
  execute $p$create policy tumbuh_unggah on storage.objects for insert to authenticated with check (
    bucket_id = 'tumbuh' and (storage.foldername(name))[1] = public.tumbuh_sekolah_saya()::text)$p$;
  execute $p$create policy tumbuh_hapus on storage.objects for delete to authenticated using (
    bucket_id = 'tumbuh' and (storage.foldername(name))[1] = public.tumbuh_sekolah_saya()::text)$p$;
end $s$;

-- tumbuh_sekolah_saya() dipakai aturan Storage → harus bisa dipanggil akun login
grant execute on function tumbuh_sekolah_saya() to authenticated;
