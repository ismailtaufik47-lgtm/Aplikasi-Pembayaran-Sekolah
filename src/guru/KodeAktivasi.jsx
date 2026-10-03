/**
 * Kelola kode aktivasi — kepala sekolah membuat kode di sini, lalu
 * membagikannya (WA, lisan, dll) ke Admin/TU yang belum terdaftar.
 * Admin/TU memasukkan kode itu di layar Onboarding saat pertama kali login.
 * (Guru kelas tidak memakai aplikasi ini — hanya kepala sekolah & Admin/TU.)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BtnKecil, Ikon, KepalaHalaman, Kosong } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'

export default function KodeAktivasi() {
  const { toast } = useData()
  const nav = useNavigate()
  const [daftar, setDaftar] = useState([]) // kode yang dibuat sesi ini
  const [sibuk, setSibuk] = useState(false)

  const buat = async (peran) => {
    setSibuk(true)
    try {
      const hasil = await api.buatKodeAktivasi(peran)
      setDaftar((d) => [{ ...hasil, waktu: 'Baru saja' }, ...d])
      toast('Kode ' + hasil.kode + ' siap dibagikan')
    } catch (e) {
      toast('Gagal membuat kode: ' + e.message)
    } finally {
      setSibuk(false)
    }
  }

  const salin = (kode) => {
    navigator.clipboard?.writeText(kode)
    toast('Kode disalin')
  }

  return (
    <>
      <KepalaHalaman judul="Kode aktivasi" gambar="anak" kembali={() => nav('/guru/lainnya')} sub="Buat kode sekali pakai untuk mengundang akun Admin/TU baru" />

      <div className="flex gap-2.5 lg:max-w-md">
        <BtnKecil utama onClick={() => buat('admin')} disabled={sibuk}>
          <Ikon.plus size={16} />
          {sibuk ? 'Membuat kode…' : 'Buat kode untuk Admin/TU'}
        </BtnKecil>
      </div>

      <div className="seghead"><h2>Kode dibuat sesi ini</h2></div>
      <div className="card">
        {daftar.length === 0 ? (
          <Kosong>Belum ada kode dibuat. Klik tombol di atas untuk membuat satu.</Kosong>
        ) : (
          daftar.map((k, i) => (
            <div key={i} className="row">
              <span className="permen permen-kecil permen-kuning grid h-11 shrink-0 place-items-center rounded-[14px] px-2.5 font-mono text-[13px] font-extrabold tracking-wide">
                {k.kode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold">Untuk Admin/TU</span>
                <span className="block text-xs text-muted">{k.waktu} · sekali pakai</span>
              </span>
              <button
                className="shrink-0 rounded-xl bg-kartu border border-line px-3 py-2 text-xs font-bold"
                onClick={() => salin(k.kode)}
              >
                Salin
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-brand-deep">
        <span className="shrink-0">ℹ️</span>
        Kode hanya berlaku sekali. Bagikan langsung ke Admin/TU yang dituju — siapa pun yang
        memasukkannya lebih dulu akan mendapat aksesnya. Menu yang bisa dibuka Admin/TU
        mengikuti pengaturan hak akses sekolah.
      </div>
    </>
  )
}