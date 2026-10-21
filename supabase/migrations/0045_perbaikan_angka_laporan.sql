-- =====================================================================
-- 0045 — Perbaikan angka laporan (v32)
--
--  1. "Tunggakan" di semua laporan memakai satu aturan yang sama dengan menu
--     Tagihan & Siswa: SPP bulan-bulan yang SUDAH LEWAT (bulan berjalan belum
--     dihitung tunggakan walau sudah lewat tanggal jatuh tempo — statusnya
--     "belum bayar"), kegiatan yang tanggalnya sudah lewat, dan tahun lalu.
--     → Laporan › Tahunan (tahun berjalan) & Tagihan › Sudah lulus / keluar.
--  2. Siswa yang keluar / pindah di tengah tahun tetap dihitung di laporan
--     bulan-bulan sebelum ia keluar (Tanya SAKU: status SPP, rekap bulan,
--     daftar tunggakan, status kegiatan) — sama dengan Laporan › Tahunan.
--     Namanya diberi tanda "(sudah keluar)".
--  3. Tanya SAKU › status SPP: nominal per kelas (tidak lagi tarif tertinggi),
--     angka dibayar siswa yang lunas ikut dikirim (unduhan Excel jadi tepat).
--  Butuh 0044. Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================


-- 1. Laporan › Tahunan: tunggakan tahun berjalan = bulan yang sudah lewat
CREATE OR REPLACE FUNCTION public.laporan_tahunan(p_ta text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sk   uuid := laporan_sekolah_baca();
  v_kini text := tahun_ajaran_berjalan();
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_y    int;
  d0     date; d1 date; d1x date;
  v_bln  int;     -- bulan yang sudah jatuh tempo: SPP bulan < v_bln dihitung tunggakan
  v_kas  boolean := boleh('lap_keuangan', 'lihat') or boleh('kas', 'lihat');
  v_tarif jsonb;
  v_hasil jsonb;
begin
  if not ta_valid(coalesce(p_ta, '')) or p_ta > v_kini then raise exception 'Tahun ajaran tidak valid.'; end if;
  v_y := split_part(p_ta, '/', 1)::int;
  d0 := make_date(v_y, 7, 1);
  d1 := make_date(v_y + 1, 6, 30);
  d1x := least(d1, v_hari);
  v_bln := case when p_ta < v_kini then 12
                -- tahun berjalan: bulan-bulan yang sudah lewat (sama dengan menu Tagihan: bulan ini = "belum bayar")
                else ai_indeks_bulan(v_hari) end;
  select jsonb_build_object('standar', coalesce(t.spp_nominal, s.spp_nominal, 0), 'kelas', coalesce(t.spp_kelas, '{}'::jsonb))
    into v_tarif
    from sekolah s left join tahun_ajaran t on t.sekolah_id = s.id and t.kode = p_ta where s.id = v_sk;

  with
  st as (
    select st.siswa_id, st.kelas, st.mulai, coalesce(st.selesai, 11) as selesai, st.akhir, x.nama, x.status_siswa,
           coalesce((v_tarif -> 'kelas' ->> st.kelas)::int, (v_tarif ->> 'standar')::int, 0) as tarif
      from siswa_tahun st join siswa x on x.id = st.siswa_id
     where st.sekolah_id = v_sk and st.tahun_ajaran = p_ta
  ),
  bulan as (
    select st.siswa_id, st.kelas, g.i, st.tarif
      from st cross join generate_series(0, 11) g(i)
     where g.i between st.mulai and st.selesai
  ),
  bayar_spp as (
    select siswa_id, periode as i, sum(nominal)::bigint as n
      from pembayaran where sekolah_id = v_sk and jenis = 'spp' and tahun_ajaran = p_ta
     group by 1, 2
  ),
  sb as (
    select b.*, coalesce(y.n, 0) as dibayar from bulan b left join bayar_spp y on y.siswa_id = b.siswa_id and y.i = b.i
  ),
  keg as (
    select b.id, b.nama, b.nominal, b.tanggal, b.emoji, b.urutan,
           ((extract(month from b.tanggal)::int + 5) % 12) as bln,
           -- jatuh tempo kegiatan = tanggal kegiatannya (sama dengan menu Tagihan); tahun lalu = semua sudah jatuh tempo
           (p_ta < v_kini or (b.tanggal is not null and b.tanggal < v_hari)) as lewat
      from biaya b where b.sekolah_id = v_sk and b.tahun_ajaran = p_ta and b.aktif
  ),
  keg_siswa as (
    select k.id as biaya_id, st.siswa_id, k.nominal, k.lewat,
           coalesce((select sum(p.nominal) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'kegiatan' and p.biaya_id = k.id), 0)::bigint as dibayar
      from keg k join st on k.tanggal is null or k.bln between st.mulai and st.selesai
  ),
  pk as (
    select k.id, k.jenis, k.nama, k.total,
           (select count(*) from paket_siswa ps where ps.paket_id = k.id) as siswa,
           coalesce((select sum(p.nominal) from pembayaran p where p.paket_id = k.id and p.jenis = 'paket'), 0)::bigint as masuk
      from paket_biaya k where k.sekolah_id = v_sk and k.tahun_ajaran = p_ta and k.aktif
  ),
  tunggak as (
    select st.siswa_id, st.nama, st.kelas, st.status_siswa, st.akhir,
           coalesce((select sum(greatest(0, sb.tarif - sb.dibayar)) from sb where sb.siswa_id = st.siswa_id and sb.i < v_bln), 0)::bigint as spp,
           coalesce((select sum(greatest(0, ks.nominal - ks.dibayar)) from keg_siswa ks where ks.siswa_id = st.siswa_id and ks.lewat), 0)::bigint as kegiatan
      from st
  )
  select jsonb_build_object(
    'ta', p_ta,
    'berjalan', p_ta = v_kini,
    'mulai', d0, 'selesai', d1, 'sampai', d1x,
    'tarif', v_tarif,
    'siswa', jsonb_build_object(
      'jumlah', (select count(*) from st),
      'masukTengah', (select count(*) from st where mulai > 0),
      'keluar', (select count(*) from st where akhir in ('keluar', 'pindah')),
      'akhir', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb) from (select coalesce(akhir, 'belum') a, count(*) n from st group by 1) q),
      'perKelas', coalesce((select jsonb_agg(jsonb_build_object('kelas', kelas, 'jumlah', n) order by kelas)
                              from (select kelas, count(*) n from st group by kelas) q), '[]'::jsonb)),
    'spp', jsonb_build_object(
      'target', (select coalesce(sum(tarif), 0) from sb),
      'masuk', (select coalesce(sum(dibayar), 0) from sb),
      'jatuhTempo', least(v_bln, 12),
      'tunggakan', (select coalesce(sum(greatest(0, tarif - dibayar)), 0) from sb where i < v_bln),
      'perBulan', coalesce((select jsonb_agg(jsonb_build_object(
                     'i', g.i, 'ditagih', coalesce(q.n, 0), 'target', coalesce(q.target, 0), 'masuk', coalesce(q.masuk, 0),
                     'lunas', coalesce(q.lunas, 0), 'sebagian', coalesce(q.sebagian, 0)) order by g.i)
                   from generate_series(0, 11) g(i)
                   left join (select i, count(*) n, sum(tarif) target, sum(dibayar) masuk,
                                     count(*) filter (where dibayar >= tarif) lunas,
                                     count(*) filter (where dibayar > 0 and dibayar < tarif) sebagian
                                from sb group by i) q on q.i = g.i), '[]'::jsonb),
      'perKelas', coalesce((select jsonb_agg(jsonb_build_object('kelas', kelas, 'siswa', siswa, 'tarif', tarif, 'target', target, 'masuk', masuk,
                                                                'tunggakan', kurang) order by kelas)
                   from (select st.kelas, count(distinct st.siswa_id) siswa, max(st.tarif) tarif,
                                (select coalesce(sum(sb.tarif), 0) from sb where sb.kelas = st.kelas) target,
                                (select coalesce(sum(sb.dibayar), 0) from sb where sb.kelas = st.kelas) masuk,
                                (select coalesce(sum(greatest(0, sb.tarif - sb.dibayar)), 0) from sb where sb.kelas = st.kelas and sb.i < v_bln) kurang
                           from st group by st.kelas) q), '[]'::jsonb)),
    'kegiatan', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', k.id, 'nama', k.nama, 'emoji', k.emoji, 'nominal', k.nominal, 'tanggal', k.tanggal,
                   'siswa', (select count(*) from keg_siswa ks where ks.biaya_id = k.id),
                   'lunas', (select count(*) from keg_siswa ks where ks.biaya_id = k.id and ks.dibayar >= ks.nominal),
                   'target', (select coalesce(sum(ks.nominal), 0) from keg_siswa ks where ks.biaya_id = k.id),
                   'masuk', coalesce((select sum(p.nominal) from pembayaran p where p.biaya_id = k.id and p.jenis = 'kegiatan'), 0),
                   'terpakai', case when v_kas then coalesce((select sum(c.nominal) from kas c where c.biaya_id = k.id and c.jenis = 'keluar' and c.dibatalkan_pada is null), 0) end)
                   order by k.urutan, k.nama) from keg k), '[]'::jsonb),
    'paket', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'jenis', jenis, 'nama', nama, 'total', total, 'siswa', siswa,
                                                           'target', total * siswa, 'masuk', masuk) order by jenis desc) from pk), '[]'::jsonb),
    'tunggakan', jsonb_build_object(
      'spp', (select coalesce(sum(spp), 0) from tunggak),
      'kegiatan', (select coalesce(sum(kegiatan), 0) from tunggak),
      'siswa', (select count(*) from tunggak where spp + kegiatan > 0),
      'daftar', coalesce((select jsonb_agg(jsonb_build_object('id', siswa_id, 'nama', nama, 'kelas', kelas, 'status', status_siswa, 'akhir', akhir,
                                                             'spp', spp, 'kegiatan', kegiatan) order by spp + kegiatan desc, nama)
                            from (select * from tunggak where spp + kegiatan > 0 order by spp + kegiatan desc, nama limit 100) q), '[]'::jsonb)),
    'kas', case when v_kas then (
      with g as (select * from kas_gerakan(v_sk, d0, d1x))
      select jsonb_build_object(
        'saldoAwal', kas_saldo_per(v_sk, d0 - 1),
        'masuk', coalesce((select sum(nominal) from g where jenis = 'masuk'), 0),
        'keluar', coalesce((select sum(nominal) from g where jenis = 'keluar'), 0),
        'saldoAkhir', kas_saldo_per(v_sk, d1x),
        'mulaiDicatat', (select mulai from kas_pengaturan where sekolah_id = v_sk),
        'perBulan', coalesce((select jsonb_agg(jsonb_build_object('bulan', to_char(m, 'YYYY-MM'),
                         'masuk', coalesce((select sum(nominal) from g where jenis = 'masuk' and date_trunc('month', g.tanggal) = m), 0),
                         'keluar', coalesce((select sum(nominal) from g where jenis = 'keluar' and date_trunc('month', g.tanggal) = m), 0)) order by m)
                       from generate_series(d0::timestamp, d1::timestamp, interval '1 month') m), '[]'::jsonb),
        'masukPerKategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                       from (select kategori, sum(nominal)::bigint n from g where jenis = 'masuk' group by kategori) q), '[]'::jsonb),
        'keluarPerKategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                       from (select kategori, sum(nominal)::bigint n from g where jenis = 'keluar' group by kategori) q), '[]'::jsonb))
    ) end
  ) into v_hasil;
  return v_hasil;
