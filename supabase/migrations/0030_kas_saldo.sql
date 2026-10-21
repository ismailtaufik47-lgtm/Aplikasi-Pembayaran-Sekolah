-- =====================================================================
-- 0030 — Kas sekolah: saldo tidak boleh minus & laporan dihitung server
--
-- Aturan uang (ditegakkan di DATABASE, bukan hanya di layar):
--   1. Saldo awal kas wajib diisi dulu sebelum mencatat transaksi kas,
--      dan tidak boleh minus.
--   2. Tanggal transaksi kas tidak boleh sebelum tanggal mulai saldo awal
--      (transaksi sebelum tanggal itu sudah termasuk saldo awal).
--   3. Saldo kas tidak boleh minus di tanggal mana pun:
--        • pengeluaran lebih besar dari saldo → ditolak
--        • pengeluaran tanggal mundur yang membuat saldo hari-hari
--          berikutnya minus → ditolak
--        • membatalkan pemasukan / pembayaran orang tua yang uangnya sudah
--          terpakai → ditolak (dengan petunjuk cara membetulkannya)
--        • mengubah saldo awal / tanggal mulai yang membuat saldo minus → ditolak
--   4. Dua petugas mencatat bersamaan tidak bisa "menembus" saldo:
--      semua perubahan kas satu sekolah diantrekan (advisory lock).
--
-- Laporan (saldo, laporan bulanan, arus kas, riwayat) sekarang dihitung di
-- server, jadi tetap benar walau transaksi sudah ribuan (sebelumnya dihitung
-- di browser dari data yang bisa terpotong 1.000 baris), dan halaman Kas
-- cukup mengambil data seperlunya (riwayat per halaman).
--
-- Butuh 0028 & 0029. Aman dijalankan berulang kali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- helper tampilan pesan
-- ---------------------------------------------------------------------
create or replace function kas_rp(p bigint) returns text
language sql immutable as $$
  select case when p < 0 then '-' else '' end || 'Rp' ||
         replace(to_char(abs(coalesce(p, 0)), 'FM999,999,999,999,990'), ',', '.')
$$;

create or replace function kas_tgl(p date) returns text
language sql immutable as $$
  select extract(day from p)::int || ' ' ||
         (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])
           [extract(month from p)::int] || ' ' || extract(year from p)::int
$$;

create or replace function kas_hari_ini() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ---------------------------------------------------------------------
-- buku kas (hanya dipanggil dari fungsi lain — TIDAK untuk akun pengguna)
-- ---------------------------------------------------------------------

/** Semua gerakan kas yang SAH satu sekolah, dalam rentang tanggal (sejak tanggal mulai). */
create or replace function kas_gerakan(p_sk uuid, p_dari date default null, p_sampai date default null)
returns table(sumber text, id uuid, tanggal date, jenis text, kategori text, nominal bigint, keterangan text, urut timestamptz)
language sql stable security definer set search_path = public as $$
  with m as (
    select greatest(coalesce((select g.mulai from kas_pengaturan g where g.sekolah_id = p_sk), '-infinity'::date),
                    coalesce(p_dari, '-infinity'::date)) as dari,
           coalesce(p_sampai, 'infinity'::date) as sampai
  )
  select 'bayar', b.id, (b.dibayar_pada at time zone 'Asia/Jakarta')::date, 'masuk',
         case when b.jenis = 'spp' then 'SPP' else 'Biaya kegiatan' end,
         b.nominal::bigint, b.keterangan, b.dibayar_pada
    from pembayaran b, m
   where b.sekolah_id = p_sk
     and (m.dari = '-infinity'::date or b.dibayar_pada >= (m.dari::timestamp at time zone 'Asia/Jakarta'))
     and (m.sampai = 'infinity'::date or b.dibayar_pada < ((m.sampai + 1)::timestamp at time zone 'Asia/Jakarta'))
  union all
  select 'kas', k.id, k.tanggal, k.jenis, k.kategori, k.nominal, k.keterangan, k.dibuat_pada
    from kas k, m
   where k.sekolah_id = p_sk and k.dibatalkan_pada is null
     and k.tanggal >= m.dari and k.tanggal <= m.sampai
