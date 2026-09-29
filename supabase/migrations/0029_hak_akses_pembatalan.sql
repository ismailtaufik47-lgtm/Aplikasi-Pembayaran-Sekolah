-- =====================================================================
-- 0029 — Dua peran, hak akses per sekolah, pembatalan transaksi,
--        dan kunci transaksi saat masa sewa habis.
--
-- 1. Peran sekolah tinggal DUA: 'kepala' (kepala sekolah) dan 'admin'
--    (admin/TU). Akun & kode aktivasi 'guru' yang sudah ada otomatis
--    diubah menjadi 'admin' — tidak ada akun yang kehilangan akses.
--
-- 2. Hak akses per sekolah (diatur admin aplikasi di panel admin):
--       sekolah.hak_akses = { kepala: {fitur: tingkat}, admin: {...} }
--    tingkat: 'tidak' | 'lihat' | 'kelola'. NULL = pengaturan standar.
--    Ditegakkan di DATABASE (kebijakan RLS & fungsi), bukan hanya
--    menyembunyikan menu.
--
-- 3. Pembatalan pembayaran: TIDAK ADA hapus langsung lagi. Lewat fungsi
--    batalkan_pembayaran(id, alasan): baris dipindah ke arsip
--    pembayaran_batal (lengkap dengan siapa/kapan/alasan) lalu dikeluarkan
--    dari tabel pembayaran — jadi semua hitungan (status SPP, laporan,
--    portal orang tua, Tanya AI) otomatis tidak menghitungnya lagi.
--    Kuitansi yang sudah beredar tampil "DIBATALKAN" saat QR-nya dicek.
--
-- 4. Masa sewa habis → semua transaksi terkunci: catat pembayaran, tambah
--    siswa, catat kas, saldo awal kas, dan pembatalan. Terbuka lagi begitu
--    sewa diperpanjang. Data tetap bisa DILIHAT.
--
-- Butuh 0024–0028. Aman dijalankan berulang kali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. dua peran
-- ---------------------------------------------------------------------
update profil set peran = 'admin' where peran = 'guru';
alter table profil alter column peran set default 'admin';
alter table profil drop constraint if exists profil_peran_check;
alter table profil add constraint profil_peran_check check (peran in ('kepala', 'admin'));

update kode_aktivasi set peran = 'admin' where peran = 'guru';
alter table kode_aktivasi alter column peran set default 'admin';
alter table kode_aktivasi drop constraint if exists kode_aktivasi_peran_check;
alter table kode_aktivasi add constraint kode_aktivasi_peran_check check (peran in ('admin'));

-- ---------------------------------------------------------------------
-- 2. hak akses
-- ---------------------------------------------------------------------
alter table sekolah add column if not exists hak_akses jsonb;
comment on column sekolah.hak_akses is
  'Hak akses per peran & fitur. NULL = standar. Hanya bisa diubah admin aplikasi (admin_atur_hak_akses).';

-- Fitur & tingkat yang boleh dipilih untuk masing-masing fitur.
create or replace function hak_akses_pilihan() returns jsonb
language sql immutable as $$
  select '{
    "siswa":          ["tidak", "lihat", "kelola"],
    "pembayaran":     ["tidak", "lihat", "kelola"],
    "batal":          ["tidak", "lihat", "kelola"],
    "kas":            ["tidak", "lihat", "kelola"],
    "lap_pembayaran": ["tidak", "lihat"],
    "lap_keuangan":   ["tidak", "lihat"],
    "ai":             ["tidak", "kelola"],
    "biaya":          ["tidak", "lihat", "kelola"],
    "sekolah":        ["tidak", "kelola"]
  }'::jsonb
$$;

create or replace function hak_akses_standar() returns jsonb
language sql immutable as $$
  select '{
    "kepala": {"siswa": "lihat", "pembayaran": "lihat", "batal": "kelola", "kas": "lihat",
               "lap_pembayaran": "lihat", "lap_keuangan": "lihat", "ai": "kelola", "biaya": "lihat", "sekolah": "kelola"},
    "admin":  {"siswa": "kelola", "pembayaran": "kelola", "batal": "kelola", "kas": "kelola",
               "lap_pembayaran": "lihat", "lap_keuangan": "lihat", "ai": "kelola", "biaya": "kelola", "sekolah": "tidak"}
  }'::jsonb
