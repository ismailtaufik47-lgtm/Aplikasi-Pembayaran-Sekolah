import Avatar from '../components/Avatar.jsx'
import { Chevron, Kosong } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { FONT_EMOJI, emojiKegiatan } from '../lib/emojiKegiatan.js'
import { jarakKegiatan, rp, tanggalKegiatan } from '../lib/format.js'

/**
 * Halaman Kegiatan (tab bawah portal orang tua): semua kegiatan sekolah
 * tahun ajaran ini beserta jadwal & status bayarnya. Ketuk satu kegiatan
 * untuk membuka info lengkapnya (SheetKegiatan di sheets.jsx).
 *
 * Urutan: yang akan datang (terdekat dulu) → yang belum ada tanggalnya →
 * yang sudah terlaksana.
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
      <div className="flex items-center gap-3 pb-1 pt-3.5 lg:pt-7">
        <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={42} />
        <div>
          <h1 className="text-xl font-extrabold lg:text-[26px]">Kegiatan sekolah</h1>
          <p className="text-[13px] text-muted">Jadwal & info kegiatan · {pengaturan.tahunAjaran}</p>
        </div>
      </div>

      {biaya.length === 0 ? (
        <div className="card mt-4"><Kosong>Belum ada kegiatan pada tahun ajaran ini.</Kosong></div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div>
            {sorot && (
              <button
                onClick={() => bukaKegiatan(sorot.b.id)}
                className="relative mt-4 block w-full overflow-hidden rounded-[24px] bg-brand p-5 text-left text-white"
              >
                <span className="relative text-[12px] font-bold uppercase tracking-wider opacity-90">Kegiatan terdekat</span>
                <span className="relative mt-3 flex items-center gap-3.5">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/95 text-[28px]" style={FONT_EMOJI}>
                    {emojiKegiatan(sorot.b)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[19px] font-extrabold">{sorot.b.nama}</span>
                    <span className="block text-[13px] font-semibold opacity-90">{tanggalKegiatan(sorot.b)}</span>
                  </span>
                </span>
                <span className="relative mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-pill bg-white px-3 py-1.5 text-[12px] font-extrabold text-brand">{sorot.j.label}</span>
                  {sorot.b.waktu && <span className="rounded-pill bg-white/20 px-3 py-1.5 text-[12px] font-bold">🕐 {sorot.b.waktu}</span>}
                  {sorot.b.lokasi && <span className="max-w-full truncate rounded-pill bg-white/20 px-3 py-1.5 text-[12px] font-bold">📍 {sorot.b.lokasi}</span>}
                </span>
                <span className="relative mt-3.5 block text-[12.5px] font-bold opacity-95">Lihat info lengkap ›</span>
              </button>
            )}

            {akanDatang.length > 1 && <Kelompok judul="Akan datang" daftar={akanDatang.slice(1)} buka={bukaKegiatan} />}
            {tanpaTanggal.length > 0 && <Kelompok judul={akanDatang.length ? 'Jadwal menyusul' : 'Kegiatan'} daftar={tanpaTanggal} buka={bukaKegiatan} />}
          </div>
          <div>
            {lewat.length > 0 && <Kelompok judul="Sudah terlaksana" daftar={lewat} buka={bukaKegiatan} redup />}
            <p className="px-1 pt-4 text-center text-[11.5px] leading-relaxed text-muted">
              Jadwal dan keterangan kegiatan diisi oleh pihak sekolah dan bisa berubah sewaktu-waktu.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Kelompok({ judul, daftar, buka, redup }) {
  return (
    <>
      <div className="seghead lg:first:mt-4"><h2>{judul}</h2></div>
      <div className="card py-1.5">
        {daftar.map(({ b, j, dibayar, lunas }) => (
          <button key={b.id} className={`row w-full text-left ${redup ? 'opacity-80' : ''}`} onClick={() => buka(b.id)}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-grape-soft text-[22px]" style={FONT_EMOJI}>
              {emojiKegiatan(b)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{b.nama}</span>
              <span className="block truncate text-[12.5px] text-muted">
                {j ? <>📅 {tanggalKegiatan(b, true)}{!j.selesai && <b className="text-brand"> · {j.label}</b>}</> : 'Tanggal belum ditentukan'}
              </span>
              <span className="mt-1 block text-[12px] font-bold">
                {lunas ? <span className="text-ok-deep">✓ Lunas {rp(b.nominal)}</span>
                  : dibayar > 0 ? <span className="text-warn-deep">Kurang {rp(b.nominal - dibayar)}</span>
                  : <span className="text-warn-deep">Belum dibayar · {rp(b.nominal)}</span>}
              </span>
            </span>
            <Chevron />
          </button>
        ))}
      </div>
    </>
  )
}