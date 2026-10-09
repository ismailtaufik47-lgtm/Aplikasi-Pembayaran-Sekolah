/**
 * Grafik untuk beranda panel sekolah:
 *   • GrafikArusKas     — batang pemasukan vs pengeluaran kas per bulan (6 bulan / 1 tahun)
 *   • StatusPembayaran  — donut status SPP seluruh siswa + progres SPP bulan ini
 *   • GrafikPembayaran  — batang pemasukan SPP per bulan (dipakai kalau akun tidak boleh melihat kas)
 *
 * Digambar dengan HTML/SVG murni — tidak menambah library chart apa pun,
 * jadi bundle tetap ringan. Semua angka dihitung dari data yang sudah
 * ada (store & fungsi kas di database), bukan angka karangan.
 * Warna seri sama dengan menu Laporan (sudah dicek aman buta warna).
 */
import { useMemo, useState } from 'react'
import { BULAN, bulanBerjalan, rp, statusRingkasSiswa, targetSpp, tahunAjaranBerjalan } from '../lib/format.js'
import { NAMA_BULAN } from '../lib/kas.js'
import { BarisLegenda, Donut, PilihRentang, SERI, STATUS, rpRingkas } from './GrafikLaporan.jsx'
import { KepalaKartu, Tautan, rpTanda } from './KartuBeranda.jsx'

/** Batas atas sumbu = 4 × langkah "bulat" (1 · 2 · 2,5 · 5 × 10ⁿ), supaya label sumbu rapi. */
function batasAtas(maks) {
  if (maks <= 0) return 1
  const kasar = maks / 4
  const p = 10 ** Math.floor(Math.log10(kasar))
  const langkah = [1, 1.5, 2, 2.5, 5, 10].find((k) => k * p >= kasar)
  return langkah * p * 4
}

const namaBulan = (kunci, pendek = false) => {
  const [y, m] = kunci.split('-').map(Number)
  return pendek ? NAMA_BULAN[m - 1].slice(0, 3) : `${NAMA_BULAN[m - 1]} ${y}`
}

/* ---------------- Grafik batang arus kas per bulan ---------------- */

/**
 * data: [{ bulan: 'YYYY-MM', masuk, keluar }] — urut lama → baru.
 * Bulan terpilih (default bulan terakhir) ditampilkan rinci: di baris
 * legenda (layar lebar) atau di bawah grafik (HP) — tidak menutupi batang.
 * Arahkan kursor / ketuk batang untuk memilih bulan lain.
 */
