import { useState } from 'react'
import { Ikon, Kosong, Pil } from '../components/ui.jsx'
import { KoinMaskot } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import { rp } from '../lib/format.js'
import { BarisTransaksi, JudulAnak } from './Beranda.jsx'

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/**
 * Riwayat pembayaran satu anak: dua angka ringkas, saringan Semua/SPP/Kegiatan,
 * lalu transaksi dikelompokkan per bulan. Ketuk transaksi → bukti & kuitansi.
 */
export default function Riwayat({ aktif, bukaStruk }) {
  const { pembayaran } = useData()
  const [saring, setSaring] = useState('semua')
  const semua = pembayaran.filter((p) => p.siswaId === aktif.id)
  const adaPaket = semua.some((p) => p.jenis === 'paket')
  const daftar = saring === 'semua' ? semua : semua.filter((p) => (saring === 'spp' ? p.jenis === 'spp' : saring === 'paket' ? p.jenis === 'paket' : p.jenis === 'kegiatan'))
  const total = semua.reduce((t, p) => t + p.nominal, 0)

  // kelompok per bulan (terbaru dulu)
  const kelompok = []
  daftar.forEach((p) => {
    const d = new Date(p.tanggal)
    const kunci = `${d.getFullYear()}-${d.getMonth()}`
    const akhir = kelompok[kelompok.length - 1]
    if (akhir && akhir.kunci === kunci) akhir.item.push(p)
    else kelompok.push({ kunci, judul: `${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`, item: [p] })
  })

  return (
    <>
      <JudulAnak anak={aktif} judul="Riwayat pembayaran" sub="Ketuk transaksi untuk melihat kuitansinya" />

      <div className="grid grid-cols-2 gap-2.5 lg:max-w-[560px]">
        <div className="permen permen-tosca rounded-[20px] p-3.5">
          <Ikon.cek size={20} />
          <span className="mt-2 block text-[12px] font-extrabold">Total dibayar</span>
          <b className="block break-words font-display text-[22px] font-bold leading-tight">{rp(total)}</b>
        </div>
        <div className="permen permen-ungu rounded-[20px] p-3.5">
          <Ikon.nota size={20} />
          <span className="mt-2 block text-[12px] font-extrabold">Transaksi</span>
          <b className="block font-display text-[22px] font-bold leading-tight">{semua.length}</b>
        </div>
      </div>

      <div className="mb-3 mt-3.5 flex flex-wrap gap-2">
        <Pil on={saring === 'semua'} onClick={() => setSaring('semua')}>Semua</Pil>
        <Pil on={saring === 'spp'} onClick={() => setSaring('spp')}>SPP</Pil>
        <Pil on={saring === 'keg'} onClick={() => setSaring('keg')}>Kegiatan</Pil>
        {adaPaket && <Pil on={saring === 'paket'} warna="pink" onClick={() => setSaring('paket')}>PMB &amp; DU</Pil>}
      </div>

      {daftar.length === 0 ? (
        <div className="card"><Kosong>{semua.length ? 'Tidak ada transaksi untuk saringan ini.' : 'Belum ada pembayaran tercatat untuk ananda.'}</Kosong></div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-5">
          {kelompok.map((k) => (
            <div key={k.kunci} className="card !pb-1.5">
              <h2 className="judul-kartu mb-1 text-[18px]">{k.judul}</h2>
              {k.item.map((p) => <BarisTransaksi key={p.id} p={p} buka={() => bukaStruk(p.id)} />)}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center px-4 pt-5 text-center">
        <KoinMaskot className="h-[84px] w-[84px]" />
        <p className="sub-halaman mt-1 max-w-[360px] text-[12.5px] font-bold leading-relaxed">
          Tiap pembayaran yang dicatat sekolah punya kuitansi ber-QR yang bisa dicek keasliannya.
        </p>
      </div>
    </>
  )
}