end $function$;


-- 1. tunggakan siswa lulus / keluar tahun ini: bulan yang sudah lewat
CREATE OR REPLACE FUNCTION public.tunggakan_rinci(p_sk uuid, p_siswa uuid DEFAULT NULL::uuid, p_kini boolean DEFAULT false)
 RETURNS TABLE(siswa_id uuid, ta text, jenis text, periode integer, biaya_id uuid, nama text, target integer, dibayar bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (
    select tahun_ajaran_berjalan() as kini,
           (now() at time zone 'Asia/Jakarta')::date as hari,
           ai_indeks_bulan((now() at time zone 'Asia/Jakarta')::date) as bln
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
$function$;


-- 2. SAKU: SPP tahun ini termasuk siswa yang keluar di tengah tahun (bulan-bulan sebelum keluar)
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
   where x.sekolah_id = p_sekolah and (x.aktif or x.status_siswa = 'keluar')
     and g.i between st.mulai and coalesce(st.selesai, 11)
$function$;


-- 2. SAKU: kegiatan tahun ini termasuk siswa yang keluar di tengah tahun
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
   where x.sekolah_id = p_sekolah and (x.aktif or x.status_siswa = 'keluar')
$function$;


-- 2 & 3. SAKU status SPP satu bulan
CREATE OR REPLACE FUNCTION public.ai_status_spp(p_bulan integer DEFAULT NULL::integer, p_kelas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sk    uuid := ai_sekolah_wajib();
  v_hari  date := ai_hari_ini();
  v_bulan int  := coalesce(p_bulan, ai_indeks_bulan(ai_hari_ini()));
  v_kelas text[];
begin
  if v_bulan < 0 or v_bulan > 11 then
    raise exception 'Bulan tidak dikenal. Pakai 0 = Juli sampai 11 = Juni.';
  end if;
  if nullif(trim(p_kelas), '') is not null then
    select array_agg(kelas) into v_kelas from ai_kelas_cocok(v_sk, p_kelas);
    if v_kelas is null then
      return jsonb_build_object('galat', 'Kelas "' || p_kelas || '" tidak ditemukan.',
        'kelas_yang_ada', (select jsonb_agg(distinct kelas) from siswa where sekolah_id = v_sk and aktif));
    end if;
  end if;

  return (
    with t as (
      select x.nama || case when x.aktif then '' else ' (sudah keluar)' end as nama, x.kelas, sp.dibayar, sp.target, sp.status
        from ai_spp_siswa(v_sk, v_hari) sp
        join siswa x on x.id = sp.siswa_id
       where sp.periode = v_bulan and (v_kelas is null or x.kelas = any (v_kelas))
    ),
    grup as (
      select g.kunci, g.status from (values ('lunas', 'lunas'), ('sebagian', 'sebagian'), ('nunggak', 'nunggak'),
                                            ('belum_bayar_lewat_jatuh_tempo', 'belum-bayar'),
                                            ('belum_jatuh_tempo', 'menunggu')) as g(kunci, status)
    )
    select jsonb_build_object(
      'catatan_untuk_ai',
        'Daftar di sini SUDAH dikelompokkan oleh sistem. Salin nama apa adanya dari kelompok yang ditanyakan; ' ||
        'jumlah baris yang kamu tampilkan HARUS sama dengan angka "jumlah".',
      'bulan', ai_nama_bulan(v_bulan),
      'kelas', coalesce(to_jsonb(v_kelas), '"semua kelas"'),
      'nominal_spp', case when (select min(target) from t) = (select max(target) from t) then (select max(target) from t) end,
      'nominal_spp_per_kelas', (select jsonb_object_agg(kelas, tarif) from (select kelas, max(target) tarif from t group by kelas) q),
      'jumlah_siswa', (select count(*) from t),
      'target', (select coalesce(sum(target), 0) from t),
      'terkumpul', (select coalesce(sum(least(dibayar, target)), 0) from t),
      'kekurangan', (select coalesce(sum(greatest(0, target - dibayar)), 0) from t),
      'kelompok', (select jsonb_object_agg(g.kunci, jsonb_build_object(
          'jumlah', (select count(*) from t where t.status = g.status),
          'siswa', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                'nama', t.nama, 'kelas', t.kelas,
                                'dibayar', case when t.status in ('sebagian', 'lunas') then t.dibayar end,
                                'kurang', case when t.status <> 'lunas' then t.target - t.dibayar end))
                              order by t.kelas, t.nama)
                               from t where t.status = g.status), '[]')))
        from grup g)
    )
  );
