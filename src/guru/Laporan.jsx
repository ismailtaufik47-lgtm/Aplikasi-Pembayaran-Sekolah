import { useMemo, useState } from 'react'
import { BtnKecil, Chip, Ikon, PageHead, Tile, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { GrafikPembayaran, GrafikJenisBiaya, StatusPembayaran } from './GrafikBeranda.jsx'
import { BULAN, bulanBerjalan, dibayarSpp, perluDitagihSekarang, rp, sppPerluSekarang } from '../lib/format.js'

export default function Laporan() {
  const { siswa, biaya, pembayaran, pengaturan, toast } = useData()
  const [unduh, setUnduh] = useState(null) // 'pdf' | 'excel' | null — lagi proses generate file mana

  // exceljs & jspdf lumayan berat (~500KB) — dimuat baru saat tombol
  // Export benar-benar diklik (dynamic import), bukan ikut ter-bundle
  // di halaman awal yang dibuka semua orang termasuk yang tidak pernah
  // export laporan.
  const eksporExcel = async () => {
    if (unduh) return
    setUnduh('excel')
    try {
      const { unduhExcel } = await import('../lib/exportExcel.js')
      await unduhExcel({ siswa, biaya, pembayaran, pengaturan })
      toast('Laporan Excel berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat file Excel: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }

  const eksporPdf = async () => {
    if (unduh) return
    setUnduh('pdf')
    try {
      const { unduhPdf } = await import('../lib/exportPdf.js')
      unduhPdf({ siswa, biaya, pembayaran, pengaturan })
      toast('Laporan PDF berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat file PDF: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }
  const kini = bulanBerjalan()
  const [periode, setPeriode] = useState(kini)

  /** Rekap SPP satu periode (indeks bulan) — dihitung dari status pembayaran
   *  SAAT INI, jadi "tunggakan" bulan lalu otomatis menyusut begitu ada
   *  pembayaran susulan yang dicatat (bukan snapshot beku).
   *
   *  Kegiatan (uang gedung, seragam, dll) TIDAK punya "bulan SPP" — jadi
   *  dimasukkan ke Total Pendapatan berdasarkan TANGGAL TRANSAKSINYA,
   *  bukan indeks periode. Tunggakan & Target sengaja tetap SPP saja,
   *  karena cuma SPP yang punya kewajiban bulanan yang jelas — kegiatan
   *  sifatnya sekali bayar per item, bukan berulang tiap bulan.
   */
  const rekapPeriode = (i) => {
    const targetSpp = siswa.length * pengaturan.sppNominal
    const masukSpp = siswa.reduce((t, s) => t + dibayarSpp(s, i), 0)
    const masukKegiatan = pembayaran.reduce(
      (t, p) => (p.jenis === 'kegiatan' && bulanBerjalan(new Date(p.tanggal)) === i ? t + p.nominal : t),
      0
    )
    const lunas = siswa.filter((s) => dibayarSpp(s, i) >= pengaturan.sppNominal).length
    return {
      masuk: masukSpp + masukKegiatan,
      masukSpp,
      masukKegiatan,
      tunggakan: Math.max(0, targetSpp - masukSpp),
      lunas,
      total: siswa.length,
      tingkat: siswa.length ? Math.round((lunas / siswa.length) * 1000) / 10 : 0,
    }
  }

  const bulanan = useMemo(
    () => Array.from({ length: kini + 1 }, (_, i) => ({ i, ...rekapPeriode(i) })).reverse(),
    [siswa, pengaturan, kini]
  )

  const r = rekapPeriode(periode)
  const rBulanLalu = periode > 0 ? rekapPeriode(periode - 1) : null
  const trenPersen = rBulanLalu && rBulanLalu.masuk > 0 ? Math.round(((r.masuk - rBulanLalu.masuk) / rBulanLalu.masuk) * 100) : null
  const targetPeriode = siswa.length * pengaturan.sppNominal

  // Ini SENGAJA beda dari r.tunggakan (yang cuma bulan `periode` saja) —
  // ini total tunggakan SEKOLAH dari SEMUA siswa, dijumlah dari SEMUA bulan
  // yang belum lunas (bulan lalu + bulan berjalan kalau sudah lewat jatuh
  // tempo). Ini yang dimaksud orang saat bilang "total tunggakan", bukan
  // cuma kekurangan satu bulan tertentu.
  const totalTunggakanSekolah = siswa.reduce(
    (t, s) => t + sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini),
    0
  )
  const siswaMenunggak = siswa.filter((s) =>
    perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
  ).length

  return (
    <>
      <h1 className="pb-1.5 pt-3.5 text-xl font-extrabold lg:hidden">Laporan Keuangan 📊</h1>
      <PageHead
        judul="Laporan Keuangan 📊"
        sub={`Analisis dan rekap keuangan sekolah ${pengaturan.namaSekolah}`}
        aksi={
          <>
            <BtnKecil onClick={eksporPdf} disabled={!!unduh}>
              <Ikon.dokumen size={16} />
              {unduh === 'pdf' ? 'Membuat PDF…' : 'Export PDF'}
            </BtnKecil>
            <BtnKecil onClick={eksporExcel} disabled={!!unduh}>
              <Ikon.dokumen size={16} />
              {unduh === 'excel' ? 'Membuat Excel…' : 'Export Excel'}
            </BtnKecil>
          </>
        }
      />

      {/* ---------- filter periode ---------- */}
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-2.5 lg:mt-4">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-soft">
          <span className="text-brand"><Ikon.kalender size={17} /></span>
          <select
            className="bg-transparent text-[13.5px] font-bold text-ink outline-none"
            value={periode}
            onChange={(e) => setPeriode(Number(e.target.value))}
          >
            {Array.from({ length: kini + 1 }, (_, i) => i).reverse().map((i) => (
              <option key={i} value={i}>Periode: {BULAN[i]} {i > 5 ? pengaturan.tahunAjaran.split('/')[1] : pengaturan.tahunAjaran.split('/')[0]}</option>
            ))}
          </select>
        </div>
        <span className="rounded-2xl bg-white px-3.5 py-2.5 text-[13.5px] font-bold text-muted shadow-soft">
          Tahun ajaran {pengaturan.tahunAjaran}
        </span>
      </div>

      {/* ---------- kartu statistik ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat
          warna="blue" ikon={<Ikon.dompet size={20} />} label="Total Pemasukan" nilai={rp(r.masuk)}
          kaki={
            r.masukKegiatan > 0
              ? `SPP ${rp(r.masukSpp)} + kegiatan ${rp(r.masukKegiatan)}`
              : trenPersen === null ? `Periode ${BULAN[periode]}` : `${trenPersen >= 0 ? '▲' : '▼'} ${Math.abs(trenPersen)}% dari bulan lalu`
          }
          kakiWarna={r.masukKegiatan > 0 ? undefined : trenPersen === null ? undefined : trenPersen >= 0 ? '#177C40' : '#EF4444'}
        />
        <Stat
          warna="amber" ikon={<Ikon.peringatan size={20} />} label="Total tunggakan SPP" nilai={rp(totalTunggakanSekolah)}
          kaki={`🟠 ${siswaMenunggak} siswa · dari semua bulan, bukan cuma ${BULAN[periode]}`}
        />
        <Stat warna="grape" ikon={<Ikon.grafik size={20} />} label="Tingkat bayar SPP" nilai={`${r.tingkat}%`} bar={r.tingkat} kaki={`${r.lunas}/${r.total} siswa lunas`} />
        <Stat warna="green" ikon={<Ikon.jam size={20} />} label="Target SPP periode ini" nilai={rp(targetPeriode)} bar={r.tingkat} kaki={`${rp(r.masukSpp)} terkumpul dari SPP`} />
      </div>
      <p className="mt-2.5 px-0.5 text-[12px] leading-relaxed text-muted">
        <b className="text-ink">Total tunggakan SPP</b> menjumlah tunggakan dari <b className="text-ink">semua siswa dan semua bulan</b> yang belum lunas
        (tidak terikat dropdown periode di atas). <b className="text-ink">Total Pendapatan</b> dan <b className="text-ink">Target</b> sebaliknya cuma untuk
        periode yang dipilih. Tunggakan &amp; Target khusus menghitung SPP — kegiatan (uang gedung, seragam, dll) tidak berulang tiap bulan jadi
        tidak dipaksakan masuk ke situ, tapi tetap muncul di <b className="text-ink">Total Pendapatan</b> dan grafik <b className="text-ink">Jenis Biaya</b> di bawah.
      </p>

      {/* ---------- grafik ---------- */}
      <div className="seghead"><h2>Grafik & rincian</h2></div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.8fr_0.8fr] lg:items-start">
        <GrafikPembayaran pembayaran={pembayaran} siswa={siswa} pengaturan={pengaturan} />
        <StatusPembayaran siswa={siswa} pengaturan={pengaturan} />
        <GrafikJenisBiaya siswa={siswa} biaya={biaya} />
      </div>

      {/* ---------- tabel bulanan ---------- */}
      <div className="seghead">
        <h2>Laporan bulanan {pengaturan.tahunAjaran}</h2>
        <span className="rounded-pill bg-warn-soft px-3 py-1 text-[12px] font-bold text-warn-deep">{bulanan.length} bulan</span>
      </div>

      <div className="hidden overflow-hidden rounded-card bg-white shadow-soft lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-bold">Bulan</th>
              <th className="px-3 py-3 font-bold">Total pemasukan</th>
              <th className="px-3 py-3 font-bold">Tunggakan</th>
              <th className="px-3 py-3 font-bold">Siswa bayar</th>
              <th className="px-3 py-3 font-bold">Tingkat</th>
              <th className="px-5 py-3 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {bulanan.map((b) => (
              <tr key={b.i} className={`border-b border-line last:border-b-0 ${b.i === kini ? 'bg-brand-soft/40' : ''}`}>
                <td className="px-5 py-3 font-bold text-ink">{BULAN[b.i]}</td>
                <td className="px-3 py-3 font-semibold text-ok-deep">{rp(b.masuk)}</td>
                <td className="px-3 py-3 font-semibold text-warn-deep">{rp(b.tunggakan)}</td>
                <td className="px-3 py-3 text-muted">{b.lunas}/{b.total}</td>
                <td className="px-3 py-3 font-bold text-ink">{b.tingkat}%</td>
                <td className="px-5 py-3">
                  <Chip warna={b.i === kini ? 'blue' : 'green'}>{b.i === kini ? 'Berjalan' : 'Selesai'}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- tabel bulanan: mobile ---------- */}
      <div className="space-y-2 lg:hidden">
        {bulanan.map((b) => (
          <div key={b.i} className={`card flex items-center justify-between ${b.i === kini ? 'ring-2 ring-brand-soft' : ''}`}>
            <div>
              <div className="text-[14.5px] font-extrabold">{BULAN[b.i]}</div>
              <div className="mt-0.5 text-[12.5px] text-muted">{rp(b.masuk)} · {b.lunas}/{b.total} siswa</div>
            </div>
            <div className="text-right">
              <div className="text-[14.5px] font-extrabold">{b.tingkat}%</div>
              <Chip warna={b.i === kini ? 'blue' : 'green'}>{b.i === kini ? 'Berjalan' : 'Selesai'}</Chip>
            </div>
          </div>
        ))}
      </div>

      <div className="h-3.5" />
      <div className="flex gap-2.5 lg:hidden">
        <button className="bigbtn-ghost flex-1 disabled:opacity-60" onClick={eksporPdf} disabled={!!unduh}>
          {unduh === 'pdf' ? 'Membuat…' : 'Export PDF'}
        </button>
        <button className="bigbtn-ghost flex-1 disabled:opacity-60" onClick={eksporExcel} disabled={!!unduh}>
          {unduh === 'excel' ? 'Membuat…' : 'Export Excel'}
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 rounded-card bg-warn-soft px-5 py-4">
        <span className="text-xl">☀️</span>
        <p className="text-center text-[12.5px] font-semibold text-warn-deep">
          ❤️ Bersama kita wujudkan sekolah yang ceria, sehat dan berprestasi ❤️
        </p>
        <span className="text-xl">☀️</span>
      </div>
    </>
  )
}

const Stat = ({ warna, ikon, label, nilai, kaki, kakiWarna, bar }) => (
  <div className="card p-[15px] lg:p-[18px]">
    <div className="flex items-start justify-between">
      <Tile warna={warna}>{ikon}</Tile>
    </div>
    <div className="mt-3 text-[12.5px] font-medium text-muted">{label}</div>
    <div className="mt-0.5 truncate text-[19px] font-extrabold tracking-tight lg:text-[22px]">{nilai}</div>
    <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: kakiWarna || '#8A93A6' }}>{kaki}</div>
    {bar !== undefined && <div className="mt-2.5"><Track persen={bar} /></div>}
  </div>
)