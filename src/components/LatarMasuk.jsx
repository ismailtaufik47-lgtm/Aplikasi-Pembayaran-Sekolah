/**
 * Kerangka layar sebelum masuk aplikasi (Masuk PIN, Google, Gabung, Kode
 * aktivasi) dan halaman publik cek kuitansi.
 *
 * Susunan di HP (kolom flex setinggi layar):
 *   langit + matahari/pelangi (mode gelap: bulan & bintang)
 *   kepala (logo Kasceria atau ikon langkah)
 *   kartu putih — dua anak "mengintip" di pojok atasnya
 *   adegan bawah (bukit + gedung TK) yang MENGISI sisa tinggi layar,
 *   jadi tidak pernah ada ruang langit kosong di bagian bawah. Kalau
 *   sisa ruangnya sempit, gedung/pohon disembunyikan otomatis (container
 *   query di index.css) dan yang tersisa hanya rumput.
 *
 * Di PC: kartu di tengah, atau — kalau `sisiKiri` diisi (layar masuk PIN) —
 * dua kolom: sambutan + gedung TK di kiri, kartu di kanan.
 */
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { LogoKasceria, Tagline, TulisanKasceria } from './Kasceria.jsx'
import {
  AnakLaki, AnakPerempuan, Awan, Bintang, BintangWajah, BukuPensil, Bukit, BukitLebar,
  Bulan, Bunga, GedungTK, Matahari, Pelangi, Pohon,
} from './IlustrasiMasuk.jsx'

/* ---------------- ikon garis ---------------- */

const JALUR = {
  surat: <><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M4 7.5l8 6 8-6" /></>,
  gembok: <><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14.5v2.5" /></>,
  kanan: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  hapus: <><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></>,
  kunci: <><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3" /><path d="M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  perisai: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M8.5 12l2.4 2.4 4.6-4.8" /></>,
  kiri: <path d="M15 5l-7 7 7 7" />,
  lanjut: <path d="M9 5l7 7-7 7" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6h.01" strokeWidth="2.8" /></>,
  awas: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5" /><path d="M12 17.4h.01" strokeWidth="2.8" /></>,
  centang: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  larang: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  tanya: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.7" /><path d="M12 16.8h.01" strokeWidth="2.6" /></>,
  kartu: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2.3" /><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4" /><path d="M14.5 10h4M14.5 13.5h3" /></>,
  sekolah: <><path d="M3 10.5L12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>,
  papanketik: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" strokeWidth="2.2" /></>,
  tempel: <><rect x="6" y="4.5" width="12" height="16" rx="2.5" /><path d="M9.5 3h5v3h-5z" /><path d="M9 11h6M9 14.5h4" /></>,
  tukar: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>,
  grafik: <path d="M6 20V11M12 20V5M18 20v-6" />,
  robot: <><rect x="4" y="8" width="16" height="11" rx="4" /><path d="M12 4.5V8" /><circle cx="12" cy="3.6" r="1" /><path d="M9.2 13h.01M14.8 13h.01" strokeWidth="2.8" /><path d="M2 12.5v2.5M22 12.5v2.5" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17.5 17.5H20V20h-2.5z" /></>,
  muat: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4.5V11h-6.5" /></>,
}

export function Garis({ nama, size = 20, sw = 2.2, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {JALUR[nama]}
    </svg>
  )
}

