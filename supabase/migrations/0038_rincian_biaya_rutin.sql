-- =====================================================================
-- 0038 — Biaya rutin per bulan bisa DIRINCI (keterangan + nominal)
--
--  Sebelumnya "Isi sendiri" hanya satu angka (rutinManual). Sekarang
--  atur_indikator() juga menerima rutinRincian:
--      [{ "nama": "Honor guru", "nominal": 3000000 }, ...]   (maks. 20 baris)
--  rutinManual tetap disimpan = jumlah semua baris, supaya data lama aman.
--
--  Hanya mengganti fungsi atur_indikator() — tabel & riwayat dari 0037
--  tidak berubah. Aman dijalankan ulang. Jalankan SETELAH 0037.
-- =====================================================================

create or replace function atur_indikator(p_isi jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sekolah uuid := sekolah_saya();
  v_nama text;
  v_k text;
  v_r jsonb;
begin
  if v_sekolah is null then
    raise exception 'Akun ini belum terhubung ke sekolah.' using errcode = '42501';
  end if;
  if not boleh('sekolah', 'kelola') then
    raise exception 'Hanya kepala sekolah (atau Admin/TU yang diberi hak profil sekolah) yang boleh mengatur indikator.' using errcode = '42501';
  end if;

  -- bentuk isi: objek kecil dengan kunci yang dikenal saja
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' then
    raise exception 'Isi pengaturan indikator tidak valid.';
  end if;
  if length(p_isi::text) > 8000 then
    raise exception 'Isi pengaturan indikator terlalu besar.';
  end if;
  for v_k in select jsonb_object_keys(p_isi) loop
    if v_k not in ('preset', 'target', 'aktif', 'sppTanggal', 'rutinManual', 'rutinRincian', 'terjadwal') then
      raise exception 'Kunci pengaturan tidak dikenal: %', v_k;
    end if;
  end loop;
  if p_isi ? 'terjadwal' and (jsonb_typeof(p_isi->'terjadwal') <> 'array' or jsonb_array_length(p_isi->'terjadwal') > 20) then
    raise exception 'Pengeluaran terjadwal maksimal 20 baris.';
  end if;
  if p_isi ? 'rutinManual' and jsonb_typeof(p_isi->'rutinManual') not in ('number', 'null') then
    raise exception 'Biaya rutin harus berupa angka.';
  end if;
  if p_isi ? 'rutinRincian' and jsonb_typeof(p_isi->'rutinRincian') <> 'null' then
    if jsonb_typeof(p_isi->'rutinRincian') <> 'array' or jsonb_array_length(p_isi->'rutinRincian') > 20 then
      raise exception 'Rincian biaya rutin maksimal 20 baris.';
    end if;
    for v_r in select * from jsonb_array_elements(p_isi->'rutinRincian') loop
      if jsonb_typeof(v_r) <> 'object'
         or jsonb_typeof(v_r->'nama') <> 'string' or length(trim(v_r->>'nama')) = 0 or length(v_r->>'nama') > 60
         or jsonb_typeof(v_r->'nominal') <> 'number' or (v_r->>'nominal')::numeric <= 0 then
        raise exception 'Setiap biaya rutin harus punya keterangan (maks. 60 huruf) dan nominal lebih dari 0.';
      end if;
    end loop;
  end if;
  if p_isi ? 'sppTanggal' and (jsonb_typeof(p_isi->'sppTanggal') <> 'number' or (p_isi->>'sppTanggal')::numeric not between 1 and 28) then
    raise exception 'Tanggal target SPP harus antara 1 dan 28.';
  end if;

  select nama into v_nama from profil where id = auth.uid();

  insert into indikator_atur (sekolah_id, isi, diubah_oleh, diubah_nama, diubah_pada)
  values (v_sekolah, p_isi, auth.uid(), v_nama, now())
  on conflict (sekolah_id) do update
    set isi = excluded.isi, diubah_oleh = excluded.diubah_oleh, diubah_nama = excluded.diubah_nama, diubah_pada = now();

  insert into indikator_riwayat (sekolah_id, isi, diubah_oleh, diubah_nama)
  values (v_sekolah, p_isi, auth.uid(), v_nama);

  return p_isi;
end $$;

revoke all on function atur_indikator(jsonb) from public, anon;
grant execute on function atur_indikator(jsonb) to authenticated;
