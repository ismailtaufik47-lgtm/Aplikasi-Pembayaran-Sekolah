/**
 * Layar login staf sekolah.
 *
 * Default: layar PIN langsung (tanpa tab pilihan), karena itu jalur
 * sehari-hari untuk visi PWA. MasukPin menangani deteksi otomatis
 * apakah email punya PIN atau belum — kalau belum, ia sendiri yang
 * menampilkan saran Google yang jelas, tidak perlu user tebak-tebak.
 *
 * Tombol "Masuk dengan Google" tersedia sebagai state terpisah yang
 * dipicu oleh MasukPin (saran otomatis) atau link manual di bawah.
 */
import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import MasukPin from './MasukPin.jsx'

export default function Masuk({ onDaftar }) {
  const { masukGoogle, masukPin, modeDemo } = useAuth()
  const [pakaiGoogle, setPakaiGoogle] = useState(false)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const klikGoogle = async () => {
    setGalat(''); setSibuk(true)
    try {
      await masukGoogle()
    } catch (e) {
      setGalat(e.message); setSibuk(false)
    }
  }

  // Layar Google — dipakai pertama kali atau saat PIN belum aktif
  if (pakaiGoogle) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[16px] bg-brand text-3xl">🏫</div>
            <h1 className="text-[19px] font-extrabold">Pembayaran TK</h1>
            <p className="mt-0.5 text-[12.5px] font-semibold text-muted">
              Masuk untuk mengelola pembayaran sekolah
            </p>
          </div>

          <button
            onClick={klikGoogle}
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
            <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">
              {galat}
            </p>
          )}

          <div className="mt-4 flex gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-brand-deep">
            <span className="shrink-0">ℹ️</span>
            Login pakai Google membuat akun Anda aman tanpa perlu mengingat password.
          </div>

          <button
            onClick={() => setPakaiGoogle(false)}
            className="mt-5 block w-full text-center text-[13px] font-bold text-muted underline underline-offset-2"
          >
            Sudah punya PIN? Masuk pakai PIN
          </button>

          {modeDemo && (
            <p className="mt-4 text-center text-[12px] text-muted">
              Mode demo — tombol ini tidak benar-benar memanggil Google.
              Isi <code className="font-semibold">.env</code> untuk mencobanya.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Layar PIN (default)
  const footer = (onDaftar || modeDemo) ? (
    <>
      {onDaftar && (
        <button
          onClick={onDaftar}
          className="text-[12.5px] font-bold text-muted underline underline-offset-2"
        >
          Belum punya akun? Gabung atau daftarkan sekolah
        </button>
      )}
      {modeDemo && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Mode demo — PIN tidak benar-benar diverifikasi ke server.
        </p>
      )}
    </>
  ) : null

  return <MasukPin onMasuk={masukPin} onPakaiGoogle={() => setPakaiGoogle(true)} footer={footer} />
}