$$;

/** Saldo akhir hari untuk tiap tanggal yang ada gerakannya. */
create or replace function kas_saldo_harian(p_sk uuid)
returns table(tanggal date, saldo bigint)
language sql stable security definer set search_path = public as $$
  select h.t,
         (coalesce((select g.saldo_awal from kas_pengaturan g where g.sekolah_id = p_sk), 0)
          + sum(h.net) over (order by h.t))::bigint
    from (select x.tanggal as t,
                 sum(case when x.jenis = 'masuk' then x.nominal else -x.nominal end) as net
            from kas_gerakan(p_sk) x group by x.tanggal) h
$$;

/** Saldo kas pada akhir tanggal tertentu. */
create or replace function kas_saldo_per(p_sk uuid, p_tgl date) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select g.saldo_awal from kas_pengaturan g where g.sekolah_id = p_sk), 0)
       + coalesce((select sum(case when x.jenis = 'masuk' then x.nominal else -x.nominal end)
                     from kas_gerakan(p_sk, null, p_tgl) x), 0)::bigint
$$;

/** Saldo akhir hari TERENDAH mulai tanggal p_dari sampai sekarang (dan tanggalnya). */
create or replace function kas_saldo_terendah(p_sk uuid, p_dari date, out saldo bigint, out tanggal date)
language sql stable security definer set search_path = public as $$
  select c.saldo, c.tanggal
    from (select p_dari as tanggal, kas_saldo_per(p_sk, p_dari) as saldo
          union all
          select h.tanggal, h.saldo from kas_saldo_harian(p_sk) h where h.tanggal > p_dari) c
   order by c.saldo, c.tanggal
   limit 1
$$;

/** Antrekan semua perubahan kas satu sekolah (mencegah dua pengeluaran bersamaan menembus saldo). */
create or replace function kas_kunci(p_sk uuid) returns void
language sql volatile as $$ select pg_advisory_xact_lock(hashtextextended('kas:' || p_sk::text, 0)) $$;

/** Akun login + hak akses kas (lihat) — untuk fungsi baca. */
create or replace function kas_sekolah_baca() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := sekolah_saya();
begin
  if v is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not (boleh('kas', 'lihat') or boleh('lap_keuangan', 'lihat')) then
    raise exception 'Akun ini tidak punya akses melihat kas sekolah.';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- tulis: catat, batalkan, saldo awal
-- ---------------------------------------------------------------------
create or replace function kas_catat(
  p_jenis text, p_tanggal date, p_kategori text, p_nominal bigint,
  p_keterangan text default null, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; g kas_pengaturan%rowtype; r record; v_id uuid;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mencatat kas.'; end if;
  if p_jenis is null or p_jenis not in ('masuk', 'keluar') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if p_tanggal > kas_hari_ini() then raise exception 'Tanggal tidak boleh di masa depan.'; end if;
  if coalesce(p_nominal, 0) <= 0 then raise exception 'Nominal harus lebih dari nol.'; end if;
  if p_nominal > 1000000000000 then raise exception 'Nominal terlalu besar.'; end if;
  if length(trim(coalesce(p_kategori, ''))) = 0 then raise exception 'Kategori wajib diisi.'; end if;
  perform cek_gambar(p_nota, 'Foto nota');
  perform wajib_langganan_aktif(p.sekolah_id);

  perform kas_kunci(p.sekolah_id);
  select * into g from kas_pengaturan where sekolah_id = p.sekolah_id;
  if not found then
    raise exception 'Isi saldo awal kas dulu (cukup sekali) sebelum mencatat transaksi kas.';
  end if;
  if p_tanggal < g.mulai then
    raise exception 'Tanggal % sebelum tanggal mulai kas (%). Transaksi sebelum tanggal itu sudah termasuk saldo awal — kalau memang perlu dicatat, ubah dulu tanggal mulai saldo awal.',
      kas_tgl(p_tanggal), kas_tgl(g.mulai);
  end if;

  if p_jenis = 'keluar' then
    select * into r from kas_saldo_terendah(p.sekolah_id, p_tanggal);
    if p_nominal > r.saldo then
      if r.tanggal = p_tanggal then
        raise exception 'Saldo kas tidak cukup. Saldo per % hanya %, pengeluaran %.',
          kas_tgl(p_tanggal), kas_rp(r.saldo), kas_rp(p_nominal);
      else
        raise exception 'Saldo kas tidak cukup. Pengeluaran tanggal % paling banyak % supaya saldo tidak minus pada %.',
          kas_tgl(p_tanggal), kas_rp(greatest(r.saldo, 0)), kas_tgl(r.tanggal);
      end if;
    end if;
  end if;

  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota, dicatat_oleh, dicatat_nama)
  values (p.sekolah_id, p_jenis, p_tanggal, left(trim(p_kategori), 40), p_nominal,
          nullif(left(trim(coalesce(p_keterangan, '')), 300), ''), p_nota, p.id, p.nama)
  returning id into v_id;
  return v_id;
