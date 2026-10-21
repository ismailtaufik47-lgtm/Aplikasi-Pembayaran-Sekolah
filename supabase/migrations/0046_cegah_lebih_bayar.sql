-- =====================================================================
-- 0046 — PENGAMAN "LEBIH BAYAR" + RINGKASAN SAKU PAKAI HITUNGAN YANG SAMA
--
--  1. SPP "terkumpul" di Laporan › Tahunan (per bulan, per kelas, antar
--     tahun) & Tanya SAKU › rekap bulan dihitung maksimal sebesar tagihan
--     tiap siswa — sama dengan Laporan › Pembayaran, Tagihan & Kartu siswa.
--     Kelebihan bayar dilaporkan terpisah (spp.kelebihan / kelebihan_bayar_rupiah).
--     Buku kas tetap mencatat uang yang benar-benar masuk.
--  2. Perubahan yang membuat pembayaran lama jadi berlebih DITOLAK:
--       • tarif SPP diturunkan (standar / per kelas)
--       • siswa dipindah kelas yang tarifnya lebih murah
--       • masa terdaftar / bulan terakhir / hapus dari tahun ajaran
--         sehingga kegiatan yang sudah dibayar jadi "tidak ikut"
--       • nominal kegiatan diturunkan / tanggal kegiatan dipindah ke luar
--         masa terdaftar siswa yang sudah membayar
--     Pesan penolakan menyebut nama siswa & tagihannya.
--     Data lama yang sudah terlanjur berlebih TIDAK menghalangi perubahan
--     lain — cek hanya kelebihan yang BARU muncul.
--
--  Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================

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
           'sudah_masuk_rupiah',      coalesce(sum(least(dibayar, target)), 0),
           'kekurangan_rupiah',       coalesce(sum(greatest(0, target - dibayar)), 0),
           'kelebihan_bayar_rupiah',  coalesce(sum(greatest(0, dibayar - target)), 0))
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
      -- maksimal sebesar tagihan tiap bulan (0046) — sama dengan Laporan › Tahunan
      select q.ta, sum(least(q.n, spp_target(q.siswa_id, q.ta, q.periode)))::bigint as spp_masuk
        from (select tahun_ajaran as ta, siswa_id, periode, sum(nominal) n
                from pembayaran where sekolah_id = v_sk and jenis = 'spp' group by 1, 2, 3) q
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

-- ---------------------------------------------------------------------
-- Pengaman "lebih bayar".
-- Saat dicatat, pembayaran sudah ditolak kalau melebihi tagihan (0036).
-- Tapi tagihan bisa BERUBAH sesudahnya: tarif SPP diturunkan, siswa
-- dipindah ke kelas yang tarifnya lebih murah, masa terdaftar / bulan
-- terakhir diubah, tanggal kegiatan dipindah ke luar masa terdaftar.
-- Akibatnya pembayaran lama jadi berlebih dan laporan tidak cocok lagi.
-- Mulai 0046 perubahan seperti itu DITOLAK dengan pesan yang menyebut
-- siswa & tagihannya. Data lama yang sudah terlanjur berlebih tidak
-- menghalangi perubahan lain (yang dicek hanya kelebihan BARU).
-- ---------------------------------------------------------------------

-- bulan ke-i tahun ajaran (0 = Juli) dari sebuah tanggal
create or replace function indeks_bulan_tgl(p date) returns int
language sql immutable as $$ select ((extract(month from p)::int + 5) % 12) $$;

-- pesan penolakan: "Aisyah (SPP Agustus: dibayar Rp300.000, tagihan menjadi Rp150.000), …"
create or replace function pesan_lebih_bayar(p_daftar text[], p_aksi text) returns void
language plpgsql as $$
begin
  if coalesce(array_length(p_daftar, 1), 0) = 0 then return; end if;
  raise exception '% membuat pembayaran yang sudah dicatat jadi berlebih: %. Batalkan / sesuaikan dulu pembayarannya (Kartu siswa atau menu Transaksi), lalu ulangi.',
    p_aksi,
    array_to_string(p_daftar[1:5], '; ')
      || case when array_length(p_daftar, 1) > 5 then format(' (+%s lagi)', array_length(p_daftar, 1) - 5) else '' end
    using errcode = 'P0001';
end $$;

-- ---------- 1. keanggotaan siswa (kelas, bulan mulai / terakhir, hapus dari tahun ajaran) ----------
create or replace function cegah_lebih_bayar_keanggotaan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text[]; v2 text[]; v_nama text;
begin
  if tg_op = 'UPDATE' and new.kelas is not distinct from old.kelas and new.mulai = old.mulai
     and new.selesai is not distinct from old.selesai and new.tahun_ajaran = old.tahun_ajaran then
    return null;
  end if;
  -- siswa sedang dihapus (cascade) → pembayarannya ikut terhapus, tidak perlu dicek
  select nama into v_nama from siswa where id = old.siswa_id;
  if v_nama is null then return null; end if;

  -- SPP: dulu tidak berlebih, sekarang berlebih
  select case when count(*) > 0 then array[format('%s (SPP %s %s sudah dibayar %s, tagihan menjadi %s)', v_nama,
                     string_agg(ai_nama_bulan(q.periode), ', ' order by q.periode), old.tahun_ajaran,
                     kas_rp(max(q.bayar)), kas_rp(min(q.baru)))] end
    into v
    from (select p.tahun_ajaran ta, p.periode, sum(p.nominal) bayar,
                 spp_target(old.siswa_id, p.tahun_ajaran, p.periode) baru,
                 case when p.periode between old.mulai and coalesce(old.selesai, 11)
                      then spp_tarif(old.sekolah_id, old.tahun_ajaran, old.kelas) else 0 end lama
            from pembayaran p
           where p.siswa_id = old.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = old.tahun_ajaran
           group by 1, 2) q
   where q.bayar > q.baru and q.bayar <= q.lama;

  -- kegiatan: dulu ikut (ditagih), sekarang tidak ikut
  select array_agg(format('%s (kegiatan %s: sudah dibayar %s, siswa jadi tidak ikut)', v_nama, b.nama, kas_rp(q.bayar)))
    into v2
    from (select p.biaya_id, sum(p.nominal) bayar from pembayaran p
           where p.siswa_id = old.siswa_id and p.jenis = 'kegiatan' group by 1) q
    join biaya b on b.id = q.biaya_id and b.tahun_ajaran = old.tahun_ajaran
   where not kegiatan_wajib(old.siswa_id, b.id)
     and (b.tanggal is null or indeks_bulan_tgl(b.tanggal) between old.mulai and coalesce(old.selesai, 11));

  perform pesan_lebih_bayar(coalesce(v, '{}') || coalesce(v2, '{}'), 'Perubahan kelas / masa terdaftar');
  return null;
