/** Komponen tampilan yang dipakai bersama panel guru dan portal orang tua. */
import { useEffect, useRef } from 'react'
import { useTema } from '../lib/tema.js'
import { LogoKasceria, TulisanKasceria } from './Kasceria.jsx'
import { Awan, BintangWajah, BukuPensil, Bukit, BukitLebar, Bulan, Bintang, GedungTK, Pelangi } from './IlustrasiMasuk.jsx'
import { AnakUtuhLaki, AnakUtuhPerempuan, KoinMaskot, KoinSaku, PapanGrafik, TumpukanKoin } from './Gambar.jsx'
import { TamanAyunan, TamanBola, TamanJungkat, TamanPerosotan, TamanPerosotanB, TamanSemakBunga, TamanSemakBungaB } from './TamanBermain.jsx'

/**
 * Kerangka aplikasi.
 *
 * Sampai lebar 1024px tampilannya seperti aplikasi HP: bingkai sempit,
 * navigasi di bawah. Mulai 1024px berubah jadi aplikasi web biasa —
 * bingkai hilang, sidebar muncul di kiri, konten memenuhi layar.
 *
 * `ceria` (panel sekolah): latar langit biru, sidebar jadi kartu melayang.
 */
export function Shell({ children, sidebar, topbar, tabbar, fab, ceria = false }) {
  return (
    <div className={`flex min-h-dvh justify-center sm:py-6 lg:py-0 ${ceria ? 'latar-luar-ceria' : 'lg:bg-[#F0F2F7]'}`}>
      <div className={`relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden ${ceria ? 'langit-app' : 'bg-canvas'} sm:h-[min(900px,calc(100dvh-48px))] sm:rounded-[36px] sm:shadow-phone lg:h-dvh lg:max-w-none lg:flex-row lg:rounded-none lg:shadow-none`}>
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {topbar}
          {children}
          {tabbar}
        </div>
        {fab}
      </div>
    </div>
  )
}

/* ---------- sidebar (hanya desktop) ---------- */
export const Sidebar = ({ children, ceria = false }) => (
  <aside
    className={
      ceria
        ? 'sidebar-ceria noscroll relative z-[2] m-4 mr-0 hidden w-[256px] shrink-0 flex-col gap-[3px] overflow-y-auto rounded-[28px] bg-kartu px-3.5 py-[18px] lg:flex'
        : 'noscroll hidden w-[250px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-line bg-white px-4 py-5 lg:flex'
    }
  >
    {children}
  </aside>
)

/**
 * Kepala sidebar panel sekolah: logo & tulisan Kasceria, lalu kartu kecil
 * berisi logo + nama + alamat sekolah.
 */
export const MerekSidebar = ({ nama, sub, logo }) => (
  <>
    <div className="flex items-center gap-2.5 px-1.5 pb-2.5">
      <LogoKasceria size={42} />
      <TulisanKasceria className="text-[25px]" tepi={false} />
    </div>
    <div className="kartu-sekolah-sidebar mb-1 flex items-center gap-2.5 rounded-2xl px-2.5 py-2">
      <LogoSekolah logo={logo} ukuran={36} />
      <span className="min-w-0">
        <b className="line-clamp-2 text-[13px] font-extrabold leading-tight">{nama}</b>
        <span className="block truncate text-[11px] font-semibold text-muted" title={sub}>{sub}</span>
      </span>
    </div>
  </>
)

/**
 * Logo sekolah (diunggah kepala sekolah di Profil sekolah). Latar selalu
 * putih — logo biasanya dibuat untuk kertas putih. Belum ada logo → 🏫.
 */
export const LogoSekolah = ({ logo, ukuran = 42, bulat = false, className = '' }) => (
  <span
    className={`grid shrink-0 place-items-center overflow-hidden ${bulat ? 'rounded-full' : 'rounded-[13px]'} ${logo ? 'border border-line' : 'bg-white'} ${className}`}
    style={{ width: ukuran, height: ukuran, ...(logo ? { background: '#fff' } : {}) }}
  >
    {logo
      ? <img src={logo} alt="Logo sekolah" className="h-[82%] w-[82%] object-contain" />
      : <GedungTK className="h-[74%] w-[92%]" />}
  </span>
)

