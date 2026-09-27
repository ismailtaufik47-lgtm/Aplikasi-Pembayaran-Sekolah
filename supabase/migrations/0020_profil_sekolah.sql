-- =====================================================================
-- 0020: profil sekolah — tambah kepala sekolah & alamat,
--       hapus kolom tahun_ajaran dari tabel sekolah.
--
-- Kenapa tahun_ajaran dihapus: tahun ajaran bukan identitas sekolah,
-- ia berganti sendiri tiap Juli. Aplikasi sekarang menghitungnya
-- otomatis dari tanggal hari ini (Juli–Juni), jadi tidak ada lagi
-- kolom yang harus diubah manual tiap tahun dan bisa lupa diubah.
-- Tahun lulus alumni tetap tersimpan per siswa (siswa.tahun_lulus).
--
-- Jalankan SETELAH 0019. Aman dijalankan berkali-kali (idempoten).
-- =====================================================================

-- ---------- 1. kolom baru ----------
alter table sekolah add column if not exists kepala_sekolah text;
alter table sekolah add column if not exists alamat text;

comment on column sekolah.kepala_sekolah is 'Nama kepala sekolah — diisi di menu Profil sekolah.';
comment on column sekolah.alamat is 'Alamat lengkap sekolah — diisi di menu Profil sekolah.';

-- Isi awal nama kepala sekolah dari akun berperan 'kepala' (kalau ada),
-- supaya sekolah lama tidak kosong. Tetap bisa diubah di Profil sekolah.
update sekolah s
   set kepala_sekolah = p.nama
  from (
    select distinct on (sekolah_id) sekolah_id, nama
      from profil
     where peran = 'kepala'
     order by sekolah_id, dibuat_pada
  ) p
 where p.sekolah_id = s.id
   and s.kepala_sekolah is null;

-- ---------- 2. pendaftaran sekolah baru tanpa tahun ajaran ----------
-- Parameter p_tahun_ajaran dibiarkan ada (diabaikan) supaya aplikasi
-- versi lama yang masih mengirimnya tidak error.
create or replace function daftarkan_sekolah(p_nama text, p_tahun_ajaran text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_id uuid;
  v_nama       text;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk. Silakan login ulang.';
  end if;
  if exists (select 1 from profil where id = auth.uid()) then
    raise exception 'Akun ini sudah terhubung ke sekolah lain.';
  end if;
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama sekolah belum diisi.';
  end if;

  v_nama := nama_dari_google(auth.uid());

  insert into sekolah (nama, kepala_sekolah)
  values (trim(p_nama), v_nama)
  returning id into v_sekolah_id;

  insert into profil (id, sekolah_id, nama, peran)
  values (auth.uid(), v_sekolah_id, v_nama, 'kepala');

  return jsonb_build_object('sekolahId', v_sekolah_id, 'nama', p_nama, 'peran', 'kepala');
end $$;

revoke all on function daftarkan_sekolah(text, text) from public;
grant execute on function daftarkan_sekolah(text, text) to authenticated;

-- ---------- 3. hapus kolom tahun_ajaran ----------
alter table sekolah drop column if exists tahun_ajaran;
