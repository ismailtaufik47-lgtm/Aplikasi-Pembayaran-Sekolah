/**
 * Ditampilkan cuma untuk akun yang BELUM punya sekolah — jalur masuk
 * terpisah dari layar Masuk sehari-hari (Google/PIN), supaya orang yang
 * sudah terdaftar tidak perlu melihat/memilih ini lagi tiap kali masuk.
 *
 * Dua jalur ini SENGAJA tidak dibuat simetris seperti kartu kembar:
 * bergabung ke sekolah yang sudah didaftarkan kepala sekolahnya jauh
 * lebih sering terjadi (tiap sekolah bisa punya banyak guru/TU) daripada
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
import { Ikon } from './ui.jsx'

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
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <button onClick={kembali} className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-white shadow-soft">
          <Ikon.kembali size={17} />
        </button>

        <h1 className="text-[21px] font-extrabold tracking-tight">Gabung ke Pembayaran TK</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          Tiap sekolah punya satu kepala sekolah yang mendaftarkan, lalu mengundang guru
          dan staf TU pakai kode. Pilih yang sesuai posisi Anda.
        </p>

        {/* jalur utama — lebih sering dipakai: staf yang bergabung pakai kode */}
        <button
          onClick={() => pilih('tu')}
          disabled={!!proses}
          className="mt-6 flex w-full items-start gap-3.5 rounded-2xl border-2 border-brand bg-white p-4 text-left shadow-brand disabled:opacity-60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-brand text-white">
            <Ikon.siswa size={21} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">Guru atau staf TU</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
              Sekolah Anda sudah terdaftar dan Anda punya kode aktivasi 6 karakter dari kepala sekolah
            </span>
          </span>
          {proses === 'tu' ? (
            <span className="mt-1 shrink-0 text-[12px] font-bold text-brand">Membuka…</span>
          ) : (
            <Ikon.kembali size={18} className="mt-1 shrink-0 rotate-180 text-[#C3CDDC]" />
          )}
        </button>

        <div className="my-4 flex items-center gap-3 text-[12px] font-semibold text-muted">
          <span className="h-px flex-1 bg-line" />
          atau
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* jalur kedua — lebih jarang: mendirikan sekolah baru di sistem */}
        <button
          onClick={() => pilih('kepala')}
          disabled={!!proses}
          className="flex w-full items-start gap-3.5 rounded-2xl border border-line bg-white p-3.5 text-left disabled:opacity-60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-grape-soft text-grape">
            <Ikon.rumah size={21} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold">Saya kepala sekolah</span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
              Sekolah Anda belum ada di sistem — daftarkan untuk pertama kali di sini
            </span>
          </span>
          {proses === 'kepala' ? (
            <span className="mt-1 shrink-0 text-[12px] font-bold text-grape">Membuka…</span>
          ) : (
            <Ikon.kembali size={18} className="mt-1 shrink-0 rotate-180 text-[#C3CDDC]" />
          )}
        </button>

        {galat && (
          <p className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">
            {galat}
          </p>
        )}
      </div>
    </div>
  )
}