end $function$;


-- 2. SAKU daftar tunggakan tahun ini
CREATE OR REPLACE FUNCTION public.ai_daftar_tunggakan(p_kelas text DEFAULT NULL::text, p_bulan integer DEFAULT NULL::integer, p_min_bulan integer DEFAULT 0, p_termasuk_kegiatan boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sk   uuid := ai_sekolah_wajib();
  v_hari date := ai_hari_ini();
  v_kini int  := ai_indeks_bulan(v_hari);
  v_kelas text[];
  v_hasil jsonb;
begin
  if p_bulan is not null and (p_bulan < 0 or p_bulan > 11) then
    raise exception 'Bulan tidak dikenal. Pakai 0 = Juli sampai 11 = Juni.';
  end if;
  if nullif(trim(p_kelas), '') is not null then
    select array_agg(kelas) into v_kelas from ai_kelas_cocok(v_sk, p_kelas);
    if v_kelas is null then
      return jsonb_build_object('galat', 'Kelas "' || p_kelas || '" tidak ditemukan.',
        'kelas_yang_ada', (select jsonb_agg(distinct kelas) from siswa where sekolah_id = v_sk and aktif));
    end if;
  end if;

  with sp as (select * from ai_spp_siswa(v_sk, v_hari)),
  rk as (select * from ai_ringkas_siswa(v_sk, v_hari)),
  kg as (
    select k.siswa_id,
           jsonb_agg(jsonb_build_object('kegiatan', k.nama, 'dibayar', k.dibayar, 'kurang', k.nominal - k.dibayar)
                     order by k.urutan) as daftar,
           sum(k.nominal - k.dibayar)::bigint as kurang
      from ai_kegiatan_siswa(v_sk) k
     where k.dibayar < k.nominal
     group by k.siswa_id
  ),
  baris as (
    select x.id, x.nama || case when x.aktif then '' else ' (sudah keluar)' end as nama, x.kelas, x.wali, rk.bulan_nunggak, rk.kurang_lalu, rk.kurang_berjalan,
           rk.perlu_ditagih, bl.status as status_bulan, bl.dibayar as dibayar_bulan,
           greatest(0, bl.target - bl.dibayar) as kurang_bulan,
           kg.daftar as kegiatan, coalesce(kg.kurang, 0) as kurang_kegiatan,
           (select jsonb_agg(jsonb_build_object('bulan', ai_nama_bulan(t.periode), 'dibayar', t.dibayar,
                                                'kurang', t.target - t.dibayar) order by t.periode)
              from sp t where t.siswa_id = x.id and t.periode < v_kini and t.dibayar < t.target) as bulan_nunggak_rinci
      from siswa x
      join rk on rk.siswa_id = x.id
      left join sp bl on bl.siswa_id = x.id and bl.periode = p_bulan
      left join kg on kg.siswa_id = x.id
     where x.sekolah_id = v_sk and (x.aktif or x.status_siswa = 'keluar')
       and (v_kelas is null or x.kelas = any (v_kelas))
       and case
             when p_bulan is not null then bl.status <> 'lunas'
             else (rk.perlu_ditagih and rk.bulan_nunggak >= coalesce(p_min_bulan, 0))
                  or (p_termasuk_kegiatan and coalesce(p_min_bulan, 0) = 0 and kg.kurang > 0)
           end
  )
  select jsonb_build_object(
    'mode', case when p_bulan is not null then 'SPP bulan ' || ai_nama_bulan(p_bulan) || ' yang belum lunas'
                 else 'siswa yang perlu ditagih sekarang' end,
    'kelas', coalesce(to_jsonb(v_kelas), '"semua kelas"'),
    'jumlah_siswa', (select count(*) from baris),
    'total_kurang_spp_rupiah', (select coalesce(sum(case when p_bulan is not null then kurang_bulan
                                                          else kurang_lalu + kurang_berjalan end), 0) from baris),
    'total_kurang_kegiatan_rupiah', case when p_termasuk_kegiatan
                                         then (select coalesce(sum(kurang_kegiatan), 0) from baris) end,
    'ditampilkan', least(1000, (select count(*) from baris)),
    'siswa', coalesce((
      select jsonb_agg(r.o order by r.urut1 desc, r.urut2 desc, r.nama)
        from (
          select b.nama, b.bulan_nunggak as urut1, (b.kurang_lalu + b.kurang_berjalan) as urut2,
                 jsonb_strip_nulls(jsonb_build_object(
                   'nama', b.nama, 'kelas', b.kelas, 'wali', nullif(b.wali, ''),
                   'status_bulan_diminta', case when p_bulan is not null then b.status_bulan end,
                   'dibayar_bulan_diminta', case when p_bulan is not null then b.dibayar_bulan end,
                   'kurang_bulan_diminta', case when p_bulan is not null then b.kurang_bulan end,
                   'jumlah_bulan_nunggak', b.bulan_nunggak,
                   'bulan_nunggak', b.bulan_nunggak_rinci,
                   'bulan_berjalan_lewat_jatuh_tempo_belum_lunas', b.kurang_berjalan > 0,
                   'perlu_dibayar_sekarang_spp', b.kurang_lalu + b.kurang_berjalan,
                   'kegiatan_belum_lunas', case when p_termasuk_kegiatan then b.kegiatan end
                 )) as o
            from baris b
           order by b.bulan_nunggak desc, (b.kurang_lalu + b.kurang_berjalan) desc, b.nama
           limit 1000
        ) r), '[]')
  ) into v_hasil;

  return v_hasil;
end $function$;


-- 2. SAKU status kegiatan tahun ini
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
    select x.id, x.nama || case when x.aktif then '' else ' (sudah keluar)' end as nama, x.kelas from siswa x
     where x.sekolah_id = v_sk and (v_kelas is null or x.kelas = any (v_kelas))
       and (x.aktif or (x.status_siswa = 'keluar'
                        and exists (select 1 from siswa_tahun z where z.siswa_id = x.id and z.tahun_ajaran = tahun_ajaran_berjalan())))
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


-- 2. data saat aplikasi dibuka: ringkasan tunggakan lama juga untuk siswa yang keluar tahun ini
CREATE OR REPLACE FUNCTION public.ringkasan_tunggakan_lalu()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  return (
    with r as (
      select r.* from tunggakan_rinci(v_sk) r join siswa x on x.id = r.siswa_id
         and (x.aktif or (x.status_siswa = 'keluar'
                          and exists (select 1 from siswa_tahun z where z.siswa_id = x.id and z.tahun_ajaran = tahun_ajaran_berjalan())))
    )
    select jsonb_build_object(
      'spp', coalesce((select jsonb_agg(jsonb_build_array(siswa_id, ta, periode, dibayar)) from r where jenis = 'spp'), '[]'::jsonb),
      'kegiatan', coalesce((select jsonb_agg(jsonb_build_array(siswa_id, biaya_id, dibayar)) from r where jenis = 'kegiatan'), '[]'::jsonb)));
end $function$;
