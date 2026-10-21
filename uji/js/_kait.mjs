// Kait pemuat modul (khusus skrip uji): src/lib/supabase.js diganti klien uji,
// karena file aslinya membaca import.meta.env milik Vite (tidak ada di Node).
export async function resolve(spesifier, ctx, lanjut) {
  const r = await lanjut(spesifier, ctx)
  if (r.url.endsWith('/src/lib/supabase.js')) return { url: new URL('./_supabase_uji.mjs', import.meta.url).href, shortCircuit: true }
  return r
}
