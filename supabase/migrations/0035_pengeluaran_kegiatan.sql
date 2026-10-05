-- =====================================================================
-- 0035 — Rincian pengeluaran per kegiatan + foto nota di Supabase Storage
--
--   • Pengeluaran kas bisa diberi LABEL kegiatan (biaya kegiatan, atau
--     paket PMB / daftar ulang). Saldo kas tetap satu — label hanya untuk
--     rekap "uang masuk vs terpakai" per kegiatan.
--   • Satu kali catat bisa berisi beberapa RINCIAN (sewa bus, konsumsi, …);
--     tiap rincian = satu baris kas, dikelompokkan dengan kolom `grup`.
--   • Foto nota (maks 3 per catatan) disimpan di Storage bucket privat
--     "nota", folder per sekolah: <sekolah_id>/<uuid>.jpg. Database hanya
--     menyimpan alamatnya (kolom nota_file). Foto lama yang masih berupa
--     teks di kolom `nota` dipindahkan otomatis oleh aplikasi
--     (kas_pindah_nota), sedikit demi sedikit.
--   • Pengeluaran lama boleh diberi / diganti label kegiatannya
--     (kas_atur_kegiatan). Nominal & tanggal tidak bisa diubah.
--   • SAKU bisa membaca dana per kegiatan (ai_dana_kegiatan).
--
-- Butuh 0028–0033. Aman dijalankan berulang kali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. kolom baru di kas
-- ---------------------------------------------------------------------
alter table kas add column if not exists biaya_id  uuid references biaya(id) on delete set null;
alter table kas add column if not exists paket_id  uuid references paket_biaya(id) on delete set null;
alter table kas add column if not exists grup      uuid;
alter table kas add column if not exists nota_file text[];

alter table kas drop constraint if exists kas_label_satu;
alter table kas add constraint kas_label_satu check (biaya_id is null or paket_id is null);
alter table kas drop constraint if exists kas_nota_file_maks;
alter table kas add constraint kas_nota_file_maks check (nota_file is null or cardinality(nota_file) between 1 and 3);

create index if not exists kas_biaya_idx on kas(biaya_id) where biaya_id is not null;
create index if not exists kas_paket_idx on kas(paket_id) where paket_id is not null;
create index if not exists kas_grup_idx  on kas(grup) where grup is not null;

-- ada_nota sekarang juga menghitung foto di Storage
do $$
declare v text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v
    from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.kas'::regclass and a.attname = 'ada_nota';
  if v is null or position('nota_file' in v) = 0 then
    alter table kas drop column if exists ada_nota;
    alter table kas add column ada_nota boolean
      generated always as (nota is not null or coalesce(cardinality(nota_file), 0) > 0) stored;
  end if;
end $$;

comment on column kas.biaya_id  is 'Label: pengeluaran ini untuk kegiatan (biaya) apa. Hanya untuk rekap.';
comment on column kas.paket_id  is 'Label: pengeluaran ini untuk paket PMB / daftar ulang apa. Hanya untuk rekap.';
comment on column kas.grup      is 'Rincian yang dicatat bersamaan (satu nota) memakai grup yang sama.';
comment on column kas.nota_file is 'Alamat foto nota di Storage bucket "nota" (maks 3). Kolom nota (teks) = format lama.';

