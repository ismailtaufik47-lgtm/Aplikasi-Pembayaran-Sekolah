import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import GuruApp from './guru/GuruApp.jsx'
import OrtuApp from './ortu/OrtuApp.jsx'
import Pintu from './components/Pintu.jsx'
import { DataProvider } from './lib/store.jsx'
import { AuthProvider } from './lib/auth.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Pintu />} />
            <Route path="/guru/*" element={<GuruApp />} />
            {/* token wali ada di URL; tanpa token hanya jalan di mode demo */}
            <Route path="/ortu/:token/*" element={<OrtuApp />} />
            <Route path="/ortu/*" element={<OrtuApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
)
