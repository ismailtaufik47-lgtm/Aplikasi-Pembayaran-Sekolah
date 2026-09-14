/**
 * Profil akun pribadi — dipakai guru/TU maupun kepala sekolah.
 * Cuma nama tampilan yang bisa diubah dari sini (peran & sekolah
 * ditentukan lewat kode aktivasi / pendaftaran, bukan diri sendiri).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ikon, PageHead } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'

const labelPeran = { kepala: 'Kepala sekolah', admin: 'Admin', guru: 'Guru' }

export default function ProfilAkun() {
  const { petugas, peran, pengaturan, modeDemo, ubahNamaSaya, toast } = useData()
  const { keluar } = useAuth()
  const nav = useNavigate()
  const [nama, setNama] = useState(petugas)
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => setNama(petugas), [petugas])
  const berubah = nama.trim() && nama.trim() !== petugas

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama tidak boleh kosong')
    setSibuk(true)
    try {
      await ubahNamaSaya(nama.trim())
      toast('Nama disimpan')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white shadow-soft" onClick={() => nav(-1)}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Profil akun</h2>
      </div>
      <PageHead judul="Profil akun" sub="Nama tampilan yang muncul di kartu pembayaran dan struk" />

      <div className="card mb-4 flex items-center gap-3.5 lg:mt-4 lg:max-w-md">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-rose-soft text-xl font-extrabold text-rose">
          {(petugas || 'G')[0]}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold">{petugas || '—'}</div>
          <div className="mt-1">
            <span className="inline-block rounded-pill bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
              {labelPeran[peran] || peran}
            </span>
          </div>
        </div>
      </div>

      <div className="card mb-4 lg:max-w-md">
        <label className="mb-1.5 block text-[13px] font-bold">Nama tampilan</label>
        <input
          className="field-input mb-3.5"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama Anda"
        />
        <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={!berubah || sibuk}>
          {sibuk ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
      </div>

      <div className="card mb-4 lg:max-w-md">
        <div className="row">
          <span className="tile bg-brand-soft text-brand"><Ikon.rumah size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold">{pengaturan?.namaSekolah}</div>
            <div className="text-xs text-muted">Tahun ajaran {pengaturan?.tahunAjaran}</div>
          </div>
        </div>
      </div>

      {!modeDemo && (
        <button
          className="w-full max-w-md rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={keluar}
        >
          Keluar
        </button>
      )}
      {modeDemo && <p className="text-center text-[12px] text-muted">Mode demo — belum tersambung ke Supabase.</p>}
    </>
  )
}
