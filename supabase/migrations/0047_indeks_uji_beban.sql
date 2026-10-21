-- =====================================================================
-- 0047 — Hasil uji beban 50 sekolah (±245.000 pembayaran, 3 tahun ajaran)
--
--  1. Indeks pembayaran(biaya_id).
--     Tanpa indeks ini, "uang masuk per kegiatan" di Laporan › Tahunan, Tanya SAKU
--     (rekap tahun) dan cek hapus kegiatan membaca SELURUH tabel pembayaran semua
--     sekolah — makin banyak sekolah pelanggan, makin lambat untuk SEMUA sekolah
--     (sekolah 27 siswa: ±140 ms hanya untuk bagian ini di data uji 50 sekolah).
--  2. pembayaran_dimuat(): baris akhir dibatasi sekolah sendiri, supaya Postgres
--     tidak memilih membaca seluruh tabel pembayaran saat aplikasi dibuka.
--     Isi & urutan hasil SAMA PERSIS dengan 0044.
--
--  Tidak mengubah data. Aman dijalankan ulang. Butuh 0044.
-- =====================================================================

create index if not exists pembayaran_biaya_idx on pembayaran (biaya_id) where biaya_id is not null;

-- Hanya diganti kalau isinya masih versi 0044 (kalau sudah pernah diubah versi lain, dilewati + pesan).
do $do$
declare v text := (select prosrc from pg_proc where proname = 'pembayaran_dimuat' and pronamespace = 'public'::regnamespace);
begin
  if v like '%0047:%' then
    raise notice '0047: pembayaran_dimuat() sudah versi 0047.';
  elsif v not like '%r as materialized (select * from tunggakan_rinci(v_sk))%'
        or v not like '%select p.* from pembayaran p join pilih on pilih.id = p.id%' then
    raise notice '0047: pembayaran_dimuat() di database ini BUKAN versi 0044 — tidak diganti (indeks tetap dipasang). Kirimkan definisinya ke chat.';
  else
    execute $q$
create or replace function pembayaran_dimuat() returns setof pembayaran
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk   uuid := sekolah_saya();
  v_kini text := tahun_ajaran_berjalan();
  v_awal timestamptz := make_date(split_part(tahun_ajaran_berjalan(), '/', 1)::int, 7, 1)::timestamp at time zone 'Asia/Jakarta';
begin
  if v_sk is null then return; end if;
  -- digabung lewat UNION (hash join), bukan EXISTS per baris → tetap cepat walau datanya bertahun-tahun
  return query
    with r as materialized (select * from tunggakan_rinci(v_sk)),
    pilih as (
      select p.id from pembayaran p
       where p.sekolah_id = v_sk and (p.dibayar_pada >= v_awal or (p.jenis = 'spp' and p.tahun_ajaran >= v_kini))
      union
      select p.id from pembayaran p join biaya b on b.id = p.biaya_id
       where p.sekolah_id = v_sk and p.jenis = 'kegiatan' and b.tahun_ajaran >= v_kini
      union
      select p.id from pembayaran p join paket_biaya k on k.id = p.paket_id
       where p.sekolah_id = v_sk and p.jenis = 'paket' and k.aktif
      union
      select p.id from pembayaran p join r on r.jenis = 'spp' and r.siswa_id = p.siswa_id and r.ta = p.tahun_ajaran and r.periode = p.periode
       where p.sekolah_id = v_sk and p.jenis = 'spp'
      union
      select p.id from pembayaran p join r on r.jenis = 'kegiatan' and r.siswa_id = p.siswa_id and r.biaya_id = p.biaya_id
       where p.sekolah_id = v_sk and p.jenis = 'kegiatan'
    )
    select p.* from pembayaran p join pilih on pilih.id = p.id
     where p.sekolah_id = v_sk   -- 0047: baca lewat indeks sekolah, bukan seluruh tabel
     order by p.dibayar_pada desc, p.id;
end $$;
$q$;
  end if;
end $do$;

analyze pembayaran;