export const SidebarBrand = ({ nama, sub, logo }) => (
  <div className="flex items-center gap-3 px-2 pb-4">
    <LogoSekolah logo={logo} ukuran={44} />
    <span className="min-w-0">
      <b className="line-clamp-2 text-[14.5px] font-extrabold leading-tight">{nama}</b>
      <span className="block truncate text-[11.5px] font-semibold text-muted" title={sub}>{sub}</span>
    </span>
  </div>
)

export const NavLabel = ({ children }) => (
  <div className="px-2.5 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[.09em] text-muted">
    {children}
  </div>
)

/**
 * Ikon menu navigasi: ubin "permen" berwarna + ikon garis. Tiap menu punya
 * warna sendiri — sama di sidebar PC, tab bar HP, dan halaman "Lainnya" —
 * supaya orang cepat mengenali menunya. (Nama EMOJI_MENU/EmojiMenu tetap
 * dipakai supaya kode lama tidak perlu diubah; isinya sekarang gambar.)
 */
const JALUR_MENU = {
  rumah: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  siswa: <><circle cx="9.5" cy="8.5" r="3.2" /><path d="M3.5 19c.9-3.2 3.3-4.7 6-4.7s5.1 1.5 6 4.7" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19c-.3-1.6-.8-2.9-1.6-3.9 2.2.2 3.9 1.6 4.6 3.9" /></>,
  nota: <><path d="M6 3h8l4 4v14l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 10h6M9 14h4" /></>,
  riwayat: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5V9h4.5" /><path d="M12 8v4.5l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  grafik: <path d="M6 20V11M12 20V5M18 20v-6" />,
  naik: <><path d="M4 17l5-5 4 4 7-7" /><path d="M14 9h6v6" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  label: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8.3" cy="8.3" r="1.4" /></>,
  kunci: <><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3" /><path d="M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  sekolah: <><path d="M3 10.5L12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>,
  permata: <><path d="M6 4h12l3 5-9 11L3 9z" /><path d="M3 9h18M9 4l3 16 3-16" /></>,
  orang: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1-3.6 3.8-5.2 7-5.2s6 1.6 7 5.2" /></>,
  robot: <><rect x="4" y="8" width="16" height="11" rx="4" /><path d="M12 4.5V8" /><circle cx="12" cy="3.6" r="1" /><path d="M9.2 13h.01M14.8 13h.01" strokeWidth="2.8" /><path d="M2 12.5v2.5M22 12.5v2.5" /></>,
  dompet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18M16.5 14.8h1" /></>,
  gerigi: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" /><circle cx="12" cy="12" r="6.6" /></>,
  folder: <><path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></>,
  orangPerisai: <><circle cx="9.5" cy="8" r="3.3" /><path d="M3.5 19.5c.9-3.4 3.3-5 6-5 1.2 0 2.3.3 3.2.8" /><path d="M17.5 12.5l3.5 1.4v2.6c0 2.3-1.5 3.9-3.5 4.5-2-.6-3.5-2.2-3.5-4.5v-2.6z" /></>,
}

/** id menu → { ikon, warna permen }. `e` = emoji lama (cadangan teks). */
export const EMOJI_MENU = {
  beranda: { ikon: 'rumah', warna: 'biru', e: '🏠' },
  siswa: { ikon: 'siswa', warna: 'kuning', e: '🧒' },
  tagihan: { ikon: 'nota', warna: 'pink', e: '🧾' },
  pembayaran: { ikon: 'riwayat', warna: 'tosca', e: '💳' },
  bayar: { ikon: 'plus', warna: 'biru', e: '💵' },
  laporan: { ikon: 'grafik', warna: 'ungu', e: '📊' },
  lainnya: { ikon: 'grid', warna: 'ungu', e: '🧩' },
  biaya: { ikon: 'label', warna: 'pink', e: '🏷️' },
  kode: { ikon: 'kunci', warna: 'kuning', e: '🔑' },
  sekolah: { ikon: 'sekolah', warna: 'tosca', e: '🏫' },
  langganan: { ikon: 'permata', warna: 'ungu', e: '💎' },
  akun: { ikon: 'orang', warna: 'biru', e: '🙋' },
  akunstaf: { ikon: 'orangPerisai', warna: 'tosca', e: '🛡️' },
  ringkasan: { ikon: 'naik', warna: 'ungu', e: '📈' },
  riwayat: { ikon: 'folder', warna: 'kuning', e: '🗂️' },
  ai: { ikon: 'robot', warna: 'biru', e: '🤖' },
  kas: { ikon: 'dompet', warna: 'kuning', e: '💰' },
  pengaturan: { ikon: 'gerigi', warna: 'abu', e: '⚙️' },
}

