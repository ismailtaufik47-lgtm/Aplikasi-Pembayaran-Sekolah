-- =====================================================================
-- 0044 — Aplikasi tetap ringan dari tahun ke tahun + tunggakan siswa
--        yang sudah lulus / keluar (v31)
--
--  pembayaran_dimuat()          : pembayaran yang ditarik saat aplikasi dibuka —
--                                 hanya tahun ajaran berjalan + yang masih terkait
--                                 tunggakan. Data tahun lama tidak ikut ditarik.
--  ringkasan_tunggakan_lalu()   : bulan SPP & kegiatan tahun lalu yang BELUM lunas
--                                 (siswa aktif). Yang tidak disebut = sudah lunas.
--  tunggakan_nonaktif()         : siswa lulus / keluar yang masih menunggak (menu Tagihan)
--  pembayaran_daftar(...)       : riwayat pembayaran orang tua per rentang tanggal
--                                 (menu Transaksi › tahun ajaran lalu), per halaman
--  portal orang tua             : anak yang sudah lulus / keluar tetap bisa dibuka
--                                 (lihat saja) selama masih ada tunggakan
--  Tanya SAKU                   : tunggakan tahun lalu + rekap per tahun ajaran
--  Butuh 0042 & 0043. Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================

-- ---------- bantu: bulan SPP tahun berjalan yang sudah jatuh tempo ----------
-- SPP bulan < hasil = sudah jatuh tempo (bulan lalu pasti; bulan ini kalau sudah lewat tanggal jatuh tempo)
create or replace function bulan_jatuh_tempo(p_sk uuid) returns int
language sql stable security definer set search_path = public as $$
  select ai_indeks_bulan(d.h)
         + case when d.h > ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', d.h)::date) then 1 else 0 end
    from sekolah s, (select (now() at time zone 'Asia/Jakarta')::date as h) d
   where s.id = p_sk
$$;

-- ---------- inti: tagihan yang belum lunas, per bulan SPP / per kegiatan ----------
--  Tahun ajaran yang sudah lewat: semua bulan terdaftar & semua kegiatan yang ditagihkan.
--  p_kini = true → ikut tahun berjalan: bulan yang sudah jatuh tempo & kegiatan yang
--  tanggalnya sudah lewat (dipakai untuk siswa yang sudah keluar di tengah tahun).
create or replace function tunggakan_rinci(p_sk uuid, p_siswa uuid default null, p_kini boolean default false)
returns table (siswa_id uuid, ta text, jenis text, periode int, biaya_id uuid, nama text, target int, dibayar bigint)
language sql stable security definer set search_path = public as $$
  with c as (
    select tahun_ajaran_berjalan() as kini,
           (now() at time zone 'Asia/Jakarta')::date as hari,
           bulan_jatuh_tempo(p_sk) as bln
  ),
  st as (
    select st.siswa_id, st.tahun_ajaran as ta, st.mulai,
           case when st.tahun_ajaran = c.kini then least(coalesce(st.selesai, 11), c.bln - 1)
                else coalesce(st.selesai, 11) end as selesai,
           coalesce((t.spp_kelas ->> st.kelas)::int, t.spp_nominal, s.spp_nominal, 0) as tarif
      from siswa_tahun st
      cross join c
      join sekolah s on s.id = st.sekolah_id
      left join tahun_ajaran t on t.sekolah_id = st.sekolah_id and t.kode = st.tahun_ajaran
     where st.sekolah_id = p_sk
       and (p_siswa is null or st.siswa_id = p_siswa)
       and (st.tahun_ajaran < c.kini or (p_kini and st.tahun_ajaran = c.kini))
  ),
  bayar as (
    select p.siswa_id, p.tahun_ajaran as ta, p.periode as i, sum(p.nominal)::bigint as n
      from pembayaran p cross join c
     where p.sekolah_id = p_sk and p.jenis = 'spp'
       and (p_siswa is null or p.siswa_id = p_siswa)
       and (p.tahun_ajaran < c.kini or (p_kini and p.tahun_ajaran = c.kini))
     group by 1, 2, 3
  ),
  spp as (
    select st.siswa_id, st.ta, 'spp'::text as jenis, g.i as periode, null::uuid as biaya_id, null::text as nama,
           st.tarif as target, coalesce(b.n, 0)::bigint as dibayar
      from st
      cross join lateral generate_series(st.mulai, st.selesai) g(i)
      left join bayar b on b.siswa_id = st.siswa_id and b.ta = st.ta and b.i = g.i
     where st.tarif > 0 and coalesce(b.n, 0) < st.tarif
  ),
  keg as (
    select st.siswa_id, b.tahun_ajaran as ta, 'kegiatan'::text as jenis, null::int as periode, b.id as biaya_id, b.nama,
           b.nominal as target,
           coalesce((select sum(p.nominal) from pembayaran p
                      where p.siswa_id = st.siswa_id and p.jenis = 'kegiatan' and p.biaya_id = b.id), 0)::bigint as dibayar
      from biaya b
      cross join c
      join siswa_tahun st on st.sekolah_id = b.sekolah_id and st.tahun_ajaran = b.tahun_ajaran
     where b.sekolah_id = p_sk and b.aktif and b.nominal > 0
       and (p_siswa is null or st.siswa_id = p_siswa)
       and (b.tahun_ajaran < c.kini
            or (p_kini and b.tahun_ajaran = c.kini and b.tanggal is not null and b.tanggal < c.hari))
       and (b.tanggal is null
            or ((extract(month from b.tanggal)::int + 5) % 12) between st.mulai and coalesce(st.selesai, 11))
  )
  select * from spp
  union all
  select * from keg where keg.dibayar < keg.target
