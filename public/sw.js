/*
 * Service worker Kasceria.
 *
 *  • Halaman (navigasi): SELALU ambil dari internet dulu, supaya setiap
 *    deploy baru langsung terpakai. Kalau internet putus → /offline.html.
 *  • File build (/assets/*, namanya sudah mengandung hash): simpan di cache,
 *    sehingga aplikasi terbuka lebih cepat.
 *  • Data (Supabase), Google Fonts, dan semua permintaan selain GET TIDAK
 *    disentuh sama sekali — data keuangan tidak pernah disimpan di cache.
 *
 * Ganti VERSI kalau isi offline.html / ikon berubah.
 */
const VERSI = 'kasceria-v1'
const CACHE_ASET = `${VERSI}-aset`
const CACHE_DASAR = `${VERSI}-dasar`
const DASAR = ['/offline.html', '/icons/icon-192.png', '/favicon.svg']
const MAKS_ASET = 80

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_DASAR).then((c) => c.addAll(DASAR)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSI)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function rapikanAset() {
  const c = await caches.open(CACHE_ASET)
  const ks = await c.keys()
  for (let i = 0; i < ks.length - MAKS_ASET; i++) await c.delete(ks[i])
}

self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET') return
  const u = new URL(r.url)
  if (u.origin !== self.location.origin) return

  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/offline.html')))
    return
  }

  if (u.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(r).then(
        (ada) =>
          ada ||
          fetch(r).then((res) => {
            if (res.ok) {
              const salin = res.clone()
              caches.open(CACHE_ASET).then((c) => c.put(r, salin)).then(rapikanAset)
            }
            return res
          }),
      ),
    )
    return
  }

  if (DASAR.includes(u.pathname)) {
    e.respondWith(caches.match(r).then((ada) => ada || fetch(r)))
  }
})
