import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BtnKecil, Ikon, Kosong, PageHead, Sheet, Tile } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { AKHIR_BULAN, jatuhTempoAkhirBulan, rp } from '../lib/format.js'

export default function JenisBiaya() {
  const { biaya, pengaturan, tambahBiaya, hapusBiaya, ubahPengaturan, toast } = useData()
  const nav = useNavigate()
  const [buka, setBuka] = useState(false)
  const [nama, setNama] = useState('')
  const [nominal, setNominal] = useState('')
  const [spp, setSpp] = useState(pengaturan.sppNominal)
  const [tempo, setTempo] = useState(pengaturan.tanggalJatuhTempo)
  const warna = ['blue', 'green', 'amber', 'grape', 'rose', 'red']

  const simpan = async () => {
    const n = Number(nominal)
    if (!nama.trim() || !n) return toast('Isi nama kegiatan dan nominalnya')
    await tambahBiaya({ nama: nama.trim(), nominal: n })
    setNama(''); setNominal(''); setBuka(false)
    toast(`${nama.trim()} ditambahkan ke semua kartu siswa`)
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white border border-line" onClick={() => nav('/guru')}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Jenis biaya</h2>
      </div>
      <PageHead
        judul="Jenis biaya"
        sub="Daftar biaya di sini dipakai untuk semua siswa di sekolah ini"
        aksi={<BtnKecil utama onClick={() => setBuka(true)}><Ikon.plus size={16} />Tambah kegiatan</BtnKecil>}
      />
      <p className="mb-4 text-[13.5px] text-muted lg:hidden">
        Daftar biaya di sini dipakai untuk semua siswa. Setiap sekolah bisa mengaturnya sendiri sesuai kegiatan masing-masing.
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:pt-4">
       <div className="card mb-4">
        <div className="mb-3.5 flex items-center gap-3">
          <Tile warna="blue"><Ikon.kalender size={20} /></Tile>
          <div>
            <div className="font-extrabold">Iuran SPP bulanan</div>
            <div className="text-[12.5px] text-muted">Siklus Juli–Juni</div>
          </div>
        </div>
        <label className="mb-1.5 block text-[13px] font-bold">Nominal per bulan</label>
        <InputNominal className="mb-3.5" value={spp} onChange={setSpp} placeholder="150.000" />
        <label className="mb-1.5 block text-[13px] font-bold">Jatuh tempo setiap bulan</label>
        <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-[#F5F7FB] p-1" role="radiogroup">
          {[
            { akhir: false, label: '📅 Tanggal tertentu' },
            { akhir: true, label: '🗓️ Akhir bulan' },
          ].map((o) => {
            const on = jatuhTempoAkhirBulan(tempo) === o.akhir
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => setTempo(o.akhir ? AKHIR_BULAN : 10)}
                className={`rounded-xl py-2.5 text-[13px] font-extrabold transition ${on ? 'bg-white text-brand shadow-soft' : 'text-muted'}`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {jatuhTempoAkhirBulan(tempo) ? (
          <p className="mb-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-brand">
            Otomatis mengikuti hari terakhir tiap bulan — 30 September, 31 Oktober, 28/29 Februari, dan seterusnya.
          </p>
        ) : (
          <>
            <select className="field-input mb-1.5" value={tempo} onChange={(e) => setTempo(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((t) => (
                <option key={t} value={t}>Tanggal {t}</option>
              ))}
            </select>
            <p className="mb-4 text-xs text-muted">Maksimal tanggal 28 supaya berlaku di semua bulan. Untuk tanggal 30/31 pilih "Akhir bulan".</p>
          </>
        )}
        <button
          className="bigbtn"
          onClick={async () => {
            await ubahPengaturan({ sppNominal: Number(spp) || 0, tanggalJatuhTempo: jatuhTempoAkhirBulan(tempo) ? AKHIR_BULAN : Math.min(28, Math.max(1, Number(tempo) || 10)) })
            toast('Pengaturan SPP disimpan')
          }}
        >
          Simpan
        </button>
       </div>

       <div>
      <div className="seghead lg:mt-0">
        <h2>Biaya kegiatan</h2>
        <button className="text-[13px] font-bold text-brand lg:hidden" onClick={() => setBuka(true)}>+ Tambah</button>
      </div>
      <div className="card">
        {biaya.length === 0 ? (
          <Kosong>Belum ada biaya kegiatan.</Kosong>
        ) : (
          biaya.map((b, i) => (
            <div key={b.id} className="row">
              <Tile warna={warna[i % warna.length]} className="h-10 w-10 rounded-[13px] font-extrabold">{b.nama[0]}</Tile>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold">{b.nama}</div>
                <div className="text-[12.5px] text-muted">{rp(b.nominal)} · sekali bayar</div>
              </div>
              <button
                className="shrink-0 rounded-xl bg-[#F1F2F6] px-3 py-2 text-xs font-bold text-muted"
                onClick={async () => { await hapusBiaya(i); toast(`${b.nama} dihapus`) }}
              >
                Hapus
              </button>
            </div>
          ))
        )}
      </div>
       </div>
      </div>

      <Sheet buka={buka} tutup={() => setBuka(false)} judul="Tambah biaya kegiatan" lead="Biaya ini otomatis muncul di kartu semua siswa.">
        <label className="mb-1.5 block text-[13px] font-bold">Nama kegiatan</label>
        <input className="field-input mb-3.5" placeholder="mis. Manasik haji" value={nama} onChange={(e) => setNama(e.target.value)} />
        <label className="mb-1.5 block text-[13px] font-bold">Nominal</label>
        <InputNominal className="mb-4" value={nominal} onChange={setNominal} placeholder="150.000" />
        <button className="bigbtn" onClick={simpan}>Tambahkan</button>
      </Sheet>
    </>
  )
}