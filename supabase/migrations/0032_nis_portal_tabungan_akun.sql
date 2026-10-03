-- =====================================================================
-- 0032 — Portal orang tua pakai NIS · metode bayar "Tabungan" ·
--        kepala sekolah bisa menonaktifkan akun Admin/TU
--
-- 1. PORTAL + NIS
--    Tautan portal (/ortu/<token>) sekarang juga meminta NIS salah satu
--    anak. Pengecekan dilakukan DI SINI (server), bukan di aplikasi, jadi
--    tidak bisa dilewati. Salah 5 kali → portal tautan itu dikunci 15 menit.
--    Fungsi lama tanpa NIS (portal_wali(text), kuitansi_portal(text, uuid))
--    DIHAPUS supaya tidak ada pintu belakang.
--    Catatan: fungsi-fungsi ini sengaja VOLATILE (bukan stable) karena
--    menyimpan hitungan salah NIS, dan tidak pernah "raise" saat NIS salah
--    (raise membatalkan transaksi → hitungan salah ikut hilang).
--
-- 2. METODE "Tabungan" — pembayaran diambil dari tabungan siswa.
--
-- 3. AKUN NONAKTIF — kolom profil.aktif. Akun nonaktif:
--    • sekolah_saya() → NULL  → semua tabel sekolah tertutup (RLS)
--    • tingkat_akses() → 0    → semua fungsi yang memakai boleh() menolak
--    Riwayat transaksi yang pernah dicatat akun itu tetap utuh.
--
-- Aman dijalankan berulang kali. Jalankan SETELAH 0031.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. metode pembayaran "Tabungan"
-- ---------------------------------------------------------------------
alter table pembayaran drop constraint if exists pembayaran_metode_check;
alter table pembayaran add constraint pembayaran_metode_check
  check (metode in ('Tunai', 'Transfer', 'Tabungan'));

-- Tanya SAKU ikut memisahkan uang dari tabungan (selain tunai & transfer).
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
                         || ' (termasuk SPP bulan lain & kegiatan). Bisa beda dengan "SPP bulan ini".',
           'jumlah_transaksi', count(*),
           'total',    coalesce(sum(p.nominal), 0),
           'spp',      coalesce(sum(p.nominal) filter (where p.jenis = 'spp'), 0),
           'kegiatan', coalesce(sum(p.nominal) filter (where p.jenis = 'kegiatan'), 0),
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
      select p.*, x.nama as nama_siswa, x.kelas, b.nama as nama_kegiatan,
             p.dibayar_pada at time zone 'Asia/Jakarta' as waktu
        from pembayaran p
        join siswa x on x.id = p.siswa_id
        left join biaya b on b.id = p.biaya_id
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
                   'jenis', case when t.jenis = 'spp' then 'SPP ' || ai_nama_bulan(t.periode) else 'Kegiatan ' || coalesce(t.nama_kegiatan, '') end,
                   'nominal', t.nominal, 'metode', t.metode, 'petugas', nullif(t.petugas, '')) as o
            from t order by t.waktu limit 1000) z), '[]')
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- 2. akun Admin/TU bisa dinonaktifkan kepala sekolah
-- ---------------------------------------------------------------------
alter table profil add column if not exists aktif boolean not null default true;
alter table profil add column if not exists dinonaktifkan_pada timestamptz;
alter table profil add column if not exists dinonaktifkan_oleh text;
comment on column profil.aktif is 'FALSE = dinonaktifkan kepala sekolah: tidak bisa membuka data sekolah sama sekali.';

create or replace function sekolah_saya()
returns uuid
language sql stable security definer set search_path = public as $$
  select sekolah_id from profil where id = auth.uid() and aktif
$$;

create or replace function tingkat_akses(p_fitur text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case hak_akses_sekolah(p.sekolah_id) -> p.peran ->> p_fitur
             when 'kelola' then 2 when 'lihat' then 1 else 0 end
      from profil p where p.id = auth.uid() and p.aktif
  ), 0)
$$;

create or replace function hak_akses_saya() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'peran', p.peran,
    'aktif', p.aktif,
    'akses', case when p.aktif then hak_akses_sekolah(p.sekolah_id) -> p.peran else '{}'::jsonb end)
    from profil p where p.id = auth.uid()
$$;

