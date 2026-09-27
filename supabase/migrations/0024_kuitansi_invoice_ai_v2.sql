-- =====================================================================
-- 0024: kuitansi digital, invoice & kuitansi sewa, Tanya AI v2.
--
--  1. PERBAIKAN KEAMANAN — kolom langganan di tabel sekolah dikunci.
--     Kebijakan sekolah_ubah (0002) mengizinkan staf mengubah SEMUA kolom
--     sekolahnya, termasuk langganan_sampai. Artinya staf yang paham
--     teknis bisa memperpanjang langganan sendiri lewat API. Sekarang
--     kolom langganan/tarif/kuota hanya bisa diubah admin aplikasi
--     (atau lewat fungsi resmi).
--  2. sekolah_ttd          — tanda tangan & stempel untuk kuitansi orang tua.
--  3. pengaturan_aplikasi  — identitas penerbit invoice sewa (diatur admin).
--  4. RPC kuitansi (staf & portal orang tua), kuitansi sewa, riwayat sewa
--     milik sekolah, verifikasi dokumen lewat QR (tanpa login).
--  5. Tanya AI v2 — boleh dipakai admin sekolah, kuota harian per sekolah
--     bisa diatur admin aplikasi (0 = dimatikan).
--
-- Jalankan SETELAH 0023. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- =====================================================================
-- 1. kunci kolom langganan di tabel sekolah
-- =====================================================================
alter table sekolah add column if not exists ai_batas_harian int;
alter table sekolah drop constraint if exists sekolah_ai_batas_check;
alter table sekolah add constraint sekolah_ai_batas_check check (ai_batas_harian is null or ai_batas_harian between 0 and 500);
comment on column sekolah.ai_batas_harian is
  'Batas pertanyaan Tanya AI per hari untuk sekolah ini. NULL = default (AI_BATAS_HARIAN di Edge Function), 0 = dimatikan. Diubah lewat admin_ubah_kuota_ai().';

-- SENGAJA bukan security definer: current_user harus tetap akun pemanggil.
create or replace function lindungi_kolom_sekolah()
returns trigger
language plpgsql set search_path = public as $$
begin
  -- Hanya perubahan LANGSUNG dari akun pengguna (lewat API) yang diperiksa.
  -- Fungsi resmi (security definer) berjalan sebagai pemilik database,
  -- jadi tidak terhalang di sini.
  if current_user <> 'authenticated' or saya_admin_aplikasi() then
    return new;
  end if;
  if new.langganan_sampai     is distinct from old.langganan_sampai
     or new.trial_mulai       is distinct from old.trial_mulai
     or new.harga_per_siswa   is distinct from old.harga_per_siswa
     or new.dinonaktifkan_admin is distinct from old.dinonaktifkan_admin
     or new.status_langganan  is distinct from old.status_langganan
     or new.ai_batas_harian   is distinct from old.ai_batas_harian then
    raise exception 'Data langganan hanya bisa diubah oleh admin aplikasi.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists sekolah_lindungi_kolom on sekolah;
create trigger sekolah_lindungi_kolom
  before update on sekolah
  for each row execute function lindungi_kolom_sekolah();

-- =====================================================================
-- 2. tanda tangan & stempel kuitansi sekolah
-- =====================================================================
create table if not exists sekolah_ttd (
  sekolah_id          uuid primary key references sekolah(id) on delete cascade,
  nama_penandatangan  text,
  jabatan             text not null default 'Bendahara',
  ttd                 text,   -- gambar PNG/JPEG dalam bentuk data URL
  stempel             text,   -- gambar PNG/JPEG dalam bentuk data URL
  diubah_pada         timestamptz not null default now()
);
comment on table sekolah_ttd is
  'Tanda tangan & stempel yang dicetak di kuitansi pembayaran. Diubah lewat simpan_ttd_sekolah() (khusus kepala sekolah).';

alter table sekolah_ttd enable row level security;
drop policy if exists sekolah_ttd_baca on sekolah_ttd;
create policy sekolah_ttd_baca on sekolah_ttd
  for select to authenticated using (sekolah_id = sekolah_saya());

