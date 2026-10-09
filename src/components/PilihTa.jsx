/**
 * Pil "Tahun ajaran ▾" — pilihan semua tahun ajaran yang ada datanya (0044).
 * Bentuknya sama dengan Pil biasa supaya bisa diletakkan sejajar pil rentang tanggal.
 *   on     : pil sedang aktif (berwarna)
 *   daftar : ['2026/2027', '2025/2026', …] terbaru dulu
 *   nilai  : tahun yang dipilih ('' = belum memilih → teks "Tahun ajaran")
 */
import { taPendek, tahunAjaranBerjalan } from '../lib/format.js'

export default function PilihTa({ on, nilai, ubah, daftar, label = 'Tahun ajaran', warna = 'biru', className = '' }) {
  const kini = tahunAjaranBerjalan()
  return (
    <label
      className={`relative flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill py-2 pl-3.5 pr-8 text-[13px] font-extrabold transition ${
        on ? `permen permen-kecil permen-${warna}` : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-ink hover:border-brand/50 dark:border-line'
      } ${className}`}
    >
      <span aria-hidden="true">🎓</span>
      <span>{on && nilai ? (nilai === kini ? `Tahun ini ${taPendek(nilai)}` : nilai) : label}</span>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={on ? nilai : ''}
        onChange={(e) => e.target.value && ubah(e.target.value)}
        aria-label={label}
      >
        {!on && <option value="">{label}</option>}
        {daftar.map((t) => (
          <option key={t} value={t}>{t === kini ? `Tahun ini (${t})` : t}</option>
        ))}
      </select>
    </label>
  )
}
