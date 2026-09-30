/**
 * Potongan tampilan bersama untuk menu Laporan (tab Pembayaran & Keuangan):
 * kepala halaman, tab, kartu angka (KPI), grafik batang berkelompok, donut,
 * dan banner info. Grafik digambar dengan HTML/SVG murni tanpa library.
 *
 * Warna seri grafik sudah dicek aman untuk buta warna (validator dataviz),
 * di mode terang maupun gelap:
 *   Pembayaran: SPP #3B6EF6 · Biaya kegiatan #EC4899
 *   Keuangan  : Masuk #2563EB · Keluar #EA580C
 */
import { useState } from 'react'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import { rp } from '../lib/format.js'

export const SERI = {
  spp: '#3B6EF6',
  kegiatan: '#EC4899',
  masuk: '#2563EB',
  keluar: '#EA580C',
}
export const STATUS = { lunas: '#22C55E', sebagian: '#F5A524', belum: '#EF4444' }

/** Rupiah ringkas untuk sumbu grafik: 1,5 jt · 750 rb · 0 */
export function rpRingkas(n) {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('id-ID')} rb`
  return String(Math.round(n))
}

/* ---------- tab Pembayaran | Keuangan (sakelar permen) ---------- */
const IKON_TAB = {
  pembayaran: <><path d="M6 3h8l4 4v14l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 10h6M9 14h4" /></>,
  keuangan: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18M16.5 14.8h1" /></>,
}
export function TabLaporan({ tab, pilih, ada = ['pembayaran', 'keuangan'] }) {
  const daftar = [
    { id: 'pembayaran', warna: 'pink', label: 'Pembayaran', sub: 'SPP & kegiatan' },
    { id: 'keuangan', warna: 'kuning', label: 'Keuangan', sub: 'Kas sekolah' },
  ].filter((t) => ada.includes(t.id))
  return (
    <div className="flex gap-1 rounded-[20px] bg-kartu/70 p-1 shadow-[0_4px_14px_rgba(30,64,140,.06)] dark:bg-white/5 sm:inline-flex" role="tablist">
      {daftar.map((t) => {
        const on = tab === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => pilih(t.id)}
            className={`flex flex-1 items-center justify-center gap-2.5 rounded-[16px] px-3 py-2 transition sm:flex-none sm:justify-start sm:px-4 ${
              on ? `permen permen-kecil permen-${t.warna}` : 'text-muted hover:text-ink'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">{IKON_TAB[t.id]}</svg>
            <span className="text-left leading-tight">
              <span className="block text-[14px] font-extrabold">{t.label}</span>
              <span className="block text-[11px] font-semibold opacity-80">{t.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- kepala bagian: ikon + judul di kiri, tombol di kanan ---------- */
export function KepalaLaporan({ e, judul, sub, aksi }) {
  return (
    <div className="mt-4 flex flex-col gap-3 lg:mt-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="permen permen-biru grid h-12 w-12 shrink-0 place-items-center rounded-[16px] text-[24px]" style={FONT_EMOJI}>{e}</span>
        <div className="min-w-0">
          <h2 className="judul-kartu text-[20px] leading-tight lg:text-[23px]">{judul}</h2>
          <p className="text-[12.5px] font-semibold text-muted lg:text-[13.5px]">{sub}</p>
        </div>
      </div>
      {aksi && <div className="flex gap-2 sm:flex-wrap lg:shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">{aksi}</div>}
    </div>
  )
}

/** pendek = label untuk layar HP (mis. "PDF"), children = label lengkap. */
export const TombolAksi = ({ utama, ikon, pendek, children, ...p }) => (
  <button
    {...p}
    className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[14px] px-3 py-2.5 text-[13px] font-extrabold transition active:translate-y-px disabled:opacity-60 sm:gap-2 sm:px-4 sm:text-[13.5px] ${
      utama ? 'bg-brand text-white hover:bg-brand-deep' : 'tombol-putih text-ink'
    }`}
  >
    {ikon && <span className="text-[15px]" style={FONT_EMOJI}>{ikon}</span>}
    {pendek ? <><span className="sm:hidden">{pendek}</span><span className="hidden sm:inline">{children}</span></> : children}
  </button>
)

/** Tombol filter bergaya dropdown (dipakai untuk periode & tahun ajaran). */
export function Pilihan({ e, children, ...p }) {
  return (
    <label className="flex items-center gap-2 rounded-pill border-[1.5px] border-[#DCE6F4] bg-kartu px-3.5 py-2.5 text-[13px] font-bold dark:border-line">
      <span style={FONT_EMOJI}>{e}</span>
      {p.value !== undefined ? (
        <select className="min-w-0 bg-transparent font-bold text-ink outline-none" {...p}>{children}</select>
      ) : (
        <span>{children}</span>
      )}
    </label>
  )
}

/* ---------- kartu angka ---------- */
const TILE = {
  blue: 'permen permen-kecil permen-biru',
  amber: 'permen permen-kecil permen-kuning',
  grape: 'permen permen-kecil permen-ungu',
  green: 'permen permen-kecil permen-tosca',
  red: 'permen permen-kecil permen-pink',
  grey: 'permen permen-kecil permen-abu',
}

/**
 * tren: { teks, arah: 'naik'|'turun'|'datar', baik: true|false|null }
 *   baik=true → hijau, false → merah, null → abu (netral)
 */
export function KartuKpi({ warna = 'blue', e, label, nilai, tren, kaki }) {
  const warnaTren = tren?.baik === true ? 'text-ok-deep' : tren?.baik === false ? 'text-danger' : 'text-muted'
  const panah = tren?.arah === 'naik' ? '↑' : tren?.arah === 'turun' ? '↓' : '↔'
  return (
    <div className="card flex min-w-0 flex-col p-3.5 lg:p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-[13px] text-[19px] ${TILE[warna]}`} style={FONT_EMOJI}>{e}</span>
      <div className="mt-2.5 text-[12.5px] font-semibold text-muted">{label}</div>
      <div className="mt-0.5 whitespace-nowrap font-display text-[18px] font-semibold leading-tight sm:text-[20px] xl:text-[18px] 2xl:text-[21px]">{nilai}</div>
      {tren && (
        <div className={`mt-1.5 text-[11.5px] font-bold ${warnaTren}`}>
          <span aria-hidden>{panah} </span>{tren.teks}
        </div>
      )}
      {kaki && <div className="mt-auto border-t border-line pt-2 text-[11px] font-semibold text-muted [margin-top:10px]">{kaki}</div>}
    </div>
  )
}

