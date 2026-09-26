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
import Langganan from './Langganan.jsx'
import TanyaAI from './TanyaAI.jsx'
import SpandukLangganan from '../components/SpandukLangganan.jsx'
import { hitungLangganan, pesanKunci } from '../lib/langganan.js'

export default function GuruApp() {
  const { siap, galat, peran, pesan, muat, segarkan, pengaturan, toast } = useData()
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

  // Masa aktif habis → aplikasi TETAP bisa dibuka & semua data tetap bisa
  // dilihat. Yang dikunci hanya AKSI menambah siswa baru & mencatat
  // pembayaran baru (spanduk menetap menjelaskannya, lihat SpandukLangganan).
  // Penguncian sebenarnya ditegakkan di database lewat trigger (0013) —
  // ini hanya lapisan tampilan supaya tombolnya tidak menipu/aktif percuma.
  const langganan = hitungLangganan(pengaturan)
  const terkunci = langganan.status === 'kadaluarsa'

  const bukaCatat = (siswaId) => {
    if (terkunci) return toast(pesanKunci(pengaturan, 'bayar'))
    setCatat(siswaId ? { siswaId } : {})
  }
  const bukaTambahSiswa = () => {
    if (terkunci) return toast(pesanKunci(pengaturan, 'siswa'))
    setFormSiswa({})
  }

  const kepala = peran === 'kepala'
  const bisaUndang = kepala || peran === 'admin'
  const bisaAI = kepala || peran === 'admin' // Tanya AI: kepala sekolah & admin sekolah

  // admin sekolah tidak punya tab Tanya AI (masuk lewat Lainnya)
  const tabAktif = pathname.includes('/tanya-ai') ? (kepala ? 'ai' : 'lainnya')
    : pathname.includes('/siswa') ? 'siswa'
    : pathname.includes('/tagihan') ? 'tagihan'
    : pathname.includes('/pembayaran') ? 'pembayaran'
    : pathname.includes('/laporan') ? 'laporan'
    : pathname.includes('/lainnya') ? 'lainnya'
    : pathname.includes('/kode-aktivasi') ? 'lainnya'
    : pathname.includes('/biaya') ? 'lainnya'
    : pathname.includes('/profil') ? 'lainnya'
    : pathname.includes('/langganan') ? 'lainnya'
    : 'beranda'

  // Sidebar desktop menampilkan semua menu, jadi butuh penanda halaman
  // yang lebih rinci daripada tab bar mobile (yang merangkum ke "Lainnya").
  const halaman = ['kode-aktivasi', 'biaya', 'profil-sekolah', 'profil-akun', 'langganan']
    .find((h) => pathname.includes('/' + h)) || (pathname.includes('/tanya-ai') ? 'ai' : tabAktif)

  // Tanya AI punya tata letak sendiri (kolom ketik menempel di bawah),
  // jadi tidak dibungkus area gulir biasa. Kepala sekolah & admin sekolah.
  const halamanAI = bisaAI && /\/tanya-ai\/?$/.test(pathname)

  return (
    // .teks-jelas: teks keterangan abu-abu dibuat hitam (lihat src/index.css)
    <div className="teks-jelas">
    <Shell
      sidebar={<SisiKiri aktif={halaman} nav={nav} buka={() => bukaCatat()} terkunci={terkunci} kepala={kepala} bisaUndang={bisaUndang} bisaAI={bisaAI} />}
      tabbar={<TabBar aktif={tabAktif} nav={nav} buka={() => bukaCatat()} kepala={kepala} terkunci={terkunci} />}
    >
      {halamanAI ? <TanyaAI /> : (
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-6 lg:px-8 lg:pb-10">
       <div className="mx-auto w-full lg:max-w-[1180px] 2xl:max-w-[1320px]">
        <SpandukLangganan pengaturan={pengaturan} />
        <Routes>
          <Route index element={<Beranda onCatat={(siswaId) => bukaCatat(siswaId)} />} />
          <Route path="siswa" element={<DaftarSiswa onTambah={bukaTambahSiswa} onUbah={(siswaId) => setFormSiswa({ siswaId })} terkunci={terkunci} />} />
          <Route
            path="siswa/:id"
            element={
              <DetailSiswa
                onCatat={(siswaId) => bukaCatat(siswaId)}
                onUbah={(siswaId) => setFormSiswa({ siswaId })}
              />
            }
          />
          <Route path="laporan" element={<Laporan />} />
          <Route path="lainnya" element={<Lainnya />} />
          <Route path="profil-akun" element={<ProfilAkun />} />
          <Route path="langganan" element={<Langganan />} />

          {/* Rute operasional — dikunci untuk kepala sekolah, bukan cuma disembunyikan
              di menu. Kalau kepala mengetik URL-nya langsung, dilempar balik ke beranda. */}
          {!kepala && <Route path="tagihan" element={<Tagihan />} />}
          {!kepala && <Route path="pembayaran" element={<RiwayatBayar />} />}
          {!kepala && <Route path="biaya" element={<JenisBiaya />} />}

          {/* Rute administratif — kode aktivasi untuk kepala & admin, profil sekolah khusus kepala */}
          {bisaUndang && <Route path="kode-aktivasi" element={<KodeAktivasi />} />}
          {kepala && <Route path="profil-sekolah" element={<ProfilSekolah />} />}

          <Route path="*" element={<Navigate to="/guru" replace />} />
        </Routes>
       </div>
      </div>
      )}
      {!kepala && <SheetCatat buka={!!catat} awal={catat} tutup={() => setCatat(null)} />}
      {!kepala && (
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
function SisiKiri({ aktif, nav, buka, terkunci, kepala, bisaUndang, bisaAI }) {
  const { pengaturan, petugas, avatarSaya, modeDemo } = useData()
  const { keluar } = useAuth()
  return (
    <Sidebar>
      <SidebarBrand nama={pengaturan.namaSekolah} sub={pengaturan.alamat || (kepala ? 'Lengkapi alamat di Profil sekolah' : 'Panel sekolah')} />

      <NavLabel>Menu</NavLabel>
      <NavItem aktif={aktif === 'beranda'} onClick={() => nav('/guru')} emoji="beranda">Beranda</NavItem>
      <NavItem aktif={aktif === 'siswa'} onClick={() => nav('/guru/siswa')} emoji="siswa">Siswa</NavItem>
      {!kepala && (
        <NavItem aktif={aktif === 'tagihan'} onClick={() => nav('/guru/tagihan')} emoji="tagihan">
          Tagihan
        </NavItem>
      )}
      {!kepala && (
        <NavItem aktif={aktif === 'pembayaran'} onClick={() => nav('/guru/pembayaran')} emoji="pembayaran">
          Pembayaran
        </NavItem>
      )}
      <NavItem aktif={aktif === 'laporan'} onClick={() => nav('/guru/laporan')} emoji="laporan">Laporan</NavItem>
      {bisaAI && (
        <NavItem aktif={aktif === 'ai'} onClick={() => nav('/guru/tanya-ai')} emoji="ai">
          Tanya AI
        </NavItem>
      )}

      <NavLabel>{kepala ? 'Sekolah' : 'Pengaturan'}</NavLabel>
      {!kepala && (
        <NavItem aktif={aktif === 'biaya'} onClick={() => nav('/guru/biaya')} emoji="biaya">
          Jenis biaya
        </NavItem>
      )}
      {bisaUndang && (
        <NavItem aktif={aktif === 'kode-aktivasi'} onClick={() => nav('/guru/kode-aktivasi')} emoji="kode">
          Kode aktivasi
        </NavItem>
      )}
      {kepala && (
        <NavItem aktif={aktif === 'profil-sekolah'} onClick={() => nav('/guru/profil-sekolah')} emoji="sekolah">
          Profil sekolah
        </NavItem>
      )}
      {bisaUndang && (
        <NavItem aktif={aktif === 'langganan'} onClick={() => nav('/guru/langganan')} emoji="langganan">
          Langganan
        </NavItem>
      )}
      <NavItem aktif={aktif === 'profil-akun'} onClick={() => nav('/guru/profil-akun')} emoji="akun">
        Profil akun
      </NavItem>

      {!kepala && (
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

      <div className="mt-auto flex items-center gap-3 border-t border-line px-2 pt-3">
        <button onClick={() => nav('/guru/profil-akun')} title="Profil akun" className="rounded-full">
          <AvatarStaf nama={petugas} avatar={avatarSaya} size={38} />
        </button>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-extrabold">{petugas || 'Guru'}</b>
          <span className="text-[11.5px] font-semibold text-muted">{kepala ? 'Kepala sekolah' : modeDemo ? 'Mode demo' : 'Staf sekolah'}</span>
        </span>
        <TombolTema />
        {!modeDemo && (
          <button className="rounded-lg px-2 py-1.5 text-[11.5px] font-bold text-danger" onClick={keluar}>
            Keluar
          </button>
        )}
      </div>
    </Sidebar>
  )
}

/**
 * Bottom nav mobile — baris rata sederhana, TIDAK ADA elemen melayang
 * atau absolute-positioned sama sekali (sengaja, supaya tidak pernah
 * muncul artefak tombol "nyangkut" di tengah nav seperti yang pernah
 * terjadi). "Catat pembayaran" untuk guru/admin jadi salah satu item
 * biasa, sejajar dengan tab lain.
 */
function TabBar({ aktif, nav, buka, kepala, terkunci }) {
  return (
    <nav className="flex shrink-0 items-stretch border-t border-line bg-white px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      <TabEmoji id="beranda" label="Beranda" aktif={aktif === 'beranda'} onClick={() => nav('/guru')} />
      <TabEmoji id="siswa" label="Siswa" aktif={aktif === 'siswa'} onClick={() => nav('/guru/siswa')} />
      {!kepala && <TabEmoji id="bayar" label="Bayar" onClick={buka} redup={terkunci} />}
      {kepala && <TabEmoji id="laporan" label="Laporan" aktif={aktif === 'laporan'} onClick={() => nav('/guru/laporan')} />}
      {kepala
        ? <TabEmoji id="ai" label="Tanya AI" aktif={aktif === 'ai'} onClick={() => nav('/guru/tanya-ai')} />
        : <TabEmoji id="pembayaran" label="Riwayat" aktif={aktif === 'pembayaran'} onClick={() => nav('/guru/pembayaran')} />}
      <TabEmoji id="lainnya" label="Lainnya" aktif={aktif === 'lainnya'} onClick={() => nav('/guru/lainnya')} />
    </nav>
  )
}
