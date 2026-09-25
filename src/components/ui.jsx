/** Komponen tampilan yang dipakai bersama panel guru dan portal orang tua. */
import { useEffect, useRef } from 'react'

/**
 * Kerangka aplikasi.
 *
 * Sampai lebar 1024px tampilannya seperti aplikasi HP: bingkai sempit,
 * navigasi di bawah. Mulai 1024px berubah jadi aplikasi web biasa —
 * bingkai hilang, sidebar muncul di kiri, konten memenuhi layar.
 */
export function Shell({ children, sidebar, topbar, tabbar, fab }) {
  return (
    <div className="flex min-h-dvh justify-center sm:py-6 lg:bg-[#F0F2F7] lg:py-0">
      <div className="relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas sm:h-[min(900px,calc(100dvh-48px))] sm:rounded-[36px] sm:shadow-phone lg:h-dvh lg:max-w-none lg:flex-row lg:rounded-none lg:shadow-none">
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
export const Sidebar = ({ children }) => (
  <aside className="hidden w-[250px] shrink-0 flex-col gap-1.5 border-r border-line bg-white px-4 py-5 lg:flex">
    {children}
  </aside>
)

export const SidebarBrand = ({ nama, sub }) => (
  <div className="flex items-center gap-3 px-2 pb-4">
    <span className="grid h-[42px] w-[42px] place-items-center rounded-[13px] bg-brand-soft text-xl">🏫</span>
    <span className="min-w-0">
      <b className="block truncate text-[14.5px] font-extrabold leading-tight">{nama}</b>
      <span className="block truncate text-[11.5px] font-semibold text-muted" title={sub}>{sub}</span>
    </span>
  </div>
)

export const NavLabel = ({ children }) => (
  <div className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-extrabold uppercase tracking-[.09em] text-muted">
    {children}
  </div>
)

/**
 * Emoji berwarna untuk menu navigasi. Tiap menu punya emoji + warna
 * latar pastelnya sendiri, dipakai sama di sidebar desktop, tab bar
 * mobile, dan halaman "Lainnya" supaya orang cepat mengenali menunya.
 */
export const EMOJI_MENU = {
  beranda: { e: '🏠', bg: '#E4EEFF' },
  siswa: { e: '🧒', bg: '#FFEFD9' },
  tagihan: { e: '🧾', bg: '#FFF4CC' },
  pembayaran: { e: '💳', bg: '#DFF6E9' },
  bayar: { e: '💵', bg: '#DFF6E9' },
  laporan: { e: '📊', bg: '#EEE6FF' },
  lainnya: { e: '🧩', bg: '#FFE6EE' },
  biaya: { e: '🏷️', bg: '#FFE6EE' },
  kode: { e: '🔑', bg: '#FFF4CC' },
  sekolah: { e: '🏫', bg: '#DDF4F6' },
  langganan: { e: '💎', bg: '#E4EEFF' },
  akun: { e: '🙋', bg: '#FFEADF' },
  ringkasan: { e: '📈', bg: '#EEE6FF' },
  riwayat: { e: '🗂️', bg: '#FFF4CC' },
  ai: { e: '🤖', bg: '#E4F1FF' },
  pengaturan: { e: '⚙️', bg: '#F1F2F6' },
}

const FONT_EMOJI = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }

/** Kotak emoji menu. `latar=false` → tanpa kotak pastel (emoji saja). */
export const EmojiMenu = ({ id, size = 34, latar = true, className = '' }) => {
  const m = EMOJI_MENU[id] || { e: '•', bg: '#F1F4F9' }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[11px] transition ${className}`}
      style={{ width: size, height: size, background: latar ? m.bg : 'transparent', fontSize: Math.round(size * 0.52), ...FONT_EMOJI }}
    >
      {m.e}
    </span>
  )
}

export const NavItem = ({ aktif, onClick, ikon: Icon, emoji, children }) => (
  <button
    onClick={onClick}
    aria-current={aktif ? 'page' : undefined}
    className={`flex w-full items-center gap-3 rounded-[14px] text-left text-sm font-bold transition ${
      emoji ? 'px-2 py-[7px]' : 'px-3 py-2.5'
    } ${aktif ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-[#F7F8FC]'}`}
  >
    {emoji ? (
      <EmojiMenu id={emoji} size={34} className={aktif ? 'bg-white shadow-[0_2px_8px_rgba(59,110,246,.18)]' : ''} />
    ) : (
      <Icon size={19} />
    )}
    {children}
  </button>
)

/** Satu item tab bar bawah (mobile) dengan emoji berwarna. */
export const TabEmoji = ({ id, label, aktif, onClick, redup }) => (
  <button
    onClick={onClick}
    aria-current={aktif ? 'page' : undefined}
    className="flex flex-1 flex-col items-center justify-center gap-[3px] py-1"
  >
    <span
      className={`grid h-8 w-[46px] place-items-center rounded-full transition ${aktif ? 'scale-105' : ''} ${redup ? 'opacity-45 grayscale' : ''}`}
      style={{ background: aktif ? EMOJI_MENU[id]?.bg : 'transparent' }}
    >
      <span style={{ fontSize: aktif ? 20 : 19, ...FONT_EMOJI }} aria-hidden="true">{EMOJI_MENU[id]?.e}</span>
    </span>
    <span className={`text-[10.5px] ${aktif ? 'font-extrabold text-brand' : 'font-bold text-muted'}`}>{label}</span>
  </button>
)

/** Judul halaman versi desktop, lengkap dengan tombol aksi di kanan. */
export const PageHead = ({ judul, sub, aksi }) => (
  <div className="hidden items-end justify-between gap-5 pb-1.5 pt-7 lg:flex">
    <div>
      <h1 className="text-[27px] font-extrabold tracking-[-.025em]">{judul}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
    {aksi && <div className="flex items-center gap-2.5">{aksi}</div>}
  </div>
)

export const BtnKecil = ({ utama, children, ...p }) => (
  <button
    {...p}
    className={`flex items-center gap-2 rounded-[13px] border px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-60 ${
      utama ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'
    }`}
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
  <div className="grid min-h-dvh place-items-center px-8 text-center">
    <div>
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white text-2xl shadow-soft">🏫</div>
      <p className="text-sm text-muted">{children}</p>
      {aksi && (
        <button className="mt-4 rounded-2xl bg-white px-5 py-2.5 text-[13px] font-extrabold shadow-soft" onClick={aksi}>
          Coba lagi
        </button>
      )}
    </div>
  </div>
)

export const Kosong = ({ children }) => (
  <div className="px-5 py-8 text-center text-[13.5px] text-muted">{children}</div>
)

export const Chevron = () => (
  <svg className="shrink-0 text-[#C8CDD8]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export const Segment = ({ nilai, ubah, opsi }) => (
  <div className="my-4 flex rounded-[14px] bg-[#EDEFF5] p-1">
    {opsi.map((o) => (
      <button
        key={o.nilai}
        onClick={() => ubah(o.nilai)}
        className={`flex-1 rounded-[11px] py-2.5 text-[13.5px] font-bold transition ${
          nilai === o.nilai ? 'bg-white text-ink shadow-[0_1px_4px_rgba(21,26,38,.08)]' : 'text-muted'
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
        <div className="mx-auto mb-3.5 mt-1.5 h-[5px] w-11 rounded-[9px] bg-[#D8DCE6] lg:hidden" />
        {judul && <h3 className="mb-1 text-[18px] font-extrabold">{judul}</h3>}
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
}