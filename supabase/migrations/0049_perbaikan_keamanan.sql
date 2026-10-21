-- =====================================================================
-- 0049 — PERBAIKAN KEAMANAN (hasil review keamanan v35)
--
--  1. Aturan akses lama dari 0013 masih aktif berdampingan dengan aturan
--     baru 0029. Akibatnya akun mana pun di sekolah itu (termasuk kepala
--     sekolah yang mestinya "lihat saja") bisa lewat API langsung:
--       • MENGUBAH nominal / MENGHAPUS pembayaran tanpa jejak pembatalan,
--       • mengubah / menghapus biaya kegiatan, wali (tautan portal).
--     → aturan lama dihapus. Pembayaran tidak bisa diubah/dihapus langsung
--       sama sekali; pembatalan tetap lewat batalkan_pembayaran() (diarsipkan).
--  2. Kolom langganan lama (trial_berakhir, langganan_berakhir) bisa diubah
--     staf sendiri, dan langganan_aktif() masih membacanya → masa sewa
--     habis bisa "diperpanjang" sendiri untuk kas & pembatalan.
--     → kolom itu ikut dikunci; langganan_aktif() memakai hitungan yang sama
--       dengan pengunci pembayaran (hitung_status_langganan).
--  3. buka_kunci_pin() bisa dipanggil TANPA login dan membuka kunci PIN
--     siapa saja (cek peran salah saat pemanggil tidak punya profil).
--  4. Kode aktivasi Admin/TU (6 huruf) bisa ditebak terus-menerus tanpa batas
--     dan tidak pernah kedaluwarsa. → dibatasi 5 salah per 15 menit per akun,
--     kode berlaku 7 hari, dibuat dengan pengacak kriptografis.
--     (Butuh src/lib/api.js versi v35: aktivasiKode membaca {galat}.)
--  5. Fungsi bantu internal yang menerima id sekolah/siswa tidak lagi bisa
--     dipanggil langsung dari luar (spp_tarif, spp_target, kegiatan_wajib,
--     langganan_aktif, sinkron_status_langganan, ai_*_siswa, ai_kelas_cocok).
--  6. TRUNCATE dicabut dari anon & authenticated di semua tabel.
--
--  Tidak mengubah data. Aman dijalankan berulang kali.
-- =====================================================================

-- ---------- 1. aturan akses lama 0013 ----------
drop policy if exists pembayaran_tulis on pembayaran;   -- insert hanya syarat langganan (tanpa cek hak akses)
drop policy if exists pembayaran_ubah  on pembayaran;
drop policy if exists pembayaran_hapus on pembayaran;
drop policy if exists biaya_ubah       on biaya;        -- biaya_tulis (0029, cek hak 'biaya') tetap
drop policy if exists biaya_hapus      on biaya;
drop policy if exists wali_ubah        on wali;         -- wali_tulis (0029, cek hak 'siswa') tetap
drop policy if exists wali_hapus       on wali;
drop policy if exists wali_siswa_hapus on wali_siswa;   -- wali_siswa_tulis (0029) tetap

-- wali_siswa: wali sekolah sendiri HANYA boleh dihubungkan ke siswa sekolah sendiri
-- (dulu yang dicek hanya walinya → admin bisa menautkan siswa sekolah lain ke portalnya)
drop policy if exists wali_siswa_tulis on wali_siswa;
create policy wali_siswa_tulis on wali_siswa for all
  using (boleh('siswa') and exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya()))
  with check (boleh('siswa')
              and exists (select 1 from wali w where w.id = wali_id and w.sekolah_id = sekolah_saya())
              and exists (select 1 from siswa x where x.id = siswa_id and x.sekolah_id = sekolah_saya()));

-- pembayaran tidak pernah diubah / dihapus langsung (batalkan_pembayaran berjalan sebagai pemilik)
revoke update, delete on pembayaran from anon, authenticated;

-- ---------- 6. TRUNCATE (tidak pernah dipakai aplikasi) ----------
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- 2. kolom langganan lama ikut dikunci ----------
create or replace function lindungi_kolom_sekolah()
returns trigger language plpgsql set search_path = public as $$
declare
  baru jsonb := to_jsonb(new);
  lama jsonb := to_jsonb(old);