end $$;

create or replace function kas_batalkan(p_id uuid, p_alasan text)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; k kas%rowtype; g kas_pengaturan%rowtype; r record;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Tuliskan alasan pembatalan.'; end if;
  perform wajib_langganan_aktif(p.sekolah_id);

  perform kas_kunci(p.sekolah_id);
  select * into k from kas where id = p_id and sekolah_id = p.sekolah_id and dibatalkan_pada is null for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;

  update kas
     set dibatalkan_pada = now(), dibatalkan_nama = p.nama, alasan_batal = left(trim(p_alasan), 200)
   where id = k.id;

  -- membatalkan PEMASUKAN mengurangi saldo → tidak boleh membuat saldo minus
  select * into g from kas_pengaturan where sekolah_id = p.sekolah_id;
  if k.jenis = 'masuk' and (not found or k.tanggal >= g.mulai) then
    select * into r from kas_saldo_terendah(p.sekolah_id, k.tanggal);
    if r.saldo < 0 then
      raise exception 'Pemasukan ini tidak bisa dibatalkan: saldo kas akan minus (% pada %). Uangnya sudah terpakai — batalkan dulu pengeluaran yang memakainya, atau catat pemasukan penggantinya dulu.',
        kas_rp(r.saldo), kas_tgl(r.tanggal);
    end if;
  end if;
end $$;

create or replace function kas_atur_saldo_awal(p_saldo bigint, p_mulai date)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; lama kas_pengaturan%rowtype; v_min_lama bigint; r record; v_awal date;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mengatur kas.'; end if;
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if p_mulai > kas_hari_ini() then raise exception 'Tanggal mulai tidak boleh di masa depan.'; end if;
  if coalesce(p_saldo, 0) < 0 then raise exception 'Saldo awal tidak boleh minus.'; end if;
  if p_saldo > 1000000000000 then raise exception 'Saldo awal terlalu besar.'; end if;
  perform wajib_langganan_aktif(p.sekolah_id);

  perform kas_kunci(p.sekolah_id);

  -- transaksi kas yang sudah tercatat tidak boleh jatuh sebelum tanggal mulai
  select min(tanggal) into v_awal from kas where sekolah_id = p.sekolah_id and dibatalkan_pada is null;
  if v_awal is not null and p_mulai > v_awal then
    raise exception 'Sudah ada transaksi kas tanggal %. Tanggal mulai saldo awal paling lambat % (atau batalkan dulu transaksi itu).',
      kas_tgl(v_awal), kas_tgl(v_awal);
  end if;

  -- saldo terendah SEBELUM diubah (kalau data lama sudah terlanjur minus,
  -- perubahan yang tidak memperburuknya tetap boleh)
  select * into lama from kas_pengaturan where sekolah_id = p.sekolah_id;
  if found then select t.saldo into v_min_lama from kas_saldo_terendah(p.sekolah_id, lama.mulai) t; end if;

  insert into kas_pengaturan as k (sekolah_id, saldo_awal, mulai, diubah_oleh, diubah_pada)
  values (p.sekolah_id, coalesce(p_saldo, 0), p_mulai, p.nama, now())
  on conflict (sekolah_id) do update
    set saldo_awal = excluded.saldo_awal, mulai = excluded.mulai,
        diubah_oleh = excluded.diubah_oleh, diubah_pada = now();

  select * into r from kas_saldo_terendah(p.sekolah_id, p_mulai);
  if r.saldo < 0 and (v_min_lama is null or r.saldo < v_min_lama) then
    raise exception 'Dengan saldo awal ini, saldo kas akan minus (% pada %). Periksa lagi nominal saldo awal dan tanggal mulainya.',
      kas_rp(r.saldo), kas_tgl(r.tanggal);
  end if;
