/**
 * Dua kartu ringkasan untuk beranda: grafik batang pemasukan SPP per
 * bulan (aktual vs target) dan donut status pembayaran seluruh siswa.
 *
 * Digambar dengan SVG murni — tidak menambah library chart apa pun,
 * jadi bundle tetap ringan. Semua angka dihitung dari data yang sudah
 * ada di store (pembayaran + siswa), bukan angka karangan.
 */
import { useMemo, useState } from 'react'
import { BULAN, bulanBerjalan, rp, statusRingkasSiswa } from '../lib/format.js'

/* ---------------- Grafik batang pemasukan SPP per bulan ---------------- */

export function GrafikPembayaran({ pembayaran, siswa, pengaturan }) {
  const [rentang, setRentang] = useState(6) // 6 bulan terakhir | 12 (setahun)
  const kini = bulanBerjalan()

  const data = useMemo(() => {
    // Jumlahkan pemasukan SPP per periode (0..11 = Juli..Juni).
    const masukPer = Array(12).fill(0)
    pembayaran.forEach((p) => {
      if (p.jenis === 'spp' && p.indeks >= 0 && p.indeks < 12) masukPer[p.indeks] += p.nominal
    })
    const target = siswa.length * pengaturan.sppNominal // target penuh 1 bulan

    const mulai = rentang === 12 ? 0 : Math.max(0, kini - 5)
    const akhir = rentang === 12 ? 11 : kini
    const keluar = []
    for (let i = mulai; i <= akhir; i++) {
      keluar.push({ label: BULAN[i].slice(0, 3), masuk: masukPer[i], target })
    }
    return keluar
  }, [pembayaran, siswa, pengaturan, rentang, kini])

  const maks = Math.max(...data.map((d) => Math.max(d.masuk, d.target)), 1)
  const tinggiPlot = 150
  const skala = (v) => (v / maks) * tinggiPlot

  return (
    <div className="card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-extrabold">
            <span>📊</span> Grafik pembayaran
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">Pemasukan SPP per bulan</div>
        </div>
        <div className="flex rounded-full bg-[#EEF2F8] p-1 text-[11.5px] font-bold">
          <button
            className={`rounded-full px-2.5 py-1 ${rentang === 6 ? 'bg-white text-brand shadow-[0_1px_3px_rgba(21,26,38,.1)]' : 'text-muted'}`}
            onClick={() => setRentang(6)}
          >
            6 Bulan
          </button>
          <button
            className={`rounded-full px-2.5 py-1 ${rentang === 12 ? 'bg-white text-brand shadow-[0_1px_3px_rgba(21,26,38,.1)]' : 'text-muted'}`}
            onClick={() => setRentang(12)}
          >
            1 Tahun
          </button>
        </div>
      </div>

      <div className="flex items-end gap-2" style={{ height: tinggiPlot + 24 }}>
        {data.map((d) => {
          const tMasuk = skala(d.masuk)
          const tTarget = skala(d.target)
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-end justify-center gap-1" style={{ height: tinggiPlot }}>
                {/* target di belakang (abu), aktual di depan (biru) */}
                <div
                  className="w-2.5 rounded-t-[4px] bg-[#DDE6F5] sm:w-3.5"
                  style={{ height: Math.max(2, tTarget) }}
                  title={`Target ${rp(d.target)}`}
                />
                <div
                  className="w-2.5 rounded-t-[4px] bg-brand sm:w-3.5"
                  style={{ height: Math.max(2, tMasuk) }}
                  title={`Masuk ${rp(d.masuk)}`}
                />
              </div>
              <span className="text-[11px] font-semibold text-muted">{d.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11.5px] font-semibold text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-brand" /> Pembayaran</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#DDE6F5]" /> Target</span>
      </div>
    </div>
  )
}

/* ---------------- Donut status pembayaran seluruh siswa ---------------- */

export function StatusPembayaran({ siswa, pengaturan }) {
  const kini = bulanBerjalan()

  /**
   * Beda dari sebelumnya: ini TIDAK cuma lihat bulan berjalan. Kalau
   * dilihat cuma bulan berjalan, siswa yang baru dicicil untuk bulan
   * LALU (mis. Agustus, padahal sekarang sudah September) tidak akan
   * kelihatan pergerakannya di sini — padahal jelas ada progres.
   * Jadi status di sini ringkasan MENYELURUH: apakah siswa ini masih
   * punya sesuatu yang perlu ditagih (bulan lalu ATAU bulan berjalan
   * yang sudah lewat jatuh tempo), dan kalau iya, apakah sudah ada
   * cicilan sebagian di salah satu bulan yang perlu ditagih itu.
   */
  const { lunas, sebagian, belum } = useMemo(() => {
    let lunas = 0, sebagian = 0, belum = 0
    siswa.forEach((s) => {
      const status = statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
      if (status === 'lunas') lunas++
      else if (status === 'sebagian') sebagian++
      else belum++
    })
    return { lunas, sebagian, belum }
  }, [siswa, pengaturan, kini])

  const total = siswa.length || 1
  const persen = (n) => Math.round((n / total) * 100)

  // Geometri donut
  const R = 54, C = 2 * Math.PI * R, lebar = 18
  const seg = [
    { nilai: lunas, warna: '#22C55E' },
    { nilai: sebagian, warna: '#F5A524' },
    { nilai: belum, warna: '#EC4899' },
  ]
  let offset = 0
  const busur = seg.map((s) => {
    const panjang = (s.nilai / total) * C
    const el = { ...s, dash: panjang, gap: C - panjang, off: offset }
    offset -= panjang
    return el
  })
  const semuaNol = lunas + sebagian === 0 && belum === total // semua belum bayar

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-2 text-[15px] font-extrabold">
        <span>🧮</span> Status pembayaran
      </div>
      <div className="mb-4 -mt-2 text-[12.5px] text-muted">Bulan {BULAN[kini]} · seluruh siswa</div>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r={R} fill="none" stroke="#EEF2F8" strokeWidth={lebar} />
            {busur.map((b, i) =>
              b.nilai > 0 ? (
                <circle
                  key={i}
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke={b.warna}
                  strokeWidth={lebar}
                  strokeDasharray={`${b.dash} ${b.gap}`}
                  strokeDashoffset={b.off}
                  strokeLinecap={b.nilai === total ? 'butt' : 'round'}
                  transform="rotate(-90 64 64)"
                />
              ) : null
            )}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-[26px] font-extrabold leading-none">{siswa.length}</div>
              <div className="text-[11px] font-semibold text-muted">Siswa</div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2.5">
          <Legenda warna="#22C55E" label="Lunas" nilai={lunas} persen={persen(lunas)} />
          <Legenda warna="#F5A524" label="Sebagian" nilai={sebagian} persen={persen(sebagian)} />
          <Legenda warna="#EC4899" label="Belum bayar" nilai={belum} persen={persen(belum)} />
        </div>
      </div>
    </div>
  )
}

const Legenda = ({ warna, label, nilai, persen }) => (
  <div className="flex items-center gap-2 text-[13px]">
    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warna }} />
    <span className="flex-1 font-semibold text-muted">{label}</span>
    <span className="font-extrabold">{nilai}</span>
    <span className="w-10 text-right text-[12px] font-semibold text-muted">({persen}%)</span>
  </div>
)

