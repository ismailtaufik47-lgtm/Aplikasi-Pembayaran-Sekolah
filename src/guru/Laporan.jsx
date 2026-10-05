/**
 * Menu Laporan — tiga tab:
 *   • Pembayaran — siapa sudah bayar / menunggak (SPP & biaya kegiatan)
 *   • Keuangan   — kas sekolah: saldo, pemasukan, pengeluaran (LaporanKeuangan.jsx)
 *   • Kegiatan   — uang masuk vs terpakai per kegiatan (LaporanKegiatan.jsx, 0035)
 * Kepala sekolah langsung dibuka di tab Keuangan, guru/TU di Pembayaran.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Chip, KepalaHalaman } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import { FONT_EMOJI, emojiKegiatan } from '../lib/emojiKegiatan.js'
import { EMOJI_JENIS, dibayarPaket } from '../lib/paket.js'
import {
  BULAN, bulanBerjalan, dibayarSpp, perluDitagihSekarang, rp, sppPerluSekarang, statusRingkasSiswa,
} from '../lib/format.js'
import {
  Banner, BarisLegenda, Donut, GrafikBatang, KartuJudul, KartuKpi, KepalaLaporan, Pilihan, PilihRentang,
  SERI, STATUS, TabLaporan, TombolAksi,
} from './GrafikLaporan.jsx'
import LaporanKeuangan from './LaporanKeuangan.jsx'
import LaporanKegiatan from './LaporanKegiatan.jsx'

export default function Laporan() {
  const { peran, boleh } = useData()
  const [q, setQ] = useSearchParams()
  // Tab mengikuti hak akses (lap_pembayaran / lap_keuangan).
  // Tab Kegiatan memuat pengeluaran kas → hak yang sama dengan tab Keuangan.
  const ada = [
    boleh('lap_pembayaran', 'lihat') && 'pembayaran',
    boleh('lap_keuangan', 'lihat') && 'keuangan',
    boleh('lap_keuangan', 'lihat') && 'kegiatan',
  ].filter(Boolean)
  const minta = q.get('tab') || (peran === 'kepala' ? 'keuangan' : 'pembayaran')
  const tab = ada.includes(minta) ? minta : ada[0]
  const pilih = (t) => setQ({ tab: t }, { replace: true })
  return (
    <>
      <KepalaHalaman judul="Laporan" gambar="grafik" sub="Laporan pembayaran siswa & keuangan sekolah" />
      <TabLaporan tab={tab} pilih={pilih} ada={ada} />
      {tab === 'keuangan' ? <LaporanKeuangan /> : tab === 'kegiatan' ? <LaporanKegiatan /> : <LaporanPembayaran />}
    </>
  )
}

function LaporanPembayaran() {
  const { siswa, biaya, paket, pembayaran, pengaturan, toast, boleh } = useData()
  const nav = useNavigate()
  const [unduh, setUnduh] = useState(null)
  const [rentang, setRentang] = useState(6)
  const kini = bulanBerjalan()
  const [periode, setPeriode] = useState(kini)
  const spp = pengaturan.sppNominal
  const [thAwal, thAkhir] = pengaturan.tahunAjaran.split('/')
  const namaPeriode = (i) => `${BULAN[i]} ${i > 5 ? thAkhir : thAwal}`

  // exceljs & jspdf berat — dimuat saat tombol diklik saja.
  const ekspor = async (jenis) => {
    if (unduh) return
    setUnduh(jenis)
    try {
      if (jenis === 'pdf') {
        const { unduhPdf } = await import('../lib/exportPdf.js')
        unduhPdf({ siswa, biaya, pembayaran, pengaturan })
      } else {
        const { unduhExcel } = await import('../lib/exportExcel.js')
        await unduhExcel({ siswa, biaya, pembayaran, pengaturan })
      }
      toast(`Laporan ${jenis === 'pdf' ? 'PDF' : 'Excel'} berhasil diunduh`)
    } catch (e) {
      toast('Gagal membuat file: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }

  /** Rekap SPP satu periode. Kegiatan masuk ke pendapatan menurut TANGGAL transaksinya. */
  const rekap = (i) => {
    const masukSpp = siswa.reduce((t, s) => t + dibayarSpp(s, i), 0)
    // kegiatan + PMB/daftar ulang: masuk menurut tanggal transaksinya
    const masukKegiatan = pembayaran.reduce((t, p) => (p.jenis !== 'spp' && bulanBerjalan(new Date(p.tanggal)) === i ? t + p.nominal : t), 0)
    const lunas = siswa.filter((s) => dibayarSpp(s, i) >= spp).length
    const sebagian = siswa.filter((s) => dibayarSpp(s, i) > 0 && dibayarSpp(s, i) < spp).length
    return {
      masuk: masukSpp + masukKegiatan, masukSpp, masukKegiatan, lunas, sebagian,
      belum: siswa.length - lunas - sebagian,
      tunggakan: Math.max(0, siswa.length * spp - masukSpp),
      tingkat: siswa.length ? Math.round((lunas / siswa.length) * 1000) / 10 : 0,
    }
  }

  const r = rekap(periode)
  const rLalu = periode > 0 ? rekap(periode - 1) : null
  const target = siswa.length * spp
  const trenMasuk = rLalu && rLalu.masuk > 0 ? Math.round(((r.masuk - rLalu.masuk) / rLalu.masuk) * 100) : null
  const trenTingkat = rLalu ? Math.round((r.tingkat - rLalu.tingkat) * 10) / 10 : null
  const totalTunggakan = siswa.reduce((t, s) => t + sppPerluSekarang(s, spp, pengaturan.tanggalJatuhTempo, kini), 0)
  const menunggak = siswa.filter((s) => perluDitagihSekarang(s, spp, pengaturan.tanggalJatuhTempo, kini)).length
  const persenTarget = target ? Math.round((r.masukSpp / target) * 100) : 0

  const bulanan = useMemo(() => Array.from({ length: kini + 1 }, (_, i) => ({ i, ...rekap(i) })).reverse(), [siswa, pembayaran, pengaturan, kini]) // eslint-disable-line react-hooks/exhaustive-deps

  // grafik: SPP & kegiatan per bulan tahun ajaran
  const dataGrafik = useMemo(() => {
    const s = Array(12).fill(0)
    const k = Array(12).fill(0)
    pembayaran.forEach((p) => {
      if (p.jenis === 'spp' && p.indeks >= 0 && p.indeks < 12) s[p.indeks] += p.nominal
      else if (p.jenis !== 'spp') k[bulanBerjalan(new Date(p.tanggal))] += p.nominal
    })
    const mulai = rentang === 12 ? 0 : Math.max(0, kini - 5)
    const akhir = rentang === 12 ? 11 : kini
    const out = []
    for (let i = mulai; i <= akhir; i++) out.push({ label: BULAN[i].slice(0, 3), judul: namaPeriode(i), nilai: [s[i], k[i]] })
    return out
  }, [pembayaran, rentang, kini]) // eslint-disable-line react-hooks/exhaustive-deps

  // status menyeluruh (semua bulan yang sudah jatuh tempo)
  const status = useMemo(() => {
    const h = { lunas: 0, sebagian: 0, belum: 0 }
    siswa.forEach((s) => h[statusRingkasSiswa(s, spp, pengaturan.tanggalJatuhTempo, kini)]++)
    return h
  }, [siswa, spp, pengaturan, kini])

  // pemasukan per jenis biaya (tahun ini)
  const jenis = useMemo(() => {
    const totalSpp = siswa.reduce((t, s) => t + s.spp.reduce((x, v) => x + (v || 0), 0), 0)
    const keg = biaya.map((b, i) => ({ nama: b.nama, e: emojiKegiatan(b), nilai: siswa.reduce((t, s) => t + (s.kegiatan[i] || 0), 0) }))
    const pk = paket.map((p) => ({ nama: p.nama, e: EMOJI_JENIS[p.jenis], nilai: siswa.reduce((t, s) => t + dibayarPaket(s, p.id), 0) }))
    return [{ nama: 'Iuran SPP', e: '📅', nilai: totalSpp }, ...pk, ...keg].filter((x) => x.nilai > 0).sort((a, b) => b.nilai - a.nilai)
  }, [siswa, biaya, paket])
  const totalJenis = jenis.reduce((t, x) => t + x.nilai, 0)
  const persen = (n, t) => (t ? Math.round((n / t) * 100) : 0)

  return (
    <>
      <KepalaLaporan
        e="🧾"
        judul="Laporan pembayaran"
        sub={`Status SPP & biaya kegiatan per siswa · ${pengaturan.namaSekolah}`}
        aksi={
          <>
            <TombolAksi utama ikon="📄" onClick={() => ekspor('pdf')} disabled={!!unduh}>{unduh === 'pdf' ? 'Membuat…' : 'Export PDF'}</TombolAksi>
            <TombolAksi ikon="📊" onClick={() => ekspor('excel')} disabled={!!unduh}>{unduh === 'excel' ? 'Membuat…' : 'Export Excel'}</TombolAksi>
          </>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <Pilihan e="📅" value={periode} onChange={(e) => setPeriode(Number(e.target.value))}>
              {Array.from({ length: kini + 1 }, (_, i) => i).reverse().map((i) => (
                <option key={i} value={i}>Periode {namaPeriode(i)}</option>
              ))}
            </Pilihan>
            <Pilihan e="🎓">Tahun ajaran {pengaturan.tahunAjaran}</Pilihan>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KartuKpi
              warna="blue" e="💵" label="Total pendapatan" nilai={rp(r.masuk)}
              tren={trenMasuk === null ? null : { teks: `${Math.abs(trenMasuk)}% dari bulan lalu`, arah: trenMasuk > 0 ? 'naik' : trenMasuk < 0 ? 'turun' : 'datar', baik: trenMasuk === 0 ? null : trenMasuk > 0 }}
              kaki={`SPP ${rp(r.masukSpp)} · kegiatan ${rp(r.masukKegiatan)}`}
            />
            <KartuKpi
              warna="amber" e="⏰" label="Total tunggakan SPP" nilai={rp(totalTunggakan)}
              tren={{ teks: `${menunggak} siswa belum lunas`, arah: 'datar', baik: menunggak ? false : true }}
              kaki="Semua bulan yang sudah jatuh tempo"
            />
            <KartuKpi
              warna="grape" e="📈" label="Tingkat bayar SPP" nilai={`${r.tingkat}%`}
              tren={trenTingkat === null ? null : { teks: `${Math.abs(trenTingkat)} poin dari bulan lalu`, arah: trenTingkat > 0 ? 'naik' : trenTingkat < 0 ? 'turun' : 'datar', baik: trenTingkat === 0 ? null : trenTingkat > 0 }}
              kaki={`${r.lunas} dari ${siswa.length} siswa lunas ${BULAN[periode]}`}
            />
            <KartuKpi
              warna="green" e="🎯" label="Target SPP periode ini" nilai={rp(target)}
              tren={{ teks: `${persenTarget}% tercapai`, arah: 'datar', baik: persenTarget >= 100 ? true : null }}
              kaki={`${rp(r.masukSpp)} terkumpul dari SPP`}
            />
          </div>
        </div>

        {/* ringkasan periode */}
        <div className="card flex flex-col">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="permen permen-kecil permen-tosca grid h-9 w-9 place-items-center rounded-[12px] text-[17px]" style={FONT_EMOJI}>✅</span>
            <div>
              <div className="judul-kartu text-[17px] leading-tight">Ringkasan pembayaran</div>
              <div className="text-[12px] text-muted">SPP {namaPeriode(periode)}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Donut segmen={[
              { label: 'Lunas', nilai: r.lunas, warna: STATUS.lunas },
              { label: 'Sebagian', nilai: r.sebagian, warna: STATUS.sebagian },
              { label: 'Belum bayar', nilai: r.belum, warna: STATUS.belum },
            ]}>
              <div>
                <div className="text-[22px] font-extrabold leading-none">{Math.round(r.tingkat)}%</div>
                <div className="mt-0.5 text-[10.5px] font-semibold text-muted">Tingkat bayar</div>
              </div>
            </Donut>
            <div className="min-w-0 flex-1 space-y-2">
              <BarisLegenda warna={STATUS.lunas} label="Lunas" nilai={`${r.lunas} siswa`} />
              <BarisLegenda warna={STATUS.sebagian} label="Sebagian" nilai={`${r.sebagian} siswa`} />
              <BarisLegenda warna={STATUS.belum} label="Belum bayar" nilai={`${r.belum} siswa`} />
            </div>
          </div>
          <div className="mt-auto pt-4">
            <div className="h-2 overflow-hidden rounded-full bg-isi">
              <div className="h-full rounded-full" style={{ width: `${r.tingkat}%`, background: STATUS.lunas }} />
            </div>
            <div className="mt-2 text-[12px] font-semibold text-muted">
              👪 {r.lunas} dari {siswa.length} siswa sudah melunasi SPP {BULAN[periode]}
            </div>
          </div>
        </div>
      </div>

      {menunggak > 0 ? (
        <Banner
          nada="warn"
          e="⚠️"
          aksi={<button className="shrink-0 text-[13px] font-extrabold" onClick={() => nav(boleh('pembayaran', 'lihat') ? '/guru/tagihan' : '/guru/siswa')}>Lihat detail →</button>}
        >
          Ada <b>{menunggak} siswa</b> dengan tagihan SPP yang sudah melewati jatuh tempo (total {rp(totalTunggakan)}). Segera konfirmasi ke orang tua/wali.
        </Banner>
      ) : (
        <Banner nada="ok" e="🎉">Semua tagihan SPP yang sudah jatuh tempo sudah lunas. Terima kasih!</Banner>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        <KartuJudul e="📊" judul="Grafik pembayaran" sub="Pemasukan SPP & biaya kegiatan per bulan" kanan={<PilihRentang nilai={rentang} ubah={setRentang} />} className="lg:col-span-2 xl:col-span-1">
          <GrafikBatang data={dataGrafik} seri={[{ nama: 'SPP', warna: SERI.spp }, { nama: 'Biaya kegiatan', warna: SERI.kegiatan }]} />
        </KartuJudul>

        <KartuJudul e="🧮" judul="Status pembayaran" sub="Seluruh siswa · semua bulan jatuh tempo">
          <div className="flex items-center gap-4">
            <Donut segmen={[
              { label: 'Lunas', nilai: status.lunas, warna: STATUS.lunas },
              { label: 'Sebagian', nilai: status.sebagian, warna: STATUS.sebagian },
              { label: 'Belum bayar', nilai: status.belum, warna: STATUS.belum },
            ]} ukuran={104} tebal={14}>
              <div>
                <div className="text-[24px] font-extrabold leading-none">{siswa.length}</div>
                <div className="text-[10.5px] font-semibold text-muted">Total siswa</div>
              </div>
            </Donut>
            <div className="min-w-0 flex-1 space-y-2">
              <BarisLegenda warna={STATUS.lunas} label="Lunas" nilai={status.lunas} persen={persen(status.lunas, siswa.length)} />
              <BarisLegenda warna={STATUS.sebagian} label="Sebagian" nilai={status.sebagian} persen={persen(status.sebagian, siswa.length)} />
              <BarisLegenda warna={STATUS.belum} label="Belum bayar" nilai={status.belum} persen={persen(status.belum, siswa.length)} />
            </div>
          </div>
          {status.belum + status.sebagian > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[12px] font-semibold leading-snug text-warn-deep">
              <span style={FONT_EMOJI}>💡</span>
              <span>Masih ada {status.belum + status.sebagian} siswa yang belum lunas. Segera hubungi orang tua/wali siswa.</span>
            </div>
          )}
        </KartuJudul>

        <KartuJudul e="🏷️" judul="Jenis biaya" sub={`Pemasukan per jenis · ${pengaturan.tahunAjaran}`}>
          {jenis.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Belum ada pemasukan tercatat.</p>
          ) : (
            <div className="space-y-2.5">
              {jenis.slice(0, 6).map((j) => (
                <div key={j.nama} className="flex items-center gap-2.5">
                  <GambarKegiatan emoji={j.e} size={34} className="rounded-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="truncate font-semibold">{j.nama}</span>
                      <span className="shrink-0 font-bold">{rp(j.nilai)} <span className="font-semibold text-muted">· {persen(j.nilai, totalJenis)}%</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-isi">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${persen(j.nilai, jenis[0].nilai)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              {jenis.length > 6 && <p className="text-[11.5px] text-muted">+{jenis.length - 6} jenis lainnya · {rp(jenis.slice(6).reduce((t, x) => t + x.nilai, 0))}</p>}
            </div>
          )}
        </KartuJudul>
      </div>

      {/* rekap per bulan */}
      <div className="seghead"><h2>Rekap per bulan</h2><span className="text-[12px] font-bold text-muted">{pengaturan.tahunAjaran}</span></div>
      <div className="card hidden overflow-hidden p-0 lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Bulan</th>
              <th className="px-3 py-3">Pemasukan</th>
              <th className="px-3 py-3">Kekurangan SPP</th>
              <th className="px-3 py-3">Siswa lunas</th>
              <th className="px-3 py-3">Tingkat</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {bulanan.map((b) => (
              <tr key={b.i} className={`border-b border-line last:border-b-0 ${b.i === kini ? 'bg-brand-soft/40' : ''}`}>
                <td className="px-5 py-3 font-bold">{namaPeriode(b.i)}</td>
                <td className="px-3 py-3 font-semibold">{rp(b.masuk)}</td>
                <td className="px-3 py-3 font-semibold text-warn-deep">{rp(b.tunggakan)}</td>
                <td className="px-3 py-3 text-muted">{b.lunas}/{siswa.length}</td>
                <td className="px-3 py-3 font-bold">{b.tingkat}%</td>
                <td className="px-5 py-3"><Chip warna={b.i === kini ? 'blue' : 'green'}>{b.i === kini ? 'Berjalan' : 'Selesai'}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 lg:hidden">
        {bulanan.map((b) => (
          <div key={b.i} className={`card flex items-center justify-between gap-3 ${b.i === kini ? 'ring-2 ring-brand-soft' : ''}`}>
            <div className="min-w-0">
              <div className="text-[14.5px] font-extrabold">{namaPeriode(b.i)}</div>
              <div className="mt-0.5 text-[12.5px] text-muted">{rp(b.masuk)} · {b.lunas}/{siswa.length} siswa lunas</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[14.5px] font-extrabold">{b.tingkat}%</div>
              <Chip warna={b.i === kini ? 'blue' : 'green'}>{b.i === kini ? 'Berjalan' : 'Selesai'}</Chip>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
