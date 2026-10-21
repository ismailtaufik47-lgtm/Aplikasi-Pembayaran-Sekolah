// Grafik perkembangan anak untuk portal orang tua.
//  - RingkasTumbuh : kartu angka utama (berapa kemampuan naik dari periode lalu)
//  - GrafikAspek   : ≤4 aspek & ≥2 periode → garis per aspek (ketuk periode → rincian);
//                    selain itu → batang posisi terakhir per aspek (+ penanda periode lalu)
//  - KartuKemampuan: batang mini per kemampuan (maks. 4 periode terakhir)
// Warna: aspek = kategorikal (--aspek-1..6, urutan tetap), skala = ordinal hijau (--skala-1..4).
import { useLayoutEffect, useRef, useState } from 'react'
import { infoNilai, daftarSkala } from './skala.js'
import { IkonT, PilSkala } from './bagian.jsx'

const warnaAspek = (i) => `var(--aspek-${(i % 6) + 1})`
const rata = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null)

/** Rata-rata nilai tiap aspek per periode (null kalau aspek itu tidak dinilai di periode tsb). */
export function seriAspek(aspek, periode) {
  return aspek.map((a, i) => ({
    id: a.id, i, nama: a.pendek,
    nilai: periode.map((p) => rata(a.indikator.map((x) => p.nilai?.[x.id]).filter((n) => n != null))),
  })).filter((s) => s.nilai.some((v) => v != null))
}

/* ---------------- kartu angka utama ---------------- */
export function RingkasTumbuh({ aspek, periode, panggil }) {
  const ind = aspek.flatMap((a) => a.indikator)
  const akhir = periode[periode.length - 1]
  const lalu = periode[periode.length - 2]
  const dinilai = ind.filter((x) => akhir?.nilai?.[x.id] != null)
  const sesuai = dinilai.filter((x) => akhir.nilai[x.id] >= 3).length
  const banding = lalu ? dinilai.filter((x) => lalu.nilai?.[x.id] != null) : []
  const naik = banding.filter((x) => akhir.nilai[x.id] > lalu.nilai[x.id]).length
  const turun = banding.filter((x) => akhir.nilai[x.id] < lalu.nilai[x.id]).length
  const pakaiNaik = banding.length > 0 && naik > 0
  return (
    <section className="kartu-saldo relative overflow-hidden rounded-[26px] p-4 pr-[104px]">
      <span className="text-[11px] font-extrabold uppercase tracking-[.08em]">{akhir.label}</span>
      {pakaiNaik ? (
        <div className="mt-1.5 flex items-end gap-3">
          <b className="font-display text-[54px] font-bold leading-[.9]">{naik}</b>
          <span className="pb-1 text-[15px] font-extrabold leading-tight">kemampuan {panggil}<br />naik dari {lalu.label.split(' ')[0]}</span>
        </div>
      ) : (
        <b className="mt-1.5 block font-display text-[22px] font-bold leading-[1.15]">
          {banding.length ? `Perkembangan ${panggil} stabil` : `Penilaian ${periode.length > 1 ? 'terbaru' : 'pertama'} ${panggil}`}
        </b>
      )}
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {banding.length > 0 && <span className="rounded-pill bg-white/70 px-2.5 py-1 text-[12px] font-extrabold dark:bg-white/10">{banding.length - naik - turun} tetap</span>}
        <span className="rounded-pill bg-white/70 px-2.5 py-1 text-[12px] font-extrabold dark:bg-white/10">{sesuai} dari {dinilai.length} sudah sesuai harapan</span>
      </div>
      <Tunas className="pointer-events-none absolute -bottom-1 right-3 h-[92px] w-[92px]" />
    </section>
  )
}