const FONT_EMOJI = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }

/** Ikon garis menu (tanpa ubin). */
export const IkonMenu = ({ id, size = 20, sw = 2.2, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
    {JALUR_MENU[EMOJI_MENU[id]?.ikon || id] || JALUR_MENU.grid}
  </svg>
)

/** Ubin permen menu. `latar=false` → ikon saja tanpa ubin. */
export const EmojiMenu = ({ id, size = 34, latar = true, className = '' }) => {
  const m = EMOJI_MENU[id] || { warna: 'abu' }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${latar ? `permen permen-kecil permen-${m.warna}` : ''} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.33) }}
    >
      <IkonMenu id={id} size={Math.round(size * 0.53)} />
    </span>
  )
}

export const NavItem = ({ aktif, onClick, ikon: Icon, emoji, children }) => (
  <button
    onClick={onClick}
    aria-current={aktif ? 'page' : undefined}
    className={`flex w-full items-center gap-3 rounded-[14px] text-left text-sm transition ${
      emoji ? 'px-2 py-[5px]' : 'px-3 py-2.5'
    } ${aktif ? 'nav-aktif font-extrabold' : 'font-bold text-ink hover:bg-isi'}`}
  >
    {emoji ? <EmojiMenu id={emoji} size={32} /> : <Icon size={19} />}
    {children}
  </button>
)

/**
 * Satu item tab bar bawah (HP). Tab aktif → ubin permen berwarna;
 * `catat` → tombol biru "Bayar" (selalu menonjol).
 */
export const TabEmoji = ({ id, label, aktif, onClick, redup, catat = false }) => {
  const m = EMOJI_MENU[id] || { warna: 'abu' }
  return (
    <button
      onClick={onClick}
      aria-current={aktif ? 'page' : undefined}
      className="flex flex-1 flex-col items-center justify-center gap-[3px] py-0.5"
    >
      {catat ? (
        <span className={`grid h-[38px] w-[46px] place-items-center rounded-[14px] bg-brand text-white shadow-[inset_0_-3px_0_#2A55CC] ${redup ? 'opacity-45 grayscale' : ''}`}>
          <IkonMenu id="bayar" size={22} sw={2.6} />
        </span>
      ) : (
        <span
          className={`grid h-8 w-[46px] place-items-center rounded-xl transition ${aktif ? `permen permen-kecil permen-${m.warna}` : 'text-[#7C8AA5] dark:text-muted'} ${redup ? 'opacity-45 grayscale' : ''}`}
        >
          <IkonMenu id={id} size={aktif ? 20 : 21} sw={aktif ? 2.3 : 2.1} />
        </span>
      )}
      <span className={`text-[11px] ${catat ? 'font-extrabold text-brand' : aktif ? 'font-extrabold text-[#1B2559] dark:text-ink' : 'font-bold text-[#6B7385] dark:text-muted'}`}>{label}</span>
    </button>
  )
}

/** Judul halaman versi desktop (panel admin), lengkap dengan tombol aksi di kanan. */
export const PageHead = ({ judul, sub, aksi }) => (
  <div className="hidden items-end justify-between gap-5 pb-1.5 pt-7 lg:flex">
    <div>
      <h1 className="text-[27px] font-extrabold tracking-[-.025em]">{judul}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
    {aksi && <div className="flex items-center gap-2.5">{aksi}</div>}
  </div>
)

/* ---------- hiasan & kepala halaman panel sekolah ---------- */

/** Dua anak berdiri utuh (sampai kaki) di atas gundukan rumput kecil. */
export function DuaAnak({ tinggi = 92, className = '' }) {
  const lebar = Math.round((tinggi * 120) / 230)
  return (
    <span className={`relative block ${className}`} style={{ width: lebar * 2 + 8, height: tinggi }} aria-hidden="true">
      <svg viewBox="0 0 120 20" className="redup-malam absolute -bottom-[5px] left-1/2 w-[128%] -translate-x-1/2" preserveAspectRatio="none" style={{ height: Math.round(tinggi * 0.16) }}>
        <ellipse cx="60" cy="11" rx="60" ry="9" fill="#9ED98A" />
        <ellipse cx="62" cy="13" rx="50" ry="7" fill="#8ED373" />
      </svg>
      <AnakUtuhLaki className="absolute bottom-0 left-0" style={{ width: lebar, height: tinggi }} />
      <AnakUtuhPerempuan className="absolute bottom-0 right-0" style={{ width: lebar, height: tinggi }} />
    </span>
  )
}