export function IkonGoogle({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 14.1 6 6 14.1 6 24s8.1 18 18 18 18-8.1 18-18c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M8.3 14.7l6.6 4.8C16.7 15.6 20 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 16.3 6 9.7 10.3 8.3 14.7z" />
      <path fill="#4CAF50" d="M24 42c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 37.6 16.2 42 24 42z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.4 35.4 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  )
}

/* ---------------- kepala ---------------- */

/** Logo + tulisan Kasceria + tagline (kepala layar masuk di HP). */
export function KepalaMerek() {
  return (
    <>
      <LogoKasceria className="masuk-logo" />
      <TulisanKasceria className="masuk-merek mt-1.5" />
      <Tagline className="masuk-tagline mt-2" />
    </>
  )
}

/** Kepala untuk langkah tertentu (mis. Kode aktivasi): ubin permen + judul. */
export function KepalaLangkah({ ikon, warna = 'kuning', judul, sub }) {
  return (
    <>
      <span className={`masuk-logo permen permen-${warna} grid place-items-center border-white shadow-[0_10px_22px_rgba(42,85,204,.18)] dark:border-[#26304A]`}>
        <Garis nama={ikon} size={34} />
      </span>
      <h1 className="masuk-judul-langkah mt-2 font-display font-bold leading-[1.1] text-[#1B2559] dark:text-ink">{judul}</h1>
      {sub && <p className="mt-1.5 w-[190px] text-[13px] font-bold leading-snug text-[#34405C] dark:text-[#B8C3DC]">{sub}</p>}
    </>
  )
}

/* ---------------- langit & tanah ---------------- */

function Langit({ belah, kembali }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[1]">
      <div className="dark:hidden">
        <Pelangi className={`absolute right-[-38px] top-2 w-[194px] ${belah ? 'lg:hidden' : 'lg:right-[6%] lg:top-8 lg:w-[300px]'}`} />
        <Matahari
          className={`masuk-matahari absolute ${kembali ? 'left-[66px] top-2 w-[58px]' : 'left-2.5 top-2.5 w-[72px]'} ${
            belah ? 'lg:left-[45%] lg:top-11 lg:w-[104px]' : 'lg:left-[7%] lg:top-8 lg:w-[96px]'
          }`}
        />
        <Awan className="absolute left-[96px] top-[70px] w-[58px] lg:left-[3%] lg:top-[220px] lg:w-[88px]" />
        <Awan className="absolute right-4 top-[150px] w-[64px] lg:right-[3%] lg:top-[260px] lg:w-[90px]" />
        <Awan className="absolute hidden lg:left-[49%] lg:top-[330px] lg:block lg:w-[110px]" />
      </div>
      <div className="hidden dark:block">
        <Bintang className="absolute inset-x-0 top-0 h-[210px] w-full lg:h-[380px]" />
        <Bulan
          className={`masuk-matahari absolute top-3.5 w-16 ${kembali ? 'left-[66px]' : 'left-[18px]'} ${
            belah ? 'lg:left-[45%] lg:top-11 lg:w-[96px]' : 'lg:left-[6%] lg:top-8 lg:w-[88px]'
          }`}
        />
      </div>
    </div>
  )
}

/**
 * Bukit + gedung TK yang mengisi sisa tinggi layar di bawah kartu.
 * Tingginya diukur (ResizeObserver): gedung TK hanya digambar kalau ruangnya
 * cukup, pohon kalau sedikit lebih sempit; kalau sempit sekali tinggal rumput.
 */
