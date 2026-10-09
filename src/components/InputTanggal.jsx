/**
 * Pilihan tanggal bergaya Kasceria — pengganti <input type="date"> bawaan
 * browser (yang tampilannya beda-beda di tiap HP dan tidak mengikuti tema
 * & huruf aplikasi). Nilai tetap "YYYY-MM-DD" seperti input biasa.
 *
 *   <InputTanggal value={tgl} onChange={setTgl} max={tanggalISO()} />
 *
 * Kalender muncul di bawah kolom (menempel, tidak menutupi layar), bisa
 * pindah bulan, tanggal di luar min/max tidak bisa dipilih, ada tombol
 * cepat "Hari ini" / "Kemarin", dan menutup sendiri setelah memilih.
 */
import { useEffect, useId, useRef, useState } from 'react'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu']
const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const keISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dariISO = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const hariIni = () => keISO(new Date())
// bulan yang dibuka pertama: tanggal terpilih → min (kalau masih di depan) → max (kalau sudah lewat) → hari ini
const bulanAwal = (value, min, max) =>
  dariISO(value) || (min && min > hariIni() ? dariISO(min) : null) || (max && max < hariIni() ? dariISO(max) : null) || new Date()
const geserHari = (iso, n) => {
  const d = dariISO(iso)
  d.setDate(d.getDate() + n)
  return keISO(d)
}

/** "Senin, 5 Oktober 2026" · kecil: "5 Okt 2026" */
export function tampilTanggal(iso, kecil = false) {
  const d = dariISO(iso)
  if (!d) return ''
  return kecil
    ? `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
    : `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

export default function InputTanggal({
  value, onChange, min, max, disabled = false, className = '', placeholder = 'Pilih tanggal',
  bisaKosong = false, kecil = false, 'aria-label': ariaLabel,
}) {
  const [buka, setBuka] = useState(false)
  const [lihat, setLihat] = useState(() => bulanAwal(value, min, max)) // bulan yang ditampilkan
  const [kanan, setKanan] = useState(false) // kalender rata kanan (kolom dekat tepi kanan layar)
  const akar = useRef(null)
  const panel = useRef(null)
  const id = useId()

  // tutup saat ketuk di luar / tekan Esc
  useEffect(() => {
    if (!buka) return
    const luar = (e) => akar.current && !akar.current.contains(e.target) && setBuka(false)
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setBuka(false) } }
    document.addEventListener('mousedown', luar)
    document.addEventListener('touchstart', luar, { passive: true })
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', luar)
      document.removeEventListener('touchstart', luar)
      document.removeEventListener('keydown', esc, true)
    }
  }, [buka])

  const bukaTutup = () => {
    if (disabled) return
    if (!buka) {
      setLihat(bulanAwal(value, min, max))
      const r = akar.current?.getBoundingClientRect()
      const w = r ? Math.min(Math.max(r.width, 296), 340, window.innerWidth - 24) : 296
      setKanan(!!r && r.left + w > window.innerWidth - 8 && r.right - w >= 8)
      requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    }
    setBuka((b) => !b)
  }

  const boleh = (iso) => (!min || iso >= min) && (!max || iso <= max)
  const pilih = (iso) => {
    if (!boleh(iso)) return
    onChange(iso)
    setBuka(false)
  }

  // sel kalender: mulai Senin
  const th = lihat.getFullYear()
  const bl = lihat.getMonth()
  const awal = (new Date(th, bl, 1).getDay() + 6) % 7
  const jumlah = new Date(th, bl + 1, 0).getDate()
  const sel = [...Array(awal).fill(null), ...Array.from({ length: jumlah }, (_, i) => keISO(new Date(th, bl, i + 1)))]
  const kini = hariIni()
  const bulanLalu = keISO(new Date(th, bl, 0))
  const bulanDepan = keISO(new Date(th, bl + 1, 1))
  const bisaMundur = !min || bulanLalu >= min.slice(0, 8) + '01'
  const bisaMaju = !max || bulanDepan <= max
  const cepat = [['Hari ini', kini], ['Kemarin', geserHari(kini, -1)]].filter(([, t]) => boleh(t))

  return (
    <div ref={akar} className="relative min-w-0">
      <button
        type="button"
        onClick={bukaTutup}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={buka}
        aria-controls={id}
        aria-label={ariaLabel ? `${ariaLabel}: ${value ? tampilTanggal(value) : 'belum dipilih'}` : undefined}
        className={`field-input flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-55 ${buka ? '!border-brand' : ''} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${value ? 'font-bold' : 'font-semibold text-muted'}`}>
          {value ? tampilTanggal(value, kecil) : placeholder}
        </span>
        {value === kini && !kecil && <span className="shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 text-[10.5px] font-extrabold text-brand dark:bg-white/10">Hari ini</span>}
        <svg width={kecil ? 15 : 18} height={kecil ? 15 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-brand">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>

      {buka && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label="Pilih tanggal"
          className={`absolute top-[calc(100%+6px)] z-40 w-[max(100%,296px)] max-w-[min(340px,calc(100vw-24px))] animate-fade rounded-[22px] border-[1.5px] border-[#DCE6F4] bg-kartu p-3 shadow-[0_18px_40px_rgba(30,64,140,.18)] dark:border-line ${kanan ? 'right-0' : 'left-0'}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" aria-label="Bulan sebelumnya" disabled={!bisaMundur} onClick={() => setLihat(new Date(th, bl - 1, 1))}
              className="tombol-putih grid h-9 w-9 place-items-center rounded-[12px] disabled:opacity-35">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <b className="font-display text-[17px] font-bold text-[#1B2559] dark:text-ink" aria-live="polite">{BULAN[bl]} {th}</b>
            <button type="button" aria-label="Bulan berikutnya" disabled={!bisaMaju} onClick={() => setLihat(new Date(th, bl + 1, 1))}
              className="tombol-putih grid h-9 w-9 place-items-center rounded-[12px] disabled:opacity-35">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {HARI_PENDEK.map((h, i) => (
              <span key={h} className={`pb-1 text-[11px] font-extrabold ${i === 6 ? 'text-danger/80' : 'text-muted'}`}>{h}</span>
            ))}
            {sel.map((iso, i) => {
              if (!iso) return <span key={'k' + i} />
              const on = iso === value
              const bisa = boleh(iso)
              const minggu = (i % 7) === 6
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!bisa}
                  onClick={() => pilih(iso)}
                  aria-pressed={on}
                  aria-label={tampilTanggal(iso)}
                  className={`grid h-9 place-items-center rounded-[11px] text-[13.5px] font-bold transition ${
                    on ? 'permen permen-kecil permen-biru !font-extrabold'
                      : !bisa ? 'text-[#C3CAD6] dark:text-white/20'
                        : iso === kini ? 'text-brand ring-2 ring-inset ring-brand/40 hover:bg-brand-soft'
                          : `${minggu ? 'text-danger' : 'text-ink'} hover:bg-isi`
                  }`}
                >
                  {Number(iso.slice(8))}
                </button>
              )
            })}
          </div>
          {(cepat.length > 0 || (bisaKosong && value)) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t-[1.5px] border-dashed border-line pt-2.5">
              {cepat.map(([l, t]) => (
                <button key={l} type="button" onClick={() => pilih(t)} className="rounded-pill bg-brand-soft px-3 py-1.5 text-[12px] font-extrabold text-brand dark:bg-white/10">{l}</button>
              ))}
              {bisaKosong && value && (
                <button type="button" onClick={() => { onChange(''); setBuka(false) }} className="ml-auto rounded-pill px-3 py-1.5 text-[12px] font-extrabold text-danger">Kosongkan</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
