/**
 * Alamat (domain) tiap bagian aplikasi. Satu situs Netlify melayani semuanya:
 *   app.kasceria.my.id     → aplikasi kas (kepala sekolah & Admin/TU)
 *   tumbuh.kasceria.my.id  → Tumbuh Ceria (guru kelas)
 *   kabarananda.my.id      → portal orang tua
 *
 * Link yang dibagikan (portal wali, undangan guru) memakai domain di atas
 * kalau aplikasi sedang dibuka dari domain resmi. Di lokal (npm run dev) atau
 * alamat Netlify percobaan, link tetap memakai alamat yang sedang dibuka.
 */
export const DOMAIN = {
  kas: 'https://app.kasceria.my.id',
  guru: 'https://tumbuh.kasceria.my.id',
  ortu: 'https://kabarananda.my.id',
}

const host = () => (typeof window !== 'undefined' ? window.location.hostname : '')
const asal = () => (typeof window !== 'undefined' ? window.location.origin : '')

/** true kalau dibuka dari domain resmi (termasuk alamat lama kasceria.pro). */
const resmi = () => /(^|\.)(kasceria\.my\.id|kabarananda\.my\.id|kasceria\.pro)$/.test(host())

/** Dibuka dari domain guru kelas (tumbuh.* atau guru.* lama). */
export const diHostGuru = () => /^(tumbuh|guru)\./.test(host())

/** Dibuka dari domain portal orang tua. */
export const diHostOrtu = () => /(^|\.)kabarananda\.my\.id$/.test(host())

/** Link portal orang tua untuk satu token wali. */
export const alamatPortal = (token) => `${resmi() ? DOMAIN.ortu : asal()}/ortu/${token}`

/** Alamat aplikasi guru kelas (untuk pesan undangan). */
export const alamatGuru = () => (resmi() ? DOMAIN.guru : `${asal()}/kelas`)
