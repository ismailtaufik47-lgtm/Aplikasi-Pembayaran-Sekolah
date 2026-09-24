import Avatar from '../components/Avatar.jsx'
import { Ikon, Sheet, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, rp, statusSpp, teksJatuhTempo } from '../lib/format.js'

const gabungBulan = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} dan ${xs[xs.length - 1]}`)

/**
 * Kalimat status SPP untuk orang tua, memisahkan yang BARU DIBAYAR
 * SEBAGIAN dan yang BELUM DIBAYAR SAMA SEKALI, contoh:
 *   "SPP Juli baru dibayar sebagian (kurang Rp50.000), SPP Agustus belum
 *    dibayar. Jatuh tempo setiap akhir bulan."
 * null kalau tidak ada SPP yang perlu diperhatikan.
 */
export function kalimatSpp(anak, pengaturan, kini = bulanBerjalan()) {
  if (!anak) return null
  const sebagian = []
  const belum = []
  BULAN.forEach((b, i) => {
    const dibayar = anak.spp[i] || 0
    const st = statusSpp(dibayar, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
    if (st === 'sebagian') sebagian.push(`SPP ${b} baru dibayar sebagian (kurang ${rp(pengaturan.sppNominal - dibayar)})`)
    else if (st === 'nunggak' || st === 'belum-bayar') belum.push(b)
  })
  const bagian = [...sebagian]
  if (belum.length) bagian.push(`SPP ${gabungBulan(belum)} belum dibayar`)
  if (bagian.length === 0) return null
  return `${bagian.join(', ')}. Jatuh tempo setiap ${teksJatuhTempo(pengaturan.tanggalJatuhTempo)}.`
}

/**
 * Daftar pemberitahuan untuk satu anak — dihitung dari data asli, bukan
 * teks tetap: SPP yang perlu dibayar sekarang, lalu biaya kegiatan yang
 * belum lunas. Kosong kalau semuanya sudah beres. Dipakai untuk isi
 * lembar Pemberitahuan sekaligus angka di ikon lonceng.
 */
export function daftarPemberitahuan(anak, pengaturan, biaya, kini = bulanBerjalan()) {
  if (!anak) return []
  const hasil = []
  const teksSpp = kalimatSpp(anak, pengaturan, kini)
  if (teksSpp) {
    hasil.push({ id: 'spp', warna: 'red', judul: `SPP ${anak.panggilan} belum lunas`, isi: teksSpp })
  }
  // Biaya kegiatan digabung jadi SATU pemberitahuan supaya lonceng tidak penuh angka.
  const keg = biaya
    .map((b, i) => ({ nama: b.nama, kurang: b.nominal - (anak.kegiatan[i] || 0) }))
    .filter((k) => k.kurang > 0)
  if (keg.length > 0) {
    hasil.push({
      id: 'kegiatan',
      warna: 'grape',
      judul: keg.length === 1 ? `Biaya ${keg[0].nama.toLowerCase()} belum lunas` : `${keg.length} biaya kegiatan belum lunas`,
      isi: `${keg.map((k) => k.nama).join(', ')} · total ${rp(keg.reduce((t, k) => t + k.kurang, 0))}.`,
    })
  }
  return hasil
}

/* ---------- bukti pembayaran ---------- */
export function SheetStruk({ id, tutup }) {
  const { pembayaran, siswa, pengaturan, toast } = useData()
  const p = pembayaran.find((x) => x.id === id)
  const s = p && siswa.find((x) => x.id === p.siswaId)
  if (!p || !s) return null

  return (
    <Sheet buka={!!id} tutup={tutup} judul="Bukti pembayaran" lead="Dicatat oleh pihak sekolah">
      <div className="relative rounded-card bg-white p-5 shadow-soft">
        <div className="mx-auto mb-3 grid h-[60px] w-[60px] place-items-center rounded-full bg-ok-soft text-ok">
          <Ikon.cek size={30} />
        </div>
        <div className="text-center text-[16px] font-extrabold">Pembayaran diterima</div>
        <div className="mb-4 mt-0.5 text-center text-[12.5px] text-muted">{pengaturan.namaSekolah} · {p.id}</div>

        <Sobek />
        <div className="flex items-center gap-3 py-2">
          <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{s.nama}</div>
            <div className="text-[12.5px] text-muted">Kelas {s.kelas} · NIS {s.nis}</div>
          </div>
        </div>
        <Sobek />

        <Kv k="Jenis biaya" v={p.ket} />
        <Kv k="Metode" v={p.metode} />
        <Kv k="Waktu" v={p.waktu} />
        <Kv k="Diterima oleh" v={p.petugas} />

        <Sobek />
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-muted">Jumlah dibayar</span>
          <span className="text-xl font-extrabold text-ok-deep">{rp(p.nominal)}</span>
        </div>
      </div>

      <div className="h-3.5" />
      <button className="bigbtn" onClick={() => { tutup(); toast('Bukti pembayaran disimpan sebagai gambar') }}>Simpan bukti</button>
      <div className="h-2.5" />
      <button className="bigbtn-ghost" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

const Kv = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-1.5 text-[13.5px]">
    <span className="font-semibold text-muted">{k}</span>
    <span className="text-right font-bold">{v}</span>
  </div>
)

/** Garis putus-putus dengan lekukan di kiri-kanan, meniru kwitansi kertas. */
const Sobek = () => (
  <div className="relative -mx-5 my-3.5 border-t-2 border-dashed border-[#E3E7EF]">
    <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-canvas" />
    <span className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-canvas" />
  </div>
)

/* ---------- cara pembayaran ---------- */
export function SheetCaraBayar({ buka, tutup, anak }) {
  const { pengaturan, toast } = useData()
  const salin = (teks) => {
    navigator.clipboard?.writeText(teks.replace(/\s/g, ''))
    toast('Nomor rekening disalin')
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Cara pembayaran" lead="Pilih salah satu, lalu konfirmasi ke petugas TU atau admin.">
      <div className="mb-2.5 text-sm font-extrabold">1. Transfer ke rekening sekolah</div>
      {pengaturan.rekening.map((r, i) => (
        <div key={r.nomor} className="mb-2.5 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-soft">
          <Tile warna={i % 2 ? 'amber' : 'blue'} className="rounded-xl text-xs font-extrabold">{r.bank}</Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold">{r.nomor}</div>
            <div className="text-[12.5px] text-muted">a.n. {r.atasNama}</div>
          </div>
          <button className="shrink-0 rounded-xl bg-brand-soft px-3 py-2 text-xs font-extrabold text-brand" onClick={() => salin(r.nomor)}>
            Salin
          </button>
        </div>
      ))}

      <div className="mb-2.5 mt-4 text-sm font-extrabold">2. Tunai ke petugas TU/admin</div>
      <div className="card flex items-center gap-3 p-3.5">
        <Tile warna="green"><Ikon.orang size={20} /></Tile>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-bold">{anak.guru}</div>
          <div className="text-[12.5px] text-muted">Setiap hari kerja, 07.30–12.00</div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warn-soft p-3.5">
        <Tile warna="amber" className="h-[34px] w-[34px] rounded-[11px]"><Ikon.info size={18} /></Tile>
        <div className="text-[13px] font-semibold leading-snug text-warn-deep">
          Status di aplikasi berubah setelah guru mencatat pembayaran, biasanya di hari yang sama.
        </div>
      </div>

      <div className="h-4" />
      <button className="bigbtn-wa" onClick={() => { tutup(); toast(`Membuka WhatsApp ${anak.guru}`) }}>
        Kirim bukti transfer via WhatsApp
      </button>
      <div className="h-2.5" />
      <button className="bigbtn-ghost" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- pemberitahuan ---------- */
export function SheetPengumuman({ buka, tutup, anak }) {
  const { pengaturan, biaya } = useData()
  const daftar = daftarPemberitahuan(anak, pengaturan, biaya)

  return (
    <Sheet buka={buka} tutup={tutup} judul="Pemberitahuan" lead={`Dari ${pengaturan.namaSekolah}`}>
      {daftar.length === 0 ? (
        <div className="card flex items-start gap-3">
          <Tile warna="green"><Ikon.cek size={20} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold">Tidak ada pemberitahuan</div>
            <div className="text-[12.5px] text-muted">Semua tagihan {anak?.panggilan} sudah lunas. Terima kasih 🙏</div>
          </div>
        </div>
      ) : (
        daftar.map((d) => (
          <div key={d.id} className="card mb-2.5 flex items-start gap-3">
            <Tile warna={d.warna}>{d.warna === 'red' ? <Ikon.peringatan size={20} /> : <Ikon.kalender size={20} />}</Tile>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold">{d.judul}</div>
              <div className="text-[12.5px] text-muted">{d.isi}</div>
            </div>
          </div>
        ))
      )}
      <div className="h-4" />
      <button className="bigbtn-ghost" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}