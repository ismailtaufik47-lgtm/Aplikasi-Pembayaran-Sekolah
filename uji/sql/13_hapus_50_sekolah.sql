-- =====================================================================
-- 13 — HAPUS 50 SEKOLAH SIMULASI (UJI B01–B50) + KEMBALIKAN UKURAN DATABASE
--
--  Menghapus HANYA sekolah yang dibuat 11_isi_50_sekolah.sql (id tetap + nama
--  "UJI B__ TK …") beserta seluruh isinya dan 100 akun uji-beban-…@contoh.test,
--  lalu skema kerja uji_beban. Sekolah demo, sekolah Kipo (termasuk history 07c),
--  dan sekolah UJI lain (mis. UJI CONTOH dari 07) TIDAK disentuh.
--
--  BAGIAN 1  pasang prosedur penghapus                                   ±1 detik
--  BAGIAN 2  blok baris CALL saja → Run (menyimpan per sekolah)           ±1–3 menit
--  BAGIAN 3  VACUUM FULL — ukuran database kembali kecil (Run terpisah)   ±1–2 menit
--  BAGIAN 4  cek: ukuran database & sisa data uji
-- =====================================================================


-- #####################################################################
-- BAGIAN 1 — pasang prosedur penghapus (satu sekolah per COMMIT)
-- #####################################################################
create or replace procedure public.uji_beban_hapus(inout hasil text default null)
language plpgsql as $$
declare
  s record; n int := 0; v_byr bigint := 0; x bigint;
begin
  for s in select k.id, k.nama from sekolah k
            where k.nama like 'UJI B__ TK %'
              and k.id in (select md5('kasceria-beban-sekolah-' || g)::uuid from generate_series(1, 50) g)
            order by k.nama loop
    -- urutan penting: pembayaran dulu (kegiatan & paket tidak boleh dihapus selama masih ada pembayarannya)
    delete from pembayaran       where sekolah_id = s.id;
    get diagnostics x = row_count; v_byr := v_byr + x;
    delete from pembayaran_batal where sekolah_id = s.id;
    delete from kas              where sekolah_id = s.id;
    delete from paket_siswa      where sekolah_id = s.id;
    delete from sekolah          where id = s.id;          -- siswa, keanggotaan, wali, biaya, paket, profil, … ikut (on delete cascade)
    n := n + 1;
    commit;
  end loop;
  delete from auth.users where email like 'uji-beban-%@contoh.test'
     and id in (select md5('kasceria-beban-akun-' || j || '-' || g)::uuid from generate_series(1, 50) g, (values ('kepala'), ('admin')) v(j));
  get diagnostics x = row_count;
  drop schema if exists uji_beban cascade;
  commit;
  hasil := format('Dihapus: %s sekolah, %s pembayaran, %s akun. Lanjut BAGIAN 3 (VACUUM FULL).', n, v_byr, x);
end $$;
revoke all on procedure public.uji_beban_hapus(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on procedure public.uji_beban_hapus(text) from anon, authenticated';
  end if;
end $$;



-- #####################################################################
-- BAGIAN 2 — hapus (blok & jalankan baris CALL ini SAJA)
-- #####################################################################
call public.uji_beban_hapus();


-- #####################################################################
-- BAGIAN 3 — VACUUM FULL (satu perintah; jalankan sendiri, tanpa baris lain)
--   Menyusun ulang tabel supaya ruang bekas data uji benar-benar dikembalikan.
--   Selama berjalan (±1–2 menit) tabel-tabel ini terkunci — jalankan saat
--   aplikasi tidak sedang dipakai.
-- #####################################################################
vacuum (full, analyze) pembayaran, pembayaran_batal, siswa, siswa_tahun, tahun_ajaran, kas, kas_pengaturan,
                       biaya, paket_biaya, paket_siswa, wali, wali_siswa, profil, sekolah, portal_percobaan;


-- #####################################################################
-- BAGIAN 4 — cek hasil
-- #####################################################################
drop procedure if exists public.uji_beban_hapus(text);
select 'Ukuran database' as apa, pg_size_pretty(pg_database_size(current_database())) as isi
union all select 'Sisa sekolah UJI B', count(*)::text from sekolah where nama like 'UJI B__ TK %'
union all select 'Sisa akun uji-beban', count(*)::text from auth.users where email like 'uji-beban-%@contoh.test'
union all select 'Skema uji_beban', case when to_regnamespace('uji_beban') is null then 'sudah dihapus' else 'MASIH ADA' end
union all select 'Sekolah lain (tidak disentuh)', count(*)::text from sekolah where nama not like 'UJI B__ TK %'
union all select 'Tabel terbesar', (select string_agg(relname || ' ' || pg_size_pretty(pg_total_relation_size(c.oid)), ' · ' order by pg_total_relation_size(c.oid) desc)
                                      from (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                             where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 5) c);
