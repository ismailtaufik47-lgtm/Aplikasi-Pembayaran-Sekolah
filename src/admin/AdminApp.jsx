/**
 * Panel admin aplikasi — /admin
 *
 * Khusus pemilik aplikasi (email terdaftar di tabel admin_aplikasi).
 * Login memakai akun Supabase yang sama (PIN atau Google), tapi lewat
 * halaman sendiri dan setelah login dicek dulu: kalau bukan admin,
 * ditolak dengan sopan. Semua RPC-nya juga memeriksa ulang di database.
 *
 * Menu: Ringkasan (angka & grafik) · Sekolah (daftar + perpanjang) · Riwayat.
 */
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Ikon, Muat, NavItem, NavLabel, Shell, Sidebar, Toast } from '../components/ui.jsx'
import MasukPin from '../components/MasukPin.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useData } from '../lib/store.jsx'
import * as api from './apiAdmin.js'
import { AdminProvider, useAdmin } from './storeAdmin.jsx'
import Ringkasan from './Ringkasan.jsx'
import DaftarSekolah from './DaftarSekolah.jsx'
import Riwayat from './Riwayat.jsx'

export default function AdminApp() {
  const { sesi, siap, masukPin, keluar } = useAuth()
  const [admin, setAdmin] = useState(null) // null = sedang dicek
  const [pakaiGoogle, setPakaiGoogle] = useState(false)

  // Bergantung pada ID user (bukan objek sesi) supaya refresh token tiap
  // jam tidak memicu cek ulang & membuat panel berkedip/termuat ulang.
  const userId = sesi?.user?.id
  useEffect(() => {
    if (!userId || api.modeDemo) { setAdmin(null); return }
    let batal = false
    setAdmin(null)
    api.cekAdmin()
      .then((ok) => !batal && setAdmin(!!ok))
      .catch(() => !batal && setAdmin(false))
    return () => { batal = true }
  }, [userId])

  if (api.modeDemo) {
    return <Muat>Panel admin butuh koneksi Supabase. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.</Muat>
  }
  if (!siap) return <Muat>Menyiapkan sesi…</Muat>
  if (!sesi) {
    return pakaiGoogle ? (
      <MasukGoogleAdmin kembali={() => setPakaiGoogle(false)} />
    ) : (
      <MasukPin
        onMasuk={masukPin}
        onPakaiGoogle={() => setPakaiGoogle(true)}
        footer={<span className="text-[12px] font-semibold text-muted">🔐 Panel admin aplikasi — khusus pemilik aplikasi</span>}
      />
    )
  }
  if (admin === null) return <Muat>Memeriksa akses admin…</Muat>
  if (!admin) return <BukanAdmin email={sesi.user?.email} keluar={keluar} />

  return (
    <AdminProvider>
      <Panel email={sesi.user?.email} keluar={keluar} />
    </AdminProvider>
  )
}