export function GrafikArusKas({ data, rentang, ubahRentang, memuat, galat }) {
  const n = data.length
  const [pilih, setPilih] = useState(null)
  const aktif = pilih != null && pilih < n ? pilih : n - 1
  const atas = batasAtas(Math.max(0, ...data.flatMap((d) => [d.masuk, d.keluar])))
  const garis = [1, 0.75, 0.5, 0.25, 0]
  const semuaNol = n > 0 && data.every((d) => !d.masuk && !d.keluar)
  const tot = data.reduce((t, d) => ({ masuk: t.masuk + d.masuk, keluar: t.keluar + d.keluar }), { masuk: 0, keluar: 0 })
  const d = data[aktif]
  const lebarBatang = n > 6 ? 'w-[34%] max-w-[12px]' : 'w-[30%] max-w-[20px]'
  const rentangTeks = n ? `${namaBulan(data[0].bulan, true)}–${namaBulan(data[n - 1].bulan)}` : ''

  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu
        judul="Arus kas sekolah"
        sub={`Pemasukan & pengeluaran ${rentang === 12 ? '12' : '6'} bulan terakhir${rentangTeks ? ' · ' + rentangTeks : ''}`}
        kanan={<PilihRentang nilai={rentang} ubah={(v) => { setPilih(null); ubahRentang(v) }} />}
        className="mb-3"
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-4 text-[12px] font-semibold text-muted">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERI.masuk }} />Pemasukan</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERI.keluar }} />Pengeluaran</span>
        </div>
        {/* rincian bulan terpilih (layar lebar) — ikut berubah saat kursor di atas batang */}
        {d && !semuaNol && !galat && (
          <div className="hidden items-center gap-3 rounded-xl bg-brand/[.07] px-3 py-1.5 text-[12px] font-semibold text-muted lg:flex" aria-live="polite">
            <b className="text-ink">{namaBulan(d.bulan)}</b>
            <span>Masuk <b className="text-ink">{rp(d.masuk)}</b></span>
            <span>Keluar <b className="text-ink">{rp(d.keluar)}</b></span>
            <b className={d.masuk - d.keluar >= 0 ? 'text-ok-deep' : 'text-danger'}>{rpTanda(d.masuk - d.keluar)}</b>
          </div>
        )}
      </div>

      {galat ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[12.5px] font-semibold text-danger">{galat}</p>
      ) : memuat && n === 0 ? (
        <div className="h-[196px] animate-pulse rounded-2xl bg-isi lg:h-[246px]" />
      ) : (
        <>
          <div className="flex gap-2">
            {/* sumbu Y */}
            <div className="relative h-[170px] w-9 shrink-0 lg:h-[220px] lg:w-11">
              {garis.map((g) => (
                <span key={g} className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10.5px] font-semibold leading-none text-muted lg:text-[11px]" style={{ top: `${(1 - g) * 100}%` }}>
                  {g ? rpRingkas(atas * g) : '0'}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="relative h-[170px] lg:h-[220px]">
                {/* garis bantu */}
                {garis.map((g) => (
                  <div key={g} className={`pointer-events-none absolute inset-x-0 border-t ${g ? 'border-line' : 'border-[#DCE1EA]'}`} style={{ top: `${(1 - g) * 100}%` }} />
                ))}
                <div className="absolute inset-0 flex px-0.5" onMouseLeave={() => setPilih(null)}>
                  {data.map((b, i) => (
                    <button
                      key={b.bulan}
                      type="button"
                      aria-label={`${namaBulan(b.bulan)}: pemasukan ${rp(b.masuk)}, pengeluaran ${rp(b.keluar)}`}
                      onMouseEnter={() => setPilih(i)}
                      onFocus={() => setPilih(i)}
                      onClick={() => setPilih(i)}
                      className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-[10px] transition ${i === aktif ? 'bg-brand/[.07]' : ''}`}
                    >
                      <span className={`${lebarBatang} rounded-t-[4px]`} style={{ height: `${b.masuk ? Math.max(1.5, (b.masuk / atas) * 100) : 0}%`, background: SERI.masuk }} />
                      <span className={`${lebarBatang} rounded-t-[4px]`} style={{ height: `${b.keluar ? Math.max(1.5, (b.keluar / atas) * 100) : 0}%`, background: SERI.keluar }} />
                    </button>
                  ))}
                </div>
                {semuaNol && (
                  <div className="absolute inset-x-0 top-[38%] text-center text-[12.5px] font-semibold text-muted">Belum ada transaksi kas</div>
                )}
              </div>
              <div className="flex px-0.5 pt-2">
                {data.map((b, i) => (
                  <span key={b.bulan} className={`min-w-0 flex-1 text-center text-[10.5px] lg:text-[11.5px] ${i === aktif ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>
                    {namaBulan(b.bulan, true)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* keterangan bulan terpilih (HP) */}
          {d && (
            <div className="mt-3 rounded-xl bg-brand/[.07] px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-muted lg:hidden">
              <b className="text-ink">{namaBulan(d.bulan)}:</b> masuk <b className="text-ink">{rp(d.masuk)}</b> · keluar <b className="text-ink">{rp(d.keluar)}</b> · selisih{' '}
              <b className={d.masuk - d.keluar >= 0 ? 'text-ok-deep' : 'text-danger'}>{rpTanda(d.masuk - d.keluar)}</b>
            </div>
          )}

          {/* total seluruh rentang */}
          <div className="mt-auto pt-4">
            <div className="flex rounded-2xl bg-isi">
              {[
                ['Total masuk', tot.masuk, false, ''],
                ['Total keluar', tot.keluar, false, ''],
                ['Selisih', tot.masuk - tot.keluar, true, tot.masuk - tot.keluar >= 0 ? 'text-ok-deep' : 'text-danger'],
              ].map(([l, v, tanda, w], i) => (
                <div key={l} className={`min-w-0 flex-1 px-3 py-2.5 ${i ? 'border-l border-line' : ''}`}>
                  <div className="truncate text-[11px] font-semibold text-muted lg:text-[11.5px]">{l}</div>
                  <div className={`truncate text-[13.5px] font-extrabold lg:text-[15px] ${w}`}>
                    <span className="lg:hidden">{(tanda && v > 0 ? '+' : v < 0 ? '−' : '') + rpRingkas(Math.abs(v))}</span>
                    <span className="hidden lg:inline">{tanda ? rpTanda(v) : rp(v)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- Donut status SPP seluruh siswa ---------------- */

export function StatusPembayaran({ siswa, pengaturan, onBuka }) {
  const kini = bulanBerjalan()

  /**
   * Status di sini ringkasan MENYELURUH (bukan cuma bulan berjalan):
   * apakah siswa masih punya SPP yang perlu ditagih (bulan lalu ATAU
   * bulan berjalan yang sudah lewat jatuh tempo), dan kalau iya, apakah
   * sudah ada cicilan sebagian. Sama dengan daftar siswa & laporan.
   */
  const { lunas, sebagian, belum, terkumpul, target } = useMemo(() => {
    let lunas = 0, sebagian = 0, belum = 0, terkumpul = 0, target = 0
    siswa.forEach((s) => {
      const status = statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
      if (status === 'lunas') lunas++
      else if (status === 'sebagian') sebagian++
      else belum++
      terkumpul += Math.min(s.spp[kini] || 0, targetSpp(s, kini, pengaturan.sppNominal))
      target += targetSpp(s, kini, pengaturan.sppNominal)
    })
    return { lunas, sebagian, belum, terkumpul, target }
  }, [siswa, pengaturan, kini])

  const total = siswa.length
  const persen = (x) => (total ? Math.round((x / total) * 100) : 0)
  const persenTerkumpul = target ? Math.round((terkumpul / target) * 100) : 0
  const tahun = new Date().getFullYear()

  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu
        judul="Status SPP"
        sub={`${BULAN[kini]} ${tahun} · ${total} siswa`}
        kanan={onBuka && <Tautan onClick={onBuka}>Tagihan</Tautan>}
      />
      <div className="flex flex-1 items-center gap-4">
        <Donut
          ukuran={128}
          tebal={18}
          segmen={[
            { label: 'Lunas', nilai: lunas, warna: STATUS.lunas },
            { label: 'Mencicil', nilai: sebagian, warna: STATUS.sebagian },
            { label: 'Belum bayar', nilai: belum, warna: STATUS.belum },
          ]}
        >
          <div>
            <div className="text-[25px] font-extrabold leading-none tracking-tight">{persen(lunas)}%</div>
            <div className="mt-1 text-[11px] font-semibold text-muted">sudah lunas</div>
          </div>
        </Donut>
        <div className="min-w-0 flex-1 space-y-2.5">
          <BarisLegenda warna={STATUS.lunas} label="Lunas" nilai={lunas} persen={persen(lunas)} />
          <BarisLegenda warna={STATUS.sebagian} label="Mencicil" nilai={sebagian} persen={persen(sebagian)} />
          <BarisLegenda warna={STATUS.belum} label="Belum bayar" nilai={belum} persen={persen(belum)} />
        </div>
      </div>
      <div className="pt-4">
        <div className="rounded-2xl bg-isi px-3.5 py-3">
          <div className="flex justify-between gap-2 text-[12px] font-semibold text-muted">
            <span>SPP {BULAN[kini]} terkumpul</span>
            <span>{persenTerkumpul}%</span>
          </div>
          <div className="mt-0.5 text-[14px] font-extrabold">
            {rp(terkumpul)} <span className="text-[12px] font-semibold text-muted">dari {rp(target)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-kartu">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, persenTerkumpul)}%`, background: STATUS.lunas }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Grafik batang pemasukan SPP per bulan ---------------- */
/* Pengganti arus kas untuk akun yang tidak punya akses melihat kas. */

export function GrafikPembayaran({ pembayaran, siswa, pengaturan }) {
  const [rentang, setRentang] = useState(6) // 6 bulan terakhir | 12 (setahun)
  const kini = bulanBerjalan()

  const data = useMemo(() => {
    // Jumlahkan pemasukan SPP per periode (0..11 = Juli..Juni).
    const masukPer = Array(12).fill(0)
    pembayaran.forEach((p) => {
      // SPP tahun ajaran berjalan saja (tunggakan tahun lalu yang dilunasi tidak ikut grafik bulan ini)
      if (p.jenis === 'spp' && p.indeks >= 0 && p.indeks < 12 && (!p.tahunAjaran || p.tahunAjaran === tahunAjaranBerjalan())) masukPer[p.indeks] += p.nominal
    })
    const targetBulan = (i) => siswa.reduce((t, s) => t + targetSpp(s, i, pengaturan.sppNominal), 0) // target penuh 1 bulan
    const mulai = rentang === 12 ? 0 : Math.max(0, kini - 5)
    const akhir = rentang === 12 ? 11 : kini
    const keluar = []
    for (let i = mulai; i <= akhir; i++) keluar.push({ label: BULAN[i].slice(0, 3), masuk: masukPer[i], target: targetBulan(i) })
    return keluar
  }, [pembayaran, siswa, pengaturan, rentang, kini])

  const atas = batasAtas(Math.max(...data.map((d) => Math.max(d.masuk, d.target)), 1))

  return (
    <div className="card flex min-w-0 flex-col lg:p-5">
      <KepalaKartu judul="Grafik pembayaran" sub="Pemasukan SPP per bulan dibanding target" kanan={<PilihRentang nilai={rentang} ubah={setRentang} />} />
      <div className="flex gap-2">
        <div className="relative h-[170px] w-9 shrink-0 lg:h-[220px] lg:w-11">
          {[1, 0.75, 0.5, 0.25, 0].map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10.5px] font-semibold leading-none text-muted lg:text-[11px]" style={{ top: `${(1 - g) * 100}%` }}>
              {g ? rpRingkas(atas * g) : '0'}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-[170px] lg:h-[220px]">
            {[1, 0.75, 0.5, 0.25, 0].map((g) => (
              <div key={g} className={`pointer-events-none absolute inset-x-0 border-t ${g ? 'border-line' : 'border-[#DCE1EA]'}`} style={{ top: `${(1 - g) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {data.map((d) => (
                <div key={d.label} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]" title={`${d.label}: masuk ${rp(d.masuk)} · target ${rp(d.target)}`}>
                  <span className="w-[30%] max-w-[16px] rounded-t-[4px] bg-[#DDE6F5]" style={{ height: `${(d.target / atas) * 100}%` }} />
                  <span className="w-[30%] max-w-[16px] rounded-t-[4px]" style={{ height: `${d.masuk ? Math.max(1.5, (d.masuk / atas) * 100) : 0}%`, background: SERI.spp }} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex pt-2">
            {data.map((d) => <span key={d.label} className="min-w-0 flex-1 text-center text-[10.5px] font-semibold text-muted lg:text-[11.5px]">{d.label}</span>)}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-4 pt-3 text-[12px] font-semibold text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERI.spp }} /> Pembayaran SPP</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#DDE6F5]" /> Target</span>
      </div>
    </div>
  )
}

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