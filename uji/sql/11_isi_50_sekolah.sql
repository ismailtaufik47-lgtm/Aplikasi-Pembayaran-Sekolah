-- =====================================================================
-- 11 — ISI 50 SEKOLAH SIMULASI (UJI BEBAN) — 2 tahun lalu + tahun lalu + tahun ini
--
--  Boleh di project Supabase yang sekarang (yang juga berisi sekolah demo):
--  skrip ini HANYA membuat & mengisi sekolah bernama "UJI B01 …" s.d. "UJI B50 …"
--  dengan id tetap. Sekolah lain tidak dibaca, tidak diubah.
--
--  Isinya per sekolah (semua lewat aturan aplikasi: cek milik, cek tahun, cek lunas):
--    • siswa per tahun ajaran (siswa_tahun): KB → A → B → lulus, tinggal kelas,
--      tidak melanjutkan, pindah di tengah tahun, siswa pindahan, kelas paralel (A1, A2 …)
--    • tarif SPP per tahun (naik tiap tahun) + tarif khusus per kelas di 60% sekolah
--    • 4 kegiatan per tahun, PMB (siswa baru) & daftar ulang (siswa lama) 2 tahap
--    • pembayaran: tepat waktu, telat, dicicil, menunggak; tunggakan tahun lalu yang
--      dilunasi tahun berikutnya; alumni & siswa pindah yang masih menunggak
--    • ±0,5% pembayaran dibatalkan (arsip pembatalan), buku kas sejak 2 tahun lalu
--      (honor, listrik, belanja, BOP, donasi, pengeluaran kegiatan, 1 batal per tahun)
--    • akun: uji-beban-kepala-01@contoh.test … -50, uji-beban-admin-01@contoh.test … -50
--      PIN 123456 · wali + tautan portal untuk setiap siswa
--
--  Ukuran sekolah: B10, B20, B30, B40, B50 = 300 siswa (terbesar); sisanya bergantian
--  kecil (28–40), sedang (60–110), besar (130–220). Total ±6.000 siswa tahun ini.
--
--  CARA MENJALANKAN (SQL Editor → blok satu BAGIAN → Run, tunggu selesai, lanjut):
--    BAGIAN 0     pasang alat + PERKIRAAN UKURAN (belum mengisi apa pun)    ±2 detik
--    BAGIAN 1–10  satu baris "call …" = isi 5 sekolah                       ±15–90 detik per Run
--                 PENTING: blok/jalankan baris CALL itu SAJA (tanpa baris lain), karena
--                 prosedurnya menyimpan per ±800 pembayaran (COMMIT) supaya Supabase tidak
--                 kehabisan "lock" — trigger cek lunas mengunci tiap tagihan sampai transaksi selesai.
--    BAGIAN 11    analyze + ringkasan + status per sekolah
--  Terputus / timeout? Jalankan lagi BAGIAN yang sama — lanjut dari yang sudah tersimpan.
--  Lanjut: 12_ukur_kecepatan.sql → 08_cek_konsistensi.sql → 13_hapus_50_sekolah.sql
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pasang alat & perkiraan ukuran (jalankan sekali)
-- #####################################################################
create schema if not exists uji_beban;
revoke all on schema uji_beban from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema uji_beban from anon, authenticated'; end if;
end $$;
-- ---------- alat bantu: id tetap, angka acak tetap, tanggal ----------
create or replace function uji_beban.u(t text) returns uuid language sql immutable as $$ select md5('kasceria-beban-' || t)::uuid $$;
create or replace function uji_beban.r(t text) returns double precision language sql immutable as $$
  select ('x' || substr(md5('kb-' || t), 1, 8))::bit(32)::bigint / 4294967296.0 $$;
-- tanggal hari ke-d pada bulan ke-i (0 = Juli) tahun ajaran ta
create or replace function uji_beban.tgl(ta text, i int, d int) returns date language sql immutable as $$
  select make_date(split_part(ta, '/', 1)::int + case when i >= 6 then 1 else 0 end, ((i + 6) % 12) + 1, least(greatest(d, 1), 28)) $$;

