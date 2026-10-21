-- =====================================================================
-- 07c — ISI HISTORY KE SEKOLAH SENDIRI (sekolah Kipo) — 2 tahun lalu + tahun lalu
--
--  Untuk mencoba Laporan › Tahunan, Transaksi › tahun lalu, Tagihan › lulus/keluar,
--  portal alumni & Tanya SAKU dengan data bertahun-tahun DI SEKOLAH ASLI ANDA,
--  tanpa menyentuh tahun ajaran berjalan. Bisa dihapus bersih: 07d_hapus_history_sekolah_sendiri.sql
--
--  Yang dibuat (semua lewat aturan aplikasi: cek milik, cek tahun, cek lunas):
--    • siswa history (NIS "RW-0001" dst.) — 2 tahun lalu ±70 siswa, tahun lalu ±60 siswa:
--      KB → A → B, lulus, tinggal kelas, tidak melanjutkan, pindah di tengah tahun, siswa pindahan.
--      Semuanya sudah lulus / keluar sebelum tahun ini (tahun ini tidak disentuh).
--    • tarif SPP per tahun (kalau tahun itu belum ada), 4 kegiatan per tahun, PMB & daftar ulang
--    • ratusan pembayaran: tepat waktu, telat, dicicil, menunggak (alumni & yang keluar masih menunggak)
--    • ±0,5% pembayaran dibatalkan, buku kas 2 tahun (honor, listrik, belanja, BOP, donasi,
--      pengeluaran kegiatan, 1 batal per tahun)
--
--  BUKU KAS: tanggal mulai kas dimundurkan ke 1 Juli 2 tahun lalu, lalu ditambah SATU transaksi
--  "penyesuaian saldo (data uji)" tepat sebelum tanggal mulai kas Anda yang lama — sehingga
--  saldo kas pada tanggal mulai lama SAMA PERSIS dengan saldo awal Anda. Semua saldo & laporan
--  sejak tanggal itu tidak berubah. 07d mengembalikan pengaturan kas seperti semula.
--
--  CARA MENJALANKAN (SQL Editor):
--    BAGIAN 0  ubah angka di baris "PENGATURAN" kalau perlu → Run. Hanya memasang alat &
--              menampilkan rencana + pemeriksaan (belum mengisi apa pun).
--    BAGIAN 1  blok baris CALL saja → Run (±10–30 detik; menyimpan per ±800 pembayaran).
--              Terputus? Jalankan lagi — lanjut dari yang sudah tersimpan.
--    BAGIAN 2  ringkasan + bukti tahun berjalan tidak berubah.
--  Sesudahnya: 08_cek_konsistensi.sql (v_saring = nama sekolah Anda) → harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pengaturan, alat, rencana (belum mengisi apa pun)
-- #####################################################################
create schema if not exists uji_kipo;
revoke all on schema uji_kipo from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema uji_kipo from anon, authenticated'; end if;
end $$;

create table if not exists uji_kipo.atur (id int primary key default 1 check (id = 1), sekolah uuid not null, siswa_2lalu int not null,
                                         siswa_lalu int not null, saldo_awal bigint not null);
-- ======================= PENGATURAN (ubah di sini) =======================
insert into uji_kipo.atur values (1,
  'cfe3bdcd-b5f0-40d9-8e7d-ff968f642c43',   -- sekolah Anda
  70,                                       -- jumlah siswa 2 tahun lalu
  60,                                       -- jumlah siswa tahun lalu
  5000000)                                  -- saldo kas awal 2 tahun lalu (Rp)
on conflict (id) do update set sekolah = excluded.sekolah, siswa_2lalu = excluded.siswa_2lalu,
                               siswa_lalu = excluded.siswa_lalu, saldo_awal = excluded.saldo_awal;
-- =========================================================================

create table if not exists uji_kipo.dibuat (sk uuid, tabel text, kunci text);
create index if not exists dibuat_idx on uji_kipo.dibuat (sk, tabel);
create table if not exists uji_kipo.rencana (
  sk uuid, urut int, id uuid, siswa uuid, jenis text, ta text, periode int, biaya uuid, paket uuid,
  keterangan text, nominal int, metode text, petugas text, dicatat_oleh uuid, tgl timestamptz, primary key (sk, urut));
create table if not exists uji_kipo.cadangan (sk uuid primary key, kas_pengaturan jsonb, saldo_sebelum bigint, dibuat_pada timestamptz default now());
create table if not exists uji_kipo.status (sk uuid primary key, tahap text, pembayaran int, catatan text, mulai timestamptz, selesai timestamptz);
create table if not exists uji_kipo.sidik (sk uuid, saat text, tabel text, baris bigint, md5 text, primary key (sk, saat, tabel));
revoke all on all tables in schema uji_kipo from public;
-- ---------- alat bantu: id tetap, angka acak tetap, tanggal ----------
create or replace function uji_kipo.u(t text) returns uuid language sql immutable as $$ select md5('kasceria-beban-' || t)::uuid $$;
create or replace function uji_kipo.r(t text) returns double precision language sql immutable as $$
  select ('x' || substr(md5('kb-' || t), 1, 8))::bit(32)::bigint / 4294967296.0 $$;
-- tanggal hari ke-d pada bulan ke-i (0 = Juli) tahun ajaran ta
create or replace function uji_kipo.tgl(ta text, i int, d int) returns date language sql immutable as $$
  select make_date(split_part(ta, '/', 1)::int + case when i >= 6 then 1 else 0 end, ((i + 6) % 12) + 1, least(greatest(d, 1), 28)) $$;

-- ---------- mesin pengisi: satu sekolah, 2 tahun lalu + tahun lalu (+ tahun ini) ----------
--  p_n      = jumlah siswa {2 tahun lalu, tahun lalu, tahun ini}; tahun ini 0 = tahun ini tidak disentuh
--  p_kunci  = awalan id tetap (supaya bisa dihapus bersih & aman diulang)
--  p_nis    = awalan NIS siswa yang dibuat
--  p_kas_sampai = transaksi kas dibuat sampai tanggal ini (null = tidak membuat kas)
create or replace function uji_kipo.isi_satu(
  p_sk uuid, p_kunci text, p_n int[], p_nis text, p_spp int,
  p_admin uuid, p_admin_nama text, p_kepala uuid, p_kepala_nama text, p_kas_sampai date
) returns jsonb
language plpgsql as $f$
declare
  kini  text := tahun_ajaran_berjalan();
  tas   text[] := array[ta_geser(tahun_ajaran_berjalan(), -2), ta_geser(tahun_ajaran_berjalan(), -1), tahun_ajaran_berjalan()];
  hari  date := (now() at time zone 'Asia/Jakarta')::date;
  bi    int;
  ymax  int := case when p_n[3] > 0 then 3 else 2 end;
  lv    text[] := array['KB', 'A', 'B'];
  porsi double precision[] := array[.25, .35, .40];
  nd text[] := array['Aisyah','Zidan','Nayla','Rafa','Keisha','Arka','Alya','Fathan','Salsabila','Bima','Kirana','Daffa','Hana','Raka',
                     'Zahra','Gibran','Nadia','Farel','Aira','Kenzo','Shafa','Rayyan','Qiana','Elang','Naura','Athar','Kayla','Abizar',
                     'Medina','Haikal','Syifa','Omar','Lubna','Fikri','Talita','Rasya','Hafsah','Yusuf','Inara','Dzaky','Khalif','Mecca',
                     'Rumaisha','Ghazi','Azka','Nabila','Faiz','Zayn','Alesha','Hamizan'];
  nb text[] := array['Putri','Pratama','Ramadhan','Nur','Maulana','Azzahra','Saputra','Lestari','Hidayat','Permata','Wijaya','Anggraini',
                     'Kurniawan','Rahmawati','Firmansyah','Safitri','Nugraha','Hasanah','Setiawan','Fauziah','Santoso','Amalia'];
  v_y int; v_l int; v_k int; v_n int; nxt int := 0; tg int[]; v_tarif int; v_kelas jsonb; v_t text;
  r record; v_tgl timestamptz; v_hit jsonb;