-- Label & nota harus milik sekolah yang sama; label hanya untuk pengeluaran.
create or replace function kas_cek_label() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text;
begin
  if new.biaya_id is not null or new.paket_id is not null then
    if new.jenis <> 'keluar' then
      raise exception 'Label kegiatan hanya untuk pengeluaran.';
    end if;
    if new.biaya_id is not null and not exists (select 1 from biaya where id = new.biaya_id and sekolah_id = new.sekolah_id) then
      raise exception 'Kegiatan tidak ditemukan.';
    end if;
    if new.paket_id is not null and not exists (select 1 from paket_biaya where id = new.paket_id and sekolah_id = new.sekolah_id) then
      raise exception 'Paket PMB / daftar ulang tidak ditemukan.';
    end if;
  end if;
  if new.nota_file is not null then
    foreach f in array new.nota_file loop
      if f is null or f !~ ('^' || new.sekolah_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'Alamat foto nota tidak sah.';
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists kas_cek_label on kas;
create trigger kas_cek_label before insert or update of biaya_id, paket_id, nota_file, jenis on kas
  for each row execute function kas_cek_label();

-- ---------------------------------------------------------------------
-- 2. Storage: bucket privat "nota", folder per sekolah
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Skema storage tidak ada (bukan Supabase) — bucket nota dilewati.';
    return;
  end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('nota', 'nota', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 1048576,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  exception when undefined_column then
    insert into storage.buckets (id, name, public) values ('nota', 'nota', false)
    on conflict (id) do update set public = false;
  end;

  execute 'drop policy if exists nota_baca on storage.objects';
  execute 'drop policy if exists nota_unggah on storage.objects';
  execute 'drop policy if exists nota_hapus on storage.objects';
  -- lihat: staf sekolah itu yang boleh melihat kas / laporan keuangan
  execute $p$create policy nota_baca on storage.objects for select to authenticated using (
    bucket_id = 'nota'
    and (storage.foldername(name))[1] = public.sekolah_saya()::text
    and (public.boleh('kas', 'lihat') or public.boleh('lap_keuangan', 'lihat')))$p$;
  -- unggah: hanya yang boleh mencatat kas, hanya ke folder sekolahnya
  execute $p$create policy nota_unggah on storage.objects for insert to authenticated with check (
    bucket_id = 'nota'
    and (storage.foldername(name))[1] = public.sekolah_saya()::text
    and public.boleh('kas'))$p$;
  -- hapus: hanya foto yang BELUM dipakai transaksi mana pun (gagal simpan)
  execute $p$create policy nota_hapus on storage.objects for delete to authenticated using (
    bucket_id = 'nota'
    and (storage.foldername(name))[1] = public.sekolah_saya()::text
    and public.boleh('kas')
    and not exists (select 1 from public.kas k where k.nota_file @> array[name]))$p$;
exception when insufficient_privilege then
  raise exception 'Tidak bisa membuat aturan akses foto nota (Storage). Jalankan file ini dari Supabase › SQL Editor (akun pemilik proyek), bukan dari akun lain.';
end $$;

/** Foto ada di Storage (dilewati kalau bukan Supabase, mis. uji lokal). */
create or replace function kas_nota_ada(p_path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if to_regclass('storage.objects') is null then return true; end if;
  execute 'select exists (select 1 from storage.objects where bucket_id = ''nota'' and name = $1)' into v using p_path;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 3. catat satu atau beberapa rincian sekaligus
--    p_rincian: [{ "uraian": "Sewa bus", "kategori": "Transportasi", "nominal": 1800000 }, …]
--    pemasukan lain: tepat 1 rincian & tanpa label kegiatan.
-- ---------------------------------------------------------------------
create or replace function kas_catat_rincian(
  p_jenis text, p_tanggal date, p_rincian jsonb,
  p_biaya uuid default null, p_paket uuid default null, p_nota text[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p profil%rowtype; g kas_pengaturan%rowtype; r record; x jsonb;
  v_grup uuid := gen_random_uuid(); v_total bigint := 0; v_n int; v_nom bigint; f text;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mencatat kas.'; end if;
  if p_jenis is null or p_jenis not in ('masuk', 'keluar') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if p_tanggal > kas_hari_ini() then raise exception 'Tanggal tidak boleh di masa depan.'; end if;
  if p_rincian is null or jsonb_typeof(p_rincian) <> 'array' then raise exception 'Rincian belum diisi.'; end if;
  v_n := jsonb_array_length(p_rincian);
  if v_n = 0 then raise exception 'Rincian belum diisi.'; end if;
  if v_n > 20 then raise exception 'Maksimal 20 rincian sekali catat.'; end if;
  if p_biaya is not null and p_paket is not null then raise exception 'Pilih satu kegiatan saja.'; end if;
  if p_jenis = 'masuk' and (v_n <> 1 or p_biaya is not null or p_paket is not null) then
    raise exception 'Pemasukan lain dicatat satu per satu, tanpa label kegiatan.';
  end if;
  if p_nota is not null then
    if cardinality(p_nota) = 0 then p_nota := null;
    elsif cardinality(p_nota) > 3 then raise exception 'Maksimal 3 foto nota.';
    end if;
  end if;
  if p_nota is not null then
    foreach f in array p_nota loop
      if f is null or f !~ ('^' || p.sekolah_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'Alamat foto nota tidak sah.';
      end if;
      if not kas_nota_ada(f) then raise exception 'Foto nota belum terunggah. Coba lagi.'; end if;
    end loop;
  end if;

  for x in select * from jsonb_array_elements(p_rincian) loop
    if jsonb_typeof(x) <> 'object' then raise exception 'Format rincian tidak dikenal.'; end if;
    if length(trim(coalesce(x->>'kategori', ''))) = 0 then raise exception 'Kategori tiap rincian wajib diisi.'; end if;
    if p_jenis = 'keluar' and (p_biaya is not null or p_paket is not null) and length(trim(coalesce(x->>'uraian', ''))) = 0 then
      raise exception 'Uraian tiap rincian wajib diisi (mis. "Sewa bus 1 unit").';
    end if;
    begin
      v_nom := (x->>'nominal')::bigint;
    exception when others then
      raise exception 'Nominal rincian harus berupa angka.';
    end;
    if coalesce(v_nom, 0) <= 0 then raise exception 'Nominal tiap rincian harus lebih dari nol.'; end if;
    if v_nom > 1000000000000 then raise exception 'Nominal terlalu besar.'; end if;
    v_total := v_total + v_nom;
  end loop;
  if v_total > 1000000000000 then raise exception 'Total terlalu besar.'; end if;

  perform wajib_langganan_aktif(p.sekolah_id);
  perform kas_kunci(p.sekolah_id);
  select * into g from kas_pengaturan where sekolah_id = p.sekolah_id;
  if not found then
    raise exception 'Isi saldo awal kas dulu (cukup sekali) sebelum mencatat transaksi kas.';
  end if;
  if p_tanggal < g.mulai then
    raise exception 'Tanggal % sebelum tanggal mulai kas (%). Transaksi sebelum tanggal itu sudah termasuk saldo awal — kalau memang perlu dicatat, ubah dulu tanggal mulai saldo awal.',
      kas_tgl(p_tanggal), kas_tgl(g.mulai);
  end if;
  if p_jenis = 'keluar' then
    select * into r from kas_saldo_terendah(p.sekolah_id, p_tanggal);
    if v_total > r.saldo then
      if r.tanggal = p_tanggal then
        raise exception 'Saldo kas tidak cukup. Saldo per % hanya %, total pengeluaran %.',
          kas_tgl(p_tanggal), kas_rp(r.saldo), kas_rp(v_total);
      else
        raise exception 'Saldo kas tidak cukup. Pengeluaran tanggal % paling banyak % supaya saldo tidak minus pada %.',
          kas_tgl(p_tanggal), kas_rp(greatest(r.saldo, 0)), kas_tgl(r.tanggal);
      end if;
    end if;
  end if;

  insert into kas (sekolah_id, jenis, tanggal, kategori, nominal, keterangan, nota_file, biaya_id, paket_id, grup, dicatat_oleh, dicatat_nama)
  select p.sekolah_id, p_jenis, p_tanggal, left(trim(e->>'kategori'), 40), (e->>'nominal')::bigint,
         nullif(left(trim(coalesce(e->>'uraian', '')), 300), ''), p_nota, p_biaya, p_paket,
         case when v_n > 1 or p_biaya is not null or p_paket is not null or p_nota is not null then v_grup end, p.id, p.nama
    from jsonb_array_elements(p_rincian) with ordinality as t(e, n)
   order by n;
  return v_grup;
end $$;

-- ---------------------------------------------------------------------
-- 4. beri / ganti label kegiatan pengeluaran yang sudah tercatat
-- ---------------------------------------------------------------------
create or replace function kas_atur_kegiatan(p_id uuid, p_biaya uuid default null, p_paket uuid default null, p_kategori text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype; k kas%rowtype;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mengatur kas.'; end if;
  if p_biaya is not null and p_paket is not null then raise exception 'Pilih satu kegiatan saja.'; end if;
  perform wajib_langganan_aktif(p.sekolah_id);
  select * into k from kas where id = p_id and sekolah_id = p.sekolah_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan.'; end if;
  if k.dibatalkan_pada is not null then raise exception 'Transaksi yang dibatalkan tidak bisa diubah.'; end if;
  if k.jenis <> 'keluar' then raise exception 'Label kegiatan hanya untuk pengeluaran.'; end if;
  update kas
     set biaya_id = p_biaya, paket_id = p_paket,
         kategori = coalesce(nullif(left(trim(coalesce(p_kategori, '')), 40), ''), kategori)
   where id = k.id;
end $$;

-- ---------------------------------------------------------------------
-- 5. pindahkan foto nota lama (teks di kolom nota) ke Storage
-- ---------------------------------------------------------------------
create or replace function kas_pindah_nota(p_id uuid, p_path text)
returns void
language plpgsql security definer set search_path = public as $$
declare p profil%rowtype;
begin
  select * into p from profil where id = auth.uid();
  if not found then raise exception 'Akun ini belum terhubung ke sekolah mana pun.'; end if;
  if not boleh('kas') then raise exception 'Akun ini tidak punya akses mengatur kas.'; end if;
  if p_path is null or p_path !~ ('^' || p.sekolah_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Alamat foto nota tidak sah.';
  end if;
  if not kas_nota_ada(p_path) then raise exception 'Foto nota belum terunggah.'; end if;
  update kas set nota_file = array[p_path], nota = null
   where id = p_id and sekolah_id = p.sekolah_id and nota is not null and nota_file is null;
end $$;

-- ---------------------------------------------------------------------
-- 6. baca: riwayat (dengan label & saringan) dan pengeluaran per kegiatan
-- ---------------------------------------------------------------------
drop function if exists kas_riwayat(date, date, int, int);
create or replace function kas_riwayat(p_dari date, p_sampai date, p_mulai_dari int default 0, p_batas int default 30,
                                       p_saring text default 'semua')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk uuid := kas_sekolah_baca();
  v_mulai date := (select mulai from kas_pengaturan where sekolah_id = v_sk);
  v_batas int := greatest(1, least(coalesce(p_batas, 30), 100));
  v_off int := greatest(0, coalesce(p_mulai_dari, 0));
  v_s text := coalesce(p_saring, 'semua');
begin
  if p_dari is null or p_sampai is null then raise exception 'Rentang tanggal wajib diisi.'; end if;
  if p_dari > p_sampai then raise exception 'Tanggal "dari" harus sebelum tanggal "sampai".'; end if;
  if v_s not in ('semua', 'operasional', 'kegiatan') then raise exception 'Saringan tidak dikenal.'; end if;

  return (
    with semua as (
      select 'kas' as sumber, k.id, k.tanggal, k.jenis, k.kategori, k.nominal::bigint as nominal, k.keterangan,
             k.dicatat_nama, k.dibuat_pada as urut, k.dibatalkan_pada, k.dibatalkan_nama, k.alasan_batal, k.ada_nota,
             (v_mulai is not null and k.tanggal < v_mulai) as sebelum_mulai, 1 as n,
             k.biaya_id, k.paket_id, k.grup, coalesce(b.nama, pb.nama) as kegiatan,
             coalesce(cardinality(k.nota_file), case when k.nota is not null then 1 else 0 end) as jml_nota
        from kas k
        left join biaya b on b.id = k.biaya_id
        left join paket_biaya pb on pb.id = k.paket_id
       where k.sekolah_id = v_sk and k.tanggal between p_dari and p_sampai
         and (v_s = 'semua' or (v_s = 'kegiatan') = (k.biaya_id is not null or k.paket_id is not null))
      union all
      select 'bayar', null, x.tanggal, 'masuk', 'Pembayaran orang tua', sum(x.nominal)::bigint, null,
             null, max(x.urut), null, null, null, false, false, count(*)::int,
             null, null, null, null, 0
        from kas_gerakan(v_sk, p_dari, p_sampai) x
       where x.sumber = 'bayar' and v_s <> 'kegiatan'
       group by x.tanggal
    ),
    urut as (select * from semua order by tanggal desc, (sumber = 'kas') desc, urut desc, id nulls last),
    hitung as (
      select x.jenis, x.nominal
        from kas_gerakan(v_sk, p_dari, p_sampai) x
        left join kas k on x.sumber = 'kas' and k.id = x.id
       where v_s = 'semua'
          or (v_s = 'kegiatan' and (k.biaya_id is not null or k.paket_id is not null))
          or (v_s = 'operasional' and (x.sumber = 'bayar' or (k.biaya_id is null and k.paket_id is null)))
    )
    select jsonb_build_object(
      'item', coalesce((select jsonb_agg(jsonb_build_object(
                 'sumber', u.sumber, 'id', u.id, 'tanggal', u.tanggal, 'jenis', u.jenis, 'kategori', u.kategori,
                 'nominal', u.nominal, 'keterangan', u.keterangan, 'dicatatNama', u.dicatat_nama, 'dibuatPada', u.urut,
                 'dibatalkanPada', u.dibatalkan_pada, 'dibatalkanNama', u.dibatalkan_nama, 'alasanBatal', u.alasan_batal,
                 'adaNota', u.ada_nota, 'sebelumMulai', u.sebelum_mulai, 'jumlah', u.n,
                 'biayaId', u.biaya_id, 'paketId', u.paket_id, 'grup', u.grup, 'kegiatan', u.kegiatan, 'jmlNota', u.jml_nota))
                from (select * from urut offset v_off limit v_batas) u), '[]'::jsonb),
      'lanjut', (select count(*) from semua) > v_off + v_batas,
      'total', (select jsonb_build_object(
                  'masuk', coalesce(sum(nominal) filter (where jenis = 'masuk'), 0),
                  'keluar', coalesce(sum(nominal) filter (where jenis = 'keluar'), 0),
                  'jumlah', count(*))
                  from hitung)
    )
  );
end $$;

/** Semua pengeluaran berlabel kegiatan yang SAH (tidak dibatalkan), untuk Laporan › Kegiatan. */
create or replace function kas_pengeluaran_kegiatan()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id, 'tanggal', k.tanggal, 'kategori', k.kategori, 'nominal', k.nominal,
             'uraian', k.keterangan, 'biayaId', k.biaya_id, 'paketId', k.paket_id, 'grup', k.grup,
             'notaFile', coalesce(to_jsonb(k.nota_file), '[]'::jsonb), 'notaLama', k.nota is not null,
             'dicatatNama', k.dicatat_nama, 'dibuatPada', k.dibuat_pada)
           order by k.tanggal, k.dibuat_pada)
      from kas k
     where k.sekolah_id = v_sk and k.dibatalkan_pada is null and k.jenis = 'keluar'
       and (k.biaya_id is not null or k.paket_id is not null)), '[]'::jsonb);
end $$;

/** Alamat foto nota satu transaksi (Storage) — foto format lama lewat kolom nota. */
create or replace function kas_nota_file(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := kas_sekolah_baca(); k kas%rowtype;
begin
  select * into k from kas where id = p_id and sekolah_id = v_sk;
  if not found then return jsonb_build_object('file', '[]'::jsonb, 'lama', null); end if;
  return jsonb_build_object('file', coalesce(to_jsonb(k.nota_file), '[]'::jsonb), 'lama', k.nota);
end $$;

-- ---------------------------------------------------------------------
-- 7. SAKU: dana per kegiatan (uang masuk vs terpakai)
-- ---------------------------------------------------------------------
create or replace function ai_dana_kegiatan(p_kegiatan text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sk uuid := ai_kas_akses();
begin
  return (
    with keg as (
      select 'kegiatan' as jenis, b.id, b.nama, b.urutan as urut,
             (select coalesce(sum(p.nominal), 0) from pembayaran p where p.biaya_id = b.id and p.jenis = 'kegiatan') as masuk
        from biaya b where b.sekolah_id = v_sk and b.aktif
      union all
      select pb.jenis, pb.id, pb.nama, 1000,
             (select coalesce(sum(p.nominal), 0) from pembayaran p where p.paket_id = pb.id and p.jenis = 'paket')
        from paket_biaya pb where pb.sekolah_id = v_sk and pb.aktif
    ),
    dipilih as (
      select * from keg
       where nullif(trim(p_kegiatan), '') is null or lower(nama) like '%' || lower(trim(p_kegiatan)) || '%'
    ),
    kel as (
      select coalesce(k.biaya_id, k.paket_id) as kid, k.kategori, k.nominal, k.keterangan, k.tanggal
        from kas k
       where k.sekolah_id = v_sk and k.dibatalkan_pada is null and k.jenis = 'keluar'
         and (k.biaya_id is not null or k.paket_id is not null)
    )
    select jsonb_build_object(
      'catatan_untuk_ai', 'Uang masuk = pembayaran orang tua untuk kegiatan itu. Terpakai = pengeluaran kas berlabel kegiatan itu. ' ||
                          'Sisa = uang masuk − terpakai (minus = nombok, ditutup dari kas sekolah). Pakai angka apa adanya.',
      'kegiatan', coalesce((select jsonb_agg(jsonb_build_object(
          'kegiatan', d.nama,
          'uang_masuk', d.masuk,
          'terpakai', (select coalesce(sum(nominal), 0) from kel where kid = d.id),
          'sisa', d.masuk - (select coalesce(sum(nominal), 0) from kel where kid = d.id),
          'per_kategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', kategori, 'nominal', n) order by n desc)
                                      from (select kategori, sum(nominal) n from kel where kid = d.id group by kategori) q), '[]'),
          'rincian', coalesce((select jsonb_agg(jsonb_build_object('tanggal', tanggal, 'uraian', keterangan, 'kategori', kategori, 'nominal', nominal)
                                                order by tanggal)
                                 from kel where kid = d.id), '[]'))
        order by d.urut, d.nama) from dipilih d), '[]')
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- izin
-- ---------------------------------------------------------------------
revoke all on function kas_cek_label() from public, anon, authenticated;
revoke all on function kas_nota_ada(text) from public, anon, authenticated;
revoke all on function kas_catat_rincian(text, date, jsonb, uuid, uuid, text[]) from public, anon;
revoke all on function kas_atur_kegiatan(uuid, uuid, uuid, text) from public, anon;
revoke all on function kas_pindah_nota(uuid, text) from public, anon;
revoke all on function kas_riwayat(date, date, int, int, text) from public, anon;
revoke all on function kas_pengeluaran_kegiatan() from public, anon;
revoke all on function kas_nota_file(uuid) from public, anon;
revoke all on function ai_dana_kegiatan(text) from public, anon;
grant execute on function kas_catat_rincian(text, date, jsonb, uuid, uuid, text[]) to authenticated;
grant execute on function kas_atur_kegiatan(uuid, uuid, uuid, text) to authenticated;
grant execute on function kas_pindah_nota(uuid, text) to authenticated;
grant execute on function kas_riwayat(date, date, int, int, text) to authenticated;
grant execute on function kas_pengeluaran_kegiatan() to authenticated;
grant execute on function kas_nota_file(uuid) to authenticated;
grant execute on function ai_dana_kegiatan(text) to authenticated;