$$;

-- Siswa ini masih punya tunggakan (tahun lalu, atau tahun ini sampai bulan yang jatuh tempo)?
create or replace function siswa_ada_tunggakan(p_siswa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tunggakan_rinci((select sekolah_id from siswa where id = p_siswa), p_siswa, true))
$$;

-- ---------- data saat aplikasi dibuka ----------
-- Pembayaran yang perlu ada di HP: tahun ajaran berjalan (tanggal bayar sejak 1 Juli, SPP & kegiatan
-- tahun ini/depan, paket PMB/DU yang masih aktif) + pembayaran milik tagihan lama yang belum lunas.
-- Sisanya (tahun lama yang sudah beres) cukup dibaca saat dibuka: Laporan › Tahunan, Transaksi,
-- Kartu siswa › tahun lalu.
create or replace function pembayaran_dimuat() returns setof pembayaran
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := sekolah_saya();
  v_kini text := tahun_ajaran_berjalan();
  v_awal timestamptz := make_date(split_part(tahun_ajaran_berjalan(), '/', 1)::int, 7, 1)::timestamp at time zone 'Asia/Jakarta';
begin
  if v_sk is null then return; end if;
  -- digabung lewat UNION (hash join), bukan EXISTS per baris → tetap cepat walau datanya bertahun-tahun
  return query
    with r as materialized (select * from tunggakan_rinci(v_sk)),
    pilih as (
      select p.id from pembayaran p
       where p.sekolah_id = v_sk and (p.dibayar_pada >= v_awal or (p.jenis = 'spp' and p.tahun_ajaran >= v_kini))
      union
      select p.id from pembayaran p join biaya b on b.id = p.biaya_id
       where p.sekolah_id = v_sk and p.jenis = 'kegiatan' and b.tahun_ajaran >= v_kini
      union
      select p.id from pembayaran p join paket_biaya k on k.id = p.paket_id
       where p.sekolah_id = v_sk and p.jenis = 'paket' and k.aktif
      union
      select p.id from pembayaran p join r on r.jenis = 'spp' and r.siswa_id = p.siswa_id and r.ta = p.tahun_ajaran and r.periode = p.periode
       where p.sekolah_id = v_sk and p.jenis = 'spp'
      union
      select p.id from pembayaran p join r on r.jenis = 'kegiatan' and r.siswa_id = p.siswa_id and r.biaya_id = p.biaya_id
       where p.sekolah_id = v_sk and p.jenis = 'kegiatan'
    )
    select p.* from pembayaran p join pilih on pilih.id = p.id
     order by p.dibayar_pada desc, p.id;
