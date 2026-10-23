/**
 * Identitas aplikasi guru kelas — "Tumbuh Ceria · Catatan Tumbuh Kembang Anak".
 * Sengaja berbeda dari Kasceria (aplikasi kas): hijau daun, logo pot tersenyum
 * bertunas, tanpa tulisan keuangan/SPP sama sekali.
 *
 * Gambar logo yang sama ada di public/favicon-kelas.svg dan public/icons/kelas-*.png
 * (ikon aplikasi terpasang / PWA).
 */
import { GedungTK, Pelangi, Pohon } from '../components/IlustrasiMasuk.jsx'
import { Garis } from '../components/LatarMasuk.jsx'
import { TontonHalaman } from '../components/Panduan.jsx'

export const NAMA_APP = 'Tumbuh Ceria'
export const TAGLINE_APP = 'Catatan Tumbuh Kembang Anak'

/** Pot tersenyum dengan tunas dua daun (tanpa ubin). viewBox 60×60. */
export function PotTunas({ className = '', style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 60 60" aria-hidden="true">
      <ellipse cx="30" cy="54.2" rx="14" ry="2.4" fill="#06513F" opacity=".32" />
      {/* tunas */}
      <path d="M30 29V17.5" stroke="#2C9A4C" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M29.6 19.6C21.6 20 16.4 15.2 15.2 8.4c7.4-.4 13.4 3.4 14.4 11.2z" fill="#9BE870" stroke="#3EA650" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M30.4 16.8c2.6-7.4 8.6-11.2 16.4-10.8-.8 7.6-6.8 12-16.4 10.8z" fill="#76D95A" stroke="#3EA650" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M28 18.2c-3.4-1.6-6.6-4.4-8.4-7.4M32.6 15.2c3-2.6 6.6-5 10.4-6.4" stroke="#3EA650" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity=".7" />
      {/* pot */}
      <path d="M16.4 31.5h27.2l-3.2 19.2a2.6 2.6 0 0 1-2.6 2.2H22.2a2.6 2.6 0 0 1-2.6-2.2z" fill="#FF8A5B" />
      <path d="M41.6 31.5h2l-3.2 19.2a2.6 2.6 0 0 1-2.6 2.2h-2.2c1.8 0 2.8-1 3-2.2z" fill="#E86A3E" opacity=".55" />
      <rect x="13.8" y="27" width="32.4" height="7" rx="3.5" fill="#FF7A45" />
      <rect x="15.6" y="28.4" width="12" height="2" rx="1" fill="#FFB08F" opacity=".8" />
      {/* wajah */}
      <circle cx="25" cy="40.4" r="2" fill="#5A2A10" /><circle cx="35" cy="40.4" r="2" fill="#5A2A10" />
      <circle cx="25.7" cy="39.7" r=".7" fill="#fff" /><circle cx="35.7" cy="39.7" r=".7" fill="#fff" />
      <ellipse cx="21.4" cy="44.4" rx="2.5" ry="1.6" fill="#FFC9B0" />
      <ellipse cx="38.6" cy="44.4" rx="2.5" ry="1.6" fill="#FFC9B0" />
      <path d="M26.2 44.8q3.8 3.6 7.6 0" stroke="#5A2A10" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** Logo aplikasi guru: ubin hijau bertepi putih. Ukuran lewat `size` atau className. */
export function LogoTumbuh({ size, className = '' }) {
  const gaya = size ? { width: size, height: size, borderRadius: Math.round(size * 0.29), borderWidth: Math.max(3, Math.round(size / 19)) } : undefined
  return (
    <div
      role="img"
      aria-label={`Logo ${NAMA_APP}`}
      className={`logo-kasceria grid shrink-0 place-items-center border-white bg-[linear-gradient(160deg,#4FD8AE_0%,#0C9473_72%)] shadow-[0_10px_22px_rgba(10,114,89,.28)] dark:border-[#1F3A35] ${className}`}
      style={gaya}
    >
      <PotTunas className="h-[82%] w-[82%]" />
    </div>
  )
}

const HURUF = [
  ['C', 'text-[#FF6B4A] dark:text-[#FF8A6B]'],
  ['e', 'text-[#F59E0B] dark:text-[#FFC23D]'],
  ['r', 'text-[#22B573] dark:text-[#4ADE80]'],
  ['i', 'text-[#3B82F6] dark:text-[#7CA7FF]'],
  ['a', 'text-[#8B5CF6] dark:text-[#B49BFF]'],
]

/** Tulisan "Tumbuh Ceria" bertepi putih (gaya stiker, sama keluarga dengan Kasceria). */
export function TulisanTumbuh({ className = 'text-[34px]' }) {
  return (
    <span className={`merek-tepi inline-block whitespace-nowrap font-display font-bold leading-[1.05] tracking-[-.3px] ${className}`}>
      <span className="text-[#0B4F3E] dark:text-[#E9FFF6]">Tumbuh </span>
      {HURUF.map(([h, c]) => <span key={h} className={c}>{h}</span>)}
    </span>
  )
}

export function TaglineTumbuh({ className = '' }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[13px] font-extrabold tracking-[.2px] text-[#1E4D41] dark:bg-white/10 dark:text-[#BFE9DC] ${className}`}>
      {TAGLINE_APP}
    </span>
  )
}

/** Kepala layar masuk di HP. */
export function KepalaTumbuh() {
  return (
    <>
      <LogoTumbuh className="masuk-logo" />
      <TulisanTumbuh className="masuk-merek mt-1.5" />
      <TaglineTumbuh className="masuk-tagline mt-2" />
    </>
  )
}

/* ---------------- ilustrasi pot bertunas (tumbuh) ---------------- */

/** Satu pot kecil; `tinggi` = tahap tumbuh 0..2. */
function Pot({ x, tahap, wajah = true }) {
  const batang = [10, 20, 31][tahap]
  const atas = 62 - batang
  return (
    <g transform={`translate(${x} 0)`}>
      <path d={`M0 62V${atas}`} stroke="#2C9A4C" strokeWidth="2.6" strokeLinecap="round" />
      <path d={`M-.4 ${atas + 6}c-7 .2-11.4-3.8-12.2-9.6 6.4-.2 11.4 2.8 12.2 9.6z`} fill="#9BE870" stroke="#3EA650" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={`M.4 ${atas + 3.6}c2.2-6.4 7.4-9.6 14.2-9.2-.8 6.6-6 10.2-14.2 9.2z`} fill="#76D95A" stroke="#3EA650" strokeWidth="1.5" strokeLinejoin="round" />
      {tahap >= 1 && (
        <>
          <path d={`M-.4 ${atas + 16}c-6 0-9.6-3.2-10.4-8 5.4-.2 9.6 2.4 10.4 8z`} fill="#86E064" stroke="#3EA650" strokeWidth="1.4" strokeLinejoin="round" />
          <path d={`M.4 ${atas + 13}c2-5.4 6.4-8 12-7.6-.6 5.6-5 8.6-12 7.6z`} fill="#9BE870" stroke="#3EA650" strokeWidth="1.4" strokeLinejoin="round" />
        </>
      )}
      {tahap >= 2 && (
        <g transform={`translate(0 ${atas - 3})`}>
          {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="0" cy="-5.2" rx="3.6" ry="5" fill="#FFB3CF" stroke="#F26FA0" strokeWidth="1" transform={`rotate(${r})`} />)}
          <circle r="3.4" fill="#FFD84D" stroke="#F2B21F" strokeWidth="1" />
        </g>
      )}
      <path d="M-13 66h26l-2.6 17.2a2.4 2.4 0 0 1-2.4 2H-12a2.4 2.4 0 0 1-2.4-2z" fill="#FF8A5B" transform="translate(.6 0)" />
      <rect x="-15" y="61.5" width="30" height="6.6" rx="3.3" fill="#FF7A45" />
      {wajah && (
        <>
          <circle cx="-4.4" cy="74.4" r="1.6" fill="#5A2A10" /><circle cx="4.4" cy="74.4" r="1.6" fill="#5A2A10" />
          <ellipse cx="-8" cy="78" rx="2" ry="1.3" fill="#FFC9B0" /><ellipse cx="8" cy="78" rx="2" ry="1.3" fill="#FFC9B0" />
          <path d="M-3 78.2q3 2.8 6 0" stroke="#5A2A10" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  )
}

/** Tiga pot dari tunas kecil sampai berbunga — lambang anak bertumbuh. viewBox 128×92. */
export function TigaPot({ className = '', style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 128 92" aria-hidden="true">
      <ellipse cx="64" cy="87.5" rx="60" ry="4.5" fill="#7CCB6B" opacity=".55" />
      <Pot x={20} tahap={0} />
      <Pot x={64} tahap={1} />
      <Pot x={108} tahap={2} />
    </svg>
  )
}

/**
 * Kepala halaman aplikasi guru (pengganti pelangi + dua anak di aplikasi kas):
 * judul besar dan tiga pot bertunas di kanan. `kembali` → tombol kembali,
 * `polos` → tanpa gambar (layar ceklis, supaya teks bebas dari hiasan).
 */
export function KepalaKelas({ judul, sub, kembali, polos = false, className = '' }) {
  return (
    <header className={`relative mb-4 mt-1 lg:mb-6 lg:mt-0 ${className}`}>
      <div className={`relative z-[1] min-w-0 ${polos ? '' : 'min-h-[96px] pr-[126px] lg:min-h-[120px] lg:pr-[220px] lg:pt-3'}`}>
        <div className="flex items-center gap-2.5">
          {kembali && (
            <button type="button" onClick={kembali} aria-label="Kembali" className="tombol-bilah grid h-10 w-10 shrink-0 place-items-center rounded-[14px] active:scale-95 lg:h-11 lg:w-11">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          )}
          <h1 className="judul-halaman min-w-0 font-display text-[29px] font-bold leading-[1.1] tracking-[-.3px] lg:text-[38px]">{judul}</h1>
        </div>
        {sub && <p className="sub-halaman mt-1.5 text-[13px] font-bold leading-snug lg:max-w-[620px] lg:text-[14.5px]">{sub}</p>}
        <TontonHalaman className="mt-2.5" />
      </div>
      {!polos && (
        <div aria-hidden="true" className="pointer-events-none absolute -right-1 top-[10px] z-[1] w-[124px] lg:right-2 lg:top-0 lg:w-[180px]">
          <TigaPot className="redup-malam w-full" />
        </div>
      )}
    </header>
  )
}

/* ---------------- panel kiri layar masuk (PC) ---------------- */

function Chip({ ikon, children, warna }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 py-[7px] pl-[7px] pr-3.5 text-[13.5px] font-bold text-ink shadow-[0_4px_12px_rgba(14,70,55,.08)] dark:bg-white/10">
      <span className={`grid h-7 w-7 place-items-center rounded-full ${warna}`}>{ikon}</span>
      {children}
    </span>
  )
}

const ikonKecil = (d) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

export function SambutanGuru() {
  return (
    <div className="sambutan-pc relative flex h-full min-h-[600px] flex-col pb-6 pt-14">
      <div className="relative z-[2] flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <LogoTumbuh size={68} />
          <div className="flex flex-col items-start gap-2">
            <TulisanTumbuh className="text-[36px]" />
            <TaglineTumbuh />
          </div>
        </div>
        <h1 className="mt-1.5 font-display text-[50px] font-bold leading-[1.12] tracking-[-.5px] text-[#14352C] dark:text-ink">
          Catat tumbuh kembang<br />anak, <span className="text-[#0C9473] dark:text-[#4FD8AE]">tanpa ribet</span>
        </h1>
        <p className="max-w-[520px] text-[17px] font-semibold leading-relaxed text-[#2E4A42] dark:text-muted">
          Ceklis perkembangan sekelas, catatan untuk tiap anak, dan kabar kelas untuk orang tua — cukup dari HP, beberapa menit saja.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Chip warna="bg-[#D3F5E8] text-[#0A7259] dark:bg-white/10 dark:text-[#7FE3C3]" ikon={ikonKecil(<><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V3.5h6v1" /><path d="M8.5 11l1.6 1.6 3-3M8.5 16.5h7" /></>)}>Ceklis sekelas</Chip>
          <Chip warna="bg-rose-soft text-[#B0306C] dark:text-[#FFC2DB]" ikon={ikonKecil(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>)}>Catatan tiap anak</Chip>
          <Chip warna="bg-grape-soft text-[#6D3FD9] dark:text-[#C9B8FF]" ikon={<Garis nama="grafik" size={16} sw={2.3} />}>Grafik untuk orang tua</Chip>
        </div>
      </div>
      <div aria-hidden="true" className="relative mt-auto h-[330px] w-full max-w-[560px]">
        <Pelangi className="absolute bottom-[120px] left-[40px] w-[460px] dark:opacity-40" />
        <Pohon className="redup-malam absolute bottom-[60px] left-[-10px] w-[74px]" />
        <GedungTK className="redup-malam absolute bottom-[-6px] left-[70px] w-[300px]" />
        <TigaPot className="redup-malam absolute bottom-[-4px] left-[360px] w-[190px]" />
      </div>
    </div>
  )
}

/** Nilai Provider untuk komponen bersama (layar masuk, memuat, popup pasang). */
export const MEREK_KELAS = {
  kepala: <KepalaTumbuh />,
  sambutan: <SambutanGuru />,
  logo: (props) => <LogoTumbuh {...props} />,
  subMasuk: 'Masuk untuk mencatat perkembangan anak di kelas Anda',
  tempatPin: 'menu Lainnya',
}