-- ---------- mesin pengisi: satu sekolah, 2 tahun lalu + tahun lalu (+ tahun ini) ----------
--  p_n      = jumlah siswa {2 tahun lalu, tahun lalu, tahun ini}; tahun ini 0 = tahun ini tidak disentuh
--  p_kunci  = awalan id tetap (supaya bisa dihapus bersih & aman diulang)
--  p_nis    = awalan NIS siswa yang dibuat
--  p_kas_sampai = transaksi kas dibuat sampai tanggal ini (null = tidak membuat kas)
create or replace function uji_beban.isi_satu(
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
          case when v_y > 1 and uji_beban.r(p_kunci || nxt || 'mm') < .06
               then least(1 + floor(uji_beban.r(p_kunci || nxt || 'm') * 4)::int, case when v_y = 3 then greatest(bi, 0) else 11 end) else 0 end);
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
          when x.lvl = 2 then case when uji_beban.r(p_kunci || x.no || v_y || 'a') < .97 then 'lulus' else 'tinggal' end
          when uji_beban.r(p_kunci || x.no || v_y || 'a') < .03 then 'pindah'
          when uji_beban.r(p_kunci || x.no || v_y || 'a') < .07 then 'tidak_lanjut'
          when uji_beban.r(p_kunci || x.no || v_y || 'a') < .09 then 'tinggal'
          else 'naik' end,
        selesai = case when x.lvl < 2 and uji_beban.r(p_kunci || x.no || v_y || 'a') < .03
                       then greatest(x.mulai, 2 + floor(uji_beban.r(p_kunci || x.no || v_y || 's') * 8)::int) end
       where x.y = v_y;
      -- tahun terakhir yang diisi sudah lewat (tahun ini tidak disentuh): yang belum lulus tidak melanjutkan
      if v_y = ymax then
        update g_th x set akhir = 'tidak_lanjut' where x.y = v_y and x.akhir in ('naik', 'tinggal');
      end if;
    else
      -- tahun ini: sebagian kecil pindah di bulan yang sudah lewat
      update g_th x set akhir = 'pindah', selesai = greatest(x.mulai, floor(uji_beban.r(p_kunci || x.no || 'k') * bi)::int)
       where x.y = 3 and bi >= 1 and uji_beban.r(p_kunci || x.no || 'kp') < .025
         and x.mulai <= floor(uji_beban.r(p_kunci || x.no || 'k') * bi)::int;
    end if;
  end loop;

  -- ================= 2. tarif SPP per tahun ajaran (kelas B lebih mahal di sebagian sekolah) =================
  for v_y in 1 .. ymax loop
    v_tarif := p_spp + (v_y - 1) * 10000;
    select coalesce(jsonb_object_agg(z.kelas, v_tarif + case when z.lvl = 2 then 15000 when z.lvl = 0 then -10000 end), '{}'::jsonb)
      into v_kelas
      from (select distinct g.kelas, g.lvl from g_th g where g.y = v_y and g.lvl <> 1 and uji_beban.r(p_kunci || 'tarif') < .6) z;
    v_t := null;
    insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada, kenaikan_pada)
    values (p_sk, tas[v_y], v_tarif, v_kelas,
            uji_beban.tgl(tas[v_y], 0, 1)::timestamp at time zone 'Asia/Jakarta',
            case when v_y < 3 then uji_beban.tgl(tas[v_y], 11, 20)::timestamp at time zone 'Asia/Jakarta' end)
    on conflict (sekolah_id, kode) do nothing
    returning kode into v_t;
    if v_t is not null then insert into uji_beban.dibuat values (p_sk, 'tahun_ajaran', v_t); end if;
  end loop;

  -- ================= 3. siswa (status akhir langsung), keanggotaan, wali =================
  insert into siswa (id, sekolah_id, nama, panggilan, jenis_kelamin, kelas, nis, wali, hp, guru, avatar, status_siswa, tahun_lulus, dibuat_pada)
  select uji_beban.u(p_kunci || '-s-' || a.no), p_sk,
         nd[1 + (a.no * 7) % 50] || ' ' || nb[1 + (a.no * 5) % 22], nd[1 + (a.no * 7) % 50],
         case when a.no % 2 = 0 then 'L' else 'P' end, z.kelas,
         p_nis || lpad(a.no::text, 4, '0'),
         (case when a.no % 3 = 0 then 'Bapak ' else 'Ibu ' end) || nb[1 + (a.no + 3) % 22],
         '0813' || lpad(((abs(hashtext(p_kunci)) % 9000) * 1000 + a.no)::text, 8, '0'),
         'Bu Guru ' || z.kelas, a.no % 6,
         case when z.akhir = 'lulus' then 'alumni' when z.akhir in ('pindah', 'tidak_lanjut', 'keluar') then 'keluar' else 'aktif' end,
         case when z.akhir = 'lulus' then tas[z.y] end,
         uji_beban.tgl(tas[a.y0], a.m0, 1)::timestamp at time zone 'Asia/Jakarta'
    from (select distinct on (g.no) g.no, g.y y0, g.mulai m0 from g_th g order by g.no, g.y) a
    join (select distinct on (g.no) g.* from g_th g order by g.no, g.y desc) z on z.no = a.no;
  insert into uji_beban.dibuat select p_sk, 'siswa', uji_beban.u(p_kunci || '-s-' || no)::text from (select distinct no from g_th) d;

  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, selesai, akhir)
  select p_sk, uji_beban.u(p_kunci || '-s-' || no), tas[y], kelas, mulai, selesai, akhir from g_th
  on conflict (siswa_id, tahun_ajaran) do update set kelas = excluded.kelas, mulai = excluded.mulai, selesai = excluded.selesai, akhir = excluded.akhir;

  insert into wali (id, sekolah_id, nama, hp, token)
  select uji_beban.u(p_kunci || '-w-' || x.no), p_sk, s.wali, s.hp, md5('kasceria-beban-token-' || p_kunci || '-' || x.no)
    from (select distinct no from g_th) x join siswa s on s.id = uji_beban.u(p_kunci || '-s-' || x.no);
  insert into wali_siswa (wali_id, siswa_id)
  select uji_beban.u(p_kunci || '-w-' || no), uji_beban.u(p_kunci || '-s-' || no) from (select distinct no from g_th) x;
  insert into uji_beban.dibuat select p_sk, 'wali', uji_beban.u(p_kunci || '-w-' || no)::text from (select distinct no from g_th) d;

  -- ================= 4. kegiatan & PMB / daftar ulang per tahun =================
  insert into biaya (id, sekolah_id, nama, nominal, urutan, tanggal, tahun_ajaran, emoji)
  select uji_beban.u(p_kunci || '-b-' || y || '-' || k.no), p_sk, k.nama,
         (round(k.dasar * (1 + (y - 1) * .07) * (p_spp / 150000.0) / 5000) * 5000)::int, 50 + y * 10 + k.no,
         case when k.bln is not null then uji_beban.tgl(tas[y], k.bln, k.hr) end, tas[y], k.emoji
    from generate_series(1, ymax) y
    cross join (values (1, 'Manasik haji', 150000, 3, 15, '🕋'), (2, 'Outing class', 200000, 7, 20, '🚌'),
                       (3, 'Pentas akhir tahun', 250000, 11, 12, '🎭'), (4, 'Buku & LKS', 180000, null, null, '📚')) k(no, nama, dasar, bln, hr, emoji);
  insert into uji_beban.dibuat select p_sk, 'biaya', uji_beban.u(p_kunci || '-b-' || y || '-' || k)::text from generate_series(1, ymax) y, generate_series(1, 4) k;

  for v_y in 1 .. ymax loop
    if exists (select 1 from paket_biaya pb where pb.sekolah_id = p_sk and pb.tahun_ajaran = tas[v_y] and pb.aktif) then
      raise notice 'PMB/daftar ulang % sudah ada di sekolah ini — paket tahun itu dilewati.', tas[v_y];
      continue;
    end if;
    insert into paket_biaya (id, sekolah_id, jenis, tahun_ajaran, nama, rincian, tahap, total)
    select uji_beban.u(p_kunci || '-pk-' || v.j || '-' || v_y), p_sk, v.j, tas[v_y], case v.j when 'pmb' then 'PMB ' else 'Daftar ulang ' end || tas[v_y],
           case v.j when 'pmb' then '[{"nama":"Formulir","nominal":150000},{"nama":"Uang gedung","nominal":1500000},{"nama":"Seragam","nominal":550000}]'::jsonb
                    else '[{"nama":"Kegiatan setahun","nominal":600000},{"nama":"Buku & alat tulis","nominal":400000}]'::jsonb end,
           jsonb_build_array(
             jsonb_build_object('nama', 'Tahap 1', 'jatuhTempo', uji_beban.tgl(tas[v_y], 0, 15), 'nominal', case v.j when 'pmb' then 1200000 else 500000 end),
             jsonb_build_object('nama', 'Tahap 2', 'jatuhTempo', uji_beban.tgl(tas[v_y], 3, 15), 'nominal', case v.j when 'pmb' then 1000000 else 500000 end)),
           case v.j when 'pmb' then 2200000 else 1000000 end
      from (values ('pmb'), ('du')) v(j);
    insert into uji_beban.dibuat values (p_sk, 'paket_biaya', uji_beban.u(p_kunci || '-pk-pmb-' || v_y)::text), (p_sk, 'paket_biaya', uji_beban.u(p_kunci || '-pk-du-' || v_y)::text);
    -- PMB: masuk tahun itu · DU: siswa lama yang lanjut
    insert into paket_siswa (paket_id, siswa_id, sekolah_id)
    select uji_beban.u(p_kunci || '-pk-' || case when exists (select 1 from g_th q where q.no = g.no and q.y < g.y) or (g.y = 1 and g.lvl > 0)
                                             then 'du' else 'pmb' end || '-' || v_y),
           uji_beban.u(p_kunci || '-s-' || g.no), p_sk
      from g_th g where g.y = v_y;
  end loop;

  -- ================= 5. rencana pembayaran =================
  -- SPP
  for r in
    select g.no, g.y, tas[g.y] ta, i.i, uji_beban.u(p_kunci || '-s-' || g.no) sid, g.akhir, g.selesai,
           spp_tarif(p_sk, tas[g.y], g.kelas) target, uji_beban.r(p_kunci || g.no || 'pola') pola,
           uji_beban.r(p_kunci || g.no || g.y || 'nunggak') rn
      from g_th g cross join lateral generate_series(g.mulai, coalesce(g.selesai, 11)) i(i)
  loop
    continue when r.target <= 0;
    if r.y < 3 then
      continue when r.akhir = 'pindah' and r.i = r.selesai and r.rn < .5;          -- pindah: bulan terakhir belum
      if r.pola >= .90 and r.i > 11 - (1 + floor(r.rn * 3)) then                     -- penunggak: 1–3 bulan terakhir belum
        -- separuh penunggak melunasi di tahun berikutnya (hanya kalau tahun berikutnya ikut diisi & tanggalnya sudah lewat)
        if r.rn < .5 and r.y + 1 <= ymax and uji_beban.tgl(tas[r.y + 1], 1 + (r.i % 2), 6) < hari then
          insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
                                      uji_beban.tgl(tas[r.y + 1], 1 + (r.i % 2), 6) + interval '10 hours', 'Tunai');
        end if;
        continue;
      end if;
      if r.pola < .62 then
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
          uji_beban.tgl(r.ta, r.i, 3 + (r.pola * 15)::int) + interval '9 hours', case when uji_beban.r(r.sid::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
      elsif r.pola < .80 then
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target,
          uji_beban.tgl(r.ta, least(r.i + 1, 11), case when r.i = 11 then 25 else 12 end) + interval '10 hours', 'Transfer');
      else
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target / 2, uji_beban.tgl(r.ta, r.i, 5) + interval '9 hours', 'Tunai');
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target - r.target / 2, uji_beban.tgl(r.ta, r.i, 20) + interval '9 hours', 'Tunai');
      end if;
    else
      continue when r.i > bi;
      if r.pola < .55 then
        continue when r.i = bi and extract(day from hari) < 8;
        v_tgl := uji_beban.tgl(kini, r.i, 3 + (r.pola * 10)::int) + interval '9 hours';
      elsif r.pola < .75 then
        continue when r.i >= bi;
        v_tgl := uji_beban.tgl(kini, r.i, 25) + interval '10 hours';
      elsif r.pola < .88 then
        continue when r.i >= bi - 1;
        v_tgl := uji_beban.tgl(kini, r.i, 15) + interval '10 hours';
      else
        continue when r.i > bi - 1;
        insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target / 2,
                                    least(uji_beban.tgl(kini, r.i, 9) + interval '9 hours', now() - interval '3 hours'), 'Tunai');
        continue;
      end if;
      insert into g_bayar values (r.sid, 'spp', r.ta, r.i, null, null, r.target, least(v_tgl, now() - interval '3 hours'),
                                  case when uji_beban.r(r.sid::text || r.ta || r.i) < .6 then 'Tunai' else 'Transfer' end);
    end if;
  end loop;

  -- kegiatan (hanya siswa yang ditagih: terdaftar di bulan kegiatannya)
  insert into g_bayar
  select x.sid, 'kegiatan', null, null, x.bid, null,
         case when x.p < .04 then x.nominal / 2 else x.nominal end,
         least(coalesce(x.tanggal - 10, uji_beban.tgl(x.ta, 1, 10)) + interval '10 hours', now() - interval '3 hours'), case when x.p < .5 then 'Tunai' else 'Transfer' end
    from (
      select uji_beban.u(p_kunci || '-s-' || g.no) sid, b.id bid, b.nominal, b.tanggal, b.tahun_ajaran ta,
             uji_beban.r(p_kunci || g.no || b.id::text) p
        from g_th g
        join biaya b on b.sekolah_id = p_sk and b.tahun_ajaran = tas[g.y] and b.id = any (array(select uji_beban.u(p_kunci || '-b-' || g.y || '-' || kq.k) from generate_series(1, 4) kq(k)))
       where b.tanggal is null or ((extract(month from b.tanggal)::int + 5) % 12) between g.mulai and coalesce(g.selesai, 11)
    ) x
   where least(coalesce(x.tanggal - 10, uji_beban.tgl(x.ta, 1, 10)) + interval '10 hours', now() - interval '3 hours') >= uji_beban.tgl(x.ta, 0, 1)
     and x.p < case when x.ta < kini then .985
                    when x.tanggal is not null and x.tanggal < hari then .8 else .4 end;

  -- PMB & daftar ulang: tahun lalu hampir semua lunas; tahun ini tahap 1 sebagian besar, tahap 2 separuh
  insert into g_bayar
  select ps.siswa_id, 'paket', null, null, null, k.id, (t.e ->> 'nominal')::int,
         least((t.e ->> 'jatuhTempo')::date - 5 + interval '11 hours', now() - interval '3 hours'), 'Transfer'
    from paket_siswa ps
    join paket_biaya k on k.id = ps.paket_id and k.id in (select d.kunci::uuid from uji_beban.dibuat d where d.sk = p_sk and d.tabel = 'paket_biaya')
    cross join lateral jsonb_array_elements(k.tahap) with ordinality t(e, o)
   where k.sekolah_id = p_sk
     and (t.e ->> 'jatuhTempo')::date - 5 <= hari
     and uji_beban.r(ps.siswa_id::text || k.id || t.o) < case when k.tahun_ajaran < kini then case t.o when 1 then .995 else .97 end
                                                        else case t.o when 1 then .9 else .5 end end;

  -- rencana disimpan dulu; pembayaran dimasukkan bertahap (lihat simpan_bayar) supaya
  -- kunci per-tagihan dari trigger cek lunas tidak menumpuk dalam satu transaksi
  delete from uji_beban.rencana where sk = p_sk;
  insert into uji_beban.rencana (sk, urut, id, siswa, jenis, ta, periode, biaya, paket, keterangan, nominal, metode, petugas, dicatat_oleh, tgl)
  select p_sk, q.urut, uji_beban.u(p_kunci || '-p-' || q.urut), q.siswa, q.jenis, q.ta, q.periode, q.biaya, q.paket,
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
create or replace function uji_beban.isi_akhir(
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
    select uji_beban.u(p_kunci || '-batal-' || p.id), p.sekolah_id, p.siswa_id, p.jenis, p.periode, p.tahun_ajaran, p.biaya_id, p.paket_id,
           p.keterangan, p.nominal, p.metode, p.petugas, p.dicatat_oleh, p.dibayar_pada - interval '5 minutes',
           least(p.dibayar_pada + interval '50 minutes', now() - interval '1 minute'), p_kepala, p_kepala_nama,
           case when uji_beban.r(p.id::text || 'al') < .6 then 'Dobel catat' else 'Salah pilih siswa' end
      from pembayaran p
     where p.sekolah_id = p_sk and p.id in (select uji_beban.u(p_kunci || '-p-' || g) from generate_series(1, p_jml_bayar) g)
       and uji_beban.r(p.id::text || 'batal') < .005
    returning id)
  insert into uji_beban.dibuat select p_sk, 'pembayaran_batal', id::text from ins;

  -- ================= 6. buku kas =================
  if p_kas_sampai is not null then
    with ins as (
    insert into kas (id, sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota_file, biaya_id, dicatat_oleh, dicatat_nama,
                     dibuat_pada, dibatalkan_pada, dibatalkan_nama, alasan_batal)
    select uji_beban.u(p_kunci || '-kas-' || d.k), p_sk, d.jenis, d.tgl, d.kat, d.nom, d.ket,
           case when d.nota then array[p_sk::text || '/' || uji_beban.u(p_kunci || '-nota-' || d.k) || '.jpg'] end,
           d.biaya, p_admin, p_admin_nama, d.tgl + interval '14 hours',
           case when d.batal then d.tgl + interval '1 day' end, case when d.batal then p_kepala_nama end,
           case when d.batal then 'Salah ketik nominal' end
      from (
        -- honor guru & staf (1 guru per ±12 anak) + listrik, tiap bulan
        select 'h' || y || '-' || i k, 'keluar' jenis, uji_beban.tgl(tas[y], i, 25) tgl, 'Honor guru' kat,
               (ceil(greatest(p_n[y], 1) / 12.0) * (1100000 + y * 100000))::bigint nom,
               'Honor guru & staf ' || ta_nama_bulan(tas[y], i) ket, true nota, null::uuid biaya, false batal
          from generate_series(1, ymax) y, generate_series(0, 11) i
        union all
        select 'l' || y || '-' || i, 'keluar', uji_beban.tgl(tas[y], i, 6), 'Listrik & air',
               ((150 + ceil(p_n[y] / 2.0) + round(uji_beban.r(p_kunci || y || i || 'l') * 150)) * 1000)::bigint,
               'Listrik & air ' || ta_nama_bulan(tas[y], i), true, null, false
          from generate_series(1, ymax) y, generate_series(0, 11) i
        union all
        -- belanja kecil 3 per bulan, sebagian tanpa nota; satu per tahun dibatalkan
        select 'j' || y || '-' || i || '-' || j, 'keluar', uji_beban.tgl(tas[y], i, 3 + j * 7 + (uji_beban.r(p_kunci || y || i || j) * 5)::int),
               (array['ATK','Konsumsi','Perawatan gedung','Transport','Lain-lain'])[1 + floor(uji_beban.r(p_kunci || y || i || j || 'k') * 5)::int],
               ((40 + round(uji_beban.r(p_kunci || y || i || j || 'n') * 260)) * 1000 * (1 + p_n[y] / 150.0))::bigint,
               'Belanja ' || ta_nama_bulan(tas[y], i), uji_beban.r(p_kunci || y || i || j || 'nota') < .8, null, i = 4 and j = 1
          from generate_series(1, ymax) y, generate_series(0, 11) i, generate_series(1, 3) j
        union all
        -- dana BOP 2× setahun (±Rp300rb per anak per semester)
        select 'bop' || y || '-' || i, 'masuk', uji_beban.tgl(tas[y], i, 15), 'Dana BOP', (p_n[y] * 300000)::bigint,
               'BOP semester ' || case i when 0 then '1' else '2' end || ' ' || tas[y], false, null, false
          from generate_series(1, ymax) y, (values (1), (7)) v(i)
        union all
        -- donasi sesekali
        select 'don' || y, 'masuk', uji_beban.tgl(tas[y], 5, 18), 'Donasi', (2000000 + round(uji_beban.r(p_kunci || y || 'don') * 30) * 100000)::bigint,
               'Donasi wali murid', false, null, false
          from generate_series(1, ymax) y
        union all
        -- pengeluaran kegiatan berlabel (transport 60% + konsumsi 40% dari ±75% tagihan; Outing tahun lalu nombok)
        select 'kg' || bx.id || kk.kat, 'keluar', bx.tanggal - 3, kk.kat,
               greatest(1000, round(bx.nominal * (select count(*) from siswa_tahun g where g.sekolah_id = p_sk and g.tahun_ajaran = bx.tahun_ajaran
                                                    and g.siswa_id in (select d.kunci::uuid from uji_beban.dibuat d where d.sk = p_sk and d.tabel = 'siswa')
                                                    and ((extract(month from bx.tanggal)::int + 5) % 12) between g.mulai and coalesce(g.selesai, 11))
                                    * case when bx.nama = 'Outing class' and yy.y = 2 then 1.1 else .75 end * kk.porsi / 1000) * 1000)::bigint,
               bx.nama || ' — ' || lower(kk.kat), true, bx.id, false
          from generate_series(1, ymax) yy(y)
          join biaya bx on bx.sekolah_id = p_sk and bx.tanggal is not null and bx.id = any (array(select uji_beban.u(p_kunci || '-b-' || yy.y || '-' || kq.k) from generate_series(1, 3) kq(k)))
          cross join (values ('Transportasi', .6), ('Konsumsi', .4)) kk(kat, porsi)
      ) d
     where d.tgl <= least(p_kas_sampai, hari) and d.tgl >= uji_beban.tgl(tas[1], 0, 1)
    returning id)
    insert into uji_beban.dibuat select p_sk, 'kas', id::text from ins;
  end if;

