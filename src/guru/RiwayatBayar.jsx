/**
 * Menu "Transaksi" — Riwayat transaksi dengan tiga tab:
 *   Pemasukan   : pembayaran orang tua (SPP, kegiatan, PMB/DU) + pemasukan lain kas
 *   Pengeluaran : semua pengeluaran kas yang sah, bisa dicari & langsung buka notanya
 *   Dibatalkan  : pembayaran & transaksi kas yang dibatalkan, lengkap dengan alasannya
 * (nama file tetap RiwayatBayar.jsx supaya rute /guru/pembayaran tidak berubah)
 *
 * Alur membatalkan (dibuat sesederhana mungkin):
 *   ketuk transaksi → "Batalkan transaksi" → pilih alasan → "Ya, batalkan".
 * Tidak ada hapus: transaksi pindah ke tab "Dibatalkan" lengkap dengan
 * siapa, kapan, dan alasannya.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { BtnKecil, Chip, Ikon, KepalaHalaman, Kosong, Pil, Sheet, Tile } from '../components/ui.jsx'
import InputTanggal from '../components/InputTanggal.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { daftarTaSekolah, hariTampil, labelKelasSiswa, rentangTa, rp, sudahNonaktif, tanggalISO, tanggalKunci, tanggalPanjang, taPendek, waktuTampil } from '../lib/format.js'
import PilihTa from '../components/PilihTa.jsx'
import { tglKas } from '../lib/kas.js'
import { kunciLabel, pilihanKegiatan } from '../lib/kegiatanKas.js'
import FormBatal from './FormBatal.jsx'
import { DaftarTransaksi, PilihTanggal, RENTANG, SheetDetailKas } from './Kas.jsx'

const TAB = {
  pemasukan: { label: 'Pemasukan', warna: 'tosca', sub: 'Pembayaran orang tua & pemasukan lain kas sekolah' },
  pengeluaran: { label: 'Pengeluaran', warna: 'pink', sub: 'Semua pengeluaran kas sekolah — cari & buka notanya di sini' },
  batal: { label: 'Dibatalkan', warna: 'biru', sub: 'Transaksi yang dibatalkan, lengkap dengan siapa & alasannya' },
}

export default function RiwayatBayar() {
  const { boleh, cegahKunci } = useData()
  const nav = useNavigate()
  const [cari, setCari] = useSearchParams()
  const lihatBayar = boleh('pembayaran', 'lihat')
  const lihatKas = boleh('kas', 'lihat') || boleh('lap_keuangan', 'lihat')
  const lihatBatal = boleh('batal', 'lihat')
  const tabAda = [(lihatBayar || lihatKas) && 'pemasukan', lihatKas && 'pengeluaran', lihatBatal && 'batal'].filter(Boolean)
  const tab = tabAda.includes(cari.get('tab')) ? cari.get('tab') : tabAda[0]
  const pilihTab = (t) => setCari(t === tabAda[0] ? {} : { tab: t }, { replace: true })

  // PC: tombol catat di samping tab (HP sudah punya tombol "Catat" di bawah)
  const catatKeluar = boleh('kas') && tab === 'pengeluaran' && (
    <span className="ml-auto hidden lg:block">
      <BtnKecil utama onClick={() => !cegahKunci('kas') && nav('/guru/kas', { state: { catat: 'keluar' } })}><Ikon.plus size={16} />Catat pengeluaran</BtnKecil>
    </span>
  )

  return (
    <>
      <KepalaHalaman judul="Riwayat transaksi" gambar="koin" sub={TAB[tab]?.sub} />
      <div className="mb-3 flex items-center gap-3">
      {tabAda.length > 1 && (
        <div role="tablist" aria-label="Jenis transaksi" className="flex flex-1 gap-1 rounded-[18px] bg-kartu/70 p-1 shadow-[0_4px_14px_rgba(30,64,140,.06)] dark:bg-white/5 lg:max-w-[460px]">
          {tabAda.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => pilihTab(id)}
              className={`flex-1 rounded-[14px] py-2.5 text-[13.5px] font-extrabold ${tab === id ? `permen permen-kecil permen-${TAB[id].warna}` : 'text-muted'}`}
            >
              {TAB[id].label}
            </button>
          ))}
        </div>
      )}
      {catatKeluar}
      </div>
      {tab === 'pemasukan' && <TabPemasukan lihatBayar={lihatBayar} lihatKas={lihatKas} />}
      {tab === 'pengeluaran' && <DaftarKas jenis="keluar" />}
      {tab === 'batal' && <DaftarBatal />}
      {!tab && <div className="card"><Kosong>Akun ini tidak punya akses melihat transaksi.</Kosong></div>}
    </>
  )
}

/* ---------- tab Pemasukan: pembayaran orang tua | pemasukan lain ---------- */
function TabPemasukan({ lihatBayar, lihatKas }) {
  const [sumber, setSumber] = useState(lihatBayar ? 'wali' : 'lain')
  return (
    <>
      {lihatBayar && lihatKas && (
        <div className="mb-2.5 flex items-center gap-1.5" role="group" aria-label="Sumber pemasukan">
          {[['wali', 'Pembayaran orang tua'], ['lain', 'Pemasukan lain']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sumber === id}
              onClick={() => setSumber(id)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-extrabold ${sumber === id ? 'permen permen-kecil permen-tosca' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {sumber === 'wali' ? <DaftarPembayaran /> : <DaftarKas jenis="masuk" />}
    </>
  )
}

/* ---------- pembayaran orang tua ----------
 * Tahun ajaran berjalan: data sudah ada di HP (store).
 * Tahun ajaran lalu (0044): dibaca dari server per halaman — tidak ikut dimuat saat aplikasi dibuka. */
function DaftarPembayaran() {
  const { pembayaran, siswa, siswaLain, biaya, biayaLain, pengaturan, toast, cariSiswa } = useData()
  const nav = useNavigate()
  const [unduh, setUnduh] = useState(null) // id transaksi yang kuitansinya sedang dibuat
  const [pilih, setPilih] = useState(null) // transaksi yang detailnya dibuka
  const taKini = pengaturan.tahunAjaran
  const [ta, setTa] = useState(taKini)
  const lama = ta !== taKini
  const daftarTa = useMemo(() => daftarTaSekolah({ pengaturan, siswa, biayaLain }), [pengaturan, siswa, biayaLain])
  const r = rentangTa(ta)
  const sampaiTa = r.sampai < tanggalISO() ? r.sampai : tanggalISO()

  const unduhKuitansi = async (p, s) => {
    if (unduh) return
    setUnduh(p.id)
    try {
      const [d, { unduhKuitansiBayar }] = await Promise.all([
        api.kuitansiStaf(p.id, { p, s, pengaturan }),
        import('../lib/dokumen.js'),
      ])
      await unduhKuitansiBayar(d)
    } catch (e) {
      toast('Gagal membuat kuitansi: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }
  const [tglFilter, setTglFilter] = useState('') // '' = semua tanggal, atau 'YYYY-MM-DD'
  const gantiTa = (t) => { setTa(t); setTglFilter('') }

  // ---------- tahun ajaran lalu: dari server ----------
  const [server, setServer] = useState(null) // { ringkas, lanjut, item } | null
  const [galat, setGalat] = useState('')
  const [memuatLagi, setMemuatLagi] = useState(false)
  const [versi, setVersi] = useState(0)
  const demo = useRef({})
  demo.current = { pembayaran, siswa, siswaLain, biaya }
  const param = { dari: tglFilter || r.dari, sampai: tglFilter || sampaiTa }
  useEffect(() => {
    if (!lama) return undefined
    let aktif = true
    setServer(null)
    setGalat('')
    api.pembayaranDaftar(param, demo.current).then((d) => aktif && setServer(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [lama, param.dari, param.sampai, versi]) // eslint-disable-line react-hooks/exhaustive-deps
  const muatBerikutnya = async () => {
    if (!server || memuatLagi) return
    setMemuatLagi(true)
    try {
      const d = await api.pembayaranDaftar({ ...param, mulai: server.item.length }, demo.current)
      setServer((x) => ({ ...d, item: [...x.item, ...d.item] }))
    } catch (e) {
      toast('Gagal memuat: ' + e.message)
    } finally {
      setMemuatLagi(false)
    }
  }

  // ---------- tahun ajaran berjalan: dari HP ----------
  // (pembayaran lama yang ikut dimuat karena terkait tunggakan tidak ikut tampil di sini)
  const tahunIni = useMemo(() => pembayaran.filter((p) => tanggalKunci(p.tanggal) >= rentangTa(taKini).dari), [pembayaran, taKini])
  const sumber = lama ? server?.item || [] : tahunIni
  const kunciHariIni = tanggalKunci(new Date().toISOString())
  const hariIni = tahunIni.filter((p) => tanggalKunci(p.tanggal) === kunciHariIni)
  const ringkas = lama
    ? server?.ringkas || null
    : { jumlah: tahunIni.length, total: tahunIni.reduce((t, p) => t + p.nominal, 0), tunai: tahunIni.filter((p) => p.metode === 'Tunai').length, tabungan: tahunIni.filter((p) => p.metode === 'Tabungan').length }

  /** Daftar tanggal unik yang punya transaksi — untuk pilihan cepat (tahun berjalan). */
  const tanggalTersedia = useMemo(() => {
    const set = new Set(tahunIni.map((p) => tanggalKunci(p.tanggal)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [tahunIni])

  /** Transaksi yang lolos filter, dikelompokkan per hari (terbaru dulu). */
  const kelompok = useMemo(() => {
    const dipakai = tglFilter && !lama ? sumber.filter((p) => tanggalKunci(p.tanggal) === tglFilter) : sumber
    const peta = new Map()
    dipakai.forEach((p) => {
      const kunci = tanggalKunci(p.tanggal)
      if (!peta.has(kunci)) peta.set(kunci, { kunci, tanggal: p.tanggal, items: [] })
      peta.get(kunci).items.push(p)
    })
    return [...peta.values()].sort((a, b) => b.kunci.localeCompare(a.kunci))
  }, [sumber, tglFilter, lama])

  const totalTampil = kelompok.reduce((t, k) => t + k.items.reduce((x, p) => x + p.nominal, 0), 0)
  const jmlTampil = kelompok.reduce((t, k) => t + k.items.length, 0)
  const siswaDari = (p) => cariSiswa(p.siswaId) || p.siswa || null
  const tabungan = ringkas?.tabungan || 0
  const tunai = ringkas?.tunai || 0
  const jumlah = ringkas?.jumlah || 0

  return (
    <>
      <div className="noscroll -mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1.5 pt-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0">
        {lama
          ? <Stat warna="green" ikon={<Ikon.cek size={20} />} label={`Masuk ${taPendek(ta)}`} nilai={ringkas ? rp(ringkas.total) : '…'} />
          : <Stat warna="green" ikon={<Ikon.cek size={20} />} label="Masuk hari ini" nilai={rp(hariIni.reduce((t, p) => t + p.nominal, 0))} />}
        <Stat warna="blue" ikon={<Ikon.jam size={20} />} label={lama ? 'Transaksi' : 'Transaksi tahun ini'} nilai={ringkas ? jumlah : '…'} />
        <Stat
          warna="amber"
          ikon={<Ikon.dompet size={20} />}
          label={tabungan ? 'Tunai / transfer / tabungan' : 'Tunai / transfer'}
          nilai={!ringkas ? '…' : tabungan ? `${tunai} / ${jumlah - tunai - tabungan} / ${tabungan}` : `${tunai} / ${jumlah - tunai}`}
        />
      </div>

      {/* ---------- tahun ajaran + filter tanggal ---------- */}
      <div className="mb-1 mt-1 flex flex-wrap items-center gap-2.5 lg:mt-3">
        <PilihTa on nilai={ta} ubah={gantiTa} daftar={daftarTa} />
        <div className="w-[208px] shrink-0">
          <InputTanggal
            value={tglFilter}
            min={r.dari}
            max={sampaiTa}
            onChange={setTglFilter}
            kecil
            placeholder="Pilih tanggal"
            aria-label="Saring tanggal"
            className="!rounded-pill !py-2 !text-[13.5px]"
          />
        </div>
        {tglFilter && (
          <Pil on onClick={() => setTglFilter('')}>Tampilkan semua</Pil>
        )}
        {!tglFilter && !lama && tanggalTersedia.length > 0 && (
          <div className="noscroll flex min-w-0 gap-2 overflow-x-auto">
            {tanggalTersedia.slice(0, 6).map((t) => (
              <Pil key={t} onClick={() => setTglFilter(t)} className="!py-[7px] text-[12.5px]">
                {hariTampil(new Date(t + 'T00:00:00').toISOString())}
              </Pil>
            ))}
          </div>
        )}
      </div>

      <div className="seghead">
        <h2>{tglFilter ? tanggalPanjang(new Date(tglFilter + 'T00:00:00')) : lama ? ta : 'Semua transaksi'}</h2>
        {jmlTampil > 0 && <span className="shrink-0 whitespace-nowrap pl-3 text-[12.5px] font-bold text-muted">{lama && server?.lanjut ? `${jmlTampil} dari ${jumlah}` : jmlTampil} transaksi · {rp(lama && !tglFilter ? ringkas?.total || 0 : totalTampil)}</span>}
      </div>

      {lama && galat ? (
        <div className="card text-center">
          <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
          <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={() => setVersi((v) => v + 1)}>Coba lagi</button>
        </div>
      ) : lama && !server ? (
        <div className="card"><Kosong>Memuat transaksi {ta}…</Kosong></div>
      ) : jmlTampil === 0 ? (
        <div className="card">
          <Kosong>
            {tglFilter ? 'Tidak ada transaksi pada tanggal ini.' : lama ? `Tidak ada pembayaran tercatat di tahun ajaran ${ta}.` : 'Belum ada pembayaran tercatat tahun ajaran ini.'}
          </Kosong>
        </div>
      ) : (
        kelompok.map((k) => {
          const totalHari = k.items.reduce((t, p) => t + p.nominal, 0)
          return (
            <div key={k.kunci} className="mb-4">
              {/* Judul hari hanya perlu kalau sedang lihat "semua" (banyak kelompok).
                  Kalau filter ke satu tanggal, sudah ada di judul section di atas. */}
              {!tglFilter && (
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span className="text-[13px] font-extrabold text-ink">{hariTampil(k.tanggal)}</span>
                  <span className="text-[12.5px] font-bold text-muted">{k.items.length} transaksi · {rp(totalHari)}</span>
                </div>
              )}
              <div className="card">
                {k.items.map((p) => {
                  const s = siswaDari(p)
                  if (!s) return null
                  return (
                    <div key={p.id} className="row lg:rounded-xl lg:px-4 lg:hover:bg-[#FAFBFF]">
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPilih(p)}>
                        <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[14.5px] font-bold">{s.nama}</span>
                            {sudahNonaktif(s) && <span className="shrink-0 rounded-pill bg-[#F1F2F6] px-2 py-0.5 text-[10.5px] font-extrabold text-muted dark:bg-white/10">{labelKelasSiswa(s)}</span>}
                          </span>
                          <span className="block truncate text-[12.5px] text-muted">{p.ket} · {p.waktu}</span>
                        </span>
                        <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                          <span className="text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                          <Chip warna={WARNA_METODE[p.metode] || 'blue'}>{p.metode}</Chip>
                        </span>
                      </button>
                      <button
                        onClick={() => unduhKuitansi(p, s)}
                        title="Unduh kuitansi PDF"
                        aria-label={`Unduh kuitansi ${s.nama}`}
                        className="permen permen-kecil permen-biru grid h-10 w-10 shrink-0 place-items-center rounded-[13px] disabled:opacity-50"
                        disabled={!!unduh}
                      >
                        {unduh === p.id ? <Ikon.jam size={18} /> : <Ikon.unduh size={18} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
      {lama && server?.lanjut && (
        <button className="bigbtn-ghost !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={memuatLagi} onClick={muatBerikutnya}>
          {memuatLagi ? 'Memuat…' : 'Muat transaksi sebelumnya'}
        </button>
      )}

      <SheetTransaksi
        p={pilih}
        s={pilih && siswaDari(pilih)}
        tutup={() => setPilih(null)}
        unduh={unduh}
        onKuitansi={unduhKuitansi}
        onKartu={siswa.some((x) => x.id === pilih?.siswaId) ? (id) => { setPilih(null); nav(`/guru/siswa/${id}`) } : null}
        onBatal={() => lama && setVersi((v) => v + 1)}
      />
    </>
  )
}

/* ---------- pengeluaran / pemasukan lain kas (per halaman dari server) ---------- */
const SARING_KAS = [
  { id: 'semua', label: 'Semua' },
  { id: 'operasional', label: 'Operasional' },
  { id: 'kegiatan', label: 'Kegiatan', warna: 'kuning' },
]
const RENTANG_TRANSAKSI = [RENTANG.find((r) => r.id === 'bulan'), ...RENTANG.filter((r) => r.id !== 'bulan')]
const RENTANG_AWAL = () => ({ id: 'bulan', dari: tanggalISO().slice(0, 8) + '01', sampai: tanggalISO() })

function DaftarKas({ jenis }) {
  const { pembayaran, biaya, biayaLain, paket, petugas, toast, boleh, cegahKunci, pengaturan, siswa } = useData()
  const keluar = jenis === 'keluar'
  const demo = useRef({})
  demo.current = { pembayaran, biaya, paket }
  const label = pilihanKegiatan(biaya, paket)
  const cariLabel = (g) => label.find((x) => x.kunci === kunciLabel(g)) || (kunciLabel(g) ? { nama: g.kegiatan || 'Kegiatan', emoji: '🎈' } : null)

  const [rentang, setRentang] = useState(RENTANG_AWAL)
  const [saring, setSaring] = useState('semua')
  const [nota, setNota] = useState('semua') // semua | tanpa
  const [ketik, setKetik] = useState('')
  const [kata, setKata] = useState('')
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState('')
  const [memuatLagi, setMemuatLagi] = useState(false)
  const [detail, setDetail] = useState(null)
  const [versi, setVersi] = useState(0)

  // cari: tunggu sebentar setelah berhenti mengetik
  useEffect(() => {
    const t = setTimeout(() => setKata(ketik.trim()), 350)
    return () => clearTimeout(t)
  }, [ketik])

  const param = { jenis, dari: rentang.dari, sampai: rentang.sampai, saring: keluar ? saring : 'semua', nota, cari: kata }
  useEffect(() => {
    let aktif = true
    setData(null)
    setGalat('')
    api.kasDaftar(param, demo.current).then((d) => aktif && setData(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [jenis, rentang.dari, rentang.sampai, saring, nota, kata, versi]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatBerikutnya = async () => {
    if (!data || memuatLagi) return
    setMemuatLagi(true)
    try {
      const d = await api.kasDaftar({ ...param, mulaiDari: data.item.length }, demo.current)
      setData((x) => ({ ...d, item: [...x.item, ...d.item] }))
    } catch (e) {
      toast('Gagal memuat: ' + e.message)
    } finally {
      setMemuatLagi(false)
    }
  }

  const daftarTa = useMemo(() => daftarTaSekolah({ pengaturan, siswa, biayaLain }), [pengaturan, siswa, biayaLain])
  // satu tahun ajaran penuh: 1 Juli – 30 Juni (tahun berjalan: sampai hari ini)
  const pilihTa = (ta) => {
    const r = rentangTa(ta)
    setRentang({ id: 'ta', ta, dari: r.dari, sampai: r.sampai < tanggalISO() ? r.sampai : tanggalISO() })
  }
  const pilihRentang = (id) => {
    if (id === 'pilih') return setRentang((x) => ({ ...x, id }))
    setRentang({ id, dari: RENTANG.find((r) => r.id === id).dari(), sampai: tanggalISO() })
  }

  const r = data?.ringkas
  const tanpa = r ? r.jumlah - r.adaNota : 0
  const kosong = kata ? `Tidak ada ${keluar ? 'pengeluaran' : 'pemasukan lain'} dengan kata "${kata}".`
    : nota === 'tanpa' ? 'Semua pengeluaran pada rentang ini sudah ada notanya. 👍'
      : saring === 'kegiatan' ? 'Belum ada pengeluaran kegiatan pada rentang tanggal ini.'
        : `Belum ada ${keluar ? 'pengeluaran' : 'pemasukan lain'} pada rentang tanggal ini.`

  return (
    <>
      <div className="noscroll -mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1.5 pt-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0">
        <Stat warna={keluar ? 'red' : 'green'} ikon={keluar ? <PanahKeluar /> : <Ikon.cek size={20} />} label={keluar ? 'Total pengeluaran' : 'Total pemasukan lain'} nilai={r ? rp(r.total) : '…'} />
        <Stat warna="blue" ikon={<Ikon.jam size={20} />} label="Transaksi" nilai={r ? r.jumlah : '…'} />
        {keluar ? (
          <Stat warna={tanpa ? 'amber' : 'green'} ikon={<span className="text-[17px]" aria-hidden="true">📎</span>} label="Ada nota" nilai={r ? `${r.adaNota} dari ${r.jumlah}` : '…'} />
        ) : (
          <Stat warna="amber" ikon={<Ikon.kalender size={20} />} label="Rentang" nilai={<span className="text-[17px]">{tglKas(rentang.dari)} – {tglKas(rentang.sampai)}</span>} />
        )}
      </div>

      {/* ---------- saringan ---------- */}
      <div className="noscroll -mx-[18px] mb-2 mt-2 flex gap-2 overflow-x-auto px-[18px] lg:mx-0 lg:mt-3 lg:flex-wrap lg:px-0">
        {RENTANG_TRANSAKSI.map((x) => (
          <Pil key={x.id} on={rentang.id === x.id} onClick={() => pilihRentang(x.id)} ikon={x.id === 'pilih' ? <Ikon.kalender size={15} /> : null}>
            {x.label}
          </Pil>
        ))}
        <PilihTa on={rentang.id === 'ta'} nilai={rentang.ta || ''} ubah={pilihTa} daftar={daftarTa} />
      </div>
      {rentang.id === 'pilih' && <PilihTanggal awal={rentang} terapkan={(dari, sampai) => setRentang({ id: 'pilih', dari, sampai })} toast={toast} />}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <label className="relative order-last w-full sm:order-none sm:w-[260px]">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Ikon.cari size={17} /></span>
          <input
            type="search"
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            placeholder={keluar ? 'Cari: ATK, honor, manasik…' : 'Cari: BOP, donasi…'}
            aria-label={keluar ? 'Cari pengeluaran' : 'Cari pemasukan lain'}
            className="field-input !rounded-pill !py-2 pl-10 !text-[13.5px]"
          />
        </label>
        {keluar && (
          <div className="noscroll flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Saring pengeluaran">
            {SARING_KAS.map((x) => (
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
            <button
              type="button"
              aria-pressed={nota === 'tanpa'}
              onClick={() => setNota((n) => (n === 'tanpa' ? 'semua' : 'tanpa'))}
              className={`shrink-0 rounded-pill px-3 py-1.5 text-[12.5px] font-extrabold ${nota === 'tanpa' ? 'permen permen-kecil permen-kuning' : 'text-muted hover:text-ink'}`}
            >
              Tanpa nota{r && tanpa ? ` (${tanpa})` : ''}
            </button>
          </div>
        )}
      </div>

      <div className="seghead">
        <h2>{tglKas(rentang.dari)} – {tglKas(rentang.sampai, true)}</h2>
        {data && data.jumlahTampil > 0 && (
          <span className="text-[12.5px] font-bold text-muted">{data.jumlahTampil} transaksi{nota === 'tanpa' ? ' tanpa nota' : ''}</span>
        )}
      </div>

      {galat ? (
        <div className="card text-center">
          <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
          <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={() => setVersi((v) => v + 1)}>Coba lagi</button>
        </div>
      ) : !data ? (
        <div className="card"><Kosong>Memuat transaksi…</Kosong></div>
      ) : (
        <>
          <DaftarTransaksi item={data.item} buka={setDetail} cariLabel={cariLabel} kosong={kosong} />
          {data.lanjut && (
            <button className="bigbtn-ghost mt-3 !py-2.5 !text-[13.5px] disabled:opacity-60" disabled={memuatLagi} onClick={muatBerikutnya}>
              {memuatLagi ? 'Memuat…' : 'Muat transaksi sebelumnya'}
            </button>
          )}
        </>
      )}

      <SheetDetailKas
        baris={detail}
        tutup={() => setDetail(null)}
        bisaCatat={boleh('kas')}
        label={label}
        onUbahLabel={() => { setDetail(null); setVersi((v) => v + 1) }}
        bisaBatal={boleh('batal')}
        cegahKunci={cegahKunci}
        oleh={petugas}
        demo={demo}
        toast={toast}
        onBatal={() => { setDetail(null); setVersi((v) => v + 1) }}
      />
    </>
  )
}

const PanahKeluar = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>
)

/* ---------- detail satu transaksi + batalkan ---------- */
function SheetTransaksi({ p, s, tutup, unduh, onKuitansi, onKartu, onBatal }) {
  const { batalkanPembayaran, toast, boleh, cegahKunci } = useData()
  const [form, setForm] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => { setForm(false) }, [p])
  if (!p || !s) return null

  const kirim = async (alasan) => {
    setSibuk(true)
    try {
      await batalkanPembayaran(p.id, alasan, p)
      toast('Pembayaran dibatalkan')
      onBatal?.()
      tutup()
    } catch {
      /* pesan galat sudah ditampilkan store */
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
    <Sheet buka tutup={() => !sibuk && tutup()} judul="Detail pembayaran">
      <div className="card">
        <div className="flex items-center gap-3">
          <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold leading-tight">{s.nama}</div>
            <div className="text-[12.5px] text-muted">{labelKelasSiswa(s)}{s.nis ? ` · NIS ${s.nis}` : ''}</div>
          </div>
          <div className="shrink-0 text-[18px] font-extrabold text-ok-deep">{rp(p.nominal)}</div>
        </div>
        <div className="mt-3 border-t border-line pt-2">
          <Kv k="Untuk" v={p.ket} />
          <Kv k="Tanggal" v={waktuTampil(p.tanggal)} />
          <Kv k="Metode" v={p.metode} />
          <Kv k="Dicatat oleh" v={p.petugas || '—'} />
        </div>
      </div>

      <div className="mt-3 flex gap-2.5">
        <button
          className="tombol-putih flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[13.5px] font-extrabold disabled:opacity-50"
          onClick={() => onKuitansi(p, s)}
          disabled={!!unduh}
        >
          {unduh === p.id ? <><Ikon.jam size={17} /> Membuat…</> : <><Ikon.unduh size={17} /> Kuitansi</>}
        </button>
        {onKartu && (
          <button className="tombol-putih flex-1 rounded-2xl py-3 text-[13.5px] font-extrabold" onClick={() => onKartu(s.id)}>
            🧒 Kartu siswa
          </button>
        )}
      </div>

      <div className="h-3" />
      {boleh('batal') && (form ? (
        <div className="mb-2.5">
          <FormBatal nominal={p.nominal} sibuk={sibuk} onKirim={kirim} onBatal={() => setForm(false)} />
        </div>
      ) : (
        <button
          className="mb-2.5 w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={() => !cegahKunci('batal') && setForm(true)}
        >
          Batalkan transaksi ini
        </button>
      ))}
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- daftar transaksi yang dibatalkan (pembayaran + kas) ---------- */
function DaftarBatal() {
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    api.riwayatPembatalan().then(setData).catch((e) => setGalat(e.message))
  }, [])

  if (galat) return <div className="card"><Kosong>{galat}</Kosong></div>
  if (!data) return <div className="card"><Kosong>Memuat riwayat pembatalan…</Kosong></div>

  const total = data.reduce((t, b) => t + Number(b.nominal || 0), 0)
  return (
    <>
      <div className="seghead">
        <h2>Transaksi dibatalkan</h2>
        {data.length > 0 && <span className="text-[12.5px] font-bold text-muted">{data.length} transaksi · {rp(total)}</span>}
      </div>
      <div className="card">
        {data.length === 0 ? (
          <Kosong>Belum ada transaksi yang dibatalkan. 👍</Kosong>
        ) : (
          data.map((b) => (
            <div key={b.sumber + b.id} className="row items-start">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-[18px] ${b.sumber === 'kas' ? 'bg-warn-soft' : 'bg-danger-soft'}`}>
                {b.sumber === 'kas' ? '💰' : '💳'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-snug">{b.uraian}</span>
                <span className="block text-[12px] text-muted">
                  {b.sumber === 'kas' ? (b.jenis === 'keluar' ? 'Kas keluar' : 'Kas masuk') : 'Pembayaran'} · dicatat {b.petugas || '—'}
                </span>
                <span className="mt-1.5 block rounded-xl bg-danger-soft px-2.5 py-1.5 text-[12px] font-semibold text-danger">
                  Dibatalkan {b.dibatalkanNama || '—'} · {waktuTampil(b.dibatalkanPada)}
                  <br />
                  Alasan: {b.alasan || '—'}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-extrabold text-muted line-through">{rp(b.nominal)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

/** Warna chip metode bayar. */
const WARNA_METODE = { Tunai: 'green', Transfer: 'blue', Tabungan: 'amber' }

const Stat = ({ warna, ikon, label, nilai }) => (
  <div className="card min-w-[150px] p-[15px] lg:min-w-0 lg:p-[18px]">
    <Tile warna={warna}>{ikon}</Tile>
    <div className="mt-3 text-[13px] font-medium text-muted">{label}</div>
    <div className="judul-halaman mt-0.5 font-display text-[22px] font-semibold leading-tight">{nilai}</div>
  </div>
)