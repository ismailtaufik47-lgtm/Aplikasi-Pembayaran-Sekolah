-- =====================================================================
-- Perbaikan: status_pin() perlu juga mengembalikan pin_aktif, supaya
-- layar Masuk bisa deteksi otomatis "akun ini sudah punya PIN atau
-- belum" TANPA query tambahan yang rapuh (percobaan sebelumnya pakai
-- subquery mentah di dalam .filter() PostgREST, yang tidak benar-benar
-- jalan — PostgREST tidak mendukung embed SQL subquery seperti itu).
--
-- Perlu drop dulu karena PostgreSQL tidak mengizinkan ganti bentuk
-- kolom RETURNS TABLE cuma dengan create or replace.
-- =====================================================================

drop function if exists status_pin(text);

create or replace function status_pin(p_email text)
returns table(terkunci boolean, percobaan int, aktif boolean)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return query select false, 0, false;
    return;
  end if;
  return query select p.pin_terkunci, p.pin_percobaan_gagal, p.pin_aktif from profil p where p.id = v_id;
end $$;

revoke all on function status_pin(text) from public;
grant execute on function status_pin(text) to anon, authenticated;
