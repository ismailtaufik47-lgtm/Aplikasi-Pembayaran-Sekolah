// Pengganti src/lib/supabase.js untuk skrip uji: klien diganti per sekolah yang diuji.
export let supabase = null
export const modeDemo = false
export function pasangKlien(klien) { supabase = klien }
