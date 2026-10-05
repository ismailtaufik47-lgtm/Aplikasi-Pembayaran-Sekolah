import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  Shell, Toast, Ikon, Muat, Sidebar, MerekSidebar, NavLabel, NavItem, TabEmoji, TombolTema,
  KakiRumput, LogoSekolah, Sheet, Chevron,
} from '../components/ui.jsx'
import { useLoncengTagih } from '../lib/lonceng.js'
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
import AkunStaf from './AkunStaf.jsx'
import AkunNonaktif from './AkunNonaktif.jsx'
import { AWALAN_NONAKTIF } from '../lib/api.js'
import SpandukLangganan from '../components/Spanduklangganan.jsx'
import { labelPeran, menuSekolah, pilihTab } from '../lib/akses.js'

export default function GuruApp() {
  const { siap, galat, peran, pesan, muat, segarkan, pengaturan, boleh, terkunci, cegahKunci } = useData()
  const { sesi, siap: authSiap } = useAuth()
  const [catat, setCatat] = useState(null)   // { siswaId } | null
  const [pilihTransaksi, setPilihTransaksi] = useState(false) // lembar "Transaksi" (tombol tengah)
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
  if (galat?.startsWith(AWALAN_NONAKTIF)) return <AkunNonaktif pesan={galat} onCobaLagi={segarkan} />
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
  const menu = menuSekolah(boleh, peran)
  const ada = (id) => menu.some((m) => m.id === id)
  const bisaCatat = boleh('pembayaran')
  const bisaKas = ada('kas') && boleh('kas')
  const tab = pilihTab(menu, bisaCatat || bisaKas)
  // Tombol "Transaksi": langsung ke form kalau hanya boleh satu jenis, selain itu tampilkan pilihan.
  const bukaTransaksi = () => {
    if (bisaCatat && !bisaKas) return bukaCatat()
    if (!bisaCatat && bisaKas) return catatKas('keluar')
    setPilihTransaksi(true)
  }
  const catatKas = (jenis) => {
    if (cegahKunci('kas')) return
    nav('/guru/kas', { state: { catat: jenis, minta: Date.now() } })
  }

  const halaman = pathname.includes('/tanya-ai') ? 'ai'
    : (menu.find((m) => m.id !== 'beranda' && pathname.startsWith(m.ke)) || {}).id
      || (pathname.includes('/lainnya') ? 'lainnya' : pathname.includes('/profil-akun') ? 'profil-akun' : 'beranda')
  // Tab bar mobile merangkum halaman yang tidak punya tab ke "Lainnya".
  const tabAktif = tab.some((t) => t.id === halaman) ? halaman : halaman === 'beranda' ? 'beranda' : 'lainnya'

  // SAKU (asisten AI) punya tata letak sendiri (kolom ketik menempel di bawah),
  // jadi tidak dibungkus area gulir biasa.
  const halamanAI = ada('ai') && /\/tanya-ai\/?$/.test(pathname)
  // Kartu pembayaran siswa punya bilah atas sendiri (tombol kembali + Ubah).
  const halamanDetail = /\/siswa\/[^/]+\/?$/.test(pathname)

  return (
    // .teks-jelas: teks keterangan abu-abu dibuat hitam (lihat src/index.css)
    // .panel-ceria: gaya "ceria" (langit, kartu bulat, tombol permen) khusus panel sekolah
    <div className="teks-jelas panel-ceria">
    <Shell
      ceria
      sidebar={<SisiKiri aktif={halaman} nav={nav} menu={menu} buka={bukaTransaksi} terkunci={terkunci} bisaCatat={bisaCatat || bisaKas} peran={peran} />}
      tabbar={<TabBar tab={tab} aktif={tabAktif} nav={nav} buka={bukaTransaksi} terkunci={terkunci} tumpang={!halamanAI} />}
    >
      {halamanAI ? <TanyaAI /> : (
      <AreaGulir pathname={pathname}>
        {/* Isi setinggi layar minimal (flex kolom) → rumput selalu menempel di
            dasar layar/isi. Tidak ada padding bawah sama sekali. */}
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full px-[18px] pt-3.5 lg:max-w-[1244px] lg:px-8 lg:pt-0 2xl:max-w-[1384px]">
            {!halamanDetail && <BilahAtasHp nav={nav} bolehTagihan={ada('tagihan')} />}
            <SpandukLangganan pengaturan={pengaturan} />
            <Routes>
              <Route index element={<Beranda onCatat={(siswaId) => bukaCatat(siswaId)} onTambahSiswa={boleh('siswa') ? bukaTambahSiswa : undefined} />} />
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
              {ada('akun-staf') && <Route path="akun-staf" element={<AkunStaf />} />}
              {ada('profil-sekolah') && <Route path="profil-sekolah" element={<ProfilSekolah />} />}
              {ada('langganan') && <Route path="langganan" element={<Langganan />} />}

              <Route path="*" element={<Navigate to="/guru" replace />} />
            </Routes>
          </div>
          <KakiRumput className="mt-auto" />
        </div>
      </AreaGulir>
      )}
      {bisaCatat && <SheetCatat buka={!!catat} awal={catat} tutup={() => setCatat(null)} />}
      <SheetTransaksi
        buka={pilihTransaksi}
        tutup={() => setPilihTransaksi(false)}
        bisaCatat={bisaCatat}
        bisaKas={bisaKas}
        pilih={(jenis) => {
          setPilihTransaksi(false)
          if (jenis === 'bayar') bukaCatat()
          else catatKas(jenis)
        }}
      />
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

/** Area gulir halaman (langit ikut tergulir). Kembali ke atas saat pindah halaman. */
function AreaGulir({ pathname, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [pathname])
  return (
    <div ref={ref} className="langit-gulir noscroll flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  )
}

/**
 * Bilah atas di HP: logo + nama sekolah (ketuk → menu sekolah) dan lonceng
 * jumlah siswa yang perlu ditagih.
 */
function BilahAtasHp({ nav, bolehTagihan }) {
  const { pengaturan, petugas, peran, boleh, segarkan, toast, modeDemo } = useData()
  const { keluar } = useAuth()
  const [menu, setMenu] = useState(false)
  // Angka lonceng = siswa yang BARU perlu ditagih; hilang setelah lonceng diketuk.
  const { lihat: lihatTagih, jumlah: jumlahTagih, baru, tandai } = useLoncengTagih()
  const lonceng = () => {
    tandai()
    toast(jumlahTagih ? `${jumlahTagih} siswa perlu ditagih` : 'Tidak ada SPP yang lewat jatuh tempo')
    if (jumlahTagih && bolehTagihan) nav('/guru/tagihan')
  }
  const tujuanAtur = boleh('sekolah') ? '/guru/profil-sekolah' : boleh('biaya', 'lihat') ? '/guru/biaya' : '/guru/lainnya'

  return (
    <header className="relative z-[3] mb-1.5 flex items-center gap-2.5 lg:hidden">
      <button type="button" onClick={() => setMenu(true)} aria-label="Menu sekolah" className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <LogoSekolah logo={pengaturan.logo} ukuran={42} className="shadow-[inset_0_-3px_0_#E3E9F4,0_4px_12px_rgba(27,37,89,.08)]" />
        <span className="min-w-0">
          <b className="judul-halaman line-clamp-1 block text-[15px] font-extrabold leading-tight">{pengaturan.namaSekolah}</b>
          <span className="sub-halaman block truncate text-[12px] font-bold">
            {labelPeran(peran)}{petugas ? ` · ${petugas}` : ''}
          </span>
        </span>
      </button>
      {lihatTagih && (
        <button
          type="button"
          onClick={lonceng}
          aria-label={baru ? `${baru} siswa baru perlu ditagih` : `${jumlahTagih} siswa perlu ditagih`}
          className="tombol-bilah relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] active:scale-95"
        >
          <Ikon.lonceng size={20} />
          {baru > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-[10px] border-2 border-white bg-danger px-1 text-[10px] font-bold text-white dark:border-[#16264D]">
              {baru > 9 ? '9+' : baru}
            </span>
          )}
        </button>
      )}

      <Sheet buka={menu} tutup={() => setMenu(false)} judul={pengaturan.namaSekolah} lead={pengaturan.alamat || `Tahun ajaran ${pengaturan.tahunAjaran}`}>
        <button className="bigbtn-ghost mb-2.5" onClick={() => { setMenu(false); nav(tujuanAtur) }}>
          {boleh('sekolah') ? 'Profil sekolah' : boleh('biaya', 'lihat') ? 'Pengaturan jenis biaya' : 'Menu lainnya'}
        </button>
        <button className="bigbtn-ghost mb-2.5" onClick={() => { setMenu(false); segarkan(); toast('Data disegarkan') }}>
          Muat ulang data
        </button>
        {!modeDemo && (
          <button className="w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger" onClick={keluar}>
            Keluar
          </button>
        )}
        {modeDemo && <p className="pt-1 text-center text-[12px] text-muted">Mode demo — belum tersambung ke Supabase.</p>}
      </Sheet>
    </header>
  )
}

/** Navigasi kiri (kartu melayang), hanya tampil mulai lebar 1024px. */
function SisiKiri({ aktif, nav, menu, buka, terkunci, bisaCatat, peran }) {
  const { pengaturan, petugas, avatarSaya, modeDemo, boleh } = useData()
  const { keluar } = useAuth()
  const utama = menu.filter((m) => m.grup === 'menu')
  const atur = menu.filter((m) => m.grup === 'atur')
  return (
    <Sidebar ceria>
      <MerekSidebar logo={pengaturan.logo} nama={pengaturan.namaSekolah} sub={pengaturan.alamat || (boleh('sekolah') ? 'Lengkapi alamat di Profil sekolah' : 'Panel sekolah')} />

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
          className={`mt-3 flex shrink-0 items-center justify-center gap-2 rounded-[16px] py-3 text-[13.5px] font-extrabold transition active:translate-y-px ${
            terkunci ? 'bg-isi text-muted' : 'bg-brand text-white'
          }`}
        >
          {terkunci ? <Ikon.jam size={18} /> : <Ikon.plus size={18} />}
          Catat transaksi
        </button>
      )}

      <div className="mt-auto border-t-[1.5px] border-dashed border-line px-1 pt-3">
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
 * Lembar "Transaksi" (tombol tengah HP & tombol di navigasi kiri PC):
 * pilih mau mencatat pembayaran siswa, pengeluaran, atau pemasukan lain.
 */
function SheetTransaksi({ buka, tutup, bisaCatat, bisaKas, pilih }) {
  const pilihan = [
    bisaCatat && { id: 'bayar', warna: 'biru', judul: 'Catat pembayaran', sub: 'Orang tua bayar SPP, kegiatan, PMB / daftar ulang',
      ikon: <><path d="M12 5v14" /><path d="M5 12h14" /></> },
    bisaKas && { id: 'keluar', warna: 'pink', judul: 'Catat pengeluaran', sub: 'Operasional atau untuk kegiatan (bisa banyak rincian)',
      ikon: <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></> },
    bisaKas && { id: 'masuk', warna: 'tosca', judul: 'Pemasukan lain', sub: 'Donasi, dana BOP, sumbangan yayasan…',
      ikon: <><path d="M17 7 7 17" /><path d="M7 9v8h8" /></> },
  ].filter(Boolean)
  return (
    <Sheet buka={buka} tutup={tutup} judul="Transaksi baru" lead="Mau mencatat apa?">
      <div className="grid gap-2.5 pb-1">
        {pilihan.map((p) => (
          <button
            key={p.id}
            onClick={() => pilih(p.id)}
            className="flex items-center gap-3.5 rounded-[20px] border-[1.5px] border-[#DCE6F4] bg-kartu p-3.5 text-left transition hover:border-brand/50 active:scale-[.99] dark:border-line"
          >
            <span className={`permen permen-${p.warna} grid h-12 w-12 shrink-0 place-items-center rounded-[16px]`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p.ikon}</svg>
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-extrabold">{p.judul}</b>
              <span className="block text-[12.5px] font-semibold leading-snug text-muted">{p.sub}</span>
            </span>
            <Chevron />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/**
 * Bottom nav HP — baris rata sederhana, TIDAK ADA elemen melayang atau
 * absolute-positioned (sengaja, supaya tidak pernah muncul artefak tombol
 * "nyangkut" di tengah nav). "Bayar" jadi salah satu item biasa.
 * `tumpang`: nav sedikit menutupi ujung bawah area gulir (rumput penutup
 * halaman terlihat menerus di balik sudut nav yang membulat).
 */
function TabBar({ tab, aktif, nav, buka, terkunci, tumpang }) {
  return (
    <nav className={`bilah-tab relative z-10 flex shrink-0 items-stretch rounded-t-[22px] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 lg:hidden ${tumpang ? '-mt-5' : ''}`}>
      {tab.map((t) => (
        t.catat
          ? <TabEmoji key={t.id} id={t.emoji} label={t.label} onClick={buka} redup={terkunci} catat />
          : <TabEmoji key={t.id} id={t.emoji} label={t.label} aktif={aktif === t.id} onClick={() => nav(t.ke)} />
      ))}
      <TabEmoji id="lainnya" label="Lainnya" aktif={aktif === 'lainnya'} onClick={() => nav('/guru/lainnya')} />
    </nav>
  )
}
