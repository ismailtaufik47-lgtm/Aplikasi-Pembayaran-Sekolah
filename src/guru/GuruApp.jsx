import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Shell, Toast, Ikon, Muat, Sidebar, SidebarBrand, NavLabel, NavItem } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import Masuk from '../components/Masuk.jsx'
import Onboarding from './Onboarding.jsx'
import Beranda from './Beranda.jsx'
import DaftarSiswa from './DaftarSiswa.jsx'
import DetailSiswa from './DetailSiswa.jsx'
import RiwayatBayar from './RiwayatBayar.jsx'
import Laporan from './Laporan.jsx'
import JenisBiaya from './JenisBiaya.jsx'
import SheetCatat from './SheetCatat.jsx'
import SheetSiswa from './SheetSiswa.jsx'
import KodeAktivasi from './KodeAktivasi.jsx'
import Lainnya from './Lainnya.jsx'
import ProfilAkun from './ProfilAkun.jsx'
import ProfilSekolah from './ProfilSekolah.jsx'

export default function GuruApp() {
  const { siap, galat, peran, pesan, muat, segarkan } = useData()
  const { sesi, siap: authSiap } = useAuth()
  const [catat, setCatat] = useState(null)   // { siswaId } | null
  const [formSiswa, setFormSiswa] = useState(null) // { siswaId } | null
  const nav = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (sesi) muat({ mode: 'guru' })
  }, [sesi, muat])

  if (!authSiap) return <Muat>Menyiapkan sesi…</Muat>
  if (!sesi) return <Masuk />
  if (galat?.includes('belum terhubung ke sekolah')) return <Onboarding onSelesai={segarkan} />
  if (galat) return <Muat aksi={segarkan}>Gagal memuat data: {galat}</Muat>
  if (!siap) return <Muat>Memuat data sekolah…</Muat>

  const kepala = peran === 'kepala'
  const bisaUndang = kepala || peran === 'admin'

  const tabAktif = pathname.includes('/siswa') ? 'siswa'
    : pathname.includes('/pembayaran') ? 'pembayaran'
    : pathname.includes('/laporan') ? 'laporan'
    : pathname.includes('/lainnya') ? 'lainnya'
    : pathname.includes('/kode-aktivasi') ? 'lainnya'
    : pathname.includes('/biaya') ? 'lainnya'
    : pathname.includes('/profil') ? 'lainnya'
    : 'beranda'

  return (
    <Shell
      sidebar={<SisiKiri aktif={tabAktif} nav={nav} buka={() => setCatat({})} kepala={kepala} bisaUndang={bisaUndang} />}
      tabbar={<TabBar aktif={tabAktif} nav={nav} buka={() => setCatat({})} kepala={kepala} />}
    >
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-32 lg:px-8 lg:pb-10">
       <div className="mx-auto w-full lg:max-w-[1180px] 2xl:max-w-[1320px]">
        <Routes>
          <Route index element={<Beranda onCatat={(siswaId) => setCatat({ siswaId })} />} />
          <Route path="siswa" element={<DaftarSiswa onTambah={() => setFormSiswa({})} onUbah={(siswaId) => setFormSiswa({ siswaId })} />} />
          <Route
            path="siswa/:id"
            element={
              <DetailSiswa
                onCatat={(siswaId) => setCatat({ siswaId })}
                onUbah={(siswaId) => setFormSiswa({ siswaId })}
              />
            }
          />
          <Route path="laporan" element={<Laporan />} />
          <Route path="lainnya" element={<Lainnya />} />
          <Route path="profil-akun" element={<ProfilAkun />} />

          {/* Rute operasional — dikunci untuk kepala sekolah, bukan cuma disembunyikan
              di menu. Kalau kepala mengetik URL-nya langsung, dilempar balik ke beranda. */}
          {!kepala && <Route path="pembayaran" element={<RiwayatBayar />} />}
          {!kepala && <Route path="biaya" element={<JenisBiaya />} />}

          {/* Rute administratif — kode aktivasi untuk kepala & admin, profil sekolah khusus kepala */}
          {bisaUndang && <Route path="kode-aktivasi" element={<KodeAktivasi />} />}
          {kepala && <Route path="profil-sekolah" element={<ProfilSekolah />} />}

          <Route path="*" element={<Navigate to="/guru" replace />} />
        </Routes>
       </div>
      </div>
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
  )
}

