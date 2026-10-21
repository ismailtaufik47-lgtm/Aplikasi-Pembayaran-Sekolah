-- =====================================================================
-- 06 — Uji data tahun lama & tunggakan siswa lulus / keluar (0044)
--  Butuh data dari 01_isi_data_uji.sql (sekolah "UJI 005" & "UJI 006"),
--  serta 0042, 0043, 0044 sudah dijalankan.
--  Membuat data tahun ajaran LALU sementara (4 siswa, 1 kegiatan, pembayaran),
--  lalu memeriksa: data yang ditarik saat aplikasi dibuka, ringkasan tunggakan
--  tahun lalu, tunggakan siswa lulus/keluar, portal orang tua, riwayat transaksi
--  per tanggal, Tanya SAKU, dan isolasi antar sekolah.
--  SEMUA di-ROLLBACK di akhir — data tidak berubah, aman diulang.
--  Hasil benar (tabel di bawah editor): "LULUS — 10 kelompok uji tahun lama".
--  Kalau ada yang salah, editor berhenti dengan pesan merah "GAGAL <nomor> …".
-- =====================================================================
begin;
create or replace function pragma_gagal(p text) returns void language plpgsql as $f$ begin raise exception 'GAGAL %', p; end $f$;

do $$
declare
  sk uuid; sk2 uuid; adm uuid; kep uuid; adm2 uuid; spp int;
  ta text := tahun_ajaran_berjalan(); ta0 text := ta_geser(tahun_ajaran_berjalan(), -1);
  y0 int := split_part(ta_geser(tahun_ajaran_berjalan(), -1), '/', 1)::int;
  sa uuid; sb uuid; sc uuid; sl uuid; bl uuid; wl uuid; tok text; v jsonb; n int; m bigint; i int;
  ids uuid[]; v_bln int;