/* ---------- panel setelah lolos cek admin ---------- */
function Panel({ email, keluar }) {
  const { siap, galat, muat } = useAdmin()
  const { pesan } = useData()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const tab = pathname.includes('/sekolah') ? 'sekolah' : pathname.includes('/riwayat') ? 'riwayat' : 'ringkasan'

  if (!siap) return <Muat>Memuat data sekolah…</Muat>
  if (galat) return <Muat aksi={muat}>Gagal memuat data: {galat}</Muat>

  const MENU = [
    { id: 'ringkasan', label: 'Ringkasan', ikon: Ikon.grafik, ke: '/admin' },
    { id: 'sekolah', label: 'Sekolah', ikon: Ikon.rumah, ke: '/admin/sekolah' },
    { id: 'riwayat', label: 'Riwayat', ikon: Ikon.nota, ke: '/admin/riwayat' },
  ]

  return (
    <Shell
      sidebar={
        <Sidebar>
          <div className="flex items-center gap-3 px-2 pb-4">
            <span className="grid h-[42px] w-[42px] place-items-center rounded-[13px] bg-ink text-xl">🛠️</span>
            <span className="min-w-0">
              <b className="block truncate text-[14.5px] font-extrabold leading-tight">Admin Aplikasi</b>
              <span className="text-[11.5px] font-semibold text-muted">Sewa aplikasi SPP TK</span>
            </span>
          </div>
          <NavLabel>Menu</NavLabel>
          {MENU.map((m) => (
            <NavItem key={m.id} aktif={tab === m.id} onClick={() => nav(m.ke)} ikon={m.ikon}>
              {m.label}
            </NavItem>
          ))}
          <button
            onClick={muat}
            className="mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-line py-2.5 text-[13px] font-bold text-muted hover:text-ink"
          >
            Muat ulang data
          </button>
          <div className="mt-auto flex items-center gap-3 border-t border-line px-2 pt-3">
            <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-brand-soft text-[13px] font-extrabold text-brand">
              {(email || 'A')[0].toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-extrabold">{email}</b>
              <span className="text-[11.5px] font-semibold text-muted">Admin</span>
            </span>
            <button className="rounded-lg px-2 py-1.5 text-[11.5px] font-bold text-danger" onClick={keluar}>
              Keluar
            </button>
          </div>
        </Sidebar>
      }
      tabbar={
        <nav className="flex shrink-0 items-stretch border-t border-line bg-white px-1 pb-[calc(9px+env(safe-area-inset-bottom))] pt-2 lg:hidden">
          {MENU.map((m) => {
            const on = tab === m.id
            return (
              <button key={m.id} onClick={() => nav(m.ke)} className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5">
                <span className={`grid h-8 w-8 place-items-center rounded-full transition ${on ? 'bg-brand-soft text-brand' : 'text-muted'}`}>
                  <m.ikon size={19} />
                </span>
                <span className={`text-[10.5px] font-bold ${on ? 'text-brand' : 'text-muted'}`}>{m.label}</span>
              </button>
            )
          })}
          <button onClick={keluar} className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5">
            <span className="grid h-8 w-8 place-items-center rounded-full text-danger">
              <Ikon.kembali size={19} />
            </span>
            <span className="text-[10.5px] font-bold text-danger">Keluar</span>
          </button>
        </nav>
      }
    >
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] pb-32 lg:px-8 lg:pb-10">
        <div className="mx-auto w-full lg:max-w-[1180px] 2xl:max-w-[1320px]">
          <Routes>
            <Route index element={<Ringkasan />} />
            <Route path="sekolah" element={<DaftarSekolah />} />
            <Route path="riwayat" element={<Riwayat />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </div>
      <Toast pesan={pesan} />
    </Shell>
  )
}

/* ---------- login Google, kembali ke /admin ---------- */
function MasukGoogleAdmin({ kembali }) {
  const { masukGoogle } = useAuth()
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const klik = async () => {
    setGalat(''); setSibuk(true)
    try {
      await masukGoogle('/admin')
    } catch (e) {
      setGalat(e.message); setSibuk(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[16px] bg-ink text-3xl">🛠️</div>
          <h1 className="text-[19px] font-extrabold">Admin Aplikasi</h1>
          <p className="mt-0.5 text-[12.5px] font-semibold text-muted">Masuk dengan email yang terdaftar sebagai admin</p>
        </div>
        <button
          onClick={klik}
          disabled={sibuk}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-line bg-white py-4 font-extrabold disabled:opacity-60"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 14.1 6 6 14.1 6 24s8.1 18 18 18 18-8.1 18-18c0-1.2-.1-2.3-.4-3.5z" />
            <path fill="#FF3D00" d="M8.3 14.7l6.6 4.8C16.7 15.6 20 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 16.3 6 9.7 10.3 8.3 14.7z" />
            <path fill="#4CAF50" d="M24 42c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 37.6 16.2 42 24 42z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.4 35.4 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z" />
          </svg>
          {sibuk ? 'Menghubungkan…' : 'Masuk dengan Google'}
        </button>
        {galat && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">{galat}</p>
        )}
        <button onClick={kembali} className="mt-5 block w-full text-center text-[13px] font-bold text-muted underline underline-offset-2">
          Masuk pakai PIN
        </button>
      </div>
    </div>
  )
}

/* ---------- sudah login tapi bukan admin ---------- */
function BukanAdmin({ email, keluar }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[400px] text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-2xl">🔒</div>
        <h1 className="text-[18px] font-extrabold">Bukan akun admin</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          <b className="text-ink">{email}</b> tidak terdaftar sebagai admin aplikasi.
        </p>
        <div className="mt-4 rounded-2xl bg-white p-3.5 text-left text-[12px] text-muted shadow-soft">
          Kalau ini email Anda (pemilik aplikasi), daftarkan sekali lewat Supabase SQL Editor:
          <code className="mt-2 block break-all rounded-lg bg-[#F5F6FA] p-2 text-[11.5px] text-ink">
            insert into admin_aplikasi (email) values ('{email}');
          </code>
        </div>
        <button onClick={keluar} className="bigbtn mt-5">Keluar & ganti akun</button>
        <a href="/guru" className="mt-3 block text-[13px] font-bold text-muted underline underline-offset-2">
          Ke panel sekolah
        </a>
      </div>
    </div>
  )
}
