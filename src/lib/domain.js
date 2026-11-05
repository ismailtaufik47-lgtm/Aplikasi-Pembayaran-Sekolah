/**
 * Alamat (domain) tiap bagian aplikasi. Satu situs Netlify melayani semuanya:
 *   app.kasceria.my.id     → aplikasi kas (kepala sekolah & Admin/TU)
 *   tumbuh.kasceria.my.id  → Tumbuh Ceria (guru kelas)
 *   kabarananda.my.id      → portal orang tua
 *
 * Link yang dibagikan (portal wali, undangan guru) memakai domain di atas
 * kalau aplikasi sedang dibuka dari domain resmi. Di lokal (npm run dev) atau
 * alamat Netlify percobaan, link tetap memakai alamat yang sedang dibuka.
 *
 * UJI LOKAL pemisahan domain (npm run dev, tanpa mengubah setelan komputer):
 *   http://app.kasceria.localhost:5173      → seperti app.kasceria.my.id
 *   http://tumbuh.kasceria.localhost:5173   → seperti tumbuh.kasceria.my.id
 *   http://kabarananda.localhost:5173       → seperti kabarananda.my.id
 * (login Google tidak jalan di alamat uji ini — pakai login PIN.)
 */
export const DOMAIN = {
  kas: 'https://app.kasceria.my.id',
  guru: 'https://tumbuh.kasceria.my.id',
  ortu: 'https://kabarananda.my.id',
}

const host = () => (typeof window !== 'undefined' ? window.location.hostname : '')
const asal = () => (typeof window !== 'undefined' ? window.location.origin : '')

/** Alamat uji lokal *.localhost (lihat catatan di atas). */
const ujiLokal = () => /(^|\.)(kasceria|kabarananda)\.localhost$/.test(host())

/** Domain tujuan: domain resmi, atau padanannya di alamat uji lokal. */
function domain(bagian) {
  if (!ujiLokal()) return DOMAIN[bagian]
  const port = window.location.port ? `:${window.location.port}` : ''
  const nama = { kas: 'app.kasceria', guru: 'tumbuh.kasceria', ortu: 'kabarananda' }[bagian]
  return `${window.location.protocol}//${nama}.localhost${port}`
}

/** true kalau dibuka dari domain resmi (termasuk alamat lama kasceria.pro) atau alamat uji lokal. */
const resmi = () => ujiLokal() || /(^|\.)(kasceria\.my\.id|kabarananda\.my\.id|kasceria\.pro)$/.test(host())

/** Dibuka dari domain guru kelas (tumbuh.* atau guru.* lama). */
export const diHostGuru = () => /^(tumbuh|guru)\./.test(host())

/** Dibuka dari domain portal orang tua. */
export const diHostOrtu = () => /(^|\.)kabarananda\.(my\.id|localhost)$/.test(host())

/** Dibuka dari domain aplikasi kas (app.*). */
export const diHostKas = () => resmi() && /^app\./.test(host())

/**
 * Domain lain yang seharusnya melayani alamat ini, atau null kalau sudah benar.
 * Hanya berlaku di domain resmi (localhost biasa & netlify.app tetap satu alamat untuk semua).
 *   tumbuh.*     : /guru, /admin → app ; /ortu → kabarananda
 *   app.*        : /kelas → tumbuh ; /ortu → kabarananda
 *   kabarananda  : diatur di main.jsx (selain /ortu & /verifikasi dibelokkan ke /ortu)
 */
export function domainSeharusnya(pathname) {
  const bagian = /^\/(guru|admin)(\/|$)/.test(pathname) ? 'kas'
    : /^\/kelas(\/|$)/.test(pathname) ? 'guru'
    : /^\/ortu(\/|$)/.test(pathname) ? 'ortu' : null
  if (!bagian) return null
  if (diHostGuru() && bagian !== 'guru') return domain(bagian)
  if (diHostKas() && bagian !== 'kas') return domain(bagian)
  return null
}

/** Alamat aplikasi kas (tombol "Buka aplikasi sekolah" di aplikasi guru). */
export const alamatKas = () => (resmi() ? `${domain('kas')}/guru` : '/guru')

/** Link portal orang tua untuk satu token wali. */
export const alamatPortal = (token) => `${resmi() ? domain('ortu') : asal()}/ortu/${token}`

/** Alamat aplikasi guru kelas (untuk pesan undangan). */
export const alamatGuru = () => (resmi() ? domain('guru') : `${asal()}/kelas`)
