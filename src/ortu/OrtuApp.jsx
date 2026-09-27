import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { Shell, Toast, Muat, TombolTema } from '../components/ui.jsx'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import { bulanBerjalan, kegiatanBelum, rp, sppPerluSekarang, waSekolah } from '../lib/format.js'
import { useData } from '../lib/store.jsx'
import Beranda, { LogoSekolah } from './Beranda.jsx'
import Tagihan from './Tagihan.jsx'
import Riwayat from './Riwayat.jsx'
import Bantuan from './Bantuan.jsx'
import Kegiatan from './Kegiatan.jsx'
import { SheetStruk, SheetCaraBayar, SheetPengumuman, SheetKegiatan, TombolLonceng } from './sheets.jsx'

/**
 * Portal orang tua — hanya melihat, tidak bisa mengubah data.
 * Di produksi, anak yang tampil ditentukan token pada URL (/ortu/:token).
 */
export default function OrtuApp() {
  const { siap, galat, pesan, siswa, wali, pengaturan, muat, segarkan } = useData()
  const { token } = useParams()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [anakId, setAnakId] = useState(null)
  const [struk, setStruk] = useState(null)
  const [caraBayar, setCaraBayar] = useState(false)
  const [pengumuman, setPengumuman] = useState(false)
  const [kegiatan, setKegiatan] = useState(null) // id biaya kegiatan yang infonya sedang dibuka

  useEffect(() => {
    muat({ mode: 'ortu', token })
  }, [token, muat])

  // Pindah halaman (mis. tombol "Lihat rincian") → selalu mulai dari paling atas.
  const gulir = useRef(null)
  useEffect(() => {
    if (gulir.current) gulir.current.scrollTop = 0
  }, [pathname])

  if (galat) return <Muat aksi={segarkan}>{galat}</Muat>
  if (!siap) return <Muat>Memuat data tagihan…</Muat>

  const anak = siswa.filter((s) => wali.anak.includes(s.id))
  const aktif = anak.find((a) => a.id === anakId) || anak[0]
  if (!aktif) return <Muat>Tautan ini belum terhubung ke data siswa mana pun. Hubungi pihak sekolah.</Muat>
  const tab = pathname.includes('/tagihan') ? 'tagihan'
    : pathname.includes('/riwayat') ? 'riwayat'
    : pathname.includes('/kegiatan') ? 'kegiatan'
    : pathname.includes('/bantuan') ? 'bantuan' : 'beranda'

  const akar = token ? `/ortu/${token}` : '/ortu'
  const layar = {
    akar, anak, aktif, pilihAnak: setAnakId, bukaStruk: setStruk, bukaCaraBayar: () => setCaraBayar(true),
    bukaPengumuman: () => setPengumuman(true), bukaKegiatan: setKegiatan,
  }

  return (
    // .teks-jelas: semua teks abu-abu (text-muted) dibuat hitam supaya
    // lebih jelas dibaca — lihat src/index.css.
    <div className="teks-jelas">
    <Shell
      topbar={<NavAtas aktif={tab} nav={nav} akar={akar} wali={wali} anak={aktif} pengaturan={pengaturan} bukaPengumuman={() => setPengumuman(true)} />}
      tabbar={<TabBar aktif={tab} nav={nav} akar={akar} />}
      fab={<TombolWa anak={aktif} />}
    >
      <div ref={gulir} className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-6 lg:px-8 lg:pb-12">
       <div className="mx-auto w-full lg:max-w-[1120px] 2xl:max-w-[1240px]">
        <Routes>
          <Route index element={<Beranda {...layar} />} />
          <Route path="tagihan" element={<Tagihan {...layar} />} />
          <Route path="riwayat" element={<Riwayat {...layar} />} />
          <Route path="kegiatan" element={<Kegiatan {...layar} />} />
          <Route path="bantuan" element={<Bantuan {...layar} />} />
        </Routes>
       </div>
      </div>
      <SheetStruk id={struk} tutup={() => setStruk(null)} />
      <SheetCaraBayar buka={caraBayar} tutup={() => setCaraBayar(false)} anak={aktif} />
      <SheetPengumuman buka={pengumuman} tutup={() => setPengumuman(false)} anak={aktif} bukaKegiatan={setKegiatan} />
      <SheetKegiatan id={kegiatan} tutup={() => setKegiatan(null)} anak={aktif} bukaCaraBayar={() => setCaraBayar(true)} />
      <Toast pesan={pesan} />
    </Shell>
    </div>
  )
}

/**
 * Menu portal orang tua — dipakai tab bawah (HP) dan navigasi atas (laptop).
 * Tiap menu punya emoji & warnanya sendiri supaya mudah dikenali.
 */
