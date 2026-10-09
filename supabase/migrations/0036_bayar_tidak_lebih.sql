-- =====================================================================
-- 0036 — Pembayaran tidak bisa dicatat kalau tagihannya SUDAH LUNAS,
--        dan nominalnya tidak boleh melebihi sisa tagihan.
--
-- Berlaku untuk SPP (per bulan), biaya kegiatan, dan paket PMB / daftar
-- ulang. Aplikasi sudah mengunci tombol simpannya; aturan di sini menjaga
-- supaya tetap benar walau dua petugas mencatat bersamaan (antrean per
-- siswa + tagihan) atau data dikirim dari luar aplikasi.
--
-- Aman dijalankan berulang kali. Tidak mengubah data yang sudah ada.
-- =====================================================================

create or replace function pembayaran_cek_lunas() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target bigint; v_sudah bigint; v_sisa bigint; v_label text;
begin
  if new.jenis = 'spp' then
    select spp_nominal into v_target from sekolah where id = new.sekolah_id;
    v_label := 'SPP ' || coalesce(ai_nama_bulan(new.periode), 'bulan ini');
  elsif new.jenis = 'kegiatan' then
    select nominal, nama into v_target, v_label from biaya where id = new.biaya_id and sekolah_id = new.sekolah_id;
  elsif new.jenis = 'paket' then
    select total, nama into v_target, v_label from paket_biaya where id = new.paket_id and sekolah_id = new.sekolah_id;
  else
    return new;
  end if;
  if coalesce(v_target, 0) <= 0 then return new; end if;

  -- antrekan pencatatan untuk siswa + tagihan yang sama
  perform pg_advisory_xact_lock(hashtextextended('bayar:' || new.siswa_id::text || ':' || new.jenis || ':' ||
                                                 coalesce(new.periode::text, new.biaya_id::text, new.paket_id::text, ''), 0));
  select coalesce(sum(nominal), 0) into v_sudah
    from pembayaran
   where siswa_id = new.siswa_id and jenis = new.jenis
     and (case new.jenis when 'spp' then periode = new.periode
                         when 'kegiatan' then biaya_id = new.biaya_id
                         else paket_id = new.paket_id end);
  v_sisa := v_target - v_sudah;
  if v_sisa <= 0 then
    raise exception '% sudah lunas — pembayaran tidak dicatat.', v_label;
  end if;
  if new.nominal > v_sisa then
    raise exception 'Nominal % melebihi sisa tagihan % (%). Maksimal %.', kas_rp(new.nominal), v_label, kas_rp(v_sisa), kas_rp(v_sisa);
  end if;
  return new;
end $$;

-- Nama diawali "pembayaran_cek_z…" supaya berjalan SETELAH pemeriksaan
-- kepemilikan (pembayaran_cek_milik, 0033): trigger dijalankan urut abjad.
drop trigger if exists pembayaran_cek_zlunas on pembayaran;
create trigger pembayaran_cek_zlunas before insert on pembayaran
  for each row execute function pembayaran_cek_lunas();

revoke all on function pembayaran_cek_lunas() from public, anon, authenticated;
