import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { Shell, Toast, Muat } from '../components/ui.jsx'
import { bulanBerjalan, kegiatanBelum, rp, sppPerluSekarang } from '../lib/format.js'
import { useData } from '../lib/store.jsx'
import Beranda from './Beranda.jsx'
import Tagihan from './Tagihan.jsx'
import Riwayat from './Riwayat.jsx'
import Bantuan from './Bantuan.jsx'
import { SheetStruk, SheetCaraBayar, SheetPengumuman } from './sheets.jsx'

/**
 * Portal orang tua — hanya melihat, tidak bisa mengubah data.
 * Di produksi, anak yang tampil ditentukan token pada URL (/ortu/:token).
 */
export default function OrtuApp() {
  const { siap, galat, pesan, siswa, wali, muat, segarkan } = useData()
  const { token } = useParams()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [anakId, setAnakId] = useState(null)
  const [struk, setStruk] = useState(null)
  const [caraBayar, setCaraBayar] = useState(false)
  const [pengumuman, setPengumuman] = useState(false)

  useEffect(() => {
    muat({ mode: 'ortu', token })
  }, [token, muat])

  if (galat) return <Muat aksi={segarkan}>{galat}</Muat>
  if (!siap) return <Muat>Memuat data tagihan…</Muat>

  const anak = siswa.filter((s) => wali.anak.includes(s.id))
  const aktif = anak.find((a) => a.id === anakId) || anak[0]
  if (!aktif) return <Muat>Tautan ini belum terhubung ke data siswa mana pun. Hubungi pihak sekolah.</Muat>
  const tab = pathname.includes('/tagihan') ? 'tagihan'
    : pathname.includes('/riwayat') ? 'riwayat'
    : pathname.includes('/bantuan') ? 'bantuan' : 'beranda'

  const akar = token ? `/ortu/${token}` : '/ortu'
  const layar = { akar, anak, aktif, pilihAnak: setAnakId, bukaStruk: setStruk, bukaCaraBayar: () => setCaraBayar(true), bukaPengumuman: () => setPengumuman(true) }

  return (
    <Shell
      topbar={<NavAtas aktif={tab} nav={nav} akar={akar} wali={wali} />}
      tabbar={<TabBar aktif={tab} nav={nav} akar={akar} />}
      fab={<TombolWa anak={aktif} />}
    >
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-8 lg:px-8 lg:pb-12">
       <div className="mx-auto w-full lg:max-w-[1120px] 2xl:max-w-[1240px]">
        <Routes>
          <Route index element={<Beranda {...layar} />} />
          <Route path="tagihan" element={<Tagihan {...layar} />} />
          <Route path="riwayat" element={<Riwayat {...layar} />} />
          <Route path="bantuan" element={<Bantuan {...layar} />} />
        </Routes>
       </div>
      </div>
      <SheetStruk id={struk} tutup={() => setStruk(null)} />
      <SheetCaraBayar buka={caraBayar} tutup={() => setCaraBayar(false)} anak={aktif} />
      <SheetPengumuman buka={pengumuman} tutup={() => setPengumuman(false)} anak={aktif} />
      <Toast pesan={pesan} />
    </Shell>
  )
}

/** Navigasi atas untuk layar lebar; di HP diganti tab bawah. */
function NavAtas({ aktif, nav, akar, wali }) {
  const item = (id, label, ke) => (
    <button
      onClick={() => nav(ke)}
      className={`border-b-[3px] px-3.5 py-5 text-sm font-bold transition ${
        aktif === id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
  return (
    <header className="hidden shrink-0 items-center gap-5 border-b border-line bg-white px-8 lg:flex">
      <div className="flex items-center gap-3 py-3.5">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-brand-soft text-lg">🏫</span>
        <span>
          <b className="block text-[14.5px] font-extrabold leading-tight">Portal orang tua</b>
          <span className="text-[11.5px] font-semibold text-muted">Pembayaran SPP & kegiatan</span>
        </span>
      </div>
      <nav className="ml-3 flex">
        {item('beranda', 'Beranda', akar)}
        {item('tagihan', 'Tagihan', akar + '/tagihan')}
        {item('riwayat', 'Riwayat', akar + '/riwayat')}
        {item('bantuan', 'Bantuan', akar + '/bantuan')}
      </nav>
      <div className="ml-auto text-right leading-tight">
        <b className="block text-[13.5px] font-extrabold">{wali?.nama}</b>
        <span className="text-[11.5px] font-semibold text-muted">
          Wali dari {wali?.anak?.length || 0} siswa
        </span>
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
  if (!anak) return null
  const nomor = (anak.hp || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
  const perluSekarang = sppPerluSekarang(anak, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, bulanBerjalan()) + kegiatanBelum(anak, biaya)
  const teks = encodeURIComponent(
    `Assalamu'alaikum ${anak.guru}, saya orang tua ${anak.nama} (Kelas ${anak.kelas}). ` +
      `Saya ingin konfirmasi pembayaran. Tagihan aktif yang tercatat di portal ` +
      `${rp(perluSekarang)}.`
  )
  return (
    <a
      href={`https://wa.me/${nomor}?text=${teks}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Hubungi guru kelas lewat WhatsApp"
      className="absolute bottom-[88px] right-4 z-40 flex items-center gap-2.5 rounded-pill bg-ok p-3.5 font-extrabold text-white shadow-[0_10px_24px_rgba(37,211,102,.42)] active:scale-95 lg:bottom-7 lg:right-7 lg:px-5"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" />
        <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
      </svg>
      <span className="hidden text-[13.5px] lg:block">Chat {anak.guru || 'guru kelas'}</span>
    </a>
  )
}

function TabBar({ aktif, nav, akar }) {
  const item = (id, label, emoji, ke) => {
    const on = aktif === id
    return (
      <button onClick={() => nav(ke)} className="flex flex-1 flex-col items-center gap-0.5 py-1">
        <span className={`grid h-8 w-8 place-items-center rounded-full text-[17px] transition ${on ? 'bg-brand-soft' : ''}`}>
          {emoji}
        </span>
        <span className={`text-[10.5px] font-bold ${on ? 'text-brand' : 'text-muted'}`}>{label}</span>
      </button>
    )
  }
  return (
    <nav className="flex shrink-0 items-center border-t border-line bg-white px-1.5 pb-[calc(9px+env(safe-area-inset-bottom))] pt-2 lg:hidden">
      {item('beranda', 'Beranda', '🏠', akar)}
      {item('tagihan', 'Tagihan', '🧾', akar + '/tagihan')}
      {item('riwayat', 'Riwayat', '🕓', akar + '/riwayat')}
      {item('bantuan', 'Bantuan', '💬', akar + '/bantuan')}
    </nav>
  )
}