end $$;

drop trigger if exists siswa_tahun_cegah_lebih_bayar on siswa_tahun;
create trigger siswa_tahun_cegah_lebih_bayar
  after update of kelas, mulai, selesai, tahun_ajaran or delete on siswa_tahun
  for each row execute function cegah_lebih_bayar_keanggotaan();

-- ---------- 2. tarif SPP tahun ajaran (standar & per kelas) ----------
create or replace function cegah_lebih_bayar_tarif() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if new.spp_nominal is not distinct from old.spp_nominal and new.spp_kelas is not distinct from old.spp_kelas then
    return null;
  end if;
  select array_agg(x order by x) into v from (
  select format('%s (SPP %s sudah dibayar %s, tarif menjadi %s)', z.nama,
                string_agg(ai_nama_bulan(q.periode), ', ' order by q.periode), kas_rp(max(q.bayar)), kas_rp(min(q.baru))) x
    from (select p.siswa_id, p.tahun_ajaran ta, p.periode, sum(p.nominal) bayar,
                 spp_target(p.siswa_id, p.tahun_ajaran, p.periode) baru,
                 case when p.periode between st.mulai and coalesce(st.selesai, 11)
                      then coalesce((old.spp_kelas ->> st.kelas)::int, old.spp_nominal) else 0 end lama
            from pembayaran p
            join siswa_tahun st on st.siswa_id = p.siswa_id and st.tahun_ajaran = p.tahun_ajaran
           where p.sekolah_id = new.sekolah_id and p.jenis = 'spp' and p.tahun_ajaran = new.kode
           group by p.siswa_id, p.tahun_ajaran, p.periode, st.mulai, st.selesai, st.kelas) q
    join siswa z on z.id = q.siswa_id
   where q.bayar > q.baru and q.bayar <= q.lama
   group by z.id, z.nama) w;
  perform pesan_lebih_bayar(v, 'Tarif SPP ' || new.kode || ' yang baru');
  return null;
end $$;

drop trigger if exists tahun_ajaran_cegah_lebih_bayar on tahun_ajaran;
create trigger tahun_ajaran_cegah_lebih_bayar
  after update of spp_nominal, spp_kelas on tahun_ajaran
  for each row execute function cegah_lebih_bayar_tarif();

-- ---------- 3. kegiatan: nominal diturunkan / tanggal dipindah ke luar masa terdaftar ----------
create or replace function cegah_lebih_bayar_kegiatan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if new.nominal is not distinct from old.nominal and new.tanggal is not distinct from old.tanggal
     and new.tahun_ajaran is not distinct from old.tahun_ajaran then
    return null;
  end if;
  select array_agg(format('%s (%s: dibayar %s, %s)', z.nama, new.nama, kas_rp(q.bayar),
                          case when q.wajib then 'nominal menjadi ' || kas_rp(new.nominal) else 'siswa jadi tidak ikut' end)
                   order by z.nama)
    into v
    from (select p.siswa_id, sum(p.nominal) bayar, kegiatan_wajib(p.siswa_id, new.id) wajib,
                 exists (select 1 from siswa_tahun st where st.siswa_id = p.siswa_id and st.tahun_ajaran = old.tahun_ajaran
                            and (old.tanggal is null or indeks_bulan_tgl(old.tanggal) between st.mulai and coalesce(st.selesai, 11))) wajib_lama
            from pembayaran p where p.biaya_id = new.id and p.jenis = 'kegiatan' group by p.siswa_id) q
    join siswa z on z.id = q.siswa_id
   where q.wajib_lama and q.bayar <= old.nominal
     and q.bayar > case when q.wajib then new.nominal else 0 end;
  perform pesan_lebih_bayar(v, 'Perubahan kegiatan ' || new.nama);
  return null;
end $$;

drop trigger if exists biaya_cegah_lebih_bayar on biaya;
create trigger biaya_cegah_lebih_bayar
  after update of nominal, tanggal, tahun_ajaran on biaya
  for each row execute function cegah_lebih_bayar_kegiatan();

-- fungsi bantu di atas bukan untuk dipanggil langsung dari aplikasi
revoke all on function indeks_bulan_tgl(date) from public, anon, authenticated;
revoke all on function pesan_lebih_bayar(text[], text) from public, anon, authenticated;
revoke all on function cegah_lebih_bayar_keanggotaan() from public, anon, authenticated;
revoke all on function cegah_lebih_bayar_tarif() from public, anon, authenticated;
revoke all on function cegah_lebih_bayar_kegiatan() from public, anon, authenticated;
