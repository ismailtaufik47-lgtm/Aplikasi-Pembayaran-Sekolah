/**
 * Tab "Keuangan" di menu Laporan — hanya melihat & mengunduh laporan kas.
 * Mencatat pengeluaran / pemasukan lain tetap di menu Kas sekolah.
 * Angka dihitung oleh lib/kas.js (sama persis dengan halaman Kas).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Kosong } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { rp, tanggalISO } from '../lib/format.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import {
  NAMA_BULAN, barisBukuKas, daftarBulan, emojiKategori, gerakanKas, geserBulan, kunciBulan, labelBulan, laporanBulan,
} from '../lib/kas.js'
import {
  Banner, GrafikBatang, KartuJudul, KartuKpi, KepalaLaporan, Pilihan, PilihRentang, SERI, TombolAksi,
} from './GrafikLaporan.jsx'

const tglPendek = (iso) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${NAMA_BULAN[m - 1].slice(0, 3)}`
}
/** "Kategori — keterangan" → [judul, keterangan]; baris pembayaran orang tua diringkas. */
const judulBaris = (u) => {
  const m = u.match(/^Penerimaan SPP & biaya kegiatan \((\d+) transaksi\)$/)
  if (m) return ['Pembayaran orang tua', `SPP & kegiatan · ${m[1]} transaksi`]
  const i = u.indexOf(' — ')
  return i < 0 ? [u, ''] : [u.slice(0, i), u.slice(i + 3)]
}
const persenUbah = (baru, lama) => (lama > 0 ? Math.round(((baru - lama) / lama) * 100) : null)

