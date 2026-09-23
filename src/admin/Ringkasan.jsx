/**
 * Ringkasan admin: angka kunci, grafik pendapatan per bulan, dan daftar
 * sekolah yang perlu ditindaklanjuti (segera jatuh tempo / sudah lewat).
 *
 * Pendapatan = jumlah nominal riwayat_langganan per bulan, dikelompokkan
 * menurut TANGGAL DICATAT (kapan admin mengonfirmasi pembayaran).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Kosong, PageHead } from '../components/ui.jsx'
import { rp } from '../lib/format.js'
import { labelStatus, teksSisa, tglPendek, useAdmin } from './storeAdmin.jsx'
import AksiSekolah from './AksiSekolah.jsx'

const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const kunciBulan = (d) => `${d.getFullYear()}-${d.getMonth()}`

/** Rupiah ringkas untuk sumbu: Rp350 rb, Rp1,2 jt. */
const rpSingkat = (n) =>
  n >= 1e6
    ? `Rp${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
    : n >= 1e3
      ? `Rp${Math.round(n / 1e3)} rb`
      : `Rp${n}`

/** Batas atas sumbu yang "bulat": 1, 2, 2.5, 5 × 10^k. */
function batasAtas(maks) {
  if (maks <= 0) return 100000
  const pangkat = 10 ** Math.floor(Math.log10(maks))
  for (const k of [1, 2, 2.5, 5, 10]) if (k * pangkat >= maks) return k * pangkat
  return 10 * pangkat
}

export default function Ringkasan() {
  const { sekolah, riwayat } = useAdmin()
  const [aksi, setAksi] = useState(null)
  const nav = useNavigate()

  const kini = new Date()
  const bulanIni = kunciBulan(kini)
  const bulanLalu = kunciBulan(new Date(kini.getFullYear(), kini.getMonth() - 1, 1))

  const angka = useMemo(() => {
    let masukIni = 0, masukLalu = 0, trxIni = 0
    riwayat.forEach((r) => {
      const k = kunciBulan(new Date(r.dibuatPada))
      if (k === bulanIni) { masukIni += Number(r.nominal); trxIni++ }
      if (k === bulanLalu) masukLalu += Number(r.nominal)
    })
    const aktif = sekolah.filter((s) => s.kode === 'aktif')
    return {
      masukIni, masukLalu, trxIni,
      rutin: aktif.reduce((t, s) => t + s.tagihanBulanan, 0),
      nAktif: aktif.length,
      nTrial: sekolah.filter((s) => s.kode === 'trial').length,
      nNonaktif: sekolah.filter((s) => s.kode === 'kadaluarsa').length,
    }
  }, [sekolah, riwayat, bulanIni, bulanLalu])

  const selisih = angka.masukIni - angka.masukLalu

  // Perlu tindak lanjut: jatuh tempo ≤ 7 hari, atau sudah lewat (bukan yang sengaja dinonaktifkan)
  const perluTindak = sekolah
    .filter((s) => (s.kategori === 'segera' || s.kategori === 'nonaktif') && s.alasan !== 'admin')
    .sort((a, b) => a.sisaHari - b.sisaHari)
    .slice(0, 6)

  return (
    <>
      <div className="pb-1.5 pt-3.5 lg:hidden">
        <h1 className="text-xl font-extrabold">Ringkasan</h1>
      </div>
      <PageHead judul="Ringkasan" sub="Pendapatan sewa aplikasi & kondisi langganan semua sekolah" />

      {/* angka uang */}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:mt-4">
        <div className="rounded-card bg-gradient-to-br from-brand to-brand-deep p-5 text-white shadow-hero">
          <div className="text-[12.5px] font-bold opacity-90">Pendapatan bulan ini</div>
          <div className="mt-1.5 text-[28px] font-extrabold leading-none">{rp(angka.masukIni)}</div>
          <div className="mt-2 text-[12px] font-semibold opacity-90">
            {angka.trxIni} transaksi ·{' '}
            {angka.masukLalu === 0
              ? `bulan lalu ${rp(0)}`
              : `${selisih >= 0 ? 'naik' : 'turun'} ${rp(Math.abs(selisih))} dari bulan lalu`}
          </div>
        </div>
        <div className="card">
          <div className="text-[12.5px] font-bold text-muted">Perkiraan pendapatan rutin / bulan</div>
          <div className="mt-1.5 text-[28px] font-extrabold leading-none text-ink">{rp(angka.rutin)}</div>
          <div className="mt-2 text-[12px] font-semibold text-muted">
            Dari {angka.nAktif} sekolah berbayar aktif (siswa aktif × tarif saat ini)
          </div>
        </div>
      </div>

      {/* hitungan sekolah */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <KartuHitung label="Aktif" nilai={angka.nAktif} warna="green" onClick={() => nav('/admin/sekolah?filter=aktif')} />
        <KartuHitung label="Uji coba" nilai={angka.nTrial} warna="blue" onClick={() => nav('/admin/sekolah?filter=trial')} />
        <KartuHitung label="Nonaktif" nilai={angka.nNonaktif} warna="red" onClick={() => nav('/admin/sekolah?filter=nonaktif')} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <GrafikPendapatan riwayat={riwayat} />

        <div className="card min-w-0">
          <div className="mb-1 text-[15px] font-extrabold">Perlu ditindaklanjuti</div>
          <div className="mb-2 text-[12.5px] text-muted">Jatuh tempo ≤ 7 hari atau sudah lewat</div>
          {perluTindak.length === 0 ? (
            <Kosong>Semua sekolah aman 👍</Kosong>
          ) : (
            perluTindak.map((s) => {
              const st = labelStatus(s)
              return (
                <div key={s.id} className="row">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{s.nama}</span>
                    <span className="block text-[12px] text-muted">
                      {tglPendek(s.jatuhTempo)} · {teksSisa(s)}
                    </span>
                  </span>
                  <Chip warna={st.warna}>{st.teks}</Chip>
                  <button
                    className="shrink-0 rounded-xl bg-brand-soft px-3 py-1.5 text-[12px] font-extrabold text-brand"
                    onClick={() => setAksi({ jenis: 'perpanjang', s })}
                  >
                    Perpanjang
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <AksiSekolah aksi={aksi} setAksi={setAksi} />
    </>
  )
}

function KartuHitung({ label, nilai, warna, onClick }) {
  const titik = { green: 'bg-ok', blue: 'bg-brand', red: 'bg-danger' }[warna]
  return (
    <button onClick={onClick} className="card text-left transition active:scale-[.98]">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold text-muted">
        <i className={`h-2 w-2 shrink-0 rounded-full ${titik}`} />
        {label}
      </span>
      <b className="mt-1 block text-[24px] font-extrabold leading-none text-ink">{nilai}</b>
      <span className="text-[11.5px] font-semibold text-muted">sekolah</span>
    </button>
  )
}

/* ---------------- grafik batang pendapatan per bulan ---------------- */

function GrafikPendapatan({ riwayat }) {
  const [rentang, setRentang] = useState(6)
  const [sorot, setSorot] = useState(null) // indeks batang yang di-hover/diketuk
  const [tabel, setTabel] = useState(false)

  const data = useMemo(() => {
    const kini = new Date()
    const bulan = []
    for (let i = rentang - 1; i >= 0; i--) {
      const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1)
      bulan.push({ kunci: kunciBulan(d), bulan: d.getMonth(), tahun: d.getFullYear(), total: 0, trx: 0 })
    }
    const indeks = Object.fromEntries(bulan.map((b, i) => [b.kunci, i]))
    riwayat.forEach((r) => {
      const i = indeks[kunciBulan(new Date(r.dibuatPada))]
      if (i !== undefined) { bulan[i].total += Number(r.nominal); bulan[i].trx++ }
    })
    return bulan
  }, [riwayat, rentang])

  const atas = batasAtas(Math.max(...data.map((d) => d.total)))
  const TINGGI = 170
  const garis = [0, 0.5, 1] // garis bantu tipis
  const totalRentang = data.reduce((t, d) => t + d.total, 0)
  const aktif = sorot ?? data.length - 1 // tanpa hover: sorot bulan berjalan

  return (
    <div className="card min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-extrabold">Pendapatan per bulan</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            Total {rentang} bulan: <b className="text-ink">{rp(totalRentang)}</b>
          </div>
        </div>
        <div className="flex rounded-full bg-[#EEF2F8] p-1 text-[11.5px] font-bold">
          {[6, 12].map((n) => (
            <button
              key={n}
              className={`rounded-full px-2.5 py-1 ${rentang === n ? 'bg-white text-brand shadow-[0_1px_3px_rgba(21,26,38,.1)]' : 'text-muted'}`}
              onClick={() => { setRentang(n); setSorot(null) }}
            >
              {n === 6 ? '6 Bulan' : '1 Tahun'}
            </button>
          ))}
        </div>
      </div>

      {tabel ? (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className="py-2">Bulan</th>
              <th className="py-2 text-right">Transaksi</th>
              <th className="py-2 text-right">Pendapatan</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.kunci} className="border-b border-line last:border-b-0">
                <td className="py-2 font-semibold">{NAMA_BULAN[d.bulan]} {d.tahun}</td>
                <td className="py-2 text-right text-muted">{d.trx}</td>
                <td className="py-2 text-right font-bold">{rp(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative flex gap-2" onMouseLeave={() => setSorot(null)}>
          {/* sumbu Y + garis bantu */}
          <div className="relative w-[52px] shrink-0" style={{ height: TINGGI }}>
            {garis.map((g) => (
              <span
                key={g}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold text-muted"
                style={{ top: TINGGI - g * TINGGI }}
              >
                {rpSingkat(atas * g)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {garis.map((g) => (
              <div key={g} className="absolute inset-x-0 border-t border-line" style={{ top: TINGGI - g * TINGGI }} />
            ))}
            <div className="relative flex items-end gap-1.5" style={{ height: TINGGI }}>
              {data.map((d, i) => {
                const h = (d.total / atas) * TINGGI
                const disorot = i === aktif
                return (
                  <button
                    key={d.kunci}
                    className="relative flex h-full flex-1 items-end justify-center outline-none"
                    onMouseEnter={() => setSorot(i)}
                    onFocus={() => setSorot(i)}
                    onClick={() => setSorot(i)}
                    aria-label={`${NAMA_BULAN[d.bulan]} ${d.tahun}: ${rp(d.total)}, ${d.trx} transaksi`}
                  >
                    <span
                      className={`block w-full max-w-[34px] rounded-t-[4px] transition-colors ${
                        disorot ? 'bg-brand' : 'bg-brand/40'
                      }`}
                      style={{ height: d.total > 0 ? Math.max(3, h) : 0 }}
                    />
                  </button>
                )
              })}
            </div>
            {/* tooltip bulan yang disorot */}
            {data[aktif] && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-ink px-2.5 py-1.5 text-center text-white shadow-soft"
                style={{
                  left: `${Math.min(85, Math.max(15, ((aktif + 0.5) / data.length) * 100))}%`,
                  top: TINGGI - (data[aktif].total / atas) * TINGGI,
                }}
              >
                <div className="text-[10.5px] font-semibold opacity-80">
                  {NAMA_BULAN[data[aktif].bulan]} {data[aktif].tahun} · {data[aktif].trx} trx
                </div>
                <div className="text-[12.5px] font-extrabold">{rp(data[aktif].total)}</div>
              </div>
            )}
            {/* label bulan */}
            <div className="mt-1.5 flex gap-1.5">
              {data.map((d, i) => (
                <span
                  key={d.kunci}
                  className={`flex-1 text-center text-[10.5px] font-semibold ${i === aktif ? 'text-ink' : 'text-muted'}`}
                >
                  {NAMA_BULAN[d.bulan]}
                  {(d.bulan === 0 || i === 0) && <span className="block text-[9.5px]">{d.tahun}</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        className="mt-3 text-[12px] font-bold text-brand underline-offset-2 hover:underline"
        onClick={() => setTabel((t) => !t)}
      >
        {tabel ? 'Lihat grafik' : 'Lihat sebagai tabel'}
      </button>
    </div>
  )
}