/** Gambar kecil untuk kepala halaman. */
function GambarKepala({ gambar, besar = false }) {
  const s = besar ? 1.12 : 1
  if (gambar === 'anak') return <DuaAnak tinggi={Math.round(92 * s)} />
  if (gambar === 'koin') {
    return (
      <span className="relative block" style={{ width: 118 * s, height: 86 * s }} aria-hidden="true">
        <TumpukanKoin className="absolute bottom-0 left-0" style={{ width: 50 * s, height: 50 * s }} />
        <KoinMaskot className="absolute bottom-0 right-0" style={{ width: 78 * s, height: 78 * s }} />
      </span>
    )
  }
  if (gambar === 'grafik') {
    return (
      <span className="relative block" style={{ width: 122 * s, height: 86 * s }} aria-hidden="true">
        <PapanGrafik className="absolute bottom-0 left-0" style={{ width: 80 * s, height: 80 * s }} />
        <KoinMaskot className="absolute -bottom-0.5 right-0" style={{ width: 54 * s, height: 54 * s }} />
      </span>
    )
  }
  if (gambar === 'saku') return <KoinSaku style={{ width: 84 * s, height: 84 * s }} />
  if (gambar === 'maskot') return <KoinMaskot style={{ width: 84 * s, height: 84 * s }} />
  if (gambar === 'sekolah') return <GedungTK className="redup-malam" style={{ width: 132 * s, height: 94 * s }} />
  return null
}

/**
 * Gedung TK dengan dua anak berdiri UTUH sampai kaki di depannya (tidak
 * tertutup rumput/semak), di atas gundukan rumput. Pelangi di belakang
 * (siang) atau bulan & bintang (mode gelap).
 *   besar=false → versi HP (±156px), besar=true → kartu sapaan PC.
 */
export function AdeganSekolah({ besar = false, className = '' }) {
  const anak = besar ? { width: 60, height: 116 } : { width: 46, height: 88 }
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="dark:hidden">
        <Pelangi className={besar ? 'absolute -right-10 top-2 w-[250px]' : 'absolute -right-5 top-0 w-[170px]'} />
      </div>
      <div className="hidden dark:block">
        <Bintang className="absolute inset-0 h-full w-full" />
        <Bulan className={besar ? 'absolute right-2 top-3 w-[50px]' : 'absolute right-3 top-0 w-[40px]'} />
      </div>
      <GedungTK className={`redup-malam absolute left-1/2 -translate-x-1/2 ${besar ? 'bottom-[2px] w-[250px]' : 'bottom-[2px] w-[150px]'}`} />
      <AnakUtuhLaki className={`absolute bottom-0 ${besar ? 'left-[22px]' : 'left-0'}`} style={anak} />
      <AnakUtuhPerempuan className={`absolute bottom-0 ${besar ? 'right-[22px]' : 'right-0'}`} style={anak} />
    </div>
  )
}

/** Pelangi & awan (siang) atau bulan & bintang (malam) di pojok kanan atas. */
export function LangitKepala() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -right-[18px] -top-[58px] h-[190px] w-[240px] lg:-right-2 lg:-top-3 lg:h-[150px] lg:w-[260px]">
      <div className="dark:hidden">
        <Pelangi className="absolute right-[-30px] top-[42px] w-[172px] lg:right-0 lg:top-0 lg:w-[210px]" />
        <Awan className="absolute left-[-120px] top-[18px] hidden w-[64px] lg:block" />
      </div>
      <div className="hidden dark:block">
        <Bintang className="absolute inset-0 h-full w-full" />
        <Bulan className="absolute right-[26px] top-[58px] w-[46px] lg:top-2 lg:w-[54px]" />
      </div>
    </div>
  )
}

/**
 * Kepala halaman panel sekolah — tampil di HP & PC.
 *   judul/sub : judul besar (Fredoka) + keterangan
 *   gambar    : 'anak' | 'koin' | 'grafik' | 'saku' | 'maskot' | 'sekolah' | null
 *   aksi      : tombol di PC (kanan). Juga dipakai di HP kalau `aksiHp` tidak diisi.
 *   aksiHp    : tombol khusus HP (baris di bawah judul). `null` = tanpa tombol.
 *   kembali   : fungsi tombol kembali (opsional, hanya tampil di HP)
 */
