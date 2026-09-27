-- =====================================================================
-- 0023: Tanya AI (khusus kepala sekolah) — fungsi pengambil data.
--
-- Cara kerjanya:
--   Kepala sekolah bertanya bebas → Edge Function "tanya-ai" meneruskan
--   ke AI → AI MEMILIH salah satu fungsi di bawah (tools) → fungsi ini
--   yang MENGHITUNG angkanya di database → AI hanya merangkai kalimat.
--   Jadi AI tidak pernah mengarang angka; semua angka berasal dari sini
--   dengan aturan yang sama dengan aplikasi (lib/format.js):
--     • nunggak     = bulan yang SUDAH LEWAT dan belum lunas
--                     (bulan berjalan TIDAK dihitung nunggak)
--     • belum-bayar = bulan berjalan, sudah lewat jatuh tempo, belum dibayar
--     • menunggu    = belum jatuh tempo / bulan mendatang
--     • jatuh tempo 31 = akhir bulan (30 Sep, 31 Okt, 28/29 Feb)
--
-- Semua fungsi HANYA MEMBACA data sekolah milik akun yang memanggil
-- (sekolah_saya()), jadi data sekolah lain tidak mungkin ikut terbaca.
-- Nomor HP & alamat sengaja TIDAK pernah dikirim ke AI.
--
-- Tanggal "hari ini" memakai WIB (Asia/Jakarta), bukan UTC server.
--
-- Jalankan SETELAH 0022. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- ---------- 0. kuota pemakaian harian per sekolah ----------
create table if not exists ai_pemakaian (
  sekolah_id uuid not null references sekolah(id) on delete cascade,
  tanggal    date not null,
  jumlah     int  not null default 0,
  primary key (sekolah_id, tanggal)
);
comment on table ai_pemakaian is 'Jumlah pertanyaan Tanya AI per sekolah per hari (untuk batas harian). Diisi lewat ai_mulai().';
alter table ai_pemakaian enable row level security;  -- tanpa policy: hanya lewat fungsi

-- =====================================================================
-- 1. utilitas tanggal & perhitungan (internal, tidak dibuka ke klien)
-- =====================================================================

-- Tanggal hari ini (WIB). Setelan 'ai.hari_ini' hanya untuk pengujian lokal.
create or replace function ai_hari_ini() returns date
language sql stable as $$
  select coalesce(nullif(current_setting('ai.hari_ini', true), '')::date,
                  (now() at time zone 'Asia/Jakarta')::date)
$$;

-- Indeks bulan dalam tahun ajaran: Juli = 0 … Juni = 11.
create or replace function ai_indeks_bulan(d date) returns int
language sql immutable as $$
  select case when extract(month from d)::int >= 7
              then extract(month from d)::int - 7
              else extract(month from d)::int + 5 end
$$;

create or replace function ai_nama_bulan(i int) returns text
language sql immutable as $$
  select (array['Juli','Agustus','September','Oktober','November','Desember',
                'Januari','Februari','Maret','April','Mei','Juni'])[i + 1]
$$;

-- Tanggal 1 dari periode ke-i pada tahun ajaran yang memuat tanggal d.
create or replace function ai_awal_periode(i int, d date) returns date
language sql immutable as $$
  select make_date(
    (case when extract(month from d) >= 7 then extract(year from d)::int
          else extract(year from d)::int - 1 end) + (case when i >= 6 then 1 else 0 end),
    ((i + 6) % 12) + 1,
    1)
$$;

-- Tanggal jatuh tempo SPP di bulan yang dimulai pada `awal`
-- (31 = akhir bulan, otomatis menyesuaikan jumlah hari).
create or replace function ai_tgl_jatuh_tempo(jt int, awal date) returns date
language sql immutable as $$
  select awal + (least(coalesce(jt, 10),
                       extract(day from (awal + interval '1 month' - interval '1 day'))::int) - 1)
$$;

