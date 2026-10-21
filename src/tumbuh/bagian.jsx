// Potongan tampilan bersama fitur tumbuh kembang (guru, admin, portal ortu).
import { useState } from 'react'
import { infoNilai } from './skala.js'
import { urlFoto } from './api.js'
import './tumbuh.css'

const G = (jalur) => ({ size = 20, sw = 2.2, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{jalur}</svg>
)
export const IkonT = {
  kamera: G(<><path d="M4 8.5a2 2 0 0 1 2-2h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.4" /></>),
  pensil: G(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  tunas: G(<><path d="M12 21v-9" /><path d="M12 12c0-4 2.5-6.5 7-6.5 0 4.2-2.6 6.5-7 6.5z" /><path d="M12 14.5c0-3.2-2-5.3-5.8-5.3 0 3.4 2.2 5.3 5.8 5.3z" /><path d="M7.5 21h9" /></>),
  papan: G(<><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V3.5h6v1" /><path d="M8.5 11l1.6 1.6 3-3M8.5 16.5h7" /></>),
  foto: G(<><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 15.5l-4.5-4.5-8.5 8" /></>),
  kanan: G(<path d="M9 5l7 7-7 7" />),
  kiri: G(<path d="M15 5l-7 7 7 7" />),
  centang: G(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  plus: G(<path d="M12 5v14M5 12h14" />),
  kirim: G(<><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>),
  tempat: G(<><path d="M5 7h14M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  silang: G(<path d="M6 6l12 12M18 6L6 18" />),
  kunci: G(<><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  bagikan: G(<><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></>),
}

/** Pil kecil satu nilai (BB/MB/BSH/BSB atau bintang) — warna tangga hijau. */
export function PilSkala({ n, skala, besar = false, className = '' }) {
  const s = infoNilai(skala, n)
  return (
    <span className={`pil-skala skala-${n} inline-grid place-items-center whitespace-nowrap rounded-[10px] font-extrabold ${besar ? 'h-8 min-w-[46px] px-2 text-[12.5px]' : 'h-6 min-w-[38px] px-1.5 text-[11px]'} ${className}`}>
      {s.kode}
    </span>
  )
}

/** Foto dari Storage (alamat) atau data URL (sebelum diunggah). */
export function Foto({ alamat, className = '', onClick }) {
  const [gagal, setGagal] = useState(false)
  const src = alamat?.startsWith('data:') ? alamat : urlFoto(alamat)
  return (
    <span className={`block overflow-hidden rounded-[16px] bg-isi ${className}`} onClick={onClick}>
      {!gagal && src
        ? <img src={src} alt="" loading="lazy" onError={() => setGagal(true)} className="block h-full w-full object-cover" />
        : <span className="grid h-full w-full place-items-center text-muted"><IkonT.foto size={22} /></span>}
    </span>
  )
}

/** Grid foto: 1 foto lebar, 2–3 foto berdampingan. */
export function DeretFoto({ foto = [], className = '', buka }) {
  if (!foto.length) return null
  return (
    <div className={`grid gap-0.5 ${foto.length > 1 ? 'grid-cols-2' : ''} ${className}`}>
      {foto.map((f, i) => (
        <Foto key={f} alamat={f} onClick={() => buka?.(f)}
          className={`!rounded-none ${foto.length === 3 && i === 0 ? 'col-span-2 aspect-[16/9]' : foto.length === 1 ? 'aspect-[16/10]' : 'aspect-[4/3]'} ${buka ? 'cursor-zoom-in' : ''}`} />
      ))}
    </div>
  )
}

/** Lihat foto ukuran penuh. */
export function LihatFoto({ alamat, tutup }) {
  if (!alamat) return null
  return (
    <div className="absolute inset-0 z-[60] grid animate-fade place-items-center bg-black/85 p-4" onClick={tutup}>
      <button aria-label="Tutup" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"><IkonT.silang size={20} /></button>
      <img src={alamat.startsWith('data:') ? alamat : urlFoto(alamat)} alt="" className="max-h-full max-w-full rounded-[14px] object-contain" />
    </div>
  )
}

/** Sakelar hidup/mati sederhana. */
export function Sakelar({ hidup, ubah, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={hidup} aria-label={label} disabled={disabled}
      onClick={() => ubah(!hidup)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${hidup ? 'bg-ok shadow-[inset_0_-2px_0_#169A48]' : 'bg-[#CBD3E2] dark:bg-white/20'}`}>
      <i className={`absolute top-1 block h-5 w-5 rounded-full bg-white transition-all ${hidup ? 'right-1' : 'left-1'}`} />
    </button>
  )
}