/** Status akun yang sedang login — untuk layar "akun dinonaktifkan". */
create or replace function status_akun_saya() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('aktif', p.aktif, 'peran', p.peran, 'sekolah', s.nama,
                            'oleh', p.dinonaktifkan_oleh, 'pada', p.dinonaktifkan_pada)
    from profil p join sekolah s on s.id = p.sekolah_id
   where p.id = auth.uid()
$$;

/** Daftar akun di sekolah ini — khusus kepala sekolah (yang aktif). */
create or replace function akun_sekolah_daftar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profil%rowtype;
begin
  select * into me from profil where id = auth.uid() and aktif;
  if not found or me.peran <> 'kepala' then
    raise exception 'Daftar akun hanya bisa dibuka kepala sekolah.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'nama', p.nama, 'peran', p.peran, 'avatar', p.avatar, 'aktif', p.aktif,
             'email', u.email, 'bergabung', p.dibuat_pada, 'terakhirMasuk', u.last_sign_in_at,
             'dinonaktifkanPada', p.dinonaktifkan_pada, 'dinonaktifkanOleh', p.dinonaktifkan_oleh,
             'saya', p.id = me.id)
           order by (p.peran = 'kepala') desc, p.aktif desc, p.nama)
      from profil p left join auth.users u on u.id = p.id
     where p.sekolah_id = me.sekolah_id
  ), '[]'::jsonb);
end $$;

