import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Chevron, Ikon, Kosong, PageHead, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { hariTampil, rp, tanggalISO, tanggalKunci, tanggalPanjang } from '../lib/format.js'

export default function RiwayatBayar() {
  const { pembayaran, siswa } = useData()
  const nav = useNavigate()
  const [tglFilter, setTglFilter] = useState('') // '' = semua tanggal, atau 'YYYY-MM-DD'

  const kunciHariIni = tanggalKunci(new Date().toISOString())
  const hariIni = pembayaran.filter((p) => tanggalKunci(p.tanggal) === kunciHariIni)
  const tunai = pembayaran.filter((p) => p.metode === 'Tunai').length

  /** Daftar tanggal unik yang punya transaksi — untuk dropdown pilihan cepat. */
  const tanggalTersedia = useMemo(() => {
    const set = new Set(pembayaran.map((p) => tanggalKunci(p.tanggal)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [pembayaran])

  /** Transaksi yang lolos filter, dikelompokkan per hari (terbaru dulu). */
  const kelompok = useMemo(() => {
    const dipakai = tglFilter ? pembayaran.filter((p) => tanggalKunci(p.tanggal) === tglFilter) : pembayaran
    const peta = new Map()
    dipakai.forEach((p) => {
      const kunci = tanggalKunci(p.tanggal)
      if (!peta.has(kunci)) peta.set(kunci, { kunci, tanggal: p.tanggal, items: [] })
      peta.get(kunci).items.push(p)
    })
    return [...peta.values()].sort((a, b) => b.kunci.localeCompare(a.kunci))
  }, [pembayaran, tglFilter])

  const totalTampil = kelompok.reduce((t, k) => t + k.items.reduce((x, p) => x + p.nominal, 0), 0)
  const jmlTampil = kelompok.reduce((t, k) => t + k.items.length, 0)

  return (
    <>
      <h1 className="pb-1.5 pt-3.5 text-xl font-extrabold lg:hidden">Riwayat pembayaran</h1>
      <PageHead judul="Riwayat pembayaran" sub="Semua transaksi yang tercatat tahun ajaran ini" />

      <div className="noscroll -mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1.5 pt-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0">
        <Stat warna="green" ikon={<Ikon.cek size={20} />} label="Masuk hari ini" nilai={rp(hariIni.reduce((t, p) => t + p.nominal, 0))} />
        <Stat warna="blue" ikon={<Ikon.jam size={20} />} label="Transaksi" nilai={pembayaran.length} />
        <Stat warna="amber" ikon={<Ikon.dompet size={20} />} label="Tunai / transfer" nilai={`${tunai} / ${pembayaran.length - tunai}`} />
      </div>

      {/* ---------- filter tanggal ---------- */}
      <div className="mb-1 mt-1 flex flex-wrap items-center gap-2.5 lg:mt-3">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-soft">
          <span className="text-muted"><Ikon.kalender size={17} /></span>
          <input
            type="date"
            className="bg-transparent text-[13.5px] font-semibold outline-none"
            value={tglFilter}
            max={tanggalISO()}
            onChange={(e) => setTglFilter(e.target.value)}
          />
        </div>
        {tglFilter && (
          <button
            className="rounded-2xl bg-white border border-brand px-3.5 py-2.5 text-[13px] font-bold text-brand"
            onClick={() => setTglFilter('')}
          >
            Tampilkan semua
          </button>
        )}
        {!tglFilter && tanggalTersedia.length > 0 && (
          <div className="noscroll flex gap-2 overflow-x-auto">
            {tanggalTersedia.slice(0, 6).map((t) => (
              <button
                key={t}
                onClick={() => setTglFilter(t)}
                className="whitespace-nowrap rounded-pill bg-white border border-line px-3 py-2 text-[12.5px] font-bold text-muted"
              >
                {hariTampil(new Date(t + 'T00:00:00').toISOString())}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="seghead">
        <h2>{tglFilter ? tanggalPanjang(new Date(tglFilter + 'T00:00:00')) : 'Semua transaksi'}</h2>
        {jmlTampil > 0 && <span className="text-[12.5px] font-bold text-muted">{jmlTampil} transaksi · {rp(totalTampil)}</span>}
      </div>

      {jmlTampil === 0 ? (
        <div className="card">
          <Kosong>
            {pembayaran.length === 0
              ? 'Belum ada pembayaran tercatat.'
              : 'Tidak ada transaksi pada tanggal ini.'}
          </Kosong>
        </div>
      ) : (
        kelompok.map((k) => {
          const totalHari = k.items.reduce((t, p) => t + p.nominal, 0)
          return (
            <div key={k.kunci} className="mb-4">
              {/* Judul hari hanya perlu kalau sedang lihat "semua" (banyak kelompok).
                  Kalau filter ke satu tanggal, sudah ada di judul section di atas. */}
              {!tglFilter && (
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span className="text-[13px] font-extrabold text-ink">{hariTampil(k.tanggal)}</span>
                  <span className="text-[12.5px] font-bold text-muted">{k.items.length} transaksi · {rp(totalHari)}</span>
                </div>
              )}
              <div className="card">
                {k.items.map((p) => {
                  const s = siswa.find((x) => x.id === p.siswaId)
                  if (!s) return null
                  return (
                    <button key={p.id} className="row w-full text-left lg:rounded-xl lg:px-4 lg:hover:bg-[#FAFBFF]" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                      <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold">{s.nama}</span>
                        <span className="block truncate text-[12.5px] text-muted">{p.ket} · {p.waktu}</span>
                      </span>
                      <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                        <span className="text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                        <Chip warna={p.metode === 'Tunai' ? 'green' : 'blue'}>{p.metode}</Chip>
                      </span>
                      <Chevron />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </>
  )
}

const Stat = ({ warna, ikon, label, nilai }) => (
  <div className="card min-w-[150px] p-[15px] lg:min-w-0 lg:p-[18px]">
    <Tile warna={warna}>{ikon}</Tile>
    <div className="mt-3 text-[13px] font-medium text-muted">{label}</div>
    <div className="mt-0.5 text-[21px] font-extrabold tracking-tight">{nilai}</div>
  </div>
)