/* ---------- kartu dengan judul ---------- */
export function KartuJudul({ e, judul, sub, kanan, children, className = '' }) {
  return (
    <div className={`card min-w-0 ${className}`}>
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-[170px] flex-1 items-center gap-2.5">
          <span className="permen permen-kecil permen-abu grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-[17px]" style={FONT_EMOJI}>{e}</span>
          <div className="min-w-0">
            <div className="judul-kartu text-[17px] leading-tight">{judul}</div>
            {sub && <div className="text-[12px] text-muted">{sub}</div>}
          </div>
        </div>
        {kanan}
      </div>
      {children}
    </div>
  )
}

export function PilihRentang({ nilai, ubah }) {
  return (
    <div className="flex shrink-0 rounded-full bg-isi p-1 text-[11.5px] font-extrabold">
      {[
        [6, '6 Bulan'],
        [12, '1 Tahun'],
      ].map(([n, l]) => (
        <button key={n} className={`rounded-full px-2.5 py-1 ${nilai === n ? 'bg-kartu text-brand shadow-soft' : 'text-muted'}`} onClick={() => ubah(n)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/* ---------- grafik batang berkelompok (2 seri) ---------- */
/** Batas atas sumbu = 4 × langkah "bulat" (1 · 2 · 2,5 · 5 × 10ⁿ), supaya label sumbu rapi. */
function batasAtas(maks) {
  if (maks <= 0) return 1
  const kasar = maks / 4
  const p = 10 ** Math.floor(Math.log10(kasar))
  const langkah = [1, 1.5, 2, 2.5, 5, 10].find((k) => k * p >= kasar)
  return langkah * p * 4
}

/**
 * data: [{ label, nilai: [n1, n2] }], seri: [{ nama, warna }]
 */
export function GrafikBatang({ data, seri, tinggi = 170 }) {
  const [aktif, setAktif] = useState(null)
  const atas = batasAtas(Math.max(0, ...data.flatMap((d) => d.nilai)))
  const garis = [1, 0.75, 0.5, 0.25, 0]
  const semuaNol = data.every((d) => d.nilai.every((v) => !v))

  return (
    <div>
      <div className="relative flex gap-2">
        {/* sumbu Y */}
        <div className="flex shrink-0 flex-col justify-between pb-6 text-right text-[10.5px] font-semibold text-muted" style={{ height: tinggi + 24 }}>
          {garis.map((g) => <span key={g} className="leading-none">{rpRingkas(atas * g)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* garis bantu */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: tinggi }}>
            {garis.map((g) => <div key={g} className={`border-t ${g === 0 ? 'border-line' : 'border-dashed border-line/70'}`} />)}
          </div>
          <div className="relative flex items-end" style={{ height: tinggi + 24 }}>
            {data.map((d, i) => (
              <div
                key={d.label}
                className="relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setAktif(i)}
                onMouseLeave={() => setAktif(null)}
                onClick={() => setAktif(aktif === i ? null : i)}
              >
                <div className={`flex w-full items-end justify-center gap-[2px] rounded-t-lg transition ${aktif === i ? 'bg-isi/70' : ''}`} style={{ height: tinggi }}>
                  {d.nilai.map((v, k) => (
                    <div
                      key={k}
                      className="w-[30%] max-w-[16px] rounded-t-[4px]"
                      style={{ height: v > 0 ? Math.max(3, (v / atas) * tinggi) : 0, background: seri[k].warna }}
                    />
                  ))}
                </div>
                <span className="mt-1.5 h-[18px] text-[11px] font-semibold text-muted">{d.label}</span>
                {aktif === i && (
                  <div
                    className={`absolute bottom-[calc(100%-8px)] z-10 w-max min-w-[140px] rounded-xl border border-line bg-kartu p-2.5 text-[12px] shadow-soft ${
                      i > data.length / 2 ? 'right-0' : 'left-0'
                    }`}
                  >
                    <div className="mb-1 font-extrabold">{d.judul || d.label}</div>
                    {seri.map((s, k) => (
                      <div key={s.nama} className="flex items-center gap-1.5">
                        <i className="h-2 w-2 rounded-full" style={{ background: s.warna }} />
                        <span className="flex-1 text-muted">{s.nama}</span>
                        <b>{rp(d.nilai[k])}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {semuaNol && <div className="absolute inset-x-0 top-[40%] text-center text-[12.5px] text-muted">Belum ada data</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-4 text-[12px] font-semibold text-muted">
        {seri.map((s) => (
          <span key={s.nama} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.warna }} />{s.nama}</span>
        ))}
      </div>
    </div>
  )
}

/* ---------- donut ---------- */
export function Donut({ segmen, ukuran = 124, tebal = 16, children }) {
  const R = (ukuran - tebal) / 2
  const C = 2 * Math.PI * R
  const total = segmen.reduce((t, s) => t + s.nilai, 0)
  const celah = segmen.filter((s) => s.nilai > 0).length > 1 ? 3 : 0 // jarak antar potongan
  let off = 0
  return (
    <div className="relative shrink-0" style={{ width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} viewBox={`0 0 ${ukuran} ${ukuran}`} className="-rotate-90">
        <circle cx={ukuran / 2} cy={ukuran / 2} r={R} fill="none" stroke="rgb(var(--isi))" strokeWidth={tebal} />
        {total > 0 &&
          segmen.map((s) => {
            if (!s.nilai) return null
            const pj = (s.nilai / total) * C
            const el = (
              <circle
                key={s.label}
                cx={ukuran / 2}
                cy={ukuran / 2}
                r={R}
                fill="none"
                stroke={s.warna}
                strokeWidth={tebal}
                strokeDasharray={`${Math.max(0, pj - celah)} ${C - Math.max(0, pj - celah)}`}
                strokeDashoffset={-off}
              >
                <title>{`${s.label}: ${s.nilai}`}</title>
              </circle>
            )
            off += pj
            return el
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export const BarisLegenda = ({ warna, label, nilai, persen }) => (
  <div className="flex items-center gap-2 text-[13px]">
    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warna }} />
    <span className="min-w-0 flex-1 font-semibold leading-tight text-muted">{label}</span>
    <span className="shrink-0 whitespace-nowrap font-extrabold">
      {nilai}
      {persen !== undefined && <span className="ml-1 text-[11.5px] font-semibold text-muted">{persen}%</span>}
    </span>
  </div>
)

/* ---------- banner info ---------- */
export function Banner({ nada = 'info', e = 'ℹ️', children, aksi }) {
  const gaya = {
    info: 'bg-brand-soft text-brand',
    warn: 'bg-warn-soft text-warn-deep',
    ok: 'bg-ok-soft text-ok-deep',
  }[nada]
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3 ${gaya}`}>
      <span className="text-[17px]" style={FONT_EMOJI}>{e}</span>
      <span className="min-w-[200px] flex-1 text-[13px] font-semibold leading-snug">{children}</span>
      {aksi}
    </div>
  )
}