/** Nonaktifkan / aktifkan lagi akun Admin/TU. Kepala tidak bisa menonaktifkan dirinya atau kepala lain. */
create or replace function akun_sekolah_atur_aktif(p_id uuid, p_aktif boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profil%rowtype; t profil%rowtype;
begin
  select * into me from profil where id = auth.uid() and aktif;
  if not found or me.peran <> 'kepala' then
    raise exception 'Hanya kepala sekolah yang bisa menonaktifkan atau mengaktifkan akun.';
  end if;
  if p_aktif is null then raise exception 'Status akun tidak dikenal.'; end if;
  if p_id = me.id then raise exception 'Akun Anda sendiri tidak bisa dinonaktifkan.'; end if;
  select * into t from profil where id = p_id and sekolah_id = me.sekolah_id for update;
  if not found then raise exception 'Akun tidak ditemukan di sekolah ini.'; end if;
  if t.peran = 'kepala' then raise exception 'Akun kepala sekolah tidak bisa dinonaktifkan dari sini.'; end if;
  update profil
     set aktif = p_aktif,
         dinonaktifkan_pada = case when p_aktif then null else now() end,
         dinonaktifkan_oleh = case when p_aktif then null else me.nama end
   where id = p_id;
  return jsonb_build_object('id', p_id, 'aktif', p_aktif);
end $$;

revoke all on function status_akun_saya()                     from public, anon;
revoke all on function akun_sekolah_daftar()                  from public, anon;
revoke all on function akun_sekolah_atur_aktif(uuid, boolean) from public, anon;
grant execute on function status_akun_saya()                     to authenticated;
grant execute on function akun_sekolah_daftar()                  to authenticated;
grant execute on function akun_sekolah_atur_aktif(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. portal orang tua: wajib NIS
-- ---------------------------------------------------------------------
create table if not exists portal_percobaan (
  wali_id      uuid primary key references wali(id) on delete cascade,
  gagal        int not null default 0,
  kunci_sampai timestamptz,
  diperbarui   timestamptz not null default now()
);
alter table portal_percobaan enable row level security;
-- Tidak ada kebijakan: tabel ini hanya disentuh fungsi di bawah.
revoke all on portal_percobaan from anon, authenticated;

/** NIS dibandingkan tanpa spasi/tanda baca & tanpa beda huruf besar-kecil ("2026-001" = "2026 001" = "2026001"). */
create or replace function nis_rapi(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g')
$$;

/**
 * Gerbang portal. NULL = NIS cocok (boleh masuk).
 * Selain itu objek {galat: 'perlu_nis' | 'nis_salah' | 'terkunci', sisa, menit}.
 * Tautan tidak dikenal / portal sekolah nonaktif → exception (tidak menyimpan apa pun).
 */
create or replace function portal_cek_nis(p_token text, p_nis text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  w       wali%rowtype;
  sk      sekolah%rowtype;
  c       portal_percobaan%rowtype;
  v_batas constant int := 5;
begin
  select * into w from wali where token = p_token;
  if not found then
    raise exception 'Tautan portal tidak dikenal atau sudah tidak berlaku';
  end if;
  select * into sk from sekolah where id = w.sekolah_id;
  if (hitung_status_langganan(sk.trial_mulai, sk.langganan_sampai, sk.dinonaktifkan_admin)->>'portalAktif')::boolean is not true then
    raise exception 'Portal pembayaran sekolah ini sedang tidak aktif. Silakan hubungi pihak sekolah untuk informasi lebih lanjut.'
      using errcode = 'P0001';
  end if;

  if nis_rapi(p_nis) = '' then
    return jsonb_build_object('galat', 'perlu_nis');
  end if;

  select * into c from portal_percobaan where wali_id = w.id for update;
  if found and c.kunci_sampai > now() then
    return jsonb_build_object('galat', 'terkunci', 'menit', greatest(1, ceil(extract(epoch from c.kunci_sampai - now()) / 60)::int));
  end if;

  if exists (
    select 1 from siswa x join wali_siswa ws on ws.siswa_id = x.id
     where ws.wali_id = w.id and x.aktif and nis_rapi(x.nis) = nis_rapi(p_nis)
  ) then
    delete from portal_percobaan where wali_id = w.id;
    return null;
  end if;

  insert into portal_percobaan as p (wali_id, gagal, kunci_sampai, diperbarui)
  values (w.id, 1, null, now())
  on conflict (wali_id) do update set gagal = p.gagal + 1, kunci_sampai = null, diperbarui = now()
  returning * into c;

  if c.gagal >= v_batas then
    update portal_percobaan set gagal = 0, kunci_sampai = now() + interval '15 minutes', diperbarui = now()
     where wali_id = w.id;
    return jsonb_build_object('galat', 'terkunci', 'menit', 15);
  end if;
  return jsonb_build_object('galat', 'nis_salah', 'sisa', v_batas - c.gagal);
end $$;

/** Identitas sekolah untuk layar "Masukkan NIS" (tanpa data anak). */
create or replace function portal_gerbang(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w wali%rowtype; sk sekolah%rowtype;
begin
  select * into w from wali where token = p_token;
  if not found then
    raise exception 'Tautan portal tidak dikenal atau sudah tidak berlaku';
  end if;
  select * into sk from sekolah where id = w.sekolah_id;
  return jsonb_build_object(
    'sekolah', sk.nama,
    'wa', sk.wa,
    'logo', (select t.logo from sekolah_ttd t where t.sekolah_id = sk.id),
    'aktif', coalesce((hitung_status_langganan(sk.trial_mulai, sk.langganan_sampai, sk.dinonaktifkan_admin)->>'portalAktif')::boolean, false)
  );
end $$;

drop function if exists portal_wali(text);
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
    -- kolom internal sekolah (hak akses, kuota AI, tarif sewa) tidak ikut dikirim ke orang tua
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
    ), '[]'::jsonb)
  );
end $$;

drop function if exists kuitansi_portal(text, uuid);
create or replace function kuitansi_portal(p_token text, p_nis text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare w wali%rowtype; v jsonb;
begin
  v := portal_cek_nis(p_token, p_nis);
  if v is not null then
    return jsonb_build_object('gerbang', v);
  end if;
  select * into w from wali where token = p_token;
  if not exists (
    select 1 from pembayaran p join wali_siswa ws on ws.siswa_id = p.siswa_id
     where p.id = p_id and ws.wali_id = w.id
  ) then
    raise exception 'Transaksi tidak ditemukan.';
  end if;
  return data_kuitansi(p_id);
end $$;

-- Logo portal kini ikut portal_gerbang(); fungsi lama tetap ada (hanya logo sekolah, tanpa data anak).

revoke all on function nis_rapi(text)                         from public;
revoke all on function portal_cek_nis(text, text)             from public, anon, authenticated;
revoke all on function portal_gerbang(text)                   from public;
revoke all on function portal_wali(text, text)               from public;
revoke all on function kuitansi_portal(text, text, uuid)      from public;
grant execute on function nis_rapi(text)                      to anon, authenticated;
grant execute on function portal_gerbang(text)                to anon, authenticated;
grant execute on function portal_wali(text, text)             to anon, authenticated;
grant execute on function kuitansi_portal(text, text, uuid)   to anon, authenticated;
