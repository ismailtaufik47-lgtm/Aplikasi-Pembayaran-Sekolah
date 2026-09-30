/**
 * Riwayat pembayaran + pembatalan.
 *
 * Alur membatalkan (dibuat sesederhana mungkin):
 *   ketuk transaksi → "Batalkan transaksi" → pilih alasan → "Ya, batalkan".
 * Tidak ada hapus: transaksi pindah ke tab "Dibatalkan" lengkap dengan
 * siapa, kapan, dan alasannya. Tab itu juga memuat transaksi kas yang
 * dibatalkan, jadi kepala sekolah cukup melihat satu tempat.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, KepalaHalaman, Kosong, Pil, Sheet, Tile } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { hariTampil, rp, tanggalISO, tanggalKunci, tanggalPanjang, waktuTampil } from '../lib/format.js'
import FormBatal from './FormBatal.jsx'

export default function RiwayatBayar() {
  const { pembayaran, siswa, pengaturan, toast, boleh } = useData()
  const nav = useNavigate()
  const [unduh, setUnduh] = useState(null) // id transaksi yang kuitansinya sedang dibuat
  const [tab, setTab] = useState(boleh('pembayaran', 'lihat') ? 'transaksi' : 'batal')
  const [pilih, setPilih] = useState(null) // transaksi yang detailnya dibuka
  const lihatBatal = boleh('batal', 'lihat')

  const unduhKuitansi = async (p, s) => {
    if (unduh) return
    setUnduh(p.id)
    try {
      const [d, { unduhKuitansiBayar }] = await Promise.all([
        api.kuitansiStaf(p.id, { p, s, pengaturan }),
        import('../lib/dokumen.js'),
      ])
      await unduhKuitansiBayar(d)
    } catch (e) {
      toast('Gagal membuat kuitansi: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }
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

  const judul = (
    <>
      <KepalaHalaman judul="Riwayat pembayaran" gambar="koin" sub="Semua transaksi yang tercatat tahun ajaran ini" />
      {lihatBatal && boleh('pembayaran', 'lihat') && (
        <div className="mb-3 flex gap-1 rounded-[18px] bg-kartu/70 p-1 shadow-[0_4px_14px_rgba(30,64,140,.06)] dark:bg-white/5 lg:max-w-sm">
          {[['transaksi', 'Transaksi'], ['batal', 'Dibatalkan']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-[14px] py-2.5 text-[13.5px] font-extrabold ${tab === id ? `permen permen-kecil ${id === 'batal' ? 'permen-pink' : 'permen-biru'}` : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  )

  if (tab === 'batal') return <>{judul}<DaftarBatal /></>

  return (
    <>
      {judul}

      <div className="noscroll -mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1.5 pt-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0">
        <Stat warna="green" ikon={<Ikon.cek size={20} />} label="Masuk hari ini" nilai={rp(hariIni.reduce((t, p) => t + p.nominal, 0))} />
        <Stat warna="blue" ikon={<Ikon.jam size={20} />} label="Transaksi" nilai={pembayaran.length} />
        <Stat warna="amber" ikon={<Ikon.dompet size={20} />} label="Tunai / transfer" nilai={`${tunai} / ${pembayaran.length - tunai}`} />
      </div>

      {/* ---------- filter tanggal ---------- */}
      <div className="mb-1 mt-1 flex flex-wrap items-center gap-2.5 lg:mt-3">
        <div className="flex items-center gap-2 rounded-pill border-[1.5px] border-[#DCE6F4] bg-kartu px-3.5 py-2 dark:border-line">
          <span className="text-[#7C8AA5]"><Ikon.kalender size={17} /></span>
          <input
            type="date"
            className="bg-transparent text-[13.5px] font-semibold outline-none"
            value={tglFilter}
            max={tanggalISO()}
            onChange={(e) => setTglFilter(e.target.value)}
          />
        </div>
        {tglFilter && (
          <Pil on onClick={() => setTglFilter('')}>Tampilkan semua</Pil>
        )}
        {!tglFilter && tanggalTersedia.length > 0 && (
          <div className="noscroll flex gap-2 overflow-x-auto">
            {tanggalTersedia.slice(0, 6).map((t) => (
              <Pil key={t} onClick={() => setTglFilter(t)} className="!py-[7px] text-[12.5px]">
                {hariTampil(new Date(t + 'T00:00:00').toISOString())}
              </Pil>
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
                    <div key={p.id} className="row lg:rounded-xl lg:px-4 lg:hover:bg-[#FAFBFF]">
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPilih(p)}>
                        <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-bold">{s.nama}</span>
                          <span className="block truncate text-[12.5px] text-muted">{p.ket} · {p.waktu}</span>
                        </span>
                        <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                          <span className="text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                          <Chip warna={p.metode === 'Tunai' ? 'green' : 'blue'}>{p.metode}</Chip>
                        </span>
                      </button>
                      <button
                        onClick={() => unduhKuitansi(p, s)}
                        title="Unduh kuitansi PDF"
                        aria-label={`Unduh kuitansi ${s.nama}`}
                        className="permen permen-kecil permen-biru grid h-10 w-10 shrink-0 place-items-center rounded-[13px] disabled:opacity-50"
                        disabled={!!unduh}
                      >
                        {unduh === p.id ? <Ikon.jam size={18} /> : <Ikon.unduh size={18} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <SheetTransaksi
        p={pilih}
        s={pilih && siswa.find((x) => x.id === pilih.siswaId)}
        tutup={() => setPilih(null)}
        unduh={unduh}
        onKuitansi={unduhKuitansi}
        onKartu={(id) => { setPilih(null); nav(`/guru/siswa/${id}`) }}
      />
    </>
  )
}

/* ---------- detail satu transaksi + batalkan ---------- */
function SheetTransaksi({ p, s, tutup, unduh, onKuitansi, onKartu }) {
  const { batalkanPembayaran, toast, boleh, cegahKunci } = useData()
  const [form, setForm] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => { setForm(false) }, [p])
  if (!p || !s) return null

  const kirim = async (alasan) => {
    setSibuk(true)
    try {
      await batalkanPembayaran(p.id, alasan)
      toast('Pembayaran dibatalkan')
      tutup()
    } catch {
      /* pesan galat sudah ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  const Kv = ({ k, v }) => (
    <div className="flex justify-between gap-3 py-1.5 text-[13.5px]">
      <span className="shrink-0 font-semibold text-muted">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  )

  return (
    <Sheet buka tutup={() => !sibuk && tutup()} judul="Detail pembayaran">
      <div className="card">
        <div className="flex items-center gap-3">
          <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold leading-tight">{s.nama}</div>
            <div className="text-[12.5px] text-muted">Kelas {s.kelas} · NIS {s.nis}</div>
          </div>
          <div className="shrink-0 text-[18px] font-extrabold text-ok-deep">{rp(p.nominal)}</div>
        </div>
        <div className="mt-3 border-t border-line pt-2">
          <Kv k="Untuk" v={p.ket} />
          <Kv k="Tanggal" v={waktuTampil(p.tanggal)} />
          <Kv k="Metode" v={p.metode} />
          <Kv k="Dicatat oleh" v={p.petugas || '—'} />
        </div>
      </div>

      <div className="mt-3 flex gap-2.5">
        <button
          className="tombol-putih flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[13.5px] font-extrabold disabled:opacity-50"
          onClick={() => onKuitansi(p, s)}
          disabled={!!unduh}
        >
          {unduh === p.id ? <><Ikon.jam size={17} /> Membuat…</> : <><Ikon.unduh size={17} /> Kuitansi</>}
        </button>
        <button className="tombol-putih flex-1 rounded-2xl py-3 text-[13.5px] font-extrabold" onClick={() => onKartu(s.id)}>
          🧒 Kartu siswa
        </button>
      </div>

      <div className="h-3" />
      {boleh('batal') && (form ? (
        <div className="mb-2.5">
          <FormBatal nominal={p.nominal} sibuk={sibuk} onKirim={kirim} onBatal={() => setForm(false)} />
        </div>
      ) : (
        <button
          className="mb-2.5 w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={() => !cegahKunci('batal') && setForm(true)}
        >
          Batalkan transaksi ini
        </button>
      ))}
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- daftar transaksi yang dibatalkan (pembayaran + kas) ---------- */
function DaftarBatal() {
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    api.riwayatPembatalan().then(setData).catch((e) => setGalat(e.message))
  }, [])

  if (galat) return <div className="card"><Kosong>{galat}</Kosong></div>
  if (!data) return <div className="card"><Kosong>Memuat riwayat pembatalan…</Kosong></div>

  const total = data.reduce((t, b) => t + Number(b.nominal || 0), 0)
  return (
    <>
      <div className="seghead">
        <h2>Transaksi dibatalkan</h2>
        {data.length > 0 && <span className="text-[12.5px] font-bold text-muted">{data.length} transaksi · {rp(total)}</span>}
      </div>
      <div className="card">
        {data.length === 0 ? (
          <Kosong>Belum ada transaksi yang dibatalkan. 👍</Kosong>
        ) : (
          data.map((b) => (
            <div key={b.sumber + b.id} className="row items-start">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-[18px] ${b.sumber === 'kas' ? 'bg-warn-soft' : 'bg-danger-soft'}`}>
                {b.sumber === 'kas' ? '💰' : '💳'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-snug">{b.uraian}</span>
                <span className="block text-[12px] text-muted">
                  {b.sumber === 'kas' ? (b.jenis === 'keluar' ? 'Kas keluar' : 'Kas masuk') : 'Pembayaran'} · dicatat {b.petugas || '—'}
                </span>
                <span className="mt-1.5 block rounded-xl bg-danger-soft px-2.5 py-1.5 text-[12px] font-semibold text-danger">
                  Dibatalkan {b.dibatalkanNama || '—'} · {waktuTampil(b.dibatalkanPada)}
                  <br />
                  Alasan: {b.alasan || '—'}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-extrabold text-muted line-through">{rp(b.nominal)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

const Stat = ({ warna, ikon, label, nilai }) => (
  <div className="card min-w-[150px] p-[15px] lg:min-w-0 lg:p-[18px]">
    <Tile warna={warna}>{ikon}</Tile>
    <div className="mt-3 text-[13px] font-medium text-muted">{label}</div>
    <div className="judul-halaman mt-0.5 font-display text-[22px] font-semibold leading-tight">{nilai}</div>
  </div>
)