export function Tunas({ className, kecil = false }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M22 78h56l-6 20H28z" fill="#E98A5B" />
      <rect x="18" y="72" width="64" height="10" rx="4" fill="#F4A274" />
      {kecil ? (
        <>
          <path d="M50 72V56" stroke="#2E9E5F" strokeWidth="5" strokeLinecap="round" />
          <path d="M50 60c0-8 5-12 14-12 0 8-5 12-14 12z" fill="#4CC07A" /><path d="M50 64c0-6-4-10-11-10 0 6 4 10 11 10z" fill="#3DAA6B" />
        </>
      ) : (
        <>
          <path d="M50 72V40" stroke="#2E9E5F" strokeWidth="5" strokeLinecap="round" />
          <path d="M50 46c0-14 9-22 26-22 0 15-9 22-26 22z" fill="#4CC07A" />
          <path d="M50 54c0-11-7-18-21-18 0 12 7 18 21 18z" fill="#3DAA6B" />
        </>
      )}
    </svg>
  )
}

function useLebar(awal = 340) {
  const ref = useRef(null)
  const [lebar, setLebar] = useState(awal)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLebar(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, lebar]
}

/* ---------------- grafik per aspek ---------------- */
export function GrafikAspek({ aspek, periode, skala }) {
  const seri = seriAspek(aspek, periode)
  const garis = seri.length <= 4 && periode.length >= 2
  return garis ? <GrafikGaris seri={seri} periode={periode} skala={skala} /> : <GrafikBatang seri={seri} periode={periode} skala={skala} />
}

function Legenda({ seri }) {
  if (seri.length < 2) return null
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
      {seri.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5 text-[12px] font-bold">
          <i className="block h-[3px] w-4 rounded-full" style={{ background: warnaAspek(s.i) }} />{s.nama}
        </span>
      ))}
    </div>
  )
}

function GrafikGaris({ seri, periode, skala }) {
  const n = periode.length
  const [pilih, setPilih] = useState(n - 1)
  const [wadah, lebar] = useLebar()
  const tangga = daftarSkala(skala)
  const T = 188, kiri = skala === 'bintang' ? 48 : 36, kanan = 84, atas = 12, bawah = 26
  const lx = (b) => kiri + (b * (lebar - kiri - kanan)) / (n - 1)
  const ly = (v) => atas + ((4 - v) * (T - atas - bawah)) / 3
  const lebarKolom = (lebar - kiri - kanan) / (n - 1)
  const ujung = seri.map((s) => {
    const b = s.nilai.map((v, k) => (v != null ? k : -1)).filter((k) => k >= 0).pop()
    return { ...s, y: ly(s.nilai[b]) }
  }).sort((a, b) => a.y - b.y)
  for (let k = 1; k < ujung.length; k++) ujung[k].y = Math.max(ujung[k].y, ujung[k - 1].y + 15)
  const potong = (s) => {
    // garis terputus kalau ada periode tanpa nilai
    const bagian = []; let kini = []
    s.nilai.forEach((v, b) => { if (v == null) { if (kini.length) bagian.push(kini); kini = [] } else kini.push(`${lx(b)},${ly(v)}`) })
    if (kini.length) bagian.push(kini)
    return bagian
  }
  // nama di ujung garis: bagian pertama nama aspek (sebelum koma / &), maks. 13 huruf
  const singkat = (s) => { const x = s.split(/,| &| dan /)[0].trim(); return x.length > 13 ? x.slice(0, 12) + '…' : x }

  return (
    <section className="card !p-4">
      <h3 className="text-[16px] font-extrabold leading-tight">Perjalanan per aspek</h3>
      <p className="mt-0.5 text-[12px] font-semibold text-muted">Ketuk {periode[0].pendek.length > 4 ? 'periode' : 'bulan'} untuk melihat rinciannya</p>
      <Legenda seri={seri} />
      <div ref={wadah} className="relative mt-2 select-none">
        <svg width={lebar} height={T} role="img" aria-label="Grafik garis perkembangan tiap aspek" className="block overflow-visible">
          {tangga.map((t, i) => (
            <g key={t.kode}>
              <line x1={kiri} x2={lebar - kanan + 6} y1={ly(i + 1)} y2={ly(i + 1)} stroke="var(--grid-viz)" strokeWidth="1" />
              <text x={kiri - 8} y={ly(i + 1) + 4} textAnchor="end" className="fill-[#6B7385] text-[10.5px] font-bold dark:fill-[#9AA4B8]">{t.kode}</text>
            </g>
          ))}
          <line x1={lx(pilih)} x2={lx(pilih)} y1={atas - 4} y2={T - bawah + 2} stroke="#9AA6BD" strokeWidth="1.5" strokeDasharray="3 4" />
          {seri.map((s) => potong(s).map((p, k) => (
            <polyline key={s.id + k} fill="none" stroke={warnaAspek(s.i)} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={p.join(' ')} />
          )))}
          {seri.map((s) => s.nilai.map((v, b) => v != null && (
            <circle key={s.id + b} cx={lx(b)} cy={ly(v)} r={b === pilih ? 5.5 : 4} fill={warnaAspek(s.i)} stroke="rgb(var(--kartu))" strokeWidth="2" />
          )))}
          {ujung.map((s) => (
            <text key={s.id} x={lebar - kanan + 12} y={s.y + 4} className="fill-[#1B2559] text-[11.5px] font-extrabold dark:fill-[#E6EAF4]">{singkat(s.nama)}</text>
          ))}
          {periode.map((p, b) => (
            <text key={p.id} x={lx(b)} y={T - 6} textAnchor="middle" className={`text-[11.5px] ${b === pilih ? 'fill-[#1B2559] font-extrabold dark:fill-white' : 'fill-[#6B7385] font-bold dark:fill-[#9AA4B8]'}`}>{p.pendek}</text>
          ))}
          {periode.map((p, b) => (
            <rect key={'t' + p.id} x={lx(b) - lebarKolom / 2} y={0} width={lebarKolom} height={T} fill="transparent" className="cursor-pointer"
              onClick={() => setPilih(b)} onMouseEnter={() => setPilih(b)} />
          ))}
        </svg>
      </div>
      <Rincian seri={seri} periode={periode} pilih={pilih} skala={skala} />
    </section>
  )
}

