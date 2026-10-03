import { Chevron, Ikon, KosongCeria } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { jarakKegiatan, rp, tanggalKegiatan } from '../lib/format.js'
import { JudulAnak } from './Beranda.jsx'

const IkonLokasi = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

/** Status bayar satu kegiatan untuk anak ini: teks + warna. */
const statusBayar = ({ b, dibayar, lunas }) =>
  lunas ? { teks: `Lunas · ${rp(b.nominal)}`, kelas: 'text-ok-deep' }
  : dibayar > 0 ? { teks: `Dibayar sebagian · kurang ${rp(b.nominal - dibayar)}`, kelas: 'text-warn-deep' }
  : { teks: `Belum dibayar · ${rp(b.nominal)}`, kelas: 'text-warn-deep' }

/**
 * Halaman Kegiatan (tab bawah portal orang tua): semua kegiatan sekolah
 * tahun ajaran ini beserta jadwal & status bayarnya. Ketuk satu kegiatan
 * untuk membuka info lengkapnya (SheetKegiatan di sheets.jsx).
 *
 * Urutan: kegiatan terdekat (kartu kuning besar) → yang akan datang →
 * yang belum ada tanggalnya → yang sudah terlaksana.
 */
export default function Kegiatan({ aktif, bukaKegiatan }) {
  const { biaya, pengaturan } = useData()
  const a = aktif

  const semua = biaya.map((b, i) => {
    const dibayar = a.kegiatan[i] || 0
    return { b, j: jarakKegiatan(b), dibayar, lunas: dibayar >= b.nominal }
  })
  const akanDatang = semua.filter((x) => x.j && !x.j.selesai).sort((x, y) => x.j.selisih - y.j.selisih)
  const tanpaTanggal = semua.filter((x) => !x.j)
  const lewat = semua.filter((x) => x.j?.selesai).sort((x, y) => y.j.selisih - x.j.selisih)
  const sorot = akanDatang[0]

  return (
    <>
      <JudulAnak anak={a} judul="Kegiatan sekolah" sub={`Jadwal & info biaya kegiatan ${pengaturan.tahunAjaran}`} />

      {biaya.length === 0 ? (
        <KosongCeria judul="Belum ada kegiatan">Sekolah belum menambahkan kegiatan untuk tahun ajaran ini.</KosongCeria>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:gap-6">
            {sorot && <KartuTerdekat x={sorot} buka={() => bukaKegiatan(sorot.b.id)} />}
            {akanDatang.length > 1 && <Kelompok judul="Akan datang" daftar={akanDatang.slice(1)} buka={bukaKegiatan} />}
            {!sorot && tanpaTanggal.length > 0 && <Kelompok judul="Jadwal menyusul" daftar={tanpaTanggal} buka={bukaKegiatan} />}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:gap-6">
            {sorot && tanpaTanggal.length > 0 && <Kelompok judul="Jadwal menyusul" daftar={tanpaTanggal} buka={bukaKegiatan} />}
            {lewat.length > 0 && <Kelompok judul="Sudah terlaksana" daftar={lewat} buka={bukaKegiatan} redup />}
            <p className="sub-halaman px-3 text-center text-[12px] font-bold leading-relaxed">
              Jadwal dan keterangan kegiatan diisi pihak sekolah dan bisa berubah sewaktu-waktu.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

const PilKecil = ({ ikon, children }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-white/60 px-2.5 py-[5px] text-[11.5px] font-extrabold dark:bg-white/10">
    {ikon}
    <span className="truncate">{children}</span>
  </span>
)

/** Kartu permen kuning untuk kegiatan yang paling dekat. */
function KartuTerdekat({ x, buka }) {
  const { b, j } = x
  const st = statusBayar(x)
  return (
    <button onClick={buka} className="kartu-saldo relative block w-full overflow-hidden rounded-[26px] p-4 text-left transition active:translate-y-px lg:p-5">
      <span className="text-[11px] font-extrabold uppercase tracking-[.08em]">Kegiatan terdekat</span>
      <span className="mt-2 flex items-center gap-3">
        <GambarKegiatan emoji={emojiKegiatan(b)} size={58} className="!rounded-[18px] shadow-[inset_0_-4px_0_rgba(0,0,0,.07)]" />
        <span className="min-w-0">
          <b className="line-clamp-2 block font-display text-[22px] font-bold leading-[1.1]">{b.nama}</b>
          <span className="mt-0.5 block text-[12.5px] font-extrabold">{tanggalKegiatan(b)}</span>
        </span>
      </span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        <PilKecil ikon={<Ikon.kalender size={13} />}>{j.label}</PilKecil>
        {b.waktu && <PilKecil ikon={<Ikon.jam size={13} />}>{b.waktu}</PilKecil>}
        {b.lokasi && <PilKecil ikon={<IkonLokasi />}>{b.lokasi}</PilKecil>}
      </span>
      <span className="mt-3 flex items-center justify-between gap-2 border-t-[1.5px] border-dashed border-[#3D2A00]/15 pt-2.5 dark:border-white/15">
        <span className="min-w-0 truncate text-[12.5px] font-extrabold">{st.teks}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-extrabold">
          Info lengkap
          <Ikon.kembali size={14} className="rotate-180" />
        </span>
      </span>
    </button>
  )
}

function Kelompok({ judul, daftar, buka, redup }) {
  return (
    <section className="card !pb-1.5">
      <h2 className="judul-kartu mb-0.5 text-[18px]">{judul}</h2>
      {daftar.map((x) => {
        const { b, j } = x
        const st = statusBayar(x)
        return (
          <button key={b.id} className="row w-full items-center text-left" onClick={() => buka(b.id)}>
            <GambarKegiatan emoji={emojiKegiatan(b)} size={44} className={`rounded-[14px] ${redup ? 'opacity-70 grayscale-[.35]' : ''}`} />
            <span className="min-w-0 flex-1">
              <b className={`block truncate text-[14.5px] font-extrabold ${redup ? 'text-muted' : ''}`}>{b.nama}</b>
              <span className="block truncate text-[12px] font-semibold text-muted">
                {j ? <>{tanggalKegiatan(b, true)}{!j.selesai && <> · {j.label}</>}</> : 'Tanggal belum ditentukan'}
              </span>
              <span className={`mt-0.5 block truncate text-[12px] font-extrabold ${st.kelas}`}>{st.teks}</span>
            </span>
            <Chevron />
          </button>
        )
      })}
    </section>
  )
}