/** Navigasi kiri, hanya tampil mulai lebar 1024px. */
function SisiKiri({ aktif, nav, buka, kepala, bisaUndang }) {
  const { pengaturan, petugas, modeDemo } = useData()
  const { keluar } = useAuth()
  return (
    <Sidebar>
      <SidebarBrand nama={pengaturan.namaSekolah} sub={`Tahun ajaran ${pengaturan.tahunAjaran}`} />

      <NavLabel>Menu</NavLabel>
      <NavItem aktif={aktif === 'beranda'} onClick={() => nav('/guru')} ikon={Ikon.rumah}>Beranda</NavItem>
      <NavItem aktif={aktif === 'siswa'} onClick={() => nav('/guru/siswa')} ikon={Ikon.siswa}>Siswa</NavItem>
      {!kepala && (
        <NavItem aktif={aktif === 'pembayaran'} onClick={() => nav('/guru/pembayaran')} ikon={Ikon.dompet}>
          Pembayaran
        </NavItem>
      )}
      <NavItem aktif={aktif === 'laporan'} onClick={() => nav('/guru/laporan')} ikon={Ikon.grafik}>Laporan</NavItem>

      <NavLabel>{kepala ? 'Sekolah' : 'Pengaturan'}</NavLabel>
      {!kepala && (
        <NavItem aktif={aktif === 'biaya'} onClick={() => nav('/guru/biaya')} ikon={Ikon.dokumen}>
          Jenis biaya
        </NavItem>
      )}
      {bisaUndang && (
        <NavItem aktif={aktif === 'kode-aktivasi'} onClick={() => nav('/guru/kode-aktivasi')} ikon={Ikon.info}>
          Kode aktivasi
        </NavItem>
      )}
      {kepala && (
        <NavItem aktif={aktif === 'profil-sekolah'} onClick={() => nav('/guru/profil-sekolah')} ikon={Ikon.rumah}>
          Profil sekolah
        </NavItem>
      )}
      <NavItem aktif={aktif === 'profil-akun'} onClick={() => nav('/guru/profil-akun')} ikon={Ikon.orang}>
        Profil akun
      </NavItem>

      {!kepala && (
        <button
          onClick={buka}
          className="mt-3 flex items-center justify-center gap-2 rounded-[14px] bg-brand py-3 text-[13.5px] font-extrabold text-white shadow-brand active:scale-[.98]"
        >
          <Ikon.plus size={18} />
          Catat pembayaran
        </button>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-line px-2 pt-3">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-rose-soft text-[13px] font-extrabold text-rose">
          {(petugas || 'G')[0]}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-extrabold">{petugas || 'Guru'}</b>
          <span className="text-[11.5px] font-semibold text-muted">{kepala ? 'Kepala sekolah' : modeDemo ? 'Mode demo' : 'Staf sekolah'}</span>
        </span>
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
function TabBar({ aktif, nav, buka, kepala }) {
  const item = (id, label, Icon, onClick) => {
    const on = aktif === id
    return (
      <button onClick={onClick} className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5">
        <span className={`grid h-8 w-8 place-items-center rounded-full transition ${on ? 'bg-brand-soft text-brand' : 'text-muted'}`}>
          <Icon size={19} />
        </span>
        <span className={`text-[10.5px] font-bold ${on ? 'text-brand' : 'text-muted'}`}>{label}</span>
      </button>
    )
  }
  return (
    <nav className="flex shrink-0 items-stretch border-t border-line bg-white px-1 pb-[calc(9px+env(safe-area-inset-bottom))] pt-2 lg:hidden">
      {item('beranda', 'Beranda', Ikon.rumah, () => nav('/guru'))}
      {item('siswa', 'Siswa', Ikon.siswa, () => nav('/guru/siswa'))}
      {!kepala && item('bayar', 'Bayar', Ikon.plus, buka)}
      {kepala
        ? item('laporan', 'Laporan', Ikon.grafik, () => nav('/guru/laporan'))
        : item('pembayaran', 'Riwayat', Ikon.dompet, () => nav('/guru/pembayaran'))}
      {item('lainnya', 'Lainnya', Ikon.menu, () => nav('/guru/lainnya'))}
    </nav>
  )
}