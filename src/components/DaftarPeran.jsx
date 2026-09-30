/**
 * Ditampilkan cuma untuk akun yang BELUM punya sekolah — jalur masuk
 * terpisah dari layar Masuk sehari-hari (Google/PIN), supaya orang yang
 * sudah terdaftar tidak perlu melihat/memilih ini lagi tiap kali masuk.
 *
 * Dua jalur ini SENGAJA tidak dibuat simetris seperti kartu kembar:
 * bergabung ke sekolah yang sudah didaftarkan kepala sekolahnya jauh
 * lebih sering terjadi (tiap sekolah bisa punya beberapa Admin/TU) daripada
 * mendaftarkan sekolah baru (sekali per sekolah) — jadi bobot visualnya
 * dibuat mengikuti itu, bukan dibagi rata 50/50.
 *
 * Pilihan di sini cuma penentu ARAH onboarding setelah Google berhasil
 * (lewat sessionStorage) — bukan pengganti data asli. Kalau akun yang
 * login ternyata sudah terdaftar, sistem tetap pakai peran aslinya dari
 * database, apa pun yang diklik di sini.
 */
import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import LatarMasuk, { IkonGoogle, JudulKartu, KartuMasuk, KepalaMerek, PemisahAtau, PilihanPeran } from './LatarMasuk.jsx'

export const KUNCI_PERAN_DAFTAR = 'tk_peran_daftar'

export default function DaftarPeran({ kembali }) {
  const { masukGoogle } = useAuth()
  const [proses, setProses] = useState('') // '' | 'tu' | 'kepala'
  const [galat, setGalat] = useState('')

  const pilih = async (peran) => {
    setGalat('')
    setProses(peran)
    sessionStorage.setItem(KUNCI_PERAN_DAFTAR, peran)
    try {
      await masukGoogle()
    } catch (e) {
      sessionStorage.removeItem(KUNCI_PERAN_DAFTAR)
      setGalat(e.message)
      setProses('')
    }
  }

  return (
    <LatarMasuk kepala={<KepalaMerek />} kembali={kembali}>
      <KartuMasuk>
        <JudulKartu
          judul="Gabung ke Kasceria"
          sub="Tiap sekolah didaftarkan kepala sekolah, lalu kepala sekolah mengundang Admin/TU memakai kode. Pilih yang sesuai posisi Anda."
        />

        {/* jalur utama — lebih sering dipakai: staf yang bergabung pakai kode */}
        <PilihanPeran
          utama
          ikon="kartu"
          warna="biru"
          judul="Saya Admin/TU sekolah"
          sub="Sekolah sudah terdaftar & saya punya kode aktivasi dari kepala sekolah"
          onClick={() => pilih('tu')}
          disabled={!!proses}
          proses={proses === 'tu'}
        />

        <PemisahAtau />

        {/* jalur kedua — lebih jarang: mendirikan sekolah baru di sistem */}
        <PilihanPeran
          ikon="sekolah"
          warna="ungu"
          judul="Saya kepala sekolah"
          sub="Sekolah belum ada — daftarkan untuk pertama kali"
          onClick={() => pilih('kepala')}
          disabled={!!proses}
          proses={proses === 'kepala'}
        />

        {galat && (
          <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">{galat}</p>
        )}

        <p className="flex items-center justify-center gap-2 text-[12px] font-bold text-[#4A5570] dark:text-muted">
          <IkonGoogle size={15} />Setelah memilih, Anda masuk dengan akun Google
        </p>
      </KartuMasuk>
    </LatarMasuk>
  )
}
