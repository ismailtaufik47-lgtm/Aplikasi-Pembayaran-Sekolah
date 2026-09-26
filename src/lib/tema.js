/**
 * Mode tampilan: 'terang' | 'gelap' | 'otomatis' (ikut pengaturan HP/laptop).
 *
 * Pilihan disimpan di perangkat ini saja (localStorage), bukan di database,
 * jadi tiap HP/laptop bisa punya pilihan sendiri — sama seperti aplikasi
 * pada umumnya. Kelas `dark` dipasang di <html>; warnanya diatur di
 * src/index.css (variabel warna) — komponen tidak perlu diubah satu-satu.
 *
 * Script kecil di index.html sudah memasang kelas ini SEBELUM aplikasi
 * dimuat, supaya layar tidak berkedip putih sesaat di mode gelap.
 */
import { useSyncExternalStore } from 'react'

const KUNCI = 'tema'
const PILIHAN = ['terang', 'gelap', 'otomatis']
const DEFAULT = 'terang'

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

function baca() {
  try {
    const v = localStorage.getItem(KUNCI)
    return PILIHAN.includes(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

let pilihan = typeof window !== 'undefined' ? baca() : DEFAULT
const pendengar = new Set()

/** Mode yang benar-benar tampil sekarang: 'terang' | 'gelap'. */
export const modeAktif = (p = pilihan) => (p === 'otomatis' ? (media?.matches ? 'gelap' : 'terang') : p)

function terapkan() {
  if (typeof document === 'undefined') return
  const gelap = modeAktif() === 'gelap'
  document.documentElement.classList.toggle('dark', gelap)
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', gelap ? 'dark' : 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', gelap ? '#0F131B' : '#3B6EF6')
}

function kabari() {
  terapkan()
  pendengar.forEach((f) => f())
}

media?.addEventListener?.('change', () => pilihan === 'otomatis' && kabari())

export function setTema(p) {
  if (!PILIHAN.includes(p)) return
  pilihan = p
  try {
    localStorage.setItem(KUNCI, p)
  } catch {
    /* mode privat — tetap berlaku sampai halaman ditutup */
  }
  kabari()
}

/** Ganti cepat terang ↔ gelap (untuk tombol ikon). */
export const alihTema = () => setTema(modeAktif() === 'gelap' ? 'terang' : 'gelap')

const langganan = (f) => {
  pendengar.add(f)
  return () => pendengar.delete(f)
}
const potret = () => `${pilihan}|${modeAktif()}`

/** Hook: { pilihan, aktif, setTema, alihTema } — ikut berubah saat tema diganti. */
export function useTema() {
  const [p, aktif] = useSyncExternalStore(langganan, potret, () => `${DEFAULT}|terang`).split('|')
  return { pilihan: p, aktif, setTema, alihTema }
}

terapkan()