export function KepalaHalaman({ judul, sub, gambar = 'anak', aksi, aksiHp, kembali, className = '' }) {
  const hp = aksiHp === undefined ? aksi : aksiHp
  return (
    <header className={`relative mb-4 mt-1 lg:mb-5 lg:mt-7 lg:flex lg:min-h-[104px] lg:items-end lg:gap-5 ${className}`}>
      <LangitKepala />
      <div className={`relative z-[1] min-w-0 lg:flex-1 ${gambar ? 'min-h-[96px] pr-[128px] lg:min-h-0 lg:pr-0' : ''}`}>
        <div className="flex items-center gap-2.5">
          {kembali && (
            <button type="button" onClick={kembali} aria-label="Kembali" className="tombol-bilah grid h-10 w-10 shrink-0 place-items-center rounded-[14px] active:scale-95 lg:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          )}
          <h1 className="judul-halaman min-w-0 font-display text-[29px] font-bold leading-[1.1] tracking-[-.3px] lg:text-[34px]">{judul}</h1>
        </div>
        {sub && <p className="sub-halaman mt-1.5 text-[13px] font-bold leading-snug lg:max-w-[560px] lg:text-[14px]">{sub}</p>}
      </div>
      {gambar && (
        <>
          <div className="pointer-events-none absolute -right-1 top-0 z-[1] flex h-[96px] w-[124px] items-end justify-center lg:hidden">
            <GambarKepala gambar={gambar} />
          </div>
          <div className="pointer-events-none relative z-[1] hidden shrink-0 self-end xl:block">
            <GambarKepala gambar={gambar} besar />
          </div>
        </>
      )}
      {hp && <div className="relative z-[2] mt-3 flex flex-wrap items-center gap-2 lg:hidden">{hp}</div>}
      {aksi && <div className="relative z-[2] hidden shrink-0 flex-wrap items-center justify-end gap-2.5 lg:flex">{aksi}</div>}
    </header>
  )
}

/**
 * Penutup halaman: taman bermain — anak main ayunan, perosotan (HP), plus
 * jungkat-jungkit, buku & bintang di layar lebar. Ditaruh paling bawah area
 * gulir (mt-auto) sehingga bagian bawah layar tidak pernah kosong dan tidak
 * ada ruang/padding sisa di bawahnya.
 */
export function KakiRumput({ className = '' }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none relative h-[150px] shrink-0 overflow-hidden lg:h-[180px] ${className}`}>
      {/* HP & tablet */}
      <div className="absolute inset-0 lg:hidden">
        <Bukit className="absolute inset-x-0 bottom-0 h-[104px] w-full" />
        <TamanAyunan className="redup-malam absolute bottom-[26px] left-2" />
        <TamanSemakBunga className="redup-malam absolute bottom-[30px] left-[152px] max-[379px]:hidden" />
        <TamanBola className="redup-malam absolute bottom-[26px] left-[214px] max-[379px]:hidden" />
        <TamanPerosotan className="redup-malam absolute bottom-[30px] right-2" />
      </div>
      {/* layar lebar */}
      <div className="absolute inset-0 hidden lg:block">
        <BukitLebar className="absolute inset-x-0 bottom-0 h-[120px] w-full" />
        <TamanAyunan className="redup-malam absolute bottom-[22px] left-[13%] h-auto w-[166px]" />
        <TamanSemakBunga className="redup-malam absolute bottom-[26px] left-[31%]" />
        <TamanJungkat className="redup-malam absolute bottom-[20px] left-[42%] h-auto w-[195px]" />
        <TamanSemakBungaB className="redup-malam absolute bottom-[30px] left-[61%]" />
        <TamanBola className="redup-malam absolute bottom-[22px] left-[69%] h-auto w-[18px]" />
        <TamanPerosotanB className="redup-malam absolute bottom-[24px] right-[13%] h-auto w-[183px]" />
        <BukuPensil className="redup-malam absolute bottom-3 left-[22px] w-[76px]" />
        <BintangWajah className="redup-malam absolute bottom-4 right-[26px] w-[54px]" />
      </div>
    </div>
  )
}

export const BtnKecil = ({ utama, children, className = '', ...p }) => (
  <button
    {...p}
    className={`flex items-center gap-2 whitespace-nowrap rounded-[14px] px-4 py-2.5 text-[13.5px] font-extrabold transition active:translate-y-px disabled:opacity-60 ${
      utama ? 'bg-brand text-white shadow-[inset_0_-3px_0_#2A55CC,0_6px_14px_rgba(59,110,246,.22)]' : 'tombol-putih text-ink'
    } ${className}`}
  >
    {children}
  </button>
)


export const Scroll = ({ children, className = '' }) => (
  <div className={`noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] ${className}`}>{children}</div>
)

/* ---------- potongan kecil ---------- */
export const Chip = ({ warna = 'grey', children }) => {
  const gaya = {
    green: 'bg-ok-soft text-ok-deep',
    red: 'bg-danger-soft text-danger',
    amber: 'bg-warn-soft text-warn-deep',
    blue: 'bg-brand-soft text-brand',
    grey: 'bg-[#F1F2F6] text-muted',
  }[warna]
  return <span className={`chip ${gaya}`}>{children}</span>
}

export const Tile = ({ warna = 'blue', children, className = '' }) => {
  const gaya = {
    blue: 'bg-brand-soft text-brand',
    green: 'bg-ok-soft text-ok',
    amber: 'bg-warn-soft text-warn',
    grape: 'bg-grape-soft text-grape',
    rose: 'bg-rose-soft text-rose',
    red: 'bg-danger-soft text-danger',
  }[warna]
  return <span className={`tile ${gaya} ${className}`}>{children}</span>
}

export const Track = ({ persen, warna = '#22C55E', tinggi = 6 }) => (
  <div className="track" style={{ height: tinggi }}>
    <i className="block h-full rounded-pill" style={{ width: `${Math.min(100, persen)}%`, background: warna }} />
  </div>
)

/** Layar penuh untuk keadaan memuat / gagal, dengan tombol coba lagi. */
export const Muat = ({ children, aksi }) => (
  <div className="langit-masuk grid min-h-dvh place-items-center px-8 text-center">
    <div>
      <LogoKasceria size={64} className={`mx-auto mb-3.5 ${aksi ? '' : 'animate-pulse'}`} />
      <p className="text-sm font-semibold text-[#34405C] dark:text-[#B8C3DC]">{children}</p>
      {aksi && (
        <button className="tombol-putih mt-4 rounded-2xl px-5 py-2.5 text-[13px] font-extrabold" onClick={aksi}>
          Coba lagi
        </button>
      )}
    </div>
  </div>
)

export const Kosong = ({ children }) => (
  <div className="px-5 py-8 text-center text-[13.5px] text-muted">{children}</div>
)

/**
 * Keadaan kosong bergambar (gedung TK + dua anak) untuk daftar yang belum
 * berisi apa pun — mis. belum ada siswa.
 */
export const KosongCeria = ({ judul, children, aksi, className = '' }) => (
  <div className={`flex flex-col items-center px-4 pb-6 pt-4 text-center ${className}`}>
    <span className="relative block h-[132px] w-[250px]" aria-hidden="true">
      <GedungTK className="redup-malam absolute bottom-0 left-1/2 w-[190px] -translate-x-1/2" />
      <AnakUtuhLaki className="absolute bottom-0 left-0" style={{ width: 50, height: 96 }} />
      <AnakUtuhPerempuan className="absolute bottom-0 right-0" style={{ width: 50, height: 96 }} />
    </span>
    <h3 className="judul-halaman mt-3 font-display text-[22px] font-bold leading-tight">{judul}</h3>
    {children && <p className="mt-1.5 max-w-[340px] text-[13.5px] font-semibold leading-relaxed text-muted">{children}</p>}
    {aksi && <div className="mt-4 flex w-full max-w-[340px] flex-col gap-2.5">{aksi}</div>}
  </div>
)

export const Chevron = () => (
  <svg className="shrink-0 text-[#C8CDD8]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export const Segment = ({ nilai, ubah, opsi }) => (
  <div className="my-4 flex gap-1 rounded-[18px] bg-kartu/70 p-1 shadow-[0_4px_14px_rgba(30,64,140,.06)] dark:bg-white/5">
    {opsi.map((o) => (
      <button
        key={o.nilai}
        onClick={() => ubah(o.nilai)}
        className={`flex-1 rounded-[14px] py-2.5 text-[13.5px] font-extrabold transition ${
          nilai === o.nilai ? 'permen permen-kecil permen-biru' : 'text-muted hover:text-ink'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
)

/* ---------- bottom sheet ---------- */
export function Sheet({ buka, tutup, judul, lead, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && tutup()
    if (buka) document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [buka, tutup])
  if (!buka) return null
  return (
    <div
      className="absolute inset-0 z-50 flex animate-fade items-end bg-[rgba(21,26,38,.42)] lg:items-center lg:justify-center lg:p-6"
      onMouseDown={(e) => e.target === ref.current && tutup()}
      ref={ref}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="noscroll max-h-[90%] w-full animate-up overflow-y-auto rounded-t-[26px] bg-canvas px-[18px] pb-6 pt-2 lg:max-h-[86vh] lg:max-w-[460px] lg:animate-fade lg:rounded-[24px] lg:px-6 lg:pt-4"
      >
        <div className="sticky top-0 z-10 -mb-2 flex h-0 justify-end">
          <button
            onClick={tutup}
            aria-label="Tutup"
            className="-mr-1 mt-1 grid h-9 w-9 place-items-center rounded-full text-muted hover:text-ink active:scale-95 lg:-mr-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="mx-auto mb-3.5 mt-1.5 h-[5px] w-11 rounded-[9px] bg-[#D8DCE6] lg:hidden" />
        {judul && <h3 className="mb-1 pr-10 text-[18px] font-extrabold">{judul}</h3>}
        {lead && <p className="mb-4 text-[13.5px] text-muted">{lead}</p>}
        {children}
      </div>
    </div>
  )
}

/* ---------- toast ---------- */
export const Toast = ({ pesan }) => {
  // Penting: JANGAN render apa pun saat tidak ada pesan. Versi lama selalu
  // menaruh <div> berlatar gelap di DOM (isi " ") lalu digeser keluar layar —
  // tapi kotak kecilnya tetap sempat muncul sebagai "titik hitam" nyangkut di
  // atas nav pada sebagian perangkat. Dengan early-return ini, elemennya benar-
  // benar tidak ada selama tidak ada notifikasi.
  if (!pesan) return null
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-[60] max-w-[88%] -translate-x-1/2 animate-fade rounded-[14px] bg-ink px-4 py-2.5 text-center text-[13px] font-semibold text-white lg:bottom-7">
      {pesan}
    </div>
  )
}

/* ---------- ikon ---------- */
const P = (d, extra = {}) => ({ size, className = '', ...rest }) => (
  <svg
    width={size || 22}
    height={size || 22}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...extra}
    {...rest}
  >
    {d}
  </svg>
)

/**
 * Badge WhatsApp — lingkaran hijau dengan ikon telepon putih di tengah.
 * Dipisah dari objek Ikon (yang semuanya ikon garis single-color) karena
 * ini butuh dua warna (latar hijau + ikon putih), bukan cuma stroke.
 */
export const IkonWhatsapp = ({ size = 18, className = '' }) => (
  <span
    className={`inline-grid shrink-0 place-items-center rounded-full ${className}`}
    style={{ width: size, height: size, background: '#25D366' }}
  >
    <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" />
    </svg>
  </span>
)

/** Varian polos (tanpa badge lingkaran hijau) — dipakai di atas tombol
 *  yang latarnya sendiri sudah hijau, supaya tidak dobel lingkaran. */
export const IkonWhatsappPolos = ({ size = 16, warna = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={warna} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </svg>
)

export const Ikon = {
  rumah: P(<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />),
  siswa: P(<><circle cx="9.5" cy="8.5" r="3.2" /><path d="M3.5 19c.9-3.2 3.3-4.7 6-4.7s5.1 1.5 6 4.7" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19c-.3-1.6-.8-2.9-1.6-3.9 2.2.2 3.9 1.6 4.6 3.9" /></>),
  dompet: P(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18" /></>),
  grafik: P(<path d="M6 20V11M12 20V5M18 20v-6" />),
  plus: P(<path d="M12 5v14M5 12h14" />),
  kalender: P(<><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>),
  dokumen: P(<><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h4" /></>),
  nota: P(<><path d="M6 3h8l4 4v14l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 10h6M9 14h4" /></>),
  jam: P(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.2 2" /></>),
  lonceng: P(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  cek: P(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  cari: P(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  kembali: P(<path d="M15 5l-7 7 7 7" />),
  telepon: P(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" />),
  tanya: P(<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.7" /><circle cx="12" cy="16.8" r=".2" strokeWidth="2.4" /></>),
  peringatan: P(<><path d="M12 8v5" /><circle cx="12" cy="16.6" r=".2" strokeWidth="2.6" /><path d="M10.3 4.2 3.4 17a1.8 1.8 0 0 0 1.6 2.7h14a1.8 1.8 0 0 0 1.6-2.7L13.7 4.2a1.9 1.9 0 0 0-3.4 0z" /></>),
  info: P(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r=".2" strokeWidth="2.6" /></>),
  menu: P(<path d="M4 7h16M4 12h16M4 17h16" />),
  orang: P(<><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1-3.6 3.8-5.2 7-5.2s6 1.6 7 5.2" /></>),
  titikTiga: P(<><circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" /></>),
  toga: P(<><path d="M2.5 9L12 5l9.5 4L12 13z" /><path d="M6.5 11v4.5c1.6 1.5 3.5 2 5.5 2s3.9-.5 5.5-2V11" /><path d="M21.5 9v5" /></>),
  unggah: P(<><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
  unduh: P(<><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
  pensil: P(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  saring: P(<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />),
  excel: P(<><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>),
}

/**
 * Pil pilihan/saring (mis. Semua · Kelas A · Menunggak).
 * Aktif → permen biru (atau `warna` lain), tidak aktif → putih bertepi.
 */
export const Pil = ({ on, warna = 'biru', ikon, children, className = '', ...p }) => (
  <button
    type="button"
    {...p}
    aria-pressed={on}
    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2 text-[13px] font-extrabold transition ${
      on ? `permen permen-kecil permen-${warna}` : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-ink hover:border-brand/50 dark:border-line'
    } ${className}`}
  >
    {ikon}
    {children}
  </button>
)

/** Kolom cari putih bertepi (kaca pembesar di kiri). */
export const KolomCari = ({ nilai, ubah, placeholder = 'Cari…', className = '' }) => (
  <label className={`flex min-w-0 items-center gap-2.5 rounded-[16px] border-[1.5px] border-[#DCE6F4] bg-kartu px-3.5 py-3 shadow-[0_8px_24px_rgba(30,64,140,.06)] focus-within:border-brand dark:border-line ${className}`}>
    <span className="text-[#7C8AA5]"><Ikon.cari size={19} /></span>
    <input
      value={nilai}
      onChange={(e) => ubah(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
    />
  </label>
)
/* ---------- mode terang / gelap ---------- */

/** Pilihan tema lengkap: Terang · Gelap · Otomatis (ikut HP/laptop). */
export function PilihTema({ className = '' }) {
  const { pilihan, setTema } = useTema()
  const opsi = [
    { id: 'terang', e: '☀️', label: 'Terang' },
    { id: 'gelap', e: '🌙', label: 'Gelap' },
    { id: 'otomatis', e: '📱', label: 'Otomatis' },
  ]
  return (
    <div role="radiogroup" aria-label="Mode tampilan" className={`flex rounded-[14px] bg-isi p-1 ${className}`}>
      {opsi.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pilihan === o.id}
          onClick={() => setTema(o.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2 text-[13px] font-bold transition ${
            pilihan === o.id ? 'bg-kartu text-ink shadow-[0_1px_4px_rgba(0,0,0,.12)]' : 'text-muted'
          }`}
        >
          <span style={FONT_EMOJI} aria-hidden="true">{o.e}</span>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Kartu "Tampilan" siap pakai untuk halaman pengaturan/menu. */
export const KartuTema = ({ className = '' }) => (
  <div className={`card ${className}`}>
    <div className="judul-kartu mb-1 text-[17px]">Tampilan</div>
    <p className="mb-3 text-[12.5px] text-muted">Mode gelap lebih nyaman di malam hari. Pilihan ini hanya berlaku di perangkat ini.</p>
    <PilihTema />
  </div>
)

/** Tombol ikon kecil: ganti cepat terang ↔ gelap. */
export function TombolTema({ className = '' }) {
  const { aktif, alihTema } = useTema()
  const gelap = aktif === 'gelap'
  return (
    <button
      onClick={alihTema}
      title={gelap ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      aria-label={gelap ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-kartu text-[16px] transition hover:border-brand ${className}`}
    >
      <span style={FONT_EMOJI} aria-hidden="true">{gelap ? '☀️' : '🌙'}</span>
    </button>
  )
}