create or replace function cek_gambar(p text, p_label text) returns void
language plpgsql immutable as $$
begin
  if p is null then return; end if;
  if p !~ '^data:image/(png|jpeg);base64,' then
    raise exception '% harus berupa gambar PNG atau JPG.', p_label;
  end if;
  if length(p) > 700000 then
    raise exception '% terlalu besar (maks ±500 KB). Coba foto yang lebih kecil.', p_label;
  end if;
end $$;

create or replace function simpan_ttd_sekolah(
  p_nama text, p_jabatan text, p_ttd text, p_stempel text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if (select peran from profil where id = auth.uid()) is distinct from 'kepala' then
    raise exception 'Hanya kepala sekolah yang bisa mengubah tanda tangan kuitansi.';
  end if;
  perform cek_gambar(p_ttd, 'Tanda tangan');
  perform cek_gambar(p_stempel, 'Stempel');

  insert into sekolah_ttd as t (sekolah_id, nama_penandatangan, jabatan, ttd, stempel, diubah_pada)
  values (v_sk, nullif(trim(p_nama), ''), coalesce(nullif(trim(p_jabatan), ''), 'Bendahara'), p_ttd, p_stempel, now())
  on conflict (sekolah_id) do update
    set nama_penandatangan = excluded.nama_penandatangan, jabatan = excluded.jabatan,
        ttd = excluded.ttd, stempel = excluded.stempel, diubah_pada = now();
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 3. identitas penerbit invoice sewa (satu baris, diatur admin aplikasi)
-- =====================================================================
create table if not exists pengaturan_aplikasi (
  id                  int primary key default 1 check (id = 1),
  nama_usaha          text not null default 'Aplikasi Pembayaran TK',
  alamat              text,
  wa                  text,
  email               text,
  rekening            jsonb not null default '[]'::jsonb,
  nama_penandatangan  text,
  jabatan             text not null default 'Pemilik',
  ttd                 text,
  stempel             text,
  diubah_pada         timestamptz not null default now()
);
insert into pengaturan_aplikasi (id) values (1) on conflict (id) do nothing;
comment on table pengaturan_aplikasi is
  'Identitas penerbit invoice & kuitansi sewa aplikasi. Satu baris saja. Diubah lewat admin_simpan_pengaturan().';

alter table pengaturan_aplikasi enable row level security;
drop policy if exists pengaturan_aplikasi_baca on pengaturan_aplikasi;
create policy pengaturan_aplikasi_baca on pengaturan_aplikasi
  for select to authenticated using (true);

create or replace function admin_simpan_pengaturan(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then raise exception 'Khusus admin aplikasi.'; end if;
  if coalesce(trim(p->>'namaUsaha'), '') = '' then raise exception 'Nama usaha belum diisi.'; end if;
  perform cek_gambar(p->>'ttd', 'Tanda tangan');
  perform cek_gambar(p->>'stempel', 'Stempel');
  update pengaturan_aplikasi set
    nama_usaha = trim(p->>'namaUsaha'),
    alamat = nullif(trim(p->>'alamat'), ''),
    wa = nullif(regexp_replace(coalesce(p->>'wa', ''), '[^0-9]', '', 'g'), ''),
    email = nullif(trim(p->>'email'), ''),
    rekening = coalesce(p->'rekening', '[]'::jsonb),
    nama_penandatangan = nullif(trim(p->>'namaPenandatangan'), ''),
    jabatan = coalesce(nullif(trim(p->>'jabatan'), ''), 'Pemilik'),
    ttd = p->>'ttd',
    stempel = p->>'stempel',
    diubah_pada = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 4. dokumen
-- =====================================================================

-- Nomor kuitansi pembayaran: KW-2609-1A2B3C4D (tahun-bulan + 8 huruf id).
create or replace function nomor_dokumen(p_awalan text, p_id uuid, p_waktu timestamptz)
returns text language sql immutable as $$
  select p_awalan || '-' || to_char(p_waktu at time zone 'Asia/Jakarta', 'YYMM') || '-'
         || upper(substr(replace(p_id::text, '-', ''), 1, 8))
$$;

-- Isi lengkap satu kuitansi pembayaran (internal).
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
    -- target & total terbayar untuk item yang sama SAMPAI transaksi ini
    -- (bukan sampai hari ini), supaya kuitansi lama tetap bercerita benar
    'target', case when p.jenis = 'spp' then s.spp_nominal else b.nominal end,
    'terbayarSampaiIni', (
      select coalesce(sum(q.nominal), 0) from pembayaran q
       where q.siswa_id = p.siswa_id and q.jenis = p.jenis
         and q.periode is not distinct from p.periode and q.biaya_id is not distinct from p.biaya_id
         and (q.dibayar_pada, q.id) <= (p.dibayar_pada, p.id)),
    'siswa', jsonb_build_object('nama', x.nama, 'kelas', x.kelas, 'nis', x.nis, 'wali', x.wali),
    'sekolah', jsonb_build_object('nama', s.nama, 'alamat', s.alamat, 'kepalaSekolah', s.kepala_sekolah),
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
  left join sekolah_ttd t on t.sekolah_id = p.sekolah_id
  where p.id = p_id
$$;
revoke all on function data_kuitansi(uuid) from public;

-- Staf sekolah: kuitansi transaksi sekolahnya sendiri.
create or replace function kuitansi_staf(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from pembayaran where id = p_id and sekolah_id = sekolah_saya()) then
    raise exception 'Transaksi tidak ditemukan.';
  end if;
  return data_kuitansi(p_id);
end $$;

-- Portal orang tua: hanya transaksi anak yang terhubung dengan token itu.
create or replace function kuitansi_portal(p_token text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w wali%rowtype; sk sekolah%rowtype;
begin
  select * into w from wali where token = p_token;
  if not found then raise exception 'Tautan portal tidak dikenal atau sudah tidak berlaku'; end if;
  select * into sk from sekolah where id = w.sekolah_id;
  if (hitung_status_langganan(sk.trial_mulai, sk.langganan_sampai, sk.dinonaktifkan_admin)->>'portalAktif')::boolean is not true then
    raise exception 'Portal pembayaran sekolah ini sedang tidak aktif. Silakan hubungi pihak sekolah.';
  end if;
  if not exists (
    select 1 from pembayaran p join wali_siswa ws on ws.siswa_id = p.siswa_id
     where p.id = p_id and ws.wali_id = w.id
  ) then
    raise exception 'Transaksi tidak ditemukan.';
  end if;
  return data_kuitansi(p_id);
end $$;

-- Riwayat pembayaran sewa milik sekolah sendiri (kepala & admin sekolah).
create or replace function riwayat_langganan_saya()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select peran from profil where id = auth.uid()), '') not in ('kepala', 'admin') then
    raise exception 'Khusus kepala sekolah atau admin sekolah.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'nomor', nomor_dokumen('KWS', r.id, r.dibuat_pada),
      'bulan', r.bulan, 'jumlahSiswa', r.jumlah_siswa, 'tarif', r.tarif, 'nominal', r.nominal,
      'periodeMulai', r.periode_mulai, 'sampaiBaru', r.sampai_baru, 'dibuatPada', r.dibuat_pada
    ) order by r.dibuat_pada desc)
    from riwayat_langganan r where r.sekolah_id = sekolah_saya()
  ), '[]'::jsonb);