const MENU = [
  { id: 'beranda', label: 'Beranda', e: '🏡', ke: '', latar: 'menu-biru', teks: 'text-brand', garis: 'bg-brand' },
  { id: 'tagihan', label: 'Tagihan', e: '🧾', ke: '/tagihan', latar: 'menu-oranye', teks: 'text-warn-deep', garis: 'bg-warn' },
  { id: 'riwayat', label: 'Riwayat', e: '✅', ke: '/riwayat', latar: 'menu-hijau', teks: 'text-ok-deep', garis: 'bg-ok' },
  { id: 'kegiatan', label: 'Kegiatan', e: '🎈', ke: '/kegiatan', latar: 'menu-ungu', teks: 'text-grape', garis: 'bg-grape' },
  { id: 'bantuan', label: 'Bantuan', e: '💬', ke: '/bantuan', latar: 'menu-pink', teks: 'text-rose', garis: 'bg-rose' },
]

/** Navigasi atas untuk layar lebar; di HP diganti tab bawah. */
function NavAtas({ aktif, nav, akar, wali, anak, pengaturan, bukaPengumuman }) {
  return (
    <header className="hidden shrink-0 items-center gap-5 border-b border-line bg-white px-8 lg:flex">
      <div className="flex min-w-0 shrink items-center gap-3 py-3">
        <LogoSekolah logo={pengaturan?.logo} ukuran={42} />
        <span className="min-w-0 max-w-[230px]">
          <b className="line-clamp-2 text-[15px] font-extrabold leading-tight">{pengaturan?.namaSekolah}</b>
          <span className="text-[11.5px] font-semibold text-muted">Portal Orang Tua</span>
        </span>
      </div>
      <nav className="flex shrink-0 xl:ml-3 xl:gap-1">
        {MENU.map((m) => {
          const on = aktif === m.id
          return (
            <button
              key={m.id}
              onClick={() => nav(akar + m.ke)}
              className={`relative flex items-center gap-1.5 px-2 py-5 text-sm font-bold transition xl:gap-2 xl:px-3 ${on ? m.teks : 'text-muted hover:text-ink'}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-[10px] text-[17px] ${on ? m.latar : ''}`} style={FONT_EMOJI}>{m.e}</span>
              {m.label}
              <span className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full ${on ? m.garis : 'bg-transparent'}`} />
            </button>
          )
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <TombolLonceng anak={anak} buka={bukaPengumuman} />
        <TombolTema />
        <div className="flex items-center gap-2.5 text-right leading-tight">
          <span className="hidden max-w-[190px] xl:block">
            <b className="block truncate text-[13.5px] font-extrabold">{wali?.nama}</b>
            <span className="text-[11.5px] font-semibold text-muted">Wali dari {wali?.anak?.length || 0} siswa</span>
          </span>
        </div>
      </div>
    </header>
  )
}

/**
 * Tombol WhatsApp melayang. Pesannya sudah terisi nama anak dan sisa
 * tagihan, supaya orang tua tidak perlu mengetik ulang.
 */
function TombolWa({ anak }) {
  const { pengaturan, biaya } = useData()
  // Tujuannya nomor WhatsApp SEKOLAH (Profil sekolah), bukan anak.hp —
  // anak.hp adalah nomor HP orang tua itu sendiri.
  const nomor = waSekolah(pengaturan)
  if (!anak || !nomor) return null
  const perluSekarang = sppPerluSekarang(anak, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, bulanBerjalan()) + kegiatanBelum(anak, biaya)
  const teks = encodeURIComponent(
    `Assalamu'alaikum${anak.guru ? ' ' + anak.guru : ''}, saya orang tua ${anak.nama} (Kelas ${anak.kelas}). ` +
      `Saya ingin konfirmasi pembayaran. Tagihan aktif yang tercatat di portal ` +
      `${rp(perluSekarang)}.`
  )
  return (
    <a
      href={`https://wa.me/${nomor}?text=${teks}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Hubungi sekolah lewat WhatsApp"
      className="absolute bottom-[88px] right-4 z-40 flex items-center gap-2.5 rounded-pill bg-ok p-3.5 font-extrabold text-white shadow-[0_10px_24px_rgba(37,211,102,.42)] active:scale-95 lg:bottom-7 lg:right-7 lg:px-5"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" />
        <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
      </svg>
      <span className="hidden text-[13.5px] lg:block">Chat sekolah</span>
    </a>
  )
}

/** Tab bawah (HP): 5 menu dengan emoji berwarna. */
function TabBar({ aktif, nav, akar }) {
  return (
    <nav className="flex shrink-0 items-stretch border-t border-line bg-white px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      {MENU.map((m) => {
        const on = aktif === m.id
        return (
          <button key={m.id} onClick={() => nav(akar + m.ke)} className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-0.5">
            <span
              className={`grid h-9 w-12 place-items-center rounded-2xl text-[21px] transition ${on ? `${m.latar} scale-105` : ''}`}
              style={FONT_EMOJI}
            >
              {m.e}
            </span>
            <span className={`text-[11px] font-bold ${on ? m.teks : 'text-muted'}`}>{m.label}</span>
          </button>
        )
      })}
    </nav>
  )
}