end $f$;

-- ---------- masukkan rencana pembayaran sedikit demi sedikit (dipanggil dari prosedur) ----------
create or replace function uji_beban.simpan_bayar(p_sk uuid, p_batas int default 800) returns int
language plpgsql as $f$
declare v_n int;
begin
  with pilih as (
    delete from uji_beban.rencana r
     where r.sk = p_sk and r.urut < (select min(x.urut) from uji_beban.rencana x where x.sk = p_sk) + p_batas
    returning r.*)
  insert into pembayaran (id, sekolah_id, siswa_id, jenis, periode, tahun_ajaran, biaya_id, paket_id, keterangan, nominal, metode, petugas, dicatat_oleh, dibayar_pada)
  select c.id, c.sk, c.siswa, c.jenis, c.periode, c.ta, c.biaya, c.paket, c.keterangan, c.nominal, c.metode, c.petugas, c.dicatat_oleh, c.tgl
    from pilih c
   where not exists (select 1 from pembayaran p where p.id = c.id)
   order by c.urut;
  get diagnostics v_n = row_count;
  return v_n;
end $f$;

-- tabel kerja (dihapus oleh 13_hapus_50_sekolah.sql)
create table if not exists uji_beban.dibuat (sk uuid, tabel text, kunci text);
create index if not exists dibuat_idx on uji_beban.dibuat (sk, tabel);
create table if not exists uji_beban.rencana (
  sk uuid, urut int, id uuid, siswa uuid, jenis text, ta text, periode int, biaya uuid, paket uuid,
  keterangan text, nominal int, metode text, petugas text, dicatat_oleh uuid, tgl timestamptz, primary key (sk, urut));
