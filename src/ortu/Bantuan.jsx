import { Ikon, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'

const TANYA = [
  ['Bagaimana cara membayar SPP?', 'Bisa tunai langsung ke guru kelas, atau transfer ke rekening sekolah. Setelah transfer, kirim buktinya lewat tombol konfirmasi WhatsApp supaya guru bisa mencatatnya.'],
  ['Kenapa pembayaran saya belum tercatat?', 'Pencatatan dilakukan manual oleh guru pada jam kerja. Kalau lebih dari satu hari kerja statusnya belum berubah, hubungi guru kelas.'],
  ['Bisakah membayar beberapa bulan sekaligus?', 'Bisa. Sampaikan saat membayar berapa bulan yang dilunasi, nanti guru menandai bulan-bulan tersebut sekaligus.'],
  ['Bagaimana kalau ada biaya yang terasa keliru?', 'Buka rincian tagihan, catat nama biaya dan nominalnya, lalu konfirmasi ke guru kelas. Perubahan hanya bisa dilakukan pihak sekolah.'],
]

export default function Bantuan({ aktif }) {
  const { pengaturan, toast } = useData()
  return (
    <>
      <h1 className="pt-3.5 text-xl font-extrabold lg:pt-7 lg:text-[26px]">Bantuan</h1>
      <p className="mb-3 mt-1 text-[13.5px] text-muted">Pertanyaan yang sering ditanyakan orang tua</p>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
       <div>
      {TANYA.map(([q, a]) => (
        <details key={q} className="mb-2.5 rounded-2xl bg-white px-4 shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 py-3.5 text-sm font-bold marker:hidden">
            {q}
            <span className="text-xl text-muted">+</span>
          </summary>
          <p className="pb-3.5 text-[13.5px] leading-relaxed text-muted">{a}</p>
        </details>
      ))}

       </div>
       <div>
      <div className="seghead lg:mt-0"><h2>Kontak sekolah</h2></div>
      <div className="card">
        <div className="row">
          <Tile warna="green"><Ikon.telepon size={20} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold">{aktif.guru} — guru kelas {aktif.kelas}</div>
            <div className="text-[12.5px] text-muted">Hubungi untuk konfirmasi pembayaran</div>
          </div>
        </div>
        <div className="row">
          <Tile warna="blue"><Ikon.rumah size={20} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold">Kantor {pengaturan.namaSekolah}</div>
            <div className="text-[12.5px] text-muted">Senin–Jumat, 07.30–14.00</div>
          </div>
        </div>
      </div>

      <div className="h-4" />
      <button className="bigbtn-wa" onClick={() => toast(`Membuka WhatsApp ${aktif.guru}`)}>Hubungi guru kelas</button>
       </div>
      </div>
    </>
  )
}