begin
  select id, spp_nominal into sk, spp from sekolah where nama like 'UJI 005 %';
  select id into sk2 from sekolah where nama like 'UJI 006 %';
  select id into adm from profil where sekolah_id = sk and peran = 'admin';
  select id into kep from profil where sekolah_id = sk and peran = 'kepala';
  select id into adm2 from profil where sekolah_id = sk2 and peran = 'admin';
  if sk is null or sk2 is null or adm is null or kep is null then perform pragma_gagal('0 data uji UJI 005/006 belum ada — jalankan 01 dulu'); end if;
  if exists (select 1 from siswa_tahun where sekolah_id = sk and tahun_ajaran = ta0) then
    perform pragma_gagal('0 sekolah UJI 005 sudah punya data ' || ta0 || ' — uji ini butuh tahun lalu yang kosong');
  end if;
  spp := spp_tarif(sk, ta, null);
  v_bln := bulan_jatuh_tempo(sk);

  -- ---------- data tahun lalu (dibuat sebagai pemilik database, ikut di-rollback) ----------
  select array_agg(id order by nis) into ids from (select id, nis from siswa where sekolah_id = sk and aktif order by nis limit 3) q;
  sa := ids[1]; sb := ids[2]; sc := ids[3];
  insert into tahun_ajaran (sekolah_id, kode, spp_nominal, spp_kelas, dibuka_pada, kenaikan_pada)
  values (sk, ta0, spp, '{}'::jsonb, now(), now()) on conflict (sekolah_id, kode) do nothing;
  insert into siswa (sekolah_id, nama, kelas, nis, jenis_kelamin) values (sk, 'Uji Alumni Lama', 'B', 'UJI44-1', 'P') returning id into sl;
  update siswa set status_siswa = 'alumni', tahun_lulus = ta0 where id = sl;
  delete from siswa_tahun where siswa_id = sl;
  insert into siswa_tahun (sekolah_id, siswa_id, tahun_ajaran, kelas, mulai, selesai, akhir) values
    (sk, sa, ta0, 'A', 0, null, 'naik'),
    (sk, sb, ta0, 'A', 6, null, 'naik'),   -- masuk Januari
    (sk, sc, ta0, 'A', 0, null, 'naik'),
    (sk, sl, ta0, 'B', 0, null, 'lulus');
  insert into biaya (sekolah_id, nama, nominal, tanggal, tahun_ajaran) values (sk, 'Uji Pentas Lama', 50000, make_date(y0, 8, 20), ta0) returning id into bl;
  -- sa: lunas semua; sb: Jan–Mei lunas, Juni dicicil 1.000 (dibayar TAHUN INI); sc: Juli lunas + kegiatan dicicil;
  -- sl (alumni): Juli–Mei lunas, Juni & kegiatan belum
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, dibayar_pada)
  select sk, sa, 'spp', g, ta0, 'uji lama', spp, make_date(y0, 7, 5) + g * 30 from generate_series(0, 11) g
  union all select sk, sb, 'spp', g, ta0, 'uji lama', spp, make_date(y0, 7, 5) + g * 30 from generate_series(6, 10) g
  union all select sk, sc, 'spp', 0, ta0, 'uji lama', spp, make_date(y0, 7, 5)
  union all select sk, sl, 'spp', g, ta0, 'uji lama', spp, make_date(y0, 7, 5) + g * 30 from generate_series(0, 10) g;
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal)
  values (sk, sb, 'spp', 11, ta0, 'uji cicil tahun ini', 1000);
  insert into pembayaran (sekolah_id, siswa_id, jenis, biaya_id, keterangan, nominal, dibayar_pada) values
    (sk, sa, 'kegiatan', bl, 'uji lama', 50000, make_date(y0, 8, 10)),
    (sk, sc, 'kegiatan', bl, 'uji lama', 10000, make_date(y0, 8, 10));
  insert into wali (sekolah_id, nama) values (sk, 'Uji Wali Alumni') returning id, token into wl, tok;
  insert into wali_siswa (wali_id, siswa_id) values (wl, sl);

  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, false);
  execute 'set role authenticated';

  -- 1. ringkasan tunggakan tahun lalu (siswa aktif)
  v := ringkasan_tunggakan_lalu();
  if exists (select 1 from jsonb_array_elements(v -> 'spp') e where (e ->> 0)::uuid in (sa, sl)) then perform pragma_gagal('1a siswa lunas / alumni ikut ringkasan'); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'spp') e where (e ->> 0)::uuid = sb and e ->> 1 = ta0 and (e ->> 2)::int = 11 and (e ->> 3)::int = 1000) then
    perform pragma_gagal('1b cicilan Juni sb'); end if;
  if exists (select 1 from jsonb_array_elements(v -> 'spp') e where (e ->> 0)::uuid = sb and (e ->> 2)::int < 6) then perform pragma_gagal('1c bulan sebelum masuk ikut ditagih'); end if;
  select count(*) into n from jsonb_array_elements(v -> 'spp') e where (e ->> 0)::uuid = sc;
  if n <> 11 then perform pragma_gagal('1d sc harus 11 bulan, dapat ' || n); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'kegiatan') e where (e ->> 0)::uuid = sc and (e ->> 1)::uuid = bl and (e ->> 2)::int = 10000) then
    perform pragma_gagal('1e kegiatan lama sc'); end if;
  if exists (select 1 from jsonb_array_elements(v -> 'kegiatan') e where (e ->> 0)::uuid = sb) then perform pragma_gagal('1f kegiatan Agustus ditagih ke siswa masuk Januari'); end if;
  raise notice 'OK 1 ringkasan tunggakan tahun lalu';

  -- 2. pembayaran yang ditarik saat aplikasi dibuka
  select count(*) into n from pembayaran_dimuat() p where p.siswa_id = sa and p.tahun_ajaran = ta0;
  if n <> 0 then perform pragma_gagal('2a pembayaran lama yang sudah lunas ikut ditarik (' || n || ')'); end if;
  if not exists (select 1 from pembayaran_dimuat() p where p.siswa_id = sb and p.periode = 11 and p.tahun_ajaran = ta0) then perform pragma_gagal('2b cicilan tunggakan'); end if;
  if not exists (select 1 from pembayaran_dimuat() p where p.siswa_id = sc and p.biaya_id = bl) then perform pragma_gagal('2c cicilan kegiatan lama'); end if;
  if exists (select 1 from pembayaran_dimuat() p where p.siswa_id = sc and p.tahun_ajaran = ta0 and p.periode = 0) then perform pragma_gagal('2d bulan lama lunas ikut'); end if;
  select count(*) into n from pembayaran_dimuat();
  select count(*) into i from pembayaran where sekolah_id = sk
     and (dibayar_pada >= make_date(y0 + 1, 7, 1)::timestamp at time zone 'Asia/Jakarta' or (jenis = 'spp' and tahun_ajaran >= ta));
  if n < i then perform pragma_gagal('2e pembayaran tahun ini ada yang tertinggal (' || n || ' < ' || i || ')'); end if;
  if exists (select 1 from pembayaran_dimuat() p where p.sekolah_id <> sk) then perform pragma_gagal('2f sekolah lain'); end if;
  raise notice 'OK 2 data saat aplikasi dibuka: % baris (tahun lama yang lunas tidak ikut)', n;

  -- 3. siswa lulus / keluar yang masih menunggak
  v := tunggakan_nonaktif();
  select e into v from jsonb_array_elements(v) e where (e ->> 'id')::uuid = sl;
  if v is null then perform pragma_gagal('3a alumni menunggak tidak muncul'); end if;
  if (v ->> 'total')::int <> spp + 50000 then perform pragma_gagal('3b total alumni ' || (v ->> 'total')); end if;
  if jsonb_array_length(v -> 'item') <> 2 or v ->> 'status' <> 'alumni' or v ->> 'kelas' <> 'B' then perform pragma_gagal('3c rincian alumni ' || v); end if;
  if exists (select 1 from jsonb_array_elements(tunggakan_nonaktif()) e where (e ->> 'id')::uuid in (sa, sb, sc)) then perform pragma_gagal('3d siswa aktif ikut'); end if;
  raise notice 'OK 3 tunggakan siswa lulus / keluar';

  -- 4. riwayat transaksi per tanggal (tahun lalu), per halaman
  v := pembayaran_daftar(make_date(y0, 7, 1), make_date(y0 + 1, 6, 30), 0, 10);
  select count(*), sum(nominal) into n, m from pembayaran where sekolah_id = sk
     and dibayar_pada >= make_date(y0, 7, 1)::timestamp at time zone 'Asia/Jakarta' and dibayar_pada < make_date(y0 + 1, 7, 1)::timestamp at time zone 'Asia/Jakarta';
  if (v -> 'ringkas' ->> 'jumlah')::int <> n or (v -> 'ringkas' ->> 'total')::bigint <> m then perform pragma_gagal('4a ringkas ' || (v -> 'ringkas')); end if;
  if jsonb_array_length(v -> 'item') <> 10 or not (v ->> 'lanjut')::boolean then perform pragma_gagal('4b halaman pertama'); end if;
  if (v -> 'item' -> 0 -> 'siswa' ->> 'nama') is null then perform pragma_gagal('4c nama siswa'); end if;
  v := pembayaran_daftar(make_date(y0, 7, 1), make_date(y0 + 1, 6, 30), 10, 1000);
  if jsonb_array_length(v -> 'item') <> n - 10 or (v ->> 'lanjut')::boolean then perform pragma_gagal('4d halaman berikutnya'); end if;
  begin perform pembayaran_daftar(make_date(y0, 1, 1), make_date(y0 + 2, 1, 1)); perform pragma_gagal('4e rentang > 1 tahun');
  exception when others then if sqlerrm like 'GAGAL%' then raise; end if; end;
  raise notice 'OK 4 riwayat transaksi tahun lalu (% transaksi)', n;

  -- 5. isolasi: sekolah lain tidak melihat apa pun dari UJI 005
  perform set_config('request.jwt.claims', json_build_object('sub', adm2)::text, false);
  if exists (select 1 from jsonb_array_elements(ringkasan_tunggakan_lalu() -> 'spp') e where (e ->> 0)::uuid in (sb, sc)) then perform pragma_gagal('5a ringkasan'); end if;
  if exists (select 1 from jsonb_array_elements(tunggakan_nonaktif()) e where (e ->> 'id')::uuid = sl) then perform pragma_gagal('5b nonaktif'); end if;
  if exists (select 1 from pembayaran_dimuat() p where p.sekolah_id = sk) then perform pragma_gagal('5c dimuat'); end if;
  if exists (select 1 from jsonb_array_elements(pembayaran_daftar(make_date(y0, 7, 1), make_date(y0 + 1, 6, 30)) -> 'item') e where e ->> 'sekolah_id' = sk::text) then
    perform pragma_gagal('5d daftar'); end if;
  begin perform tunggakan_rinci(sk); perform pragma_gagal('5e fungsi bantu bisa dipanggil langsung');
  exception when insufficient_privilege then null; end;
  begin perform siswa_ada_tunggakan(sl); perform pragma_gagal('5f fungsi bantu bisa dipanggil langsung');
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set role anon';
  begin perform pembayaran_dimuat(); perform pragma_gagal('5g anon dimuat'); exception when insufficient_privilege then null; end;
  begin perform tunggakan_nonaktif(); perform pragma_gagal('5h anon nonaktif'); exception when insufficient_privilege then null; end;
  begin perform pembayaran_daftar(current_date, current_date); perform pragma_gagal('5i anon daftar'); exception when insufficient_privilege then null; end;
  raise notice 'OK 5 isolasi & hak akses';

  -- 6. portal orang tua: anak alumni yang menunggak tetap bisa dibuka (anon, token + NIS)
  v := portal_wali(tok, 'UJI44-1');
  if v ? 'gerbang' then perform pragma_gagal('6a NIS alumni ditolak ' || v); end if;
  if jsonb_array_length(v -> 'siswa') <> 1 or (v -> 'siswa' -> 0 ->> 'id')::uuid <> sl then perform pragma_gagal('6b anak alumni'); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'siswa_tahun') e where e ->> 'tahun_ajaran' = ta0) then perform pragma_gagal('6c riwayat kelas'); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'biaya') e where (e ->> 'id')::uuid = bl) then perform pragma_gagal('6d kegiatan lama'); end if;
  execute 'reset role';
  raise notice 'OK 6 portal orang tua tetap terbuka untuk alumni yang menunggak';

  -- 7. Tanya SAKU (kepala sekolah)
  perform set_config('request.jwt.claims', json_build_object('sub', kep)::text, false);
  execute 'set role authenticated';
  v := ai_tunggakan_lalu(null, null);
  if (v ->> 'total_kurang_rupiah')::bigint <> (11 * spp + 40000) + (spp - 1000) + (spp + 50000) then
    perform pragma_gagal('7a total tunggakan lalu ' || (v ->> 'total_kurang_rupiah')); end if;
  if (v ->> 'jumlah_siswa')::int <> 3 then perform pragma_gagal('7b jumlah siswa'); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'siswa') e where e ->> 'nama' = 'Uji Alumni Lama' and e ->> 'status' like 'sudah lulus%') then perform pragma_gagal('7c alumni'); end if;
  v := ai_tunggakan_lalu('B', ta0);
  if (v ->> 'jumlah_siswa')::int <> 1 then perform pragma_gagal('7d saring kelas saat itu'); end if;
  if ai_tunggakan_lalu(null, ta) ? 'galat' is not true then perform pragma_gagal('7e tahun berjalan harus ditolak'); end if;
  v := ai_rekap_tahun(ta0);
  if (v -> 'siswa' ->> 'jumlah')::int <> 4 or (v -> 'spp' ->> 'tunggakan_rupiah')::bigint <> 11 * spp + (spp - 1000) + spp then
    perform pragma_gagal('7f rekap tahun ' || (v -> 'siswa') || ' ' || (v -> 'spp' ->> 'tunggakan_rupiah')); end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'tahun_ajaran_tersedia') e where e ->> 'tahun_ajaran' = ta0) then perform pragma_gagal('7g daftar tahun'); end if;
  v := ai_status_siswa('Uji Alumni Lama');
  if (v ->> 'ditemukan')::int <> 1 or (v -> 'siswa' -> 0 -> 'tunggakan_tahun_ajaran_lalu' ->> 'total_kurang')::bigint <> spp + 50000 then
    perform pragma_gagal('7h status alumni ' || v); end if;
  raise notice 'OK 7 Tanya SAKU: tunggakan tahun lalu, rekap per tahun, status alumni';

  -- 8. konteks SAKU
  v := ai_mulai(1000);
  if (v -> 'tunggakan_tahun_ajaran_lalu' ->> 'jumlah_siswa')::int <> 3 or (v -> 'tunggakan_tahun_ajaran_lalu' ->> 'sudah_lulus_atau_keluar')::int <> 1 then
    perform pragma_gagal('8 konteks ' || (v -> 'tunggakan_tahun_ajaran_lalu')); end if;
  raise notice 'OK 8 konteks SAKU';

  -- 9. alumni melunasi → hilang dari Tagihan, portal tertutup lagi
  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, false);
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal) values (sk, sl, 'spp', 11, ta0, 'uji lunas', spp);
  insert into pembayaran (sekolah_id, siswa_id, jenis, biaya_id, keterangan, nominal) values (sk, sl, 'kegiatan', bl, 'uji lunas', 50000);
  if exists (select 1 from jsonb_array_elements(tunggakan_nonaktif()) e where (e ->> 'id')::uuid = sl) then perform pragma_gagal('9a masih muncul'); end if;
  execute 'reset role';
  execute 'set role anon';
  v := portal_wali(tok, 'UJI44-1');
  if not (v ? 'gerbang') then perform pragma_gagal('9b portal alumni yang sudah lunas masih terbuka'); end if;
  execute 'reset role';
  raise notice 'OK 9 sesudah lunas: hilang dari Tagihan & portal tertutup';

  -- 10. siswa keluar tengah tahun ini: tunggakan lama + bulan tahun ini sampai bulan terakhir ditagih
  -- (0046: kegiatan tahun ini yang sudah dibayar sesudah bulan keluar menghalangi — bukan yang diuji di sini)
  delete from pembayaran p using biaya b where p.biaya_id = b.id and p.siswa_id = sc and b.tahun_ajaran = ta;
  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, false);
  execute 'set role authenticated';
  perform keluarkan_siswa(sc, 0, 'keluar', 'uji');  -- terakhir ditagih Juli tahun ini
  select e into v from jsonb_array_elements(tunggakan_nonaktif()) e where (e ->> 'id')::uuid = sc;
  if v is null or v ->> 'status' <> 'keluar' then perform pragma_gagal('10a siswa keluar yang menunggak tidak muncul'); end if;
  select count(*) into n from jsonb_array_elements(v -> 'item') e where e ->> 'ta' = ta0;
  if n <> 12 then perform pragma_gagal('10b tunggakan lama siswa keluar (' || n || ')'); end if;
  if exists (select 1 from jsonb_array_elements(v -> 'item') e where e ->> 'ta' = ta and e ->> 'jenis' = 'spp' and (e ->> 'i')::int > 0) then
    perform pragma_gagal('10c bulan sesudah keluar ikut ditagih'); end if;
  if ai_indeks_bulan((now() at time zone 'Asia/Jakarta')::date) > 0 and spp_target(sc, ta, 0) > coalesce((select sum(nominal) from pembayaran where siswa_id = sc and jenis = 'spp' and tahun_ajaran = ta and periode = 0), 0)
     and not exists (select 1 from jsonb_array_elements(v -> 'item') e where e ->> 'ta' = ta and (e ->> 'i')::int = 0) then
    perform pragma_gagal('10d Juli tahun ini yang belum lunas tidak ikut'); end if;
  -- 0045: siswa yang keluar TAHUN INI tetap ikut ringkasan (laporan tahun ini masih menghitung bulan-bulan
  -- sebelum ia keluar); alumni / keluar tahun-tahun sebelumnya tidak (lihat 1a)
  if not exists (select 1 from jsonb_array_elements(ringkasan_tunggakan_lalu() -> 'spp') e where (e ->> 0)::uuid = sc and e ->> 1 = ta0) then
    perform pragma_gagal('10e siswa keluar tahun ini hilang dari ringkasan tunggakan lama'); end if;
  execute 'reset role';
  raise notice 'OK 10 siswa keluar tengah tahun';
end $$;

select 'LULUS — 10 kelompok uji tahun lama (semua di-rollback)' as hasil;
rollback;
