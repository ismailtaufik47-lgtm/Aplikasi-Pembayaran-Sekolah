-- =====================================================================
-- 0041 — SPP disimpan bersama TAHUN AJARAN
--
--  Sebelumnya SPP hanya dicatat per bulan (Juli … Juni) tanpa tahun. Mulai
--  1 Juli tahun depan, SPP Juli tahun ini akan terbaca sebagai SPP Juli tahun
--  ajaran baru: siswa tampil "lunas" dan pembayaran baru ditolak.
--
--  Yang berubah:
--   • pembayaran.tahun_ajaran ('2026/2027') — wajib untuk SPP, kosong untuk
--     kegiatan & paket (paket PMB/DU sudah punya tahun ajaran sendiri).
--     Diisi otomatis = tahun ajaran berjalan kalau aplikasi tidak mengirim.
--     Boleh tahun ajaran yang SUDAH LEWAT (bayar tunggakan tahun lalu), tidak
--     boleh tahun ajaran yang belum dimulai.
--   • data lama: tahun ajaran diisi dari tanggal bayarnya.
--   • "sudah lunas" & "melebihi tagihan" dihitung per bulan + tahun ajaran.
--   • pembatalan menyimpan tahun ajaran; kuitansi menampilkannya.
--   • Tanya SAKU menghitung SPP tahun ajaran berjalan saja.
--
--  Aman dijalankan ulang. Jalankan setelah 0040.
-- =====================================================================

alter table pembayaran       add column if not exists tahun_ajaran text;
alter table pembayaran_batal add column if not exists tahun_ajaran text;

-- data lama: tahun ajaran dari tanggal bayar (zona waktu Jakarta)
update pembayaran set tahun_ajaran = tahun_ajaran_berjalan((dibayar_pada at time zone 'Asia/Jakarta')::date)
 where jenis = 'spp' and tahun_ajaran is null;
update pembayaran_batal set tahun_ajaran = tahun_ajaran_berjalan((dibayar_pada at time zone 'Asia/Jakarta')::date)
 where jenis = 'spp' and tahun_ajaran is null;

alter table pembayaran drop constraint if exists pembayaran_spp_tahun_ajaran;
alter table pembayaran add constraint pembayaran_spp_tahun_ajaran check (
  (jenis = 'spp' and tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'
     and split_part(tahun_ajaran, '/', 2)::int = split_part(tahun_ajaran, '/', 1)::int + 1)
  or (jenis <> 'spp' and tahun_ajaran is null));

create index if not exists pembayaran_spp_ta_idx on pembayaran (sekolah_id, tahun_ajaran) where jenis = 'spp';

-- isi / periksa tahun ajaran sebelum pemeriksaan "sudah lunas"
-- (trigger berjalan urut abjad: …cek_milik → cek_tahun → cek_zlunas)
create or replace function pembayaran_cek_tahun() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kini text := tahun_ajaran_berjalan();
begin
  if new.jenis <> 'spp' then
    new.tahun_ajaran := null;
    return new;
  end if;
  new.tahun_ajaran := coalesce(nullif(trim(new.tahun_ajaran), ''), v_kini);
  if new.tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$' then
    raise exception 'Tahun ajaran SPP tidak valid: %', new.tahun_ajaran;
  end if;
  if new.tahun_ajaran > v_kini then
    raise exception 'SPP tahun ajaran % belum bisa dicatat — tahun ajaran berjalan %.', new.tahun_ajaran, v_kini;
  end if;
  return new;
end $$;
drop trigger if exists pembayaran_cek_tahun on pembayaran;
create trigger pembayaran_cek_tahun before insert on pembayaran
  for each row execute function pembayaran_cek_tahun();
revoke all on function pembayaran_cek_tahun() from public, anon, authenticated;

-- "sudah lunas" per bulan + tahun ajaran
CREATE OR REPLACE FUNCTION public.pembayaran_cek_lunas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_target bigint; v_sudah bigint; v_sisa bigint; v_label text;
begin
  if new.jenis = 'spp' then
    select spp_nominal into v_target from sekolah where id = new.sekolah_id;
    v_label := 'SPP ' || coalesce(ai_nama_bulan(new.periode), 'bulan ini')
               || case when new.tahun_ajaran is distinct from tahun_ajaran_berjalan() then ' ' || coalesce(new.tahun_ajaran, '') else '' end;
  elsif new.jenis = 'kegiatan' then
    select nominal, nama into v_target, v_label from biaya where id = new.biaya_id and sekolah_id = new.sekolah_id;
  elsif new.jenis = 'paket' then
    select total, nama into v_target, v_label from paket_biaya where id = new.paket_id and sekolah_id = new.sekolah_id;
  else
    return new;
  end if;
  if coalesce(v_target, 0) <= 0 then return new; end if;

  -- antrekan pencatatan untuk siswa + tagihan yang sama
  perform pg_advisory_xact_lock(hashtextextended('bayar:' || new.siswa_id::text || ':' || new.jenis || ':' || coalesce(new.tahun_ajaran, '') || ':' ||
                                                 coalesce(new.periode::text, new.biaya_id::text, new.paket_id::text, ''), 0));
  select coalesce(sum(nominal), 0) into v_sudah
    from pembayaran
   where siswa_id = new.siswa_id and jenis = new.jenis
     and (case new.jenis when 'spp' then periode = new.periode and tahun_ajaran is not distinct from new.tahun_ajaran
                         when 'kegiatan' then biaya_id = new.biaya_id
                         else paket_id = new.paket_id end);
  v_sisa := v_target - v_sudah;
  if v_sisa <= 0 then
    raise exception '% sudah lunas — pembayaran tidak dicatat.', v_label;
  end if;
  if new.nominal > v_sisa then
    raise exception 'Nominal % melebihi sisa tagihan % (%). Maksimal %.', kas_rp(new.nominal), v_label, kas_rp(v_sisa), kas_rp(v_sisa);
  end if;
  return new;