create table if not exists uji_beban.status (no int primary key, sk uuid, tahap text, siswa int, pembayaran int, mulai timestamptz, selesai timestamptz);
revoke all on all tables in schema uji_beban from public;

-- ukuran tiap sekolah simulasi (no 1–50) → siswa tahun ini
create or replace function uji_beban.ukuran(p_no int) returns int language sql immutable as $$
  select case when p_no % 10 = 0 then 300
              when p_no % 3 = 1 then 28 + floor(uji_beban.r('uk' || p_no) * 13)::int
              when p_no % 3 = 2 then 60 + floor(uji_beban.r('uk' || p_no) * 51)::int
              else 130 + floor(uji_beban.r('uk' || p_no) * 91)::int end $$;

create or replace function uji_beban.nama_sekolah(p_no int) returns text language sql immutable as $$
  select 'UJI B' || lpad(p_no::text, 2, '0') || ' TK ' ||
         (array['Melati','Mawar','Anggrek','Kenanga','Cempaka','Dahlia','Teratai','Flamboyan','Bougenville','Kamboja'])[1 + p_no % 10] ||
         ' ' || (array['Ceria','Harapan','Bunda','Insan Mulia','Al Hikmah','Nurul Iman','Pelita','Tunas Bangsa','Cahaya','Permata'])[1 + (p_no / 10) % 10] $$;