$$;

/** Hak akses yang berlaku untuk satu sekolah (standar + pengaturan sekolah itu). */
create or replace function hak_akses_sekolah(p_sekolah uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kepala', (hak_akses_standar() -> 'kepala') || coalesce(s.hak_akses -> 'kepala', '{}'::jsonb) || '{"sekolah": "kelola"}'::jsonb,
    'admin',  (hak_akses_standar() -> 'admin')  || coalesce(s.hak_akses -> 'admin',  '{}'::jsonb)
  )
  from sekolah s where s.id = p_sekolah
$$;

/** Tingkat akses akun yang sedang login untuk satu fitur: 0 tidak · 1 lihat · 2 kelola. */
create or replace function tingkat_akses(p_fitur text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case hak_akses_sekolah(p.sekolah_id) -> p.peran ->> p_fitur
             when 'kelola' then 2 when 'lihat' then 1 else 0 end
      from profil p where p.id = auth.uid()
  ), 0)
$$;

create or replace function boleh(p_fitur text, p_tingkat text default 'kelola') returns boolean
language sql stable security definer set search_path = public as $$
  select tingkat_akses(p_fitur) >= case p_tingkat when 'kelola' then 2 when 'lihat' then 1 else 0 end
$$;

/** Hak akses akun yang sedang login — dipakai aplikasi untuk menampilkan menu. */
create or replace function hak_akses_saya() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('peran', p.peran, 'akses', hak_akses_sekolah(p.sekolah_id) -> p.peran)
    from profil p where p.id = auth.uid()
$$;

