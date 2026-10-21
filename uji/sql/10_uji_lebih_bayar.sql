-- =====================================================================
-- 10 — Uji pengaman "lebih bayar" (0046). Semua di-rollback.
--
--  Butuh sekolah contoh dari 07_sekolah_contoh_3_tahun.sql.
--  Hasil benar: "LULUS — 9 kelompok uji lebih bayar".
-- =====================================================================
begin;

create or replace function pg_temp.gagal(t text) returns void language plpgsql as $$ begin raise exception 'GAGAL %', t; end $$;
-- jalankan perintah; true kalau ditolak dengan pesan lebih bayar
create or replace function pg_temp.ditolak(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  if sqlerrm like '%jadi berlebih%' then return true; end if;
  raise;
end $$;

do $$
declare
  sk uuid := md5('kasceria-contoh-sekolah')::uuid;
  ta text := tahun_ajaran_berjalan();
  s1 uuid; s2 uuid; kls text; bk uuid; v jsonb; d jsonb; n int; pesan text;
begin
  if not exists (select 1 from sekolah where id = sk) then
    raise exception 'Jalankan dulu 07_sekolah_contoh_3_tahun.sql';
  end if;

  -- siswa kelas B yang SPP Juli tahun ini lunas
  select st.siswa_id, st.kelas into s1, kls from siswa_tahun st join siswa z on z.id = st.siswa_id and z.aktif
   where st.sekolah_id = sk and st.tahun_ajaran = ta and st.kelas = 'B' and st.mulai = 0 and st.selesai is null
     and (select coalesce(sum(nominal), 0) from pembayaran p where p.siswa_id = st.siswa_id and p.jenis = 'spp' and p.tahun_ajaran = ta and p.periode = 0)
         = spp_target(st.siswa_id, ta, 0)
   order by st.siswa_id limit 1;
  if s1 is null then perform pg_temp.gagal('tidak ada siswa kelas B yang lunas Juli'); end if;

  -- 1. tarif kelas B diturunkan di bawah yang sudah dibayar → ditolak & menyebut nama siswa
  begin
    update tahun_ajaran set spp_kelas = spp_kelas - 'B' where sekolah_id = sk and kode = ta;  -- B ikut tarif standar (lebih murah)
    perform pg_temp.gagal('1 tarif turun diterima');
  exception when others then
    pesan := sqlerrm;
    if pesan not like '%jadi berlebih%' or pesan not like '%' || (select nama from siswa where id = s1) || '%' and pesan not like '%+% lagi%' then
      perform pg_temp.gagal('1 pesan: ' || pesan);
    end if;
  end;
  raise notice 'OK 1 tarif SPP turun ditolak';

  -- 2. tarif dinaikkan → boleh
  update tahun_ajaran set spp_kelas = jsonb_set(spp_kelas, '{B}', to_jsonb((spp_kelas ->> 'B')::int + 5000)) where sekolah_id = sk and kode = ta;
  update tahun_ajaran set spp_kelas = jsonb_set(spp_kelas, '{B}', to_jsonb((spp_kelas ->> 'B')::int - 5000)) where sekolah_id = sk and kode = ta;
  raise notice 'OK 2 tarif naik / kembali boleh';

  -- 3. siswa dipindah ke kelas yang tarifnya lebih murah → ditolak
  if not pg_temp.ditolak(format('update siswa_tahun set kelas = %L where siswa_id = %L and tahun_ajaran = %L', 'A', s1, ta)) then
    perform pg_temp.gagal('3 pindah kelas murah diterima');
  end if;
  raise notice 'OK 3 pindah ke kelas lebih murah ditolak';

  -- 4. kegiatan yang sudah dibayar: tanggal dipindah ke luar masa terdaftar → ditolak; nominal diturunkan → ditolak
  select b.id, p.siswa_id into bk, s2 from biaya b join pembayaran p on p.biaya_id = b.id
   join siswa_tahun st on st.siswa_id = p.siswa_id and st.tahun_ajaran = b.tahun_ajaran
   where b.sekolah_id = sk and b.tahun_ajaran = ta and b.tanggal is not null and st.mulai > 0
   limit 1;
  if bk is null then
    -- tidak ada siswa pindahan yang bayar kegiatan → pakai siswa s1, mulai dipindah lewat tanggal
    select b.id into bk from biaya b join pembayaran p on p.biaya_id = b.id and p.siswa_id = s1
     where b.sekolah_id = sk and b.tahun_ajaran = ta and b.tanggal is not null limit 1;
    s2 := s1;
  end if;
  if bk is null then perform pg_temp.gagal('4 tidak ada kegiatan berbayar untuk diuji'); end if;
  if not pg_temp.ditolak(format('update siswa_tahun set mulai = %s where siswa_id = %L and tahun_ajaran = %L', 11, s2, ta)) then
    perform pg_temp.gagal('4a masa terdaftar membuat kegiatan tidak ikut diterima');
  end if;
  raise notice 'OK 4a masa terdaftar yang membuang kegiatan berbayar ditolak';

  -- 5. tanggal kegiatan dipindah ke bulan sebelum siswa masuk → ditolak (kalau ada siswa pindahan yang membayar)
  if exists (select 1 from pembayaran p join siswa_tahun st on st.siswa_id = p.siswa_id and st.tahun_ajaran = ta
              where p.biaya_id = bk and st.mulai > 0) then
    if not pg_temp.ditolak(format('update biaya set tanggal = make_date(split_part(%L, ''/'', 1)::int, 7, 1) where id = %L', ta, bk)) then
      perform pg_temp.gagal('5 tanggal kegiatan ke luar masa diterima');
    end if;
  end if;
  if not pg_temp.ditolak(format('update biaya set nominal = 1000 where id = %L', bk)) then
    perform pg_temp.gagal('5b nominal kegiatan diturunkan diterima');
  end if;
  update biaya set nominal = nominal + 10000 where id = bk;   -- naik boleh
  raise notice 'OK 5 kegiatan: nominal turun ditolak, naik boleh';

  -- 6. data lama yang sudah berlebih tidak menghalangi perubahan lain
  alter table pembayaran disable trigger pembayaran_cek_zlunas;
  insert into pembayaran (sekolah_id, siswa_id, jenis, periode, tahun_ajaran, keterangan, nominal, metode)
  values (sk, s1, 'spp', 0, ta, 'uji lebih bayar lama', 10000, 'Tunai');
  alter table pembayaran enable trigger pembayaran_cek_zlunas;
  update tahun_ajaran set spp_nominal = spp_nominal + 1000 where sekolah_id = sk and kode = ta;   -- tidak menyentuh kelas B
  update tahun_ajaran set spp_nominal = spp_nominal - 1000 where sekolah_id = sk and kode = ta;
  raise notice 'OK 6 kelebihan lama tidak menghalangi perubahan lain';

  -- 7. Tanya SAKU rekap bulan = status SPP (kelebihan dilaporkan terpisah)
  perform set_config('request.jwt.claims', json_build_object('sub', md5('kasceria-contoh-akun-kepala')::uuid)::text, true);
  execute 'set local role authenticated';
  v := ai_status_spp(0, null);
  d := ai_rekap_bulan(0);
  execute 'reset role';
  if (d -> 'spp_bulan_ini' ->> 'sudah_masuk_rupiah')::numeric <> (v ->> 'terkumpul')::numeric then
    perform pg_temp.gagal(format('7 rekap %s ≠ status %s', d -> 'spp_bulan_ini' ->> 'sudah_masuk_rupiah', v ->> 'terkumpul'));
  end if;
  if (d -> 'spp_bulan_ini' ->> 'kelebihan_bayar_rupiah')::numeric < 10000 then
    perform pg_temp.gagal('7b kelebihan bayar tidak dilaporkan ' || (d -> 'spp_bulan_ini')::text);
  end if;
  raise notice 'OK 7 rekap SAKU = status SPP, kelebihan terpisah';

  -- 8. menghapus siswa (beserta pembayarannya) tetap boleh
  select z.id into s2 from siswa z where z.sekolah_id = sk and z.aktif and z.id <> s1
     and exists (select 1 from pembayaran p where p.siswa_id = z.id and p.jenis = 'spp') limit 1;
  if s2 is null then perform pg_temp.gagal('8 tidak ada siswa untuk dihapus'); end if;
  -- (PMB/DU yang sudah dibayar memang mencegah hapus siswa — dibersihkan dulu, di luar yang diuji di sini)
  delete from pembayaran where siswa_id = s2 and jenis = 'paket';
  delete from paket_siswa where siswa_id = s2;
  delete from siswa where id = s2;
  raise notice 'OK 8 hapus siswa tetap boleh';

  -- 9. lewat fungsi aplikasi (sebagai Admin/TU): pesan sampai ke layar
  perform set_config('request.jwt.claims', json_build_object('sub', md5('kasceria-contoh-akun-admin')::uuid)::text, true);
  execute 'set local role authenticated';
  begin
    perform atur_tarif_spp(ta, 100000, '{}'::jsonb);
    perform pg_temp.gagal('9 atur_tarif_spp turun diterima');
  exception when others then
    pesan := sqlerrm;
    if pesan not like 'Tarif SPP % yang baru membuat pembayaran%' then perform pg_temp.gagal('9 pesan: ' || pesan); end if;
  end;
  execute 'reset role';
  raise notice 'OK 9 pesan penolakan dari atur_tarif_spp: %', left(pesan, 160);
end $$;

select 'LULUS — 9 kelompok uji lebih bayar (semua di-rollback)' as hasil;
rollback;
