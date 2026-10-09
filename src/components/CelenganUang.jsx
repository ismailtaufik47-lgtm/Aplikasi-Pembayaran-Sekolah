/**
 * Celengan toples kaca (tutup kuning + lubang koin) berisi uang kertas Rupiah
 * merah (100 ribu) & biru (50 ribu). Jumlah lembarnya mengikuti persentase
 * SPP yang sudah masuk: 10% → 2 lembar, 50% → 9 lembar, 100% → penuh 18 lembar.
 * Lembar uang jatuh satu per satu saat celengan muncul (mati kalau
 * "kurangi gerakan" aktif di HP).
 */
import { useId } from 'react'

const MAKS = 18
const KOLOM = [46, 80, 114]
const PUTAR = [-9, 7, -4, 11, -12, 5, 8, -6, 3, -10, 12, -3, 6, -8, 9, -5, 4, -11]
const GESER = [-3, 2, 4, -2, 3, -4, 1, -3, 2, 4, -1, 3, -2, 1, -4, 3, -2, 2]
// tumpukan dari bawah ke atas: 3 lembar per baris
const POSISI = Array.from({ length: MAKS }, (_, i) => {
  const baris = Math.floor(i / 3)
  const kol = (i + baris) % 3
  return [KOLOM[kol] + GESER[i], 178 - baris * 20 + (i % 2 ? -2 : 1), PUTAR[i]]
})
// pola warna: m = merah (100rb), b = biru (50rb)
const WARNA = 'mbmmbmbmmbmbmmbmbm'
const UANG = {
  m: { isi: '#E9506A', sisi: '#B8263D', teks: '100' },
  b: { isi: '#3E7BE0', sisi: '#2453A8', teks: '50' },
}

function Lembar({ x, y, r, w, delay }) {
  const u = UANG[w]
  return (
    <g className="uang-jatuh" style={{ animationDelay: `${delay}ms` }}>
      <g transform={`translate(${x} ${y}) rotate(${r})`}>
        <rect x="-24" y="-11" width="48" height="22" rx="2.5" fill={u.isi} stroke={u.sisi} strokeWidth="1.2" />
        <rect x="-20.5" y="-7.5" width="41" height="15" rx="1.5" fill="none" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth=".9" />
        <circle cx="-11.5" cy="0" r="4.8" fill="#FFFFFF" fillOpacity=".45" />
        <text x="12.5" y="3.4" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#FFFFFF" fontFamily="Fredoka, sans-serif">{u.teks}</text>
      </g>
    </g>
  )
}

export default function CelenganUang({ persen = 0, className = '' }) {
  const id = useId().replace(/:/g, '')
  const p = Math.max(0, Math.min(100, Number(persen) || 0))
  const jumlah = p <= 0 ? 0 : Math.max(1, Math.round((p / 100) * MAKS))
  return (
    <svg viewBox="0 0 160 206" className={className} role="img" aria-label={`Celengan SPP: ${Math.round(p)} persen sudah masuk`}>
      <defs>
        <clipPath id={`toples-${id}`}>
          <rect x="14" y="42" width="132" height="152" rx="34" />
        </clipPath>
      </defs>
      {/* bayangan */}
      <ellipse cx="80" cy="200" rx="62" ry="5.5" className="fill-[rgba(30,64,140,.14)] dark:fill-[rgba(0,0,0,.35)]" />
      {/* badan kaca */}
      <rect x="14" y="42" width="132" height="152" rx="34" className="fill-[#EEF5FF] dark:fill-[#22314F]" />
      <g clipPath={`url(#toples-${id})`}>
        {POSISI.slice(0, jumlah).map(([x, y, r], i) => (
          <Lembar key={i} x={x} y={y} r={r} w={WARNA[i]} delay={150 + i * 70} />
        ))}
      </g>
      <rect x="14" y="42" width="132" height="152" rx="34" fill="none" stroke="#B9CDEF" strokeWidth="3.5" className="dark:stroke-[#5B79B8]" />
      {/* kilau kaca */}
      <rect x="25" y="58" width="10" height="84" rx="5" fill="#FFFFFF" opacity=".6" />
      <rect x="25" y="150" width="10" height="16" rx="5" fill="#FFFFFF" opacity=".45" />
      {/* tutup */}
      <rect x="26" y="28" width="108" height="22" rx="8" fill="#D99A1E" />
      <rect x="26" y="20" width="108" height="22" rx="8" fill="#FFD45C" />
      <rect x="32" y="23" width="40" height="4" rx="2" fill="#FFFFFF" opacity=".5" />
      {/* lubang koin */}
      <rect x="62" y="26.5" width="36" height="7" rx="3.5" fill="#8A5A08" />
    </svg>
  )
}
