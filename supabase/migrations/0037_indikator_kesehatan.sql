-- =====================================================================
-- 0037 — Pengaturan "Indikator kesehatan keuangan" (dasbor kepala sekolah)
--
--  • indikator_atur     : satu baris per sekolah — tingkat ketat, target,
--                          indikator yang dinyalakan, biaya rutin manual,
--                          pengeluaran besar terjadwal (jsonb).
--  • indikator_riwayat  : catatan SETIAP perubahan (siapa, kapan, isinya)
--                          supaya angka di dasbor bisa dipertanggungjawabkan.
--  • atur_indikator()   : satu-satunya jalan untuk mengubah — khusus akun
--                          yang boleh mengelola profil sekolah (kepala sekolah,
--                          atau Admin/TU kalau diberi hak itu).
--
-- Skor & warna dihitung di aplikasi dari data kas & pembayaran yang sudah
-- ada; tabel ini hanya menyimpan aturannya. Aman dijalankan berulang kali.
-- =====================================================================

create table if not exists indikator_atur (
  sekolah_id  uuid primary key references sekolah(id) on delete cascade,
  isi         jsonb not null,
  diubah_oleh uuid,
  diubah_nama text,
  diubah_pada timestamptz not null default now()
);

create table if not exists indikator_riwayat (
  id          uuid primary key default gen_random_uuid(),
  sekolah_id  uuid not null references sekolah(id) on delete cascade,
  isi         jsonb not null,
  diubah_oleh uuid,
  diubah_nama text,
  diubah_pada timestamptz not null default now()
);
create index if not exists indikator_riwayat_sekolah_idx on indikator_riwayat (sekolah_id, diubah_pada desc);

alter table indikator_atur enable row level security;
alter table indikator_riwayat enable row level security;

-- dibaca semua staf sekolah itu (dasbor & layar Atur indikator)
drop policy if exists indikator_atur_baca on indikator_atur;
create policy indikator_atur_baca on indikator_atur for select using (sekolah_id = sekolah_saya());
drop policy if exists indikator_riwayat_baca on indikator_riwayat;
create policy indikator_riwayat_baca on indikator_riwayat for select using (sekolah_id = sekolah_saya());

-- tidak ada yang boleh menulis langsung — hanya lewat atur_indikator()
revoke insert, update, delete on indikator_atur from public, anon, authenticated;
revoke insert, update, delete on indikator_riwayat from public, anon, authenticated;
grant select on indikator_atur, indikator_riwayat to authenticated;

create or replace function atur_indikator(p_isi jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sekolah uuid := sekolah_saya();
  v_nama text;
  v_k text;
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
    if v_k not in ('preset', 'target', 'aktif', 'sppTanggal', 'rutinManual', 'terjadwal') then
      raise exception 'Kunci pengaturan tidak dikenal: %', v_k;
    end if;
  end loop;
  if p_isi ? 'terjadwal' and (jsonb_typeof(p_isi->'terjadwal') <> 'array' or jsonb_array_length(p_isi->'terjadwal') > 20) then
    raise exception 'Pengeluaran terjadwal maksimal 20 baris.';
  end if;
  if p_isi ? 'rutinManual' and jsonb_typeof(p_isi->'rutinManual') not in ('number', 'null') then
    raise exception 'Biaya rutin harus berupa angka.';
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
