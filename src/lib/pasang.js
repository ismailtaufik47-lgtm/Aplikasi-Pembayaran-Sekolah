/**
 * PWA — "pasang Kasceria jadi aplikasi".
 *
 *  • Menangkap event `beforeinstallprompt` (Android Chrome, Samsung Internet,
 *    Chrome/Edge di laptop) SEDINI MUNGKIN — file ini di-import paling awal di
 *    main.jsx, karena event-nya bisa muncul sebelum React selesai dimuat.
 *  • iPhone/iPad tidak punya tombol pasang otomatis → popup menampilkan
 *    langkah "Bagikan › Tambah ke Layar Utama".
 *  • Mendaftarkan service worker (/sw.js) — hanya di build produksi.
 *
 * Popup boleh muncul kalau: belum terpasang (bukan mode standalone), tidak
 * sedang ditunda ("Nanti saja" = 7 hari), dan perangkat bisa memasang.
 */
import { useEffect, useState } from 'react'

const KUNCI_TUNDA = 'kasceria-pasang-tunda'
const TUNDA_HARI = 7

let tawaran = null // event beforeinstallprompt yang disimpan
let terpasang = false
const pendengar = new Set()
const kabari = () => pendengar.forEach((f) => f())

// mode uji (hanya saat `npm run dev`): /guru?pasang=android | ios | pc
const paksa = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('pasang') : null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // jangan pakai mini-infobar bawaan Chrome; kita tampilkan popup sendiri
    tawaran = e
    kabari()
  })
  window.addEventListener('appinstalled', () => {
    tawaran = null
    terpasang = true
    kabari()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

/** Sedang dibuka sebagai aplikasi terpasang (bukan di tab browser)? */
export function modeAplikasi() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || window.navigator.standalone === true
}

/** 'ios' | 'android' | 'pc' */
export function jenisPerangkat() {
  if (paksa) return paksa
  const ua = navigator.userAgent || ''
  // iPadOS 13+ mengaku "Macintosh" — bedakan lewat layar sentuh
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'pc'
}

const ditunda = () => {
  try {
    const t = Number(localStorage.getItem(KUNCI_TUNDA) || 0)
    return t && Date.now() - t < TUNDA_HARI * 864e5
  } catch {
    return false
  }
}

/** "Nanti saja" → popup tidak muncul lagi selama 7 hari. */
export function tundaPasang() {
  try {
    localStorage.setItem(KUNCI_TUNDA, String(Date.now()))
  } catch {
    /* mode privat */
  }
  kabari()
}

/** Tampilkan dialog pasang bawaan browser. → 'diterima' | 'ditolak' | 'tidak-bisa' */
export async function mintaPasang() {
  if (paksa) return 'diterima'
  if (!tawaran) return 'tidak-bisa'
  const e = tawaran
  tawaran = null // satu event hanya bisa dipakai sekali
  kabari()
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') terpasang = true
  kabari()
  return outcome === 'accepted' ? 'diterima' : 'ditolak'
}

/**
 * Status pemasangan untuk komponen React.
 *   bisa    : perangkat ini bisa memasang sekarang (ada tombol / iPhone)
 *   cara    : 'tombol' (dialog bawaan) | 'ios' (langkah manual)
 *   tawarkan: popup boleh muncul sendiri (bisa && tidak sedang ditunda)
 */
export function usePasang() {
  const [, setDetak] = useState(0)
  useEffect(() => {
    const f = () => setDetak((x) => x + 1)
    pendengar.add(f)
    return () => pendengar.delete(f)
  }, [])
  const perangkat = jenisPerangkat()
  const sudah = terpasang || (!paksa && modeAplikasi())
  const cara = perangkat === 'ios' ? 'ios' : tawaran || (paksa && paksa !== 'ios') ? 'tombol' : null
  const bisa = !sudah && !!cara
  return { bisa, cara, perangkat, sudah, tawarkan: bisa && (paksa ? true : !ditunda()) }
}
