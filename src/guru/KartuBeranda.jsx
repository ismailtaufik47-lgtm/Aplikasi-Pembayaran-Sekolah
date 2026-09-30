/**
 * Kartu-kartu beranda panel sekolah (desain beranda v14):
 * kartu angka, rekap kas, perlu ditagih, aksi cepat, transaksi terbaru,
 * dan kartu Tanya SAKU. Grafik (arus kas & status SPP) ada di GrafikBeranda.jsx.
 *
 * Semua kartu menerima data yang sudah jadi dari Beranda.jsx — tidak
 * memanggil server sendiri — jadi mudah diuji & tidak dobel muat.
 */
import { useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Chip, Kosong, Tile } from '../components/ui.jsx'
import { KoinSaku } from '../components/Gambar.jsx'
import { SERI } from './GrafikLaporan.jsx'
import { rp } from '../lib/format.js'

/* ---------------- ikon garis (24×24, sama gayanya dengan Ikon di ui.jsx) ---------------- */
const G = (isi) => ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    {isi}
  </svg>
)

export const Garis = {
  masuk: G(<><path d="M17 7 7 17" /><path d="M7 9v8h8" /></>),
  keluar: G(<><path d="M7 17 17 7" /><path d="M9 7h8v8" /></>),
  dompet: G(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18M16.5 14.8h1" /></>),
  siswa: G(<><circle cx="9.5" cy="8.5" r="3.2" /><path d="M3.5 19c.9-3.2 3.3-4.7 6-4.7s5.1 1.5 6 4.7" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19c-.3-1.6-.8-2.9-1.6-3.9 2.2.2 3.9 1.6 4.6 3.9" /></>),
  kalender: G(<><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>),
  jam: G(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.2 2" /></>),
  lonceng: G(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  plus: G(<path d="M12 5v14M5 12h14" />),
  muat: G(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4.5V11h-6.5" /></>),
  kanan: G(<path d="m9 6 6 6-6 6" />),
  kirim: G(<><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>),
  robot: G(<><rect x="4" y="8" width="16" height="11" rx="4" /><path d="M12 4.5V8M2 12.5V15M22 12.5V15" /><circle cx="12" cy="3.6" r="1" /><path d="M9.2 13h.01M14.8 13h.01" strokeWidth="2.8" /></>),
  orangPlus: G(<><circle cx="10" cy="8" r="3.4" /><path d="M3 20c1-3.6 3.8-5.2 7-5.2 1.6 0 3.1.4 4.3 1.2" /><path d="M19 13v6M16 16h6" /></>),
  grafik: G(<path d="M6 20V11M12 20V5M18 20v-6" />),
  nota: G(<><path d="M6 3h8l4 4v14l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 10h6M9 14h4" /></>),
  label: G(<><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8.3" cy="8.3" r="1.4" /></>),
  riwayat: G(<><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4.5V9h4.5" /><path d="M12 8v4.5l3 1.8" /></>),
  rumah: G(<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />),
}

/* ---------------- potongan kecil yang dipakai bersama ---------------- */

/** Rupiah bertanda: +Rp… / −Rp… */
export const rpTanda = (n, plus = true) => (n < 0 ? '−' + rp(-n) : (plus ? '+' : '') + rp(n))

/** Kepala kartu: judul + keterangan di kiri, aksi di kanan. */
export const KepalaKartu = ({ judul, sub, kanan, className = 'mb-4' }) => (
  <div className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 ${className}`}>
    <div className="min-w-0">
      <h2 className="judul-kartu text-[17.5px] leading-tight lg:text-[18px]">{judul}</h2>
      {sub && <p className="mt-0.5 text-[12.5px] font-medium text-muted">{sub}</p>}
    </div>
    {kanan}
  </div>
)

export const Tautan = ({ children, ...p }) => (
  <button type="button" {...p} className="flex shrink-0 items-center gap-0.5 py-0.5 text-[13px] font-bold text-brand">
    {children}
    <Garis.kanan size={15} />
  </button>
)

/** Tombol pilihan kecil berbentuk pil (mis. Semua · Masuk · Keluar). */
export function PilihPil({ pilihan, nilai, ubah, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-full bg-isi p-1 text-[11.5px] font-bold">
      {pilihan.map(([id, teks]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={nilai === id}
          onClick={() => ubah(id)}
          className={`rounded-full px-2.5 py-1 font-extrabold ${nilai === id ? 'permen permen-kecil permen-biru' : 'text-muted'}`}
        >
          {teks}
        </button>
      ))}
    </div>
  )
}

const Kerangka = ({ className = '' }) => <span className={`inline-block animate-pulse rounded-lg bg-isi align-middle ${className}`} />

/* ---------------- kartu angka (KPI) ---------------- */

export function KartuAngka({ warna, ikon, label, nilai, kaki, kanan, memuat }) {
  return (
    <div className="card flex min-w-0 flex-col p-3.5 lg:p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <Tile warna={warna}>{ikon}</Tile>
        {kanan}
      </div>
      <div className="mt-3 text-[12.5px] font-semibold leading-tight text-muted lg:text-[13px]">{label}</div>
      <div className="mt-1 truncate text-[17px] font-extrabold leading-tight tracking-tight lg:text-[22px] 2xl:text-2xl">
        {memuat ? <Kerangka className="h-6 w-24" /> : nilai}
      </div>
      <div className="mt-auto pt-2 text-[11.5px] font-semibold leading-snug text-muted lg:text-xs">
        {memuat ? <Kerangka className="h-3 w-20" /> : kaki}
      </div>
    </div>
  )
}

/** Chip perbandingan dengan bulan lalu. naikBaik=false untuk pengeluaran. */
export function ChipBanding({ kini, lalu, labelLalu, naikBaik = true }) {
  if (!lalu || kini == null) return null
  const persen = Math.round((kini / lalu - 1) * 100)
  if (!Number.isFinite(persen)) return null
  const datar = persen === 0
  const naik = persen > 0
  const warna = datar ? 'grey' : naik === naikBaik ? 'green' : 'amber'
  return (
    <span title={`Dibanding ${labelLalu}`}>
      <Chip warna={warna}>
        <span aria-hidden="true">{datar ? '= ' : naik ? '↑ ' : '↓ '}</span>
        {Math.abs(persen)}%<span className="hidden lg:inline"> vs {labelLalu}</span>
      </Chip>
    </span>
  )
}

/** Grafik garis kecil (saldo per akhir bulan). Hanya tampil di layar lebar. */
export function Sparkline({ nilai, warna = '#8B5CF6', lebar = 92, tinggi = 36 }) {
  if (!nilai || nilai.length < 2) return null
  const pad = 4
  const lo = Math.min(...nilai)
  const hi = Math.max(...nilai)
  const rentang = hi - lo || 1
  const titik = nilai.map((v, i) => [
    pad + (i * (lebar - 2 * pad)) / (nilai.length - 1),
    tinggi - pad - ((v - lo) / rentang) * (tinggi - 2 * pad),
  ])
  const d = 'M' + titik.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  const [lx, ly] = titik[titik.length - 1]
  const naik = nilai[nilai.length - 1] >= nilai[0]
  return (
    <svg
      width={lebar}
      height={tinggi}
      viewBox={`0 0 ${lebar} ${tinggi}`}
      className="hidden shrink-0 overflow-visible lg:block"
      role="img"
      aria-label={`Saldo kas ${nilai.length} bulan terakhir ${naik ? 'naik' : 'turun'}`}
    >
      <path d={`${d} L${lx.toFixed(1)} ${tinggi} L${titik[0][0].toFixed(1)} ${tinggi} Z`} fill={warna} fillOpacity=".1" />
      <path d={d} fill="none" stroke={warna} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="4" fill={warna} stroke="rgb(var(--kartu))" strokeWidth="2" />
    </svg>
  )
}

/* ---------------- rekap kas bulan ini ---------------- */

function BarisBatang({ label, nilai, lebar, warna, ekor, tebal = 'h-1.5' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
        <span className="min-w-0 truncate font-semibold text-muted">{label}</span>
        <span className="shrink-0 whitespace-nowrap font-extrabold">
          {nilai}
          {ekor}
        </span>
      </div>
      <div className={`mt-1.5 overflow-hidden rounded-full bg-isi ${tebal}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(lebar > 0 ? 2 : 0, Math.min(100, lebar))}%`, background: warna }} />
      </div>
    </div>
  )
}

/** Kategori pengeluaran: 4 terbesar + sisanya digabung "Lainnya" (maks 5 baris). */
function ringkasKategori(daftar = []) {
  const urut = [...daftar].sort((a, b) => b.nominal - a.nominal)
  if (urut.length <= 5) return urut
  const sisa = urut.slice(4).reduce((t, k) => t + k.nominal, 0)
  return [...urut.slice(0, 4), { kategori: `Lainnya (${urut.length - 4} kategori)`, nominal: sisa }]
}

export function RekapKas({ lap, keluarLalu, labelBulan, labelLalu, memuat, galat, onBuka, onCatatKeluar }) {
  const masuk = lap?.totalMasuk || 0
  const keluar = lap?.totalKeluar || 0
  const selisih = masuk - keluar
  const maks = Math.max(masuk, keluar, 1)
  const kategori = ringkasKategori(lap?.keluarPerKategori)
  const persen = kategori.map((k) => (keluar ? Math.round((k.nominal / keluar) * 100) : 0))

  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu judul={`Rekap kas ${labelBulan}`} sub="Dari buku kas sekolah" kanan={onBuka && <Tautan onClick={onBuka}>Buka kas</Tautan>} />
      {galat ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[12.5px] font-semibold text-danger">{galat}</p>
      ) : memuat ? (
        <div className="space-y-3">
          <Kerangka className="h-9 w-full" />
          <Kerangka className="h-9 w-full" />
          <Kerangka className="h-24 w-full" />
        </div>
      ) : (
        <>
          <BarisBatang label="Pemasukan" nilai={rp(masuk)} lebar={(masuk / maks) * 100} warna={SERI.masuk} tebal="h-2.5" />
          <div className="h-2.5" />
          <BarisBatang label="Pengeluaran" nilai={rp(keluar)} lebar={(keluar / maks) * 100} warna={SERI.keluar} tebal="h-2.5" />
          <div
            className={`mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[13px] font-extrabold ${
              selisih >= 0 ? 'bg-ok-soft text-ok-deep' : 'bg-danger-soft text-danger'
            }`}
          >
            <span>Selisih bulan ini</span>
            <span className="whitespace-nowrap">{rpTanda(selisih)}</span>
          </div>

          <div className="mb-2.5 mt-5 flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-extrabold">Pengeluaran per kategori</span>
            <ChipBanding kini={keluar} lalu={keluarLalu} labelLalu={labelLalu} naikBaik={false} />
          </div>
          {kategori.length === 0 ? (
            <div className="rounded-xl bg-isi px-3.5 py-4 text-center text-[12.5px] font-semibold text-muted">
              Belum ada pengeluaran tercatat bulan ini.
              {onCatatKeluar && (
                <button type="button" onClick={onCatatKeluar} className="mt-2 block w-full font-bold text-brand">
                  + Catat pengeluaran
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {kategori.map((k, i) => (
                <BarisBatang
                  key={k.kategori}
                  label={k.kategori}
                  nilai={rp(k.nominal)}
                  lebar={keluar ? (k.nominal / keluar) * 100 : 0}
                  warna={SERI.keluar}
                  ekor={<span className="inline-block w-10 text-right text-[12px] font-semibold text-muted">{persen[i]}%</span>}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- perlu ditagih ---------------- */

/**
 * daftar: [{ s, nominal, label }] sudah urut dari tunggakan terbesar.
 * HP menampilkan 3 siswa, layar lebar 4.
 */
export function PerluDitagih({ daftar, total, onBuka, onSemua }) {
  const lebih = (n) => daftar.length - n
  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu
        judul="Perlu ditagih"
        sub={daftar.length ? `${daftar.length} siswa · total ${rp(total)}` : 'SPP yang sudah lewat jatuh tempo'}
        kanan={onSemua && daftar.length > 0 && <Tautan onClick={onSemua}>Lihat semua</Tautan>}
        className="mb-1.5"
      />
      {daftar.length === 0 ? (
        <Kosong>Tidak ada SPP yang lewat jatuh tempo. 🎉</Kosong>
      ) : (
        <>
          <div>
            {daftar.slice(0, 4).map(({ s, nominal, label }, i) => (
              <button
                key={s.id}
                type="button"
                onClick={onBuka ? () => onBuka(s.id) : undefined}
                className={`w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0 ${
                  i === 3 ? 'hidden lg:flex' : 'flex'
                } ${i === 2 && daftar.length > 3 ? 'max-lg:border-b-0' : ''}`}
              >
                <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{s.nama}</span>
                  <span className="block truncate text-[12px] text-muted">Kelas {s.kelas} · NIS {s.nis}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1 text-right">
                  {label && <Chip warna={label.warna}>{label.teks}</Chip>}
                  <span className="text-[13.5px] font-extrabold text-danger">{rp(nominal)}</span>
                </span>
              </button>
            ))}
          </div>
          {lebih(3) > 0 && onSemua && (
            <div className={`mt-auto pt-3 ${lebih(4) > 0 ? '' : 'lg:hidden'}`}>
              <button type="button" onClick={onSemua} className="w-full rounded-xl bg-isi py-2.5 text-center text-[12.5px] font-bold text-muted">
                <span className="lg:hidden">+{lebih(3)} siswa lain</span>
                <span className="hidden lg:inline">+{lebih(4)} siswa lain</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- aksi cepat ---------------- */

/** Warna ubin permen per jenis aksi (lihat daftar aksi di Beranda.jsx). */
const PERMEN_AKSI = {
  catat: 'biru', keluar: 'pink', masuk: 'tosca', siswa: 'ungu', 'data-siswa': 'ungu', laporan: 'kuning',
  biaya: 'pink', riwayat: 'tosca', kas: 'kuning', sekolah: 'biru',
}

/** aksi: [{ k, ikon, label, pendek?, onClick }] */
export function AksiCepat({ aksi }) {
  return (
    <div className="card hidden min-w-0 flex-col lg:flex lg:p-5">
      <KepalaKartu judul="Aksi cepat" sub="Pekerjaan yang paling sering dilakukan" />
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2.5 [&>:last-child:nth-child(odd)]:col-span-2">
        {aksi.slice(0, 6).map((a) => (
          <button
            key={a.k}
            type="button"
            onClick={a.onClick}
            className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-line bg-kartu px-2 py-3 text-center text-[12.5px] font-extrabold leading-tight transition hover:border-brand/40 active:scale-95"
          >
            <span className={`permen permen-kecil permen-${PERMEN_AKSI[a.k] || 'biru'} grid h-[44px] w-[44px] place-items-center rounded-[14px]`}>{a.ikon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Versi HP: kartu berisi satu baris ubin permen (≤5 → rata, lebih → bisa digeser). */
export function AksiCepatHp({ aksi }) {
  const rata = aksi.length <= 5
  return (
    <div className="card lg:hidden">
      <KepalaKartu judul="Aksi cepat" className="mb-3" />
      <div className={rata ? 'grid grid-cols-5 gap-1' : 'noscroll -mx-4 flex gap-1.5 overflow-x-auto px-3'}>
        {aksi.map((a) => (
          <button
            key={a.k}
            type="button"
            onClick={a.onClick}
            className={`flex min-w-0 flex-col items-center gap-1.5 text-center text-[10.5px] font-extrabold leading-tight active:scale-95 ${rata ? '' : 'w-[70px] shrink-0'}`}
          >
            <span className={`permen permen-${PERMEN_AKSI[a.k] || 'biru'} grid h-[50px] w-[50px] place-items-center rounded-[16px]`}>{a.ikon}</span>
            {a.pendek || a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------- transaksi terbaru ---------------- */

/**
 * item: [{ id, jenis: 'masuk'|'keluar', judul, sub, kategori, tglPendek, tglPanjang, nominal, onClick }]
 * HP menampilkan 4 baris, layar lebar 6.
 */
export function TransaksiTerbaru({ item, memuat, bolehKas, onSemua }) {
  const [saring, setSaring] = useState('semua')
  const daftar = (saring === 'semua' ? item : item.filter((t) => t.jenis === saring)).slice(0, 6)
  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu
        judul={bolehKas ? 'Transaksi terbaru' : 'Pembayaran terbaru'}
        sub={bolehKas ? 'Pembayaran siswa & buku kas sekolah' : 'SPP & biaya kegiatan'}
        className="mb-1.5"
        kanan={
          <div className="flex items-center gap-3">
            {bolehKas && (
              <PilihPil label="Saring transaksi" nilai={saring} ubah={setSaring} pilihan={[['semua', 'Semua'], ['masuk', 'Masuk'], ['keluar', 'Keluar']]} />
            )}
            {onSemua && <Tautan onClick={onSemua}>Semua</Tautan>}
          </div>
        }
      />
      {memuat && item.length === 0 ? (
        <div className="space-y-3 py-2">
          {[0, 1, 2].map((i) => <Kerangka key={i} className="h-10 w-full" />)}
        </div>
      ) : daftar.length === 0 ? (
        <Kosong>{saring === 'keluar' ? 'Belum ada pengeluaran dalam 30 hari terakhir.' : 'Belum ada transaksi tercatat.'}</Kosong>
      ) : (
        <div>
          {daftar.map((t, i) => {
            const masuk = t.jenis === 'masuk'
            return (
              <button
                key={t.id}
                type="button"
                onClick={t.onClick}
                className={`w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0 lg:grid lg:grid-cols-[40px_minmax(0,1fr)_128px_96px_136px] lg:gap-x-3.5 ${
                  i >= 4 ? 'hidden' : 'flex'
                } ${i === 3 && daftar.length > 4 ? 'max-lg:border-b-0' : ''}`}
              >
                <span
                  className={`permen permen-kecil grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${masuk ? 'permen-tosca' : 'permen-pink'}`}
                  aria-label={masuk ? 'Masuk' : 'Keluar'}
                >
                  {masuk ? <Garis.masuk size={19} /> : <Garis.keluar size={19} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{t.judul}</span>
                  <span className="block truncate text-[12px] text-muted">
                    <span className="lg:hidden">{t.kategori} · {t.tglPendek}</span>
                    <span className="hidden lg:inline">{t.sub}</span>
                  </span>
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="inline-block max-w-full truncate rounded-pill bg-isi px-2.5 py-1 align-middle text-[11px] font-bold text-muted">{t.kategori}</span>
                </span>
                <span className="hidden whitespace-nowrap text-[12.5px] font-semibold text-muted lg:block">{t.tglPanjang}</span>
                <span className={`shrink-0 whitespace-nowrap text-right text-[13.5px] font-extrabold lg:text-[14px] ${masuk ? 'text-ok-deep' : 'text-danger'}`}>
                  {masuk ? '+' : '−'}
                  {rp(t.nominal)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------------- Tanya SAKU ---------------- */

/** saran: [{ ikon, label, tanya }] — HP menampilkan 3, layar lebar 5. */
export function KartuSaku({ saran, onTanya }) {
  const [teks, setTeks] = useState('')
  const kirim = (e) => {
    e.preventDefault()
    if (teks.trim()) onTanya(teks.trim())
  }
  return (
    <div className="card latar-saku flex min-w-0 flex-col lg:p-5">
      <div className="mb-3.5 flex items-center gap-3">
        <span className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[18px] bg-[#EAF0FE] dark:bg-white/10">
          <KoinSaku className="h-[50px] w-[50px]" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="judul-kartu text-[18px] leading-tight">Tanya SAKU</h2>
            <Chip warna="blue">Asisten AI</Chip>
          </div>
          <p className="mt-0.5 text-[12.5px] font-medium text-muted">Sahabat Keuangan Sekolah · siap 24 jam</p>
        </div>
      </div>

      <form onSubmit={kirim} className="flex items-center gap-2 rounded-[14px] border border-[#D1D9EC] bg-kartu py-1.5 pl-3.5 pr-1.5 focus-within:border-brand">
        <input
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          aria-label="Pertanyaan untuk SAKU"
          placeholder="Tanya soal kas, SPP, tunggakan…"
          maxLength={300}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] font-medium text-ink outline-none placeholder:text-[#8A93A6]"
        />
        <button
          type="submit"
          aria-label="Kirim pertanyaan"
          disabled={!teks.trim()}
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-brand text-white transition disabled:opacity-50"
        >
          <Garis.kirim size={18} />
        </button>
      </form>

      <div className="mb-2 mt-4 text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Pertanyaan cepat</div>
      <div className="flex flex-1 flex-col gap-1.5">
        {saran.slice(0, 5).map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onTanya(s.tanya || s.label)}
            className={`w-full items-center gap-2.5 rounded-xl border border-line bg-kartu px-3 py-2.5 text-left text-[13px] font-semibold transition hover:border-brand/40 ${
              i >= 3 ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <span className="text-brand">{s.ikon}</span>
            <span className="min-w-0 flex-1">{s.label}</span>
            <Garis.kanan size={15} className="text-[#A3ABBB]" />
          </button>
        ))}
      </div>
    </div>
  )
}
