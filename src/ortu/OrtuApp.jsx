import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Shell, Toast, Muat, TombolTema, KakiRumput, LogoSekolah } from '../components/ui.jsx'
import { AvatarStaf } from '../components/Avatar.jsx'
import { bulanBerjalan, kegiatanBelum, rp, sppPerluSekarang, waSekolah } from '../lib/format.js'
import { useData } from '../lib/store.jsx'
import { dibayarPaket, kurangSekarangPaket, paketSiswa } from '../lib/paket.js'
import Beranda from './Beranda.jsx'
import Tagihan from './Tagihan.jsx'
import Riwayat from './Riwayat.jsx'
import Bantuan from './Bantuan.jsx'
import Kegiatan from './Kegiatan.jsx'
import GerbangNis from './GerbangNis.jsx'
import { SheetStruk, SheetCaraBayar, SheetPengumuman, SheetKegiatan, TombolLonceng } from './sheets.jsx'

const HALAMAN = ['tagihan', 'riwayat', 'kegiatan', 'bantuan']

/* ---------- NIS yang diingat di perangkat ini (per tautan) ---------- */
const kunciNis = (token) => `kasceria-nis:${token || 'demo'}`
const bacaNis = (token) => {
  try {
    return localStorage.getItem(kunciNis(token)) || sessionStorage.getItem(kunciNis(token)) || ''
  } catch {
    return ''
  }
}
const simpanNis = (token, nis, ingat) => {
  try {
    ;(ingat ? localStorage : sessionStorage).setItem(kunciNis(token), nis)
  } catch {
    /* mode privat */
  }
}
const hapusNis = (token) => {
  try {
    localStorage.removeItem(kunciNis(token))
    sessionStorage.removeItem(kunciNis(token))
  } catch {
    /* mode privat */
  }
}

/**
 * Portal orang tua — hanya melihat, tidak bisa mengubah data.
 * Di produksi, anak yang tampil ditentukan token pada URL (/ortu/:token)
 * + NIS salah satu anak yang dimasukkan orang tua (dicek di database).
 */
