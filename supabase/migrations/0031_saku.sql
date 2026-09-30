-- =====================================================================
-- 0031 — SAKU (Sahabat Keuangan Sekolah): asisten AI bisa membaca buku kas
--
--   • ai_kas(dari, sampai)   : saldo, pemasukan (SPP/kegiatan/lain), pengeluaran
--                              per kategori, dan daftar transaksi kas satu periode
--   • ai_kas_bulanan(n)      : pemasukan, pengeluaran & saldo akhir per bulan
--   • ai_mulai()             : konteks sekarang ikut membawa ringkasan kas
--
-- Keamanan: hanya akun yang boleh memakai SAKU (fitur "ai") DAN boleh
-- melihat kas / laporan keuangan. Angka diambil dari fungsi buku kas yang
-- sama dengan halaman Kas (0030), jadi SAKU & aplikasi selalu cocok.
--
-- Butuh 0030. Aman dijalankan berulang kali.
-- =====================================================================

create or replace function ai_kas_akses() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := ai_sekolah_wajib();
begin
  if not boleh('ai') then raise exception 'Akun ini tidak punya akses ke SAKU.'; end if;
  if not (boleh('kas', 'lihat') or boleh('lap_keuangan', 'lihat')) then
    raise exception 'Akun ini tidak punya akses melihat kas sekolah.';
  end if;
  return v;
end $$;

/** Buku kas satu periode (default: awal bulan ini s.d. hari ini). */
create or replace function ai_kas(p_dari date default null, p_sampai date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk     uuid := ai_kas_akses();
  v_hari   date := kas_hari_ini();
  v_sampai date := least(coalesce(p_sampai, v_hari), v_hari);
  v_dari   date := coalesce(p_dari, date_trunc('month', coalesce(p_sampai, v_hari))::date);
  g        kas_pengaturan%rowtype;
  ada      boolean;
begin
  if v_dari > v_sampai then raise exception 'Tanggal akhir lebih awal dari tanggal mulai.'; end if;
  if v_sampai - v_dari > 366 then raise exception 'Rentang tanggal maksimal 1 tahun.'; end if;
  select * into g from kas_pengaturan where sekolah_id = v_sk;
  ada := found;

  return (
    with x as (select * from kas_gerakan(v_sk, v_dari, v_sampai)),
    bayar as (select b.jenis, b.nominal from pembayaran b join x on x.sumber = 'bayar' and x.id = b.id),
    daftar as (
      select x.tanggal, x.jenis, x.kategori, x.nominal, x.keterangan, k.dicatat_nama, x.urut
        from x join kas k on k.id = x.id
       where x.sumber = 'kas'
      union all
      select x.tanggal, 'masuk', 'Pembayaran orang tua (' || count(*) || ' transaksi SPP/kegiatan)', sum(x.nominal)::bigint, null, null, max(x.urut)
        from x where x.sumber = 'bayar' group by x.tanggal
    )
    select jsonb_build_object(
      'periode', jsonb_build_object('dari', v_dari, 'sampai', v_sampai),
      'buku_kas', jsonb_build_object(
         'saldo_awal_diisi', ada,
         'saldo_awal', case when ada then g.saldo_awal end,
         'tanggal_mulai_kas', case when ada then g.mulai end,
         'catatan', case
           when not ada then 'Saldo awal kas belum diisi — saldo dihitung dari nol.'
           when v_dari < g.mulai then 'Buku kas dimulai ' || kas_tgl(g.mulai) || '. Transaksi sebelum tanggal itu sudah termasuk saldo awal, jadi tidak dihitung di periode ini.'
         end),
      'saldo_kas_saat_ini', kas_saldo_per(v_sk, v_hari),
      'saldo_awal_periode', kas_saldo_per(v_sk, v_dari - 1),
      'saldo_akhir_periode', kas_saldo_per(v_sk, v_sampai),
      'pemasukan', jsonb_build_object(
         'total', coalesce((select sum(nominal) from x where jenis = 'masuk'), 0),
         'spp', coalesce((select sum(nominal) from bayar where jenis = 'spp'), 0),
         'kegiatan', coalesce((select sum(nominal) from bayar where jenis <> 'spp'), 0),
         'lain', coalesce((select sum(nominal) from x where sumber = 'kas' and jenis = 'masuk'), 0)),
      'pengeluaran', jsonb_build_object(
         'total', coalesce((select sum(nominal) from x where jenis = 'keluar'), 0),
         'jumlah_transaksi', (select count(*) from x where jenis = 'keluar')),
      'selisih_masuk_keluar', coalesce((select sum(case when jenis = 'masuk' then nominal else -nominal end) from x), 0),
      'pemasukan_per_kategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                                           from (select kategori, sum(nominal) n from x where jenis = 'masuk' group by kategori) q), '[]'::jsonb),
      'pengeluaran_per_kategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n, 'jumlah', c) order by n desc)
                                           from (select kategori, sum(nominal) n, count(*) c from x where jenis = 'keluar' group by kategori) q), '[]'::jsonb),
      'dibatalkan_di_periode', (select count(*) from kas k where k.sekolah_id = v_sk and k.dibatalkan_pada is not null
                                  and k.tanggal between v_dari and v_sampai),
      'jumlah_baris', (select count(*) from daftar),
      'transaksi', coalesce((select jsonb_agg(jsonb_build_object(
                     'tanggal', d.tanggal, 'jenis', d.jenis, 'kategori', d.kategori, 'nominal', d.nominal,
                     'keterangan', d.keterangan, 'dicatat_oleh', d.dicatat_nama) order by d.tanggal desc, d.urut desc)
                     from (select * from daftar order by tanggal desc, urut desc limit 500) d), '[]'::jsonb)
    )
  );
