import { useEffect, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Ikon, Sheet } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, dibayarKegiatan, dibayarSpp, rp, tanggalISO } from '../lib/format.js'

export default function SheetCatat({ buka, awal, tutup }) {
  const { siswa, biaya, pengaturan, catatPembayaran, toast } = useData()
  const kini = bulanBerjalan()
  const [siswaId, setSiswaId] = useState(siswa[0]?.id)
  const [jenis, setJenis] = useState('spp')
  const [indeks, setIndeks] = useState(kini)
  const [nominal, setNominal] = useState(pengaturan.sppNominal)
  const [metode, setMetode] = useState('Tunai')
  const [tanggal, setTanggal] = useState(tanggalISO())
  const [sukses, setSukses] = useState(null)

  /** Sisa tagihan untuk kombinasi siswa+jenis+periode saat ini — dipakai
   *  sebagai nominal default, supaya cicilan yang sudah berjalan tidak
   *  tertagih dobel kalau guru asal isi nominal penuh lagi. */
  const sisaUntuk = (idSiswa, j, i) => {
    const x = siswa.find((y) => y.id === idSiswa)
    const target = j === 'spp' ? pengaturan.sppNominal : biaya[i]?.nominal || 0
    if (!x) return target
    const dibayar = j === 'spp' ? dibayarSpp(x, i) : dibayarKegiatan(x, i)
    return Math.max(0, target - dibayar)
  }

  useEffect(() => {
    if (!buka) return
    const idAwal = awal?.siswaId || siswa[0]?.id
    setSiswaId(idAwal)
    setJenis('spp')
    setIndeks(kini)
    setNominal(sisaUntuk(idAwal, 'spp', kini) || pengaturan.sppNominal)
    setMetode('Tunai')
    setTanggal(tanggalISO())
    setSukses(null)
  }, [buka, awal])

  const gantiSiswa = (id) => {
    setSiswaId(id)
    setNominal(sisaUntuk(id, jenis, indeks) || (jenis === 'spp' ? pengaturan.sppNominal : biaya[indeks]?.nominal || 0))
  }
  const gantiJenis = (j) => {
    const i = j === 'spp' ? kini : 0
    setJenis(j)
    setIndeks(i)
    setNominal(sisaUntuk(siswaId, j, i) || (j === 'spp' ? pengaturan.sppNominal : biaya[0]?.nominal || 0))
  }
  const gantiIndeks = (i) => {
    setIndeks(i)
    setNominal(sisaUntuk(siswaId, jenis, i) || (jenis === 'spp' ? pengaturan.sppNominal : biaya[i]?.nominal || 0))
  }

  const s = siswa.find((x) => x.id === siswaId)
  const target = jenis === 'spp' ? pengaturan.sppNominal : biaya[indeks]?.nominal || 0
  const dibayarSaatIni = s ? (jenis === 'spp' ? dibayarSpp(s, indeks) : dibayarKegiatan(s, indeks)) : 0
  const sisaSaatIni = Math.max(0, target - dibayarSaatIni)

  const simpan = async () => {
    const n = Number(nominal) || 0
    if (n <= 0) return toast('Isi nominal dulu')
    try {
      const baris = await catatPembayaran({ siswaId, jenis, indeks: Number(indeks), nominal: n, metode, tanggal })
      setSukses({ ...baris, lunasSetelah: dibayarSaatIni + n >= target })
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  if (sukses) {
    return (
      <Sheet buka={buka} tutup={tutup}>
        <div className="pb-1 pt-3.5 text-center">
          <div className="mx-auto mb-3.5 grid h-[76px] w-[76px] animate-pop place-items-center rounded-full bg-ok text-white" style={{ colorScheme: 'light' }}>
            <Ikon.cek size={34} />
          </div>
          <h3 className="text-[18px] font-extrabold">
            {sukses.lunasSetelah ? 'Pembayaran tersimpan · lunas' : 'Pembayaran sebagian tersimpan'}
          </h3>
          <p className="mb-5 mt-1 text-[13.5px] text-muted">
            {s?.nama} · {sukses.ket}
            <br />
            <b className="text-[16px] text-ink">{rp(sukses.nominal)}</b> · {sukses.metode}
          </p>
          <button className="bigbtn" onClick={() => { tutup(); toast('Bukti pembayaran dikirim ke orang tua') }}>
            Kirim bukti ke orang tua
          </button>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={tutup}>Selesai</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Catat pembayaran" lead="Pilih siswa dan jenis biayanya.">
      <label className="mb-1.5 block text-[13px] font-bold">Siswa</label>
      <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-line bg-white px-3 py-2">
        {s && <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={38} />}
        <select
          className="flex-1 bg-transparent py-1.5 font-semibold outline-none"
          value={siswaId}
          onChange={(e) => gantiSiswa(e.target.value)}
        >
          {siswa.map((x) => (
            <option key={x.id} value={x.id}>{x.nama} — Kelas {x.kelas}</option>
          ))}
        </select>
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">Jenis biaya</label>
      <div className="mb-3.5 flex gap-2.5">
        <Pilih on={jenis === 'spp'} onClick={() => gantiJenis('spp')}>Iuran SPP</Pilih>
        <Pilih on={jenis === 'kegiatan'} onClick={() => gantiJenis('kegiatan')}>Biaya kegiatan</Pilih>
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">{jenis === 'spp' ? 'Bulan' : 'Kegiatan'}</label>
      <select className="field-input mb-3.5" value={indeks} onChange={(e) => gantiIndeks(Number(e.target.value))}>
        {jenis === 'spp'
          ? BULAN.map((b, i) => <option key={b} value={i}>{b}</option>)
          : biaya.map((b, i) => <option key={b.id} value={i}>{b.nama}</option>)}
      </select>

      <label className="mb-1.5 block text-[13px] font-bold">Jumlah dibayar</label>
      {dibayarSaatIni > 0 && (
        <p className="mb-1.5 text-xs font-semibold text-warn">
          Sudah dibayar {rp(dibayarSaatIni)} dari {rp(target)} · sisa {rp(sisaSaatIni)}
        </p>
      )}
      <InputNominal className="mb-1.5" value={nominal} onChange={setNominal} placeholder="150.000" />
      {Number(nominal) > sisaSaatIni && sisaSaatIni > 0 ? (
        <p className="mb-3.5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-xs font-semibold text-warn-deep">
          <Ikon.peringatan size={15} />
          <span>
            Nominal ini {rp(Number(nominal) - sisaSaatIni)} lebih besar dari sisa tagihan ({rp(sisaSaatIni)}).
            Tetap bisa disimpan sebagai kelebihan bayar.
          </span>
        </p>
      ) : (
        Number(nominal) > 0 && Number(nominal) < sisaSaatIni && (
          <p className="-mt-2.5 mb-3.5 text-xs font-semibold text-muted">
            Ini pembayaran sebagian — sisa setelahnya {rp(sisaSaatIni - Number(nominal))}.
          </p>
        )
      )}

      <label className="mb-1.5 block text-[13px] font-bold">Metode pembayaran</label>
      <div className="mb-3.5 flex gap-2.5">
        <Pilih on={metode === 'Tunai'} onClick={() => setMetode('Tunai')}>Tunai</Pilih>
        <Pilih on={metode === 'Transfer'} onClick={() => setMetode('Transfer')}>Transfer</Pilih>
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">Tanggal pembayaran</label>
      <input
        type="date"
        className="field-input mb-1.5"
        value={tanggal}
        max={tanggalISO()}
        onChange={(e) => setTanggal(e.target.value)}
      />
      {tanggal !== tanggalISO() && (
        <p className="mb-4 text-xs font-semibold text-muted">
          Dicatat mundur — tanggal transaksi disimpan sesuai tanggal ini, bukan hari ini.
        </p>
      )}
      {tanggal === tanggalISO() && <div className="mb-4" />}

      <button className="bigbtn" onClick={simpan}>Simpan pembayaran</button>
    </Sheet>
  )
}

const Pilih = ({ on, children, ...p }) => (
  <button
    {...p}
    className={`flex-1 rounded-[14px] border py-3 text-[13.5px] font-bold ${
      on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'
    }`}
  >
    {children}
  </button>
)