end $$;

-- Pembatalan pembayaran orang tua juga mengurangi saldo kas.
create or replace function batalkan_pembayaran(p_id uuid, p_alasan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr profil%rowtype; b pembayaran%rowtype; g kas_pengaturan%rowtype; r record; v_tgl date;
begin
  select * into pr from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Tuliskan alasan pembatalan.'; end if;
  perform wajib_langganan_aktif(pr.sekolah_id);

  perform kas_kunci(pr.sekolah_id);
  select * into b from pembayaran where id = p_id and sekolah_id = pr.sekolah_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;

  insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, biaya_id, keterangan, nominal, metode,
                                petugas, dicatat_oleh, dibayar_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
  values (b.id, b.sekolah_id, b.siswa_id, b.jenis, b.periode, b.biaya_id, b.keterangan, b.nominal, b.metode,
          b.petugas, b.dicatat_oleh, b.dibayar_pada, pr.id, pr.nama, left(trim(p_alasan), 200));
  delete from pembayaran where id = b.id;

  -- Sekolah yang memakai buku kas: pembatalan tidak boleh membuat saldo minus.
  select * into g from kas_pengaturan where sekolah_id = pr.sekolah_id;
  if found then
    v_tgl := (b.dibayar_pada at time zone 'Asia/Jakarta')::date;
    if v_tgl >= g.mulai then
      select * into r from kas_saldo_terendah(pr.sekolah_id, v_tgl);
      if r.saldo < 0 then
        raise exception 'Pembayaran ini tidak bisa dibatalkan: saldo kas akan minus (% pada %). Kalau salah siswa/bulan, catat dulu pembayaran yang benar lalu batalkan yang ini. Kalau uangnya memang tidak ada, batalkan dulu pengeluaran kas yang memakainya.',
          kas_rp(r.saldo), kas_tgl(r.tanggal);
      end if;
    end if;
  end if;

  return jsonb_build_object('id', b.id, 'nominal', b.nominal, 'keterangan', b.keterangan);
end $$;

-- ---------------------------------------------------------------------
-- baca (dipakai halaman Kas & Laporan → Keuangan)
-- ---------------------------------------------------------------------

/** Ringkasan: saldo sekarang, saldo awal, bulan pertama, peringatan. */
create or replace function kas_ringkasan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca(); g kas_pengaturan%rowtype; ada boolean;
        v_ter_saldo bigint; v_ter_tgl date; v_pertama date;
begin
  select * into g from kas_pengaturan where sekolah_id = v_sk;
  ada := found;
  v_pertama := coalesce(g.mulai, (select min(x.tanggal) from kas_gerakan(v_sk) x), kas_hari_ini());
  if ada then select t.saldo, t.tanggal into v_ter_saldo, v_ter_tgl from kas_saldo_terendah(v_sk, g.mulai) t; end if;
  return jsonb_build_object(
    'pengaturan', case when ada then jsonb_build_object('saldoAwal', g.saldo_awal, 'mulai', g.mulai,
                                                       'diubahOleh', g.diubah_oleh, 'diubahPada', g.diubah_pada) end,
    'saldoKini', kas_saldo_per(v_sk, kas_hari_ini()),
    'hariIni', kas_hari_ini(),
    'bulanPertama', to_char(least(v_pertama, kas_hari_ini()), 'YYYY-MM'),
    'terendah', case when ada then jsonb_build_object('saldo', v_ter_saldo, 'tanggal', v_ter_tgl) end,
    -- transaksi kas SAH yang tanggalnya sebelum tanggal mulai → tidak dihitung
    'sebelumMulai', case when ada then (
       select jsonb_build_object('jumlah', count(*), 'pertama', min(k.tanggal))
         from kas k where k.sekolah_id = v_sk and k.dibatalkan_pada is null and k.tanggal < g.mulai) end,
    'kategori', jsonb_build_object(
       'masuk', coalesce((select jsonb_agg(z.kategori) from (select k.kategori from kas k where k.sekolah_id = v_sk and k.jenis = 'masuk'
                            group by k.kategori order by max(k.dibuat_pada) desc limit 20) z), '[]'::jsonb),
       'keluar', coalesce((select jsonb_agg(z.kategori) from (select k.kategori from kas k where k.sekolah_id = v_sk and k.jenis = 'keluar'
                            group by k.kategori order by max(k.dibuat_pada) desc limit 20) z), '[]'::jsonb))
  );
end $$;

/** Laporan satu bulan ('YYYY-MM') — bentuknya sama dengan laporanBulan() di lib/kas.js. */
create or replace function kas_laporan_bulan(p_bulan text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca(); d0 date; d1 date; v_awal bigint;
begin
  if p_bulan is null or p_bulan !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak dikenal.'; end if;
  d0 := (p_bulan || '-01')::date;
  d1 := (d0 + interval '1 month' - interval '1 day')::date;
  v_awal := kas_saldo_per(v_sk, d0 - 1);

  return (
    with g as (select * from kas_gerakan(v_sk, d0, d1)),
    t as (select coalesce(sum(nominal) filter (where jenis = 'masuk'), 0)::bigint as masuk,
                 coalesce(sum(nominal) filter (where jenis = 'keluar'), 0)::bigint as keluar,
                 count(*) filter (where jenis = 'keluar') as n_keluar
            from g),
    -- baris buku kas: pembayaran orang tua digabung per hari, kas satu per satu
    b as (
      select g.tanggal, 'Penerimaan SPP & biaya kegiatan (' || count(*) || ' transaksi)' as uraian,
             sum(g.nominal)::bigint as masuk, 0::bigint as keluar, max(g.urut) as urut
        from g where g.sumber = 'bayar' group by g.tanggal
      union all
      select g.tanggal, g.kategori || coalesce(' — ' || nullif(g.keterangan, ''), ''),
             case when g.jenis = 'masuk' then g.nominal else 0 end,
             case when g.jenis = 'keluar' then g.nominal else 0 end, g.urut
        from g where g.sumber = 'kas'
    ),
    bs as (
      select b.*, v_awal + sum(b.masuk - b.keluar) over (order by b.tanggal, (b.keluar > 0), b.urut, b.uraian
                                                         rows between unbounded preceding and current row) as saldo,
             row_number() over (order by b.tanggal, (b.keluar > 0), b.urut, b.uraian) as n
        from b
    )
    select jsonb_build_object(
      'bulan', p_bulan,
      'saldoAwal', v_awal,
      'totalMasuk', t.masuk,
      'totalKeluar', t.keluar,
      'saldoAkhir', v_awal + t.masuk - t.keluar,
      'jumlahKeluar', t.n_keluar,
      'masukPerKategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                                     from (select kategori, sum(nominal)::bigint n from g where jenis = 'masuk' group by kategori) q), '[]'::jsonb),
      'keluarPerKategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                                     from (select kategori, sum(nominal)::bigint n from g where jenis = 'keluar' group by kategori) q), '[]'::jsonb),
      'baris', coalesce((select jsonb_agg(jsonb_build_object('tanggal', bs.tanggal, 'uraian', bs.uraian, 'masuk', bs.masuk,
                                                            'keluar', bs.keluar, 'saldo', bs.saldo) order by bs.n) from bs), '[]'::jsonb)
    ) from t
  );
end $$;

/** Pemasukan & pengeluaran per bulan: p_n bulan yang berakhir di p_sampai ('YYYY-MM'). */
create or replace function kas_arus(p_sampai text, p_n int default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca(); v_akhir date; v_awal date; v_n int := greatest(1, least(coalesce(p_n, 6), 24));
begin
  if p_sampai is null or p_sampai !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak dikenal.'; end if;
  v_akhir := (p_sampai || '-01')::date;
  v_awal := (v_akhir - make_interval(months => v_n - 1))::date;
  return (
    select jsonb_agg(jsonb_build_object('bulan', to_char(s.b, 'YYYY-MM'),
                                        'masuk', coalesce(a.masuk, 0), 'keluar', coalesce(a.keluar, 0)) order by s.b)
      from generate_series(v_awal, v_akhir, interval '1 month') s(b)
      left join (select date_trunc('month', x.tanggal)::date as b,
                        sum(x.nominal) filter (where x.jenis = 'masuk')::bigint as masuk,
                        sum(x.nominal) filter (where x.jenis = 'keluar')::bigint as keluar
                   from kas_gerakan(v_sk, v_awal, (v_akhir + interval '1 month' - interval '1 day')::date) x
                  group by 1) a on a.b = s.b::date
  );
end $$;

/**
 * Riwayat transaksi untuk rentang tanggal, per halaman (terbaru dulu).
 * Pembayaran orang tua digabung per hari; transaksi kas satu per satu
 * (termasuk yang dibatalkan, ditandai). Foto nota TIDAK ikut.
 */
create or replace function kas_riwayat(p_dari date, p_sampai date, p_mulai_dari int default 0, p_batas int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk uuid := kas_sekolah_baca();
  v_mulai date := (select mulai from kas_pengaturan where sekolah_id = v_sk);
  v_batas int := greatest(1, least(coalesce(p_batas, 30), 100));
  v_off int := greatest(0, coalesce(p_mulai_dari, 0));
begin
  if p_dari is null or p_sampai is null then raise exception 'Rentang tanggal wajib diisi.'; end if;
  if p_dari > p_sampai then raise exception 'Tanggal "dari" harus sebelum tanggal "sampai".'; end if;

  return (
    with semua as (
      select 'kas' as sumber, k.id, k.tanggal, k.jenis, k.kategori, k.nominal::bigint as nominal, k.keterangan,
             k.dicatat_nama, k.dibuat_pada as urut, k.dibatalkan_pada, k.dibatalkan_nama, k.alasan_batal, k.ada_nota,
             (v_mulai is not null and k.tanggal < v_mulai) as sebelum_mulai, 1 as n
        from kas k
       where k.sekolah_id = v_sk and k.tanggal between p_dari and p_sampai
      union all
      select 'bayar', null, x.tanggal, 'masuk', 'Pembayaran orang tua', sum(x.nominal)::bigint, null,
             null, max(x.urut), null, null, null, false, false, count(*)::int
        from kas_gerakan(v_sk, p_dari, p_sampai) x
       where x.sumber = 'bayar'
       group by x.tanggal
    ),
    urut as (select * from semua order by tanggal desc, (sumber = 'kas') desc, urut desc, id nulls last)
    select jsonb_build_object(
      'item', coalesce((select jsonb_agg(jsonb_build_object(
                 'sumber', u.sumber, 'id', u.id, 'tanggal', u.tanggal, 'jenis', u.jenis, 'kategori', u.kategori,
                 'nominal', u.nominal, 'keterangan', u.keterangan, 'dicatatNama', u.dicatat_nama, 'dibuatPada', u.urut,
                 'dibatalkanPada', u.dibatalkan_pada, 'dibatalkanNama', u.dibatalkan_nama, 'alasanBatal', u.alasan_batal,
                 'adaNota', u.ada_nota, 'sebelumMulai', u.sebelum_mulai, 'jumlah', u.n))
                from (select * from urut offset v_off limit v_batas) u), '[]'::jsonb),
      'lanjut', (select count(*) from semua) > v_off + v_batas,
      'total', (select jsonb_build_object(
                  'masuk', coalesce(sum(nominal) filter (where jenis = 'masuk'), 0),
                  'keluar', coalesce(sum(nominal) filter (where jenis = 'keluar'), 0),
                  'jumlah', count(*))
                  from kas_gerakan(v_sk, p_dari, p_sampai))
    )
  );
end $$;

/** Berapa yang masih bisa dikeluarkan pada tanggal tertentu (untuk petunjuk di form). */
create or replace function kas_saldo_tersedia(p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca(); r record;
begin
  if p_tanggal is null then p_tanggal := kas_hari_ini(); end if;
  select * into r from kas_saldo_terendah(v_sk, p_tanggal);
  return jsonb_build_object('tersedia', greatest(r.saldo, 0), 'saldoTanggal', kas_saldo_per(v_sk, p_tanggal),
                            'dibatasiTanggal', case when r.tanggal <> p_tanggal then r.tanggal end);
end $$;

-- ---------------------------------------------------------------------
-- izin eksekusi
-- Supabase otomatis memberi EXECUTE ke anon & authenticated untuk setiap
-- fungsi baru, jadi fungsi pembantu yang menerima id sekolah WAJIB dicabut
-- dari keduanya (bukan hanya dari public) — kalau tidak, akun sekolah lain
-- bisa mengintip saldo sekolah lain lewat id-nya.
-- ---------------------------------------------------------------------
revoke all on function kas_gerakan(uuid, date, date) from public, anon, authenticated;
revoke all on function kas_saldo_harian(uuid) from public, anon, authenticated;
revoke all on function kas_saldo_per(uuid, date) from public, anon, authenticated;
revoke all on function kas_saldo_terendah(uuid, date) from public, anon, authenticated;
revoke all on function kas_kunci(uuid) from public, anon, authenticated;
revoke all on function kas_sekolah_baca() from public, anon, authenticated;
-- (pembantu dari 0029 yang juga menerima id sekolah)
revoke all on function hak_akses_sekolah(uuid) from public, anon, authenticated;
revoke all on function wajib_langganan_aktif(uuid) from public, anon, authenticated;

revoke all on function kas_catat(text, date, text, bigint, text, text) from public, anon;
revoke all on function kas_batalkan(uuid, text) from public, anon;
revoke all on function kas_atur_saldo_awal(bigint, date) from public, anon;
revoke all on function batalkan_pembayaran(uuid, text) from public, anon;
revoke all on function kas_ringkasan() from public, anon;
revoke all on function kas_laporan_bulan(text) from public, anon;
revoke all on function kas_arus(text, int) from public, anon;
revoke all on function kas_riwayat(date, date, int, int) from public, anon;
revoke all on function kas_saldo_tersedia(date) from public, anon;
grant execute on function kas_catat(text, date, text, bigint, text, text) to authenticated;
grant execute on function kas_batalkan(uuid, text) to authenticated;
grant execute on function kas_atur_saldo_awal(bigint, date) to authenticated;
grant execute on function batalkan_pembayaran(uuid, text) to authenticated;
grant execute on function kas_ringkasan() to authenticated;
grant execute on function kas_laporan_bulan(text) to authenticated;
grant execute on function kas_arus(text, int) to authenticated;
grant execute on function kas_riwayat(date, date, int, int) to authenticated;
grant execute on function kas_saldo_tersedia(date) to authenticated;