begin
  -- Hanya perubahan LANGSUNG dari akun pengguna (lewat API) yang diperiksa.
  -- Fungsi resmi (security definer) berjalan sebagai pemilik database.
  if current_user <> 'authenticated' or saya_admin_aplikasi() then
    return new;
  end if;
  -- lewat to_jsonb supaya tetap jalan walau sebagian kolom lama sudah tidak ada
  if baru -> 'langganan_sampai'    is distinct from lama -> 'langganan_sampai'
     or baru -> 'trial_mulai'      is distinct from lama -> 'trial_mulai'
     or baru -> 'harga_per_siswa'  is distinct from lama -> 'harga_per_siswa'
     or baru -> 'dinonaktifkan_admin' is distinct from lama -> 'dinonaktifkan_admin'
     or baru -> 'status_langganan' is distinct from lama -> 'status_langganan'
     or baru -> 'ai_batas_harian'  is distinct from lama -> 'ai_batas_harian'
     or baru -> 'hak_akses'        is distinct from lama -> 'hak_akses'
     -- 0049: kolom lama 0013 & catatan admin
     or baru -> 'trial_berakhir'   is distinct from lama -> 'trial_berakhir'
     or baru -> 'langganan_berakhir' is distinct from lama -> 'langganan_berakhir'
     or baru -> 'catatan_langganan' is distinct from lama -> 'catatan_langganan'
     or baru -> 'jatuh_tempo'      is distinct from lama -> 'jatuh_tempo'
     or baru -> 'dibuat_pada'      is distinct from lama -> 'dibuat_pada'
     or baru -> 'id'               is distinct from lama -> 'id' then
    raise exception 'Data langganan & hak akses hanya bisa diubah oleh admin aplikasi.' using errcode = '42501';
  end if;
  if (baru -> 'nama' is distinct from lama -> 'nama'
      or baru -> 'kepala_sekolah' is distinct from lama -> 'kepala_sekolah'
      or baru -> 'alamat' is distinct from lama -> 'alamat'
      or baru -> 'wa' is distinct from lama -> 'wa'
      or baru -> 'rekening' is distinct from lama -> 'rekening') and not boleh('sekolah') then
    raise exception 'Akun ini tidak punya akses mengubah profil sekolah.' using errcode = '42501';
  end if;
  if (baru -> 'spp_nominal' is distinct from lama -> 'spp_nominal'
      or baru -> 'tanggal_jatuh_tempo' is distinct from lama -> 'tanggal_jatuh_tempo') and not boleh('biaya') then
    raise exception 'Akun ini tidak punya akses mengubah nominal SPP.' using errcode = '42501';
  end if;
  return new;
end $$;

-- langganan_aktif(): sumber kebenaran sama dengan pengunci pembayaran (cegah_jika_langganan_habis)
do $do$
begin
  if to_regprocedure('public.hitung_status_langganan(timestamptz, date, boolean)') is not null then
    execute $f$
      create or replace function langganan_aktif(p_sekolah_id uuid default null)
      returns boolean language sql stable security definer set search_path = public as $$
        select coalesce((
          select (hitung_status_langganan(s.trial_mulai, s.langganan_sampai, s.dinonaktifkan_admin) ->> 'status') <> 'kadaluarsa'
            from sekolah s where s.id = coalesce(p_sekolah_id, sekolah_saya())), false)
      $$ $f$;
  elsif to_regprocedure('public.hitung_status_langganan(timestamptz, date)') is not null then
    execute $f$
      create or replace function langganan_aktif(p_sekolah_id uuid default null)
      returns boolean language sql stable security definer set search_path = public as $$
        select coalesce((
          select (hitung_status_langganan(s.trial_mulai, s.langganan_sampai) ->> 'status') <> 'kadaluarsa'
            from sekolah s where s.id = coalesce(p_sekolah_id, sekolah_saya())), false)
      $$ $f$;
  else
    raise notice '0049: hitung_status_langganan tidak ditemukan — langganan_aktif() tidak diubah.';
  end if;
end $do$;

