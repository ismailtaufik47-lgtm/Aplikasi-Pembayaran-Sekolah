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
import { BtnKecil, Chevron, Chip, Ikon, KepalaHalaman, Kosong, Pil, Sheet } from '../components/ui.jsx'
import InputTanggal from '../components/InputTanggal.jsx'
import { GambarKegiatan, KoinMaskot } from '../components/Gambar.jsx'
import InputNominal from '../components/InputNominal.jsx'
import FormBatal from './FormBatal.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { rp, tanggalISO, waktuTampil } from '../lib/format.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import {
  KATEGORI_KEGIATAN, KATEGORI_KELUAR, KATEGORI_MASUK, NAMA_BULAN, daftarBulan, emojiKategori, geserBulan, hariLalu,
  kunciBulan, labelBulan, siapkanNota, tglKas, warnaKategoriKegiatan,
} from '../lib/kas.js'
import { dariKunci, hitungRekapKegiatan, kunciLabel, pilihanKegiatan } from '../lib/kegiatanKas.js'

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
export const RENTANG = [
  { id: '7', label: '7 hari', dari: () => hariLalu(6) },
  { id: '30', label: '30 hari', dari: () => hariLalu(29) },
  { id: 'bulan', label: 'Bulan ini', dari: () => tanggalISO().slice(0, 8) + '01' },
  { id: 'pilih', label: 'Pilih tanggal' },
]

const SARINGAN = [
  { id: 'semua', label: 'Semua' },
  { id: 'operasional', label: 'Operasional' },
  { id: 'kegiatan', label: 'Kegiatan', warna: 'kuning' },
]