-- Sekolah milik pemanggil — wajib ada.
create or replace function ai_sekolah_wajib() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  v := sekolah_saya();
  if v is null then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  return v;
end $$;

-- Status SPP setiap siswa aktif × 12 bulan (cermin statusSpp() di format.js).
-- Catatan: seperti aplikasi, pembayaran dijumlah per periode (0–11).
create or replace function ai_spp_siswa(p_sekolah uuid, p_hari date)
returns table (siswa_id uuid, periode int, dibayar bigint, target int, status text)
language sql stable set search_path = public as $$
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
$$;

-- Kekurangan kegiatan per siswa aktif × jenis kegiatan aktif.
create or replace function ai_kegiatan_siswa(p_sekolah uuid)
returns table (siswa_id uuid, biaya_id uuid, nama text, urutan int, nominal int, dibayar bigint)
language sql stable set search_path = public as $$
  select x.id, b.id, b.nama, b.urutan::int, b.nominal,
         coalesce((select sum(p.nominal) from pembayaran p
                    where p.siswa_id = x.id and p.jenis = 'kegiatan' and p.biaya_id = b.id), 0)::bigint
    from siswa x
    join biaya b on b.sekolah_id = x.sekolah_id and b.aktif
   where x.sekolah_id = p_sekolah and x.aktif
$$;

-- Ringkasan per siswa (cermin bulanTertunggak / sppPerluSekarang / perluDitagihSekarang).
create or replace function ai_ringkas_siswa(p_sekolah uuid, p_hari date)
returns table (siswa_id uuid, bulan_nunggak int, kurang_lalu bigint,
               kurang_berjalan bigint, perlu_ditagih boolean, sudah_bayar_spp bigint)
language sql stable set search_path = public as $$
  with sp as (select * from ai_spp_siswa(p_sekolah, p_hari)),
  ctx as (
    select ai_indeks_bulan(p_hari) as kini,
           p_hari > ai_tgl_jatuh_tempo(s.tanggal_jatuh_tempo, date_trunc('month', p_hari)::date) as lewat
      from sekolah s where s.id = p_sekolah
  )
  select sp.siswa_id,
         count(*) filter (where sp.periode < c.kini and sp.dibayar < sp.target)::int,
         coalesce(sum(greatest(0, sp.target - sp.dibayar)) filter (where sp.periode < c.kini), 0)::bigint,
         coalesce(sum(greatest(0, sp.target - sp.dibayar)) filter (where sp.periode = c.kini and c.lewat), 0)::bigint,
         bool_or(sp.dibayar < sp.target and (sp.periode < c.kini or (sp.periode = c.kini and c.lewat))),
         sum(sp.dibayar)::bigint
    from sp cross join ctx c
   group by sp.siswa_id
$$;

-- Cocokkan nama kelas: persis (tanpa beda huruf besar/kecil) kalau ada, kalau tidak "mengandung".
create or replace function ai_kelas_cocok(p_sekolah uuid, p_kelas text)
returns table (kelas text)
language sql stable set search_path = public as $$
  with semua as (select distinct x.kelas from siswa x where x.sekolah_id = p_sekolah and x.aktif),
  persis as (select k.kelas from semua k where lower(trim(k.kelas)) = lower(trim(p_kelas)))
  select kelas from persis
  union all
  select k.kelas from semua k
   where not exists (select 1 from persis)
     and lower(k.kelas) like '%' || lower(trim(p_kelas)) || '%'
$$;

revoke all on function ai_spp_siswa(uuid, date)      from public;
revoke all on function ai_kegiatan_siswa(uuid)       from public;
revoke all on function ai_ringkas_siswa(uuid, date)  from public;
revoke all on function ai_kelas_cocok(uuid, text)    from public;
revoke all on function ai_sekolah_wajib()            from public;

-- =====================================================================
-- 2. pintu masuk Edge Function: cek peran, langganan, kuota
-- =====================================================================

