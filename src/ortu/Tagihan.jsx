import { useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Chevron, Chip, Kosong, Segment, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { BULAN, bulanBerjalan, dibayarKegiatan, labelJatuhTempoPeriode, dibayarSpp, persenBayar, rp, statusSpp, tanggalKegiatan } from '../lib/format.js'

export default function Tagihan({ aktif, bukaCaraBayar, bukaKegiatan }) {
  const { pengaturan, biaya } = useData()
  // ?tab=kegiatan → langsung buka tab Biaya kegiatan (dipakai dari Beranda)
  const [seg, setSeg] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'kegiatan' ? 'keg' : 'spp'))
  const kini = bulanBerjalan()
  const a = aktif

  return (
    <>
      <div className="flex items-center gap-3 pb-0.5 pt-3.5 lg:pt-7">
        <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={42} />
        <div>
          <h1 className="text-xl font-extrabold">Rincian tagihan</h1>
          <p className="text-[13px] text-muted">{a.nama} · Kelas {a.kelas} · {pengaturan.tahunAjaran}</p>
        </div>
      </div>

      <Segment nilai={seg} ubah={setSeg} opsi={[{ nilai: 'spp', label: 'Iuran SPP' }, { nilai: 'keg', label: 'Biaya kegiatan' }]} />
      {seg === 'keg' && biaya.length > 0 && (
        <p className="-mt-1 mb-2.5 px-1 text-[12.5px] font-semibold text-muted">Ketuk kegiatan untuk melihat jadwal & keterangan lengkapnya.</p>
      )}

      <div className="card lg:grid lg:grid-cols-2 lg:gap-x-7">
        {seg === 'spp'
          ? BULAN.map((b, i) => {
              const dibayar = dibayarSpp(a, i)
              const target = pengaturan.sppNominal
              const status = statusSpp(dibayar, target, i, kini, pengaturan.tanggalJatuhTempo)
              return (
                <Baris
                  key={b}
                  nomor={i + 1}
                  status={{ lunas: 'ok', sebagian: 'sebagian', nunggak: 'late', 'belum-bayar': 'belum-bayar', menunggu: '' }[status]}
                  judul={b}
                  catatan={
                    status === 'lunas' ? 'Sudah dibayar penuh'
                    : status === 'sebagian' ? `Baru dibayar sebagian · kurang ${rp(target - dibayar)}`
                    : status === 'nunggak' ? `Terlambat · jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i)}`
                    : status === 'belum-bayar' ? `Jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i)} sudah lewat`
                    : 'Belum jatuh tempo'
                  }
                  dibayar={dibayar}
                  target={target}
                  chip={
                    status === 'lunas' ? <Chip warna="green">Lunas</Chip>
                    : status === 'sebagian' ? <Chip warna="amber">Sebagian</Chip>
                    : status === 'nunggak' ? <Chip warna="red">Nunggak</Chip>
                    : status === 'belum-bayar' ? <Chip warna="amber">Belum bayar</Chip>
                    : <Chip>Menunggu</Chip>
                  }
                />
              )
            })
          : biaya.length === 0
          ? <Kosong>Belum ada biaya kegiatan pada tahun ajaran ini.</Kosong>
          : biaya.map((b, i) => {
              const dibayar = dibayarKegiatan(a, i)
              const lunas = dibayar >= b.nominal
              const sebagian = !lunas && dibayar > 0
              const tgl = tanggalKegiatan(b, true)
              return (
                <Baris
                  key={b.id}
                  nomor={i + 1}
                  status={lunas ? 'ok' : sebagian ? 'sebagian' : ''}
                  ikon={emojiKegiatan(b)}
                  judul={b.nama}
                  tanggal={tgl}
                  ketuk={bukaKegiatan ? () => bukaKegiatan(b.id) : null}
                  catatan={lunas ? 'Sudah dibayar penuh' : sebagian ? `Baru dibayar sebagian · kurang ${rp(b.nominal - dibayar)}` : 'Belum dibayar'}
                  dibayar={dibayar}
                  target={b.nominal}
                  chip={
                    lunas ? <Chip warna="green">Lunas</Chip> : <Chip warna="amber">{sebagian ? 'Sebagian' : 'Belum'}</Chip>
                  }
                />
              )
            })}
      </div>

      <div className="h-4" />
      <button className="bigbtn lg:max-w-xs" onClick={bukaCaraBayar}>Lihat cara pembayaran</button>
    </>
  )
}

const Baris = ({ nomor, ikon, status, judul, tanggal, catatan, dibayar, target, chip, ketuk }) => {
  const warnaNo =
    status === 'ok' ? 'bg-ok-soft text-ok'
    : status === 'late' ? 'bg-danger-soft text-danger'
    : status === 'sebagian' || status === 'belum-bayar' ? 'bg-warn-soft text-warn'
    : 'bg-[#F2F4F9] text-muted'
  const warnaBar =
    status === 'ok' ? '#22C55E'
    : status === 'sebagian' || status === 'belum-bayar' ? '#F5A524'
    : status === 'late' ? '#EF4444'
    : '#C9D0DC'
  const Wadah = ketuk ? 'button' : 'div'
  return (
    <Wadah className={`row items-start py-3.5 ${ketuk ? 'w-full text-left transition active:bg-isi lg:hover:bg-isi' : ''}`} onClick={ketuk || undefined}>
      <span className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl font-extrabold ${ikon ? 'text-[19px]' : 'text-xs'} ${warnaNo}`}>
        {ikon || (status === 'ok' ? '✓' : status === 'late' ? '!' : String(nomor).padStart(2, '0'))}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[14.5px] font-bold">{judul}</div>
          {chip}
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted">
          {tanggal && <span className="font-bold text-brand">📅 {tanggal} · </span>}
          {catatan}
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex-1"><Track persen={persenBayar(dibayar, target)} warna={warnaBar} tinggi={5} /></div>
          <span className="shrink-0 text-xs font-bold text-muted">{rp(dibayar)}/{rp(target)}</span>
        </div>
      </div>
      {ketuk && <span className="mt-2.5 shrink-0"><Chevron /></span>}
    </Wadah>
  )
}