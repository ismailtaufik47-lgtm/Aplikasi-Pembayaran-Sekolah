-- =====================================================================
-- Row Level Security
--
-- Aturan mainnya:
--   • Staf sekolah login lewat Supabase Auth. Mereka hanya bisa melihat
--     dan mengubah data sekolahnya sendiri.
--   • Orang tua TIDAK login dan TIDAK punya akses langsung ke tabel.
--     Portal hanya bisa membaca lewat fungsi portal_wali(token).
-- =====================================================================

-- sekolah tempat pengguna yang sedang login bertugas
create or replace function sekolah_saya()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sekolah_id from profil where id = auth.uid()
$$;

alter table sekolah    enable row level security;
alter table profil     enable row level security;
alter table siswa      enable row level security;
alter table biaya      enable row level security;
alter table pembayaran enable row level security;
alter table wali       enable row level security;
alter table wali_siswa enable row level security;

-- ---------- sekolah ----------
drop policy if exists sekolah_baca on sekolah;
create policy sekolah_baca on sekolah
  for select to authenticated using (id = sekolah_saya());

drop policy if exists sekolah_ubah on sekolah;
create policy sekolah_ubah on sekolah
  for update to authenticated using (id = sekolah_saya()) with check (id = sekolah_saya());

-- ---------- profil ----------
drop policy if exists profil_baca on profil;
create policy profil_baca on profil
  for select to authenticated using (id = auth.uid() or sekolah_id = sekolah_saya());

-- ---------- siswa, biaya, pembayaran, wali ----------
do $$
declare t text;
begin
  foreach t in array array['siswa', 'biaya', 'pembayaran', 'wali'] loop
    execute format('drop policy if exists %I_semua on %I', t, t);
    execute format($f$
      create policy %I_semua on %I
        for all to authenticated
        using (sekolah_id = sekolah_saya())
        with check (sekolah_id = sekolah_saya())
    $f$, t, t);
  end loop;
end $$;

drop policy if exists wali_siswa_semua on wali_siswa;
create policy wali_siswa_semua on wali_siswa
  for all to authenticated
  using (exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya()))
  with check (exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya()));

-- =====================================================================
-- Portal orang tua — satu-satunya pintu untuk pengunjung tanpa login.
-- Mengembalikan seluruh data yang dibutuhkan portal dalam satu panggilan.
-- =====================================================================
create or replace function portal_wali(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w      wali%rowtype;
  hasil  jsonb;
begin
  select * into w from wali where token = p_token;
  if not found then
    raise exception 'Tautan portal tidak dikenal atau sudah tidak berlaku';
  end if;

  select jsonb_build_object(
    'wali', jsonb_build_object('nama', w.nama),
    'sekolah', (
      select to_jsonb(s) from sekolah s where s.id = w.sekolah_id
    ),
    'biaya', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.urutan, b.nama)
      from biaya b where b.sekolah_id = w.sekolah_id and b.aktif
    ), '[]'::jsonb),
    'siswa', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nama)
      from siswa x
      join wali_siswa ws on ws.siswa_id = x.id
      where ws.wali_id = w.id and x.aktif
    ), '[]'::jsonb),
    'pembayaran', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.dibayar_pada desc)
      from pembayaran p
      join wali_siswa ws on ws.siswa_id = p.siswa_id
      where ws.wali_id = w.id
    ), '[]'::jsonb)
  ) into hasil;

  return hasil;
end $$;

revoke all on function portal_wali(text) from public;
grant execute on function portal_wali(text) to anon, authenticated;

-- =====================================================================
-- Hak akses dasar per peran.
-- Staf boleh menyentuh tabel — barisnya tetap disaring RLS di atas.
-- Anon (pengunjung portal) sengaja tidak diberi akses tabel sama sekali;
-- satu-satunya pintunya adalah fungsi portal_wali di atas.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
