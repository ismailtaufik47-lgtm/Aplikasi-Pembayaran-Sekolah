-- =====================================================================
-- Hapus kolom sekolah.jatuh_tempo — susulan dari 0015_status_langganan_kolom.sql.
--
-- Ternyata isinya duplikat dengan sekolah.langganan_sampai:
--   • Selama trial     : jatuh_tempo = tanggal trial habis (info ini sudah
--                        bisa didapat dari trial_mulai + 15 hari, tak perlu
--                        kolom sendiri).
--   • Setelah pernah bayar : jatuh_tempo == langganan_sampai, persis sama.
--
-- Jadi cukup pakai langganan_sampai yang sudah ada sejak 0013. Kolom
-- status_langganan TETAP dipertahankan (bukan duplikat — itu yang
-- membedakan trial/aktif/kadaluarsa).
--
-- Aman dijalankan berkali-kali (idempoten). Jalankan SETELAH 0015.
-- =====================================================================

alter table sekolah
  drop column if exists jatuh_tempo;

-- ---------- fungsi sinkron: cukup update status_langganan saja ----------
create or replace function sinkron_status_langganan(p_sekolah_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update sekolah s
     set status_langganan = (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'status')
   where (p_sekolah_id is null or s.id = p_sekolah_id)
     and s.status_langganan is distinct from (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'status');
end $$;

revoke all on function sinkron_status_langganan(uuid) from public;
grant execute on function sinkron_status_langganan(uuid) to authenticated;

-- Trigger & job pg_cron dari 0015 tidak perlu diubah — keduanya tetap
-- memanggil sinkron_status_langganan(), yang sekarang cuma isi 1 kolom.

-- Rapikan data yang sudah terlanjur ada di status_langganan (jaga-jaga).
select sinkron_status_langganan();