/* ---------------- Bar horizontal kontribusi per jenis biaya ---------------- */

const WARNA_BIAYA = ['#3B6EF6', '#22C55E', '#F5A524', '#8B5CF6', '#EC4899', '#EF4444']

export function GrafikJenisBiaya({ siswa, biaya }) {
  const baris = useMemo(() => {
    const totalSpp = siswa.reduce((t, s) => t + s.spp.reduce((x, v) => x + (v || 0), 0), 0)
    const keg = biaya.map((b, i) => ({
      nama: b.nama,
      nilai: siswa.reduce((t, s) => t + (s.kegiatan[i] || 0), 0),
    }))
    return [{ nama: 'Iuran SPP', nilai: totalSpp }, ...keg].sort((a, b) => b.nilai - a.nilai)
  }, [siswa, biaya])

  const maks = Math.max(...baris.map((b) => b.nilai), 1)

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-2 text-[15px] font-extrabold">
        <span>🧾</span> Jenis biaya
      </div>
      <div className="-mt-2.5 mb-4 text-[12.5px] text-muted">Kontribusi pemasukan tahun ini</div>
      {baris.length === 0 || maks <= 1 ? (
        <p className="py-4 text-center text-[13px] text-muted">Belum ada pemasukan tercatat.</p>
      ) : (
        <div className="space-y-3">
          {baris.map((b, i) => (
            <div key={b.nama}>
              <div className="mb-1 flex items-center justify-between text-[12.5px] font-semibold">
                <span className="truncate text-muted">{b.nama}</span>
                <span className="shrink-0 font-bold text-ink">{rp(b.nilai)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F4F9]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(b.nilai / maks) * 100}%`, background: WARNA_BIAYA[i % WARNA_BIAYA.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}