export default function LaporanKeuangan() {
  const { pembayaran, pengaturan, toast, boleh } = useData()
  const nav = useNavigate()
  const bisaCatat = boleh('kas')
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState('')
  const [bulan, setBulan] = useState(kunciBulan(tanggalISO()))
  const [rentang, setRentang] = useState(6)
  const [unduh, setUnduh] = useState('')

  const muat = () => {
    setGalat('')
    api.muatKas().then(setData).catch((e) => setGalat(e.message))
  }
  useEffect(muat, [])

  const mulai = data?.pengaturan?.mulai || null
  const saldoAwalKas = data?.pengaturan?.saldoAwal || 0
  const gerakan = useMemo(() => (data ? gerakanKas({ pembayaran, kas: data.kas, mulai }) : []), [data, pembayaran, mulai])
  const bulanTersedia = useMemo(() => daftarBulan(gerakan, mulai), [gerakan, mulai])
  const lap = useMemo(() => laporanBulan({ gerakan, saldoAwalKas, bulan }), [gerakan, saldoAwalKas, bulan])
  const lapLalu = useMemo(() => laporanBulan({ gerakan, saldoAwalKas, bulan: geserBulan(bulan, -1) }), [gerakan, saldoAwalKas, bulan])

  const dataGrafik = useMemo(() => {
    const out = []
    for (let n = rentang - 1; n >= 0; n--) {
      const k = geserBulan(bulan, -n)
      const l = laporanBulan({ gerakan, saldoAwalKas, bulan: k })
      out.push({ label: NAMA_BULAN[Number(k.slice(5)) - 1].slice(0, 3), judul: labelBulan(k), nilai: [l.totalMasuk, l.totalKeluar] })
    }
    return out
  }, [gerakan, saldoAwalKas, bulan, rentang])

  const unduhLaporan = async (jenis) => {
    if (unduh || !data) return
    setUnduh(jenis)
    try {
      const [m, ttd] = await Promise.all([import('../lib/exportKas.js'), api.muatTtdSekolah(pengaturan.id).catch(() => null)])
      const d = { lap, baris: barisBukuKas(lap), pengaturan, ttd }
      if (jenis === 'pdf') m.unduhPdfKas(d)
      else await m.unduhExcelKas(d)
      toast('Laporan kas diunduh')
    } catch (e) {
      toast('Gagal membuat laporan: ' + e.message)
    } finally {
      setUnduh('')
    }
  }

  const kepala = (
    <KepalaLaporan
      e="💰"
      judul="Laporan keuangan"
      sub={`Saldo, pemasukan & pengeluaran kas · ${pengaturan.namaSekolah}`}
      aksi={
        <>
          {bisaCatat && <TombolAksi ikon="✏️" pendek="Catat" onClick={() => nav('/guru/kas')}>Catat di Kas</TombolAksi>}
          <TombolAksi utama ikon="📄" pendek="PDF" onClick={() => unduhLaporan('pdf')} disabled={!!unduh || !data}>{unduh === 'pdf' ? 'Membuat…' : 'Unduh PDF'}</TombolAksi>
          <TombolAksi ikon="📊" pendek="Excel" onClick={() => unduhLaporan('xlsx')} disabled={!!unduh || !data}>{unduh === 'xlsx' ? 'Membuat…' : 'Unduh Excel'}</TombolAksi>
        </>
      }
    />
  )

  if (galat) {
    return (
      <>
        {kepala}
        <div className="card mt-4 text-center">
          <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
          <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={muat}>Coba lagi</button>
        </div>
      </>
    )
  }
  if (!data) return <>{kepala}<div className="card mt-4"><Kosong>Memuat laporan keuangan…</Kosong></div></>

  const namaBulan = NAMA_BULAN[Number(bulan.slice(5)) - 1]
  const tMasuk = persenUbah(lap.totalMasuk, lapLalu.totalMasuk)
  const tKeluar = persenUbah(lap.totalKeluar, lapLalu.totalKeluar)
  const selisih = lap.totalMasuk - lap.totalKeluar
  const masukLain = lap.masukPerKategori.filter((k) => k.kategori !== 'SPP' && k.kategori !== 'Biaya kegiatan').reduce((t, k) => t + k.nominal, 0)
  const sumber = [
    { nama: 'SPP', e: '📅', nilai: lap.masukPerKategori.find((k) => k.kategori === 'SPP')?.nominal || 0 },
    { nama: 'Biaya kegiatan', e: '🎟️', nilai: lap.masukPerKategori.find((k) => k.kategori === 'Biaya kegiatan')?.nominal || 0 },
    { nama: 'Pemasukan lain', e: '🤲', nilai: masukLain },
  ]
  const maksArus = Math.max(lap.totalMasuk, lap.totalKeluar, 1)
  const baris = barisBukuKas(lap).slice().reverse()

  return (
    <>
      {kepala}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <Pilihan e="📅" value={bulan} onChange={(e) => setBulan(e.target.value)}>
              {[...bulanTersedia].reverse().map((k) => <option key={k} value={k}>Periode {labelBulan(k)}</option>)}
            </Pilihan>
            {data.pengaturan && <Pilihan e="👛">Saldo awal kas {rp(saldoAwalKas)}</Pilihan>}
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KartuKpi warna="grey" e="🏦" label="Saldo awal bulan" nilai={rp(lap.saldoAwal)} kaki={`Per 1 ${namaBulan}`} />
            <KartuKpi
              warna="blue" e="📥" label="Pemasukan" nilai={rp(lap.totalMasuk)}
              tren={tMasuk === null ? null : { teks: `${Math.abs(tMasuk)}% dari bulan lalu`, arah: tMasuk > 0 ? 'naik' : tMasuk < 0 ? 'turun' : 'datar', baik: tMasuk === 0 ? null : tMasuk > 0 }}
              kaki="SPP, kegiatan & pemasukan lain"
            />
            <KartuKpi
              warna="amber" e="📤" label="Pengeluaran" nilai={rp(lap.totalKeluar)}
              tren={tKeluar === null ? null : { teks: `${Math.abs(tKeluar)}% dari bulan lalu`, arah: tKeluar > 0 ? 'naik' : tKeluar < 0 ? 'turun' : 'datar', baik: tKeluar === 0 ? null : tKeluar < 0 }}
              kaki={`${lap.transaksi.filter((g) => g.jenis === 'keluar' && !g.batal).length} transaksi`}
            />
            <KartuKpi
              warna="green" e="💼" label="Saldo akhir bulan" nilai={rp(lap.saldoAkhir)}
              tren={{ teks: `${selisih >= 0 ? 'Naik' : 'Turun'} ${rp(Math.abs(selisih))}`, arah: selisih > 0 ? 'naik' : selisih < 0 ? 'turun' : 'datar', baik: selisih === 0 ? null : selisih > 0 }}
              kaki="Dibanding awal bulan"
            />
          </div>
        </div>

        {/* ringkasan arus kas */}
        <div className="card flex flex-col">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-[17px]" style={FONT_EMOJI}>⚖️</span>
            <div>
              <div className="text-[15px] font-extrabold leading-tight">Ringkasan kas</div>
              <div className="text-[12px] text-muted">{labelBulan(bulan)}</div>
            </div>
          </div>
          {[
            ['Pemasukan', lap.totalMasuk, SERI.masuk],
            ['Pengeluaran', lap.totalKeluar, SERI.keluar],
          ].map(([l, v, w]) => (
            <div key={l} className="mb-2.5">
              <div className="mb-1 flex justify-between text-[12.5px]">
                <span className="flex items-center gap-1.5 font-semibold text-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ background: w }} />{l}</span>
                <b>{rp(v)}</b>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-isi">
                <div className="h-full rounded-full" style={{ width: `${(v / maksArus) * 100}%`, background: w }} />
              </div>
            </div>
          ))}
          <div className={`mt-1 rounded-xl px-3 py-2 text-[13px] font-extrabold ${selisih >= 0 ? 'bg-ok-soft text-ok-deep' : 'bg-danger-soft text-danger'}`}>
            {selisih >= 0 ? 'Surplus' : 'Defisit'} {rp(Math.abs(selisih))}
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 text-[12px] font-bold text-muted">Sumber pemasukan</div>
            {sumber.map((s) => (
              <div key={s.nama} className="flex items-center gap-2 py-1 text-[13px]">
                <span style={FONT_EMOJI}>{s.e}</span>
                <span className="flex-1 font-semibold">{s.nama}</span>
                <b>{rp(s.nilai)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!data.pengaturan ? (
        <Banner
          nada="warn" e="👛"
          aksi={bisaCatat && <button className="shrink-0 text-[13px] font-extrabold" onClick={() => nav('/guru/kas')}>Isi saldo awal →</button>}
        >
          Saldo awal kas belum diisi, jadi saldo dihitung dari nol. {bisaCatat ? 'Isi sekali di menu Kas sekolah.' : 'Minta petugas kas sekolah mengisinya.'}
        </Banner>
      ) : selisih < 0 ? (
        <Banner nada="warn" e="⚠️">
          Pengeluaran {namaBulan} lebih besar dari pemasukan (defisit <b>{rp(-selisih)}</b>). Saldo kas turun menjadi {rp(lap.saldoAkhir)}.
        </Banner>
      ) : (
        <Banner nada="ok" e="✅">Kas {namaBulan} surplus <b>{rp(selisih)}</b>. Saldo kas naik menjadi {rp(lap.saldoAkhir)}.</Banner>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        <KartuJudul e="📊" judul="Arus kas" sub="Pemasukan & pengeluaran per bulan" kanan={<PilihRentang nilai={rentang} ubah={setRentang} />} className="lg:col-span-2 xl:col-span-1">
          <GrafikBatang data={dataGrafik} seri={[{ nama: 'Pemasukan', warna: SERI.masuk }, { nama: 'Pengeluaran', warna: SERI.keluar }]} />
        </KartuJudul>

        <KartuJudul e="🧾" judul="Pengeluaran per kategori" sub={labelBulan(bulan)}>
          {lap.keluarPerKategori.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Belum ada pengeluaran bulan ini.</p>
          ) : (
            <div className="space-y-2.5">
              {lap.keluarPerKategori.slice(0, 6).map((k) => (
                <div key={k.kategori} className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-isi text-[15px]" style={FONT_EMOJI}>{emojiKategori(k.kategori, 'keluar')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="truncate font-semibold">{k.kategori}</span>
                      <span className="shrink-0 font-bold">{rp(k.nominal)} <span className="font-semibold text-muted">· {Math.round((k.nominal / lap.totalKeluar) * 100)}%</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-isi">
                      <div className="h-full rounded-full" style={{ width: `${(k.nominal / lap.keluarPerKategori[0].nominal) * 100}%`, background: SERI.keluar }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </KartuJudul>

        <KartuJudul
          e="🕘" judul="Transaksi terakhir" sub={labelBulan(bulan)}
          kanan={boleh('kas', 'lihat') && <button className="shrink-0 text-[12.5px] font-bold text-brand" onClick={() => nav('/guru/kas')}>Semua →</button>}
        >
          {baris.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Belum ada transaksi bulan ini.</p>
          ) : (
            <div className="-my-1">
              {baris.slice(0, 6).map((b, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-line py-2 last:border-b-0">
                  <span className="w-11 shrink-0 text-[11.5px] font-bold text-muted">{tglPendek(b.tanggal)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">{judulBaris(b.uraian)[0]}</span>
                    {judulBaris(b.uraian)[1] && <span className="block truncate text-[11px] text-muted">{judulBaris(b.uraian)[1]}</span>}
                  </span>
                  <span className={`shrink-0 text-[12.5px] font-extrabold ${b.keluar ? 'text-danger' : 'text-ok-deep'}`}>
                    {b.keluar ? `−${rp(b.keluar)}` : `+${rp(b.masuk)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </KartuJudul>
      </div>
    </>
  )
}