function AdeganBawah({ className = '' }) {
  const ref = useRef(null)
  const [tinggi, setTinggi] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setTinggi(Math.round(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const tinggiSekolah = Math.min(200, tinggi - 34)
  return (
    <div ref={ref} aria-hidden="true" className={`pointer-events-none relative min-h-[32px] flex-1 ${className}`}>
      <Bukit className="absolute inset-x-0 bottom-0 top-[-46px] h-[calc(100%+46px)] w-full" />
      {tinggi >= 104 && (
        <>
          <Pohon className="redup-malam absolute bottom-[12px] left-[3%] w-[min(62px,16vw)]" />
          <Pohon varian={1} className="redup-malam absolute bottom-[16px] right-[3%] w-[min(64px,16vw)]" />
        </>
      )}
      {tinggiSekolah >= 90 && (
        <GedungTK
          className="redup-malam absolute bottom-[8px] left-1/2 -translate-x-1/2"
          style={{ height: tinggiSekolah, width: (tinggiSekolah * 240) / 170 }}
        />
      )}
      <Bunga warna="#FFFFFF" className="redup-malam absolute bottom-[10px] left-[22%] w-3.5" />
      <Bunga warna="#FFD84D" className="redup-malam absolute bottom-[24px] right-[24%] w-3" />
    </div>
  )
}

/* ---------------- kerangka ---------------- */

export default function LatarMasuk({ kepala, kembali, sisiKiri = null, anak = true, children }) {
  const belah = !!sisiKiri
  return (
    <div className="langit-masuk relative isolate flex min-h-dvh flex-col overflow-x-hidden text-ink">
      <Langit belah={belah} kembali={!!kembali} />

      {kembali && (
        <button
          type="button"
          onClick={kembali}
          aria-label="Kembali"
          className="absolute left-3.5 top-3.5 z-10 grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-white/90 text-[#1B2559] shadow-[0_4px_12px_rgba(27,37,89,.12)] active:scale-95 dark:bg-white/10 dark:text-ink lg:left-8 lg:top-8"
        >
          <Garis nama="kiri" size={20} sw={2.4} />
        </button>
      )}

      <div
        className={
          belah
            ? 'flex flex-1 flex-col lg:mx-auto lg:grid lg:w-full lg:max-w-[1280px] lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16 lg:px-12'
            : 'flex flex-1 flex-col'
        }
      >
        {belah && <div className="relative hidden self-stretch lg:block">{sisiKiri}</div>}

        <div className={`flex flex-1 flex-col ${belah ? 'kolom-kartu-pc lg:flex-none' : ''}`}>
          {kepala && (
            <header className={`masuk-kepala relative z-[3] flex flex-col items-center px-4 text-center ${belah ? 'lg:hidden' : ''}`}>
              {kepala}
            </header>
          )}
          <div className={`relative z-[4] mx-3.5 sm:mx-auto sm:w-full sm:max-w-[420px] ${belah ? 'lg:max-w-[440px]' : ''}`}>
            {anak && (
              <>
                {/* Di PC anak-anak digeser ke dalam kartu: yang terlihat hanya kepala &
                    tangan melambai di atas kartu, badannya tertutup kartu (tidak "terpotong"). */}
                <AnakLaki className="masuk-anak pointer-events-none absolute -left-4 -z-[1] lg:left-6" />
                <AnakPerempuan className="masuk-anak pointer-events-none absolute -right-4 -z-[1] lg:right-6" />
              </>
            )}
            {children}
          </div>
          <AdeganBawah className={belah ? 'lg:hidden' : ''} />
        </div>
      </div>

      {belah && (
        <BukitLebar className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] hidden h-[300px] w-full lg:block" />
      )}
      <BukuPensil className="pointer-events-none absolute bottom-1 left-1 z-[6] w-[64px] lg:bottom-4 lg:left-6 lg:w-[84px]" />
      <BintangWajah className="pointer-events-none absolute bottom-2 right-1.5 z-[6] w-[50px] lg:bottom-5 lg:right-7 lg:w-[62px]" />
    </div>
  )
}

/* ---------------- bagian kartu ---------------- */

export function KartuMasuk({ children, className = '' }) {
  return <div className={`kartu-masuk relative flex flex-col ${className}`}>{children}</div>
}

export function JudulKartu({ judul, sub, tengah = false, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${tengah ? 'text-center' : ''} ${className}`}>
      <h2 className="font-display text-[21px] font-bold leading-tight text-[#1B2559] dark:text-ink lg:text-[24px]">{judul}</h2>
      {sub && <p className="text-[13px] font-semibold leading-relaxed text-[#5B6478] dark:text-muted lg:text-[14px]">{sub}</p>}
    </div>
  )
}

/** Tombol utama biru "permen": ikon di kiri, panah di kanan. */
export function TombolUtama({ ikon = 'gembok', children, onClick, disabled, type = 'button', className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`tombol-utama flex w-full shrink-0 items-center justify-between rounded-[18px] px-[11px] pb-[3px] font-display font-semibold text-white disabled:opacity-60 ${className}`}
    >
      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white/20">
        <Garis nama={ikon} size={18} sw={2.4} />
      </span>
      <span>{children}</span>
      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white text-brand">
        <Garis nama="kanan" size={18} sw={2.6} />
      </span>
    </button>
  )
}

export function TombolHantu({ ikon, children, onClick, disabled, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[50px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[#DCE3EF] bg-white text-[14px] font-extrabold text-ink active:scale-[.99] disabled:opacity-60 dark:border-line dark:bg-kartu ${className}`}
    >
      {ikon && <Garis nama={ikon} size={18} />}
      {children}
    </button>
  )
}

const NADA = {
  info: ['bg-brand-soft text-[#1F3F99] dark:text-[#B9CCFF]', 'text-brand'],
  aman: ['bg-brand-soft text-[#1F3F99] dark:text-[#B9CCFF]', 'text-brand'],
  awas: ['bg-warn-soft text-[#6B4506] dark:text-warn-deep', 'text-[#D98A0B]'],
  bahaya: ['bg-danger-soft text-[#7A1F1F] dark:text-[#FFB4B4]', 'text-danger'],
}