-- perkiraan isi & ukuran (angka per baris diukur dari uji lokal, termasuk indeks)
create or replace function uji_beban.perkiraan(p_dari int default 1, p_sampai int default 50)
returns table (apa text, jumlah text) language plpgsql as $$
declare v_siswa bigint; v_sistah bigint; v_bayar bigint; v_kas bigint; v_mb numeric; v_db numeric;
begin
  select sum(round(uji_beban.ukuran(g) * 1.8)), sum(round(uji_beban.ukuran(g) * 2.85)),
         sum(round(uji_beban.ukuran(g) * 43)), count(*) * 160
    into v_siswa, v_sistah, v_bayar, v_kas
    from generate_series(p_dari, p_sampai) g where not exists (select 1 from sekolah where id = uji_beban.u('sekolah-' || g));
  v_mb := round(coalesce(v_bayar, 0) * 420 / 1048576.0, 1);
  v_db := round(pg_database_size(current_database()) / 1048576.0, 1);
  return query values
    ('Sekolah yang akan diisi', (select count(*)::text from generate_series(p_dari, p_sampai) g where not exists (select 1 from sekolah where id = uji_beban.u('sekolah-' || g)))),
    ('Siswa tahun ini (semua sekolah UJI B)', (select sum(uji_beban.ukuran(g))::text from generate_series(p_dari, p_sampai) g)),
    ('Perkiraan baris siswa / keanggotaan', coalesce(v_siswa, 0) || ' / ' || coalesce(v_sistah, 0)),
    ('Perkiraan baris pembayaran', coalesce(v_bayar, 0)::text),
    ('Perkiraan transaksi kas', coalesce(v_kas, 0)::text),
    ('Ukuran database sekarang', v_db || ' MB'),
    ('Perkiraan tambahan', v_mb || ' MB'),
    ('Perkiraan sesudah diisi (batas gratis 500 MB)', (v_db + v_mb) || ' MB — ' ||
       case when v_db + v_mb < 400 then 'AMAN' when v_db + v_mb < 480 then 'MEPET — boleh, tapi hapus segera sesudah uji' else 'TERLALU BESAR — jangan diisi semua' end);
