import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Shell, Toast, Ikon, Muat, Sidebar, SidebarBrand, NavLabel, NavItem, TabEmoji, TombolTema } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { AvatarStaf } from '../components/Avatar.jsx'
import { useAuth } from '../lib/auth.jsx'
import Masuk from '../components/Masuk.jsx'
import DaftarPeran from '../components/DaftarPeran.jsx'
import Onboarding from './Onboarding.jsx'
import Beranda from './Beranda.jsx'
import DaftarSiswa from './DaftarSiswa.jsx'
import DetailSiswa from './DetailSiswa.jsx'
import Tagihan from './Tagihan.jsx'
import RiwayatBayar from './RiwayatBayar.jsx'
import Laporan from './Laporan.jsx'
import JenisBiaya from './JenisBiaya.jsx'
import SheetCatat from './SheetCatat.jsx'
import SheetSiswa from './SheetSiswa.jsx'
import KodeAktivasi from './KodeAktivasi.jsx'
import Lainnya from './Lainnya.jsx'
import ProfilAkun from './ProfilAkun.jsx'
import ProfilSekolah from './ProfilSekolah.jsx'
import Langganan from './langganan.jsx'
import TanyaAI from './TanyaAI.jsx'
import Kas from './Kas.jsx'
import SpandukLangganan from '../components/Spanduklangganan.jsx'
import { labelPeran, menuSekolah, pilihTab } from '../lib/akses.js'

export default function GuruApp() {
  const { siap, galat, peran, pesan, muat, segarkan, pengaturan, boleh, terkunci, cegahKunci } = useData()
  const { sesi, siap: authSiap } = useAuth()
  const [catat, setCatat] = useState(null)   // { siswaId } | null
  const [formSiswa, setFormSiswa] = useState(null) // { siswaId } | null
  const [layarMasuk, setLayarMasuk] = useState('masuk') // 'masuk' | 'daftar' — sebelum ada sesi
  const nav = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (sesi) muat({ mode: 'guru' })
  }, [sesi, muat])

  if (!authSiap) return <Muat>Menyiapkan sesi…</Muat>
  if (!sesi) {
    return layarMasuk === 'daftar'
      ? <DaftarPeran kembali={() => setLayarMasuk('masuk')} />
      : <Masuk onDaftar={() => setLayarMasuk('daftar')} />
  }
  if (galat?.includes('belum terhubung ke sekolah')) return <Onboarding onSelesai={segarkan} />
  if (galat) return <Muat aksi={segarkan}>Gagal memuat data: {galat}</Muat>
  if (!siap) return <Muat>Memuat data sekolah…</Muat>

  // Masa sewa habis → aplikasi TETAP bisa dibuka & semua data tetap bisa
  // dilihat. Yang dikunci semua TRANSAKSI: catat pembayaran, tambah siswa,
  // catat kas, saldo awal, dan pembatalan (spanduk menetap menjelaskannya).
  // Penguncian sebenarnya ditegakkan di database (0013 & 0029) — ini hanya
  // lapisan tampilan supaya tombolnya tidak aktif percuma.
  const bukaCatat = (siswaId) => {
    if (cegahKunci('bayar')) return
    setCatat(siswaId ? { siswaId } : {})
  }
  const bukaTambahSiswa = () => {
    if (cegahKunci('siswa')) return
    setFormSiswa({})
  }

  // Menu mengikuti hak akses akun (diatur admin aplikasi per sekolah).
  const menu = menuSekolah(boleh)
  const ada = (id) => menu.some((m) => m.id === id)
  const bisaCatat = boleh('pembayaran')
  const tab = pilihTab(menu, bisaCatat)

  const halaman = pathname.includes('/tanya-ai') ? 'ai'
    : (menu.find((m) => m.id !== 'beranda' && pathname.startsWith(m.ke)) || {}).id
      || (pathname.includes('/lainnya') ? 'lainnya' : pathname.includes('/profil-akun') ? 'profil-akun' : 'beranda')
  // Tab bar mobile merangkum halaman yang tidak punya tab ke "Lainnya".
  const tabAktif = tab.some((t) => t.id === halaman) ? halaman : halaman === 'beranda' ? 'beranda' : 'lainnya'

  // SAKU (asisten AI) punya tata letak sendiri (kolom ketik menempel di bawah),
  // jadi tidak dibungkus area gulir biasa.
  const halamanAI = ada('ai') && /\/tanya-ai\/?$/.test(pathname)

  return (
    // .teks-jelas: teks keterangan abu-abu dibuat hitam (lihat src/index.css)
    <div className="teks-jelas">
    <Shell
      sidebar={<SisiKiri aktif={halaman} nav={nav} menu={menu} buka={() => bukaCatat()} terkunci={terkunci} bisaCatat={bisaCatat} peran={peran} />}
      tabbar={<TabBar tab={tab} aktif={tabAktif} nav={nav} buka={() => bukaCatat()} terkunci={terkunci} />}
    >
      {halamanAI ? <TanyaAI /> : (
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-6 lg:px-8 lg:pb-10">
       <div className="mx-auto w-full lg:max-w-[1180px] 2xl:max-w-[1320px]">
        <SpandukLangganan pengaturan={pengaturan} />
        <Routes>
          <Route index element={<Beranda onCatat={(siswaId) => bukaCatat(siswaId)} />} />
          <Route path="lainnya" element={<Lainnya />} />
          <Route path="profil-akun" element={<ProfilAkun />} />

          {/* Rute dikunci sesuai hak akses — bukan cuma disembunyikan di menu.
              Kalau URL-nya diketik langsung, dilempar balik ke beranda. */}
          {ada('siswa') && (
            <Route path="siswa" element={<DaftarSiswa onTambah={bukaTambahSiswa} onUbah={(siswaId) => setFormSiswa({ siswaId })} terkunci={terkunci} />} />
          )}
          {ada('siswa') && (
            <Route
              path="siswa/:id"
              element={<DetailSiswa onCatat={(siswaId) => bukaCatat(siswaId)} onUbah={(siswaId) => setFormSiswa({ siswaId })} />}
            />
          )}
          {ada('tagihan') && <Route path="tagihan" element={<Tagihan />} />}
          {ada('pembayaran') && <Route path="pembayaran" element={<RiwayatBayar />} />}
          {ada('laporan') && <Route path="laporan" element={<Laporan />} />}
          {ada('kas') && <Route path="kas" element={<Kas />} />}
          {ada('biaya') && <Route path="biaya" element={<JenisBiaya />} />}
          {ada('kode-aktivasi') && <Route path="kode-aktivasi" element={<KodeAktivasi />} />}
          {ada('profil-sekolah') && <Route path="profil-sekolah" element={<ProfilSekolah />} />}
          {ada('langganan') && <Route path="langganan" element={<Langganan />} />}

          <Route path="*" element={<Navigate to="/guru" replace />} />
        </Routes>
       </div>
      </div>
      )}
      {bisaCatat && <SheetCatat buka={!!catat} awal={catat} tutup={() => setCatat(null)} />}
      {boleh('siswa') && (
        <SheetSiswa
          buka={!!formSiswa}
          siswaId={formSiswa?.siswaId ?? null}
          tutup={() => setFormSiswa(null)}
          onSimpan={(aksi) => aksi === 'hapus' && nav('/guru/siswa')}
        />
      )}
      <Toast pesan={pesan} />
    </Shell>
    </div>
  )
}

