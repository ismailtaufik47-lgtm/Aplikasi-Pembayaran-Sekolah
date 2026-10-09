-- =====================================================================
-- 0043 — Laporan per tahun ajaran (v31)
--
--  daftar_tahun_ajaran()  : semua tahun ajaran sekolah (terbaru dulu) + angka ringkas
--                           untuk pilihan "Tahun ajaran ▾" & grafik perbandingan antar tahun
--  laporan_tahunan(ta)    : rekap satu tahun ajaran — siswa, SPP per bulan & per kelas
--                           (kelas SAAT ITU), kegiatan (masuk vs terpakai), PMB/DU,
--                           buku kas Juli–Juni, dan daftar siswa yang masih menunggak
--                           (termasuk yang sudah lulus / keluar)
--  Dihitung di server → data tahun lama tidak perlu ditarik ke HP.
--  Butuh 0042. Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================

-- hak baca laporan: laporan pembayaran / keuangan / kas
create or replace function laporan_sekolah_baca() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := sekolah_saya();
begin
  if v is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not (boleh('lap_pembayaran', 'lihat') or boleh('lap_keuangan', 'lihat') or boleh('kas', 'lihat')) then
    raise exception 'Akun ini tidak punya akses melihat laporan.' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------- daftar tahun ajaran ----------
create or replace function daftar_tahun_ajaran() returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
      select tahun_ajaran as ta, sum(nominal)::bigint as spp_masuk
        from pembayaran where sekolah_id = v_sk and jenis = 'spp' group by 1
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
end $$;

-- ---------- laporan satu tahun ajaran ----------
create or replace function laporan_tahunan(p_ta text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
                -- tahun berjalan: bulan lalu pasti; bulan ini kalau sudah lewat tanggal jatuh tempo
                else ai_indeks_bulan(v_hari)
                     + case when v_hari > ai_tgl_jatuh_tempo((select tanggal_jatuh_tempo from sekolah where id = v_sk), date_trunc('month', v_hari)::date)
                            then 1 else 0 end end;
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
end $$;

revoke all on function laporan_sekolah_baca() from public, anon;
revoke all on function daftar_tahun_ajaran() from public, anon;
revoke all on function laporan_tahunan(text) from public, anon;
grant execute on function laporan_sekolah_baca(), daftar_tahun_ajaran(), laporan_tahunan(text) to authenticated;
