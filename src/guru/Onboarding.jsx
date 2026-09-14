/**
 * Ditampilkan sekali, tepat setelah akun Google baru berhasil login
 * tapi belum terhubung ke sekolah mana pun (belum ada baris `profil`).
 *
 * Dua jalur:
 *  - "Saya kepala sekolah/admin" → daftarkan_sekolah(), jadi peran 'kepala'
 *  - "Saya guru/TU"              → aktivasi_kode(), pakai kode dari kepsek
 *
 * Begitu salah satu berhasil, `onSelesai` dipanggil supaya GuruApp
 * memuat ulang data — sejak itu `muatDataGuru()` akan menemukan profil
 * yang baru dibuat dan masuk normal.
 */
import { useState } from 'react'
import { Ikon } from '../components/ui.jsx'
import * as api from '../lib/api.js'

export default function Onboarding({ onSelesai }) {
  const [langkah, setLangkah] = useState('pilih') // pilih | kode | daftar

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        {langkah === 'pilih' && <Pilih ke={setLangkah} />}
        {langkah === 'kode' && <FormKode kembali={() => setLangkah('pilih')} onSelesai={onSelesai} />}
        {langkah === 'daftar' && <FormDaftar kembali={() => setLangkah('pilih')} onSelesai={onSelesai} />}
      </div>
    </div>
  )
}

function Pilih({ ke }) {
  return (
    <>
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[19px] bg-brand text-3xl text-white shadow-brand">
          📘
        </div>
        <h1 className="text-[21px] font-extrabold tracking-tight">Selangkah lagi</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-muted">
          Akun Google Anda belum terhubung ke sekolah mana pun
        </p>
      </div>

      <Kartu
        warna="text-brand bg-brand-soft"
        judul="Saya guru / petugas TU"
        sub="Punya kode aktivasi dari kepala sekolah"
        ikon={<Ikon.siswa size={22} />}
        onClick={() => ke('kode')}
      />
      <Kartu
        warna="text-grape bg-grape-soft"
        judul="Saya kepala sekolah / admin"
        sub="Daftarkan sekolah untuk pertama kali"
        ikon={<Ikon.rumah size={22} />}
        onClick={() => ke('daftar')}
      />
    </>
  )
}

const Kartu = ({ warna, judul, sub, ikon, onClick }) => (
  <button
    onClick={onClick}
    className="mb-3 flex w-full items-center gap-3.5 rounded-2xl border border-line bg-white p-4 text-left shadow-soft active:scale-[.98]"
  >
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] ${warna}`}>{ikon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[14.5px] font-extrabold">{judul}</span>
      <span className="block text-xs font-semibold text-muted">{sub}</span>
    </span>
    <Ikon.kembali size={18} className="rotate-180 text-[#C3CDDC]" />
  </button>
)

function FormKode({ kembali, onSelesai }) {
  const [kode, setKode] = useState(['', '', '', '', '', ''])
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const ubah = (i, v) => {
    const bersih = v.toUpperCase().slice(-1)
    const baru = [...kode]
    baru[i] = bersih
    setKode(baru)
    if (bersih && i < 5) document.getElementById(`kode-${i + 1}`)?.focus()
  }
  const hapus = (i, e) => {
    if (e.key === 'Backspace' && !kode[i] && i > 0) document.getElementById(`kode-${i - 1}`)?.focus()
  }
  const tempel = (e) => {
    const teks = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (!teks) return
    e.preventDefault()
    setKode(teks.padEnd(6, ' ').split('').map((c) => (c === ' ' ? '' : c)))
    document.getElementById(`kode-${Math.min(teks.length, 5)}`)?.focus()
  }

  const kirim = async () => {
    const gabung = kode.join('')
    if (gabung.length < 6) return setGalat('Lengkapi 6 karakter kode')
    setSibuk(true)
    setGalat('')
    try {
      await api.aktivasiKode(gabung)
      onSelesai?.()
    } catch (e) {
      setGalat(e.message)
      setKode(['', '', '', '', '', ''])
      document.getElementById('kode-0')?.focus()
    } finally {
      setSibuk(false)
    }
  }

  return (
    <>
      <HeaderForm
        kembali={kembali}
        ikon="🔑"
        judul="Masukkan kode sekolah"
        sub="Minta kode aktivasi ke kepala sekolah atau admin Anda."
      />

      <div className="mb-1 flex justify-center gap-2.5">
        {kode.map((c, i) => (
          <input
            key={i}
            id={`kode-${i}`}
            value={c}
            onChange={(e) => ubah(i, e.target.value)}
            onKeyDown={(e) => hapus(i, e)}
            onPaste={tempel}
            maxLength={1}
            autoFocus={i === 0}
            className="h-[54px] w-11 rounded-[13px] border border-line bg-white text-center text-[22px] font-extrabold uppercase outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          />
        ))}
      </div>
      {galat && <p className="mb-2 min-h-[18px] text-center text-[13px] font-bold text-danger">{galat}</p>}

      <div className="h-4" />
      <button className="bigbtn disabled:opacity-60" onClick={kirim} disabled={sibuk}>
        {sibuk ? 'Memeriksa…' : 'Hubungkan ke sekolah'}
      </button>
    </>
  )
}

function FormDaftar({ kembali, onSelesai }) {
  const [nama, setNama] = useState('')
  const [tahun, setTahun] = useState('2026/2027')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const kirim = async () => {
    if (!nama.trim()) return setGalat('Isi nama sekolah dulu')
    setSibuk(true)
    setGalat('')
    try {
      await api.daftarkanSekolah({ nama: nama.trim(), tahunAjaran: tahun.trim() })
      onSelesai?.()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <>
      <HeaderForm
        kembali={kembali}
        ikon="🏫"
        judul="Daftarkan sekolah Anda"
        sub="Akun ini akan jadi kepala sekolah / admin utama untuk sekolah ini."
      />

      <label className="mb-1.5 block text-[13px] font-bold">Nama sekolah</label>
      <input
        className="field-input mb-3.5"
        placeholder="contoh: TK Islam Al-Falah"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        autoFocus
      />
      <label className="mb-1.5 block text-[13px] font-bold">Tahun ajaran</label>
      <input
        className="field-input mb-4"
        placeholder="contoh: 2026/2027"
        value={tahun}
        onChange={(e) => setTahun(e.target.value)}
      />

      {galat && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {galat}
        </p>
      )}

      <button className="bigbtn disabled:opacity-60" onClick={kirim} disabled={sibuk}>
        {sibuk ? 'Mendaftarkan…' : 'Daftarkan & lanjutkan'}
      </button>
    </>
  )
}

const HeaderForm = ({ kembali, ikon, judul, sub }) => (
  <div className="mb-6">
    <button onClick={kembali} className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-[#F4F7FC]">
      <Ikon.kembali size={17} />
    </button>
    <span className="mb-3.5 inline-grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-xl">
      {ikon}
    </span>
    <h2 className="text-[19px] font-extrabold tracking-tight">{judul}</h2>
    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{sub}</p>
  </div>
)