end $$;

-- Bulan SPP & kegiatan tahun ajaran lalu yang BELUM lunas, siswa aktif.
-- Bentuk ringkas: spp = [[siswa, ta, bulan, dibayar]], kegiatan = [[siswa, biaya, dibayar]].
-- Yang tidak disebut dianggap sudah lunas.
create or replace function ringkasan_tunggakan_lalu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  return (
    with r as (
      select r.* from tunggakan_rinci(v_sk) r join siswa x on x.id = r.siswa_id and x.aktif
    )
    select jsonb_build_object(
      'spp', coalesce((select jsonb_agg(jsonb_build_array(siswa_id, ta, periode, dibayar)) from r where jenis = 'spp'), '[]'::jsonb),
      'kegiatan', coalesce((select jsonb_agg(jsonb_build_array(siswa_id, biaya_id, dibayar)) from r where jenis = 'kegiatan'), '[]'::jsonb)));
end $$;

-- ---------- siswa lulus / keluar yang masih menunggak (menu Tagihan) ----------
create or replace function tunggakan_nonaktif() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('pembayaran', 'lihat') then
    raise exception 'Akun ini tidak punya akses melihat pembayaran.' using errcode = '42501';
  end if;
  return coalesce((
    with r as (
      select r.* from tunggakan_rinci(v_sk, null, true) r
        join siswa x on x.id = r.siswa_id and x.status_siswa in ('alumni', 'keluar')
    ),
    per as (
      select r.siswa_id, sum(r.target - r.dibayar)::bigint as total,
             jsonb_agg(jsonb_build_object('jenis', r.jenis, 'ta', r.ta, 'i', r.periode, 'biayaId', r.biaya_id,
                                          'nama', r.nama, 'target', r.target, 'dibayar', r.dibayar)
                       order by r.ta, r.jenis desc, r.periode, r.nama) as item
        from r group by r.siswa_id
    )
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'nama', x.nama, 'panggilan', x.panggilan, 'nis', x.nis,
             'kelas', coalesce((select st.kelas from siswa_tahun st where st.siswa_id = x.id
                                 order by st.tahun_ajaran desc limit 1), x.kelas),
             'status', x.status_siswa, 'tahunLulus', x.tahun_lulus,
             'akhir', (select st.akhir from siswa_tahun st where st.siswa_id = x.id order by st.tahun_ajaran desc limit 1),
             'jenis', x.jenis_kelamin, 'avatar', x.avatar, 'foto', x.foto,
             'wali', x.wali, 'hp', x.hp, 'total', per.total, 'item', per.item)
           order by per.total desc, x.nama)
      from per join siswa x on x.id = per.siswa_id
  ), '[]'::jsonb);
end $$;

-- ---------- riwayat pembayaran orang tua per rentang tanggal (Transaksi) ----------
create or replace function pembayaran_daftar(p_dari date, p_sampai date, p_mulai int default 0, p_batas int default 300)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk uuid := sekolah_saya();
  t0 timestamptz; t1 timestamptz;
  v_batas int := least(greatest(coalesce(p_batas, 300), 1), 1000);
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('pembayaran', 'lihat') then
    raise exception 'Akun ini tidak punya akses melihat pembayaran.' using errcode = '42501';
  end if;
  if p_dari is null or p_sampai is null or p_dari > p_sampai then raise exception 'Rentang tanggal tidak valid.'; end if;
  if p_sampai - p_dari > 400 then raise exception 'Rentang maksimal satu tahun ajaran.'; end if;
  t0 := p_dari::timestamp at time zone 'Asia/Jakarta';
  t1 := (p_sampai + 1)::timestamp at time zone 'Asia/Jakarta';

  return (
    with p as (
      select * from pembayaran where sekolah_id = v_sk and dibayar_pada >= t0 and dibayar_pada < t1
    ),
    hal as (
      select p.* from p order by p.dibayar_pada desc, p.id offset greatest(coalesce(p_mulai, 0), 0) limit v_batas + 1
    )
    select jsonb_build_object(
      'ringkas', (select jsonb_build_object('jumlah', count(*), 'total', coalesce(sum(nominal), 0),
                                            'tunai', count(*) filter (where metode = 'Tunai'),
                                            'transfer', count(*) filter (where metode = 'Transfer'),
                                            'tabungan', count(*) filter (where metode = 'Tabungan')) from p),
      'lanjut', (select count(*) > v_batas from hal),
      'item', coalesce((
        select jsonb_agg(to_jsonb(h) || jsonb_build_object('siswa', jsonb_build_object(
                 'id', x.id, 'nama', x.nama, 'kelas', x.kelas, 'jenis_kelamin', x.jenis_kelamin,
                 'avatar', x.avatar, 'foto', x.foto, 'status_siswa', x.status_siswa, 'nis', x.nis))
               order by h.dibayar_pada desc, h.id)
          from (select * from hal order by dibayar_pada desc, id limit v_batas) h
          left join siswa x on x.id = h.siswa_id), '[]'::jsonb)));
