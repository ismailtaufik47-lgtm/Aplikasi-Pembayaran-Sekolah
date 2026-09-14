import Avatar from '../components/Avatar.jsx'
import { Chevron, Ikon, Kosong, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { rp } from '../lib/format.js'

export default function Riwayat({ aktif, bukaStruk }) {
  const { pembayaran } = useData()
  const daftar = pembayaran.filter((p) => p.siswaId === aktif.id)
  const total = daftar.reduce((t, p) => t + p.nominal, 0)

  return (
    <>
      <div className="flex items-center gap-3 pb-2 pt-3.5 lg:pt-7">
        <Avatar nama={aktif.nama} jenis={aktif.jenis} avatar={aktif.avatar} foto={aktif.foto} size={42} />
        <div>
          <h1 className="text-xl font-extrabold">Riwayat pembayaran</h1>
          <p className="text-[13px] text-muted">Ketuk transaksi untuk melihat buktinya</p>
        </div>
      </div>

      <div className="flex gap-3 lg:max-w-lg">
        <div className="card flex-1 p-3.5">
          <Tile warna="green"><Ikon.cek size={20} /></Tile>
          <div className="mt-2.5 text-[12.5px] font-semibold text-muted">Total dibayar</div>
          <div className="mt-0.5 text-[17px] font-extrabold tracking-tight">{rp(total)}</div>
        </div>
        <div className="card flex-1 p-3.5">
          <Tile warna="blue"><Ikon.nota size={20} /></Tile>
          <div className="mt-2.5 text-[12.5px] font-semibold text-muted">Transaksi</div>
          <div className="mt-0.5 text-[17px] font-extrabold tracking-tight">{daftar.length}</div>
        </div>
      </div>

      <div className="seghead"><h2>Semua transaksi</h2></div>
      <div className="card lg:grid lg:grid-cols-2 lg:gap-x-7">
        {daftar.length === 0 ? (
          <Kosong>Belum ada pembayaran tercatat untuk ananda.</Kosong>
        ) : (
          daftar.map((p) => (
            <button key={p.id} className="row w-full text-left" onClick={() => bukaStruk(p.id)}>
              <Tile warna="green" className="h-10 w-10 rounded-[13px]"><Ikon.cek size={19} /></Tile>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold">{p.ket}</span>
                <span className="block truncate text-[12.5px] text-muted">{p.waktu} · {p.metode}</span>
              </span>
              <span className="shrink-0 text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
              <Chevron />
            </button>
          ))
        )}
      </div>
    </>
  )
}