end $$;

-- satu sekolah lengkap
create or replace function uji_beban.isi_sekolah(p_no int) returns jsonb language plpgsql as $$
declare
  kode  text := lpad(p_no::text, 2, '0');
  sk    uuid := uji_beban.u('sekolah-' || p_no);
  kep   uuid := uji_beban.u('akun-kepala-' || p_no);
  adm   uuid := uji_beban.u('akun-admin-' || p_no);
  sz    int  := uji_beban.ukuran(p_no);
  v_spp int  := 100000 + floor(uji_beban.r('spp' || p_no) * 7)::int * 25000;
  t2    text := ta_geser(tahun_ajaran_berjalan(), -2);
  hari  date := (now() at time zone 'Asia/Jakarta')::date;
  v_lengkap boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud');
  v_pw  text;
  v_hasil jsonb;
  r record;
begin
  if exists (select 1 from sekolah where id = sk) then
    return jsonb_build_object('sekolah', uji_beban.nama_sekolah(p_no), 'status', 'sudah ada — dilewati');
  end if;
  -- akun login (PIN 123456)
  begin
    v_pw := crypt('123456', gen_salt('bf'));
  exception when others then
    v_pw := extensions.crypt('123456', extensions.gen_salt('bf'));
  end;
  if v_lengkap then
    execute $q$
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, $1, now(),
             '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v.nama), now(), now(), '', '', '', ''
        from (values ($2::uuid, $3, $4), ($5::uuid, $6, $7)) v(id, email, nama)
      on conflict (id) do nothing $q$
      using v_pw, kep, 'uji-beban-kepala-' || kode || '@contoh.test', 'Bu Kepala B' || kode,
                  adm, 'uji-beban-admin-' || kode || '@contoh.test', 'Bu TU B' || kode;
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
      select gen_random_uuid(), u.id, u.id::text, 'email',
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
        from auth.users u
       where u.id in ($1, $2)
         and not exists (select 1 from auth.identities x where x.user_id = u.id and x.provider = 'email') $q$ using kep, adm;
  else
    insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
    values (kep, 'uji-beban-kepala-' || kode || '@contoh.test', jsonb_build_object('full_name', 'Bu Kepala B' || kode), v_pw),
           (adm, 'uji-beban-admin-' || kode || '@contoh.test', jsonb_build_object('full_name', 'Bu TU B' || kode), v_pw)
    on conflict (id) do nothing;
  end if;

  insert into sekolah (id, nama, spp_nominal, tanggal_jatuh_tempo, kepala_sekolah, alamat, wa, langganan_sampai, trial_mulai)
  values (sk, uji_beban.nama_sekolah(p_no), v_spp, (array[5, 10, 10, 15])[1 + p_no % 4], 'Bu Kepala B' || kode,
          'Jl. Uji Beban No. ' || p_no || ', Bandung', '0812000001' || kode, hari + 365, uji_beban.tgl(t2, 0, 1) - 30);
  insert into profil (id, sekolah_id, nama, peran, pin_aktif) values
    (kep, sk, 'Bu Kepala B' || kode, 'kepala', true),
    (adm, sk, 'Bu TU B' || kode, 'admin', true);
  insert into kas_pengaturan (sekolah_id, saldo_awal, mulai, diubah_oleh)
  values (sk, sz * 150000, uji_beban.tgl(t2, 0, 1), 'Bu Kepala B' || kode);

  v_hasil := uji_beban.isi_satu(sk, 'b' || kode, array[round(sz * .9)::int, round(sz * .95)::int, sz], 'UB' || kode || '-', v_spp,
                                adm, 'Bu TU B' || kode, kep, 'Bu Kepala B' || kode, hari);

  insert into uji_beban.status values (p_no, sk, 'bayar', (v_hasil ->> 'siswa')::int, (v_hasil ->> 'pembayaran')::int, clock_timestamp(), null)
  on conflict (no) do update set sk = excluded.sk, tahap = 'bayar', siswa = excluded.siswa, pembayaran = excluded.pembayaran, mulai = excluded.mulai;
  return jsonb_build_object('sekolah', uji_beban.nama_sekolah(p_no), 'status', 'diisi') || v_hasil;
