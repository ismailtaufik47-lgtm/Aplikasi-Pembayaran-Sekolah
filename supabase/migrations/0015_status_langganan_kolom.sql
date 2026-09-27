-- =====================================================================
-- Kolom status_langganan & jatuh_tempo di tabel sekolah — susulan dari
-- 0013_langganan.sql. Bukan sumber kebenaran baru: kolom ini hanya
-- CERMIN dari hasil hitung_status_langganan() (fungsi 0013), supaya
-- statusnya bisa langsung dilihat & difilter di Table Editor Supabase,
-- persis seperti kolom status_langganan di aplikasi tabungan siswa.
--
-- Sumber kebenaran tetap hitung_status_langganan() (dihitung dari
-- trial_mulai + langganan_sampai). Kolom di sini disinkronkan otomatis:
--   1. Trigger — begitu trial_mulai/langganan_sampai berubah (mis. lewat
--      perpanjang_langganan()), kolom langsung ikut ter-update.
--   2. pg_cron harian — supaya transisi yang murni karena berjalannya
--      waktu (trial habis, langganan jatuh tempo) TETAP ter-update walau
--      tidak ada perubahan data hari itu.
--
-- Nilai status: 'trial' | 'aktif' | 'kadaluarsa' (di layar tampil sebagai
-- "Uji coba" / "Aktif" / "Nonaktif" — istilah 'tidak aktif' Anda = ini).
--
-- Aman dijalankan berkali-kali (idempoten). Jalankan SETELAH 0013 & 0014.
-- =====================================================================

alter table sekolah
  add column if not exists status_langganan text,
  add column if not exists jatuh_tempo      date;

comment on column sekolah.status_langganan is
  'Cermin otomatis dari hitung_status_langganan(): trial | aktif | kadaluarsa. Jangan diubah manual — selalu disinkronkan lewat trigger & job harian.';
comment on column sekolah.jatuh_tempo is
  'Cermin otomatis: tanggal terakhir masa aktif (aktifSampai). Setelah tanggal ini, status_langganan berubah jadi kadaluarsa.';

-- ---------- fungsi sinkron ----------
create or replace function sinkron_status_langganan(p_sekolah_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update sekolah s
     set status_langganan = (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'status'),
         jatuh_tempo      = ((hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'aktifSampai')::date)
   where (p_sekolah_id is null or s.id = p_sekolah_id)
     and (
       s.status_langganan is distinct from (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'status')
       or s.jatuh_tempo is distinct from ((hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'aktifSampai')::date)
     );
end $$;

revoke all on function sinkron_status_langganan(uuid) from public;
grant execute on function sinkron_status_langganan(uuid) to authenticated;

-- ---------- trigger: sinkron begitu tanggal trial/langganan berubah ----------
create or replace function trg_sinkron_status_sekolah()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sinkron_status_langganan(new.id);
  return new;
end $$;

drop trigger if exists sekolah_sinkron_status on sekolah;
create trigger sekolah_sinkron_status
  after insert or update of trial_mulai, langganan_sampai on sekolah
  for each row execute function trg_sinkron_status_sekolah();

-- ---------- isi kolom untuk sekolah yang sudah ada ----------
select sinkron_status_langganan();

-- ---------- job harian: tangkap transisi yang murni karena waktu berjalan ----------
-- Butuh extension pg_cron aktif (Supabase: Database > Extensions > cari
-- "pg_cron" > Enable). Kalau belum aktif, blok ini otomatis dilewati —
-- aktifkan extension-nya lalu jalankan ulang migrasi ini agar job terpasang.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sinkron-status-langganan-harian';
    perform cron.schedule(
      'sinkron-status-langganan-harian',
      '5 0 * * *',  -- tiap hari jam 00:05 (waktu server, UTC)
      $sql$select sinkron_status_langganan();$sql$
    );
  end if;
end $$;
