/**
 * Kas sekolah — buku kas sederhana.
 *
 * Pemasukan SPP & biaya kegiatan otomatis diambil dari pembayaran yang
 * sudah tercatat. Di sini dicatat PENGELUARAN dan PEMASUKAN LAIN (donasi,
 * BOP, …) — sesuai hak akses (fitur kas & batal).
 *
 * Semua angka (saldo, laporan bulanan, riwayat) dihitung DATABASE (0030),
 * termasuk aturan "saldo tidak boleh minus". Halaman ini hanya mengambil
 * yang ditampilkan: riwayat 7 hari terakhir (bisa pilih tanggal), dimuat
 * per halaman, jadi tetap ringan walau transaksinya sudah ribuan.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BtnKecil, Chip, Ikon, KepalaHalaman, Kosong, Pil, Sheet } from '../components/ui.jsx'
import { KoinMaskot } from '../components/Gambar.jsx'
import InputNominal from '../components/InputNominal.jsx'
import FormBatal from './FormBatal.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { rp, tanggalISO, waktuTampil } from '../lib/format.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import {
  KATEGORI_KELUAR, KATEGORI_MASUK, NAMA_BULAN, daftarBulan, emojiKategori, geserBulan, hariLalu,
  kunciBulan, labelBulan, siapkanNota, tglKas,
} from '../lib/kas.js'

const tglTampil = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'][new Date(y, m - 1, d).getDay()]
  return `${hari}, ${d} ${NAMA_BULAN[m - 1]} ${y}`
}
const rpTanda = (n) => (n < 0 ? '−' + rp(-n) : rp(n))

/** Transaksi yang dicatat lebih dari 7 hari setelah tanggal transaksinya. */
const BATAS_MUNDUR = 7
function selisihMundur(g) {
  if (!g?.dibuatPada || !g.tanggal) return 0
  const dicatat = tanggalISO(new Date(g.dibuatPada))
  return Math.round((new Date(dicatat + 'T00:00:00') - new Date(g.tanggal + 'T00:00:00')) / 864e5)
}
const dicatatMundur = (g) => selisihMundur(g) > BATAS_MUNDUR

const PER_HALAMAN = 30
const RENTANG = [
  { id: '7', label: '7 hari', dari: () => hariLalu(6) },
  { id: '30', label: '30 hari', dari: () => hariLalu(29) },
  { id: 'bulan', label: 'Bulan ini', dari: () => tanggalISO().slice(0, 8) + '01' },
  { id: 'pilih', label: 'Pilih tanggal' },
]