-- Dipanggil sekali di awal setiap pertanyaan. Menambah hitungan kuota
-- dan mengembalikan konteks sekolah untuk AI. p_batas diisi Edge Function.
create or replace function ai_mulai(p_batas int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  s        sekolah%rowtype;
  v_peran  text;
  v_hari   date := ai_hari_ini();
  v_kini   int  := ai_indeks_bulan(v_hari);
  v_jumlah int;
  v_awal   int;
begin
  select peran into v_peran from profil where id = auth.uid();
  if v_peran is distinct from 'kepala' then
    raise exception 'Fitur Tanya AI khusus untuk akun kepala sekolah.';
  end if;

  select * into s from sekolah where id = v_sk;
  if hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status' = 'kadaluarsa' then
    raise exception 'Masa langganan sedang tidak aktif. Tanya AI bisa dipakai lagi setelah langganan diperpanjang.';
  end if;

  insert into ai_pemakaian as a (sekolah_id, tanggal, jumlah)
  values (v_sk, v_hari, 1)
  on conflict (sekolah_id, tanggal) do update set jumlah = a.jumlah + 1
  returning jumlah into v_jumlah;

  if v_jumlah > p_batas then
    raise exception 'Batas % pertanyaan hari ini sudah tercapai. Tanya AI bisa dipakai lagi besok.', p_batas;
  end if;

  v_awal := case when extract(month from v_hari) >= 7 then extract(year from v_hari)::int
                 else extract(year from v_hari)::int - 1 end;

  return jsonb_build_object(
    'nama_sekolah', s.nama,
    'kepala_sekolah', s.kepala_sekolah,
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
    'kuota', jsonb_build_object('terpakai', v_jumlah, 'batas', p_batas)
  );
end $$;

-- =====================================================================
-- 3. TOOLS — fungsi yang boleh dipilih AI
-- =====================================================================

-- ---------- 3a. rekap satu bulan ----------
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

-- ---------- 3b. daftar siswa yang belum lunas ----------
-- p_bulan diisi   → siapa yang SPP bulan itu belum lunas.
-- p_bulan kosong  → siapa yang perlu ditagih sekarang (tunggakan + bulan
--                   berjalan yang lewat jatuh tempo), bisa disaring
--                   p_min_bulan (minimal N bulan nunggak).
-- p_termasuk_kegiatan → sertakan kekurangan biaya kegiatan.
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
    'ditampilkan', least(100, (select count(*) from baris)),
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
           limit 100
        ) r), '[]')
  ) into v_hasil;

  return v_hasil;
end $$;

