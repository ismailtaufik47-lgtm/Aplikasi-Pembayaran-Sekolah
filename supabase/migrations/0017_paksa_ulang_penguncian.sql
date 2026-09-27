-- =====================================================================
-- Pasang ulang PAKSA trigger penguncian siswa/pembayaran saat langganan
-- kadaluarsa. Jalankan ini kalau query cek_penguncian.sql menunjukkan
-- trigger tidak ada, atau kalau ragu apakah 0013 sudah pernah berhasil
-- jalan sepenuhnya.
--
-- Aman dijalankan berkali-kali (idempoten) — tidak mengubah data,
-- hanya memastikan fungsi & trigger terpasang dengan benar.
-- =====================================================================

create or replace function cegah_jika_langganan_habis()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select hitung_status_langganan(trial_mulai, langganan_sampai) ->> 'status'
    into v_status
    from sekolah where id = new.sekolah_id;

  if v_status = 'kadaluarsa' then
    raise exception 'Masa langganan sekolah sudah berakhir. Perpanjang langganan dulu untuk melanjutkan.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pembayaran_cek_langganan on pembayaran;
create trigger pembayaran_cek_langganan
  before insert on pembayaran
  for each row execute function cegah_jika_langganan_habis();

drop trigger if exists siswa_cek_langganan on siswa;
create trigger siswa_cek_langganan
  before insert on siswa
  for each row execute function cegah_jika_langganan_habis();

-- ---------- verifikasi otomatis: tes langsung setelah dipasang ----------
-- Coba insert siswa dummy ke sekolah yang statusnya kadaluarsa (kalau ada).
-- Kalau trigger bekerja, blok ini akan GAGAL dengan pesan
-- "Masa langganan sekolah sudah berakhir..." — itu artinya BENAR, sengaja.
-- Kalau tidak ada sekolah berstatus kadaluarsa saat ini, blok ini dilewati.
do $$
declare v_sekolah_id uuid;
begin
  select id into v_sekolah_id
    from sekolah
   where (hitung_status_langganan(trial_mulai, langganan_sampai) ->> 'status') = 'kadaluarsa'
   limit 1;

  if v_sekolah_id is not null then
    begin
      insert into siswa (sekolah_id, nama, nis, kelas)
      values (v_sekolah_id, '__tes_penguncian__', '__tes__', 'TES');
      -- kalau sampai baris ini, artinya trigger TIDAK menolak — bermasalah.
      delete from siswa where sekolah_id = v_sekolah_id and nis = '__tes__';
      raise notice 'PERINGATAN: trigger tidak menolak insert padahal sekolah % kadaluarsa!', v_sekolah_id;
    exception when others then
      raise notice 'OK: trigger berhasil menolak insert (%), penguncian bekerja.', sqlerrm;
    end;
  else
    raise notice 'Tidak ada sekolah berstatus kadaluarsa saat ini — tidak ada yang bisa dites otomatis.';
  end if;
end $$;