end $$;

-- tahap akhir: pembatalan + kas + saldo tidak pernah minus
create or replace function uji_beban.isi_akhir_sekolah(p_no int) returns void language plpgsql as $$
declare
  kode text := lpad(p_no::text, 2, '0');
  sk   uuid := uji_beban.u('sekolah-' || p_no);
  sz   int  := uji_beban.ukuran(p_no);
  t2   text := ta_geser(tahun_ajaran_berjalan(), -2);
  st   uji_beban.status%rowtype;
  v_min bigint;
begin
  select * into st from uji_beban.status where no = p_no;
  perform uji_beban.isi_akhir(sk, 'b' || kode, array[round(sz * .9)::int, round(sz * .95)::int, sz], st.pembayaran,
                              uji_beban.u('akun-admin-' || p_no), 'Bu TU B' || kode, uji_beban.u('akun-kepala-' || p_no), 'Bu Kepala B' || kode,
                              (now() at time zone 'Asia/Jakarta')::date);
  -- saldo kas tidak boleh pernah minus: kalau ada hari yang minus, yayasan menambah modal di awal
  select min(x.saldo) into v_min
    from (select sz::bigint * 150000 + sum(sum(case when g.jenis = 'masuk' then g.nominal else -g.nominal end)) over (order by g.tanggal) as saldo
            from kas_gerakan(sk, null, null) g group by g.tanggal) x;
  if v_min < 0 then
    insert into kas (id, sekolah_id, jenis, tanggal, kategori, nominal, keterangan, dicatat_oleh, dicatat_nama, dibuat_pada)
    values (uji_beban.u('b' || kode || '-kas-modal'), sk, 'masuk', uji_beban.tgl(t2, 0, 1), 'Sumbangan yayasan',
            (ceil((-v_min + 2000000) / 1000000.0) * 1000000)::bigint, 'Tambahan modal awal tahun',
            uji_beban.u('akun-kepala-' || p_no), 'Bu Kepala B' || kode, uji_beban.tgl(t2, 0, 1) + interval '8 hours');
  end if;
  update uji_beban.status set tahap = 'selesai', selesai = clock_timestamp() where no = p_no;
end $$;

