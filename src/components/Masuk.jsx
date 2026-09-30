/**
 * Layar login staf sekolah (tampilan Kasceria).
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
import LatarMasuk, {
  IkonGoogle, JudulKartu, KartuMasuk, KepalaMerek, KotakInfo, PemisahAtau, SambutanPc, TautanTeks, TombolHantu,
} from './LatarMasuk.jsx'

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

  // Layar Google — dipakai pertama kali atau saat PIN belum aktif / lupa PIN
  if (pakaiGoogle) {
    return (
      <LatarMasuk kepala={<KepalaMerek />} kembali={() => setPakaiGoogle(false)}>
        <KartuMasuk>
          <JudulKartu judul="Masuk dengan Google" sub="Untuk masuk pertama kali, atau kalau Anda lupa PIN." />

          <button
            type="button"
            onClick={klikGoogle}
            disabled={sibuk}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-[18px] border-[1.5px] border-[#DCE3EF] bg-white pb-[3px] font-display text-[16px] font-semibold text-ink shadow-[inset_0_-4px_0_#E9EEF6,0_6px_14px_rgba(27,37,89,.06)] active:translate-y-0.5 disabled:opacity-60 dark:border-line dark:bg-isi dark:shadow-none"
          >
            <IkonGoogle />
            {sibuk ? 'Menghubungkan…' : 'Masuk dengan Google'}
          </button>

          {galat && (
            <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">{galat}</p>
          )}

          <KotakInfo ikon="perisai" nada="aman">
            Aman tanpa perlu mengingat password. Setelah masuk, buat <b>PIN 6 digit</b> di Profil Akun supaya lain kali bisa masuk lebih cepat.
          </KotakInfo>

          <PemisahAtau />
          <TombolHantu ikon="gembok" onClick={() => setPakaiGoogle(false)}>Sudah punya PIN? Masuk pakai PIN</TombolHantu>

          {modeDemo && (
            <p className="text-center text-[11.5px] leading-relaxed text-muted">
              Mode demo — tombol ini tidak benar-benar memanggil Google. Isi <code className="font-semibold">.env</code> untuk mencobanya.
            </p>
          )}
        </KartuMasuk>
      </LatarMasuk>
    )
  }

  // Layar PIN (default)
  const footer = (onDaftar || modeDemo) ? (
    <>
      {onDaftar && (
        <p>Belum punya akun? <TautanTeks onClick={onDaftar}>Gabung atau daftarkan sekolah</TautanTeks></p>
      )}
      {modeDemo && (
        <p className="text-[11px] leading-relaxed text-muted">Mode demo — PIN tidak benar-benar diverifikasi ke server.</p>
      )}
    </>
  ) : null

  return (
    <MasukPin
      onMasuk={masukPin}
      onPakaiGoogle={() => setPakaiGoogle(true)}
      footer={footer}
      sisiKiri={<SambutanPc />}
    />
  )
}
