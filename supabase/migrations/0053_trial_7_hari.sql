-- =====================================================================
-- 0053: masa uji coba 7 hari (sebelumnya 15 hari)
--
--  • Sekolah yang mulai uji coba SEJAK 6 Nov 2026 00:00 WIB → 7 hari.
--  • Sekolah yang mulai SEBELUM itu tetap 15 hari (uji coba yang sedang
--    berjalan tidak terpotong).
--  • Sama persis dengan src/lib/langganan.js (TRIAL_HARI, TRIAL_HARI_LAMA,
--    TRIAL_7_SEJAK). Kalau tanggal batas diubah, ubah di KEDUA tempat.
--
--  Yang diubah: fungsi baru trial_hari(), hitung_status_langganan (2 parameter;
--  versi 3 parameter otomatis ikut karena memanggil yang ini),
--  admin_perpanjang (panel pemilik), lalu kolom status_langganan disinkronkan.
--
--  Jalankan SETELAH 0052. Aman dijalankan berkali-kali.
-- =====================================================================

-- ---------- 1. lama uji coba per sekolah ----------
create or replace function trial_hari(p_trial_mulai timestamptz)
returns int
language sql immutable as $$
  select case
    when p_trial_mulai is not null and p_trial_mulai < timestamptz '2026-11-06 00:00:00+07' then 15
    else 7
  end
$$;

-- ---------- 2. sumber kebenaran status langganan ----------
-- Isi sama dengan versi di database (diambil 5 Nov 2026), hanya angka 15
-- diganti trial_hari(p_trial_mulai). Sifat IMMUTABLE dipertahankan seperti aslinya.
create or replace function public.hitung_status_langganan(p_trial_mulai timestamp with time zone, p_langganan_sampai date)
 returns jsonb
 language sql
 immutable
as $function$
  with a as (
    select
      trial_hari(p_trial_mulai) as trial_hari,
      7  as tenggang_hari,
      (p_trial_mulai::date + trial_hari(p_trial_mulai))                       as trial_sampai,
      p_langganan_sampai                                                      as bayar_sampai,
      greatest(p_trial_mulai::date + trial_hari(p_trial_mulai),
               coalesce(p_langganan_sampai, p_trial_mulai::date + trial_hari(p_trial_mulai))) as aktif_sampai
  )
  select jsonb_build_object(
    'trialSampai',    trial_sampai,
    'langgananSampai', bayar_sampai,
    'aktifSampai',    aktif_sampai,
    'portalSampai',   aktif_sampai + tenggang_hari,
    'sisaHari',       (aktif_sampai - current_date),
    'sisaPortalHari', (aktif_sampai + tenggang_hari - current_date),
    'portalAktif',    (current_date <= aktif_sampai + tenggang_hari),
    'sudahBayar',     (bayar_sampai is not null and bayar_sampai >= current_date),
    'status', case
        when current_date > aktif_sampai then 'kadaluarsa'
        when bayar_sampai is not null and bayar_sampai >= current_date then 'aktif'
        when current_date <= trial_sampai then 'trial'
        else 'kadaluarsa'
      end
  )
  from a
$function$;

-- ---------- 3. perpanjang langganan (panel pemilik) ----------
-- Sama dengan 0019, hanya "+ 15" diganti trial_hari().
create or replace function admin_perpanjang(
  p_sekolah_id    uuid,
  p_bulan         int default 1,
  p_tarif_default numeric default 5000
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s           sekolah%rowtype;
  v_trial     date;
  v_akhir     date;
  v_mulai     date;
  v_baru      date;
  v_n         int;
  v_tarif     numeric;
  v_nominal   numeric;
  v_id        uuid;
begin
  if not saya_admin_aplikasi() then
    raise exception 'Hanya admin aplikasi yang boleh memperpanjang langganan.';
  end if;
  if p_bulan is null or p_bulan < 1 then
    raise exception 'Jumlah bulan minimal 1.';
  end if;

  select * into s from sekolah where id = p_sekolah_id for update;
  if not found then
    raise exception 'Sekolah tidak ditemukan.';
  end if;

  -- hari terakhir masa aktif saat ini (trial atau sewa, mana yang lebih akhir)
  v_trial := s.trial_mulai::date + trial_hari(s.trial_mulai);
  v_akhir := greatest(v_trial, coalesce(s.langganan_sampai, v_trial));

  if v_akhir >= current_date then
    v_mulai := v_akhir + 1;
    v_baru  := (v_akhir + make_interval(months => p_bulan))::date;
  else
    v_mulai := current_date;
    v_baru  := (current_date + make_interval(months => p_bulan))::date;
  end if;

  select count(*) into v_n from siswa x where x.sekolah_id = s.id and x.aktif;
  v_tarif   := case when s.harga_per_siswa > 0 then s.harga_per_siswa else p_tarif_default end;
  v_nominal := v_n * v_tarif * p_bulan;

  update sekolah set langganan_sampai = v_baru where id = s.id;

  insert into riwayat_langganan
    (sekolah_id, bulan, jumlah_siswa, tarif, nominal, periode_mulai, sampai_lama, sampai_baru, dicatat_oleh)
  values
    (s.id, p_bulan, v_n, v_tarif, v_nominal, v_mulai, s.langganan_sampai, v_baru,
     (select email from auth.users where id = auth.uid()))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'sekolahId', s.id, 'bulan', p_bulan,
    'jumlahSiswa', v_n, 'tarif', v_tarif, 'nominal', v_nominal,
    'periodeMulai', v_mulai, 'langgananSampai', v_baru
  );
end $$;

revoke all on function admin_perpanjang(uuid, int, numeric) from public;
grant execute on function admin_perpanjang(uuid, int, numeric) to authenticated;

-- ---------- 4. samakan kolom cermin status_langganan ----------
select sinkron_status_langganan(null);
