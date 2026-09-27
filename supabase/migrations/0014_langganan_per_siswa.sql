-- =====================================================================
-- Langganan per siswa — susulan dari 0013_langganan.sql.
--
-- Perubahan model harga: dari paket flat menjadi TARIF PER SISWA AKTIF
-- per bulan (default Rp5.000/siswa/bulan di sisi aplikasi, lihat
-- HARGA_PER_SISWA_DEFAULT di src/lib/langganan.js). Sekolah tertentu bisa
-- diberi tarif khusus (negosiasi) lewat kolom sekolah.harga_per_siswa,
-- yang hanya bisa diubah oleh admin aplikasi.
--
-- Status aktif/trial/kadaluarsa TIDAK berubah — masih dihitung dari
-- trial_mulai & langganan_sampai seperti sebelumnya. Migrasi ini hanya
-- menambah data harga & fungsi untuk mengaturnya; tidak mengubah logika
-- penguncian yang sudah ada.
--
-- Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- ---------- kolom tarif khusus per sekolah ----------
alter table sekolah
  add column if not exists harga_per_siswa numeric;

comment on column sekolah.harga_per_siswa is
  'Tarif langganan khusus per siswa aktif per bulan (Rupiah). NULL = pakai tarif default aplikasi (diatur di frontend, lib/langganan.js).';

-- ---------- admin aplikasi: atur tarif khusus sebuah sekolah ----------
create or replace function ubah_harga_per_siswa(p_sekolah_id uuid, p_harga numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ada boolean;
begin
  if not saya_admin_aplikasi() then
    raise exception 'Hanya admin aplikasi yang boleh mengubah tarif.';
  end if;
  if p_harga is not null and p_harga < 0 then
    raise exception 'Tarif tidak boleh negatif.';
  end if;

  select true into v_ada from sekolah where id = p_sekolah_id;
  if v_ada is null then
    raise exception 'Sekolah tidak ditemukan.';
  end if;

  update sekolah set harga_per_siswa = p_harga where id = p_sekolah_id;

  return jsonb_build_object('sekolahId', p_sekolah_id, 'hargaPerSiswa', p_harga);
end $$;

revoke all on function ubah_harga_per_siswa(uuid, numeric) from public;
grant execute on function ubah_harga_per_siswa(uuid, numeric) to authenticated;

-- ---------- daftar_langganan(): sertakan tarif & jumlah siswa aktif ----------
-- Diganti total supaya panel admin bisa melihat tagihan per sekolah
-- (jumlah siswa aktif × tarif yang berlaku) tanpa query tambahan.
create or replace function daftar_langganan()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not saya_admin_aplikasi() then
    raise exception 'Khusus admin aplikasi.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'nama', s.nama,
      'dibuatPada', s.dibuat_pada,
      'trialMulai', s.trial_mulai,
      'langgananSampai', s.langganan_sampai,
      'hargaPerSiswa', s.harga_per_siswa,
      'jumlahSiswaAktif', (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif),
      'status', hitung_status_langganan(s.trial_mulai, s.langganan_sampai)
    ) order by s.dibuat_pada desc)
    from sekolah s
  ), '[]'::jsonb);
end $$;

revoke all on function daftar_langganan() from public;
grant execute on function daftar_langganan() to authenticated;

-- ---------- status_langganan(): sertakan tarif yang berlaku untuk sekolah sendiri ----------
create or replace function status_langganan()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sekolah%rowtype;
begin
  select * into s from sekolah where id = sekolah_saya();
  if not found then
    raise exception 'Akun ini belum terhubung ke sekolah mana pun.';
  end if;
  return hitung_status_langganan(s.trial_mulai, s.langganan_sampai)
         || jsonb_build_object(
              'sekolahId', s.id,
              'namaSekolah', s.nama,
              'hargaPerSiswa', s.harga_per_siswa,
              'jumlahSiswaAktif', (select count(*) from siswa x where x.sekolah_id = s.id and x.aktif)
            );
end $$;

revoke all on function status_langganan() from public;
grant execute on function status_langganan() to authenticated;
