/**
 * Pengaturan penerbit — identitas usaha yang tercetak di INVOICE dan
 * KUITANSI SEWA untuk sekolah: nama usaha, alamat, kontak, rekening
 * tujuan transfer, dan tanda tangan + stempel.
 *
 * Rekening & WA di sini juga dipakai halaman Langganan sekolah, jadi
 * tidak perlu lagi mengedit REKENING_BANK / WA_PENGEMBANG di kode.
 */
import { useEffect, useState } from 'react'
import { Kosong, Muat, PageHead } from '../components/ui.jsx'
import EditorTtd from '../components/EditorTtd.jsx'
import { useData } from '../lib/store.jsx'
import * as api from './apiAdmin.js'

const KOSONG = {
  namaUsaha: '', alamat: '', wa: '', email: '', rekening: [],
  namaPenandatangan: '', jabatan: 'Pemilik', ttd: null, stempel: null,
}

const Isian = ({ label, children, catatan }) => (
  <div className="mb-3.5">
    <label className="mb-1.5 block text-[13px] font-bold">{label}</label>
    {children}
    {catatan && <p className="mt-1 text-[11.5px] font-semibold text-muted">{catatan}</p>}
  </div>
)

export default function Pengaturan() {
  const { toast } = useData()
  const [f, setF] = useState(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = () => {
    setGalat('')
    api.dataPenerbit()
      .then((d) => setF({ ...KOSONG, ...(d || {}), rekening: d?.rekening || [] }))
      .catch((e) => setGalat(e.message))
  }
  useEffect(muat, [])

  if (galat) return <Muat aksi={muat}>Gagal memuat pengaturan: {galat}</Muat>
  if (!f) return <Muat>Memuat pengaturan…</Muat>

  const ubah = (u) => setF((x) => ({ ...x, ...u }))
  const ubahRek = (i, k, v) => ubah({ rekening: f.rekening.map((r, j) => (j === i ? { ...r, [k]: v } : r)) })

  const simpan = async () => {
    if (!f.namaUsaha.trim()) return toast('Nama usaha belum diisi')
    setSibuk(true)
    try {
      await api.simpanPenerbit({ ...f, rekening: f.rekening.filter((r) => r.bank?.trim() || r.nomor?.trim()) })
      toast('Pengaturan penerbit disimpan')
    } catch (e) {
      toast('Gagal menyimpan: ' + e.message)
    } finally {
      setSibuk(false)
    }
  }

  const contoh = async () => {
    const { buatInvoiceSewa, periodeBerikut } = await import('../lib/dokumen.js')
    const per = periodeBerikut(null, 1)
    const { doc } = buatInvoiceSewa({
      penerbit: f,
      sekolah: { id: 'contoh', nama: 'TK Contoh Ceria', alamat: 'Jl. Contoh No. 1, Bandung', kepalaSekolah: 'Ibu Kepala Sekolah' },
      jumlahSiswa: 60, tarif: 5000, bulan: 1, periodeMulai: per.mulai, periodeSampai: per.sampai, jatuhTempo: per.jatuhTempo,
    })
    const url = doc.output('bloburl')
    if (!window.open(url, '_blank')) doc.save('Contoh-invoice.pdf')
  }

  return (
    <>
      <div className="pb-1.5 pt-3.5 lg:hidden">
        <h1 className="text-xl font-extrabold">Pengaturan</h1>
      </div>
      <PageHead judul="Pengaturan penerbit" sub="Identitas usaha di invoice & kuitansi sewa yang diterima sekolah" />

      <div className="mt-2 grid gap-4 lg:mt-4 lg:grid-cols-2 lg:items-start">
        <div className="card">
          <div className="mb-3 text-[14px] font-extrabold">Identitas usaha</div>
          <Isian label="Nama usaha / penerbit">
            <input className="field-input" value={f.namaUsaha} onChange={(e) => ubah({ namaUsaha: e.target.value })} placeholder="contoh: Kipo Digital" />
          </Isian>
          <Isian label="Alamat">
            <textarea className="field-input min-h-[70px] resize-y" rows={2} value={f.alamat || ''} onChange={(e) => ubah({ alamat: e.target.value })} placeholder="contoh: Jl. Merdeka No. 10, Bandung" />
          </Isian>
          <div className="grid gap-3 sm:grid-cols-2">
            <Isian label="WhatsApp" catatan="Dipakai tombol konfirmasi di halaman Langganan sekolah">
              <input className="field-input" inputMode="tel" value={f.wa || ''} onChange={(e) => ubah({ wa: e.target.value })} placeholder="0812xxxxxxx" />
            </Isian>
            <Isian label="Email (opsional)">
              <input className="field-input" type="email" value={f.email || ''} onChange={(e) => ubah({ email: e.target.value })} placeholder="halo@usaha.id" />
            </Isian>
          </div>

          <div className="mb-2 mt-1 flex items-center justify-between">
            <span className="text-[13px] font-bold">Rekening tujuan transfer</span>
            <button className="text-[13px] font-bold text-brand" onClick={() => ubah({ rekening: [...f.rekening, { bank: '', nomor: '', atasNama: '' }] })}>
              + Tambah
            </button>
          </div>
          {f.rekening.length === 0 ? (
            <div className="rounded-2xl bg-[#F7F8FC]"><Kosong>Belum ada rekening. Invoice akan menulis "hubungi kami".</Kosong></div>
          ) : (
            f.rekening.map((r, i) => (
              <div key={i} className="mb-2 flex flex-wrap gap-2 rounded-2xl bg-[#F7F8FC] p-2.5">
                <input className="field-input w-20" placeholder="Bank" value={r.bank} onChange={(e) => ubahRek(i, 'bank', e.target.value)} />
                <input className="field-input min-w-[130px] flex-1" placeholder="Nomor rekening" value={r.nomor} onChange={(e) => ubahRek(i, 'nomor', e.target.value)} />
                <input className="field-input min-w-[130px] flex-1" placeholder="Atas nama" value={r.atasNama} onChange={(e) => ubahRek(i, 'atasNama', e.target.value)} />
                <button className="px-1.5 text-[12.5px] font-bold text-danger" onClick={() => ubah({ rekening: f.rekening.filter((_, j) => j !== i) })}>
                  Hapus
                </button>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="mb-3 text-[14px] font-extrabold">Tanda tangan dokumen</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Isian label="Nama penanda tangan">
              <input className="field-input" value={f.namaPenandatangan || ''} onChange={(e) => ubah({ namaPenandatangan: e.target.value })} placeholder="contoh: Kipo" />
            </Isian>
            <Isian label="Jabatan">
              <input className="field-input" value={f.jabatan || ''} onChange={(e) => ubah({ jabatan: e.target.value })} placeholder="Pemilik" />
            </Isian>
          </div>
          <EditorTtd nilai={f} ubah={ubah} toast={toast} />
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row lg:max-w-xl">
        <button className="bigbtn-ghost flex-1" onClick={contoh}>Lihat contoh invoice</button>
        <button className="bigbtn flex-1 disabled:opacity-60" onClick={simpan} disabled={sibuk}>
          {sibuk ? 'Menyimpan…' : 'Simpan pengaturan'}
        </button>
      </div>
    </>
  )
}