export default function Kas() {
  const { pembayaran, pengaturan, petugas, toast, boleh, cegahKunci, biaya, paket } = useData()
  const bisaCatat = boleh('kas')
  const bisaBatal = boleh('batal')
  // Hanya dipakai mode demo (tanpa database): pembayaran di layar ikut dihitung.
  const demo = useRef({})
  demo.current = { pembayaran, biaya, paket }
  const label = pilihanKegiatan(biaya, paket)
  const cariLabel = (g) => label.find((x) => x.kunci === kunciLabel(g)) || (kunciLabel(g) ? { nama: g.kegiatan || 'Kegiatan', emoji: '🎈' } : null)

  const [versi, setVersi] = useState(0) // naik setiap ada perubahan → muat ulang
  const segarkan = () => setVersi((v) => v + 1)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState(null)
  const [bulan, setBulan] = useState(kunciBulan(tanggalISO()))
  const [lap, setLap] = useState(null)
  const [rentang, setRentang] = useState({ id: '7', dari: hariLalu(6), sampai: tanggalISO() })
  const [riwayat, setRiwayat] = useState(null) // { item, lanjut, total }
  const [saring, setSaring] = useState('semua') // semua | operasional | kegiatan
  const [memuatLagi, setMemuatLagi] = useState(false)

  const [form, setForm] = useState(null) // 'masuk' | 'keluar'
  const [formKegiatan, setFormKegiatan] = useState('') // kunci kegiatan yang langsung dipilih (dari Laporan)
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
    api.kasRiwayat({ dari: rentang.dari, sampai: rentang.sampai, batas: PER_HALAMAN, saring }, demo.current)
      .then((d) => aktif && setRiwayat(d))
      .catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [rentang.dari, rentang.sampai, saring, versi])

  // Foto nota format lama (teks di database) dipindah ke penyimpanan foto,
  // sedikit demi sedikit di latar belakang. Tidak mengganggu pemakaian.
  useEffect(() => {
    if (bisaCatat && pengaturan.id) api.pindahkanNotaLama(pengaturan.id)
  }, [bisaCatat, pengaturan.id])

  const muatBerikutnya = async () => {
    if (!riwayat || memuatLagi) return
    setMemuatLagi(true)
    try {
      const d = await api.kasRiwayat({ dari: rentang.dari, sampai: rentang.sampai, mulaiDari: riwayat.item.length, batas: PER_HALAMAN, saring }, demo.current)
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

  const bukaForm = (jenis, kegiatan = '') => {
    if (cegahKunci('kas')) return
    if (info && !info.pengaturan) {
      toast('Isi saldo awal kas dulu — cukup sekali')
      return setAturSaldo(true)
    }
    setFormKegiatan(jenis === 'keluar' ? kegiatan : '')
    setForm(jenis)
  }
  const bukaSaldo = () => !cegahKunci('saldo') && setAturSaldo(true)

  // Dari tombol "Catat pengeluaran" / "Pemasukan lain" di beranda:
  // form langsung dibuka setelah ringkasan kas termuat (perlu tahu saldo awal).
  const lokasi = useLocation()
  const navigasi = useNavigate()
  // (juga saat sudah berada di halaman Kas lalu tombol "Transaksi" ditekan lagi)
  useEffect(() => {
    const minta = lokasi.state?.catat
    if (!info || !minta) return
    const kegiatan = lokasi.state.kegiatan || ''
    navigasi(lokasi.pathname, { replace: true, state: null })
    if (bisaCatat && (minta === 'keluar' || minta === 'masuk')) bukaForm(minta, kegiatan)
  }, [info, lokasi.state]) // eslint-disable-line react-hooks/exhaustive-deps

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
            <KoinMaskot className="pointer-events-none absolute -bottom-1 right-1 h-[96px] w-[96px] sm:right-2 sm:h-[112px] sm:w-[112px] lg:right-8 lg:h-[132px] lg:w-[132px]" />
            <div className="relative pr-[84px] sm:pr-[104px] lg:pr-[150px]">
              <div className="text-[13px] font-extrabold opacity-85">Saldo kas saat ini</div>
              <div className={`mt-1 break-words font-display font-bold leading-[1.05] tracking-[-.3px] lg:text-[40px] ${rpTanda(info.saldoKini).length > 12 ? 'text-[26px] sm:text-[32px]' : 'text-[32px]'}`}>{rpTanda(info.saldoKini)}</div>
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
              <div className="noscroll -mx-[18px] mb-2.5 flex items-center gap-1.5 overflow-x-auto px-[18px] lg:mx-0 lg:px-0" role="group" aria-label="Saring transaksi">
                {SARINGAN.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={saring === x.id}
                    onClick={() => setSaring(x.id)}
                    className={`shrink-0 rounded-pill px-3 py-1.5 text-[12.5px] font-extrabold ${saring === x.id ? `permen permen-kecil permen-${x.warna || 'biru'}` : 'text-muted hover:text-ink'}`}
                  >
                    {x.label}
                  </button>
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
                  <DaftarTransaksi
                    item={riwayat.item}
                    buka={setDetail}
                    cariLabel={cariLabel}
                    kosong={saring === 'kegiatan' ? 'Belum ada pengeluaran kegiatan pada rentang tanggal ini.'
                      : rentang.id === '7' ? 'Belum ada transaksi dalam 7 hari terakhir.' : 'Tidak ada transaksi pada rentang tanggal ini.'}
                  />
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
        awalKegiatan={formKegiatan}
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
        bisaCatat={bisaCatat}
        label={label}
        onUbahLabel={() => { setDetail(null); segarkan() }}
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
export function PilihTanggal({ awal, min, terapkan, toast }) {
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
        <div className="min-w-0">
          <span className="mb-1 block text-[11.5px] font-bold text-muted">Dari</span>
          <InputTanggal kecil value={dari} min={min} max={tanggalISO()} onChange={setDari} aria-label="Dari tanggal" className="!py-2.5" />
        </div>
        <div className="min-w-0">
          <span className="mb-1 block text-[11.5px] font-bold text-muted">Sampai</span>
          <InputTanggal kecil value={sampai} min={dari || min} max={tanggalISO()} onChange={setSampai} aria-label="Sampai tanggal" className="!py-2.5" />
        </div>
      </div>
      <button className="bigbtn mt-2.5 !py-2.5 !text-[13.5px]" onClick={kirim}>Tampilkan</button>
    </div>
  )
}

/* ---------- daftar transaksi, dikelompokkan per tanggal & per catatan (grup) ---------- */
export function DaftarTransaksi({ item, buka, kosong, cariLabel }) {
  if (item.length === 0) return <div className="card"><Kosong>{kosong}</Kosong></div>
  const hari = []
  item.forEach((g) => {
    let h = hari[hari.length - 1]
    if (!h || h.tanggal !== g.tanggal) hari.push((h = { tanggal: g.tanggal, baris: [] }))
    // rincian yang dicatat bersamaan (grup sama) digabung jadi satu kartu
    const akhir = h.baris[h.baris.length - 1]
    if (g.sumber === 'kas' && g.grup && akhir?.grup === g.grup) akhir.xs.push(g)
    else h.baris.push({ grup: g.sumber === 'kas' ? g.grup : null, xs: [g] })
  })
  return (
    <div className="grid gap-3">
      {hari.map(({ tanggal, baris }) => (
        <div key={tanggal} className="min-w-0">
          <div className="mb-1.5 px-1 text-[12px] font-bold text-muted">{tglTampil(tanggal)}</div>
          <div className="card py-1">
            {baris.map(({ xs }) => {
              const g = xs[0]
              if (g.sumber === 'bayar') {
                return (
                  <div key={'b' + g.tanggal} className="row">
                    <span className="permen permen-kecil permen-biru grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"><Ikon.siswa size={19} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">Pembayaran orang tua</span>
                      <span className="block truncate text-[12px] text-muted">SPP & biaya kegiatan · {g.jumlah} transaksi</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-extrabold text-ok-deep">+{rp(g.nominal)}</span>
                  </div>
                )
              }
              const lab = cariLabel(g)
              return xs.length === 1 && !lab ? <BarisKas key={g.id} g={g} buka={buka} /> : <BarisGrup key={g.id} xs={xs} lab={lab} buka={buka} />
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const LencanaKegiatan = () => (
  <span className="permen permen-kecil permen-kuning shrink-0 rounded-[7px] px-1.5 py-px text-[10px] font-extrabold">Kegiatan</span>
)

/** Satu catatan berlabel kegiatan dan/atau beberapa rincian. */
function BarisGrup({ xs, lab, buka }) {
  const sah = xs.filter((x) => !x.dibatalkanPada)
  const total = sah.reduce((t, x) => t + x.nominal, 0)
  const semuaBatal = sah.length === 0
  const nota = Math.max(...xs.map((x) => x.jmlNota || (x.adaNota ? 1 : 0)))
  const kategori = [...new Set(xs.map((x) => x.kategori))].join(', ')
  const satu = xs.length === 1
  const ikon = lab ? (
    <GambarKegiatan emoji={lab.emoji} size={40} className={`rounded-[13px] ${semuaBatal ? 'opacity-50' : ''}`} />
  ) : (
    <span className="permen permen-kecil permen-pink grid h-10 w-10 shrink-0 place-items-center rounded-[13px]">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>
    </span>
  )
  const kepala = (
    <>
      {ikon}
      <span className={`block min-w-0 flex-1 ${semuaBatal ? 'opacity-60' : ''}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`min-w-0 truncate text-[14px] font-bold ${semuaBatal ? 'line-through' : ''}`}>{lab ? lab.nama : `${xs.length} rincian`}</span>
          {lab && <LencanaKegiatan />}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {satu ? `${xs[0].keterangan || xs[0].kategori} · ${xs[0].kategori}` : `${xs.length} rincian · ${kategori}`}
          {nota ? ` · 📎 ${nota} nota` : ''}
        </span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className={`text-[14px] font-extrabold ${semuaBatal ? 'text-muted line-through' : 'text-danger'}`}>−{rp(semuaBatal ? xs.reduce((t, x) => t + x.nominal, 0) : total)}</span>
        {semuaBatal ? <Chip>Dibatalkan</Chip> : xs.some((x) => x.sebelumMulai) ? <Chip warna="amber">Tidak dihitung</Chip> : null}
      </span>
    </>
  )
  if (satu) return <button className="row w-full text-left" onClick={() => buka(xs[0])}>{kepala}</button>
  return (
    <div className="py-1">
      <div className="row !border-0 !pb-1">{kepala}</div>
      <div className="mb-2 ml-[52px] rounded-[14px] bg-isi px-2.5 py-1 dark:bg-white/5">
        {xs.map((x) => (
          <button key={x.id} className="flex w-full items-center gap-2 py-1.5 text-left text-[12.5px]" onClick={() => buka(x)}>
            <span style={FONT_EMOJI} aria-hidden="true">{emojiKategori(x.kategori, 'keluar')}</span>
            <span className={`min-w-0 flex-1 truncate font-semibold ${x.dibatalkanPada ? 'text-muted line-through' : ''}`}>{x.keterangan || x.kategori}</span>
            <span className={`shrink-0 font-extrabold ${x.dibatalkanPada ? 'text-muted line-through' : 'text-[#34405C] dark:text-[#B8C3DC]'}`}>{rp(x.nominal)}</span>
            <Chevron />
          </button>
        ))}
      </div>
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
const MAKS_NOTA = 3
const RINCIAN_KOSONG = () => ({ kunci: Math.random().toString(36).slice(2), uraian: '', kategori: '', nominal: '' })
const KOSONG = { tanggal: '', untuk: 'operasional', kegiatan: '', kategori: '', lain: '', nominal: '', keterangan: '', nota: [], rincian: [] }

function SheetCatatKas({ jenis, awalKegiatan, tutup, mulai, onUbahMulai, kategoriLain, pencatat, demo, onSimpan, toast }) {
  const { biaya, paket, siswa, pengaturan } = useData()
  const [f, setF] = useState(KOSONG)
  const [sibuk, setSibuk] = useState(false)
  const [olahNota, setOlahNota] = useState(false)
  const [saldo, setSaldo] = useState(null) // { tersedia, dibatasiTanggal } untuk pengeluaran
  const [galat, setGalat] = useState('') // penolakan dari database, tampil di dalam form
  const [pengeluaranKeg, setPengeluaranKeg] = useState(null) // untuk kotak "Dana kegiatan"
  const pilihan = pilihanKegiatan(biaya, paket)

  useEffect(() => {
    if (jenis) {
      setF({
        ...KOSONG, tanggal: tanggalISO(), rincian: [RINCIAN_KOSONG()],
        untuk: awalKegiatan ? 'kegiatan' : 'operasional', kegiatan: awalKegiatan || '',
      })
    }
    setGalat('')
  }, [jenis, awalKegiatan])

  const modeKegiatan = jenis === 'keluar' && f.untuk === 'kegiatan'
  // dana kegiatan (uang masuk vs terpakai) dimuat sekali saat mode kegiatan dibuka
  useEffect(() => {
    if (!modeKegiatan || pengeluaranKeg) return
    api.kasPengeluaranKegiatan().then(setPengeluaranKeg).catch(() => setPengeluaranKeg([]))
  }, [modeKegiatan]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!jenis) setPengeluaranKeg(null) }, [jenis])
  const dana = modeKegiatan && f.kegiatan && pengeluaranKeg
    ? hitungRekapKegiatan({ biaya, paket, siswa, pengeluaran: pengeluaranKeg }).find((k) => k.kunci === f.kegiatan)
    : null

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

  const rincianIsi = f.rincian.filter((r) => r.uraian.trim() || r.kategori || Number(r.nominal))
  const total = modeKegiatan ? rincianIsi.reduce((t, r) => t + (Number(r.nominal) || 0), 0) : Number(f.nominal) || 0
  const lebih = jenis === 'keluar' && saldo && total > saldo.tersedia

  const bawaan = (jenis === 'masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR).map((k) => k.nama)
  const pilihanKategori = [...bawaan, ...kategoriLain.filter((k) => !bawaan.some((b) => b.toLowerCase() === k.toLowerCase()) && !KATEGORI_KEGIATAN.some((b) => b.nama === k))]
  const ubah = (u) => { setGalat(''); setF((x) => ({ ...x, ...u })) }
  const ubahRincian = (kunci, u) => { setGalat(''); setF((x) => ({ ...x, rincian: x.rincian.map((r) => (r.kunci === kunci ? { ...r, ...u } : r)) })) }
  const kategori = f.kategori === '__lain' ? f.lain.trim() : f.kategori

  const simpan = async () => {
    if (!f.tanggal) return toast('Isi tanggalnya')
    if (mulai && f.tanggal < mulai) return toast(`Tanggal sebelum tanggal mulai kas (${tglKas(mulai, true)})`)
    let rincian
    if (modeKegiatan) {
      if (!f.kegiatan) return toast('Pilih kegiatannya dulu')
      if (!rincianIsi.length) return toast('Isi minimal satu rincian')
      const kurang = rincianIsi.findIndex((r) => !r.uraian.trim() || !r.kategori || !Number(r.nominal))
      if (kurang >= 0) return toast(`Rincian ${kurang + 1}: lengkapi uraian, kategori, dan nominalnya`)
      rincian = rincianIsi.map((r) => ({ uraian: r.uraian.trim(), kategori: r.kategori, nominal: Number(r.nominal) }))
    } else {
      if (!kategori) return toast('Pilih kategori dulu')
      if (!Number(f.nominal)) return toast('Isi nominalnya')
      rincian = [{ uraian: f.keterangan.trim(), kategori, nominal: Number(f.nominal) }]
    }
    if (lebih) return toast(`Saldo kas tidak cukup — maksimal ${rp(saldo.tersedia)}`)
    setSibuk(true)
    try {
      const { biayaId, paketId } = modeKegiatan ? dariKunci(f.kegiatan) : { biayaId: null, paketId: null }
      const hasil = await api.catatKasRincian({
        jenis, tanggal: f.tanggal, rincian, biayaId, paketId, nota: f.nota, sekolahId: pengaturan.id, pencatat,
      }, demo.current)
      onSimpan({ tanggal: hasil.tanggal })
      toast(jenis === 'masuk' ? 'Pemasukan dicatat' : rincian.length > 1 ? `${rincian.length} rincian pengeluaran dicatat` : 'Pengeluaran dicatat')
      tutup()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  const pilihNota = async (files) => {
    const daftar = [...(files || [])].slice(0, MAKS_NOTA - f.nota.length)
    if (!daftar.length) return
    setOlahNota(true)
    try {
      const hasil = []
      for (const file of daftar) hasil.push(await siapkanNota(file))
      setF((x) => ({ ...x, nota: [...x.nota, ...hasil].slice(0, MAKS_NOTA) }))
    } catch (e) {
      toast(e.message)
    } finally {
      setOlahNota(false)
    }
  }

  const label = 'mb-1.5 block text-[13px] font-bold'
  const pilihKegiatan = pilihan.find((x) => x.kunci === f.kegiatan)
  return (
    <Sheet
      buka={!!jenis}
      tutup={() => !sibuk && tutup()}
      judul={jenis === 'keluar' ? 'Catat pengeluaran' : 'Catat pemasukan lain'}
      lead={jenis === 'keluar' ? 'Uang yang keluar dari kas sekolah.' : 'Di luar SPP & biaya kegiatan (itu sudah tercatat otomatis).'}
    >
      {jenis === 'keluar' && (
        <>
          <label className={label}>Pengeluaran ini untuk</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[['operasional', 'Operasional', 'listrik, ATK, honor…'], ['kegiatan', 'Kegiatan', 'manasik, outing, PMB…']].map(([id, j, sub]) => (
              <button
                key={id}
                type="button"
                aria-pressed={f.untuk === id}
                onClick={() => ubah({ untuk: id })}
                className={`rounded-[16px] px-3 py-2.5 text-left ${f.untuk === id ? 'permen permen-kecil permen-kuning' : 'border-[1.5px] border-[#DCE6F4] bg-kartu dark:border-line'}`}
              >
                <b className="block text-[13.5px] font-extrabold">{j}</b>
                <span className="text-[11px] font-bold opacity-75">{sub}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {modeKegiatan ? (
        <>
          <label className={label}>Kegiatan</label>
          {pilihan.length === 0 ? (
            <p className="mb-3 rounded-xl bg-isi px-3 py-2.5 text-[12.5px] font-semibold text-muted">Belum ada kegiatan. Tambahkan dulu di menu Jenis biaya.</p>
          ) : (
            <div className="noscroll -mx-[18px] mb-3 flex gap-2 overflow-x-auto px-[18px] pb-1 lg:-mx-6 lg:px-6">
              {pilihan.map((k) => (
                <button
                  key={k.kunci}
                  type="button"
                  aria-pressed={f.kegiatan === k.kunci}
                  onClick={() => ubah({ kegiatan: k.kunci })}
                  className={`flex shrink-0 items-center gap-2 rounded-[16px] bg-kartu py-1.5 pl-1.5 pr-3 ${f.kegiatan === k.kunci ? 'border-2 border-brand shadow-[0_0_0_3px_rgba(59,110,246,.18)]' : 'border-[1.5px] border-[#DCE6F4] dark:border-line'}`}
                >
                  <GambarKegiatan emoji={k.emoji} size={30} className="rounded-[10px]" />
                  <b className="whitespace-nowrap text-[12.5px] font-extrabold">{k.nama}</b>
                </button>
              ))}
            </div>
          )}
          {pilihKegiatan && (
            <div className="mb-3 rounded-[18px] bg-ok-soft px-3.5 py-3 text-ok-deep">
              <div className="flex items-center gap-2 text-[12px] font-extrabold">
                <GambarKegiatan emoji={pilihKegiatan.emoji} size={24} className="rounded-[8px]" />Dana {pilihKegiatan.nama}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[['Terkumpul', dana?.masuk], ['Sudah terpakai', dana?.terpakai], ['Sisa sekarang', dana?.sisa]].map(([l, v]) => (
                  <span key={l} className="min-w-0">
                    <span className="block text-[10.5px] font-extrabold opacity-75">{l}</span>
                    <b className={`block truncate text-[13px] font-extrabold ${v < 0 ? 'text-danger' : ''}`}>{dana ? rpTanda(v) : '…'}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label className={label}>Kategori</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {pilihanKategori.map((k) => (
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
        </>
      )}

      <div className={`mb-3 grid gap-2.5 ${modeKegiatan ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className={label}>Tanggal</label>
          <InputTanggal kecil={!modeKegiatan} value={f.tanggal} min={mulai || undefined} max={tanggalISO()} onChange={(v) => ubah({ tanggal: v })} aria-label="Tanggal" />
        </div>
        {!modeKegiatan && (
          <div>
            <label className={label}>Nominal</label>
            <InputNominal value={f.nominal} onChange={(v) => ubah({ nominal: v })} placeholder="150.000" />
          </div>
        )}
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

      {modeKegiatan ? (
        <div className="card mb-3 !p-3.5">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="judul-kartu text-[17px]">Rincian</div>
              <div className="text-[12px] font-semibold text-muted">Satu baris = satu barang / jasa</div>
            </div>
            <span className="mt-1 text-[11.5px] font-extrabold text-muted">{f.rincian.length} baris</span>
          </div>
          {f.rincian.map((r, i) => (
            <div key={r.kunci} className={`py-2.5 ${i ? 'border-t-[1.5px] border-dashed border-line' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[12px] font-extrabold text-muted">{i + 1}</span>
                <input
                  className="field-input !h-10 !rounded-[12px] !py-2 !text-[13.5px]"
                  maxLength={120}
                  placeholder={i === 0 ? 'mis. Sewa bus 1 unit' : 'Uraian'}
                  aria-label={`Uraian rincian ${i + 1}`}
                  value={r.uraian}
                  onChange={(e) => ubahRincian(r.kunci, { uraian: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Hapus rincian ${i + 1}`}
                  disabled={f.rincian.length === 1}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-muted hover:text-danger disabled:opacity-30"
                  onClick={() => ubah({ rincian: f.rincian.filter((x) => x.kunci !== r.kunci) })}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                </button>
              </div>
              <div className="ml-7 mt-2 flex items-center gap-2">
                <label className={`relative min-w-0 flex-1 ${r.kategori ? `permen permen-kecil permen-${warnaKategoriKegiatan(r.kategori)}` : 'border-[1.5px] border-dashed border-line bg-kartu'} flex h-[38px] items-center gap-1.5 rounded-[11px] px-2.5 text-[12.5px] font-extrabold`}>
                  <span style={FONT_EMOJI} aria-hidden="true">{r.kategori ? emojiKategori(r.kategori, 'keluar') : '🏷️'}</span>
                  <span className="min-w-0 flex-1 truncate">{r.kategori || 'Kategori'}</span>
                  <span aria-hidden="true" className="rotate-90 opacity-60">›</span>
                  <select
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={`Kategori rincian ${i + 1}`}
                    value={r.kategori}
                    onChange={(e) => ubahRincian(r.kunci, { kategori: e.target.value })}
                  >
                    <option value="">Pilih kategori</option>
                    {KATEGORI_KEGIATAN.map((k) => <option key={k.nama} value={k.nama}>{k.e} {k.nama}</option>)}
                  </select>
                </label>
                <InputNominal className="w-[148px] shrink-0" value={r.nominal} onChange={(v) => ubahRincian(r.kunci, { nominal: v })} placeholder="0" aria-label={`Nominal rincian ${i + 1}`} />
              </div>
            </div>
          ))}
          {f.rincian.length < 20 && (
            <button
              type="button"
              className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#B9CBEF] bg-brand-soft/60 text-[13px] font-extrabold text-brand dark:border-line dark:bg-white/5"
              onClick={() => ubah({ rincian: [...f.rincian, RINCIAN_KOSONG()] })}
            >
              <Ikon.plus size={16} />Tambah rincian
            </button>
          )}
          <div className="mt-3 flex items-center justify-between rounded-[16px] bg-danger-soft px-3.5 py-2.5 text-danger shadow-[inset_0_-3px_0_rgba(239,68,68,.18)]">
            <span className="text-[12.5px] font-extrabold">Total keluar</span>
            <b className="font-display text-[22px] font-bold">{rp(total)}</b>
          </div>
          {dana && total > 0 && (
            <p className="mt-2 text-[11.5px] font-bold text-muted">
              Sisa dana {pilihKegiatan?.nama} setelah ini:{' '}
              <b className={dana.sisa - total < 0 ? 'text-danger' : 'text-ok-deep'}>{rpTanda(dana.sisa - total)}</b>
              {dana.sisa - total < 0 && ' (nombok, ditutup kas sekolah)'}
            </p>
          )}
        </div>
      ) : (
        <>
          <label className={label}>Keterangan <span className="font-semibold text-muted">(opsional)</span></label>
          <input className="field-input mb-3" maxLength={300} value={f.keterangan} onChange={(e) => ubah({ keterangan: e.target.value })} placeholder={jenis === 'keluar' ? 'mis. Beli kertas HVS & spidol' : 'mis. Donasi dari alumni'} />
        </>
      )}

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold">Foto nota <span className="font-semibold text-muted">(opsional)</span></span>
        {modeKegiatan && <span className="text-[11px] font-semibold text-muted">1 foto bisa untuk semua rincian</span>}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-kartu p-2.5">
        {f.nota.map((n, i) => (
          <div key={i} className="relative">
            <img src={n} alt={`Nota ${i + 1}`} className="h-16 w-16 rounded-xl object-cover" />
            <button
              type="button"
              aria-label={`Hapus foto nota ${i + 1}`}
              className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-danger text-[13px] font-extrabold text-white shadow"
              onClick={() => ubah({ nota: f.nota.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        {f.nota.length < MAKS_NOTA && (
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[13px] font-bold text-brand ${f.nota.length ? 'h-16 w-16' : 'flex-1 py-3'}`}>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pilihNota(e.target.files); e.target.value = '' }} />
            {olahNota ? '…' : f.nota.length ? <Ikon.plus size={18} /> : '📷 Foto / pilih gambar nota'}
          </label>
        )}
        {f.nota.length > 0 && <span className="w-full text-[11px] font-semibold text-muted">{f.nota.length}/{MAKS_NOTA} foto · diperkecil otomatis</span>}
      </div>

      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-danger">{galat}</p>}
      <button className={`bigbtn disabled:opacity-50 ${jenis === 'keluar' ? '!bg-danger' : '!bg-ok'}`} disabled={sibuk || olahNota || lebih} onClick={simpan}>
        {sibuk ? 'Menyimpan…'
          : lebih ? 'Saldo kas tidak cukup'
            : jenis === 'masuk' ? `Simpan pemasukan${total ? ' ' + rp(total) : ''}`
              : modeKegiatan ? `Simpan ${rincianIsi.length || ''} rincian${total ? ' · ' + rp(total) : ''}`.replace('  ', ' ')
                : `Simpan pengeluaran${total ? ' ' + rp(total) : ''}`}
      </button>
    </Sheet>
  )
}

/* ---------- detail + label kegiatan + batalkan ---------- */
export function SheetDetailKas({ baris, tutup, bisaCatat, label, onUbahLabel, bisaBatal, cegahKunci, oleh, demo, toast, onBatal }) {
  const [nota, setNota] = useState([]) // [{ alamat, url }]
  const [muatNota, setMuatNota] = useState(false)
  const [alasan, setAlasan] = useState(null) // null = belum mau membatalkan
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [atur, setAtur] = useState(null) // { kegiatan, kategori } saat mengubah label

  useEffect(() => {
    setNota([])
    setAlasan(null)
    setAtur(null)
    setGalat('')
    if (baris?.adaNota) {
      setMuatNota(true)
      api.notaKas(baris.id).then(setNota).catch(() => setNota([])).finally(() => setMuatNota(false))
    }
  }, [baris])

  if (!baris) return null
  const batal = !!baris.dibatalkanPada
  const kunci = kunciLabel(baris)
  const lab = label.find((x) => x.kunci === kunci)
  const bisaLabel = bisaCatat && !batal && baris.jenis === 'keluar'

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

  const simpanLabel = async () => {
    if (atur.kegiatan && !atur.kategori) return toast('Pilih kategorinya')
    setSibuk(true)
    try {
      await api.aturKegiatanKas(baris.id, { ...dariKunci(atur.kegiatan), kategori: atur.kategori || null })
      toast(atur.kegiatan ? 'Label kegiatan disimpan' : 'Label kegiatan dihapus')
      onUbahLabel()
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
  const kategoriAtur = atur?.kegiatan ? KATEGORI_KEGIATAN.map((k) => k.nama) : [...new Set([baris.kategori, ...KATEGORI_KELUAR.map((k) => k.nama)])]

  return (
    <Sheet buka tutup={() => !sibuk && tutup()} judul={baris.jenis === 'keluar' ? 'Detail pengeluaran' : 'Detail pemasukan'}>
      <div className="card">
        <div className="flex items-center gap-3">
          {lab ? (
            <GambarKegiatan emoji={lab.emoji} size={48} className="rounded-2xl" />
          ) : (
            <span className={`grid h-12 w-12 place-items-center rounded-2xl text-[24px] ${baris.jenis === 'keluar' ? 'bg-danger-soft' : 'bg-ok-soft'}`} style={FONT_EMOJI}>
              {emojiKategori(baris.kategori, baris.jenis)}
            </span>
          )}
          <div className="min-w-0">
            <div className={`text-[20px] font-extrabold ${batal ? 'text-muted line-through' : baris.jenis === 'keluar' ? 'text-danger' : 'text-ok-deep'}`}>
              {baris.jenis === 'keluar' ? '−' : '+'}{rp(baris.nominal)}
            </div>
            <div className="text-[13px] font-bold">{baris.keterangan || baris.kategori}</div>
          </div>
        </div>
        <div className="mt-3 border-t border-line pt-2">
          {baris.jenis === 'keluar' && <Kv k="Untuk" v={lab ? <span className="inline-flex items-center gap-1.5">{lab.nama}<LencanaKegiatan /></span> : kunci ? baris.kegiatan || 'Kegiatan' : 'Operasional sekolah'} />}
          <Kv k="Kategori" v={<span><span style={FONT_EMOJI}>{emojiKategori(baris.kategori, baris.jenis)}</span> {baris.kategori}</span>} />
          <Kv k="Tanggal" v={tglTampil(baris.tanggal)} />
          <Kv k="Keterangan" v={baris.keterangan || '—'} />
          <Kv k="Dicatat oleh" v={baris.dicatatNama || '—'} />
          {baris.dibuatPada && <Kv k="Waktu dicatat" v={waktuTampil(baris.dibuatPada)} />}
        </div>
      </div>

      {bisaLabel && (atur === null ? (
        <button
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[#DCE6F4] bg-kartu py-3 text-[13.5px] font-extrabold text-brand dark:border-line"
          onClick={() => !cegahKunci('kas') && setAtur({ kegiatan: kunci, kategori: kunci ? baris.kategori : '' })}
        >
          <Ikon.pensil size={16} />{lab ? 'Ubah label kegiatan' : 'Tandai untuk kegiatan'}
        </button>
      ) : (
        <div className="card mt-3 !p-3.5">
          <label className="mb-1.5 block text-[13px] font-bold" htmlFor="label-kegiatan">Untuk kegiatan</label>
          <select id="label-kegiatan" className="field-input mb-3" value={atur.kegiatan} onChange={(e) => setAtur({ kegiatan: e.target.value, kategori: '' })}>
            <option value="">— Tanpa label (operasional)</option>
            {label.map((x) => <option key={x.kunci} value={x.kunci}>{x.nama}</option>)}
          </select>
          <label className="mb-1.5 block text-[13px] font-bold" htmlFor="label-kategori">Kategori</label>
          <select id="label-kategori" className="field-input mb-2" value={atur.kategori} onChange={(e) => setAtur((a) => ({ ...a, kategori: e.target.value }))}>
            <option value="">{atur.kegiatan ? 'Pilih kategori' : `Tetap: ${baris.kategori}`}</option>
            {kategoriAtur.map((k) => <option key={k} value={k}>{emojiKategori(k, 'keluar')} {k}</option>)}
          </select>
          <p className="mb-3 text-[11.5px] font-semibold leading-relaxed text-muted">Label hanya untuk rekap kegiatan. Nominal, tanggal & saldo kas tidak berubah.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="bigbtn-ghost !py-2.5 !text-[13.5px]" disabled={sibuk} onClick={() => setAtur(null)}>Batal</button>
            <button className="bigbtn !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={sibuk} onClick={simpanLabel}>{sibuk ? 'Menyimpan…' : 'Simpan label'}</button>
          </div>
        </div>
      ))}

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
          <div className="mb-2 mt-4 text-sm font-extrabold">Foto nota{nota.length > 1 ? ` (${nota.length})` : ''}</div>
          <div className="card grid min-h-[120px] place-items-center gap-2 p-2" style={{ background: '#fff' }}>
            {muatNota ? <span className="text-[13px] text-muted">Memuat foto…</span>
              : nota.some((n) => n.url) ? nota.filter((n) => n.url).map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" aria-label={`Buka foto nota ${i + 1}`}>
                  <img src={n.url} alt={`Nota ${i + 1}`} className="max-h-[360px] rounded-xl object-contain" />
                </a>
              ))
              : <span className="text-[13px] text-muted">Foto tidak bisa dimuat.</span>}
          </div>
          {nota.some((n) => n.alamat) && <p className="mt-1.5 px-1 text-[11px] font-semibold text-muted">Ketuk foto untuk membuka / mengunduh.</p>}
        </>
      )}

      <div className="h-4" />
      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-danger">{galat}</p>}
      {bisaBatal && !batal && atur === null && (alasan === null ? (
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
      <div className="mb-3"><InputTanggal value={mulai} max={tanggalISO()} onChange={setMulai} aria-label="Per tanggal" /></div>
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
