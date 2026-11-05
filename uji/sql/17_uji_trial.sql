-- =====================================================================
-- 17 — UJI MASA UJI COBA 7 HARI (0053) — BACA SAJA
--
--  Jalankan SESUDAH 0053_trial_7_hari.sql. Tidak ada data yang berubah.
--  BAGIAN 1  hitungan tanggal (pakai tanggal buatan, bukan data sekolah)
--  BAGIAN 2  daftar sekolah yang sedang uji coba (INFO, bukan galat)
--  Hasil BAGIAN 1 = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 1 — hitungan tanggal
-- #####################################################################
with cek as (
  select 1 u, 'Daftar 5 Nov 2026 (sebelum batas) → tetap 15 hari' cek,
         case when trial_hari(timestamptz '2026-11-05 20:00+07') = 15 then 'LULUS' else 'GAGAL' end hasil, '' rincian
  union all
  select 2, 'Daftar 6 Nov 2026 00:00 WIB (tepat batas) → 7 hari',
         case when trial_hari(timestamptz '2026-11-06 00:00+07') = 7 then 'LULUS' else 'GAGAL' end, ''
  union all
  select 3, 'Daftar 1 Des 2026 → 7 hari',
         case when trial_hari(timestamptz '2026-12-01 09:00+07') = 7 then 'LULUS' else 'GAGAL' end, ''
  union all
  select 4, 'Daftar 1 Des 2026 → uji coba berakhir 8 Des 2026',
         case when (hitung_status_langganan(timestamptz '2026-12-01 09:00+07', null) ->> 'trialSampai')::date = date '2026-12-08'
              then 'LULUS' else 'GAGAL' end,
         hitung_status_langganan(timestamptz '2026-12-01 09:00+07', null)::text
  union all
  select 5, 'Uji coba baru yang mulai 8 hari lalu → kadaluarsa',
         case when current_date - 8 >= date '2026-11-06'
              then case when hitung_status_langganan(now() - interval '8 days', null) ->> 'status' = 'kadaluarsa' then 'LULUS' else 'GAGAL' end
              else 'LULUS' end,
         case when current_date - 8 < date '2026-11-06' then 'dilewati: 8 hari lalu masih sebelum batas' else '' end
  union all
  select 6, 'Sekolah lama (mulai 1 Nov 2026) tetap berakhir 16 Nov 2026',
         case when (hitung_status_langganan(timestamptz '2026-11-01 10:00+07', null) ->> 'trialSampai')::date = date '2026-11-16'
              then 'LULUS' else 'GAGAL' end, ''
  union all
  select 7, 'Sudah bayar sampai jauh ke depan → status aktif',
         case when hitung_status_langganan(now(), current_date + 30) ->> 'status' = 'aktif' then 'LULUS' else 'GAGAL' end, ''
  union all
  select 8, 'Versi 3 parameter (nonaktif admin) ikut 7 hari',
         case when (hitung_status_langganan(timestamptz '2026-12-01 09:00+07', null, false) ->> 'trialSampai')::date = date '2026-12-08'
               and hitung_status_langganan(timestamptz '2026-12-01 09:00+07', null, true) ->> 'status' = 'kadaluarsa'
              then 'LULUS' else 'GAGAL' end, ''
  union all
  select 9, 'Kolom status_langganan semua sekolah sudah sama dengan hitungan baru',
         case when exists (select 1 from sekolah s
                            where s.status_langganan is distinct from
                                  (hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status'))
              then 'GAGAL' else 'LULUS' end, ''
)
select 0 u, 'KESIMPULAN' cek,
       case when bool_and(hasil = 'LULUS') then 'LULUS' else 'GAGAL' end hasil,
       count(*) filter (where hasil = 'LULUS') || '/' || count(*) || ' lulus' rincian
  from cek
union all
select * from cek
order by u;


-- #####################################################################
-- BAGIAN 2 — sekolah yang sedang uji coba (INFO)
-- #####################################################################
select s.nama,
       s.trial_mulai::date                                                   as mulai,
       trial_hari(s.trial_mulai)                                             as lama_hari,
       (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'trialSampai')::date as berakhir,
       hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status' as status
  from sekolah s
 where hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status' = 'trial'
 order by s.trial_mulai desc;
