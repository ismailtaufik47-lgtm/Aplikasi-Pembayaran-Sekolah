-- =====================================================================
-- 0048 — LAPORAN TAHUNAN & DAFTAR TAHUN AJARAN LEBIH CEPAT (hasil uji beban v34)
--
--  Butuh 0046 sudah dijalankan. Hasil (angka) SAMA PERSIS dengan 0046 —
--  hanya cara menghitungnya yang diubah:
--   • daftar_tahun_ajaran(): "SPP masuk" (maks. sebesar tagihan) tidak lagi memanggil
--     spp_target() satu per satu untuk tiap siswa × bulan × tahun.
--       sekolah 300 siswa, 3 tahun data: ±670 ms → lihat HASIL_UJI_BEBAN_v34.txt
--   • laporan_tahunan(): daftar "siswa yang menunggak" & pembayaran per kegiatan
--     dijumlah sekali per siswa, bukan dihitung ulang untuk tiap siswa.
--   • ai_rekap_tahun (Tanya SAKU) ikut cepat karena memakai keduanya.
--
--  Tidak mengubah data. Aman dijalankan berulang kali.
-- =====================================================================

do $cek$
begin
  if to_regprocedure('public.cegah_lebih_bayar_tarif()') is null then
    raise exception '0048 butuh 0046_cegah_lebih_bayar.sql. Jalankan 0046 dulu, lalu ulangi 0048.';
  end if;
