/**
 * Empat ubin status (Nunggak · Mencicil · Belum bayar · Lunas) yang sekaligus
 * jadi saringan: ketuk ubin = tampilkan status itu saja, ketuk lagi = semua.
 * Dipakai menu Tagihan dan menu Siswa supaya tampilan & artinya sama.
 */
import { STATUS_TAGIHAN, URUTAN_STATUS } from '../lib/statusSiswa.js'

export default function UbinStatus({ hitung, aktif, pilih, className = '' }) {
  const adaPilihan = URUTAN_STATUS.includes(aktif)
  return (
    <div className={`grid grid-cols-4 gap-2 lg:max-w-[640px] lg:gap-3 ${className}`} role="group" aria-label="Saring status">
      {URUTAN_STATUS.map((k) => {
        const s = STATUS_TAGIHAN[k]
        const on = aktif === k
        return (
          <button
            key={k}
            type="button"
            onClick={() => pilih(on ? 'semua' : k)}
            aria-pressed={on}
            title={on ? 'Tampilkan semua status' : `Saring: ${s.label}`}
            className={`permen permen-${s.permen} flex min-w-0 flex-col items-center justify-center rounded-[18px] px-1 pb-3 pt-2.5 text-center transition-opacity ${on ? 'outline outline-[3px] outline-offset-2 outline-brand' : ''} ${adaPilihan && !on ? 'opacity-50' : ''}`}
          >
            <span className="font-display text-[24px] font-bold leading-none">{hitung[k] || 0}</span>
            <span className="mt-1 text-[12px] font-extrabold leading-tight">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