end $$;

/** Pemasukan, pengeluaran & saldo akhir per bulan — p_n bulan terakhir (maks 12). */
create or replace function ai_kas_bulanan(p_n int default 6)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := ai_kas_akses();
  v_hari date := kas_hari_ini();
  v_n    int := greatest(1, least(coalesce(p_n, 6), 12));
  v_awal date := (date_trunc('month', v_hari) - make_interval(months => v_n - 1))::date;
begin
  return jsonb_build_object(
    'saldo_kas_saat_ini', kas_saldo_per(v_sk, v_hari),
    'bulan', (
      select jsonb_agg(jsonb_build_object(
               'bulan', (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])[extract(month from s.b)::int]
                        || ' ' || extract(year from s.b)::int,
               'pemasukan', coalesce(a.masuk, 0),
               'pengeluaran', coalesce(a.keluar, 0),
               'selisih', coalesce(a.masuk, 0) - coalesce(a.keluar, 0),
               'saldo_akhir', kas_saldo_per(v_sk, least((s.b + interval '1 month' - interval '1 day')::date, v_hari)))
             order by s.b)
        from generate_series(v_awal, date_trunc('month', v_hari)::date, interval '1 month') s(b)
        left join (select date_trunc('month', x.tanggal)::date b,
                          sum(x.nominal) filter (where x.jenis = 'masuk') masuk,
                          sum(x.nominal) filter (where x.jenis = 'keluar') keluar
                     from kas_gerakan(v_sk, v_awal, v_hari) x group by 1) a on a.b = s.b::date)
  );
end $$;

-- Konteks awal SAKU: + nama asisten + ringkasan kas
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

  -- Ringkasan kas (hanya kalau akun ini boleh melihat kas / laporan keuangan).
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
    'nominal_spp', s.spp_nominal,
    'jatuh_tempo_spp', case when s.tanggal_jatuh_tempo >= 29 then 'akhir bulan'
                            else 'tanggal ' || s.tanggal_jatuh_tempo end,
    'jatuh_tempo_bulan_ini', to_char(ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', v_hari)::date), 'YYYY-MM-DD'),
    'kelas', coalesce((select jsonb_agg(jsonb_build_object('kelas', k.kelas, 'jumlah_siswa', k.n) order by k.kelas)
                         from (select kelas, count(*) n from siswa where sekolah_id = v_sk and aktif group by kelas) k), '[]'),
    'jumlah_siswa_aktif', (select count(*) from siswa where sekolah_id = v_sk and aktif),
    'jenis_kegiatan', coalesce((select jsonb_agg(jsonb_build_object('nama', b.nama, 'nominal', b.nominal) order by b.urutan)
                                  from biaya b where b.sekolah_id = v_sk and b.aktif), '[]'),
    'kas', v_kas,
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', v_batas),
    'kunci_pemakaian', v_kunci
  );
end $$;

revoke all on function ai_kas_akses() from public, anon, authenticated;
revoke all on function ai_kas(date, date) from public, anon;
revoke all on function ai_kas_bulanan(int) from public, anon;
revoke all on function ai_mulai(int) from public, anon;
grant execute on function ai_kas(date, date) to authenticated;
grant execute on function ai_kas_bulanan(int) to authenticated;
grant execute on function ai_mulai(int) to authenticated;
