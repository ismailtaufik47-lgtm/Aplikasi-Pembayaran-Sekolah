-- =====================================================================
-- 0025: logo di kuitansi & invoice + perbaikan Tanya AI.
--
--  1. Logo sekolah  (sekolah_ttd.logo)          → kop kuitansi orang tua.
--     Logo penerbit (pengaturan_aplikasi.logo)  → kop invoice & kuitansi sewa.
--  2. Perbaikan Tanya AI:
--     • Kuota dikembalikan kalau layanan AI gagal menjawab (sebelumnya
--       pertanyaan yang gagal tetap memotong kuota harian).
--     • Daftar tunggakan & transaksi tidak lagi terpotong di 100/150 baris
--       (tombol Unduh Excel sekarang berisi daftar lengkap, maks 1000).
--     • "Transaksi sampai tanggal X" tanpa tanggal mulai tidak lagi error.
--  3. sekolah.wa — nomor WhatsApp sekolah/TU. Dipakai tombol WhatsApp di
--     portal orang tua (sebelumnya tombol itu keliru membuka chat ke
--     nomor HP orang tua sendiri).
--
-- Jalankan SETELAH 0024. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- =====================================================================
-- 1. logo
-- =====================================================================
alter table sekolah_ttd         add column if not exists logo text;
alter table pengaturan_aplikasi add column if not exists logo text;
comment on column sekolah_ttd.logo is 'Logo sekolah (data URL PNG/JPEG) untuk kop kuitansi. Diubah lewat simpan_logo_sekolah().';
comment on column pengaturan_aplikasi.logo is 'Logo penerbit untuk kop invoice & kuitansi sewa.';