end $$;

-- Identitas penerbit (untuk invoice & kuitansi sewa).
create or replace function data_penerbit()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'namaUsaha', a.nama_usaha, 'alamat', a.alamat, 'wa', a.wa, 'email', a.email,
    'rekening', a.rekening, 'namaPenandatangan', a.nama_penandatangan, 'jabatan', a.jabatan,
    'ttd', a.ttd, 'stempel', a.stempel)
  from pengaturan_aplikasi a where a.id = 1
$$;
revoke all on function data_penerbit() from public;
grant execute on function data_penerbit() to authenticated;

-- Kuitansi sewa: admin aplikasi, atau kepala/admin sekolah pemilik transaksi.
create or replace function kuitansi_sewa(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r riwayat_langganan%rowtype; s sekolah%rowtype;
begin
  select * into r from riwayat_langganan where id = p_id;
  if not found then raise exception 'Transaksi sewa tidak ditemukan.'; end if;
  if not saya_admin_aplikasi() and not coalesce(
    r.sekolah_id = sekolah_saya() and (select peran from profil where id = auth.uid()) in ('kepala', 'admin'),
    false
  ) then
    raise exception 'Transaksi sewa tidak ditemukan.';
  end if;
  select * into s from sekolah where id = r.sekolah_id;
  return jsonb_build_object(
    'id', r.id, 'nomor', nomor_dokumen('KWS', r.id, r.dibuat_pada),
    'bulan', r.bulan, 'jumlahSiswa', r.jumlah_siswa, 'tarif', r.tarif, 'nominal', r.nominal,
    'periodeMulai', r.periode_mulai, 'sampaiBaru', r.sampai_baru, 'dibuatPada', r.dibuat_pada,
    'sekolah', jsonb_build_object('nama', s.nama, 'alamat', s.alamat, 'kepalaSekolah', s.kepala_sekolah),
    'penerbit', data_penerbit()
  );
end $$;

-- Verifikasi keaslian lewat QR — boleh tanpa login. Data yang dibuka
-- sengaja minimal (nama siswa disamarkan, tanpa wali/NIS).
create or replace function verifikasi_dokumen(p_kode text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v    jsonb;
begin
  begin
    v_id := p_kode::uuid;
  exception when others then
    return jsonb_build_object('sah', false);
  end;

  select jsonb_build_object(
    'sah', true, 'jenis', 'kuitansi',
    'nomor', nomor_dokumen('KW', p.id, p.dibayar_pada),
    'sekolah', s.nama,
    'siswa', split_part(x.nama, ' ', 1) || coalesce(' ' || nullif(
               (select string_agg(left(w, 1) || '.', ' ') from unnest((string_to_array(x.nama, ' '))[2:]) w), ''), ''),
    'kelas', x.kelas,
    'keterangan', p.keterangan, 'nominal', p.nominal, 'metode', p.metode,
    'tanggal', p.dibayar_pada)
    into v
    from pembayaran p join siswa x on x.id = p.siswa_id join sekolah s on s.id = p.sekolah_id
   where p.id = v_id;
  if v is not null then return v; end if;

  select jsonb_build_object(
    'sah', true, 'jenis', 'kuitansi_sewa',
    'nomor', nomor_dokumen('KWS', r.id, r.dibuat_pada),
    'sekolah', s.nama,
    'penerbit', (select nama_usaha from pengaturan_aplikasi where id = 1),
    'keterangan', 'Sewa aplikasi ' || r.bulan || ' bulan (' || to_char(r.periode_mulai, 'DD-MM-YYYY')
                  || ' s.d. ' || to_char(r.sampai_baru, 'DD-MM-YYYY') || ')',
    'nominal', r.nominal,
    'tanggal', r.dibuat_pada)
    into v
    from riwayat_langganan r join sekolah s on s.id = r.sekolah_id
   where r.id = v_id;

  return coalesce(v, jsonb_build_object('sah', false));
end $$;

-- =====================================================================
-- 5. Tanya AI v2
-- =====================================================================

-- ai_mulai: kepala & admin sekolah, kuota per sekolah.
create or replace function ai_mulai(p_batas int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  s        sekolah%rowtype;
  v_peran  text;
  v_hari   date := ai_hari_ini();
  v_kini   int  := ai_indeks_bulan(v_hari);
  v_batas  int;
  v_jumlah int;
  v_awal   int;
begin
  select peran into v_peran from profil where id = auth.uid();
  if coalesce(v_peran, '') not in ('kepala', 'admin') then
    raise exception 'Fitur Tanya AI khusus untuk kepala sekolah dan admin sekolah.';
  end if;

  select * into s from sekolah where id = v_sk;
  if hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status' = 'kadaluarsa' then
    raise exception 'Masa langganan sedang tidak aktif. Tanya AI bisa dipakai lagi setelah langganan diperpanjang.';
  end if;

  v_batas := coalesce(s.ai_batas_harian, p_batas);
  if v_batas <= 0 then
    raise exception 'Tanya AI sedang dimatikan untuk sekolah ini. Hubungi admin aplikasi kalau ingin mengaktifkannya.';
  end if;

  insert into ai_pemakaian as a (sekolah_id, tanggal, jumlah)
  values (v_sk, v_hari, 1)
  on conflict (sekolah_id, tanggal) do update set jumlah = a.jumlah + 1
  returning jumlah into v_jumlah;

  if v_jumlah > v_batas then
    raise exception 'Batas % pertanyaan hari ini sudah tercapai. Tanya AI bisa dipakai lagi besok.', v_batas;
  end if;

  v_awal := case when extract(month from v_hari) >= 7 then extract(year from v_hari)::int
                 else extract(year from v_hari)::int - 1 end;

  return jsonb_build_object(
    'nama_sekolah', s.nama,
    'kepala_sekolah', s.kepala_sekolah,
    'penanya', (select nama || ' (' || case peran when 'kepala' then 'kepala sekolah' else 'admin sekolah' end || ')'
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
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas)
  );
end $$;

-- Admin aplikasi mengatur kuota per sekolah. NULL = kembali ke default, 0 = matikan.
create or replace function admin_ubah_kuota_ai(p_sekolah_id uuid, p_batas int)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then raise exception 'Khusus admin aplikasi.'; end if;
  update sekolah set ai_batas_harian = p_batas where id = p_sekolah_id;
  if not found then raise exception 'Sekolah tidak ditemukan.'; end if;
  return jsonb_build_object('sekolahId', p_sekolah_id, 'aiBatasHarian', p_batas);
end $$;

-- daftar_langganan: tambah alamat, kepala sekolah, kuota & pemakaian AI hari ini.
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
      'alamat', s.alamat,
      'kepalaSekolah', s.kepala_sekolah,
      'dibuatPada', s.dibuat_pada,
      'trialMulai', s.trial_mulai,
      'langgananSampai', s.langganan_sampai,
      'hargaPerSiswa', s.harga_per_siswa,
      'dinonaktifkanAdmin', s.dinonaktifkan_admin,
      'aiBatasHarian', s.ai_batas_harian,
      'aiTerpakaiHariIni', coalesce((select a.jumlah from ai_pemakaian a
                                      where a.sekolah_id = s.id and a.tanggal = ai_hari_ini()), 0),
      'jumlahSiswaAktif', (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif),
      'status', hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin),
      'aktifSejak', coalesce(
        (select r.periode_mulai from riwayat_langganan r
          where r.sekolah_id = s.id order by r.dibuat_pada desc limit 1),
        s.trial_mulai::date),
      'terakhirBayar', (select max(r.dibuat_pada) from riwayat_langganan r where r.sekolah_id = s.id),
      'totalDibayar', coalesce((select sum(r.nominal) from riwayat_langganan r where r.sekolah_id = s.id), 0),
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

-- =====================================================================
-- hak akses
-- =====================================================================
revoke all on function lindungi_kolom_sekolah()                  from public;
revoke all on function simpan_ttd_sekolah(text, text, text, text) from public;
revoke all on function admin_simpan_pengaturan(jsonb)             from public;
revoke all on function kuitansi_staf(uuid)                        from public;
revoke all on function kuitansi_portal(text, uuid)                from public;
revoke all on function riwayat_langganan_saya()                   from public;
revoke all on function kuitansi_sewa(uuid)                        from public;
revoke all on function verifikasi_dokumen(text)                   from public;
revoke all on function ai_mulai(int)                              from public;
revoke all on function admin_ubah_kuota_ai(uuid, int)             from public;
revoke all on function daftar_langganan()                         from public;

grant execute on function simpan_ttd_sekolah(text, text, text, text) to authenticated;
grant execute on function admin_simpan_pengaturan(jsonb)             to authenticated;
grant execute on function kuitansi_staf(uuid)                        to authenticated;
grant execute on function kuitansi_portal(text, uuid)                to anon, authenticated;
grant execute on function riwayat_langganan_saya()                   to authenticated;
grant execute on function kuitansi_sewa(uuid)                        to authenticated;
grant execute on function verifikasi_dokumen(text)                   to anon, authenticated;
grant execute on function ai_mulai(int)                              to authenticated;
grant execute on function admin_ubah_kuota_ai(uuid, int)             to authenticated;
grant execute on function daftar_langganan()                         to authenticated;