-- ---------- 3. buka kunci PIN: wajib login sebagai kepala sekolah yang sama ----------
create or replace function buka_kunci_pin(p_profil_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sekolah_pemanggil uuid;
  v_peran_pemanggil text;
  v_sekolah_target uuid;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk. Silakan login ulang.' using errcode = '42501';
  end if;
  select sekolah_id, peran into v_sekolah_pemanggil, v_peran_pemanggil from profil where id = auth.uid();
  if v_peran_pemanggil is distinct from 'kepala' then
    raise exception 'Cuma kepala sekolah yang bisa membuka kunci PIN.' using errcode = '42501';
  end if;
  select sekolah_id into v_sekolah_target from profil where id = p_profil_id;
  if v_sekolah_target is null or v_sekolah_target is distinct from v_sekolah_pemanggil then
    raise exception 'Staf itu tidak ditemukan di sekolah Anda.';
  end if;
  update profil set pin_terkunci = false, pin_percobaan_gagal = 0 where id = p_profil_id;
end $$;
revoke all on function buka_kunci_pin(uuid) from public, anon;
grant execute on function buka_kunci_pin(uuid) to authenticated;

-- ---------- 4. kode aktivasi: pengacak kriptografis, berlaku 7 hari, batas salah ----------
create or replace function kode_acak()
returns text language plpgsql volatile set search_path = public as $$
declare
  aksara text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 aksara, tanpa 0/O dan 1/I
  b bytea := uuid_send(gen_random_uuid());           -- 16 byte acak kriptografis (byte 0–5 bebas dari bit versi)
  hasil text := '';
  i int;
begin
  for i in 0..5 loop
    hasil := hasil || substr(aksara, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return hasil;
end $$;
revoke all on function kode_acak() from public, anon, authenticated;

create table if not exists aktivasi_percobaan (
  pengguna     uuid primary key,
  gagal        int not null default 0,
  kunci_sampai timestamptz,
  diperbarui   timestamptz not null default now()
);
alter table aktivasi_percobaan enable row level security;
revoke all on aktivasi_percobaan from anon, authenticated;

create or replace function aktivasi_kode(p_kode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kode    kode_aktivasi%rowtype;
  v_sekolah text;
  v_nama    text;
  c         aktivasi_percobaan%rowtype;
  v_batas   int := 5;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk. Silakan login ulang.';
  end if;
  if exists (select 1 from profil where id = auth.uid()) then
    raise exception 'Akun ini sudah terhubung ke sekolah lain.';
  end if;

  select * into c from aktivasi_percobaan where pengguna = auth.uid();
  if c.kunci_sampai is not null and c.kunci_sampai > now() then
    return jsonb_build_object('galat', format('Terlalu banyak kode salah. Coba lagi dalam %s menit.',
                                              greatest(1, ceil(extract(epoch from c.kunci_sampai - now()) / 60)::int)));
  end if;

  select * into v_kode from kode_aktivasi
   where kode = upper(trim(coalesce(p_kode, ''))) and dipakai_oleh is null
     and dibuat_pada > now() - interval '7 days';

  if not found then
    -- dicatat (TIDAK raise, supaya hitungan salah tersimpan)
    insert into aktivasi_percobaan as a (pengguna, gagal, diperbarui) values (auth.uid(), 1, now())
    on conflict (pengguna) do update
      set gagal = case when a.kunci_sampai is not null and a.kunci_sampai <= now() then 1 else a.gagal + 1 end,
          kunci_sampai = null, diperbarui = now()
    returning * into c;
    if c.gagal >= v_batas then
      update aktivasi_percobaan set gagal = 0, kunci_sampai = now() + interval '15 minutes' where pengguna = auth.uid();
      return jsonb_build_object('galat', 'Terlalu banyak kode salah. Coba lagi dalam 15 menit.');
    end if;
    return jsonb_build_object('galat', 'Kode aktivasi tidak ditemukan atau sudah dipakai (kode berlaku 7 hari).');
  end if;

  v_nama := nama_dari_google(auth.uid());

  insert into profil (id, sekolah_id, nama, peran)
  values (auth.uid(), v_kode.sekolah_id, v_nama, v_kode.peran);

  update kode_aktivasi set dipakai_oleh = auth.uid(), dipakai_pada = now() where id = v_kode.id;
  delete from aktivasi_percobaan where pengguna = auth.uid();

  select nama into v_sekolah from sekolah where id = v_kode.sekolah_id;
  return jsonb_build_object('sekolahId', v_kode.sekolah_id, 'sekolah', v_sekolah, 'peran', v_kode.peran);
end $$;
revoke all on function aktivasi_kode(text) from public, anon;
grant execute on function aktivasi_kode(text) to authenticated;

-- ---------- 5. fungsi bantu internal: tidak dipanggil langsung dari luar ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.spp_tarif(uuid, text, text)', 'public.spp_target(uuid, text, integer)', 'public.kegiatan_wajib(uuid, uuid)',
    'public.sinkron_status_langganan(uuid)',
    'public.ai_kegiatan_siswa(uuid)', 'public.ai_ringkas_siswa(uuid, date)', 'public.ai_spp_siswa(uuid, date)',
    'public.ai_kelas_cocok(uuid, text)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- langganan_aktif(): dicabut hanya kalau tidak ada lagi aturan akses (RLS) yang memakainya
do $$
declare n int;
begin
  select count(*) into n from pg_policy p
   where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'langganan_aktif'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'langganan_aktif';
  if n = 0 then
    revoke all on function public.langganan_aktif(uuid) from public, anon, authenticated;
  else
    revoke all on function public.langganan_aktif(uuid) from public, anon;
    raise notice '0049: % aturan akses masih memakai langganan_aktif() — fungsi tetap bisa dipakai akun login. Lihat 14_uji_keamanan.sql.', n;
  end if;
end $$;