/** Navigasi kiri, hanya tampil mulai lebar 1024px. */
function SisiKiri({ aktif, nav, menu, buka, terkunci, bisaCatat, peran }) {
  const { pengaturan, petugas, avatarSaya, modeDemo, boleh } = useData()
  const { keluar } = useAuth()
  const utama = menu.filter((m) => m.grup === 'menu')
  const atur = menu.filter((m) => m.grup === 'atur')
  return (
    <Sidebar>
      <SidebarBrand logo={pengaturan.logo} nama={pengaturan.namaSekolah} sub={pengaturan.alamat || (boleh('sekolah') ? 'Lengkapi alamat di Profil sekolah' : 'Panel sekolah')} />

      <NavLabel>Menu</NavLabel>
      {utama.map((m) => (
        <NavItem key={m.id} aktif={aktif === m.id} onClick={() => nav(m.ke)} emoji={m.emoji}>{m.label}</NavItem>
      ))}

      <NavLabel>{atur.length ? 'Pengaturan' : 'Akun'}</NavLabel>
      {atur.map((m) => (
        <NavItem key={m.id} aktif={aktif === m.id} onClick={() => nav(m.ke)} emoji={m.emoji}>{m.label}</NavItem>
      ))}
      <NavItem aktif={aktif === 'profil-akun'} onClick={() => nav('/guru/profil-akun')} emoji="akun">
        Profil akun
      </NavItem>

      {bisaCatat && (
        <button
          onClick={buka}
          title={terkunci ? 'Terkunci sampai langganan diperpanjang' : undefined}
          className={`mt-3 flex items-center justify-center gap-2 rounded-[14px] py-3 text-[13.5px] font-extrabold active:scale-[.98] ${
            terkunci ? 'bg-[#F1F4F9] text-muted' : 'bg-brand text-white'
          }`}
        >
          {terkunci ? <Ikon.jam size={18} /> : <Ikon.plus size={18} />}
          Catat pembayaran
        </button>
      )}

      <div className="mt-auto border-t border-line px-1 pt-3">
        <button onClick={() => nav('/guru/profil-akun')} title="Profil akun" className="flex w-full items-center gap-2.5 rounded-xl p-1 text-left hover:bg-isi">
          <AvatarStaf nama={petugas} avatar={avatarSaya} size={38} />
          <span className="min-w-0 flex-1">
            <b className="block break-words text-[13.5px] font-extrabold leading-tight">{petugas || 'Staf sekolah'}</b>
            <span className="text-[11.5px] font-semibold text-muted">{labelPeran(peran)}{modeDemo ? ' · demo' : ''}</span>
          </span>
        </button>
        <div className="mt-2 flex items-center gap-2 px-1">
          <TombolTema />
          {!modeDemo && (
            <button className="h-9 flex-1 rounded-xl bg-danger-soft text-[12.5px] font-bold text-danger" onClick={keluar}>
              Keluar
            </button>
          )}
        </div>
      </div>
    </Sidebar>
  )
}

/**
 * Bottom nav mobile — baris rata sederhana, TIDAK ADA elemen melayang
 * atau absolute-positioned sama sekali (sengaja, supaya tidak pernah
 * muncul artefak tombol "nyangkut" di tengah nav seperti yang pernah
 * terjadi). "Bayar" jadi salah satu item biasa, sejajar dengan tab lain.
 */
function TabBar({ tab, aktif, nav, buka, terkunci }) {
  return (
    <nav className="flex shrink-0 items-stretch border-t border-line bg-white px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      {tab.map((t) => (
        t.catat
          ? <TabEmoji key={t.id} id={t.emoji} label={t.label} onClick={buka} redup={terkunci} />
          : <TabEmoji key={t.id} id={t.emoji} label={t.label} aktif={aktif === t.id} onClick={() => nav(t.ke)} />
      ))}
      <TabEmoji id="lainnya" label="Lainnya" aktif={aktif === 'lainnya'} onClick={() => nav('/guru/lainnya')} />
    </nav>
  )
}
