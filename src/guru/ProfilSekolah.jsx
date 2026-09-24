/**
 * Profil sekolah — khusus kepala sekolah. Identitas sekolah (nama,
 * kepala sekolah, alamat) dan daftar rekening yang ditampilkan ke orang tua di
 * portal. Berbeda dari "Jenis biaya" (nominal SPP & kegiatan), yang
 * tetap jadi urusan guru/admin operasional.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ikon, Kosong, PageHead } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'

export default function ProfilSekolah() {
  const { pengaturan, ubahPengaturan, toast } = useData()
  const nav = useNavigate()
  const [nama, setNama] = useState(pengaturan.namaSekolah)
  const [kepala, setKepala] = useState(pengaturan.kepalaSekolah || '')
  const [alamat, setAlamat] = useState(pengaturan.alamat || '')
  const [rekening, setRekening] = useState(pengaturan.rekening || [])
  const [sibuk, setSibuk] = useState(false)
  const [stafTerkunci, setStafTerkunci] = useState([])
  const [memuatTerkunci, setMemuatTerkunci] = useState(true)
  const [membuka, setMembuka] = useState('') // id staf yang lagi diproses

  useEffect(() => {
    setNama(pengaturan.namaSekolah)
    setKepala(pengaturan.kepalaSekolah || '')
    setAlamat(pengaturan.alamat || '')
    setRekening(pengaturan.rekening || [])
  }, [pengaturan])

  useEffect(() => {
    api.daftarStafTerkunci()
      .then(setStafTerkunci)
      .catch(() => {})
      .finally(() => setMemuatTerkunci(false))
  }, [])

  const bukaKunci = async (staf) => {
    setMembuka(staf.id)
    try {
      await api.bukaKunciPin(staf.id)
      setStafTerkunci((lama) => lama.filter((s) => s.id !== staf.id))
      toast(`PIN ${staf.nama} sudah dibuka — dia bisa coba masuk lagi pakai PIN yang sama`)
    } catch (e) {
      toast('Gagal membuka: ' + e.message)
    } finally {
      setMembuka('')
    }
  }

  const ubahRek = (i, kunci, nilai) =>
    setRekening((lama) => lama.map((r, idx) => (idx === i ? { ...r, [kunci]: nilai } : r)))
  const tambahRek = () => setRekening((lama) => [...lama, { bank: '', nomor: '', atasNama: '' }])
  const hapusRek = (i) => setRekening((lama) => lama.filter((_, idx) => idx !== i))

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama sekolah belum diisi')
    setSibuk(true)
    try {
      await ubahPengaturan({
        namaSekolah: nama.trim(),
        kepalaSekolah: kepala.trim(),
        alamat: alamat.trim(),
        rekening: rekening.filter((r) => r.bank.trim() || r.nomor.trim()),
      })
      toast('Profil sekolah disimpan')
    } finally {
      setSibuk(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white border border-line" onClick={() => nav(-1)}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Profil sekolah</h2>
      </div>
      <PageHead judul="Profil sekolah" sub="Identitas sekolah dan rekening yang dilihat orang tua di portal" />

      <div className="card mb-4 lg:mt-4 lg:max-w-lg">
        <label className="mb-1.5 block text-[13px] font-bold">Nama sekolah</label>
        <input className="field-input mb-3.5" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: TK Islam Al-Falah" />
        <label className="mb-1.5 block text-[13px] font-bold">Nama kepala sekolah</label>
        <input
          className="field-input mb-3.5"
          value={kepala}
          onChange={(e) => setKepala(e.target.value)}
          placeholder="contoh: Ibu Hj. Siti Aminah, S.Pd"
        />
        <label className="mb-1.5 block text-[13px] font-bold">Alamat sekolah</label>
        <textarea
          className="field-input min-h-[84px] resize-y leading-relaxed"
          value={alamat}
          onChange={(e) => setAlamat(e.target.value)}
          placeholder="contoh: Jl. Melati No. 12, Kel. Sukajadi, Kec. Sukasari, Kota Bandung"
          rows={3}
        />
        <p className="mt-2.5 text-xs leading-relaxed text-muted">
          Tahun ajaran tidak perlu diisi — aplikasi otomatis memakai tahun ajaran berjalan
          (sekarang <b className="text-ink">{pengaturan.tahunAjaran}</b>) dan berganti sendiri tiap Juli.
        </p>
      </div>

      {!memuatTerkunci && stafTerkunci.length > 0 && (
        <>
          <div className="seghead lg:max-w-lg">
            <h2>PIN terkunci</h2>
            <span className="rounded-pill bg-danger-soft px-3 py-1 text-[12px] font-bold text-danger">
              {stafTerkunci.length} staf
            </span>
          </div>
          <div className="mb-4 lg:max-w-lg">
            {stafTerkunci.map((s) => (
              <div key={s.id} className="card mb-2.5 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-danger-soft text-danger">
                  <Ikon.info size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold">{s.nama}</div>
                  <div className="text-xs text-muted">Salah PIN 3x — {s.peran === 'admin' ? 'Admin' : 'Guru'}</div>
                </div>
                <button
                  className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
                  onClick={() => bukaKunci(s)}
                  disabled={membuka === s.id}
                >
                  {membuka === s.id ? 'Membuka…' : 'Buka kunci'}
                </button>
              </div>
            ))}
          </div>
          <p className="mb-6 text-xs leading-relaxed text-muted lg:max-w-lg">
            Membuka kunci cuma mereset hitungan salah — PIN staf itu <b className="text-ink">tidak berubah</b>,
            jadi mereka bisa langsung coba masuk lagi dengan PIN yang sama seperti biasa. Kalau mereka lupa PIN-nya,
            arahkan masuk pakai Google dulu lalu buat PIN baru lewat Profil Akun.
          </p>
        </>
      )}

      <div className="seghead lg:max-w-lg">
        <h2>Rekening sekolah</h2>
        <button className="text-[13px] font-bold text-brand" onClick={tambahRek}>+ Tambah</button>
      </div>
      <div className="lg:max-w-lg">
        {rekening.length === 0 ? (
          <div className="card"><Kosong>Belum ada rekening. Orang tua akan melihat "hubungi sekolah" di portal.</Kosong></div>
        ) : (
          rekening.map((r, i) => (
            <div key={i} className="card mb-2.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-muted">Rekening {i + 1}</span>
                <button className="text-xs font-bold text-danger" onClick={() => hapusRek(i)}>Hapus</button>
              </div>
              <div className="mb-2.5 flex gap-2.5">
                <input
                  className="field-input w-24 shrink-0"
                  placeholder="Bank"
                  value={r.bank}
                  onChange={(e) => ubahRek(i, 'bank', e.target.value)}
                />
                <input
                  className="field-input flex-1"
                  placeholder="Nomor rekening"
                  value={r.nomor}
                  onChange={(e) => ubahRek(i, 'nomor', e.target.value)}
                />
              </div>
              <input
                className="field-input"
                placeholder="Atas nama"
                value={r.atasNama}
                onChange={(e) => ubahRek(i, 'atasNama', e.target.value)}
              />
            </div>
          ))
        )}
      </div>

      <div className="h-2" />
      <button className="bigbtn disabled:opacity-60 lg:max-w-lg" onClick={simpan} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : 'Simpan profil sekolah'}
      </button>
    </>
  )
}