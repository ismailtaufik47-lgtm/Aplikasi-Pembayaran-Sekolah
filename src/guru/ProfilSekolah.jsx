/**
 * Profil sekolah — khusus kepala sekolah. Identitas sekolah (nama,
 * tahun ajaran) dan daftar rekening yang ditampilkan ke orang tua di
 * portal. Berbeda dari "Jenis biaya" (nominal SPP & kegiatan), yang
 * tetap jadi urusan guru/admin operasional.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ikon, Kosong, PageHead } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'

export default function ProfilSekolah() {
  const { pengaturan, ubahPengaturan, toast } = useData()
  const nav = useNavigate()
  const [nama, setNama] = useState(pengaturan.namaSekolah)
  const [tahun, setTahun] = useState(pengaturan.tahunAjaran)
  const [rekening, setRekening] = useState(pengaturan.rekening || [])
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    setNama(pengaturan.namaSekolah)
    setTahun(pengaturan.tahunAjaran)
    setRekening(pengaturan.rekening || [])
  }, [pengaturan])

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
        tahunAjaran: tahun.trim(),
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
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white shadow-soft" onClick={() => nav(-1)}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Profil sekolah</h2>
      </div>
      <PageHead judul="Profil sekolah" sub="Identitas sekolah dan rekening yang dilihat orang tua di portal" />

      <div className="card mb-4 lg:mt-4 lg:max-w-lg">
        <label className="mb-1.5 block text-[13px] font-bold">Nama sekolah</label>
        <input className="field-input mb-3.5" value={nama} onChange={(e) => setNama(e.target.value)} />
        <label className="mb-1.5 block text-[13px] font-bold">Tahun ajaran</label>
        <input className="field-input" value={tahun} onChange={(e) => setTahun(e.target.value)} placeholder="2026/2027" />
      </div>

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
