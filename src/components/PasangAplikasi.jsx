/**
 * Popup "Pasang Kasceria" (PWA).
 *
 *  <PasangOtomatis />  — dipasang sekali di main.jsx; muncul sendiri ±1,5 detik
 *                        setelah link /guru atau /ortu dibuka, kalau perangkat
 *                        bisa memasang & belum terpasang. "Nanti saja" = 7 hari.
 *  <KartuPasang />     — kartu kecil di menu Lainnya (guru) & Bantuan (wali),
 *                        untuk yang sudah menekan "Nanti saja" tapi berubah pikiran.
 *
 * Android & Chrome/Edge laptop: tombol "Pasang aplikasi" → dialog bawaan browser.
 * iPhone/iPad: tidak ada dialog bawaan → tampil 3 langkah "Bagikan › Tambah ke Layar Utama".
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { mintaPasang, tundaPasang, usePasang } from '../lib/pasang.js'

const garis = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const IKON = {
  ketuk: <><path d="M9 11.5V5.8a1.8 1.8 0 0 1 3.6 0v5" /><path d="M12.6 10.3a1.8 1.8 0 0 1 3.6 0v1.2" /><path d="M16.2 11a1.8 1.8 0 0 1 3.4.8V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.9-2.6L4.4 14.6a1.7 1.7 0 0 1 2.8-2L9 14.8" /></>,
  layar: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 18.5h3" /></>,
  ringan: <><path d="M12 3v11" /><path d="M7.5 9.5L12 14l4.5-4.5" /><path d="M5 18.5h14" /></>,
  jendela: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M3 8.5h18" /></>,
  taskbar: <><rect x="3" y="15.5" width="18" height="5" rx="1.6" /><rect x="8.5" y="4" width="7" height="7" rx="2" /></>,
  bagikan: <><path d="M12 3v11.5" /><path d="M8 7l4-4 4 4" /><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" /></>,
  tambah: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></>,
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
}
const Ikon = ({ n, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" {...garis} aria-hidden="true">{IKON[n]}</svg>

const TEKS = {
  guru: {
    judul: 'Pasang Kasceria',
    hp: 'Jadikan aplikasi di HP — tidak perlu mengetik alamat lagi.',
    pc: 'Jadikan aplikasi di laptop/komputer — tidak perlu mencari tab lagi.',
    label: 'Kasceria',
  },
  wali: {
    judul: 'Simpan portal tagihan di HP',
    hp: 'Cek tagihan, riwayat bayar, dan kuitansi anak cukup sekali ketuk.',
    pc: 'Buka tagihan dan kuitansi anak langsung dari komputer.',
    label: 'Tagihan TK',
  },
}
const MANFAAT = {
  hp: [
    ['ketuk', 'Sekali ketuk dari layar utama HP'],
    ['layar', 'Tampil penuh, tanpa bilah alamat browser'],
    ['ringan', 'Ringan, tidak lewat Play Store'],
  ],
  pc: [
    ['taskbar', 'Buka dari desktop atau taskbar'],
    ['jendela', 'Jendela sendiri, terpisah dari tab browser'],
    ['ringan', 'Tanpa unduh installer'],
  ],
}

/** Ilustrasi layar utama: deretan aplikasi, ikon Kasceria yang baru dipasang. */
function LayarUtama({ label }) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-[22px] bg-brand-soft px-4 pb-3 pt-4 [@media(max-height:680px)]:hidden">
      <div className="grid grid-cols-4 justify-items-center gap-2">
        {['#DCE4F5', '#E4DEF6', '#D9EEE7'].map((w, i) => (
          <span key={i} className="flex flex-col items-center gap-1.5">
            <span className="block h-[50px] w-[50px] rounded-[15px] dark:opacity-30" style={{ background: w }} />
            <span className="block h-[7px] w-9 rounded-full bg-[#C9D3E8] dark:bg-white/15" />
          </span>
        ))}
        <span className="flex flex-col items-center gap-1">
          <span className="relative">
            <img src="/icons/icon-192.png" alt="" width="50" height="50" className="pasang-ikon block h-[50px] w-[50px] rounded-[15px] shadow-[0_6px_14px_rgba(42,85,204,.28)]" />
            <span className="absolute -right-1.5 -top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-ok text-white ring-[3px] ring-brand-soft">
              <Ikon n="ok" size={13} />
            </span>
          </span>
          <span className="max-w-[72px] truncate text-[12px] font-extrabold text-[#1B2559] dark:text-ink">{label}</span>
        </span>
      </div>
    </div>
  )
}