export default function Kas() {
  const { pembayaran, pengaturan, petugas, toast, boleh, cegahKunci } = useData()
  const bisaCatat = boleh('kas')
  const bisaBatal = boleh('batal')
  // Hanya dipakai mode demo (tanpa database): pembayaran di layar ikut dihitung.
  const demo = useRef({})
  demo.current = { pembayaran }

  const [versi, setVersi] = useState(0) // naik setiap ada perubahan → muat ulang
  const segarkan = () => setVersi((v) => v + 1)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState(null)
  const [bulan, setBulan] = useState(kunciBulan(tanggalISO()))
  const [lap, setLap] = useState(null)
  const [rentang, setRentang] = useState({ id: '7', dari: hariLalu(6), sampai: tanggalISO() })
  const [riwayat, setRiwayat] = useState(null) // { item, lanjut, total }
  const [memuatLagi, setMemuatLagi] = useState(false)

  const [form, setForm] = useState(null) // 'masuk' | 'keluar'
  const [detail, setDetail] = useState(null) // baris kas
  const [aturSaldo, setAturSaldo] = useState(false)
  const [unduh, setUnduh] = useState('')

  // ringkasan (saldo sekarang, saldo awal, peringatan)
  useEffect(() => {
    let aktif = true
    setGalat('')
    api.kasRingkasan(demo.current).then((d) => aktif && setInfo(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [versi])

  // laporan bulan yang dipilih
  useEffect(() => {
    let aktif = true
    setLap(null)
    api.kasLaporanBulan(bulan, demo.current).then((d) => aktif && setLap(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [bulan, versi])

  // riwayat: halaman pertama untuk rentang tanggal
  useEffect(() => {
    let aktif = true
    setRiwayat(null)
    api.kasRiwayat({ dari: rentang.dari, sampai: rentang.sampai, batas: PER_HALAMAN }, demo.current)
      .then((d) => aktif && setRiwayat(d))
      .catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [rentang.dari, rentang.sampai, versi])

  const muatBerikutnya = async () => {
    if (!riwayat || memuatLagi) return
    setMemuatLagi(true)
    try {
      const d = await api.kasRiwayat({ dari: rentang.dari, sampai: rentang.sampai, mulaiDari: riwayat.item.length, batas: PER_HALAMAN }, demo.current)
      setRiwayat((r) => ({ ...d, item: [...r.item, ...d.item] }))
    } catch (e) {
      toast('Gagal memuat: ' + e.message)
    } finally {
      setMemuatLagi(false)
    }
  }

  const bulanTersedia = daftarBulan(info?.bulanPertama)
  const iBulan = bulanTersedia.indexOf(bulan)
  // Bulan terpilih di luar daftar (mis. setelah tanggal mulai diubah) → pindah ke bulan terdekat.
  useEffect(() => {
    if (info && !bulanTersedia.includes(bulan)) setBulan(bulan < bulanTersedia[0] ? bulanTersedia[0] : bulanTersedia[bulanTersedia.length - 1])
  }, [info]) // eslint-disable-line react-hooks/exhaustive-deps

  const bukaForm = (jenis) => {
    if (cegahKunci('kas')) return
    if (info && !info.pengaturan) {
      toast('Isi saldo awal kas dulu — cukup sekali')
      return setAturSaldo(true)
    }
    setForm(jenis)
  }
  const bukaSaldo = () => !cegahKunci('saldo') && setAturSaldo(true)

  // Dari tombol "Catat pengeluaran" / "Pemasukan lain" di beranda:
  // form langsung dibuka setelah ringkasan kas termuat (perlu tahu saldo awal).
  const lokasi = useLocation()
  const navigasi = useNavigate()
  const mintaCatat = useRef(lokasi.state?.catat || null)
  useEffect(() => {
    if (!info || !mintaCatat.current) return
    const jenis = mintaCatat.current
    mintaCatat.current = null
    navigasi(lokasi.pathname, { replace: true, state: null })
    if (bisaCatat && (jenis === 'keluar' || jenis === 'masuk')) bukaForm(jenis)
  }, [info]) // eslint-disable-line react-hooks/exhaustive-deps

  const pilihRentang = (id) => {
    const r = RENTANG.find((x) => x.id === id)
    if (id === 'pilih') return setRentang((x) => ({ ...x, id }))
    setRentang({ id, dari: r.dari(), sampai: tanggalISO() })
  }

  const unduhLaporan = async (jenis) => {
    if (unduh || !lap) return
    setUnduh(jenis)
    try {
      const [m, ttd] = await Promise.all([
        import('../lib/exportKas.js'),
        api.muatTtdSekolah(pengaturan.id).catch(() => null),
      ])
      const d = { lap, baris: lap.baris, pengaturan, ttd }
      if (jenis === 'pdf') m.unduhPdfKas(d)
      else await m.unduhExcelKas(d)
      toast('Laporan kas diunduh')
    } catch (e) {
      toast('Gagal membuat laporan: ' + e.message)
    } finally {
      setUnduh('')
    }
  }

  const atur = info?.pengaturan
  const minus = info && info.saldoKini < 0

  return (
    <>
      <KepalaHalaman
        judul="Kas sekolah"
        gambar={null}
        sub="Pemasukan SPP & kegiatan tercatat otomatis. Pengeluaran dan pemasukan lain dicatat di sini."
        aksiHp={null}
        aksi={bisaCatat && info && (
          <>
            <BtnKecil onClick={() => bukaForm('masuk')}><Ikon.plus size={16} />Pemasukan lain</BtnKecil>
            <BtnKecil utama onClick={() => bukaForm('keluar')}><Ikon.plus size={16} />Catat pengeluaran</BtnKecil>
          </>
        )}
      />

      {galat ? (
        <div className="card mt-4 text-center">
          <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
          <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={segarkan}>Coba lagi</button>
        </div>
      ) : !info ? (
        <div className="card mt-4"><Kosong>Memuat buku kas…</Kosong></div>
      ) : (
        <>
          {/* ---------- peringatan ---------- */}
          {!atur && (
            <Peringatan e="👛" judul="Saldo awal kas belum diisi" aksi={bisaCatat && { label: 'Isi saldo awal', klik: bukaSaldo }}>
              {bisaCatat
                ? 'Isi sekali saja: berapa uang kas yang ada pada tanggal mulai. Setelah itu pengeluaran & pemasukan lain bisa dicatat.'
                : 'Minta petugas kas sekolah mengisi saldo awal kas. Sementara ini saldo dihitung dari nol.'}
            </Peringatan>
          )}
          {atur && info.sebelumMulai?.jumlah > 0 && (
            <Peringatan e="📆" judul={`${info.sebelumMulai.jumlah} transaksi kas tidak dihitung`} aksi={bisaCatat && { label: 'Ubah saldo awal', klik: bukaSaldo }}>
              Tanggalnya sebelum tanggal mulai saldo awal ({tglKas(atur.mulai, true)}). Kalau transaksi itu memang terjadi, ubah tanggal
              mulai saldo awal menjadi {tglKas(info.sebelumMulai.pertama, true)} atau lebih awal. Kalau salah tanggal, batalkan lalu catat ulang.
            </Peringatan>
          )}
          {atur && info.terendah?.saldo < 0 && (
            <Peringatan merah e="⚠️" judul="Saldo kas pernah minus">
              Saldo tercatat {rpTanda(info.terendah.saldo)} pada {tglKas(info.terendah.tanggal, true)} (dari data sebelum pembaruan).
              Periksa dan batalkan pengeluaran yang salah catat.
            </Peringatan>
          )}

          {/* ---------- saldo sekarang (kartu permen kuning + maskot koin) ---------- */}
          <div className={`kartu-saldo relative mt-3 overflow-hidden rounded-[26px] p-[18px] lg:mt-4 lg:p-6 ${minus ? 'kartu-saldo-minus' : ''}`}>
            <KoinMaskot className="pointer-events-none absolute -bottom-1 right-2 h-[112px] w-[112px] lg:right-8 lg:h-[132px] lg:w-[132px]" />
            <div className="relative pr-[104px] lg:pr-[150px]">
              <div className="text-[13px] font-extrabold opacity-85">Saldo kas saat ini</div>
              <div className="mt-1 break-all font-display text-[32px] font-bold leading-[1.05] tracking-[-.3px] lg:text-[40px]">{rpTanda(info.saldoKini)}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-bold">
                <span className="rounded-full bg-white/60 px-3 py-1.5 dark:bg-white/10">
                  {atur ? `Saldo awal ${rp(atur.saldoAwal)} per ${tglKas(atur.mulai, true)}` : 'Saldo awal belum diisi'}
                </span>
                {bisaCatat && (
                  <button className="rounded-full bg-white/85 px-3 py-1.5 text-[12px] font-extrabold dark:bg-white/15" onClick={bukaSaldo}>
                    {atur ? 'Ubah' : 'Isi saldo awal'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {bisaCatat && (
            <div className="mt-3 grid grid-cols-2 gap-2.5 lg:hidden">
              <button className="flex items-center justify-center gap-2 rounded-[18px] bg-danger py-3.5 text-[14px] font-extrabold text-white" onClick={() => bukaForm('keluar')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>
                Pengeluaran
              </button>
              <button className="flex items-center justify-center gap-2 rounded-[18px] bg-ok py-3.5 text-[14px] font-extrabold text-white" onClick={() => bukaForm('masuk')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 7 7 17" /><path d="M7 9v8h8" /></svg>
                Pemasukan lain
              </button>
            </div>
          )}

          <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,390px)] lg:items-start lg:gap-6">
            {/* ---------- riwayat transaksi ---------- */}
            <div className="min-w-0">
              <div className="seghead"><h2>Riwayat transaksi</h2></div>
              <div className="noscroll -mx-[18px] mb-2.5 flex gap-2 overflow-x-auto px-[18px] lg:mx-0 lg:flex-wrap lg:px-0">
                {RENTANG.map((r) => (
                  <Pil key={r.id} on={rentang.id === r.id} onClick={() => pilihRentang(r.id)} ikon={r.id === 'pilih' ? <Ikon.kalender size={15} /> : null}>
                    {r.label}
                  </Pil>
                ))}
              </div>
              {rentang.id === 'pilih' && <PilihTanggal awal={rentang} min={atur?.mulai} terapkan={(dari, sampai) => setRentang({ id: 'pilih', dari, sampai })} toast={toast} />}

              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] font-semibold text-muted">
                <span className="w-full font-bold text-ink sm:w-auto">{tglKas(rentang.dari)} – {tglKas(rentang.sampai, true)}</span>
                {riwayat && (
                  <>
                    <span className="text-ok-deep">Masuk +{rp(riwayat.total.masuk)}</span>
                    <span className="text-danger">Keluar −{rp(riwayat.total.keluar)}</span>
                  </>
                )}
              </div>

              {!riwayat ? (
                <div className="card"><Kosong>Memuat transaksi…</Kosong></div>
              ) : (
                <>
                  <DaftarTransaksi item={riwayat.item} buka={setDetail} kosong={rentang.id === '7' ? 'Belum ada transaksi dalam 7 hari terakhir.' : 'Tidak ada transaksi pada rentang tanggal ini.'} />
                  {riwayat.lanjut && (
                    <button className="bigbtn-ghost mt-3 !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={memuatLagi} onClick={muatBerikutnya}>
                      {memuatLagi ? 'Memuat…' : 'Muat transaksi sebelumnya'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ---------- laporan bulanan ---------- */}
            <div className="min-w-0">
              <div className="seghead"><h2>Laporan bulanan</h2></div>
              <div className="card">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="tombol-putih grid h-10 w-10 shrink-0 place-items-center rounded-[13px] disabled:opacity-40"
                    disabled={iBulan <= 0}
                    onClick={() => setBulan(geserBulan(bulan, -1))}
                    aria-label="Bulan sebelumnya"
                  >
                    <Ikon.kembali size={18} />
                  </button>
                  <select
                    className="judul-kartu min-w-0 flex-1 appearance-none bg-transparent text-center text-[18px] outline-none"
                    value={bulan}
                    onChange={(e) => setBulan(e.target.value)}
                    aria-label="Pilih bulan laporan"
                  >
                    {[...bulanTersedia].reverse().map((k) => <option key={k} value={k}>{labelBulan(k)}</option>)}
                  </select>
                  <button
                    className="tombol-putih grid h-10 w-10 shrink-0 place-items-center rounded-[13px] disabled:opacity-40"
                    disabled={iBulan >= bulanTersedia.length - 1}
                    onClick={() => setBulan(geserBulan(bulan, 1))}
                    aria-label="Bulan berikutnya"
                  >
                    <Ikon.kembali size={18} className="rotate-180" />
                  </button>
                </div>

                {!lap ? (
                  <Kosong>Memuat laporan…</Kosong>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ['Saldo awal', lap.saldoAwal, ''],
                        ['Saldo akhir', lap.saldoAkhir, lap.saldoAkhir < 0 ? 'text-danger' : 'text-brand'],
                        ['Pemasukan', lap.totalMasuk, 'text-ok-deep'],
                        ['Pengeluaran', lap.totalKeluar, 'text-danger'],
                      ].map(([l, v, w]) => (
                        <div key={l} className="min-w-0 rounded-2xl bg-isi px-3 py-2.5">
                          <div className="text-[11.5px] font-semibold text-muted">{l}</div>
                          <div className={`truncate text-[15px] font-extrabold ${w}`}>{rpTanda(v)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      <button className="bigbtn-ghost !py-2.5 !text-[13px] disabled:opacity-60" disabled={!!unduh} onClick={() => unduhLaporan('pdf')}>
                        {unduh === 'pdf' ? 'Menyiapkan…' : '📄 Unduh PDF'}
                      </button>
                      <button className="bigbtn-ghost !py-2.5 !text-[13px] disabled:opacity-60" disabled={!!unduh} onClick={() => unduhLaporan('xlsx')}>
                        {unduh === 'xlsx' ? 'Menyiapkan…' : '📊 Unduh Excel'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {lap && (
                <>
                  <div className="h-3" />
                  <BlokKategori judul="Pengeluaran" data={lap.keluarPerKategori} total={lap.totalKeluar} jenis="keluar" />
                  <div className="h-3" />
                  <BlokKategori judul="Pemasukan" data={lap.masukPerKategori} total={lap.totalMasuk} jenis="masuk" />
                </>
              )}
              {atur && (
                <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-muted">
                  Pembayaran orang tua & transaksi sebelum {tglKas(atur.mulai, true)} dianggap sudah termasuk saldo awal.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <SheetCatatKas
        jenis={form}
        tutup={() => setForm(null)}
        mulai={atur?.mulai}
        onUbahMulai={() => { setForm(null); bukaSaldo() }}
        kategoriLain={form ? info?.kategori?.[form] || [] : []}
        pencatat={petugas}
        demo={demo}
        onSimpan={(baris) => {
          if (baris.tanggal < rentang.dari || baris.tanggal > rentang.sampai) {
            toast(`Tercatat tanggal ${tglKas(baris.tanggal, true)} — lihat di laporan ${labelBulan(kunciBulan(baris.tanggal))}`)
          }
          setBulan(kunciBulan(baris.tanggal))
          segarkan()
        }}
        toast={toast}
      />
      <SheetDetailKas
        baris={detail}
        tutup={() => setDetail(null)}
        bisaBatal={bisaBatal}
        cegahKunci={cegahKunci}
        oleh={petugas}
        demo={demo}
        toast={toast}
        onBatal={() => {
          setDetail(null)
          segarkan()
        }}
      />
      <SheetSaldoAwal
        buka={aturSaldo}
        awal={atur}
        demo={demo}
        tutup={() => setAturSaldo(false)}
        toast={toast}
        onSimpan={segarkan}
      />
    </>
  )
}

/* ---------- kotak peringatan ---------- */
function Peringatan({ e, judul, children, aksi, merah }) {
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-3 rounded-[20px] p-3.5 lg:mt-4 ${merah ? 'bg-danger-soft shadow-[inset_0_-3px_0_rgba(239,68,68,.2)]' : 'spanduk-kuning'}`}>
      <span className="text-[22px]" style={FONT_EMOJI}>{e}</span>
      <div className={`min-w-[200px] flex-1 text-[13px] font-semibold leading-snug ${merah ? 'text-danger' : 'text-warn-deep'}`}>
        <b className="block text-[14px]">{judul}</b>
        {children}
      </div>
      {aksi && (
        <button className={`rounded-xl px-4 py-2.5 text-[13px] font-extrabold text-white ${merah ? 'bg-danger' : 'bg-warn'}`} onClick={aksi.klik}>
          {aksi.label}
        </button>
      )}
    </div>
  )
}

/* ---------- pilih rentang tanggal sendiri ---------- */
function PilihTanggal({ awal, min, terapkan, toast }) {
  const [dari, setDari] = useState(awal.dari)
  const [sampai, setSampai] = useState(awal.sampai)
  const kirim = () => {
    if (!dari || !sampai) return toast('Isi kedua tanggal')
    if (dari > sampai) return toast('Tanggal "dari" harus sebelum tanggal "sampai"')
    terapkan(dari, sampai)
  }
  return (
    <div className="card mb-2.5 !p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[11.5px] font-bold text-muted">Dari</span>
          <input type="date" className="field-input !py-2.5" value={dari} min={min} max={tanggalISO()} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[11.5px] font-bold text-muted">Sampai</span>
          <input type="date" className="field-input !py-2.5" value={sampai} min={dari || min} max={tanggalISO()} onChange={(e) => setSampai(e.target.value)} />
        </label>
      </div>
      <button className="bigbtn mt-2.5 !py-2.5 !text-[13.5px]" onClick={kirim}>Tampilkan</button>
    </div>
  )
}

/* ---------- daftar transaksi, dikelompokkan per tanggal ---------- */
function DaftarTransaksi({ item, buka, kosong }) {
  if (item.length === 0) return <div className="card"><Kosong>{kosong}</Kosong></div>
  const grup = []
  item.forEach((g) => {
    const akhir = grup[grup.length - 1]
    if (akhir && akhir.tanggal === g.tanggal) akhir.item.push(g)
    else grup.push({ tanggal: g.tanggal, item: [g] })
  })
  return (
    <div className="grid gap-3">
      {grup.map(({ tanggal, item: xs }) => (
        <div key={tanggal}>
          <div className="mb-1.5 px-1 text-[12px] font-bold text-muted">{tglTampil(tanggal)}</div>
          <div className="card py-1">
            {xs.map((g) =>
              g.sumber === 'bayar' ? (
                <div key={'b' + g.tanggal} className="row">
                  <span className="permen permen-kecil permen-biru grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"><Ikon.siswa size={19} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">Pembayaran orang tua</span>
                    <span className="block truncate text-[12px] text-muted">SPP & biaya kegiatan · {g.jumlah} transaksi</span>
                  </span>
                  <span className="shrink-0 text-[14px] font-extrabold text-ok-deep">+{rp(g.nominal)}</span>
                </div>
              ) : (
                <BarisKas key={g.id} g={g} buka={buka} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function BarisKas({ g, buka }) {
  const batal = !!g.dibatalkanPada
  const redup = batal || g.sebelumMulai
  return (
    <button className="row w-full text-left" onClick={() => buka(g)}>
      <span
        className={`permen permen-kecil relative grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${g.jenis === 'keluar' ? 'permen-pink' : 'permen-tosca'} ${redup ? 'opacity-50' : ''}`}
        title={g.kategori}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {g.jenis === 'keluar' ? <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></> : <><path d="M17 7 7 17" /><path d="M7 9v8h8" /></>}
        </svg>
        <span className="absolute -bottom-1.5 -right-1.5 grid h-[20px] w-[20px] place-items-center rounded-full bg-kartu text-[11px] shadow-[0_1px_3px_rgba(0,0,0,.15)]" style={FONT_EMOJI} aria-hidden="true">
          {emojiKategori(g.kategori, g.jenis)}
        </span>
      </span>
      <span className={`min-w-0 flex-1 ${redup ? 'opacity-60' : ''}`}>
        <span className={`block truncate text-[14px] font-bold ${batal ? 'line-through' : ''}`}>{g.kategori}</span>
        <span className="block truncate text-[12px] text-muted">{g.keterangan || 'Tanpa keterangan'}</span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className={`text-[14px] font-extrabold ${redup ? 'text-muted' : g.jenis === 'keluar' ? 'text-danger' : 'text-ok-deep'} ${batal ? 'line-through' : ''}`}>
          {g.jenis === 'keluar' ? '−' : '+'}{rp(g.nominal)}
        </span>
        {batal ? <Chip>Dibatalkan</Chip>
          : g.sebelumMulai ? <Chip warna="amber">Tidak dihitung</Chip>
            : dicatatMundur(g) ? <Chip warna="blue">Dicatat mundur</Chip>
              : g.adaNota ? <span className="text-[11px] font-bold text-muted">📎 Nota</span> : null}
      </span>
    </button>
  )
}

function BlokKategori({ judul, data, total, jenis }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="judul-kartu text-[17px]">{judul}</span>
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

function SheetCatatKas({ jenis, tutup, mulai, onUbahMulai, kategoriLain, pencatat, demo, onSimpan, toast }) {
  const [f, setF] = useState(KOSONG)
  const [sibuk, setSibuk] = useState(false)
  const [olahNota, setOlahNota] = useState(false)
  const [saldo, setSaldo] = useState(null) // { tersedia, dibatasiTanggal } untuk pengeluaran
  const [galat, setGalat] = useState('') // penolakan dari database, tampil di dalam form
  useEffect(() => {
    if (jenis) setF({ ...KOSONG, tanggal: tanggalISO() })
    setGalat('')
  }, [jenis])

  // Pengeluaran: tampilkan saldo yang masih bisa dipakai pada tanggal itu.
  const tglSah = !!f.tanggal && (!mulai || f.tanggal >= mulai) && f.tanggal <= tanggalISO()
  useEffect(() => {
    setSaldo(null)
    if (jenis !== 'keluar' || !tglSah) return
    let aktif = true
    const t = setTimeout(() => {
      api.kasSaldoTersedia(f.tanggal, demo.current).then((d) => aktif && setSaldo(d)).catch(() => {})
    }, 250)
    return () => { aktif = false; clearTimeout(t) }
  }, [jenis, f.tanggal, tglSah]) // eslint-disable-line react-hooks/exhaustive-deps
  const nominalAngka = Number(f.nominal) || 0
  const lebih = jenis === 'keluar' && saldo && nominalAngka > saldo.tersedia

  const bawaan = (jenis === 'masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR).map((k) => k.nama)
  const pilihan = [...bawaan, ...kategoriLain.filter((k) => !bawaan.some((b) => b.toLowerCase() === k.toLowerCase()))]
  const ubah = (u) => { setGalat(''); setF((x) => ({ ...x, ...u })) }
  const kategori = f.kategori === '__lain' ? f.lain.trim() : f.kategori

  const simpan = async () => {
    if (!kategori) return toast('Pilih kategori dulu')
    if (!Number(f.nominal)) return toast('Isi nominalnya')
    if (!f.tanggal) return toast('Isi tanggalnya')
    if (mulai && f.tanggal < mulai) return toast(`Tanggal sebelum tanggal mulai kas (${tglKas(mulai, true)})`)
    if (lebih) return toast(`Saldo kas tidak cukup — maksimal ${rp(saldo.tersedia)}`)
    setSibuk(true)
    try {
      const baris = await api.catatKas({ jenis, tanggal: f.tanggal, kategori, nominal: Number(f.nominal), keterangan: f.keterangan.trim(), nota: f.nota, pencatat }, demo.current)
      onSimpan(baris)
      toast(jenis === 'keluar' ? 'Pengeluaran dicatat' : 'Pemasukan dicatat')
      tutup()
    } catch (e) {
      setGalat(e.message)
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
          <input type="date" className="field-input" value={f.tanggal} min={mulai || undefined} max={tanggalISO()} onChange={(e) => ubah({ tanggal: e.target.value })} />
        </div>
        <div>
          <label className={label}>Nominal</label>
          <InputNominal value={f.nominal} onChange={(v) => ubah({ nominal: v })} placeholder="150.000" />
        </div>
      </div>
      {mulai && (
        <p className="-mt-1.5 mb-3 flex flex-wrap items-center gap-x-1.5 px-0.5 text-[11.5px] font-semibold text-muted">
          <span>Tanggal paling awal: <b className="text-ink">{tglKas(mulai, true)}</b> (tanggal mulai kas)</span>
          <button type="button" className="font-extrabold text-brand" onClick={onUbahMulai}>Ubah</button>
        </p>
      )}
      {f.tanggal && mulai && f.tanggal < mulai ? (
        <p className="-mt-1.5 mb-3 rounded-xl bg-warn-soft px-3 py-2 text-[12px] font-semibold text-warn-deep">
          Sebelum tanggal mulai kas ({tglKas(mulai, true)}) — transaksi sebelum tanggal itu sudah termasuk saldo awal.
        </p>
      ) : jenis === 'keluar' && saldo ? (
        <p className={`-mt-1.5 mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold ${lebih ? 'bg-danger-soft text-danger' : 'bg-isi text-muted'}`}>
          {lebih ? 'Melebihi saldo kas. ' : ''}
          {saldo.dibatasiTanggal
            ? <>Maksimal <b>{rp(saldo.tersedia)}</b> supaya saldo tidak minus pada {tglKas(saldo.dibatasiTanggal, true)}.</>
            : <>Saldo kas tersedia <b>{rp(saldo.tersedia)}</b>.</>}
        </p>
      ) : null}

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

      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-danger">{galat}</p>}
      <button className={`bigbtn disabled:opacity-50 ${jenis === 'keluar' ? '!bg-danger' : '!bg-ok'}`} disabled={sibuk || olahNota || lebih} onClick={simpan}>
        {sibuk ? 'Menyimpan…' : lebih ? 'Saldo kas tidak cukup' : jenis === 'keluar' ? `Simpan pengeluaran${f.nominal ? ' ' + rp(f.nominal) : ''}` : `Simpan pemasukan${f.nominal ? ' ' + rp(f.nominal) : ''}`}
      </button>
    </Sheet>
  )
}

/* ---------- detail + batalkan ---------- */
function SheetDetailKas({ baris, tutup, bisaBatal, cegahKunci, oleh, demo, toast, onBatal }) {
  const [nota, setNota] = useState(null)
  const [muatNota, setMuatNota] = useState(false)
  const [alasan, setAlasan] = useState(null) // null = belum mau membatalkan
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    setNota(null)
    setAlasan(null)
    setGalat('')
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
      await api.batalkanKas(baris.id, teks, oleh, demo.current)
      onBatal(baris.id, teks)
      toast('Transaksi dibatalkan')
    } catch (e) {
      setGalat(e.message)
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
          {baris.dibuatPada && <Kv k="Waktu dicatat" v={waktuTampil(baris.dibuatPada)} />}
        </div>
      </div>

      {batal && (
        <div className="mt-3 rounded-2xl bg-danger-soft p-3.5 text-[13px] font-semibold text-danger">
          Dibatalkan oleh {baris.dibatalkanNama || '—'}. Alasan: {baris.alasanBatal || '—'}
        </div>
      )}
      {dicatatMundur(baris) && (
        <div className="mt-3 rounded-2xl bg-brand-soft p-3.5 text-[13px] font-semibold text-brand">
          🕘 Dicatat mundur: dicatat {selisihMundur(baris)} hari setelah tanggal transaksinya.
        </div>
      )}
      {!batal && baris.sebelumMulai && (
        <div className="mt-3 rounded-2xl bg-warn-soft p-3.5 text-[13px] font-semibold text-warn-deep">
          Tidak dihitung dalam saldo karena tanggalnya sebelum tanggal mulai saldo awal.
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
      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-danger">{galat}</p>}
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
function SheetSaldoAwal({ buka, awal, demo, tutup, toast, onSimpan }) {
  const [saldo, setSaldo] = useState('')
  const [mulai, setMulai] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    if (!buka) return
    setGalat('')
    const d = new Date()
    setSaldo(awal?.saldoAwal ?? '')
    setMulai(awal?.mulai || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }, [buka, awal])

  const simpan = async () => {
    if (!mulai) return toast('Isi tanggal mulai')
    if (mulai > tanggalISO()) return toast('Tanggal mulai tidak boleh di masa depan')
    setSibuk(true)
    try {
      await api.aturSaldoAwalKas(Number(saldo) || 0, mulai, demo.current)
      onSimpan({ saldoAwal: Number(saldo) || 0, mulai })
      toast('Saldo awal kas disimpan')
      tutup()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={() => !sibuk && tutup()} judul="Saldo awal kas" lead="Uang kas yang ada di sekolah pada tanggal mulai memakai fitur kas ini.">
      <label className="mb-1.5 block text-[13px] font-bold">Per tanggal</label>
      <input type="date" className="field-input mb-3" value={mulai} max={tanggalISO()} onChange={(e) => setMulai(e.target.value)} />
      <label className="mb-1.5 block text-[13px] font-bold">Saldo kas pada tanggal itu</label>
      <InputNominal className="mb-3" value={saldo} onChange={setSaldo} placeholder="0" />
      <div className="mb-4 rounded-xl bg-isi px-3.5 py-3 text-[12px] font-semibold leading-relaxed text-muted">
        Mulai tanggal {mulai ? tglKas(mulai, true) : 'ini'}:
        <br />• pembayaran SPP & kegiatan sebelumnya dianggap sudah termasuk saldo (tidak dihitung dua kali)
        <br />• pengeluaran/pemasukan sebelum tanggal ini tidak bisa dicatat
        <br />Kalau perlu mencatat transaksi bulan lalu, pilih tanggal yang lebih awal.
        {awal && <><br /><b className="text-ink">Mengubah saldo awal akan menghitung ulang semua saldo.</b></>}
      </div>
      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-danger">{galat}</p>}
      <button className="bigbtn disabled:opacity-60" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan…' : 'Simpan saldo awal'}</button>
    </Sheet>
  )
}