end $function$;

-- pembatalan ikut menyimpan tahun ajaran
CREATE OR REPLACE FUNCTION public.batalkan_pembayaran(p_id uuid, p_alasan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr profil%rowtype; b pembayaran%rowtype; g kas_pengaturan%rowtype; r record; v_tgl date;
begin
  select * into pr from profil where id = auth.uid() and aktif;
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('batal') then raise exception 'Akun ini tidak punya akses membatalkan transaksi.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 3 then raise exception 'Tuliskan alasan pembatalan.'; end if;
  perform wajib_langganan_aktif(pr.sekolah_id);

  perform kas_kunci(pr.sekolah_id);
  select * into b from pembayaran where id = p_id and sekolah_id = pr.sekolah_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.'; end if;

  insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, tahun_ajaran, biaya_id, paket_id, keterangan, nominal, metode,
                                petugas, dicatat_oleh, dibayar_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
  values (b.id, b.sekolah_id, b.siswa_id, b.jenis, b.periode, b.tahun_ajaran, b.biaya_id, b.paket_id, b.keterangan, b.nominal, b.metode,
          b.petugas, b.dicatat_oleh, b.dibayar_pada, pr.id, pr.nama, left(trim(p_alasan), 200));
  delete from pembayaran where id = b.id;

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
end $function$;

-- kuitansi: total terbayar per bulan + tahun ajaran, tampilkan tahun ajaran
CREATE OR REPLACE FUNCTION public.data_kuitansi(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p.id,
    'nomor', nomor_dokumen('KW', p.id, p.dibayar_pada),
    'dibayarPada', p.dibayar_pada,
    'jenis', p.jenis,
    'periode', p.periode,
    'tahunAjaran', p.tahun_ajaran,
    'keterangan', p.keterangan,
    'nominal', p.nominal,
    'metode', p.metode,
    'petugas', p.petugas,
    'target', case when p.jenis = 'spp' then s.spp_nominal when p.jenis = 'paket' then k.total else b.nominal end,
    'terbayarSampaiIni', (
      select coalesce(sum(q.nominal), 0) from pembayaran q
       where q.siswa_id = p.siswa_id and q.jenis = p.jenis
         and q.periode is not distinct from p.periode and q.tahun_ajaran is not distinct from p.tahun_ajaran and q.biaya_id is not distinct from p.biaya_id
         and q.paket_id is not distinct from p.paket_id
         and (q.dibayar_pada, q.id) <= (p.dibayar_pada, p.id)),
    'paket', case when p.jenis = 'paket' then jsonb_build_object('nama', k.nama, 'jenis', k.jenis, 'rincian', k.rincian) end,
    'siswa', jsonb_build_object('nama', x.nama, 'kelas', x.kelas, 'nis', x.nis, 'wali', x.wali),
    'sekolah', jsonb_build_object('nama', s.nama, 'alamat', s.alamat, 'kepalaSekolah', s.kepala_sekolah, 'logo', t.logo),
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
  left join paket_biaya k on k.id = p.paket_id
  left join sekolah_ttd t on t.sekolah_id = p.sekolah_id
  where p.id = p_id
$function$;
revoke execute on function data_kuitansi(uuid) from public, anon, authenticated;

-- Tanya SAKU: SPP tahun ajaran berjalan saja
CREATE OR REPLACE FUNCTION public.ai_spp_siswa(p_sekolah uuid, p_hari date)
 RETURNS TABLE(siswa_id uuid, periode integer, dibayar bigint, target integer, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with s as (select * from sekolah where id = p_sekolah),
  ctx as (
    select s.spp_nominal as target,
           ai_indeks_bulan(p_hari) as kini,
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
  select x.id, g.i, coalesce(b.total, 0), c.target,
         case
           when coalesce(b.total, 0) >= c.target then 'lunas'
           when coalesce(b.total, 0) > 0         then 'sebagian'
           when g.i < c.kini                     then 'nunggak'
           when g.i = c.kini and c.lewat         then 'belum-bayar'
           else 'menunggu'
         end
    from siswa x
   cross join generate_series(0, 11) as g(i)
   cross join ctx c
    left join bayar b on b.siswa_id = x.id and b.periode = g.i
   where x.sekolah_id = p_sekolah and x.aktif
$function$;

CREATE OR REPLACE FUNCTION public.ai_transaksi(p_dari date DEFAULT NULL::date, p_sampai date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      select p.*, x.nama as nama_siswa, x.kelas, b.nama as nama_kegiatan, k.nama as nama_paket,
             p.dibayar_pada at time zone 'Asia/Jakarta' as waktu
        from pembayaran p
        join siswa x on x.id = p.siswa_id
        left join biaya b on b.id = p.biaya_id
        left join paket_biaya k on k.id = p.paket_id
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
      'pmb_dan_daftar_ulang', (select coalesce(sum(nominal), 0) from t where jenis = 'paket'),
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
                   'jenis', case when t.jenis = 'spp' then 'SPP ' || ai_nama_bulan(t.periode)
                                    || case when t.tahun_ajaran is distinct from tahun_ajaran_berjalan(ai_hari_ini()) then ' ' || coalesce(t.tahun_ajaran, '') else '' end
                                 when t.jenis = 'paket' then coalesce(t.nama_paket, 'PMB/Daftar ulang')
                                 else 'Kegiatan ' || coalesce(t.nama_kegiatan, '') end,
                   'nominal', t.nominal, 'metode', t.metode, 'petugas', nullif(t.petugas, '')) as o
            from t order by t.waktu limit 1000) z), '[]')
    )
  );
end $function$;
