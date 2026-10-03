/**
 * Identitas merek Kasceria — "Sahabat Keuangan Sekolah".
 *
 *  - LogoKasceria   : koin tersenyum yang "memakai" atap sekolah, di ubin biru
 *  - TulisanKasceria: "Kas" biru tua + "ceria" warna-warni, bertepi putih
 *                     seperti stiker (tepi diatur kelas .merek-tepi di index.css)
 *  - Tagline        : pil putih "Sahabat Keuangan Sekolah"
 *
 * Gambar logo yang sama juga ada di public/favicon.svg (ikon tab browser) dan
 * src/lib/logoKasceria.js (PNG untuk kop kuitansi/invoice sewa aplikasi).
 */

export const TAGLINE = 'Sahabat Keuangan Sekolah'

/** Gambar koin + atap saja (tanpa ubin biru) — dipakai di dalam LogoKasceria. */
export function KoinKasceria({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true">
      <ellipse cx="30" cy="53.5" rx="15" ry="2.6" fill="#2A55CC" opacity=".35" />
      <circle cx="30" cy="35" r="17" fill="#FFD84D" stroke="#F2B21F" strokeWidth="2.6" />
      <circle cx="30" cy="35" r="12.6" fill="none" stroke="#FFE9A0" strokeWidth="1.6" />
      <circle cx="24.6" cy="34" r="2" fill="#5A3E00" /><circle cx="35.4" cy="34" r="2" fill="#5A3E00" />
      <circle cx="25.3" cy="33.3" r=".7" fill="#fff" /><circle cx="36.1" cy="33.3" r=".7" fill="#fff" />
      <ellipse cx="21" cy="39" rx="2.6" ry="1.7" fill="#FF9E7A" opacity=".8" />
      <ellipse cx="39" cy="39" rx="2.6" ry="1.7" fill="#FF9E7A" opacity=".8" />
      <path d="M25.4 39.2 q4.6 4.4 9.2 0" stroke="#5A3E00" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M13.5 22.5 L30 9.5 L46.5 22.5 Z" fill="#FF7A45" />
      <rect x="12" y="21" width="36" height="3.6" rx="1.8" fill="#E0582F" />
      <circle cx="30" cy="9.6" r="2.6" fill="#FFD84D" stroke="#F2B21F" strokeWidth="1" />
    </svg>
  )
}

/**
 * Logo aplikasi (ubin biru bertepi putih). `size` dalam px; kalau tidak
 * diisi, ukurannya diatur lewat className (dipakai untuk layar pendek).
 */
export function LogoKasceria({ size, className = '' }) {
  const gaya = size ? { width: size, height: size, borderRadius: Math.round(size * 0.29), borderWidth: Math.max(3, Math.round(size / 19)) } : undefined
  return (
    <div
      role="img"
      aria-label="Logo Kasceria"
      className={`logo-kasceria grid shrink-0 place-items-center border-white bg-[linear-gradient(160deg,#6A95FF_0%,#3B6EF6_70%)] shadow-[0_10px_22px_rgba(42,85,204,.28)] dark:border-[#26304A] ${className}`}
      style={gaya}
    >
      <KoinKasceria className="h-[80%] w-[80%]" />
    </div>
  )
}

const HURUF_CERIA = [
  ['c', 'text-[#FF6B4A] dark:text-[#FF8A6B]'],
  ['e', 'text-[#F59E0B] dark:text-[#FFC23D]'],
  ['r', 'text-[#22B573] dark:text-[#4ADE80]'],
  ['i', 'text-[#3B82F6] dark:text-[#7CA7FF]'],
  ['a', 'text-[#8B5CF6] dark:text-[#B49BFF]'],
]

/** Tulisan "Kasceria". Ukuran huruf lewat className (mis. text-[34px]). */
export function TulisanKasceria({ className = 'text-[34px]', tepi = true }) {
  return (
    <span
      className={`inline-block whitespace-nowrap font-display font-bold leading-[1.05] tracking-[-.3px] ${tepi ? 'merek-tepi' : ''} ${className}`}
    >
      <span className="text-[#1B2559] dark:text-[#F1F4FF]">Kas</span>
      {HURUF_CERIA.map(([h, c]) => <span key={h} className={c}>{h}</span>)}
    </span>
  )
}

export function Tagline({ className = '' }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[13px] font-extrabold tracking-[.2px] text-[#2C3A5E] dark:bg-white/10 dark:text-[#C9D3EE] ${className}`}
    >
      {TAGLINE}
    </span>
  )
}
