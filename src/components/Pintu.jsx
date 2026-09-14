/**
 * Halaman pemilih peran — hanya untuk pengembangan dan demo.
 * Di produksi, guru dan orang tua masuk lewat tautan masing-masing:
 *   guru       : /guru
 *   orang tua  : /ortu/<token wali>
 */
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { modeDemo } from '../lib/supabase.js'

const CONTOH = [
  ['Aisyah Nur Fadilah', 'P'],
  ['Muhammad Zidan', 'L'],
  ['Khansa Aulia', 'P'],
  ['Raffasya Putra', 'L'],
  ['Qaisha Putri Maheswari', 'P'],
]

export default function Pintu() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-white text-3xl shadow-soft">🏫</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Aplikasi Pembayaran TK</h1>
          <p className="mt-1 text-sm text-muted">Iuran SPP dan biaya kegiatan</p>
        </div>

        <div className="mb-4 flex justify-center -space-x-3">
          {CONTOH.map(([nama, jenis]) => (
            <Avatar key={nama} nama={nama} jenis={jenis} size={44} ring />
          ))}
        </div>

        <Link to="/guru" className="card mb-3 flex items-center gap-3 active:scale-[.99]">
          <span className="tile bg-brand text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8" r="3.4" /><path d="M5 20c1-3.6 3.8-5.2 7-5.2s6 1.6 7 5.2" />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-extrabold">Masuk sebagai guru</span>
            <span className="block text-[12.5px] text-muted">Catat pembayaran, kelola jenis biaya</span>
          </span>
        </Link>

        <Link to={modeDemo ? '/ortu' : '/ortu/demo-wulan'} className="card flex items-center gap-3 active:scale-[.99]">
          <span className="tile bg-ok text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h4" />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-extrabold">Portal orang tua</span>
            <span className="block text-[12.5px] text-muted">Lihat status tagihan dan bukti bayar</span>
          </span>
        </Link>

        {modeDemo && (
          <p className="mt-5 text-center text-[12px] leading-relaxed text-muted">
            Mode demo — data contoh, belum tersambung ke Supabase.
            <br />
            Isi <code className="font-semibold">VITE_SUPABASE_URL</code> dan{' '}
            <code className="font-semibold">VITE_SUPABASE_ANON_KEY</code> di file .env.
          </p>
        )}
      </div>
    </div>
  )
}