end $cek$;

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
  -- dibayar dihitung maksimal sebesar tagihan bulan itu (0046); kelebihan dilaporkan terpisah
  sb as (
    select b.*, least(coalesce(y.n, 0), b.tarif) as dibayar, greatest(0, coalesce(y.n, 0) - b.tarif) as lebih
      from bulan b left join bayar_spp y on y.siswa_id = b.siswa_id and y.i = b.i
  ),
  keg as (
    select b.id, b.nama, b.nominal, b.tanggal, b.emoji, b.urutan,
           ((extract(month from b.tanggal)::int + 5) % 12) as bln,
           -- jatuh tempo kegiatan = tanggal kegiatannya (sama dengan menu Tagihan); tahun lalu = semua sudah jatuh tempo
           (p_ta < v_kini or (b.tanggal is not null and b.tanggal < v_hari)) as lewat
      from biaya b where b.sekolah_id = v_sk and b.tahun_ajaran = p_ta and b.aktif
  ),
  -- 0048: pembayaran kegiatan dijumlah sekali (dulu satu pencarian per siswa × kegiatan)
  keg_bayar as (
    select p.siswa_id, p.biaya_id, sum(p.nominal) as n
      from pembayaran p where p.sekolah_id = v_sk and p.jenis = 'kegiatan' and p.biaya_id in (select id from keg)
     group by 1, 2
  ),
  keg_siswa as (
    select k.id as biaya_id, st.siswa_id, k.nominal, k.lewat,
           coalesce(kb.n, 0)::bigint as dibayar
      from keg k join st on k.tanggal is null or k.bln between st.mulai and st.selesai
      left join keg_bayar kb on kb.siswa_id = st.siswa_id and kb.biaya_id = k.id
  ),
  pk as (
    select k.id, k.jenis, k.nama, k.total,
           (select count(*) from paket_siswa ps where ps.paket_id = k.id) as siswa,
           coalesce((select sum(p.nominal) from pembayaran p where p.paket_id = k.id and p.jenis = 'paket'), 0)::bigint as masuk
      from paket_biaya k where k.sekolah_id = v_sk and k.tahun_ajaran = p_ta and k.aktif
  ),
  -- 0048: dijumlah sekali per siswa (dulu dihitung ulang untuk tiap siswa → makin lambat kuadratik)
  tunggak_spp as (
    select sb.siswa_id, sum(greatest(0, sb.tarif - sb.dibayar))::bigint as n
      from sb where sb.i < v_bln group by sb.siswa_id
  ),
  tunggak_keg as (
    select ks.siswa_id, sum(greatest(0, ks.nominal - ks.dibayar))::bigint as n
      from keg_siswa ks where ks.lewat group by ks.siswa_id
  ),
  tunggak as (
    select st.siswa_id, st.nama, st.kelas, st.status_siswa, st.akhir,
           coalesce(a.n, 0)::bigint as spp,
           coalesce(c.n, 0)::bigint as kegiatan
      from st
      left join tunggak_spp a on a.siswa_id = st.siswa_id
      left join tunggak_keg c on c.siswa_id = st.siswa_id
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
      -- kelebihan bayar: melebihi tarif bulan itu, atau dibayar untuk bulan yang tidak ditagih
      'kelebihan', (select coalesce(sum(lebih), 0) from sb)
                 + (select coalesce(sum(y.n), 0) from bayar_spp y
                     where not exists (select 1 from bulan b where b.siswa_id = y.siswa_id and b.i = y.i)),
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

CREATE OR REPLACE FUNCTION public.daftar_tahun_ajaran()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sk uuid := laporan_sekolah_baca(); v_kini text := tahun_ajaran_berjalan();
begin
  return coalesce((
    with kode as (
      select kode from tahun_ajaran where sekolah_id = v_sk and kode <= v_kini
      union select tahun_ajaran from siswa_tahun where sekolah_id = v_sk and tahun_ajaran <= v_kini
      union select v_kini
    ),
    st as (
      select st.tahun_ajaran, count(*) as siswa,
             sum((coalesce(st.selesai, 11) - st.mulai + 1) * coalesce((t.spp_kelas ->> st.kelas)::int, t.spp_nominal, 0))::bigint as spp_target
        from siswa_tahun st
        left join tahun_ajaran t on t.sekolah_id = st.sekolah_id and t.kode = st.tahun_ajaran
       where st.sekolah_id = v_sk
       group by st.tahun_ajaran
    ),
    bayar as (
      select tahun_ajaran_berjalan((dibayar_pada at time zone 'Asia/Jakarta')::date) as ta,
             sum(nominal)::bigint as masuk,
             sum(nominal) filter (where jenis = 'spp')::bigint as masuk_spp_tanggal
        from pembayaran where sekolah_id = v_sk group by 1
    ),
    spp as (
      -- maksimal sebesar tagihan tiap bulan (0046) — sama dengan Laporan › Tahunan.
      -- 0048: tagihan dihitung dengan JOIN (isi spp_target + spp_tarif yang sama), bukan
      -- memanggil spp_target sekali per siswa per bulan (±9.000 panggilan di sekolah 300 siswa).
      select q.ta,
             sum(least(q.n, case when q.periode between st.mulai and coalesce(st.selesai, 11)
                                 then coalesce((t.spp_kelas ->> st.kelas)::int, t.spp_nominal, s.spp_nominal, 0)
                                 else 0 end))::bigint as spp_masuk
        from (select tahun_ajaran as ta, siswa_id, periode, sum(nominal) n
                from pembayaran where sekolah_id = v_sk and jenis = 'spp' group by 1, 2, 3) q
        left join siswa_tahun st on st.siswa_id = q.siswa_id and st.tahun_ajaran = q.ta
        left join tahun_ajaran t on t.sekolah_id = st.sekolah_id and t.kode = st.tahun_ajaran
        left join sekolah s on s.id = st.sekolah_id
       group by 1
    )
    select jsonb_agg(jsonb_build_object(
             'kode', k.kode,
             'berjalan', k.kode = v_kini,
             'siswa', coalesce(st.siswa, 0),
             'sppTarget', coalesce(st.spp_target, 0),
             'sppMasuk', coalesce(spp.spp_masuk, 0),
             'pembayaranMasuk', coalesce(b.masuk, 0))
           order by k.kode desc)
      from kode k
      left join st on st.tahun_ajaran = k.kode
      left join spp on spp.ta = k.kode
      left join bayar b on b.ta = k.kode
  ), '[]'::jsonb);
end $function$;