-- isi beberapa sekolah (PROSEDUR: menyimpan per ±800 pembayaran supaya tidak kehabisan
-- "lock" di Supabase; aman diputus & diulang — lanjut dari yang terakhir tersimpan)
create or replace procedure uji_beban.isi(p_dari int, p_sampai int, inout hasil text default null)
language plpgsql as $$
declare g int; v_db numeric; v_n int; v_ke int; t0 timestamptz; v_ket text := ''; v_tahap text;
begin
  for g in p_dari .. least(p_sampai, 50) loop
    t0 := clock_timestamp();
    select tahap into v_tahap from uji_beban.status where no = g;
    if v_tahap = 'selesai' or (v_tahap is null and exists (select 1 from sekolah where id = uji_beban.u('sekolah-' || g))) then
      v_ket := v_ket || 'B' || lpad(g::text, 2, '0') || ' sudah ada · ';
      continue;
    end if;
    v_db := pg_database_size(current_database()) / 1048576.0;
    if v_db > 470 then
      raise exception 'DIHENTIKAN: database sudah % MB (batas gratis 500 MB). Jalankan 13_hapus_50_sekolah.sql atau isi lebih sedikit sekolah.', round(v_db);
    end if;
    if v_tahap is null then
      perform uji_beban.isi_sekolah(g);
      commit;
    end if;
    -- statistik segar → trigger memakai indeks (bukan membaca seluruh tabel tiap baris)
    analyze pembayaran; analyze siswa_tahun; analyze siswa; analyze paket_siswa; analyze biaya;
    v_ke := 0;
    loop
      v_n := uji_beban.simpan_bayar(uji_beban.u('sekolah-' || g), 800);
      commit;
      v_ke := v_ke + 1;
      if v_ke % 4 = 0 then analyze pembayaran; commit; end if;
      exit when v_n = 0 and not exists (select 1 from uji_beban.rencana where sk = uji_beban.u('sekolah-' || g));
    end loop;
    perform uji_beban.isi_akhir_sekolah(g);
    commit;
    v_ket := v_ket || 'B' || lpad(g::text, 2, '0') || ' ' || uji_beban.ukuran(g) || ' siswa '
             || round(extract(epoch from clock_timestamp() - t0)::numeric) || ' dtk · ';
  end loop;
  hasil := 'SELESAI: ' || v_ket || ' (lihat tabel lengkap di BAGIAN 11)';
end $$;

revoke all on all functions in schema uji_beban from public;
revoke all on all procedures in schema uji_beban from public;

-- perkiraan sebelum mengisi (tidak mengubah data)
select * from uji_beban.perkiraan();


-- #####################################################################
-- BAGIAN 1 — sekolah B01–B05
-- #####################################################################
call uji_beban.isi(1, 5);


-- #####################################################################
-- BAGIAN 2 — sekolah B06–B10   (B10 = 300 siswa)
-- #####################################################################
call uji_beban.isi(6, 10);


-- #####################################################################
-- BAGIAN 3 — sekolah B11–B15
-- #####################################################################
call uji_beban.isi(11, 15);


-- #####################################################################
-- BAGIAN 4 — sekolah B16–B20   (B20 = 300 siswa)
-- #####################################################################
call uji_beban.isi(16, 20);


-- #####################################################################
-- BAGIAN 5 — sekolah B21–B25
-- #####################################################################
call uji_beban.isi(21, 25);


-- #####################################################################
-- BAGIAN 6 — sekolah B26–B30   (B30 = 300 siswa)
-- #####################################################################
call uji_beban.isi(26, 30);


-- #####################################################################
-- BAGIAN 7 — sekolah B31–B35
-- #####################################################################
call uji_beban.isi(31, 35);


-- #####################################################################
-- BAGIAN 8 — sekolah B36–B40   (B40 = 300 siswa)
-- #####################################################################
call uji_beban.isi(36, 40);


-- #####################################################################
-- BAGIAN 9 — sekolah B41–B45
-- #####################################################################
call uji_beban.isi(41, 45);


-- #####################################################################
-- BAGIAN 10 — sekolah B46–B50   (B50 = 300 siswa)
-- #####################################################################
call uji_beban.isi(46, 50);


-- #####################################################################
-- BAGIAN 11 — rapikan statistik & ringkasan
-- #####################################################################
analyze sekolah, siswa, siswa_tahun, tahun_ajaran, pembayaran, pembayaran_batal, biaya, paket_biaya, paket_siswa, kas, kas_pengaturan, wali, wali_siswa;

-- per sekolah (kalau editor hanya menampilkan tabel terakhir, blok baris ini saja untuk melihatnya):
-- tahap 'selesai' = lengkap; 'bayar' = terputus saat menyimpan pembayaran → jalankan lagi BAGIAN-nya
select s.no, uji_beban.nama_sekolah(s.no) as sekolah, uji_beban.ukuran(s.no) as siswa_tahun_ini, s.tahap,
       (select count(*) from pembayaran p where p.sekolah_id = s.sk) as pembayaran,
       (select count(*) from kas k where k.sekolah_id = s.sk) as kas,
       round(extract(epoch from s.selesai - s.mulai)::numeric) as detik
  from uji_beban.status s order by s.no;

-- ringkasan (tabel terakhir)
select 'Sekolah UJI B terisi' as apa, count(*)::text || ' (selesai lengkap: ' || (select count(*) from uji_beban.status where tahap = 'selesai') || ' — harus 50; kurang? jalankan lagi BAGIAN-nya)' as isi from sekolah where nama like 'UJI B__ TK %'
union all select 'Siswa (semua status)', count(*)::text from siswa where sekolah_id in (select id from sekolah where nama like 'UJI B__ TK %')
union all select 'Keanggotaan per tahun', count(*)::text from siswa_tahun where sekolah_id in (select id from sekolah where nama like 'UJI B__ TK %')
union all select 'Pembayaran', count(*)::text from pembayaran where sekolah_id in (select id from sekolah where nama like 'UJI B__ TK %')
union all select 'Pembayaran dibatalkan', count(*)::text from pembayaran_batal where sekolah_id in (select id from sekolah where nama like 'UJI B__ TK %')
union all select 'Transaksi kas', count(*)::text from kas where sekolah_id in (select id from sekolah where nama like 'UJI B__ TK %')
union all select 'Ukuran database sekarang', pg_size_pretty(pg_database_size(current_database()))
union all select 'Login', 'uji-beban-kepala-01@contoh.test … -50 / uji-beban-admin-01@contoh.test … -50 — PIN 123456'
union all select 'Sekolah terbesar (300 siswa)', 'B10, B20, B30, B40, B50';

