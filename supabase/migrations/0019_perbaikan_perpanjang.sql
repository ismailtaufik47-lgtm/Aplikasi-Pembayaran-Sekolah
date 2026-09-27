-- =====================================================================
-- 0019: perbaikan bug tanggal jatuh tempo pada admin_perpanjang()
--
-- Kasus "langganan sudah lewat lalu diperpanjang" salah kurang 1 hari:
-- hari ini 23 Sep + 1 bulan harusnya 23 Okt, tapi kode lama hasilnya
-- 22 Okt (ada "- 1 hari" yang seharusnya tidak ada, tidak konsisten
-- dengan cabang "masih aktif" yang sudah benar).
--
-- Jalankan SETELAH 0018. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

create or replace function admin_perpanjang(
  p_sekolah_id    uuid,
  p_bulan         int default 1,
  p_tarif_default numeric default 5000
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s           sekolah%rowtype;
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
  v_akhir := greatest(s.trial_mulai::date + 15, coalesce(s.langganan_sampai, s.trial_mulai::date + 15));

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
