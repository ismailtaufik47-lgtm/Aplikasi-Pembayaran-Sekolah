/**
 * Dibuka dari satu kartu bulan/kegiatan di kartu pembayaran siswa.
 * Menunjukkan progres pembayaran periode itu, daftar transaksinya
 * (karena satu periode boleh dicicil lewat beberapa transaksi), dan
 * form untuk menambah pembayaran baru — bisa penuh atau sebagian.
 *
 * `readOnly` (dipakai untuk peran kepala sekolah): sembunyikan tombol
 * catat/hapus pembayaran, tampilkan progres & riwayat saja.
 */
import { useEffect, useState } from 'react'
import { Ikon, Kosong, Sheet, Track } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, dibayarKegiatan, dibayarSpp, persenBayar, rp, statusSpp, tanggalISO } from '../lib/format.js'

export default function SheetPeriode({ buka, tutup, siswaId, jenis, indeks, readOnly = false }) {
  const { siswa, biaya, pengaturan, pembayaran, catatPembayaran, batalkanPembayaran, toast } = useData()
  const [mode, setMode] = useState('lihat') // 'lihat' | 'bayar' | 'sukses'
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('Tunai')
  const [tanggal, setTanggal] = useState(tanggalISO())
  const [hapusId, setHapusId] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const [sukses, setSukses] = useState(null) // { nominal, lunasSetelah } | null

  useEffect(() => {
    if (!buka) return
    setMode('lihat')
    setMetode('Tunai')
    setTanggal(tanggalISO())
    setHapusId(null)
    setSukses(null)
  }, [buka, siswaId, jenis, indeks])

  const s = siswa.find((x) => x.id === siswaId)
  if (!buka || !s || jenis == null || indeks == null) return null

  const judul = jenis === 'spp' ? BULAN[indeks] : biaya[indeks]?.nama || ''
  const target = jenis === 'spp' ? pengaturan.sppNominal : biaya[indeks]?.nominal || 0
  const dibayar = jenis === 'spp' ? dibayarSpp(s, indeks) : dibayarKegiatan(s, indeks)
  const sisa = Math.max(0, target - dibayar)
  const lunas = dibayar >= target
  const status = jenis === 'spp'
    ? statusSpp(dibayar, target, indeks, bulanBerjalan(), pengaturan.tanggalJatuhTempo)
    : (lunas ? 'lunas' : dibayar > 0 ? 'sebagian' : 'belum-bayar')
  const warnaStatus = { lunas: '#22C55E', sebagian: '#F5A524', nunggak: '#EF4444', 'belum-bayar': '#F5A524', menunggu: '#C9D0DC' }[status]
  const transaksi = pembayaran.filter((p) => p.siswaId === siswaId && p.jenis === jenis && p.indeks === indeks)
  const nominalAngka = Number(nominal) || 0
  const lebihBayar = nominalAngka > sisa && sisa > 0

  const bukaFormBayar = () => {
    setNominal(sisa || target)
    setMode('bayar')
  }

  const simpanBayar = async () => {
    const n = Number(nominal) || 0
    if (n <= 0) return toast('Isi nominal dulu')
    setSibuk(true)
    try {
      await catatPembayaran({ siswaId, jenis, indeks, nominal: n, metode, tanggal })
      setSukses({ nominal: n, lunasSetelah: n >= sisa })
      setMode('sukses')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  const hapusTransaksi = async (id) => {
    setHapusId(null)
    try {
      await batalkanPembayaran(id)
      toast('Pembayaran dibatalkan')
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul={mode === 'bayar' ? 'Catat pembayaran' : mode === 'sukses' ? undefined : jenis === 'spp' ? 'SPP ' + judul : judul}
      lead={mode === 'bayar' ? `${s.nama} · sisa ${rp(sisa)}` : mode === 'sukses' ? undefined : s.nama}
    >
      {mode === 'sukses' ? (
        <div className="pb-1 pt-3.5 text-center">
          <div className="mx-auto mb-3.5 grid h-[76px] w-[76px] animate-pop place-items-center rounded-full bg-ok text-white" style={{ colorScheme: 'light' }}>
            <Ikon.cek size={34} />
          </div>
          <h3 className="text-[18px] font-extrabold">
            {sukses?.lunasSetelah ? (jenis === 'spp' ? `SPP ${judul}` : judul) + ' lunas' : 'Pembayaran sebagian tersimpan'}
          </h3>
          <p className="mb-5 mt-1 text-[13.5px] text-muted">
            {s.nama}
            <br />
            <b className="text-[16px] text-ink">{rp(sukses?.nominal || 0)}</b> · {metode}
            {!sukses?.lunasSetelah && (
              <>
                <br />
                Sisa {rp(Math.max(0, sisa - (sukses?.nominal || 0)))}
              </>
            )}
          </p>
          <button className="bigbtn" onClick={tutup}>Selesai</button>
        </div>
      ) : mode === 'lihat' ? (
        <>
          <div className="mb-5 rounded-2xl bg-canvas p-4">
            <div className="flex items-center justify-between text-[13px] font-bold">
              <span>{rp(dibayar)} dibayar</span>
              <span className="text-muted">dari {rp(target)}</span>
            </div>
            <div className="mt-2.5">
              <Track
                persen={persenBayar(dibayar, target)}
                warna={warnaStatus}
                tinggi={8}
              />
            </div>
            {!lunas && (
              <div className="mt-2.5 text-[13px] font-bold" style={{ color: status === 'menunggu' ? '#8A93A6' : warnaStatus }}>
                Sisa {rp(sisa)}
              </div>
            )}
          </div>

          {!readOnly && !lunas && (
            <button className="bigbtn mb-5" onClick={bukaFormBayar}>
              {dibayar > 0 ? 'Lanjutkan bayar sisa' : 'Catat pembayaran'}
            </button>
          )}

          <div className="mb-2 text-[13px] font-bold text-muted">Riwayat transaksi</div>
          {transaksi.length === 0 ? (
            <Kosong>Belum ada pembayaran tercatat untuk ini.</Kosong>
          ) : (
            <div className="card">
              {transaksi.map((t) => (
                <div key={t.id}>
                  {hapusId === t.id ? (
                    <div className="row items-center gap-2.5">
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-danger">
                        Hapus pembayaran {rp(t.nominal)} ini?
                      </span>
                      <button
                        className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white"
                        onClick={() => hapusTransaksi(t.id)}
                      >
                        Ya, hapus
                      </button>
                      <button
                        className="shrink-0 rounded-lg bg-[#F1F2F6] px-3 py-1.5 text-xs font-bold text-muted"
                        onClick={() => setHapusId(null)}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="row">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok text-white" style={{ colorScheme: 'light' }}>
                        <Ikon.cek size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold">{rp(t.nominal)}</span>
                        <span className="block text-xs text-muted">{t.waktu} · {t.metode}</span>
                      </span>
                      {!readOnly && (
                        <button
                          className="shrink-0 rounded-lg bg-[#F1F2F6] px-2.5 py-1.5 text-xs font-bold text-muted"
                          onClick={() => setHapusId(t.id)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="mb-1.5 block text-[13px] font-bold">Jumlah dibayar</label>
          <InputNominal className="mb-1.5" value={nominal} onChange={setNominal} placeholder={String(sisa || target)} />
          {lebihBayar ? (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-xs font-semibold text-warn-deep">
              <Ikon.peringatan size={15} />
              <span>
                Nominal ini {rp(nominalAngka - sisa)} lebih besar dari sisa tagihan ({rp(sisa)}).
                Tetap bisa disimpan sebagai kelebihan bayar — periksa lagi sebelum lanjut.
              </span>
            </p>
          ) : (
            <p className="mb-4 text-xs font-semibold text-muted">
              Sisa tagihan {rp(sisa)}. Boleh diisi kurang dari itu untuk bayar sebagian.
            </p>
          )}

          <label className="mb-1.5 block text-[13px] font-bold">Metode pembayaran</label>
          <div className="mb-4 flex gap-2.5">
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
          {tanggal !== tanggalISO() ? (
            <p className="mb-4 text-xs font-semibold text-muted">
              Dicatat mundur — tanggal transaksi disimpan sesuai tanggal ini, bukan hari ini.
            </p>
          ) : (
            <div className="mb-4" />
          )}

          <button className="bigbtn disabled:opacity-60" onClick={simpanBayar} disabled={sibuk}>
            {sibuk ? 'Menyimpan…' : lebihBayar ? 'Simpan meski lebih besar dari sisa' : 'Simpan pembayaran'}
          </button>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={() => setMode('lihat')}>Batal</button>
        </>
      )}
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