function Rincian({ seri, periode, pilih, skala }) {
  return (
    <div className="mt-2 rounded-[16px] bg-[#F5F7FC] p-3 dark:bg-white/5">
      <b className="text-[12.5px] font-extrabold">{periode[pilih].label}</b>
      <div className="mt-1.5 grid gap-1.5">
        {seri.map((s) => {
          const v = s.nilai[pilih]
          const naik = pilih > 0 && v != null && s.nilai[pilih - 1] != null && v > s.nilai[pilih - 1]
          return (
            <div key={s.id} className="flex items-center gap-2 text-[12.5px] font-bold">
              <i className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warnaAspek(s.i) }} />
              <span className="min-w-0 flex-1 truncate">{s.nama.split(/,| &| dan /)[0].trim()}</span>
              {naik && <span className="text-[11px] font-extrabold text-ok-deep">▲</span>}
              <span className="shrink-0 font-extrabold">{v == null ? '—' : skala === 'bintang' ? infoNilai(skala, v).kode : infoNilai(skala, v).label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GrafikBatang({ seri, periode, skala }) {
  const n = periode.length
  const akhir = periode[n - 1]
  return (
    <section className="card !p-4">
      <h3 className="text-[16px] font-extrabold leading-tight">Posisi per aspek</h3>
      <p className="mt-0.5 text-[12px] font-semibold text-muted">{akhir.label}{n > 1 ? ` · garis tipis = ${periode[n - 2].label}` : ''}</p>
      <div className="mt-3 grid gap-3">
        {seri.map((s) => {
          const v = s.nilai[n - 1]; const lalu = n > 1 ? s.nilai[n - 2] : null
          return (
            <div key={s.id}>
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-extrabold">
                <span className="flex min-w-0 items-center gap-1.5"><i className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warnaAspek(s.i) }} /><span className="truncate">{s.nama}</span></span>
                <span className="shrink-0">{v == null ? '—' : infoNilai(skala, v).kode}{lalu != null && v > lalu && <span className="ml-1 text-ok-deep">▲</span>}</span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-pill bg-isi">
                {v != null && <i className="absolute inset-y-0 left-0 block rounded-pill" style={{ width: `${(v / 4) * 100}%`, background: warnaAspek(s.i) }} />}
                {lalu != null && <i className="absolute -inset-y-1 block w-[2px] rounded bg-[#1B2559]/45 dark:bg-white/60" style={{ left: `calc(${(lalu / 4) * 100}% - 1px)` }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2.5 flex justify-between px-0.5 text-[10.5px] font-bold text-muted">
        {daftarSkala(skala).map((t) => <span key={t.kode}>{t.kode}</span>)}
      </div>
    </section>
  )
}

/* ---------------- batang mini per kemampuan ---------------- */
export function BatangTumbuh({ nilai }) {
  const n = nilai.length
  return (
    <span className="flex h-[34px] shrink-0 items-end gap-[3px]" role="img" aria-label={`Perkembangan: ${nilai.map((v) => v ?? '-').join(', ')}`}>
      {nilai.map((v, b) => (
        v == null
          ? <i key={b} className="block h-[4px] w-[11px] rounded-[2px] bg-isi" />
          : <i key={b} className={`skala-${v} block w-[11px] rounded-t-[4px] rounded-b-[2px]`}
              style={{ height: 6 + v * 7, background: 'var(--s)', opacity: b === n - 1 ? 1 : 0.42 }} />
      ))}
    </span>
  )
}

export function KartuKemampuan({ aspek, i, periode, skala }) {
  const akhir4 = periode.slice(-4)
  const n = akhir4.length
  const ind = aspek.indikator.filter((x) => akhir4.some((p) => p.nilai?.[x.id] != null))
  if (!ind.length) return null
  return (
    <section className="card !p-0">
      <header className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-white" style={{ background: warnaAspek(i), boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / .16)' }}>
          <IkonT.tunas size={19} />
        </span>
        <b className="min-w-0 flex-1 text-[14px] font-extrabold leading-snug">{aspek.pendek}</b>
        {n > 1 && <span className="shrink-0 text-[10.5px] font-extrabold text-muted">{akhir4[0].pendek}–{akhir4[n - 1].pendek}</span>}
      </header>
      {ind.map((x) => {
        const r = akhir4.map((p) => p.nilai?.[x.id] ?? null)
        const v = r[n - 1]; const lalu = r[n - 2]
        const naik = v != null && lalu != null && v > lalu
        return (
          <div key={x.id} className="flex items-center gap-3 border-t border-line px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold leading-snug">{x.nama}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-extrabold">
                {v == null ? <span className="text-muted">Belum dinilai bulan ini</span> : skala === 'bintang' ? <PilSkala n={v} skala={skala} /> : infoNilai(skala, v).label}
                {naik && <span className="rounded-pill bg-ok-soft px-1.5 py-[1px] text-[10.5px] text-ok-deep">▲ naik</span>}
              </span>
            </span>
            {n > 1 ? <BatangTumbuh nilai={r} /> : v != null && <PilSkala n={v} skala={skala} besar />}
          </div>
        )
      })}
    </section>
  )
}

/** Keterangan skala (tangga hijau). */
export function KeteranganSkala({ skala }) {
  return (
    <div className="card !p-3.5">
      <div className="flex items-end gap-2">
        {daftarSkala(skala).map((t, k) => (
          <span key={t.kode} className="flex flex-1 flex-col items-center gap-1 text-center">
            <i className={`skala-${k + 1} block w-full rounded-t-[5px] rounded-b-[2px]`} style={{ height: 13 + k * 7, background: 'var(--s)' }} />
            <b className="text-[11px] font-extrabold">{t.kode}</b>
            {skala !== 'bintang' && <span className="text-[10.5px] font-semibold leading-tight text-muted">{t.label}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}