export default function OrtuApp() {
  const { siap, galat, gerbang, pesan, siswa, wali, pengaturan, muat, segarkan } = useData()
  // /ortu/tagihan (mode demo) juga cocok dengan rute /ortu/:token/* → nama halaman bukan token.
  const { token: t } = useParams()
  const token = HALAMAN.includes(t) ? undefined : t
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [nis, setNis] = useState(() => bacaNis(token))
  const [diketik, setDiketik] = useState(false) // NIS baru diketik di layar gerbang (bukan dari ingatan)
  const [ingat, setIngat] = useState(true)
  const [anakId, setAnakId] = useState(null)
  const [struk, setStruk] = useState(null)
  const [caraBayar, setCaraBayar] = useState(false)
  const [pengumuman, setPengumuman] = useState(false)
  const [kegiatan, setKegiatan] = useState(null) // id biaya kegiatan yang infonya sedang dibuka

  useEffect(() => {
    if (nis) muat({ mode: 'ortu', token, nis })
  }, [token, nis, muat])

  // NIS benar → simpan (kalau diminta diingat). NIS ditolak → lupakan.
  useEffect(() => {
    if (siap && nis && !gerbang && diketik) simpanNis(token, nis, ingat)
    if (gerbang) hapusNis(token)
  }, [siap, gerbang, nis, diketik, ingat, token])

  // Pindah halaman (mis. tombol "Lihat rincian") → selalu mulai dari paling atas.
  const gulir = useRef(null)
  useEffect(() => {
    if (gulir.current) gulir.current.scrollTop = 0
  }, [pathname])

  const masuk = (n, ingatNis) => {
    setIngat(ingatNis)
    setDiketik(true)
    if (n === nis) segarkan()
    else setNis(n)
  }
  const kunciPortal = () => {
    hapusNis(token)
    setNis('')
    setDiketik(false)
  }

  // ---------- gerbang NIS ----------
  const memeriksa = !!nis && !siap && !galat
  if (!nis || gerbang || (diketik && memeriksa)) {
    return (
      <GerbangNis
        token={token}
        galat={gerbang ? galat : ''}
        gerbang={gerbang}
        memeriksa={memeriksa}
        onMasuk={masuk}
        nisAwal={gerbang ? '' : nis}
      />
    )
  }
  if (galat) return <Muat aksi={segarkan}>{galat}</Muat>
  if (!siap) return <Muat>Memuat data tagihan…</Muat>

  const anak = siswa.filter((s) => wali.anak.includes(s.id))
  const aktif = anak.find((a) => a.id === anakId) || anak[0]
  if (!aktif) return <Muat>Tautan ini belum terhubung ke data siswa mana pun. Hubungi pihak sekolah.</Muat>
  const ujung = pathname.replace(/\/+$/, '').split('/').pop()
  const tab = HALAMAN.includes(ujung) ? ujung : 'beranda'

  const akar = token ? `/ortu/${token}` : '/ortu'
  const layar = {
    akar, anak, aktif, pilihAnak: setAnakId, bukaStruk: setStruk, bukaCaraBayar: () => setCaraBayar(true),
    bukaPengumuman: () => setPengumuman(true), bukaKegiatan: setKegiatan, kunciPortal,
  }

  return (
    // .teks-jelas: teks abu-abu dibuat hitam; .panel-ceria: gaya kartu/tombol "permen" (lihat index.css)
    <div className="teks-jelas panel-ceria">
    <Shell
      ceria
      topbar={<NavAtas aktif={tab} nav={nav} akar={akar} wali={wali} anak={aktif} pengaturan={pengaturan} bukaPengumuman={() => setPengumuman(true)} />}
      tabbar={<TabBar aktif={tab} nav={nav} akar={akar} />}
      fab={tab === 'bantuan' ? null : <TombolWa anak={aktif} />}
    >
      <div ref={gulir} className="langit-gulir noscroll flex-1 overflow-y-auto overscroll-contain lg:!bg-transparent lg:!bg-none">
        {/* Isi setinggi layar minimal → rumput selalu menempel di dasar, tanpa padding sisa. */}
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full px-[18px] pt-3.5 lg:max-w-[1248px] lg:px-16 lg:pt-5">
            <BilahAtasHp pengaturan={pengaturan} anak={aktif} bukaPengumuman={() => setPengumuman(true)} />
            {/* Halaman dipilih dari URL (bukan <Routes> bersarang): /ortu/tagihan di mode
                demo juga cocok dengan pola /ortu/:token/*. */}
            {tab === 'tagihan' ? <Tagihan {...layar} />
              : tab === 'riwayat' ? <Riwayat {...layar} />
              : tab === 'kegiatan' ? <Kegiatan {...layar} />
              : tab === 'bantuan' ? <Bantuan {...layar} />
              : <Beranda {...layar} />}
          </div>
          <KakiRumput className="mt-auto" />
        </div>
      </div>
      <SheetStruk id={struk} tutup={() => setStruk(null)} nis={nis} token={token} />
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
 * Tiap menu punya ikon & warna permennya sendiri supaya mudah dikenali.
 */
const JALUR = {
  rumah: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  nota: <><path d="M6 3h8l4 4v14l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 10h6M9 14h4" /></>,
  riwayat: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5V9h4.5" /><path d="M12 8v4.5l3 2" /></>,
  kalender: <><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  tanya: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.7" /><path d="M12 16.8h.01" strokeWidth="2.8" /></>,
}
const MENU = [
  { id: 'beranda', label: 'Beranda', ikon: 'rumah', warna: 'biru', ke: '' },
  { id: 'tagihan', label: 'Tagihan', ikon: 'nota', warna: 'pink', ke: '/tagihan' },
  { id: 'riwayat', label: 'Riwayat', ikon: 'riwayat', warna: 'tosca', ke: '/riwayat' },
  { id: 'kegiatan', label: 'Kegiatan', ikon: 'kalender', warna: 'kuning', ke: '/kegiatan' },
  { id: 'bantuan', label: 'Bantuan', ikon: 'tanya', warna: 'ungu', ke: '/bantuan' },
]
const IkonMenu = ({ nama, size = 20, sw = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {JALUR[nama]}
  </svg>
)

/** Avatar ilustrasi orang tua (Ibu → berhijab, Bapak → berjanggut) dari sapaan namanya. */
export function AvatarWali({ nama = '', size = 40 }) {
  const n = nama.toLowerCase()
  const i = /^(bapak|pak|ayah|abi|bpk)\b/.test(n) ? 8 : /^(ibu|bu|bunda|umi|ummi|mama)\b/.test(n) ? 1 : 4
  return <AvatarStaf nama={nama} avatar={i} size={size} />
}

/** Bilah atas di HP: logo + nama sekolah + lonceng pemberitahuan. */
function BilahAtasHp({ pengaturan, anak, bukaPengumuman }) {
  return (
    <header className="relative z-[3] mb-1.5 flex items-center gap-2.5 lg:hidden">
      <LogoSekolah logo={pengaturan.logo} ukuran={42} className="shadow-[inset_0_-3px_0_#E3E9F4,0_4px_12px_rgba(27,37,89,.08)]" />
      <span className="min-w-0 flex-1">
        <b className="judul-halaman line-clamp-1 block text-[15px] font-extrabold leading-tight">{pengaturan.namaSekolah}</b>
        <span className="sub-halaman block text-[12px] font-bold">Portal Orang Tua</span>
      </span>
      <TombolLonceng anak={anak} buka={bukaPengumuman} />
    </header>
  )
}

/** Navigasi atas untuk layar lebar (kartu putih melayang); di HP diganti tab bawah. */
function NavAtas({ aktif, nav, akar, wali, anak, pengaturan, bukaPengumuman }) {
  return (
    <div className="hidden shrink-0 px-6 pt-4 lg:block">
      <header className="sidebar-ceria mx-auto flex h-[68px] max-w-[1392px] items-center gap-5 rounded-[24px] bg-kartu px-4">
        <div className="flex min-w-0 shrink items-center gap-2.5">
          <LogoSekolah logo={pengaturan?.logo} ukuran={44} className="kartu-sekolah-sidebar" />
          <span className="min-w-0 max-w-[210px]">
            <b className="line-clamp-1 text-[14.5px] font-extrabold leading-tight">{pengaturan?.namaSekolah}</b>
            <span className="text-[11.5px] font-bold text-muted">Portal Orang Tua</span>
          </span>
        </div>
        <nav className="flex min-w-0 flex-1 gap-1.5">
          {MENU.map((m) => {
            const on = aktif === m.id
            return (
              <button
                key={m.id}
                onClick={() => nav(akar + m.ke)}
                aria-current={on ? 'page' : undefined}
                className={`flex h-10 items-center gap-2 rounded-[14px] px-3.5 text-[14px] font-extrabold transition xl:px-4 ${
                  on ? `permen permen-kecil permen-${m.warna}` : 'text-ink hover:bg-isi'
                }`}
              >
                <IkonMenu nama={m.ikon} size={18} sw={2.3} />
                {m.label}
              </button>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <TombolLonceng anak={anak} buka={bukaPengumuman} putih />
          <TombolTema />
          <div className="flex items-center gap-2.5 leading-tight">
            <AvatarWali nama={wali?.nama} size={40} />
            <span className="hidden max-w-[170px] xl:block">
              <b className="block truncate text-[13.5px] font-extrabold">{wali?.nama}</b>
              <span className="text-[11.5px] font-bold text-muted">Wali dari {wali?.anak?.length || 0} siswa</span>
            </span>
          </div>
        </div>
      </header>
    </div>
  )
}

/**
 * Tombol WhatsApp melayang (permen hijau). Pesannya sudah terisi nama anak
 * dan sisa tagihan, supaya orang tua tidak perlu mengetik ulang.
 */
function TombolWa({ anak }) {
  const { pengaturan, biaya, paket } = useData()
  // Tujuannya nomor WhatsApp SEKOLAH (Profil sekolah), bukan anak.hp —
  // anak.hp adalah nomor HP orang tua itu sendiri.
  const nomor = waSekolah(pengaturan)
  if (!anak || !nomor) return null
  const perluSekarang = sppPerluSekarang(anak, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, bulanBerjalan()) + kegiatanBelum(anak, biaya)
    + paketSiswa(paket, anak.id).reduce((t, p) => t + kurangSekarangPaket(p, dibayarPaket(anak, p.id)), 0)
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
      className="absolute bottom-[92px] right-4 z-40 flex h-14 min-w-14 items-center justify-center gap-2 rounded-[20px] bg-ok px-4 font-extrabold text-white shadow-[inset_0_-4px_0_#169A48,0_10px_20px_rgba(34,197,94,.35)] active:translate-y-px lg:bottom-7 lg:right-7 lg:h-[54px] lg:rounded-[18px] lg:px-5"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" />
        <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
      </svg>
      <span className="hidden text-[14px] lg:block">Chat sekolah</span>
    </a>
  )
}

/** Tab bawah (HP): 5 menu; tab aktif jadi ubin permen berwarna. */
function TabBar({ aktif, nav, akar }) {
  return (
    <nav className="bilah-tab relative z-10 -mt-5 flex shrink-0 items-stretch rounded-t-[22px] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 lg:hidden">
      {MENU.map((m) => {
        const on = aktif === m.id
        return (
          <button key={m.id} onClick={() => nav(akar + m.ke)} aria-current={on ? 'page' : undefined} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] py-0.5">
            <span className={`grid h-8 w-[46px] place-items-center rounded-xl transition ${on ? `permen permen-kecil permen-${m.warna}` : 'text-[#7C8AA5] dark:text-muted'}`}>
              <IkonMenu nama={m.ikon} size={on ? 20 : 21} sw={on ? 2.3 : 2.1} />
            </span>
            <span className={`text-[11px] ${on ? 'font-extrabold text-[#1B2559] dark:text-ink' : 'font-bold text-[#6B7385] dark:text-muted'}`}>{m.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