end $$;

-- ---------- Tanya SAKU: tunggakan tahun ajaran lalu (termasuk yang sudah lulus / keluar) ----------
create or replace function ai_tunggakan_lalu(p_kelas text default null, p_ta text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := ai_sekolah_wajib();
  v_kini text := tahun_ajaran_berjalan();
  v_ta   text := nullif(trim(coalesce(p_ta, '')), '');
  v_kls  text := nullif(trim(coalesce(p_kelas, '')), '');
begin
  if v_ta is not null and (not ta_valid(v_ta) or v_ta >= v_kini) then
    return jsonb_build_object('galat', 'Tahun ajaran "' || v_ta || '" bukan tahun ajaran yang sudah lewat. Tahun berjalan ' || v_kini
                                       || ' — untuk tahun berjalan pakai daftar_tunggakan.');
  end if;
  return (
    with r as (
      select r.*, st.kelas, ai_nama_bulan(r.periode) as bln
        from tunggakan_rinci(v_sk) r
        join siswa_tahun st on st.siswa_id = r.siswa_id and st.tahun_ajaran = r.ta
       where (v_ta is null or r.ta = v_ta)
         and (v_kls is null or lower(st.kelas) = lower(v_kls))
    ),
    per as (
      select r.siswa_id, sum(r.target - r.dibayar)::bigint as kurang,
             jsonb_agg(jsonb_build_object(
               'tahun_ajaran', r.ta, 'kelas_saat_itu', r.kelas,
               'tagihan', case when r.jenis = 'spp' then 'SPP ' || ta_nama_bulan(r.ta, r.periode) else 'Kegiatan ' || r.nama end,
               'dibayar', r.dibayar, 'kurang', r.target - r.dibayar)
               order by r.ta, r.jenis desc, r.periode, r.nama) as rincian
        from r group by r.siswa_id
    )
    select jsonb_build_object(
      'keterangan', 'Tunggakan dari tahun ajaran yang SUDAH LEWAT (sebelum ' || v_kini || '), termasuk siswa yang sudah lulus / keluar. '
                    || 'Tahun berjalan tidak termasuk — pakai daftar_tunggakan.',
      'tahun_ajaran', coalesce(v_ta, 'semua tahun ajaran lalu'),
      'kelas', coalesce(v_kls, 'semua kelas'),
      'jumlah_siswa', (select count(*) from per),
      'total_kurang_rupiah', (select coalesce(sum(kurang), 0) from per),
      'total_kurang_spp_rupiah', (select coalesce(sum(target - dibayar), 0) from r where jenis = 'spp'),
      'total_kurang_kegiatan_rupiah', (select coalesce(sum(target - dibayar), 0) from r where jenis = 'kegiatan'),
      'per_tahun_ajaran', coalesce((select jsonb_agg(jsonb_build_object('tahun_ajaran', ta, 'jumlah_siswa', n, 'kurang', k) order by ta desc)
                                      from (select ta, count(distinct siswa_id) n, sum(target - dibayar) k from r group by ta) q), '[]'::jsonb),
      'siswa', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'nama', x.nama,
                 'status', case x.status_siswa when 'alumni' then 'sudah lulus' || coalesce(' (' || x.tahun_lulus || ')', '')
                                               when 'keluar' then 'sudah keluar / pindah' else 'masih aktif, kelas ' || x.kelas end,
                 'wali', nullif(x.wali, ''),
                 'kurang_total', per.kurang,
                 'rincian', per.rincian)) order by per.kurang desc, x.nama)
          from per join siswa x on x.id = per.siswa_id), '[]'::jsonb)));
