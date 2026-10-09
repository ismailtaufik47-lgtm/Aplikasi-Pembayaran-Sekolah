-- =====================================================================
-- 0040 — Menu "Transaksi": daftar pengeluaran / pemasukan lain kas
--
--  kas_daftar() dipakai tab Pengeluaran & Pemasukan lain di menu Transaksi:
--   • hanya transaksi kas yang SAH (yang dibatalkan ada di tab Dibatalkan)
--   • saring: rentang tanggal, operasional / kegiatan, ada / tanpa nota,
--     dan cari kata (keterangan, kategori, nama kegiatan)
--   • per halaman (30 baris), urut terbaru dulu
--   • ringkasan: jumlah transaksi, total rupiah, berapa yang ada notanya
--     (ringkasan TIDAK ikut saringan nota, supaya "12 dari 15 ada nota"
--     tetap terlihat saat memilih "Tanpa nota")
--  Hak baca sama dengan buku kas: kas 'lihat' atau laporan keuangan 'lihat'.
--  Aman dijalankan ulang. Tidak mengubah data.
-- =====================================================================

create or replace function kas_daftar(
  p_jenis text, p_dari date, p_sampai date,
  p_mulai_dari int default 0, p_batas int default 30,
  p_saring text default 'semua', p_nota text default 'semua', p_cari text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sk uuid := kas_sekolah_baca();
  v_mulai date := (select mulai from kas_pengaturan where sekolah_id = v_sk);
  v_batas int := greatest(1, least(coalesce(p_batas, 30), 100));
  v_off int := greatest(0, coalesce(p_mulai_dari, 0));
  v_s text := coalesce(p_saring, 'semua');
  v_n text := coalesce(p_nota, 'semua');
  v_cari text := nullif(left(trim(coalesce(p_cari, '')), 60), '');
begin
  if p_jenis not in ('masuk', 'keluar') then raise exception 'Jenis harus masuk atau keluar.'; end if;
  if p_dari is null or p_sampai is null then raise exception 'Rentang tanggal wajib diisi.'; end if;
  if p_dari > p_sampai then raise exception 'Tanggal "dari" harus sebelum tanggal "sampai".'; end if;
  if v_s not in ('semua', 'operasional', 'kegiatan') then raise exception 'Saringan tidak dikenal.'; end if;
  if v_n not in ('semua', 'ada', 'tanpa') then raise exception 'Saringan nota tidak dikenal.'; end if;

  return (
    with dasar as (
      select k.*, coalesce(b.nama, pb.nama) as kegiatan,
             coalesce(cardinality(k.nota_file), case when k.nota is not null then 1 else 0 end) as jml_nota
        from kas k
        left join biaya b on b.id = k.biaya_id
        left join paket_biaya pb on pb.id = k.paket_id
       where k.sekolah_id = v_sk and k.jenis = p_jenis and k.dibatalkan_pada is null
         and k.tanggal between p_dari and p_sampai
         and (v_s = 'semua' or (v_s = 'kegiatan') = (k.biaya_id is not null or k.paket_id is not null))
         and (v_cari is null
              or k.keterangan ilike '%' || v_cari || '%'
              or k.kategori ilike '%' || v_cari || '%'
              or coalesce(b.nama, pb.nama, '') ilike '%' || v_cari || '%')
    ),
    tampil as (
      select * from dasar
       where v_n = 'semua' or (v_n = 'ada') = coalesce(ada_nota, false)
    )
    select jsonb_build_object(
      'item', coalesce((select jsonb_agg(jsonb_build_object(
                 'sumber', 'kas', 'id', u.id, 'tanggal', u.tanggal, 'jenis', u.jenis, 'kategori', u.kategori,
                 'nominal', u.nominal, 'keterangan', u.keterangan, 'dicatatNama', u.dicatat_nama, 'dibuatPada', u.dibuat_pada,
                 'dibatalkanPada', null, 'adaNota', coalesce(u.ada_nota, false),
                 'sebelumMulai', (v_mulai is not null and u.tanggal < v_mulai), 'jumlah', 1,
                 'biayaId', u.biaya_id, 'paketId', u.paket_id, 'grup', u.grup, 'kegiatan', u.kegiatan, 'jmlNota', u.jml_nota)
                 order by u.tanggal desc, u.dibuat_pada desc, u.id)
                from (select * from tampil order by tanggal desc, dibuat_pada desc, id offset v_off limit v_batas) u), '[]'::jsonb),
      'lanjut', (select count(*) from tampil) > v_off + v_batas,
      'jumlahTampil', (select count(*) from tampil),
      'ringkas', (select jsonb_build_object(
                    'jumlah', count(*),
                    'total', coalesce(sum(nominal), 0),
                    'adaNota', count(*) filter (where coalesce(ada_nota, false)))
                    from dasar)
    )
  );
end $$;

revoke all on function kas_daftar(text, date, date, int, int, text, text, text) from public, anon;
grant execute on function kas_daftar(text, date, date, int, int, text, text, text) to authenticated;
