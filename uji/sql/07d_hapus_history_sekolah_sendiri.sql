-- =====================================================================
-- 07d — HAPUS HISTORY UJI DARI SEKOLAH SENDIRI (dibuat oleh 07c)
--
--  Menghapus HANYA baris yang dibuat 07c (tercatat di uji_kipo.dibuat):
--  siswa history "RW-…" beserta keanggotaan, wali, pembayaran, pembatalan,
--  kegiatan & PMB/DU tahun lalu, tarif tahun lalu (kalau dibuat 07c), transaksi kas
--  history + penyesuaian — lalu MENGEMBALIKAN pengaturan buku kas seperti semula.
--  Siswa, pembayaran, kas, dan semua data asli Anda tidak disentuh.
--
--  Hasil akhir membandingkan sidik jari data sekolah dengan potret SEBELUM 07c:
--  "SAMA PERSIS" = sekolah kembali persis seperti semula.
--  (Kalau Anda mencatat transaksi baru di antara 07c dan 07d, tabel itu akan
--   tertulis "berubah" — itu transaksi Anda, bukan sisa data uji.)
--
--  BAGIAN 1  hapus + bandingkan (satu transaksi)      ±2 detik
--  BAGIAN 2  rapikan ruang database (VACUUM)          jalankan terpisah
-- =====================================================================


-- #####################################################################
-- BAGIAN 1 — hapus data history uji & kembalikan pengaturan kas
-- #####################################################################
begin;

create temp table hapus_hasil (urut serial, apa text, isi text) on commit drop;

do $$
declare
  v_sk   uuid;
  lama   jsonb;
  n      bigint;
  r      record;
  v_ada  boolean := to_regclass('uji_kipo.dibuat') is not null;
begin
  if not v_ada then
    insert into hapus_hasil (apa, isi) values ('Status', 'Tidak ada data history uji (skema uji_kipo tidak ada) — tidak ada yang dihapus.');
    return;
  end if;
  select sekolah into v_sk from uji_kipo.atur where id = 1;

  create temp table d_siswa on commit drop as select kunci::uuid id from uji_kipo.dibuat where sk = v_sk and tabel = 'siswa';
  create temp table d_lain on commit drop as select tabel, kunci from uji_kipo.dibuat where sk = v_sk and tabel <> 'siswa';

  -- urutan penting: pembayaran dulu (kegiatan & paket tidak boleh dihapus selama masih ada pembayarannya)
  delete from pembayaran where sekolah_id = v_sk and siswa_id in (select id from d_siswa);
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Pembayaran history dihapus', n::text);
  delete from pembayaran_batal where sekolah_id = v_sk and (siswa_id in (select id from d_siswa)
                                                          or id::text in (select kunci from d_lain where tabel = 'pembayaran_batal'));
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Arsip pembatalan dihapus', n::text);
  delete from kas where sekolah_id = v_sk and id::text in (select kunci from d_lain where tabel = 'kas');
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Transaksi kas history dihapus', n::text);
  delete from paket_siswa where sekolah_id = v_sk and (siswa_id in (select id from d_siswa)
                                                     or paket_id::text in (select kunci from d_lain where tabel = 'paket_biaya'));
  delete from paket_biaya where sekolah_id = v_sk and id::text in (select kunci from d_lain where tabel = 'paket_biaya');
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Paket PMB/DU history dihapus', n::text);
  delete from biaya where sekolah_id = v_sk and id::text in (select kunci from d_lain where tabel = 'biaya');
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Kegiatan history dihapus', n::text);
  delete from wali_siswa where siswa_id in (select id from d_siswa);
  delete from wali where sekolah_id = v_sk and id::text in (select kunci from d_lain where tabel = 'wali');
  delete from siswa where sekolah_id = v_sk and id in (select id from d_siswa);      -- keanggotaan per tahun ikut terhapus
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Siswa history dihapus', n::text);
  delete from tahun_ajaran t where t.sekolah_id = v_sk and t.kode in (select kunci from d_lain where tabel = 'tahun_ajaran')
     and not exists (select 1 from siswa_tahun st where st.sekolah_id = v_sk and st.tahun_ajaran = t.kode)
     and not exists (select 1 from biaya b where b.sekolah_id = v_sk and b.tahun_ajaran = t.kode)
     and not exists (select 1 from pembayaran p where p.sekolah_id = v_sk and p.jenis = 'spp' and p.tahun_ajaran = t.kode);
  get diagnostics n = row_count; insert into hapus_hasil (apa, isi) values ('Tarif tahun lalu (buatan 07c) dihapus', n::text);

  -- pengaturan buku kas seperti semula
  select kas_pengaturan into lama from uji_kipo.cadangan where sk = v_sk;
  if lama is null then
    delete from kas_pengaturan where sekolah_id = v_sk;
    insert into hapus_hasil (apa, isi) values ('Pengaturan kas', 'dihapus (sebelum 07c buku kas belum diisi)');
  else
    update kas_pengaturan set saldo_awal = (lama ->> 'saldo_awal')::bigint, mulai = (lama ->> 'mulai')::date,
                              diubah_oleh = lama ->> 'diubah_oleh', diubah_pada = (lama ->> 'diubah_pada')::timestamptz
     where sekolah_id = v_sk;
    insert into hapus_hasil (apa, isi) values ('Pengaturan kas', 'dikembalikan: mulai ' || (lama ->> 'mulai') || ', saldo awal Rp' || (lama ->> 'saldo_awal'));
  end if;

  -- bandingkan dengan potret sebelum 07c
  for r in select b.tabel, b.baris b0, s.baris b1, b.md5 = s.md5 sama
             from uji_kipo.sidik b join uji_kipo.sidik(v_sk) s on s.tabel = b.tabel
            where b.sk = v_sk and b.saat = 'awal' order by b.tabel loop
    insert into hapus_hasil (apa, isi) values ('  ' || r.tabel, case when r.sama then 'sama persis (' || r.b1 || ' baris)'
                                                                  else 'BERUBAH: sebelum ' || r.b0 || ' baris, sekarang ' || r.b1 || ' baris' end);
  end loop;
  insert into hapus_hasil (apa, isi)
  select 'KESIMPULAN', case when bool_and(b.md5 = s.md5) then 'SAMA PERSIS — sekolah kembali seperti sebelum 07c'
                            else 'ADA YANG BERUBAH — lihat baris di atas (transaksi baru Anda sesudah 07c juga terhitung)' end
    from uji_kipo.sidik b join uji_kipo.sidik(v_sk) s on s.tabel = b.tabel where b.sk = v_sk and b.saat = 'awal';
  insert into hapus_hasil (apa, isi) values ('Saldo kas hari ini',
    coalesce('Rp' || kas_saldo_per(v_sk, (now() at time zone 'Asia/Jakarta')::date)
             || coalesce(' · sebelum 07c Rp' || (select saldo_sebelum from uji_kipo.cadangan where sk = v_sk), ''), '-'));
end $$;

-- alat 07c ikut dihapus (07c boleh dijalankan lagi kapan saja)
drop schema if exists uji_kipo cascade;

select apa, isi from hapus_hasil order by urut;

commit;


-- #####################################################################
-- BAGIAN 2 — rapikan ruang (satu perintah; Run sendiri, tanpa baris lain)
-- #####################################################################
vacuum analyze pembayaran, pembayaran_batal, siswa, siswa_tahun, kas, wali, wali_siswa, paket_siswa, biaya, paket_biaya, tahun_ajaran;