end $$;

-- ---------- Tanya SAKU: rekap satu tahun ajaran (dari Laporan › Tahunan) ----------
create or replace function ai_rekap_tahun(p_ta text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := ai_sekolah_wajib();
  v_ta   text := coalesce(nullif(trim(coalesce(p_ta, '')), ''), tahun_ajaran_berjalan());
  v_daftar jsonb;
  l jsonb;
begin
  v_daftar := (select jsonb_agg(jsonb_build_object('tahun_ajaran', d ->> 'kode', 'jumlah_siswa', (d ->> 'siswa')::int,
                                                    'target_spp', (d ->> 'sppTarget')::bigint, 'spp_masuk', (d ->> 'sppMasuk')::bigint))
                 from jsonb_array_elements(daftar_tahun_ajaran()) d);
  if not ta_valid(v_ta) or v_ta > tahun_ajaran_berjalan() then
    return jsonb_build_object('galat', 'Tahun ajaran "' || v_ta || '" tidak dikenal. Tulis seperti 2025/2026.', 'tahun_ajaran_tersedia', v_daftar);
  end if;
  l := laporan_tahunan(v_ta);
  return jsonb_strip_nulls(jsonb_build_object(
    'tahun_ajaran', v_ta,
    'status', case when (l ->> 'berjalan')::boolean then 'tahun ajaran berjalan (angka s.d. hari ini)' else 'sudah selesai' end,
    'periode', (l ->> 'mulai') || ' s.d. ' || (l ->> 'selesai'),
    'tarif_spp', jsonb_build_object('standar', l -> 'tarif' -> 'standar', 'per_kelas_khusus', l -> 'tarif' -> 'kelas'),
    'siswa', jsonb_build_object(
      'jumlah', l -> 'siswa' -> 'jumlah',
      'masuk_tengah_tahun', l -> 'siswa' -> 'masukTengah',
      'keluar_atau_pindah', l -> 'siswa' -> 'keluar',
      'akhir_tahun', l -> 'siswa' -> 'akhir',
      'per_kelas', l -> 'siswa' -> 'perKelas'),
    'spp', jsonb_build_object(
      'target_setahun', l -> 'spp' -> 'target',
      'terkumpul', l -> 'spp' -> 'masuk',
      'bulan_sudah_jatuh_tempo', l -> 'spp' -> 'jatuhTempo',
      'tunggakan_rupiah', l -> 'spp' -> 'tunggakan',
      'per_bulan', (select jsonb_agg(jsonb_build_object('bulan', ta_nama_bulan(v_ta, (b ->> 'i')::int), 'siswa_ditagih', b -> 'ditagih',
                                                        'target', b -> 'target', 'masuk', b -> 'masuk', 'lunas', b -> 'lunas', 'sebagian', b -> 'sebagian'))
                      from jsonb_array_elements(l -> 'spp' -> 'perBulan') b),
      'per_kelas', l -> 'spp' -> 'perKelas'),
    'kegiatan', (select jsonb_agg(jsonb_build_object('nama', k ->> 'nama', 'nominal', k -> 'nominal', 'siswa_ditagih', k -> 'siswa',
                                                     'lunas', k -> 'lunas', 'target', k -> 'target', 'terkumpul', k -> 'masuk',
                                                     'terpakai_dari_kas', k -> 'terpakai'))
                   from jsonb_array_elements(l -> 'kegiatan') k),
    'pmb_dan_daftar_ulang', l -> 'paket',
    'masih_menunggak', jsonb_build_object(
      'jumlah_siswa', l -> 'tunggakan' -> 'siswa',
      'spp', l -> 'tunggakan' -> 'spp',
      'kegiatan', l -> 'tunggakan' -> 'kegiatan',
      'daftar', (select jsonb_agg(jsonb_build_object('nama', t ->> 'nama', 'kelas_saat_itu', t ->> 'kelas',
                                                     'status', case t ->> 'status' when 'alumni' then 'sudah lulus' when 'keluar' then 'sudah keluar' else 'aktif' end,
                                                     'kurang_spp', t -> 'spp', 'kurang_kegiatan', t -> 'kegiatan'))
                   from (select t from jsonb_array_elements(l -> 'tunggakan' -> 'daftar') t limit 40) q)),
    'buku_kas', case when l -> 'kas' is null or jsonb_typeof(l -> 'kas') = 'null' then null
                     else jsonb_build_object('saldo_awal', l -> 'kas' -> 'saldoAwal', 'pemasukan', l -> 'kas' -> 'masuk',
                                             'pengeluaran', l -> 'kas' -> 'keluar', 'saldo_akhir', l -> 'kas' -> 'saldoAkhir',
                                             'mulai_dicatat', l -> 'kas' -> 'mulaiDicatat',
                                             'pemasukan_per_kategori', l -> 'kas' -> 'masukPerKategori',
                                             'pengeluaran_per_kategori', l -> 'kas' -> 'keluarPerKategori') end,
    'tahun_ajaran_tersedia', v_daftar));
end $$;

-- =====================================================================
-- Fungsi lama yang disesuaikan (definisi 0042 + perubahan 0044)
-- =====================================================================


-- portal orang tua: anak lulus / keluar yang masih menunggak ikut tampil
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
      where ws.wali_id = w.id and (x.aktif or (x.status_siswa in ('alumni', 'keluar') and siswa_ada_tunggakan(x.id)))
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


-- gerbang NIS: NIS anak lulus / keluar yang masih menunggak juga diterima
CREATE OR REPLACE FUNCTION public.portal_cek_nis(p_token text, p_nis text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     where ws.wali_id = w.id and (x.aktif or (x.status_siswa in ('alumni', 'keluar') and siswa_ada_tunggakan(x.id))) and nis_rapi(x.nis) = nis_rapi(p_nis)
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
end $function$;


-- Tanya SAKU › status siswa: termasuk yang sudah lulus / keluar + tunggakan tahun lalu
CREATE OR REPLACE FUNCTION public.ai_status_siswa(p_nama text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sk   uuid := ai_sekolah_wajib();
  v_hari date := ai_hari_ini();
  v_kata text[];
  v_ids  uuid[];
  v_n    int;
begin
  v_kata := array(select w from unnest(string_to_array(lower(trim(coalesce(p_nama, ''))), ' ')) w where w <> '');
  if cardinality(v_kata) = 0 then
    raise exception 'Nama siswa belum diisi.';
  end if;

  v_ids := array(
    select x.id from siswa x
     where x.sekolah_id = v_sk and (x.aktif or x.status_siswa in ('alumni', 'keluar'))
       and not exists (select 1 from unnest(v_kata) w
                        where lower(x.nama || ' ' || coalesce(x.panggilan, '')) not like '%' || w || '%'));
  v_n := cardinality(v_ids);

  return jsonb_build_object(
    'ditemukan', v_n,
    'catatan', case when v_n = 0 then 'Tidak ada siswa dengan nama itu.'
                    when v_n > 5 then 'Terlalu banyak yang cocok, hanya 5 pertama ditampilkan — minta nama lebih lengkap.' end,
    'siswa', coalesce((
      select jsonb_agg(d.o order by d.nama) from (
        select x.nama, jsonb_build_object(
          'nama', x.nama, 'panggilan', x.panggilan, 'kelas', x.kelas,
          'status', case x.status_siswa when 'alumni' then 'sudah lulus' || coalesce(' (' || x.tahun_lulus || ')', '')
                                        when 'keluar' then 'sudah keluar / pindah' else 'aktif' end,
          'wali', nullif(x.wali, ''), 'guru', nullif(x.guru, ''),
          'spp_per_bulan', (select jsonb_agg(jsonb_build_object(
                               'bulan', ai_nama_bulan(t.periode), 'status', t.status, 'dibayar', t.dibayar)
                             order by t.periode)
                              from ai_spp_siswa(v_sk, v_hari) t where t.siswa_id = x.id),
          'kegiatan', (select jsonb_agg(jsonb_build_object(
                          'kegiatan', k.nama, 'nominal', k.nominal, 'dibayar', k.dibayar,
                          'status', case when k.dibayar >= k.nominal then 'lunas'
                                         when k.dibayar > 0 then 'sebagian' else 'belum' end)
                        order by k.urutan)
                         from ai_kegiatan_siswa(v_sk) k where k.siswa_id = x.id),
          'ringkasan', (select jsonb_build_object(
                          'jumlah_bulan_nunggak', r.bulan_nunggak,
                          'perlu_dibayar_sekarang_spp', r.kurang_lalu + r.kurang_berjalan,
                          'total_spp_sudah_dibayar', r.sudah_bayar_spp)
                          from ai_ringkas_siswa(v_sk, v_hari) r where r.siswa_id = x.id),
          'tunggakan_tahun_ajaran_lalu', (select jsonb_build_object(
                          'total_kurang', coalesce(sum(r.target - r.dibayar), 0),
                          'rincian', jsonb_agg(jsonb_build_object(
                             'tahun_ajaran', r.ta,
                             'tagihan', case when r.jenis = 'spp' then 'SPP ' || ta_nama_bulan(r.ta, r.periode) else 'Kegiatan ' || r.nama end,
                             'dibayar', r.dibayar, 'kurang', r.target - r.dibayar) order by r.ta, r.jenis desc, r.periode))
                          from tunggakan_rinci(v_sk, x.id) r),
          'transaksi_terakhir', (select jsonb_agg(jsonb_build_object(
                                    'tanggal', to_char(p.dibayar_pada at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                                    'keterangan', p.keterangan, 'nominal', p.nominal, 'metode', p.metode)
                                  order by p.dibayar_pada desc)
                                   from (select * from pembayaran q where q.siswa_id = x.id
                                          order by q.dibayar_pada desc limit 5) p)
        ) as o
          from siswa x where x.id = any (v_ids)
         order by x.aktif desc, x.nama
         limit 5
      ) d), '[]')
  );
end $function$;


-- Tanya SAKU › konteks: ringkasan tunggakan tahun lalu
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
    'tunggakan_tahun_ajaran_lalu', (select jsonb_build_object(
                                      'jumlah_siswa', count(distinct r.siswa_id),
                                      'sudah_lulus_atau_keluar', count(distinct r.siswa_id) filter (where not x.aktif),
                                      'total_rupiah', coalesce(sum(r.target - r.dibayar), 0))
                                      from tunggakan_rinci(v_sk) r join siswa x on x.id = r.siswa_id),
    'tahun_ajaran_tercatat', coalesce((select jsonb_agg(distinct st.tahun_ajaran) from siswa_tahun st where st.sekolah_id = v_sk), '[]'),
    'kas', v_kas,
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas),
    'kunci_pemakaian', v_kunci
  );
end $function$;

-- =====================================================================
-- Hak akses fungsi
-- =====================================================================
-- fungsi bantu: hanya dipanggil dari fungsi lain (bukan dari aplikasi)
revoke all on function bulan_jatuh_tempo(uuid) from public, anon, authenticated;
revoke all on function tunggakan_rinci(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function siswa_ada_tunggakan(uuid) from public, anon, authenticated;

-- dipanggil aplikasi (staf sekolah yang login)
revoke all on function pembayaran_dimuat() from public, anon;
revoke all on function ringkasan_tunggakan_lalu() from public, anon;
revoke all on function tunggakan_nonaktif() from public, anon;
revoke all on function pembayaran_daftar(date, date, int, int) from public, anon;
revoke all on function ai_tunggakan_lalu(text, text) from public, anon;
revoke all on function ai_rekap_tahun(text) from public, anon;
grant execute on function pembayaran_dimuat(), ringkasan_tunggakan_lalu(), tunggakan_nonaktif(),
  pembayaran_daftar(date, date, int, int), ai_tunggakan_lalu(text, text), ai_rekap_tahun(text) to authenticated;

-- portal orang tua tetap lewat portal_wali / portal_cek_nis (hak aksesnya tidak berubah)
