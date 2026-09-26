import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import GuruApp from './guru/GuruApp.jsx'
import OrtuApp from './ortu/OrtuApp.jsx'
import AdminApp from './admin/AdminApp.jsx'
import Verifikasi from './Verifikasi.jsx'
import { DataProvider } from './lib/store.jsx'
import { AuthProvider } from './lib/auth.jsx'
import './index.css'
import './lib/tema.js' // pasang mode terang/gelap sedini mungkin

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            {/* Dulu "/" menampilkan pemilih peran dev/demo (Pintu.jsx) —
                sekarang langsung ke /guru supaya yang buka aplikasi langsung
                lihat layar Masuk, bukan halaman pilih dulu. */}
            <Route path="/" element={<Navigate to="/guru" replace />} />
            <Route path="/guru/*" element={<GuruApp />} />
            {/* panel pemilik aplikasi: perpanjang langganan, grafik pendapatan */}
            <Route path="/admin/*" element={<AdminApp />} />
            {/* token wali ada di URL; tanpa token hanya jalan di mode demo */}
            <Route path="/ortu/:token/*" element={<OrtuApp />} />
            <Route path="/ortu/*" element={<OrtuApp />} />
            {/* dibuka dari QR di kuitansi — tanpa login */}
            <Route path="/verifikasi/:kode" element={<Verifikasi />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
)