/** Masa sewa habis → tolak semua transaksi. */
create or replace function wajib_langganan_aktif(p_sekolah uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if (select hitung_status_langganan(trial_mulai, langganan_sampai, dinonaktifkan_admin) ->> 'status'
        from sekolah where id = p_sekolah) = 'kadaluarsa' then
    raise exception 'Masa langganan sekolah sedang tidak aktif. Perpanjang langganan dulu untuk melanjutkan.'
      using errcode = 'P0001';
  end if;
end $$;

-- ---------- admin aplikasi: baca & atur hak akses ----------
create or replace function admin_hak_akses(p_sekolah_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then raise exception 'Khusus admin aplikasi.'; end if;
  return jsonb_build_object(
    'akses', hak_akses_sekolah(p_sekolah_id),
    'standar', (select hak_akses is null from sekolah where id = p_sekolah_id),
    'pilihan', hak_akses_pilihan()
  );
end $$;

/** p_hak NULL = kembali ke standar. Kombinasi yang membuat sekolah "terkunci" ditolak. */
create or replace function admin_atur_hak_akses(p_sekolah_id uuid, p_hak jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pil jsonb := hak_akses_pilihan();
  v_baru jsonb;
  v_peran text; v_fitur text; v_nilai text;
begin
  if not saya_admin_aplikasi() then raise exception 'Khusus admin aplikasi.'; end if;
  if not exists (select 1 from sekolah where id = p_sekolah_id) then raise exception 'Sekolah tidak ditemukan.'; end if;

  if p_hak is null then
    update sekolah set hak_akses = null where id = p_sekolah_id;
    return hak_akses_sekolah(p_sekolah_id);
  end if;
  if jsonb_typeof(p_hak) <> 'object' then raise exception 'Format hak akses tidak dikenal.'; end if;

  for v_peran in select jsonb_object_keys(p_hak) loop
    if v_peran not in ('kepala', 'admin') then raise exception 'Peran "%" tidak dikenal.', v_peran; end if;
    if jsonb_typeof(p_hak -> v_peran) <> 'object' then raise exception 'Format hak akses tidak dikenal.'; end if;
    for v_fitur, v_nilai in select key, value #>> '{}' from jsonb_each(p_hak -> v_peran) loop
      if not v_pil ? v_fitur then raise exception 'Fitur "%" tidak dikenal.', v_fitur; end if;
      if not (v_pil -> v_fitur) ? coalesce(v_nilai, '') then
        raise exception 'Tingkat "%" tidak berlaku untuk fitur "%".', v_nilai, v_fitur;
      end if;
    end loop;
  end loop;

  v_baru := jsonb_build_object(
    'kepala', (hak_akses_standar() -> 'kepala') || coalesce(p_hak -> 'kepala', '{}'::jsonb),
    'admin',  (hak_akses_standar() -> 'admin')  || coalesce(p_hak -> 'admin',  '{}'::jsonb)
  );

  -- pengaman supaya sekolah tidak mengunci dirinya sendiri
  if v_baru #>> '{kepala,sekolah}' <> 'kelola' then
    raise exception 'Kepala sekolah harus tetap bisa mengelola profil sekolah, kode aktivasi, dan langganan.';
  end if;
  if v_baru #>> '{kepala,pembayaran}' <> 'kelola' and v_baru #>> '{admin,pembayaran}' <> 'kelola' then
    raise exception 'Minimal satu peran harus bisa mencatat pembayaran.';
  end if;
  if v_baru #>> '{kepala,siswa}' <> 'kelola' and v_baru #>> '{admin,siswa}' <> 'kelola' then
    raise exception 'Minimal satu peran harus bisa mengelola data siswa.';
  end if;
  if v_baru #>> '{kepala,biaya}' <> 'kelola' and v_baru #>> '{admin,biaya}' <> 'kelola' then
    raise exception 'Minimal satu peran harus bisa mengatur jenis biaya & nominal SPP.';
  end if;

  update sekolah set hak_akses = v_baru where id = p_sekolah_id;
  return hak_akses_sekolah(p_sekolah_id);
end $$;

-- ---------------------------------------------------------------------
-- 2b. tegakkan hak akses di tabel (RLS)
-- ---------------------------------------------------------------------
-- siswa, wali, wali_siswa: semua staf boleh membaca; menulis butuh siswa=kelola
drop policy if exists siswa_semua on siswa;
drop policy if exists siswa_baca on siswa;
drop policy if exists siswa_tulis on siswa;
drop policy if exists siswa_ubah on siswa;
drop policy if exists siswa_hapus on siswa;
create policy siswa_baca  on siswa for select using (sekolah_id = sekolah_saya());
create policy siswa_tulis on siswa for insert with check (sekolah_id = sekolah_saya() and boleh('siswa'));
create policy siswa_ubah  on siswa for update using (sekolah_id = sekolah_saya() and boleh('siswa')) with check (sekolah_id = sekolah_saya());
create policy siswa_hapus on siswa for delete using (sekolah_id = sekolah_saya() and boleh('siswa'));

drop policy if exists wali_semua on wali;
drop policy if exists wali_baca on wali;
drop policy if exists wali_tulis on wali;
create policy wali_baca  on wali for select using (sekolah_id = sekolah_saya());
create policy wali_tulis on wali for all using (sekolah_id = sekolah_saya() and boleh('siswa')) with check (sekolah_id = sekolah_saya() and boleh('siswa'));

drop policy if exists wali_siswa_semua on wali_siswa;
drop policy if exists wali_siswa_baca on wali_siswa;
drop policy if exists wali_siswa_tulis on wali_siswa;
create policy wali_siswa_baca on wali_siswa for select
  using (exists (select 1 from wali w where w.id = wali_siswa.wali_id and w.sekolah_id = sekolah_saya()));
create policy wali_siswa_tulis on wali_siswa for all
  using (boleh('siswa') and exists (select 1 from wali w where w.id = wali_siswa.wali_id and w.sekolah_id = sekolah_saya()))
  with check (boleh('siswa') and exists (select 1 from wali w where w.id = wali_siswa.wali_id and w.sekolah_id = sekolah_saya()));

-- biaya: baca semua staf; ubah butuh biaya=kelola
drop policy if exists biaya_semua on biaya;
drop policy if exists biaya_baca on biaya;
drop policy if exists biaya_tulis on biaya;
create policy biaya_baca  on biaya for select using (sekolah_id = sekolah_saya());
create policy biaya_tulis on biaya for all using (sekolah_id = sekolah_saya() and boleh('biaya')) with check (sekolah_id = sekolah_saya() and boleh('biaya'));

-- pembayaran: baca semua staf; catat butuh pembayaran=kelola;
-- TIDAK ADA ubah/hapus langsung — pembatalan wajib lewat batalkan_pembayaran().
drop policy if exists pembayaran_semua on pembayaran;
drop policy if exists pembayaran_baca on pembayaran;
drop policy if exists pembayaran_catat on pembayaran;
create policy pembayaran_baca  on pembayaran for select using (sekolah_id = sekolah_saya());
create policy pembayaran_catat on pembayaran for insert with check (sekolah_id = sekolah_saya() and boleh('pembayaran'));

-- kas: dibaca oleh yang boleh melihat kas atau laporan keuangan
drop policy if exists kas_baca on kas;
create policy kas_baca on kas for select
  using (sekolah_id = sekolah_saya() and (boleh('kas', 'lihat') or boleh('lap_keuangan', 'lihat')));
drop policy if exists kas_pengaturan_baca on kas_pengaturan;
create policy kas_pengaturan_baca on kas_pengaturan for select
  using (sekolah_id = sekolah_saya() and (boleh('kas', 'lihat') or boleh('lap_keuangan', 'lihat')));

-- sekolah: kolom profil butuh sekolah=kelola, kolom SPP butuh biaya=kelola
drop policy if exists sekolah_ubah on sekolah;
create policy sekolah_ubah on sekolah for update
  using (id = sekolah_saya() and (boleh('sekolah') or boleh('biaya')))
  with check (id = sekolah_saya());

create or replace function lindungi_kolom_sekolah()
returns trigger
language plpgsql set search_path = public as $$
begin
  -- Hanya perubahan LANGSUNG dari akun pengguna (lewat API) yang diperiksa.
  -- Fungsi resmi (security definer) berjalan sebagai pemilik database.
  if current_user <> 'authenticated' or saya_admin_aplikasi() then
    return new;
  end if;
  if new.langganan_sampai     is distinct from old.langganan_sampai
     or new.trial_mulai       is distinct from old.trial_mulai
     or new.harga_per_siswa   is distinct from old.harga_per_siswa
     or new.dinonaktifkan_admin is distinct from old.dinonaktifkan_admin
     or new.status_langganan  is distinct from old.status_langganan
     or new.ai_batas_harian   is distinct from old.ai_batas_harian
     or new.hak_akses         is distinct from old.hak_akses then
    raise exception 'Data langganan & hak akses hanya bisa diubah oleh admin aplikasi.' using errcode = '42501';
  end if;
  if (new.nama is distinct from old.nama
      or new.kepala_sekolah is distinct from old.kepala_sekolah
      or new.alamat is distinct from old.alamat
      or new.wa is distinct from old.wa
      or new.rekening is distinct from old.rekening) and not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses mengubah profil sekolah.' using errcode = '42501';
  end if;
  if (new.spp_nominal is distinct from old.spp_nominal
      or new.tanggal_jatuh_tempo is distinct from old.tanggal_jatuh_tempo) and not boleh('biaya') then
    raise exception 'Akun ini tidak punya akses mengubah nominal SPP.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. pembatalan pembayaran (arsip, bukan hapus)
-- ---------------------------------------------------------------------
create table if not exists pembayaran_batal (
  id              uuid primary key,
  sekolah_id      uuid not null references sekolah(id) on delete cascade,
  siswa_id        uuid,
  jenis           text not null,
  periode         smallint,
  biaya_id        uuid,
  keterangan      text not null,
  nominal         integer not null,
  metode          text,
  petugas         text,
  dicatat_oleh    uuid,
  dibayar_pada    timestamptz not null,
  dibatalkan_pada timestamptz not null default now(),
  dibatalkan_oleh uuid,
  dibatalkan_nama text,
  alasan          text not null
);
create index if not exists pembayaran_batal_sekolah_idx on pembayaran_batal(sekolah_id, dibatalkan_pada desc);
alter table pembayaran_batal enable row level security;
-- Tidak ada kebijakan: hanya bisa dibaca lewat riwayat_pembatalan().

create or replace function batalkan_pembayaran(p_id uuid, p_alasan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr profil%rowtype; b pembayaran%rowtype;
begin
  select * into pr from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Tuliskan alasan pembatalan.'; end if;

  perform wajib_langganan_aktif(pr.sekolah_id);
  select * into b from pembayaran where id = p_id and sekolah_id = pr.sekolah_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;

  insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, biaya_id, keterangan, nominal, metode,
                                petugas, dicatat_oleh, dibayar_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
  values (b.id, b.sekolah_id, b.siswa_id, b.jenis, b.periode, b.biaya_id, b.keterangan, b.nominal, b.metode,
          b.petugas, b.dicatat_oleh, b.dibayar_pada, pr.id, pr.nama, left(trim(p_alasan), 200));
  delete from pembayaran where id = b.id;

  return jsonb_build_object('id', b.id, 'nominal', b.nominal, 'keterangan', b.keterangan);
end $$;

/** Daftar transaksi yang dibatalkan (pembayaran + kas) untuk sekolah sendiri. */
create or replace function riwayat_pembatalan(p_batas int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal', 'lihat') then raise exception 'Akun ini tidak punya akses melihat riwayat pembatalan.'; end if;
  return coalesce((
    select jsonb_agg(t.x order by t.x->>'dibatalkanPada' desc)
    from (
     select u.x from (
      select jsonb_build_object(
        'id', b.id, 'sumber', 'pembayaran', 'jenis', 'masuk',
        'uraian', b.keterangan || coalesce(' · ' || s.nama, ''),
        'nominal', b.nominal, 'tanggal', b.dibayar_pada, 'petugas', b.petugas,
        'dibatalkanPada', b.dibatalkan_pada, 'dibatalkanNama', b.dibatalkan_nama, 'alasan', b.alasan) x
        from pembayaran_batal b left join siswa s on s.id = b.siswa_id
       where b.sekolah_id = v_sk
      union all
      select jsonb_build_object(
        'id', k.id, 'sumber', 'kas', 'jenis', k.jenis,
        'uraian', k.kategori || coalesce(' — ' || k.keterangan, ''),
        'nominal', k.nominal, 'tanggal', k.tanggal, 'petugas', k.dicatat_nama,
        'dibatalkanPada', k.dibatalkan_pada, 'dibatalkanNama', k.dibatalkan_nama, 'alasan', k.alasan_batal)
        from kas k where k.sekolah_id = v_sk and k.dibatalkan_pada is not null
     ) u
     order by u.x->>'dibatalkanPada' desc
     limit greatest(1, least(p_batas, 1000))
    ) t
  ), '[]'::jsonb);
end $$;

-- Verifikasi kuitansi: kuitansi pembayaran yang sudah dibatalkan → "DIBATALKAN".
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

  -- sudah dibatalkan sekolah
  select jsonb_build_object(
    'sah', false, 'dibatalkan', true, 'jenis', 'kuitansi',
    'nomor', nomor_dokumen('KW', b.id, b.dibayar_pada),
    'sekolah', s.nama,
    'keterangan', b.keterangan, 'nominal', b.nominal,
    'tanggal', b.dibayar_pada, 'dibatalkanPada', b.dibatalkan_pada)
    into v
    from pembayaran_batal b join sekolah s on s.id = b.sekolah_id
   where b.id = v_id;
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

-- ---------------------------------------------------------------------
-- 4. kas — ikut hak akses & kunci langganan
-- ---------------------------------------------------------------------
create or replace function kas_catat(
  p_jenis text, p_tanggal date, p_kategori text, p_nominal bigint,
  p_keterangan text default null, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; v_id uuid;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mencatat kas.'; end if;
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
  returning id into v_id;   -- trigger kas_cek_langganan menolak kalau sewa habis
  return v_id;
end $$;

create or replace function kas_batalkan(p_id uuid, p_alasan text)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'Tuliskan alasan pembatalan.';
  end if;
  perform wajib_langganan_aktif(p.sekolah_id);
  if not exists (select 1 from kas where id = p_id and sekolah_id = p.sekolah_id and dibatalkan_pada is null) then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.';
  end if;
  update kas
     set dibatalkan_pada = now(), dibatalkan_nama = p.nama, alasan_batal = left(trim(p_alasan), 200)
   where id = p_id and sekolah_id = p.sekolah_id and dibatalkan_pada is null;
end $$;

create or replace function kas_atur_saldo_awal(p_saldo bigint, p_mulai date)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mengatur kas.'; end if;
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if p_mulai > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal mulai tidak boleh di masa depan.';
  end if;
  perform wajib_langganan_aktif(p.sekolah_id);
  insert into kas_pengaturan as k (sekolah_id, saldo_awal, mulai, diubah_oleh, diubah_pada)
  values (p.sekolah_id, coalesce(p_saldo, 0), p_mulai, p.nama, now())
  on conflict (sekolah_id) do update
    set saldo_awal = excluded.saldo_awal, mulai = excluded.mulai,
        diubah_oleh = excluded.diubah_oleh, diubah_pada = now();
end $$;

-- ---------------------------------------------------------------------
-- 5. fungsi lama yang memeriksa peran → pakai hak akses
-- ---------------------------------------------------------------------
create or replace function buat_kode_aktivasi(p_peran text default 'admin')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_id uuid;
  v_kode       text;
  v_percobaan  int := 0;
begin
  select sekolah_id into v_sekolah_id from profil where id = auth.uid();
  if v_sekolah_id is null then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  if not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses membuat kode aktivasi.';
  end if;
  if coalesce(p_peran, '') <> 'admin' then
    raise exception 'Kode aktivasi hanya untuk akun Admin/TU.';
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
  values (v_sekolah_id, v_kode, 'admin', auth.uid());

  return jsonb_build_object('kode', v_kode, 'peran', 'admin');
end $$;

create or replace function simpan_ttd_sekolah(
  p_nama text, p_jabatan text, p_ttd text, p_stempel text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses mengubah tanda tangan kuitansi.';
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

create or replace function simpan_logo_sekolah(p_logo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses mengubah logo sekolah.';
  end if;
  perform cek_gambar(p_logo, 'Logo');

  insert into sekolah_ttd as t (sekolah_id, logo, diubah_pada)
  values (v_sk, p_logo, now())
  on conflict (sekolah_id) do update set logo = excluded.logo, diubah_pada = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function riwayat_langganan_saya()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses ke halaman langganan.';
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

create or replace function kuitansi_sewa(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r riwayat_langganan%rowtype; s sekolah%rowtype;
begin
  select * into r from riwayat_langganan where id = p_id;
  if not found then raise exception 'Transaksi sewa tidak ditemukan.'; end if;
  if not saya_admin_aplikasi() and not coalesce(r.sekolah_id = sekolah_saya() and boleh('sekolah'), false) then
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

-- Tanya AI: ikut hak akses fitur "ai"
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
begin
  if not boleh('ai') then
    raise exception 'Akun ini tidak punya akses ke Tanya AI.';
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

  delete from ai_permintaan where sekolah_id = v_sk and dibuat_pada < now() - interval '1 day';
  insert into ai_permintaan (sekolah_id, tanggal) values (v_sk, v_hari) returning id into v_kunci;

  v_awal := case when extract(month from v_hari) >= 7 then extract(year from v_hari)::int
                 else extract(year from v_hari)::int - 1 end;

  return jsonb_build_object(
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
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas),
    'kunci_pemakaian', v_kunci
  );
end $$;

-- ---------------------------------------------------------------------
-- izin eksekusi
-- ---------------------------------------------------------------------
revoke all on function hak_akses_sekolah(uuid) from public;
revoke all on function tingkat_akses(text) from public;
revoke all on function wajib_langganan_aktif(uuid) from public;
revoke all on function admin_hak_akses(uuid) from public;
revoke all on function admin_atur_hak_akses(uuid, jsonb) from public;
revoke all on function batalkan_pembayaran(uuid, text) from public;
revoke all on function riwayat_pembatalan(int) from public;
revoke all on function hak_akses_saya() from public;
grant execute on function boleh(text, text) to authenticated;
grant execute on function tingkat_akses(text) to authenticated;
grant execute on function hak_akses_saya() to authenticated;
grant execute on function admin_hak_akses(uuid) to authenticated;
grant execute on function admin_atur_hak_akses(uuid, jsonb) to authenticated;
grant execute on function batalkan_pembayaran(uuid, text) to authenticated;
grant execute on function riwayat_pembatalan(int) to authenticated;
