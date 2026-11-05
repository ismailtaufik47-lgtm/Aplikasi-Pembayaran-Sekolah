import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import GuruApp from './guru/GuruApp.jsx'
import OrtuApp from './ortu/OrtuApp.jsx'
import AdminApp from './admin/AdminApp.jsx'
import KelasApp from './kelas/KelasApp.jsx'
import Verifikasi from './Verifikasi.jsx'
import { DataProvider } from './lib/store.jsx'
import { AuthProvider } from './lib/auth.jsx'
import './index.css'
import './kelas/kelas.css' // tema hijau aplikasi guru kelas (hanya aktif di html.tema-kelas) — harus SESUDAH index.css
import './lib/tema.js' // pasang mode terang/gelap sedini mungkin
import './lib/pasang.js' // PWA: tangkap tawaran "pasang aplikasi" sedini mungkin + daftarkan service worker
import { PasangOtomatis } from './components/PasangAplikasi.jsx'
import { diHostGuru, diHostOrtu, domainSeharusnya } from './lib/domain.js'

// kabarananda.my.id hanya untuk orang tua: alamat lain (/guru, /admin, /kelas) dibelokkan ke portal.
const hostOrtu = diHostOrtu()

/** Tiap domain hanya membuka bagiannya sendiri: mis. /guru di tumbuh.* pindah ke app.*
 *  (alamat sama, domain diganti). Lokal & netlify.app tidak terpengaruh. */
function JagaDomain({ children }) {
  const { pathname, search, hash } = useLocation()
  const tujuan = domainSeharusnya(pathname)
  React.useEffect(() => {
    if (tujuan) window.location.replace(tujuan + pathname + search + hash)
  }, [tujuan, pathname, search, hash])
  return tujuan ? null : children
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <JagaDomain>
          <Routes>
            {/* Dulu "/" menampilkan pemilih peran dev/demo (Pintu.jsx) —
                sekarang langsung ke /guru supaya yang buka aplikasi langsung
                lihat layar Masuk, bukan halaman pilih dulu. */}
            <Route path="/" element={<Navigate to={hostOrtu ? '/ortu' : diHostGuru() ? '/kelas' : '/guru'} replace />} />
            {!hostOrtu && <Route path="/guru/*" element={<GuruApp />} />}
            {/* panel pemilik aplikasi: perpanjang langganan, grafik pendapatan */}
            {!hostOrtu && <Route path="/admin/*" element={<AdminApp />} />}
            {/* aplikasi guru kelas (tumbuh kembang, 0052) — juga di tumbuh.kasceria.my.id */}
            {!hostOrtu && <Route path="/kelas/*" element={<KelasApp />} />}
            {/* token wali ada di URL; tanpa token hanya jalan di mode demo */}
            <Route path="/ortu/:token/*" element={<OrtuApp />} />
            <Route path="/ortu/*" element={<OrtuApp />} />
            {/* dibuka dari QR di kuitansi — tanpa login */}
            <Route path="/verifikasi/:kode" element={<Verifikasi />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </JagaDomain>
          {/* popup "Pasang Kasceria" — hanya di /guru & /ortu, sekali per kunjungan */}
          <PasangOtomatis />
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
)