function Langkah({ no, ikon, judul, sub }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-kartu text-brand shadow-[inset_0_-2px_0_#E3E9F4] dark:shadow-none">
        <Ikon n={ikon} size={22} />
      </span>
      <span className="min-w-0">
        <b className="block text-[15px] font-extrabold leading-snug"><span className="text-muted">{no}.</span> {judul}</b>
        <span className="block text-[13px] font-semibold leading-snug text-muted">{sub}</span>
      </span>
    </li>
  )
}

/**
 * Popup pasang. `wali` = portal orang tua. `tutup(alasan)`: 'nanti' | 'selesai'.
 */
export function PopupPasang({ buka, tutup, wali = false }) {
  const { cara, perangkat } = usePasang()
  const [tahap, setTahap] = useState('tawar') // tawar | memasang | berhasil
  const kotak = useRef(null)
  const tutupRef = useRef(tutup)
  tutupRef.current = tutup
  const t = TEKS[wali ? 'wali' : 'guru']
  const hp = perangkat !== 'pc'

  useEffect(() => {
    if (!buka) return
    setTahap('tawar')
    const esc = (e) => e.key === 'Escape' && tutupRef.current('nanti')
    document.addEventListener('keydown', esc)
    const id = setTimeout(() => kotak.current?.focus({ preventScroll: true }), 60)
    return () => { document.removeEventListener('keydown', esc); clearTimeout(id) }
  }, [buka])

  if (!buka) return null

  const pasang = async () => {
    setTahap('memasang')
    const hasil = await mintaPasang()
    if (hasil === 'diterima') setTahap('berhasil')
    else tutup('nanti')
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex animate-fade items-end bg-[rgba(21,26,38,.45)] lg:items-center lg:justify-center lg:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && tutup('nanti')}
    >
      <div
        ref={kotak}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pasang-judul"
        className="noscroll max-h-[92dvh] w-full animate-up outline-none overflow-y-auto rounded-t-[28px] bg-canvas px-[18px] pb-[max(20px,env(safe-area-inset-bottom))] pt-2 lg:max-w-[440px] lg:animate-fade lg:rounded-[26px] lg:px-6 lg:pb-6 lg:pt-5"
      >
        <div className="mx-auto mb-3 mt-1.5 h-[5px] w-11 rounded-[9px] bg-[#D8DCE6] dark:bg-white/15 lg:hidden" />

        {tahap === 'berhasil' ? (
          <div className="py-2 text-center">
            <img src="/icons/icon-192.png" alt="" width="76" height="76" className="mx-auto mb-3 h-[76px] w-[76px] rounded-[22px]" />
            <h2 id="pasang-judul" className="font-display text-[23px] font-semibold text-[#1B2559] dark:text-ink">Sedang dipasang</h2>
            <p className="mx-auto mb-5 mt-1.5 max-w-[320px] text-[15px] font-semibold leading-relaxed text-muted">
              Sebentar lagi ikon <b className="text-ink">{t.label}</b> muncul di {hp ? 'layar utama HP' : 'desktop & menu Start'}. Berikutnya buka dari ikon itu saja.
            </p>
            <button type="button" data-utama onClick={() => tutup('selesai')} className="bigbtn">Oke</button>
          </div>
        ) : (
          <>
            <LayarUtama label={t.label} />
            <h2 id="pasang-judul" className="font-display text-[23px] font-semibold leading-tight text-[#1B2559] dark:text-ink">{t.judul}</h2>
            <p className="mb-3 mt-1 text-[15px] font-semibold leading-relaxed text-muted">{hp ? t.hp : t.pc}</p>

            {cara === 'ios' ? (
              <>
                <ol className="mb-3 rounded-[20px] bg-isi px-3 py-1.5">
                  <Langkah no={1} ikon="bagikan" judul={<>Ketuk tombol <span className="text-brand">Bagikan</span></>} sub="Di bilah Safari, atau di menu •••" />
                  <Langkah no={2} ikon="tambah" judul={<>Pilih <span className="text-brand">Tambah ke Layar Utama</span></>} sub="Gulir ke bawah kalau belum terlihat" />
                  <Langkah no={3} ikon="ok" judul={<>Ketuk <span className="text-brand">Tambah</span></>} sub={`Ikon ${t.label} muncul di layar utama`} />
                </ol>
                <p className="mb-4 rounded-[14px] bg-warn-soft px-3 py-2 text-[13px] font-bold leading-snug text-warn-deep">
                  Dibuka dari WhatsApp? Ketuk ikon kompas atau “Buka di Safari” dulu, baru ikuti langkah di atas.
                </p>
                <button type="button" data-utama onClick={() => tutup('nanti')} className="bigbtn">Mengerti</button>
              </>
            ) : (
              <>
                <ul className="mb-4 grid gap-2">
                  {MANFAAT[hp ? 'hp' : 'pc'].map(([ikon, teks]) => (
                    <li key={ikon} className="flex items-center gap-3 text-[15px] font-bold">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand"><Ikon n={ikon} size={19} /></span>
                      {teks}
                    </li>
                  ))}
                </ul>
                <button type="button" data-utama onClick={pasang} disabled={tahap === 'memasang' || cara !== 'tombol'} className="bigbtn disabled:opacity-60">
                  {tahap === 'memasang' ? 'Menunggu konfirmasi…' : 'Pasang aplikasi'}
                </button>
                <button type="button" onClick={() => tutup('nanti')} className="mt-1.5 min-h-[46px] w-full rounded-[16px] text-[15px] font-extrabold text-muted hover:text-ink">
                  Nanti saja
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const bagianDariAlamat = (p) => (p === '/ortu' || p.startsWith('/ortu/') ? 'wali' : p.startsWith('/guru') ? 'guru' : null)

/** Muncul sendiri sekali saat link dibuka (lihat aturan di lib/pasang.js). */
export function PasangOtomatis() {
  const { pathname } = useLocation()
  const { tawarkan } = usePasang()
  const [buka, setBuka] = useState(false)
  const [selesai, setSelesai] = useState(false) // sudah tampil di kunjungan ini
  const bagian = bagianDariAlamat(pathname)

  useEffect(() => {
    if (!bagian || !tawarkan || selesai || buka) return
    const id = setTimeout(() => setBuka(true), 1500)
    return () => clearTimeout(id)
  }, [bagian, tawarkan, selesai, buka])

  const tutup = (alasan) => {
    if (alasan === 'nanti') tundaPasang()
    setBuka(false)
    setSelesai(true)
  }
  return <PopupPasang buka={buka && !!bagian} tutup={tutup} wali={bagian === 'wali'} />
}

/** Kartu "Pasang aplikasi" untuk menu Lainnya / Bantuan — hilang sendiri kalau sudah terpasang. */
export function KartuPasang({ wali = false, className = '' }) {
  const { bisa, perangkat } = usePasang()
  const [buka, setBuka] = useState(false)
  if (!bisa && !buka) return null
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className={`card flex w-full items-center gap-3.5 text-left transition active:scale-[.99] ${className}`}>
        <img src="/icons/icon-192.png" alt="" width="46" height="46" className="h-[46px] w-[46px] shrink-0 rounded-[14px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">{wali ? 'Simpan portal di HP' : 'Pasang aplikasi'}</span>
          <span className="block text-xs font-semibold text-muted">{perangkat === 'pc' ? 'Buka dari desktop, tanpa cari tab' : 'Buka sekali ketuk dari layar utama'}</span>
        </span>
        <span className="shrink-0 rounded-full bg-brand px-3.5 py-2 text-[13px] font-extrabold text-white">Pasang</span>
      </button>
      <PopupPasang buka={buka} tutup={() => setBuka(false)} wali={wali} />
    </>
  )
}
