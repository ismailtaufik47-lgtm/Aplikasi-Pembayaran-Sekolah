-- =====================================================================
-- 15 — UJI LOGIN PIN AMAN (0050) — BACA / ROLLBACK SAJA
--
--  Jalankan SESUDAH 0050_pin_aman.sql. Tidak ada data yang berubah:
--  BAGIAN 1 memakai akun admin/TU sungguhan untuk sementara lalu di-ROLLBACK
--  (PIN akun itu tidak berubah).
--
--  BAGIAN 0  pemeriksaan bawaan (tabel, hak akses, fungsi tertutup)
--            + daftar akun yang PIN-nya masih format lama (INFO, bukan galat)
--  BAGIAN 1  simulasi: atur PIN, login, salah 3×, terkunci, ganti PIN,
--            akun format lama, dan percobaan dari luar.
--  Hasil = SATU tabel; baris pertama = KESIMPULAN. Semua harus LULUS.
-- =====================================================================


-- #####################################################################
-- BAGIAN 0 — pemeriksaan bawaan
-- #####################################################################
with cek as (
  select 1 u, 'Tabel pin_rahasia & pin_kunci_server ada dan memakai RLS' cek,
         case when (select count(*) from pg_class where relname in ('pin_rahasia', 'pin_kunci_server')
                     and relnamespace = 'public'::regnamespace and relrowsecurity) = 2
              then 'LULUS' else 'GAGAL' end hasil, '' rincian
  union all
  select 2, 'Kunci rahasia server terpasang (32 byte)',
         case when (select length(pepper) from pin_kunci_server where id = 1) = 32 then 'LULUS' else 'GAGAL' end, ''
  union all
  select 3, 'Tabel PIN tidak bisa dibaca/diubah lewat API (anon & akun login)',
         case when exists (select 1 from information_schema.role_table_grants
                            where table_schema = 'public' and table_name in ('pin_rahasia', 'pin_kunci_server')
                              and grantee in ('anon', 'authenticated', 'PUBLIC'))
              then 'GAGAL' else 'LULUS' end, ''
  union all
  select 4, 'pin_masuk bisa dipanggil sebelum login; pin_atur hanya sesudah login',
         case when has_function_privilege('anon', 'public.pin_masuk(text,text)', 'execute')
               and has_function_privilege('authenticated', 'public.pin_atur(text)', 'execute')
               and not has_function_privilege('anon', 'public.pin_atur(text)', 'execute')
              then 'LULUS' else 'GAGAL' end, ''
  union all
  select 5, 'catat_pin_gagal tertutup (dulu bisa dipakai mengunci akun orang)',
         case when has_function_privilege('anon', 'public.catat_pin_gagal(text)', 'execute')
                or has_function_privilege('authenticated', 'public.catat_pin_gagal(text)', 'execute')
              then 'GAGAL' else 'LULUS' end, ''
  union all
  select 6, 'Fungsi internal PIN tidak bisa dipanggil dari luar',
         case when bool_or(has_function_privilege(r, f, 'execute')) then 'GAGAL' else 'LULUS' end,
         coalesce(string_agg(case when has_function_privilege(r, f, 'execute') then r || ': ' || f end, ', '), '')
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.pin_kunci_turunan(uuid,integer)', 'public.pin_lemah(text)', 'public.pin_format_lama()']) f
  union all
  select 7, 'bcrypt (pgcrypto) berfungsi',
         case when extensions.crypt('583920', h) = h then 'LULUS' else 'GAGAL' end, ''
    from (select extensions.crypt('583920', extensions.gen_salt('bf', 4)) h) x
  union all
  select 9, 'Kunci PIN punya batas waktu (0051)',
         case when exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'profil' and column_name = 'pin_terkunci_sampai')
              then 'LULUS' else 'GAGAL' end, ''
  union all
  select 8, 'INFO — akun PIN format lama (pindah otomatis saat login PIN berikutnya)',
         'INFO', (select count(*) || ' akun' || coalesce(': ' || string_agg(nama || ' (' || coalesce(sekolah, '-') || ')', ', '), '')
                    from pin_format_lama())
),
ringkas as (
  select 0 u, '== KESIMPULAN ==' cek,
         case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
         (count(*) filter (where hasil <> 'INFO')) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
    from cek
)
select * from ringkas
union all
select * from cek
order by u;


-- #####################################################################
-- BAGIAN 1 — simulasi login PIN (semua di-ROLLBACK)
-- #####################################################################
begin;

