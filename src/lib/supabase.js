import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const kunci = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Kalau kredensial belum diisi, aplikasi jalan dengan data contoh. */
export const modeDemo = !url || !kunci

export const supabase = modeDemo
  ? null
  : createClient(url, kunci, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