-- ---------- 3c. status lengkap satu siswa ----------
create or replace function ai_status_siswa(p_nama text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
     where x.sekolah_id = v_sk and x.aktif
       and not exists (select 1 from unnest(v_kata) w
                        where lower(x.nama || ' ' || coalesce(x.panggilan, '')) not like '%' || w || '%'));
  v_n := cardinality(v_ids);

  return jsonb_build_object(
    'ditemukan', v_n,
    'catatan', case when v_n = 0 then 'Tidak ada siswa aktif dengan nama itu.'
                    when v_n > 5 then 'Terlalu banyak yang cocok, hanya 5 pertama ditampilkan — minta nama lebih lengkap.' end,
    'siswa', coalesce((
      select jsonb_agg(d.o order by d.nama) from (
        select x.nama, jsonb_build_object(
          'nama', x.nama, 'panggilan', x.panggilan, 'kelas', x.kelas,
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
          'transaksi_terakhir', (select jsonb_agg(jsonb_build_object(
                                    'tanggal', to_char(p.dibayar_pada at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                                    'keterangan', p.keterangan, 'nominal', p.nominal, 'metode', p.metode)
                                  order by p.dibayar_pada desc)
                                   from (select * from pembayaran q where q.siswa_id = x.id
                                          order by q.dibayar_pada desc limit 5) p)
        ) as o
          from siswa x where x.id = any (v_ids)
         order by x.nama
         limit 5
      ) d), '[]')
  );
end $$;

-- ---------- 3d. perbandingan antar kelas ----------
create or replace function ai_perbandingan_kelas()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := ai_sekolah_wajib();
  v_hari date := ai_hari_ini();
  v_kini int  := ai_indeks_bulan(v_hari);
begin
  return jsonb_build_object(
    'bulan_berjalan', ai_nama_bulan(v_kini),
    'kelas', coalesce((
      select jsonb_agg(o order by urut desc, kelas) from (
        select x.kelas, sum(r.kurang_lalu + r.kurang_berjalan) as urut,
               jsonb_build_object(
                 'kelas', x.kelas,
                 'jumlah_siswa', count(*),
                 'siswa_perlu_ditagih', count(*) filter (where r.perlu_ditagih),
                 'siswa_aman', count(*) filter (where not r.perlu_ditagih),
                 'total_bulan_nunggak', sum(r.bulan_nunggak),
                 'kurang_spp_rupiah', sum(r.kurang_lalu + r.kurang_berjalan),
                 'lunas_spp_bulan_berjalan', (select count(*) from ai_spp_siswa(v_sk, v_hari) t
                                               join siswa y on y.id = t.siswa_id
                                              where y.kelas = x.kelas and t.periode = v_kini and t.status = 'lunas'),
                 'spp_terkumpul_tahun_ajaran', sum(r.sudah_bayar_spp),
                 'kurang_kegiatan_rupiah', coalesce((select sum(k.nominal - k.dibayar) from ai_kegiatan_siswa(v_sk) k
                                                       join siswa y on y.id = k.siswa_id
                                                      where y.kelas = x.kelas and k.dibayar < k.nominal), 0)
               ) as o
          from siswa x join ai_ringkas_siswa(v_sk, v_hari) r on r.siswa_id = x.id
         where x.sekolah_id = v_sk and x.aktif
         group by x.kelas
      ) z), '[]')
  );
end $$;

-- ---------- 3e. transaksi pembayaran per tanggal ----------
create or replace function ai_transaksi(p_dari date default null, p_sampai date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk     uuid := ai_sekolah_wajib();
  v_dari   date := coalesce(p_dari, ai_hari_ini());
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
      'ditampilkan', least(150, (select count(*) from t)),
      'transaksi', coalesce((select jsonb_agg(o order by w) from (
          select t.waktu as w, jsonb_build_object(
                   'waktu', to_char(t.waktu, 'YYYY-MM-DD HH24:MI'),
                   'siswa', t.nama_siswa, 'kelas', t.kelas,
                   'untuk', t.keterangan,
                   'jenis', case when t.jenis = 'spp' then 'SPP ' || ai_nama_bulan(t.periode) else 'Kegiatan ' || coalesce(t.nama_kegiatan, '') end,
                   'nominal', t.nominal, 'metode', t.metode, 'petugas', nullif(t.petugas, '')) as o
            from t order by t.waktu limit 150) z), '[]')
    )
  );
end $$;

-- ---------- hak akses ----------
revoke all on function ai_mulai(int)                               from public;
revoke all on function ai_rekap_bulan(int)                         from public;
revoke all on function ai_daftar_tunggakan(text, int, int, boolean) from public;
revoke all on function ai_status_siswa(text)                       from public;
revoke all on function ai_perbandingan_kelas()                     from public;
revoke all on function ai_transaksi(date, date)                    from public;

grant execute on function ai_mulai(int)                               to authenticated;
grant execute on function ai_rekap_bulan(int)                         to authenticated;
grant execute on function ai_daftar_tunggakan(text, int, int, boolean) to authenticated;
grant execute on function ai_status_siswa(text)                       to authenticated;
grant execute on function ai_perbandingan_kelas()                     to authenticated;
grant execute on function ai_transaksi(date, date)                    to authenticated;