begin
  bi := case when extract(month from hari) >= 7 then extract(month from hari)::int - 7 else extract(month from hari)::int + 5 end;

  create temp table if not exists g_th (no int, y int, lvl int, kelas text, mulai int, selesai int, akhir text);
  create temp table if not exists g_bayar (siswa uuid, jenis text, ta text, periode int, biaya uuid, paket uuid, nominal int, tgl timestamptz, metode text);
  truncate g_th, g_bayar;

  -- ================= 1. rencana siswa per tahun (kohort KB → A → B → lulus) =================
  for v_y in 1 .. ymax loop
    -- yang lanjut dari tahun sebelumnya
    if v_y > 1 then
      insert into g_th (no, y, lvl, kelas, mulai)
      select g.no, v_y, case when g.akhir = 'naik' then g.lvl + 1 else g.lvl end, null, 0
        from g_th g where g.y = v_y - 1 and g.akhir in ('naik', 'tinggal');
    end if;
    -- siswa baru sampai jumlah target tiap tingkat
    tg := array[round(p_n[v_y] * porsi[1])::int, round(p_n[v_y] * porsi[2])::int, 0];
    tg[3] := p_n[v_y] - tg[1] - tg[2];
    for v_l in 0 .. 2 loop
      select count(*) into v_n from g_th g where g.y = v_y and g.lvl = v_l;
      for v_k in 1 .. greatest(tg[v_l + 1] - v_n, 0) loop
        nxt := nxt + 1;
        insert into g_th (no, y, lvl, mulai) values (nxt, v_y, v_l,
          case when v_y > 1 and uji_kipo.r(p_kunci || nxt || 'mm') < .06
               then least(1 + floor(uji_kipo.r(p_kunci || nxt || 'm') * 4)::int, case when v_y = 3 then greatest(bi, 0) else 11 end) else 0 end);
      end loop;
    end loop;
    -- nama kelas: kelas paralel kalau > 25 anak per tingkat (A1, A2, …)
    update g_th x set kelas = q.kelas
      from (select g.no, lv[g.lvl + 1] || case when count(*) over (partition by g.lvl) > 25
                                               then (1 + (row_number() over (partition by g.lvl order by g.no) - 1)
                                                         % ceil(count(*) over (partition by g.lvl) / 25.0)::int)::text else '' end as kelas
              from g_th g where g.y = v_y) q
     where x.y = v_y and x.no = q.no;
    -- akhir tahun
    if v_y < 3 then
      update g_th x set
        akhir = case
          when x.lvl = 2 then case when uji_kipo.r(p_kunci || x.no || v_y || 'a') < .97 then 'lulus' else 'tinggal' end
          when uji_kipo.r(p_kunci || x.no || v_y || 'a') < .03 then 'pindah'
          when uji_kipo.r(p_kunci || x.no || v_y || 'a') < .07 then 'tidak_lanjut'
          when uji_kipo.r(p_kunci || x.no || v_y || 'a') < .09 then 'tinggal'
          else 'naik' end,
        selesai = case when x.lvl < 2 and uji_kipo.r(p_kunci || x.no || v_y || 'a') < .03
                       then greatest(x.mulai, 2 + floor(uji_kipo.r(p_kunci || x.no || v_y || 's') * 8)::int) end
       where x.y = v_y;
      -- tahun terakhir yang diisi sudah lewat (tahun ini tidak disentuh): yang belum lulus tidak melanjutkan
      if v_y = ymax then
        update g_th x set akhir = 'tidak_lanjut' where x.y = v_y and x.akhir in ('naik', 'tinggal');
      end if;
    else
      -- tahun ini: sebagian kecil pindah di bulan yang sudah lewat
      update g_th x set akhir = 'pindah', selesai = greatest(x.mulai, floor(uji_kipo.r(p_kunci || x.no || 'k') * bi)::int)
       where x.y = 3 and bi >= 1 and uji_kipo.r(p_kunci || x.no || 'kp') < .025
         and x.mulai <= floor(uji_kipo.r(p_kunci || x.no || 'k') * bi)::int;
    end if;
  end loop;

  -- ================= 2. tarif SPP per tahun ajaran (kelas B lebih mahal di sebagian sekolah) =================
  for v_y in 1 .. ymax loop
    v_tarif := p_spp + (v_y - 1) * 10000;
    select coalesce(jsonb_object_agg(z.kelas, v_tarif + case when z.lvl = 2 then 15000 when z.lvl = 0 then -10000 end), '{}'::jsonb)
      into v_kelas
      from (select distinct g.kelas, g.lvl from g_th g where g.y = v_y and g.lvl <> 1 and uji_kipo.r(p_kunci || 'tarif') < .6) z;
    v_t := null;
    insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada, kenaikan_pada)
    values (p_sk, tas[v_y], v_tarif, v_kelas,
            uji_kipo.tgl(tas[v_y], 0, 1)::timestamp at time zone 'Asia/Jakarta',
            case when v_y < 3 then uji_kipo.tgl(tas[v_y], 11, 20)::timestamp at time zone 'Asia/Jakarta' end)
    on conflict (sekolah_id, kode) do nothing
    returning kode into v_t;
    if v_t is not null then insert into uji_kipo.dibuat values (p_sk, 'tahun_ajaran', v_t); end if;
  end loop;

  -- ================= 3. siswa (status akhir langsung), keanggotaan, wali =================
  insert into siswa (id, sekolah_id, nama, panggilan, jenis_kelamin, kelas, nis, wali, hp, guru, avatar, status_siswa, tahun_lulus, dibuat_pada)
  select uji_kipo.u(p_kunci || '-s-' || a.no), p_sk,
         nd[1 + (a.no * 7) % 50] || ' ' || nb[1 + (a.no * 5) % 22], nd[1 + (a.no * 7) % 50],
         case when a.no % 2 = 0 then 'L' else 'P' end, z.kelas,
         p_nis || lpad(a.no::text, 4, '0'),
         (case when a.no % 3 = 0 then 'Bapak ' else 'Ibu ' end) || nb[1 + (a.no + 3) % 22],
         '0813' || lpad(((abs(hashtext(p_kunci)) % 9000) * 1000 + a.no)::text, 8, '0'),
         'Bu Guru ' || z.kelas, a.no % 6,
         case when z.akhir = 'lulus' then 'alumni' when z.akhir in ('pindah', 'tidak_lanjut', 'keluar') then 'keluar' else 'aktif' end,
         case when z.akhir = 'lulus' then tas[z.y] end,
         uji_kipo.tgl(tas[a.y0], a.m0, 1)::timestamp at time zone 'Asia/Jakarta'
    from (select distinct on (g.no) g.no, g.y y0, g.mulai m0 from g_th g order by g.no, g.y) a
    join (select distinct on (g.no) g.* from g_th g order by g.no, g.y desc) z on z.no = a.no;
  insert into uji_kipo.dibuat select p_sk, 'siswa', uji_kipo.u(p_kunci || '-s-' || no)::text from (select distinct no from g_th) d;

  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, selesai, akhir)
  select p_sk, uji_kipo.u(p_kunci || '-s-' || no), tas[y], kelas, mulai, selesai, akhir from g_th
  on conflict (siswa_id, tahun_ajaran) do update set kelas = excluded.kelas, mulai = excluded.mulai, selesai = excluded.selesai, akhir = excluded.akhir;

  insert into wali (id, sekolah_id, nama, hp, token)
  select uji_kipo.u(p_kunci || '-w-' || x.no), p_sk, s.wali, s.hp, md5('kasceria-beban-token-' || p_kunci || '-' || x.no)
    from (select distinct no from g_th) x join siswa s on s.id = uji_kipo.u(p_kunci || '-s-' || x.no);
  insert into wali_siswa (wali_id, siswa_id)
  select uji_kipo.u(p_kunci || '-w-' || no), uji_kipo.u(p_kunci || '-s-' || no) from (select distinct no from g_th) x;
  insert into uji_kipo.dibuat select p_sk, 'wali', uji_kipo.u(p_kunci || '-w-' || no)::text from (select distinct no from g_th) d;

  -- ================= 4. kegiatan & PMB / daftar ulang per tahun =================
  insert into biaya (id, sekolah_id, nama, nominal, urutan, tanggal, tahun_ajaran, emoji)
  select uji_kipo.u(p_kunci || '-b-' || y || '-' || k.no), p_sk, k.nama,
         (round(k.dasar * (1 + (y - 1) * .07) * (p_spp / 150000.0) / 5000) * 5000)::int, 50 + y * 10 + k.no,
         case when k.bln is not null then uji_kipo.tgl(tas[y], k.bln, k.hr) end, tas[y], k.emoji
    from generate_series(1, ymax) y
    cross join (values (1, 'Manasik haji', 150000, 3, 15, '🕋'), (2, 'Outing class', 200000, 7, 20, '🚌'),
                       (3, 'Pentas akhir tahun', 250000, 11, 12, '🎭'), (4, 'Buku & LKS', 180000, null, null, '📚')) k(no, nama, dasar, bln, hr, emoji);
  insert into uji_kipo.dibuat select p_sk, 'biaya', uji_kipo.u(p_kunci || '-b-' || y || '-' || k)::text from generate_series(1, ymax) y, generate_series(1, 4) k;

  for v_y in 1 .. ymax loop
    if exists (select 1 from paket_biaya pb where pb.sekolah_id = p_sk and pb.tahun_ajaran = tas[v_y] and pb.aktif) then
      raise notice 'PMB/daftar ulang % sudah ada di sekolah ini — paket tahun itu dilewati.', tas[v_y];
      continue;
    end if;
    insert into paket_biaya (id, sekolah_id, jenis, tahun_ajaran, nama, rincian, tahap, total)
    select uji_kipo.u(p_kunci || '-pk-' || v.j || '-' || v_y), p_sk, v.j, tas[v_y], case v.j when 'pmb' then 'PMB ' else 'Daftar ulang ' end || tas[v_y],
           case v.j when 'pmb' then '[{"nama":"Formulir","nominal":150000},{"nama":"Uang gedung","nominal":1500000},{"nama":"Seragam","nominal":550000}]'::jsonb
                    else '[{"nama":"Kegiatan setahun","nominal":600000},{"nama":"Buku & alat tulis","nominal":400000}]'::jsonb end,
           jsonb_build_array(
             jsonb_build_object('nama', 'Tahap 1', 'jatuhTempo', uji_kipo.tgl(tas[v_y], 0, 15), 'nominal', case v.j when 'pmb' then 1200000 else 500000 end),
             jsonb_build_object('nama', 'Tahap 2', 'jatuhTempo', uji_kipo.tgl(tas[v_y], 3, 15), 'nominal', case v.j when 'pmb' then 1000000 else 500000 end)),
           case v.j when 'pmb' then 2200000 else 1000000 end
      from (values ('pmb'), ('du')) v(j);
    insert into uji_kipo.dibuat values (p_sk, 'paket_biaya', uji_kipo.u(p_kunci || '-pk-pmb-' || v_y)::text), (p_sk, 'paket_biaya', uji_kipo.u(p_kunci || '-pk-du-' || v_y)::text);
    -- PMB: masuk tahun itu · DU: siswa lama yang lanjut
    insert into paket_siswa (paket_id, siswa_id, sekolah_id)
    select uji_kipo.u(p_kunci || '-pk-' || case when exists (select 1 from g_th q where q.no = g.no and q.y < g.y) or (g.y = 1 and g.lvl > 0)
                                             then 'du' else 'pmb' end || '-' || v_y),
           uji_kipo.u(p_kunci || '-s-' || g.no), p_sk
      from g_th g where g.y = v_y;
  end loop;

  -- ================= 5. rencana pembayaran =================
  -- SPP
  for r in
    select g.no, g.y, tas[g.y] ta, i.i, uji_kipo.u(p_kunci || '-s-' || g.no) sid, g.akhir, g.selesai,
           spp_tarif(p_sk, tas[g.y], g.kelas) target, uji_kipo.r(p_kunci || g.no || 'pola') pola,
           uji_kipo.r(p_kunci || g.no || g.y || 'nunggak') rn
      from g_th g cross join lateral generate_series(g.mulai, coalesce(g.selesai, 11)) i(i)
  loop
    continue when r.target <= 0;
    if r.y < 3 then
      continue when r.akhir = 'pindah' and r.i = r.selesai and r.rn < .5;          -- pindah: bulan terakhir belum
      if r.pola >= .90 and r.i > 11 - (1 + floor(r.rn * 3)) then                     -- penunggak: 1–3 bulan terakhir belum
        -- separuh penunggak melunasi di tahun berikutnya (hanya kalau tahun berikutnya ikut diisi & tanggalnya sudah lewat)
        if r.rn < .5 and r.y + 1 <= ymax and uji_kipo.tgl(tas[r.y + 1], 1 + (r.i % 2), 6) < hari then
          insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
                                      uji_kipo.tgl(tas[r.y + 1], 1 + (r.i % 2), 6) + interval '10 hours', 'Tunai');
        end if;
        continue;
      end if;
      if r.pola < .62 then
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
          uji_kipo.tgl(r.ta, r.i, 3 + (r.pola * 15)::int) + interval '9 hours', case when uji_kipo.r(r.sid::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
      elsif r.pola < .80 then
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
          uji_kipo.tgl(r.ta, least(r.i + 1, 11), case when r.i = 11 then 25 else 12 end) + interval '10 hours', 'Transfer');
      else
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target / 2, uji_kipo.tgl(r.ta, r.i, 5) + interval '9 hours', 'Tunai');
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target - r.target / 2, uji_kipo.tgl(r.ta, r.i, 20) + interval '9 hours', 'Tunai');
      end if;
    else
      continue when r.i > bi;
      if r.pola < .55 then
        continue when r.i = bi and extract(day from hari) < 8;
        v_tgl := uji_kipo.tgl(kini, r.i, 3 + (r.pola * 10)::int) + interval '9 hours';
      elsif r.pola < .75 then
        continue when r.i >= bi;
        v_tgl := uji_kipo.tgl(kini, r.i, 25) + interval '10 hours';
      elsif r.pola < .88 then
        continue when r.i >= bi - 1;
        v_tgl := uji_kipo.tgl(kini, r.i, 15) + interval '10 hours';
      else
        continue when r.i > bi - 1;
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target / 2,
                                    least(uji_kipo.tgl(kini, r.i, 9) + interval '9 hours', now() - interval '3 hours'), 'Tunai');
        continue;
      end if;
      insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target, least(v_tgl, now() - interval '3 hours'),
                                  case when uji_kipo.r(r.sid::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
    end if;
  end loop;

  -- kegiatan (hanya siswa yang ditagih: terdaftar di bulan kegiatannya)
  insert into g_bayar
  select x.sid, 'kegiatan', null, null, x.bid, null,
         case when x.p < .04 then x.nominal / 2 else x.nominal end,
         least(coalesce(x.tanggal - 10, uji_kipo.tgl(x.ta, 1, 10)) + interval '10 hours', now() - interval '3 hours'), case when x.p < .5 then 'Tunai' else 'Transfer' end
    from (
      select uji_kipo.u(p_kunci || '-s-' || g.no) sid, b.id bid, b.nominal, b.tanggal, b.tahun_ajaran ta,
             uji_kipo.r(p_kunci || g.no || b.id::text) p
        from g_th g
        join biaya b on b.sekolah_id = p_sk and b.tahun_ajaran = tas[g.y] and b.id = any (array(select uji_kipo.u(p_kunci || '-b-' || g.y || '-' || kq.k) from generate_series(1, 4) kq(k)))
       where b.tanggal is null or ((extract(month from b.tanggal)::int + 5) % 12) between g.mulai and coalesce(g.selesai, 11)
    ) x
   where least(coalesce(x.tanggal - 10, uji_kipo.tgl(x.ta, 1, 10)) + interval '10 hours', now() - interval '3 hours') >= uji_kipo.tgl(x.ta, 0, 1)
     and x.p < case when x.ta < kini then .985
                    when x.tanggal is not null and x.tanggal < hari then .8 else .4 end;

  -- PMB & daftar ulang: tahun lalu hampir semua lunas; tahun ini tahap 1 sebagian besar, tahap 2 separuh
  insert into g_bayar
  select ps.siswa_id, 'paket', null, null, null, k.id, (t.e ->> 'nominal')::int,
         least((t.e ->> 'jatuhTempo')::date - 5 + interval '11 hours', now() - interval '3 hours'), 'Transfer'
    from paket_siswa ps
    join paket_biaya k on k.id = ps.paket_id and k.id in (select d.kunci::uuid from uji_kipo.dibuat d where d.sk = p_sk and d.tabel = 'paket_biaya')
    cross join lateral jsonb_array_elements(k.tahap) with ordinality t(e, o)
   where k.sekolah_id = p_sk
     and (t.e ->> 'jatuhTempo')::date - 5 <= hari
     and uji_kipo.r(ps.siswa_id::text || k.id || t.o) < case when k.tahun_ajaran < kini then case t.o when 1 then .995 else .97 end
                                                        else case t.o when 1 then .9 else .5 end end;

  -- rencana disimpan dulu; pembayaran dimasukkan bertahap (lihat simpan_bayar) supaya
  -- kunci per-tagihan dari trigger cek lunas tidak menumpuk dalam satu transaksi
  delete from uji_kipo.rencana where sk = p_sk;
  insert into uji_kipo.rencana (sk, urut, id, siswa, jenis, ta, periode, biaya, paket, keterangan, nominal, metode, petugas, dicatat_oleh, tgl)
  select p_sk, q.urut, uji_kipo.u(p_kunci || '-p-' || q.urut), q.siswa, q.jenis, q.ta, q.periode, q.biaya, q.paket,
         case q.jenis when 'spp' then 'SPP bulanan — ' || ta_nama_bulan(q.ta, q.periode)
                      when 'kegiatan' then 'Biaya kegiatan — ' || (select bb.nama || ' ' || bb.tahun_ajaran from biaya bb where bb.id = q.biaya)
                      else (select pb.nama from paket_biaya pb where pb.id = q.paket) end,
         q.nominal, q.metode, p_admin_nama, p_admin, q.tgl
    from (select c.*, row_number() over (order by c.tgl, c.siswa, c.jenis, c.ta, c.periode, c.biaya, c.paket, c.nominal) urut from g_bayar c) q;

  select jsonb_build_object('siswa', (select count(distinct no) from g_th), 'pembayaran', (select count(*) from g_bayar),
                            'keanggotaan', (select count(*) from g_th)) into v_hit;
  return v_hit;
end $f$;

-- ---------- tahap akhir satu sekolah: arsip pembatalan + buku kas ----------
create or replace function uji_kipo.isi_akhir(
  p_sk uuid, p_kunci text, p_n int[], p_jml_bayar int,
  p_admin uuid, p_admin_nama text, p_kepala uuid, p_kepala_nama text, p_kas_sampai date
) returns void
language plpgsql as $f$
declare
  tas   text[] := array[ta_geser(tahun_ajaran_berjalan(), -2), ta_geser(tahun_ajaran_berjalan(), -1), tahun_ajaran_berjalan()];
  hari  date := (now() at time zone 'Asia/Jakarta')::date;
  ymax  int := case when p_n[3] > 0 then 3 else 2 end;
begin
  -- pembatalan (±0,5% — "dobel catat" / "salah pilih siswa"; tercatat di Transaksi › Dibatalkan, tidak dihitung)
  with ins as (
    insert into pembayaran_batal (id, sekolah_id, siswa_id, jenis, periode, tahun_ajaran, biaya_id, paket_id, keterangan, nominal, metode, petugas,
                                  dicatat_oleh, dibayar_pada, dibatalkan_pada, dibatalkan_oleh, dibatalkan_nama, alasan)
    select uji_kipo.u(p_kunci || '-batal-' || p.id), p.sekolah_id, p.siswa_id, p.jenis, p.periode, p.tahun_ajaran, p.biaya_id, p.paket_id,
           p.keterangan, p.nominal, p.metode, p.petugas, p.dicatat_oleh, p.dibayar_pada - interval '5 minutes',
           least(p.dibayar_pada + interval '50 minutes', now() - interval '1 minute'), p_kepala, p_kepala_nama,
           case when uji_kipo.r(p.id::text || 'al') < .6 then 'Dobel catat' else 'Salah pilih siswa' end
      from pembayaran p
     where p.sekolah_id = p_sk and p.id in (select uji_kipo.u(p_kunci || '-p-' || g) from generate_series(1, p_jml_bayar) g)
       and uji_kipo.r(p.id::text || 'batal') < .005
    returning id)
  insert into uji_kipo.dibuat select p_sk, 'pembayaran_batal', id::text from ins;

  -- ================= 6. buku kas =================
  if p_kas_sampai is not null then
    with ins as (
    insert into kas (id, sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota_file, biaya_id, dicatat_oleh, dicatat_nama,
                     dibuat_pada, dibatalkan_pada, dibatalkan_nama, alasan_batal)
    select uji_kipo.u(p_kunci || '-kas-' || d.k), p_sk, d.jenis, d.tgl, d.kat, d.nom, d.ket,
           case when d.nota then array[p_sk::text || '/' || uji_kipo.u(p_kunci || '-nota-' || d.k) || '.jpg'] end,
           d.biaya, p_admin, p_admin_nama, d.tgl + interval '14 hours',
           case when d.batal then d.tgl + interval '1 day' end, case when d.batal then p_kepala_nama end,
           case when d.batal then 'Salah ketik nominal' end
      from (
        -- honor guru & staf (1 guru per ±12 anak) + listrik, tiap bulan
        select 'h' || y || '-' || i k, 'keluar' jenis, uji_kipo.tgl(tas[y], i, 25) tgl, 'Honor guru' kat,
               (ceil(greatest(p_n[y], 1) / 12.0) * (1100000 + y * 100000))::bigint nom,
               'Honor guru & staf ' || ta_nama_bulan(tas[y], i) ket, true nota, null::uuid biaya, false batal
          from generate_series(1, ymax) y, generate_series(0, 11) i
        union all
        select 'l' || y || '-' || i, 'keluar', uji_kipo.tgl(tas[y], i, 6), 'Listrik & air',
               ((150 + ceil(p_n[y] / 2.0) + round(uji_kipo.r(p_kunci || y || i || 'l') * 150)) * 1000)::bigint,
               'Listrik & air ' || ta_nama_bulan(tas[y], i), true, null, false
          from generate_series(1, ymax) y, generate_series(0, 11) i
        union all
        -- belanja kecil 3 per bulan, sebagian tanpa nota; satu per tahun dibatalkan
        select 'j' || y || '-' || i || '-' || j, 'keluar', uji_kipo.tgl(tas[y], i, 3 + j * 7 + (uji_kipo.r(p_kunci || y || i || j) * 5)::int),
               (array['ATK','Konsumsi','Perawatan gedung','Transport','Lain-lain'])[1 + floor(uji_kipo.r(p_kunci || y || i || j || 'k') * 5)::int],
               ((40 + round(uji_kipo.r(p_kunci || y || i || j || 'n') * 260)) * 1000 * (1 + p_n[y] / 150.0))::bigint,
               'Belanja ' || ta_nama_bulan(tas[y], i), uji_kipo.r(p_kunci || y || i || j || 'nota') < .8, null, i = 4 and j = 1
          from generate_series(1, ymax) y, generate_series(0, 11) i, generate_series(1, 3) j
        union all
        -- dana BOP 2× setahun (±Rp300rb per anak per semester)
        select 'bop' || y || '-' || i, 'masuk', uji_kipo.tgl(tas[y], i, 15), 'Dana BOP', (p_n[y] * 300000)::bigint,
               'BOP semester ' || case i when 0 then '1' else '2' end || ' ' || tas[y], false, null, false
          from generate_series(1, ymax) y, (values (1), (7)) v(i)
        union all
        -- donasi sesekali
        select 'don' || y, 'masuk', uji_kipo.tgl(tas[y], 5, 18), 'Donasi', (2000000 + round(uji_kipo.r(p_kunci || y || 'don') * 30) * 100000)::bigint,
               'Donasi wali murid', false, null, false
          from generate_series(1, ymax) y
        union all
        -- pengeluaran kegiatan berlabel (transport 60% + konsumsi 40% dari ±75% tagihan; Outing tahun lalu nombok)
        select 'kg' || bx.id || kk.kat, 'keluar', bx.tanggal - 3, kk.kat,
               greatest(1000, round(bx.nominal * (select count(*) from siswa_tahun g where g.sekolah_id = p_sk and g.tahun_ajaran = bx.tahun_ajaran
                                                    and g.siswa_id in (select d.kunci::uuid from uji_kipo.dibuat d where d.sk = p_sk and d.tabel = 'siswa')
                                                    and ((extract(month from bx.tanggal)::int + 5) % 12) between g.mulai and coalesce(g.selesai, 11))
                                    * case when bx.nama = 'Outing class' and yy.y = 2 then 1.1 else .75 end * kk.porsi / 1000) * 1000)::bigint,
               bx.nama || ' — ' || lower(kk.kat), true, bx.id, false
          from generate_series(1, ymax) yy(y)
          join biaya bx on bx.sekolah_id = p_sk and bx.tanggal is not null and bx.id = any (array(select uji_kipo.u(p_kunci || '-b-' || yy.y || '-' || kq.k) from generate_series(1, 3) kq(k)))
          cross join (values ('Transportasi', .6), ('Konsumsi', .4)) kk(kat, porsi)
      ) d
     where d.tgl <= least(p_kas_sampai, hari) and d.tgl >= uji_kipo.tgl(tas[1], 0, 1)
    returning id)
    insert into uji_kipo.dibuat select p_sk, 'kas', id::text from ins;
  end if;

end $f$;

-- ---------- masukkan rencana pembayaran sedikit demi sedikit (dipanggil dari prosedur) ----------
create or replace function uji_kipo.simpan_bayar(p_sk uuid, p_batas int default 800) returns int
language plpgsql as $f$
declare v_n int;
begin
  with pilih as (
    delete from uji_kipo.rencana r
     where r.sk = p_sk and r.urut < (select min(x.urut) from uji_kipo.rencana x where x.sk = p_sk) + p_batas
    returning r.*)
  insert into pembayaran (id, sekolah_id, siswa_id, jenis, periode, tahun_ajaran, biaya_id, paket_id, keterangan, nominal, metode, petugas, dicatat_oleh, dibayar_pada)
  select c.id, c.sk, c.siswa, c.jenis, c.periode, c.ta, c.biaya, c.paket, c.keterangan, c.nominal, c.metode, c.petugas, c.dicatat_oleh, c.tgl
    from pilih c
   where not exists (select 1 from pembayaran p where p.id = c.id)
   order by c.urut;
  get diagnostics v_n = row_count;
  return v_n;
end $f$;

-- ---------- sidik jari data sekolah (untuk membuktikan "kembali persis seperti semula") ----------
--  p_tanpa_uji = true → baris buatan 07c tidak dihitung (membandingkan data asli saja)
create or replace function uji_kipo.sidik(p_sk uuid, p_tanpa_uji boolean default false)
returns table (tabel text, baris bigint, md5 text) language plpgsql as $$
declare
  t text;
  q text;
  uji_siswa text := format('(select kunci::uuid from uji_kipo.dibuat where sk = %L and tabel = ''siswa'')', p_sk);
  uji text;
begin
  foreach t in array array['siswa','siswa_tahun','tahun_ajaran','pembayaran','pembayaran_batal','biaya','paket_biaya','paket_siswa',
                           'kas','kas_pengaturan','wali','wali_siswa'] loop
    q := case t when 'wali_siswa' then format('select x from wali_siswa x join wali w on w.id = x.wali_id where w.sekolah_id = %L', p_sk)
                else format('select x from %I x where x.sekolah_id = %L', t, p_sk) end;
    if p_tanpa_uji then
      uji := case t
        when 'siswa'            then ' and x.id not in ' || uji_siswa
        when 'siswa_tahun'      then ' and x.siswa_id not in ' || uji_siswa
        when 'pembayaran'       then ' and x.siswa_id not in ' || uji_siswa
        when 'pembayaran_batal' then ' and x.siswa_id not in ' || uji_siswa
        when 'paket_siswa'      then ' and x.siswa_id not in ' || uji_siswa
        when 'wali_siswa'       then ' and x.siswa_id not in ' || uji_siswa
        when 'tahun_ajaran'     then format(' and x.kode not in (select kunci from uji_kipo.dibuat where sk = %L and tabel = ''tahun_ajaran'')', p_sk)
        when 'kas_pengaturan'   then ' and false'   -- sengaja diubah oleh 07c (dikembalikan oleh 07d)
        else format(' and x.id::text not in (select kunci from uji_kipo.dibuat where sk = %L and tabel = %L)', p_sk, t) end;
      q := q || uji;
    end if;
    execute format('select count(*), coalesce(md5(string_agg(z.x::text, ''|'' order by z.x::text)), ''-'') from (%s) z', q) into baris, md5;
    tabel := t;
    return next;
  end loop;
end $$;

-- ---------- pemeriksaan & rencana (tidak mengubah apa pun) ----------
create or replace function uji_kipo.periksa()
returns table (apa text, isi text) language plpgsql as $$
declare a uji_kipo.atur; k sekolah%rowtype; g kas_pengaturan%rowtype; v_kini text := tahun_ajaran_berjalan(); v_st text;
begin
  select * into a from uji_kipo.atur where id = 1;
  select * into k from sekolah where id = a.sekolah;
  if k.id is null then
    return query values ('GAGAL', 'Sekolah ' || a.sekolah || ' tidak ada di database ini.'); return;
  end if;
  select * into g from kas_pengaturan where sekolah_id = k.id;
  select tahap into v_st from uji_kipo.status where sk = k.id;
  return query values
    ('Sekolah', k.nama),
    ('Status pengisian', coalesce(v_st || ' — angka di bawah adalah keadaan SESUDAH diisi; untuk mengulang, jalankan 07d dulu', 'belum diisi')),
    ('Langganan', (hitung_status_langganan(k.trial_mulai, k.langganan_sampai, k.dinonaktifkan_admin) ->> 'status')
                  || case when (hitung_status_langganan(k.trial_mulai, k.langganan_sampai, k.dinonaktifkan_admin) ->> 'status') = 'kadaluarsa'
                          then ' — PERPANJANG DULU: pembayaran ditolak kalau langganan habis' else ' — OK' end),
    ('Akun pencatat', coalesce((select p.nama || ' (' || p.peran || ')' from profil p where p.sekolah_id = k.id and p.aktif
                                 order by (p.peran = 'admin') desc, p.dibuat_pada limit 1), 'TIDAK ADA — buat akun dulu')),
    ('Tahun ajaran berjalan', v_kini || ' — tidak disentuh'),
    ('Data saat ini', (select count(*) from siswa where sekolah_id = k.id) || ' siswa · '
                      || (select count(*) from pembayaran where sekolah_id = k.id) || ' pembayaran · '
                      || (select count(*) from kas where sekolah_id = k.id) || ' transaksi kas'),
    ('Tahun yang akan diisi', ta_geser(v_kini, -2) || ' (' || a.siswa_2lalu || ' siswa) dan ' || ta_geser(v_kini, -1) || ' (' || a.siswa_lalu || ' siswa)'),
    ('Tahun ajaran lama yang sudah ada', coalesce((select string_agg(kode, ', ') from tahun_ajaran where sekolah_id = k.id and kode < v_kini), 'tidak ada')
                                         || ' (tarif yang sudah ada dipakai apa adanya)'),
    ('NIS history', case when exists (select 1 from siswa where sekolah_id = k.id and nis like 'RW-%' and id not in (select kunci::uuid from uji_kipo.dibuat where tabel = 'siswa'))
                         then 'GAGAL — sudah ada NIS berawalan RW- milik siswa asli' else 'RW-0001 … (tidak bentrok)' end),
    ('Buku kas sekarang', case when g.sekolah_id is null then 'belum diisi → akan dibuat mulai 1 Juli ' || split_part(ta_geser(v_kini, -2), '/', 1)
                               else 'mulai ' || g.mulai || ', saldo awal Rp' || g.saldo_awal
                                    || case when g.mulai <= make_date(split_part(ta_geser(v_kini, -2), '/', 1)::int, 7, 1)
                                            then ' → kas history TIDAK dibuat (tanggal mulai kas sudah sebelum 2 tahun lalu)'
                                            else ' → dimundurkan ke 1 Juli ' || split_part(ta_geser(v_kini, -2), '/', 1) || ' + 1 transaksi penyesuaian; saldo sejak ' || g.mulai || ' tetap' end end),
    ('Perkiraan isi', '±' || (a.siswa_2lalu + a.siswa_lalu) * 13 || ' pembayaran, ±' || 2 * 75 || ' transaksi kas — ukuran ±' || round((a.siswa_2lalu + a.siswa_lalu) * 13 * 450 / 1048576.0, 1) || ' MB');
end $$;

-- ---------- pengisian (PROSEDUR: menyimpan bertahap, aman diulang) ----------
create or replace procedure uji_kipo.isi(inout hasil text default null)
language plpgsql as $$
declare
  a     uji_kipo.atur;
  v_sk    uuid;
  v_kunci text;
  v_kini text := tahun_ajaran_berjalan();
  t2    text := ta_geser(tahun_ajaran_berjalan(), -2);
  d_t2  date := make_date(split_part(ta_geser(tahun_ajaran_berjalan(), -2), '/', 1)::int, 7, 1);
  d_kini date := make_date(split_part(tahun_ajaran_berjalan(), '/', 1)::int, 7, 1);
  adm uuid; adm_nama text; kep uuid; kep_nama text; v_spp int;
  v_st  text; v_n int; v_ke int := 0; v_jml int;
  lama  jsonb; m_lama date; s_lama bigint; v_sampai date; v_min bigint; v_awal bigint; v_net bigint; v_selisih bigint;
begin
  select * into a from uji_kipo.atur where id = 1;
  v_sk := a.sekolah;
  v_kunci := 'kipo-' || v_sk;
  if not exists (select 1 from sekolah where id = v_sk) then raise exception 'Sekolah % tidak ada.', v_sk; end if;
  if exists (select 1 from siswa where sekolah_id = v_sk and nis like 'RW-%' and id not in (select d.kunci::uuid from uji_kipo.dibuat d where d.tabel = 'siswa')) then
    raise exception 'DIHENTIKAN: sudah ada siswa asli dengan NIS berawalan RW-.';
  end if;
  select p.id, p.nama into adm, adm_nama from profil p where p.sekolah_id = v_sk and p.aktif order by (p.peran = 'admin') desc, p.dibuat_pada limit 1;
  select p.id, p.nama into kep, kep_nama from profil p where p.sekolah_id = v_sk and p.aktif order by (p.peran = 'kepala') desc, p.dibuat_pada limit 1;
  if adm is null then raise exception 'DIHENTIKAN: sekolah ini belum punya akun staf.'; end if;
  v_spp := greatest(50000, coalesce((select spp_nominal from tahun_ajaran where sekolah_id = v_sk and kode = v_kini),
                                     (select spp_nominal from sekolah where id = v_sk), 150000) - 20000);
  select tahap into v_st from uji_kipo.status where uji_kipo.status.sk = a.sekolah;

  -- 1. potret awal + rencana
  if v_st is null then
    delete from uji_kipo.sidik where uji_kipo.sidik.sk = a.sekolah;
    insert into uji_kipo.sidik select a.sekolah, 'awal', x.* from uji_kipo.sidik(a.sekolah) x;
    insert into uji_kipo.cadangan (sk, kas_pengaturan, saldo_sebelum)
    values (a.sekolah, (select to_jsonb(g) from kas_pengaturan g where g.sekolah_id = a.sekolah),
            case when exists (select 1 from kas_pengaturan g where g.sekolah_id = a.sekolah)
                 then kas_saldo_per(a.sekolah, (now() at time zone 'Asia/Jakarta')::date) end)
    on conflict (sk) do nothing;
    v_jml := (uji_kipo.isi_satu(v_sk, v_kunci, array[a.siswa_2lalu, a.siswa_lalu, 0], 'RW-', v_spp, adm, adm_nama, kep, kep_nama, null) ->> 'pembayaran')::int;
    insert into uji_kipo.status values (a.sekolah, 'bayar', v_jml, null, clock_timestamp(), null);
    commit;
    v_st := 'bayar';
  end if;

  -- 2. pembayaran, bertahap
  if v_st = 'bayar' then
    analyze pembayaran; analyze siswa_tahun; analyze siswa; analyze paket_siswa; analyze biaya;
    loop
      v_n := uji_kipo.simpan_bayar(v_sk, 800);
      commit;
      v_ke := v_ke + 1;
      if v_ke % 4 = 0 then analyze pembayaran; commit; end if;
      exit when v_n = 0 and not exists (select 1 from uji_kipo.rencana r where r.sk = a.sekolah);
    end loop;
    update uji_kipo.status set tahap = 'akhir' where uji_kipo.status.sk = a.sekolah;
    commit;
    v_st := 'akhir';
  end if;

  -- 3. pembatalan + buku kas
  if v_st = 'akhir' then
    select pembayaran into v_jml from uji_kipo.status where uji_kipo.status.sk = a.sekolah;
    select kas_pengaturan into lama from uji_kipo.cadangan where cadangan.sk = a.sekolah;
    m_lama := (lama ->> 'mulai')::date;
    s_lama := (lama ->> 'saldo_awal')::bigint;
    if m_lama is not null and m_lama <= d_t2 then
      -- kas sudah dicatat sejak sebelum 2 tahun lalu: kas history tidak dibuat (supaya saldo Anda tidak berubah)
      perform uji_kipo.isi_akhir(v_sk, v_kunci, array[a.siswa_2lalu, a.siswa_lalu, 0], v_jml, adm, adm_nama, kep, kep_nama, null);
      update uji_kipo.status set catatan = 'kas history dilewati (tanggal mulai kas ' || m_lama || ')' where uji_kipo.status.sk = a.sekolah;
    else
      v_sampai := case when m_lama is null then d_kini - 1 else least(m_lama, d_kini) - 1 end;
      perform uji_kipo.isi_akhir(v_sk, v_kunci, array[a.siswa_2lalu, a.siswa_lalu, 0], v_jml, adm, adm_nama, kep, kep_nama, v_sampai);
      -- tanggal mulai kas dimundurkan
      insert into kas_pengaturan (sekolah_id, saldo_awal, mulai, diubah_oleh, diubah_pada)
      values (v_sk, a.saldo_awal, d_t2, 'Uji history (07c)', now())
      on conflict (sekolah_id) do update set saldo_awal = excluded.saldo_awal, mulai = excluded.mulai,
                                             diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
      -- saldo history tidak boleh minus: kalau sempat minus, saldo awal dinaikkan
      select min(x.saldo) into v_min
        from (select sum(sum(case when g.jenis = 'masuk' then g.nominal else -g.nominal end)) over (order by g.tanggal) as saldo
                from kas_gerakan(v_sk, d_t2, v_sampai) g group by g.tanggal) x;
      v_awal := a.saldo_awal + case when a.saldo_awal + coalesce(v_min, 0) < 0 then ceil((-(a.saldo_awal + v_min) + 1000000) / 1000000.0)::bigint * 1000000 else 0 end;
      update kas_pengaturan set saldo_awal = v_awal where sekolah_id = v_sk;
      -- penyesuaian: saldo pada tanggal mulai lama = saldo awal lama (semua angka sejak itu tetap)
      if m_lama is not null then
        select coalesce(sum(case when g.jenis = 'masuk' then g.nominal else -g.nominal end), 0) into v_net
          from kas_gerakan(v_sk, d_t2, m_lama - 1) g;
        v_selisih := s_lama - (v_awal + v_net);
        if v_selisih <> 0 then
          insert into kas (id, sekolah_id, jenis, tanggal, kategori, nominal, keterangan, dicatat_oleh, dicatat_nama, dibuat_pada)
          values (uji_kipo.u(v_kunci || '-kas-penyesuaian'), v_sk, case when v_selisih > 0 then 'masuk' else 'keluar' end, v_sampai,
                  case when v_selisih > 0 then 'Sumbangan yayasan' else 'Lain-lain' end, abs(v_selisih),
                  'Penyesuaian saldo (data uji history 07c — dihapus oleh 07d)', kep, kep_nama, v_sampai + interval '23 hours');
          insert into uji_kipo.dibuat values (a.sekolah, 'kas', uji_kipo.u(v_kunci || '-kas-penyesuaian')::text);
        end if;
      end if;
    end if;
    update uji_kipo.status set tahap = 'selesai', selesai = clock_timestamp() where uji_kipo.status.sk = a.sekolah;
    commit;
  end if;

  analyze pembayaran; analyze kas; analyze siswa; analyze siswa_tahun;
  hasil := 'SELESAI: ' || (select count(*) from uji_kipo.dibuat d where d.sk = a.sekolah and d.tabel = 'siswa') || ' siswa history · '
           || (select count(*) from pembayaran p where p.sekolah_id = a.sekolah and p.siswa_id in (select d.kunci::uuid from uji_kipo.dibuat d where d.sk = a.sekolah and d.tabel = 'siswa')) || ' pembayaran · '
           || (select count(*) from uji_kipo.dibuat d where d.sk = a.sekolah and d.tabel = 'kas') || ' transaksi kas · '
           || (select count(*) from uji_kipo.dibuat d where d.sk = a.sekolah and d.tabel = 'pembayaran_batal') || ' pembatalan. Lanjut BAGIAN 2.';
end $$;

revoke all on all functions in schema uji_kipo from public;
revoke all on all procedures in schema uji_kipo from public;

select * from uji_kipo.periksa();


-- #####################################################################
-- BAGIAN 1 — isi (blok & jalankan baris CALL ini SAJA)
-- #####################################################################
call uji_kipo.isi();


-- #####################################################################
-- BAGIAN 2 — ringkasan + bukti data asli tidak berubah
-- #####################################################################
with a as (select sekolah sk from uji_kipo.atur where id = 1),
     s as (select x.siswa_id, x.tahun_ajaran from siswa_tahun x, a where x.sekolah_id = a.sk
             and x.siswa_id in (select kunci::uuid from uji_kipo.dibuat d where d.sk = a.sk and d.tabel = 'siswa'))
select 'Siswa history per tahun' as apa, (select string_agg(tahun_ajaran || ': ' || n, ' · ' order by tahun_ajaran)
                                            from (select tahun_ajaran, count(*) n from s group by 1) q) as isi
union all
select 'Status akhir siswa history', (select string_agg(status_siswa || ' ' || n, ' · ') from (select x.status_siswa, count(*) n from siswa x, a
          where x.sekolah_id = a.sk and x.id in (select kunci::uuid from uji_kipo.dibuat d where d.sk = a.sk and d.tabel = 'siswa') group by 1) q)
union all
select 'Pembayaran history (SPP / kegiatan / PMB-DU)', (select string_agg(jenis || ' ' || n, ' · ') from (select p.jenis, count(*) n from pembayaran p, a
          where p.sekolah_id = a.sk and p.siswa_id in (select kunci::uuid from uji_kipo.dibuat d where d.sk = a.sk and d.tabel = 'siswa') group by 1) q)
union all
select 'Alumni / keluar yang masih menunggak', (select count(distinct siswa_id)::text from tunggakan_rinci((select sk from a), null, true) r
          where r.siswa_id in (select kunci::uuid from uji_kipo.dibuat d where d.sk = (select sk from a) and d.tabel = 'siswa'))
union all
select 'Buku kas', (select 'mulai ' || mulai || ', saldo awal Rp' || saldo_awal from kas_pengaturan, a where sekolah_id = a.sk)
                   || coalesce(' · ' || (select catatan from uji_kipo.status, a where uji_kipo.status.sk = a.sk), '')
union all
select 'Data asli (tanpa data uji) dibanding sebelum diisi',
       case when (select bool_and(b.md5 = s.md5) from uji_kipo.sidik b join uji_kipo.sidik((select sk from a), true) s on s.tabel = b.tabel, a
                   where b.sk = a.sk and b.saat = 'awal' and b.tabel <> 'kas_pengaturan')
            then 'SAMA PERSIS — tahun berjalan & semua data asli tidak berubah (kecuali tanggal mulai kas, dikembalikan 07d)'
            else 'BERUBAH: ' || (select string_agg(b.tabel, ', ') from uji_kipo.sidik b join uji_kipo.sidik((select sk from a), true) s on s.tabel = b.tabel, a
                                  where b.sk = a.sk and b.saat = 'awal' and b.md5 <> s.md5 and b.tabel <> 'kas_pengaturan')
                 || ' (wajar kalau Anda mencatat transaksi baru sesudah 07c)' end
union all
select 'Saldo kas hari ini', 'Rp' || kas_saldo_per((select sk from a), (now() at time zone 'Asia/Jakarta')::date)
       || coalesce(' · sebelum diisi Rp' || (select c.saldo_sebelum from uji_kipo.cadangan c, a where c.sk = a.sk)
                   || case when (select c.saldo_sebelum from uji_kipo.cadangan c, a where c.sk = a.sk)
                                = kas_saldo_per((select sk from a), (now() at time zone 'Asia/Jakarta')::date) then ' → SAMA' else ' → BEDA' end,
                   ' · (sebelumnya buku kas belum diisi)')
union all
select 'Portal orang tua alumni (tautan · NIS)', (select '/ortu/' || w.token || ' · ' || x.nis from wali w join wali_siswa ws on ws.wali_id = w.id
          join siswa x on x.id = ws.siswa_id, a where w.sekolah_id = a.sk and x.status_siswa = 'alumni'
           and x.id in (select siswa_id from tunggakan_rinci(a.sk, null, true)) order by x.nis limit 1);