export function KotakInfo({ ikon = 'info', nada = 'info', children, className = '' }) {
  const [kotak, warnaIkon] = NADA[nada] || NADA.info
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12.5px] font-semibold leading-relaxed ${kotak} ${className}`}>
      <span className={`mt-px ${warnaIkon}`}><Garis nama={ikon} size={18} /></span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function PemisahAtau() {
  return (
    <div className="flex items-center gap-3 text-[12px] font-bold text-[#6B7385] dark:text-muted">
      <span className="h-px flex-1 bg-[#E6EBF3] dark:bg-line" />atau<span className="h-px flex-1 bg-[#E6EBF3] dark:bg-line" />
    </div>
  )
}

/** Tautan bergaris bawah di dalam kalimat (sebenarnya tombol). */
export function TautanTeks({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="font-extrabold text-brand underline underline-offset-2">
      {children}
    </button>
  )
}

/** Baris "Masuk sebagai … [Ganti]" — untuk yang salah masuk akun Google. */
export function AkunMasuk() {
  const { sesi, keluar, modeDemo } = useAuth()
  const email = sesi?.user?.email || (modeDemo ? 'akun.demo@gmail.com' : '')
  if (!email) return null
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-[#F5F7FB] py-2 pl-2 pr-2.5 dark:bg-isi">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-grape-soft text-[15px] font-extrabold text-[#43238F] dark:text-[#D8CAFF]">
        {email[0].toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-[#6B7385] dark:text-muted">Masuk sebagai</span>
        <span className="block truncate text-[13.5px] font-extrabold">{email}</span>
      </span>
      <button
        type="button"
        onClick={keluar}
        className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-white px-2.5 py-1.5 text-[12px] font-extrabold text-brand shadow-[0_1px_0_#E3E8F2] active:scale-95 dark:bg-kartu dark:shadow-none"
      >
        <Garis nama="tukar" size={14} sw={2.4} />
        Ganti
      </button>
    </div>
  )
}

/** Pilihan besar berbentuk kartu (dipakai di layar Gabung). */
export function PilihanPeran({ utama = false, ikon, warna, judul, sub, onClick, disabled, proses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3.5 bg-white text-left active:scale-[.99] disabled:opacity-60 dark:bg-kartu ${
        utama
          ? 'rounded-[20px] border-2 border-brand p-3.5 shadow-[inset_0_-4px_0_#D6E2FD,0_10px_20px_rgba(59,110,246,.14)] dark:shadow-[inset_0_-4px_0_rgba(91,130,248,.3)]'
          : 'rounded-[18px] border-[1.5px] border-[#DCE3EF] px-3.5 py-3 dark:border-line'
      }`}
    >
      <span className={`permen permen-${warna} grid shrink-0 place-items-center ${utama ? 'h-[54px] w-[54px] rounded-[17px]' : 'h-[46px] w-[46px] rounded-[15px]'}`}>
        <Garis nama={ikon} size={utama ? 27 : 23} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={utama ? 'font-display text-[17px] font-semibold text-[#1B2559] dark:text-ink' : 'text-[14.5px] font-extrabold'}>{judul}</span>
        <span className={`font-semibold leading-snug text-[#5B6478] dark:text-muted ${utama ? 'text-[12.5px]' : 'text-[12px]'}`}>{sub}</span>
      </span>
      {proses ? (
        <span className="shrink-0 text-[12px] font-bold text-brand">Membuka…</span>
      ) : (
        <span className={utama ? 'text-brand' : 'text-[#9AA5BC]'}><Garis nama="lanjut" size={20} sw={2.6} /></span>
      )}
    </button>
  )
}

/* ---------------- panel kiri layar masuk (PC) ---------------- */

function ChipFitur({ ikon, children, warna }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 py-[7px] pl-[7px] pr-3.5 text-[13.5px] font-bold text-ink shadow-[0_4px_12px_rgba(27,37,89,.08)] dark:bg-white/10">
      <span className={`grid h-7 w-7 place-items-center rounded-full ${warna}`}><Garis nama={ikon} size={16} sw={2.3} /></span>
      {children}
    </span>
  )
}

export function SambutanPc() {
  return (
    <div className="sambutan-pc relative flex h-full min-h-[600px] flex-col pb-6 pt-14">
      <div className="relative z-[2] flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <LogoKasceria size={68} />
          <div className="flex flex-col items-start gap-2">
            <TulisanKasceria className="text-[36px]" />
            <Tagline />
          </div>
        </div>
        <h1 className="mt-1.5 font-display text-[50px] font-bold leading-[1.12] tracking-[-.5px] text-[#1B2559] dark:text-ink">
          Keuangan sekolah jadi<br />rapi &amp; <span className="text-[#FF6B4A]">ceria</span>
        </h1>
        <p className="max-w-[500px] text-[17px] font-semibold leading-relaxed text-[#34405C] dark:text-muted">
          Catat SPP, biaya kegiatan, dan buku kas TK dalam satu aplikasi. Orang tua cukup buka tautan khusus untuk melihat tagihan anaknya.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <ChipFitur ikon="qr" warna="bg-ok-soft text-ok-deep">Kuitansi ber-QR</ChipFitur>
          <ChipFitur ikon="grafik" warna="bg-brand-soft text-brand">Laporan otomatis</ChipFitur>
          <ChipFitur ikon="robot" warna="bg-grape-soft text-[#6D3FD9] dark:text-[#C9B8FF]">Asisten AI SAKU</ChipFitur>
        </div>
      </div>
      <div aria-hidden="true" className="relative mt-auto h-[330px] w-full max-w-[560px]">
        <Pelangi className="absolute bottom-[110px] left-[40px] w-[480px] dark:opacity-40" />
        <Pohon className="redup-malam absolute bottom-[60px] left-[-10px] w-[74px]" />
        <Pohon varian={1} className="redup-malam absolute bottom-[56px] right-[0px] w-[68px]" />
        <GedungTK className="redup-malam absolute bottom-[-6px] left-[90px] w-[400px]" />
      </div>
    </div>
  )
}