-- Logo diubah terpisah dari tanda tangan, supaya mengganti logo tidak
-- perlu menyentuh TTD (dan sebaliknya). Khusus kepala sekolah.
create or replace function simpan_logo_sekolah(p_logo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sk uuid := sekolah_saya();
begin
  if v_sk is null then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if (select peran from profil where id = auth.uid()) is distinct from 'kepala' then
    raise exception 'Hanya kepala sekolah yang bisa mengubah logo sekolah.';
  end if;
  perform cek_gambar(p_logo, 'Logo');

  insert into sekolah_ttd as t (sekolah_id, logo, diubah_pada)
  values (v_sk, p_logo, now())
  on conflict (sekolah_id) do update set logo = excluded.logo, diubah_pada = now();
  return jsonb_build_object('ok', true);
end $$;

-- simpan_ttd_sekolah (0024) memakai "on conflict do update" pada kolom
-- tertentu saja, jadi logo yang sudah ada tidak ikut terhapus.

create or replace function data_kuitansi(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'nomor', nomor_dokumen('KW', p.id, p.dibayar_pada),
    'dibayarPada', p.dibayar_pada,
    'jenis', p.jenis,
    'periode', p.periode,
    'keterangan', p.keterangan,
    'nominal', p.nominal,
    'metode', p.metode,
    'petugas', p.petugas,
    -- target & total terbayar untuk item yang sama SAMPAI transaksi ini
    -- (bukan sampai hari ini), supaya kuitansi lama tetap bercerita benar
    'target', case when p.jenis = 'spp' then s.spp_nominal else b.nominal end,
    'terbayarSampaiIni', (
      select coalesce(sum(q.nominal), 0) from pembayaran q
       where q.siswa_id = p.siswa_id and q.jenis = p.jenis
         and q.periode is not distinct from p.periode and q.biaya_id is not distinct from p.biaya_id
         and (q.dibayar_pada, q.id) <= (p.dibayar_pada, p.id)),
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
  left join sekolah_ttd t on t.sekolah_id = p.sekolah_id
  where p.id = p_id
$$;
revoke all on function data_kuitansi(uuid) from public;

create or replace function data_penerbit()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'namaUsaha', a.nama_usaha, 'alamat', a.alamat, 'wa', a.wa, 'email', a.email,
    'rekening', a.rekening, 'namaPenandatangan', a.nama_penandatangan, 'jabatan', a.jabatan,
    'ttd', a.ttd, 'stempel', a.stempel, 'logo', a.logo)
  from pengaturan_aplikasi a where a.id = 1
$$;

create or replace function admin_simpan_pengaturan(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then raise exception 'Khusus admin aplikasi.'; end if;
  if coalesce(trim(p->>'namaUsaha'), '') = '' then raise exception 'Nama usaha belum diisi.'; end if;
  perform cek_gambar(p->>'ttd', 'Tanda tangan');
  perform cek_gambar(p->>'stempel', 'Stempel');
  perform cek_gambar(p->>'logo', 'Logo');
  update pengaturan_aplikasi set
    nama_usaha = trim(p->>'namaUsaha'),
    alamat = nullif(trim(p->>'alamat'), ''),
    wa = nullif(regexp_replace(coalesce(p->>'wa', ''), '[^0-9]', '', 'g'), ''),
    email = nullif(trim(p->>'email'), ''),
    rekening = coalesce(p->'rekening', '[]'::jsonb),
    nama_penandatangan = nullif(trim(p->>'namaPenandatangan'), ''),
    jabatan = coalesce(nullif(trim(p->>'jabatan'), ''), 'Pemilik'),
    ttd = p->>'ttd',
    stempel = p->>'stempel',
    logo = p->>'logo',
    diubah_pada = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 1b. nomor WhatsApp sekolah (untuk portal orang tua)
-- =====================================================================
alter table sekolah add column if not exists wa text;
comment on column sekolah.wa is 'Nomor WhatsApp sekolah / TU yang dihubungi orang tua dari portal. Diisi di Profil sekolah.';

-- =====================================================================
-- 2. Tanya AI
-- =====================================================================

-- Satu baris per pertanyaan yang sedang diproses. Dipakai untuk
-- mengembalikan kuota kalau layanan AI gagal. Tanpa policy → hanya
-- bisa disentuh lewat fungsi.
create table if not exists ai_permintaan (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  tanggal     date not null,
  dibuat_pada timestamptz not null default now()
);
create index if not exists ai_permintaan_sekolah_idx on ai_permintaan (sekolah_id, dibuat_pada);
alter table ai_permintaan enable row level security;

create or replace function ai_mulai(p_batas int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  s        sekolah%rowtype;
  v_peran  text;
  v_hari   date := ai_hari_ini();
  v_kini   int  := ai_indeks_bulan(v_hari);
  v_batas  int;
  v_jumlah int;
  v_awal   int;
  v_kunci  uuid;
begin
  select peran into v_peran from profil where id = auth.uid();
  if coalesce(v_peran, '') not in ('kepala', 'admin') then
    raise exception 'Fitur Tanya AI khusus untuk kepala sekolah dan admin sekolah.';
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

  -- kunci pengembalian kuota kalau layanan AI gagal menjawab (lihat ai_batal_pemakaian)
  delete from ai_permintaan where sekolah_id = v_sk and dibuat_pada < now() - interval '1 day';
  insert into ai_permintaan (sekolah_id, tanggal) values (v_sk, v_hari) returning id into v_kunci;

  v_awal := case when extract(month from v_hari) >= 7 then extract(year from v_hari)::int
                 else extract(year from v_hari)::int - 1 end;

  return jsonb_build_object(
    'nama_sekolah', s.nama,
    'kepala_sekolah', s.kepala_sekolah,
    'penanya', (select nama || ' (' || case peran when 'kepala' then 'kepala sekolah' else 'admin sekolah' end || ')'
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

-- Kembalikan 1 kuota untuk pertanyaan yang gagal dijawab. Kuncinya hanya
-- diketahui Edge Function (tidak pernah dikirim ke browser), berlaku
-- 10 menit dan hanya sekali pakai — jadi tidak bisa dipakai untuk
-- "mengisi ulang" kuota.
create or replace function ai_batal_pemakaian(p_kunci uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r ai_permintaan%rowtype;
begin
  delete from ai_permintaan
   where id = p_kunci and sekolah_id = sekolah_saya() and dibuat_pada > now() - interval '10 minutes'
  returning * into r;
  if not found then return; end if;
  update ai_pemakaian set jumlah = greatest(0, jumlah - 1)
   where sekolah_id = r.sekolah_id and tanggal = r.tanggal;
end $$;

create or replace function ai_daftar_tunggakan(
  p_kelas text default null,
  p_bulan int  default null,
  p_min_bulan int default 0,
  p_termasuk_kegiatan boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    select x.id, x.nama, x.kelas, x.wali, rk.bulan_nunggak, rk.kurang_lalu, rk.kurang_berjalan,
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
     where x.sekolah_id = v_sk and x.aktif
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

-- ---------- hak akses ----------
revoke all on function simpan_logo_sekolah(text)                      from public;
revoke all on function data_penerbit()                                from public;
revoke all on function admin_simpan_pengaturan(jsonb)                 from public;
revoke all on function ai_mulai(int)                                  from public;
revoke all on function ai_batal_pemakaian(uuid)                       from public;
revoke all on function ai_daftar_tunggakan(text, int, int, boolean)   from public;
revoke all on function ai_transaksi(date, date)                       from public;

grant execute on function simpan_logo_sekolah(text)                    to authenticated;
grant execute on function data_penerbit()                              to authenticated;
grant execute on function admin_simpan_pengaturan(jsonb)               to authenticated;
grant execute on function ai_mulai(int)                                to authenticated;
grant execute on function ai_batal_pemakaian(uuid)                     to authenticated;
grant execute on function ai_daftar_tunggakan(text, int, int, boolean) to authenticated;
grant execute on function ai_transaksi(date, date)                     to authenticated;
