/**
 * Kas sekolah — buku kas sederhana (tahap 1 laporan keuangan).
 *
 * Pemasukan SPP & biaya kegiatan otomatis diambil dari pembayaran yang
 * sudah tercatat. Di sini kepala sekolah / admin mencatat PENGELUARAN dan
 * PEMASUKAN LAIN (donasi, BOP, …) — sesuai hak akses (fitur kas & batal).
 * Laporan bulanan bisa diunduh sebagai PDF (bertanda tangan) atau Excel.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BtnKecil, Chip, EmojiMenu, Ikon, Kosong, PageHead, Sheet } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import FormBatal from './FormBatal.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { rp, tanggalISO } from '../lib/format.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import {
  KATEGORI_KELUAR, KATEGORI_MASUK, NAMA_BULAN, barisBukuKas, daftarBulan, emojiKategori, gerakanKas,
  geserBulan, kunciBulan, labelBulan, laporanBulan, siapkanNota,
} from '../lib/kas.js'

const tglTampil = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'][new Date(y, m - 1, d).getDay()]
  return `${hari}, ${d} ${NAMA_BULAN[m - 1]} ${y}`
}

export default function Kas() {
  const { pembayaran, pengaturan, petugas, toast, boleh, cegahKunci } = useData()
  const nav = useNavigate()
  const bisaCatat = boleh('kas')
  const bisaBatal = boleh('batal')

  const [data, setData] = useState(null) // { pengaturan, kas }
  const [galat, setGalat] = useState('')
  const [bulan, setBulan] = useState(kunciBulan(tanggalISO()))
  const [form, setForm] = useState(null) // 'masuk' | 'keluar'
  const [detail, setDetail] = useState(null) // baris kas
  const [aturSaldo, setAturSaldo] = useState(false)
  const [unduh, setUnduh] = useState('')

  // Masa sewa habis → catat kas & saldo awal dikunci (juga ditolak database).
  const bukaForm = (jenis) => !cegahKunci('kas') && setForm(jenis)
  const bukaSaldo = () => !cegahKunci('saldo') && setAturSaldo(true)

  const muat = () => {
    setGalat('')
    api.muatKas().then(setData).catch((e) => setGalat(e.message))
  }
  useEffect(muat, [])

  const mulai = data?.pengaturan?.mulai || null
  const gerakan = useMemo(() => (data ? gerakanKas({ pembayaran, kas: data.kas, mulai }) : []), [data, pembayaran, mulai])
  const bulanTersedia = useMemo(() => daftarBulan(gerakan, mulai), [gerakan, mulai])
  const lap = useMemo(
    () => laporanBulan({ gerakan, saldoAwalKas: data?.pengaturan?.saldoAwal || 0, bulan }),
    [gerakan, data, bulan],
  )

  const kategoriDipakai = useMemo(() => {
    const s = { masuk: new Set(), keluar: new Set() }
    data?.kas.forEach((k) => s[k.jenis].add(k.kategori))
    return s
  }, [data])

  const unduhLaporan = async (jenis) => {
    if (unduh) return
    setUnduh(jenis)
    try {
      const [m, ttd] = await Promise.all([
        import('../lib/exportKas.js'),
        api.muatTtdSekolah(pengaturan.id).catch(() => null),
      ])
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

  const iBulan = bulanTersedia.indexOf(bulan)

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-line bg-white" onClick={() => nav('/guru/lainnya')} aria-label="Kembali">
          <Ikon.kembali size={18} />
        </button>
        <EmojiMenu id="kas" size={34} />
        <h2 className="text-[17px] font-extrabold">Kas sekolah</h2>
      </div>
      <PageHead
        judul="Kas sekolah"
        sub="Pemasukan SPP & kegiatan tercatat otomatis. Pengeluaran dan pemasukan lain dicatat di sini."
        aksi={bisaCatat && data && (
          <>
            <BtnKecil onClick={() => bukaForm('masuk')}><Ikon.plus size={16} />Pemasukan lain</BtnKecil>
            <BtnKecil utama onClick={() => bukaForm('keluar')}><Ikon.plus size={16} />Catat pengeluaran</BtnKecil>
          </>
        )}
      />

      {galat ? (
        <div className="card mt-4 text-center">
          <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
          <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={muat}>Coba lagi</button>
        </div>
      ) : !data ? (
        <div className="card mt-4"><Kosong>Memuat buku kas…</Kosong></div>
      ) : (
        <>
          {!data.pengaturan && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft p-3.5 lg:mt-4">
              <span className="text-[22px]" style={FONT_EMOJI}>👛</span>
              <div className="min-w-[200px] flex-1 text-[13px] font-semibold leading-snug text-warn-deep">
                <b className="block text-[14px]">Saldo awal kas belum diisi</b>
                {bisaCatat
                  ? 'Isi sekali saja: berapa uang kas yang ada saat mulai memakai fitur ini. Tanpa itu saldo dihitung dari nol.'
                  : 'Minta petugas kas sekolah mengisi saldo awal kas. Sementara ini saldo dihitung dari nol.'}
              </div>
              {bisaCatat && (
                <button className="rounded-xl bg-warn px-4 py-2.5 text-[13px] font-extrabold text-white" onClick={bukaSaldo}>
                  Isi saldo awal
                </button>
              )}
            </div>
          )}

          {/* pilih bulan */}
          <div className="mt-3 flex items-center justify-between gap-2 lg:mt-4 lg:max-w-md">
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white disabled:opacity-40"
              disabled={iBulan <= 0}
              onClick={() => setBulan(geserBulan(bulan, -1))}
              aria-label="Bulan sebelumnya"
            >
              <Ikon.kembali size={18} />
            </button>
            <div className="text-center">
              <div className="text-[16px] font-extrabold">{labelBulan(bulan)}</div>
              <div className="text-[11.5px] font-semibold text-muted">Laporan kas bulanan</div>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white disabled:opacity-40"
              disabled={iBulan >= bulanTersedia.length - 1}
              onClick={() => setBulan(geserBulan(bulan, 1))}
              aria-label="Bulan berikutnya"
            >
              <Ikon.kembali size={18} className="rotate-180" />
            </button>
          </div>

          {/* ringkasan */}
          <div className="mt-3 rounded-[22px] bg-brand p-4 text-white lg:p-5">
            <div className="text-[12.5px] font-semibold opacity-90">Saldo kas akhir {NAMA_BULAN[Number(bulan.slice(5)) - 1]}</div>
            <div className="mt-0.5 break-all text-[28px] font-extrabold tracking-tight lg:text-[32px]">{rp(lap.saldoAkhir).replace('Rp-', '-Rp')}</div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-3 sm:gap-2">
              {[
                ['Saldo awal', lap.saldoAwal, ''],
                ['Masuk', lap.totalMasuk, '+'],
                ['Keluar', lap.totalKeluar, '−'],
              ].map(([l, v, t]) => (
                <div key={l} className="flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-white/15 px-3 py-2 sm:block sm:px-2.5">
                  <div className="text-[12px] font-semibold opacity-90 sm:text-[11px]">{l}</div>
                  <div className="text-[14px] font-extrabold sm:truncate sm:text-[13.5px]">{t}{rp(v)}</div>
                </div>
              ))}
            </div>
          </div>

          {bisaCatat && (
            <div className="mt-3 grid grid-cols-2 gap-2.5 lg:hidden">
              <button className="flex items-center justify-center gap-2 rounded-2xl bg-danger py-3 text-[13.5px] font-extrabold text-white" onClick={() => bukaForm('keluar')}>
                <span aria-hidden>−</span> Pengeluaran
              </button>
              <button className="flex items-center justify-center gap-2 rounded-2xl bg-ok py-3 text-[13.5px] font-extrabold text-white" onClick={() => bukaForm('masuk')}>
                <span aria-hidden>+</span> Pemasukan lain
              </button>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2.5 lg:max-w-md">
            <button className="bigbtn-ghost !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={!!unduh} onClick={() => unduhLaporan('pdf')}>
              {unduh === 'pdf' ? 'Menyiapkan…' : '📄 Unduh PDF'}
            </button>
            <button className="bigbtn-ghost !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={!!unduh} onClick={() => unduhLaporan('xlsx')}>
              {unduh === 'xlsx' ? 'Menyiapkan…' : '📊 Unduh Excel'}
            </button>
          </div>

          <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-6">
            <div>
              <div className="seghead"><h2>Transaksi {NAMA_BULAN[Number(bulan.slice(5)) - 1]}</h2></div>
              <DaftarTransaksi lap={lap} buka={setDetail} />
            </div>
            <div>
              <div className="seghead"><h2>Per kategori</h2></div>
              <BlokKategori judul="Pengeluaran" data={lap.keluarPerKategori} total={lap.totalKeluar} jenis="keluar" />
              <div className="h-3" />
              <BlokKategori judul="Pemasukan" data={lap.masukPerKategori} total={lap.totalMasuk} jenis="masuk" />
              {data.pengaturan && (
                <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-muted">
                  Saldo awal kas {rp(data.pengaturan.saldoAwal)} per {tglTampil(data.pengaturan.mulai)}.
                  Pembayaran orang tua sebelum tanggal itu dianggap sudah termasuk saldo awal.{' '}
                  {bisaCatat && <button className="font-bold text-brand" onClick={bukaSaldo}>Ubah</button>}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <SheetCatatKas
        jenis={form}
        tutup={() => setForm(null)}
        kategoriLain={form ? [...kategoriDipakai[form]] : []}
        pencatat={petugas}
        onSimpan={(baris) => {
          setData((d) => ({ ...d, kas: [...d.kas, baris] }))
          setBulan(kunciBulan(baris.tanggal))
        }}
        toast={toast}
      />
      <SheetDetailKas
        baris={detail}
        tutup={() => setDetail(null)}
        bisaBatal={bisaBatal}
        cegahKunci={cegahKunci}
        oleh={petugas}
        toast={toast}
        onBatal={(id, alasan) => {
          setData((d) => ({
            ...d,
            kas: d.kas.map((k) => (k.id === id ? { ...k, dibatalkanPada: new Date().toISOString(), dibatalkanNama: petugas, alasanBatal: alasan } : k)),
          }))
          setDetail(null)
        }}
      />
      <SheetSaldoAwal
        buka={aturSaldo}
        awal={data?.pengaturan}
        tutup={() => setAturSaldo(false)}
        toast={toast}
        onSimpan={(p) => setData((d) => ({ ...d, pengaturan: p }))}
      />
    </>
  )
}

/* ---------- daftar transaksi, dikelompokkan per tanggal ---------- */
function DaftarTransaksi({ lap, buka }) {
  const perTanggal = new Map()
  ;[...lap.transaksi].reverse().forEach((g) => {
    if (!perTanggal.has(g.tanggal)) perTanggal.set(g.tanggal, { bayar: [], kas: [] })
    perTanggal.get(g.tanggal)[g.sumber === 'bayar' ? 'bayar' : 'kas'].push(g)
  })
  if (perTanggal.size === 0) {
    return <div className="card"><Kosong>Belum ada transaksi di bulan ini.</Kosong></div>
  }
  return (
    <div className="grid gap-3">
      {[...perTanggal.entries()].map(([tgl, { bayar, kas }]) => (
        <div key={tgl}>
          <div className="mb-1.5 px-1 text-[12px] font-bold text-muted">{tglTampil(tgl)}</div>
          <div className="card py-1">
            {kas.map((g) => (
              <button key={g.id} className="row w-full text-left" onClick={() => buka(g.asli)}>
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-[19px] ${g.jenis === 'keluar' ? 'bg-danger-soft' : 'bg-ok-soft'} ${g.batal ? 'opacity-50' : ''}`}
                  style={FONT_EMOJI}
                >
                  {emojiKategori(g.kategori, g.jenis)}
                </span>
                <span className={`min-w-0 flex-1 ${g.batal ? 'opacity-60' : ''}`}>
                  <span className={`block truncate text-[14px] font-bold ${g.batal ? 'line-through' : ''}`}>{g.kategori}</span>
                  <span className="block truncate text-[12px] text-muted">{g.keterangan || 'Tanpa keterangan'}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1">
                  <span className={`text-[14px] font-extrabold ${g.batal ? 'text-muted line-through' : g.jenis === 'keluar' ? 'text-danger' : 'text-ok-deep'}`}>
                    {g.jenis === 'keluar' ? '−' : '+'}{rp(g.nominal)}
                  </span>
                  {g.batal ? <Chip>Dibatalkan</Chip> : g.asli.adaNota ? <span className="text-[11px] font-bold text-muted">📎 Nota</span> : null}
                </span>
              </button>
            ))}
            {bayar.length > 0 && (
              <div className="row">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-brand-soft text-[19px]" style={FONT_EMOJI}>👪</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">Pembayaran orang tua</span>
                  <span className="block truncate text-[12px] text-muted">SPP & biaya kegiatan · {bayar.length} transaksi</span>
                </span>
                <span className="shrink-0 text-[14px] font-extrabold text-ok-deep">+{rp(bayar.reduce((t, g) => t + g.nominal, 0))}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function BlokKategori({ judul, data, total, jenis }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-extrabold">{judul}</span>
        <span className={`text-[14px] font-extrabold ${jenis === 'keluar' ? 'text-danger' : 'text-ok-deep'}`}>{rp(total)}</span>
      </div>
      {data.length === 0 ? (
        <p className="py-2 text-[12.5px] text-muted">Belum ada.</p>
      ) : (
        data.map((k) => (
          <div key={k.kategori} className="py-1.5">
            <div className="flex items-center gap-2 text-[13px]">
              <span style={FONT_EMOJI}>{emojiKategori(k.kategori, jenis)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{k.kategori}</span>
              <span className="shrink-0 font-bold">{rp(k.nominal)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-isi">
              <div className={`h-full rounded-full ${jenis === 'keluar' ? 'bg-danger' : 'bg-ok'}`} style={{ width: `${total ? Math.max(3, (k.nominal / total) * 100) : 0}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/* ---------- form catat ---------- */
const KOSONG = { tanggal: '', kategori: '', lain: '', nominal: '', keterangan: '', nota: null }

function SheetCatatKas({ jenis, tutup, kategoriLain, pencatat, onSimpan, toast }) {
  const [f, setF] = useState(KOSONG)
  const [sibuk, setSibuk] = useState(false)
  const [olahNota, setOlahNota] = useState(false)
  useEffect(() => {
    if (jenis) setF({ ...KOSONG, tanggal: tanggalISO() })
  }, [jenis])

  const bawaan = (jenis === 'masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR).map((k) => k.nama)
  const pilihan = [...bawaan, ...kategoriLain.filter((k) => !bawaan.some((b) => b.toLowerCase() === k.toLowerCase()))]
  const ubah = (u) => setF((x) => ({ ...x, ...u }))
  const kategori = f.kategori === '__lain' ? f.lain.trim() : f.kategori

  const simpan = async () => {
    if (!kategori) return toast('Pilih kategori dulu')
    if (!Number(f.nominal)) return toast('Isi nominalnya')
    if (!f.tanggal) return toast('Isi tanggalnya')
    setSibuk(true)
    try {
      const baris = await api.catatKas({ jenis, tanggal: f.tanggal, kategori, nominal: Number(f.nominal), keterangan: f.keterangan.trim(), nota: f.nota, pencatat })
      onSimpan(baris)
      toast(jenis === 'keluar' ? 'Pengeluaran dicatat' : 'Pemasukan dicatat')
      tutup()
    } catch (e) {
      toast('Gagal menyimpan: ' + e.message)
    } finally {
      setSibuk(false)
    }
  }

  const pilihNota = async (file) => {
    if (!file) return
    setOlahNota(true)
    try {
      ubah({ nota: await siapkanNota(file) })
    } catch (e) {
      toast(e.message)
    } finally {
      setOlahNota(false)
    }
  }

  const label = 'mb-1.5 block text-[13px] font-bold'
  return (
    <Sheet
      buka={!!jenis}
      tutup={() => !sibuk && tutup()}
      judul={jenis === 'keluar' ? 'Catat pengeluaran' : 'Catat pemasukan lain'}
      lead={jenis === 'keluar' ? 'Uang yang keluar dari kas sekolah.' : 'Di luar SPP & biaya kegiatan (itu sudah tercatat otomatis).'}
    >
      <label className={label}>Kategori</label>
      <div className="mb-3 flex flex-wrap gap-2">
        {pilihan.map((k) => (
          <button
            key={k}
            onClick={() => ubah({ kategori: k })}
            className={`flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-bold ${
              f.kategori === k ? (jenis === 'keluar' ? 'border-danger bg-danger-soft text-danger' : 'border-ok bg-ok-soft text-ok-deep') : 'border-line bg-kartu'
            }`}
          >
            <span style={FONT_EMOJI}>{emojiKategori(k, jenis)}</span>{k}
          </button>
        ))}
        <button
          onClick={() => ubah({ kategori: '__lain' })}
          className={`rounded-pill border px-3 py-1.5 text-[13px] font-bold ${f.kategori === '__lain' ? 'border-brand bg-brand-soft text-brand' : 'border-dashed border-line bg-kartu'}`}
        >
          ✏️ Kategori lain…
        </button>
      </div>
      {f.kategori === '__lain' && (
        <input className="field-input mb-3" maxLength={40} autoFocus placeholder="Nama kategori, mis. Seragam guru" value={f.lain} onChange={(e) => ubah({ lain: e.target.value })} />
      )}

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Tanggal</label>
          <input type="date" className="field-input" value={f.tanggal} max={tanggalISO()} onChange={(e) => ubah({ tanggal: e.target.value })} />
        </div>
        <div>
          <label className={label}>Nominal</label>
          <InputNominal value={f.nominal} onChange={(v) => ubah({ nominal: v })} placeholder="150.000" />
        </div>
      </div>

      <label className={label}>Keterangan <span className="font-semibold text-muted">(opsional)</span></label>
      <input className="field-input mb-3" maxLength={300} value={f.keterangan} onChange={(e) => ubah({ keterangan: e.target.value })} placeholder={jenis === 'keluar' ? 'mis. Beli kertas HVS & spidol' : 'mis. Donasi dari alumni'} />

      <label className={label}>Foto nota <span className="font-semibold text-muted">(opsional)</span></label>
      {f.nota ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-kartu p-2.5">
          <img src={f.nota} alt="Nota" className="h-16 w-16 rounded-xl object-cover" />
          <span className="flex-1 text-[12.5px] font-semibold text-muted">Foto nota siap disimpan</span>
          <button className="px-2 text-[12.5px] font-bold text-danger" onClick={() => ubah({ nota: null })}>Hapus</button>
        </div>
      ) : (
        <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-kartu py-3.5 text-[13.5px] font-bold text-brand">
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pilihNota(e.target.files?.[0]); e.target.value = '' }} />
          {olahNota ? 'Memproses foto…' : '📷 Foto / pilih gambar nota'}
        </label>
      )}

      <button className={`bigbtn disabled:opacity-60 ${jenis === 'keluar' ? '!bg-danger' : '!bg-ok'}`} disabled={sibuk || olahNota} onClick={simpan}>
        {sibuk ? 'Menyimpan…' : jenis === 'keluar' ? `Simpan pengeluaran${f.nominal ? ' ' + rp(f.nominal) : ''}` : `Simpan pemasukan${f.nominal ? ' ' + rp(f.nominal) : ''}`}
      </button>
    </Sheet>
  )
}

/* ---------- detail + batalkan ---------- */
function SheetDetailKas({ baris, tutup, bisaBatal, cegahKunci, oleh, toast, onBatal }) {
  const [nota, setNota] = useState(null)
  const [muatNota, setMuatNota] = useState(false)
  const [alasan, setAlasan] = useState(null) // null = belum mau membatalkan
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    setNota(null)
    setAlasan(null)
    if (baris?.adaNota) {
      setMuatNota(true)
      api.notaKas(baris.id).then(setNota).catch(() => setNota(null)).finally(() => setMuatNota(false))
    }
  }, [baris])

  if (!baris) return null
  const batal = !!baris.dibatalkanPada

  const kirimBatal = async (teks) => {
    setSibuk(true)
    try {
      await api.batalkanKas(baris.id, teks, oleh)
      onBatal(baris.id, teks)
      toast('Transaksi dibatalkan')
    } catch (e) {
      toast('Gagal membatalkan: ' + e.message)
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
    <Sheet buka tutup={() => !sibuk && tutup()} judul={baris.jenis === 'keluar' ? 'Detail pengeluaran' : 'Detail pemasukan'}>
      <div className="card">
        <div className="flex items-center gap-3">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl text-[24px] ${baris.jenis === 'keluar' ? 'bg-danger-soft' : 'bg-ok-soft'}`} style={FONT_EMOJI}>
            {emojiKategori(baris.kategori, baris.jenis)}
          </span>
          <div className="min-w-0">
            <div className={`text-[20px] font-extrabold ${batal ? 'text-muted line-through' : baris.jenis === 'keluar' ? 'text-danger' : 'text-ok-deep'}`}>
              {baris.jenis === 'keluar' ? '−' : '+'}{rp(baris.nominal)}
            </div>
            <div className="text-[13px] font-bold">{baris.kategori}</div>
          </div>
        </div>
        <div className="mt-3 border-t border-line pt-2">
          <Kv k="Tanggal" v={tglTampil(baris.tanggal)} />
          <Kv k="Keterangan" v={baris.keterangan || '—'} />
          <Kv k="Dicatat oleh" v={baris.dicatatNama || '—'} />
        </div>
      </div>

      {batal && (
        <div className="mt-3 rounded-2xl bg-danger-soft p-3.5 text-[13px] font-semibold text-danger">
          Dibatalkan oleh {baris.dibatalkanNama || '—'}. Alasan: {baris.alasanBatal || '—'}
        </div>
      )}

      {baris.adaNota && (
        <>
          <div className="mb-2 mt-4 text-sm font-extrabold">Foto nota</div>
          <div className="card grid min-h-[120px] place-items-center p-2" style={{ background: '#fff' }}>
            {muatNota ? <span className="text-[13px] text-muted">Memuat foto…</span>
              : nota ? <a href={nota} target="_blank" rel="noreferrer"><img src={nota} alt="Nota" className="max-h-[360px] rounded-xl object-contain" /></a>
              : <span className="text-[13px] text-muted">Foto tidak bisa dimuat.</span>}
          </div>
        </>
      )}

      <div className="h-4" />
      {bisaBatal && !batal && (alasan === null ? (
        <button
          className="mb-2.5 w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={() => !cegahKunci('batal') && setAlasan('')}
        >
          Batalkan transaksi ini
        </button>
      ) : (
        <div className="mb-2.5">
          <FormBatal jenis="kas" nominal={baris.nominal} sibuk={sibuk} onKirim={kirimBatal} onBatal={() => setAlasan(null)} />
        </div>
      ))}
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- saldo awal ---------- */
function SheetSaldoAwal({ buka, awal, tutup, toast, onSimpan }) {
  const [saldo, setSaldo] = useState('')
  const [mulai, setMulai] = useState('')
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => {
    if (!buka) return
    const d = new Date()
    setSaldo(awal?.saldoAwal ?? '')
    setMulai(awal?.mulai || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }, [buka, awal])

  const simpan = async () => {
    if (!mulai) return toast('Isi tanggal mulai')
    setSibuk(true)
    try {
      await api.aturSaldoAwalKas(Number(saldo) || 0, mulai)
      onSimpan({ saldoAwal: Number(saldo) || 0, mulai })
      toast('Saldo awal kas disimpan')
      tutup()
    } catch (e) {
      toast('Gagal menyimpan: ' + e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={() => !sibuk && tutup()} judul="Saldo awal kas" lead="Uang kas yang ada saat sekolah mulai memakai fitur kas ini.">
      <label className="mb-1.5 block text-[13px] font-bold">Saldo kas</label>
      <InputNominal className="mb-3" value={saldo} onChange={setSaldo} placeholder="0" />
      <label className="mb-1.5 block text-[13px] font-bold">Per tanggal</label>
      <input type="date" className="field-input mb-2" value={mulai} max={tanggalISO()} onChange={(e) => setMulai(e.target.value)} />
      <p className="mb-4 text-[12px] leading-relaxed text-muted">
        Pembayaran SPP & kegiatan <b>sebelum</b> tanggal ini dianggap sudah termasuk dalam saldo, jadi tidak dihitung dua kali.
      </p>
      <button className="bigbtn disabled:opacity-60" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan…' : 'Simpan saldo awal'}</button>
    </Sheet>
  )
}
