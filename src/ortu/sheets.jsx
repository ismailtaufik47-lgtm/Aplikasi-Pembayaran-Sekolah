import Avatar from '../components/Avatar.jsx'
import { Ikon, Sheet, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { rp } from '../lib/format.js'

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
  const kegiatanTerbaru = biaya[biaya.length - 1]

  return (
    <Sheet buka={buka} tutup={tutup} judul="Pemberitahuan" lead={`Dari ${pengaturan.namaSekolah}`}>
      <div className="card mb-2.5 flex items-start gap-3">
        <Tile warna="red"><Ikon.peringatan size={20} /></Tile>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-bold">SPP bulan ini belum dibayar</div>
          <div className="text-[12.5px] text-muted">
            {anak.panggilan} — jatuh tempo setiap tanggal {pengaturan.tanggalJatuhTempo}.
          </div>
        </div>
      </div>
      {kegiatanTerbaru && (
        <div className="card flex items-start gap-3">
          <Tile warna="grape"><Ikon.kalender size={20} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold">Biaya {kegiatanTerbaru.nama.toLowerCase()} dibuka</div>
            <div className="text-[12.5px] text-muted">{rp(kegiatanTerbaru.nominal)} · dikumpulkan lewat guru kelas.</div>
          </div>
        </div>
      )}
      <div className="h-4" />
      <button className="bigbtn-ghost" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}