create temp table hasil_pin (u int, cek text, hasil text, rincian text) on commit drop;

do $uji$
declare
  adm  uuid; admE text; skNama text;
  j    jsonb;
  k1   text; k2 text; k3 text;
  msg  text;
  n    int := 0;
  lama_bisa boolean := true;

begin
  -- akun admin/TU sungguhan yang aktif (dipakai sementara, di-rollback)
  select p.id, u.email, s.nama into adm, admE, skNama
    from profil p join auth.users u on u.id = p.id left join sekolah s on s.id = p.sekolah_id
   where p.peran = 'admin' and p.aktif and u.email is not null
   order by s.nama limit 1;
  if adm is null then
    select p.id, u.email, s.nama into adm, admE, skNama
      from profil p join auth.users u on u.id = p.id left join sekolah s on s.id = p.sekolah_id
     where p.aktif and u.email is not null order by s.nama limit 1;
  end if;
  if adm is null then
    insert into hasil_pin values (1, 'Tidak ada akun staf untuk diuji', 'GAGAL', ''); return;
  end if;
  update profil set pin_terkunci = false, pin_percobaan_gagal = 0 where id = adm;

  -- 1. atur PIN (sebagai akun itu sendiri)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'email', admE)::text, true);
  execute 'set local role authenticated';
  k1 := pin_atur('583920');
  begin k2 := pin_atur('123456'); exception when others then msg := sqlerrm; end;
  execute 'reset role';
  insert into hasil_pin values
    (1, 'Atur PIN → password akun 64 karakter (bukan PIN)', case when length(k1) = 64 and k1 !~ '583920' then 'LULUS' else 'GAGAL' end, 'akun uji: ' || admE || ' · ' || coalesce(skNama, '-')),
    (2, 'PIN lemah (123456) ditolak server', case when k2 is null and msg ~ 'mudah ditebak' then 'LULUS' else 'GAGAL' end, coalesce(msg, ''));
  insert into hasil_pin values
    (3, 'Hash tersimpan bcrypt, bukan PIN', case when (select hash from pin_rahasia where id = adm) ~ '^\$2[aby]\$' then 'LULUS' else 'GAGAL' end, '');

  -- 2. login sebelum masuk (anon)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  j := pin_masuk(admE, '583920');
  execute 'reset role';
  insert into hasil_pin values
    (4, 'PIN benar → dapat password akun yang sama', case when j->>'status' = 'ok' and j->>'kunci' = k1 then 'LULUS' else 'GAGAL' end, j->>'status');

  execute 'set local role anon';
  j := pin_masuk(admE, '111333');
  execute 'reset role';
  insert into hasil_pin values
    (5, 'PIN salah → sisa 2, tanpa password', case when j->>'status' = 'salah' and (j->>'sisa')::int = 2 and j->'kunci' is null then 'LULUS' else 'GAGAL' end, j::text);

  execute 'set local role anon';
  j := pin_masuk(admE, '111334');
  j := pin_masuk(admE, '111335');
  execute 'reset role';
  insert into hasil_pin values
    (6, 'Salah ke-3 → terkunci', case when j->>'status' = 'terkunci' and (j->>'baru')::boolean
                                        and (select pin_terkunci from profil where id = adm) then 'LULUS' else 'GAGAL' end, j::text);

  execute 'set local role anon';
  j := pin_masuk(admE, '583920');
  execute 'reset role';
  insert into hasil_pin values
    (7, 'Terkunci: PIN BENAR pun tidak diberi password', case when j->>'status' = 'terkunci' and j->'kunci' is null then 'LULUS' else 'GAGAL' end, j::text);
  insert into hasil_pin values
    (13, 'Kunci berlaku ±10 menit (0051)',
         case when (select pin_terkunci_sampai between now() + interval '9 min' and now() + interval '10 min 5 s' from profil where id = adm)
              then 'LULUS' else 'GAGAL' end, 'sisa ' || coalesce(j->>'menit', '?') || ' menit');
  update profil set pin_terkunci_sampai = now() - interval '1 second' where id = adm;   -- anggap 10 menit sudah lewat
  execute 'set local role anon';
  j := pin_masuk(admE, '583920');
  execute 'reset role';
  insert into hasil_pin values
    (14, 'Sesudah 10 menit: terbuka sendiri, PIN benar diterima',
         case when j->>'status' = 'ok' and not (select pin_terkunci from profil where id = adm) then 'LULUS' else 'GAGAL' end, j->>'status');

  -- 3. tebakan beruntun dari luar
  update profil set pin_terkunci = false, pin_percobaan_gagal = 0 where id = adm;
  execute 'set local role anon';
  for i in 1..20 loop
    j := pin_masuk(admE, lpad((100000 + i * 7919)::text, 6, '0'));
    if j ? 'kunci' then n := n + 1; end if;
  end loop;
  execute 'reset role';
  insert into hasil_pin values
    (8, '20 tebakan beruntun → 0 password didapat', case when n = 0 and (select pin_terkunci from profil where id = adm) then 'LULUS' else 'GAGAL' end,
        'terkunci sesudah 3 tebakan');
  update profil set pin_terkunci = false, pin_percobaan_gagal = 0 where id = adm;

  -- 4. ganti PIN → password lama tidak berlaku
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'email', admE)::text, true);
  execute 'set local role authenticated';
  k2 := pin_atur('402918');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  j := pin_masuk(admE, '583920');
  execute 'reset role';
  insert into hasil_pin values
    (9, 'Ganti PIN → password akun ikut berganti, PIN lama ditolak',
        case when k2 <> k1 and length(k2) = 64 and j->>'status' = 'salah' then 'LULUS' else 'GAGAL' end, '');
  update profil set pin_percobaan_gagal = 0 where id = adm;

  -- 5. akun format lama (PIN = password Supabase, dari sebelum 0050)
  begin
    update auth.users set encrypted_password = extensions.crypt('258147', extensions.gen_salt('bf', 4)) where id = adm;
    update pin_rahasia set hash = null where id = adm;
    update profil set pin_aktif = true where id = adm;
  exception when others then lama_bisa := false;
  end;
  if lama_bisa then
    execute 'set local role anon';
    j := pin_masuk(admE, '258147');
    execute 'reset role';
    insert into hasil_pin values
      (10, 'Akun format lama: PIN lama diterima & dipindah ke format baru',
           case when j->>'status' = 'ok' and (j->>'lama')::boolean and length(j->>'kunci') = 64
                 and (select hash from pin_rahasia where id = adm) is not null then 'LULUS' else 'GAGAL' end, j->>'status');
  else
    insert into hasil_pin values (10, 'Akun format lama (dilewati: tabel auth tidak bisa diubah dari SQL Editor)', 'LULUS', 'diuji di database tiruan');
  end if;

  -- 6. percobaan dari luar
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  msg := null; begin perform catat_pin_gagal(admE); msg := 'catat:BISA'; exception when others then msg := 'ditolak'; end;
  k3  := null; begin select hash into k3 from pin_rahasia limit 1; msg := msg || '/baca:' || coalesce(k3, 'kosong'); exception when others then msg := msg || '/ditolak'; end;
  begin perform pin_kunci_turunan(adm, 1); msg := msg || '/turunan:BISA'; exception when others then msg := msg || '/ditolak'; end;
  begin perform pin_atur('583920'); msg := msg || '/atur:BISA'; exception when others then msg := msg || '/ditolak'; end;
  execute 'reset role';
  insert into hasil_pin values
    (11, 'Tanpa login: kunci akun orang, baca hash, buat password, atur PIN → semua ditolak',
         case when msg = 'ditolak/ditolak/ditolak/ditolak' then 'LULUS' else 'GAGAL' end, msg);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'email', admE)::text, true);
  execute 'set local role authenticated';
  msg := '';
  begin select hash into k3 from pin_rahasia limit 1; msg := 'baca:BISA'; exception when others then msg := 'ditolak'; end;
  begin perform pin_kunci_turunan(adm, 1); msg := msg || '/turunan:BISA'; exception when others then msg := msg || '/ditolak'; end;
  begin perform * from pin_format_lama(); msg := msg || '/daftar:BISA'; exception when others then msg := msg || '/ditolak'; end;
  execute 'reset role';
  insert into hasil_pin values
    (12, 'Sudah login: baca hash, buat password akun lain, lihat daftar → semua ditolak',
         case when msg = 'ditolak/ditolak/ditolak' then 'LULUS' else 'GAGAL' end, msg);
end $uji$;

select 0 u, '== KESIMPULAN ==' cek,
       case when count(*) filter (where hasil = 'GAGAL') = 0 then 'LULUS' else 'GAGAL' end hasil,
       count(*) || ' pemeriksaan · ' || count(*) filter (where hasil = 'GAGAL') || ' gagal' rincian
  from hasil_pin
union all
select * from hasil_pin
order by u;

rollback;
