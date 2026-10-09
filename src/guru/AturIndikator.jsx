/**
 * Atur indikator kesehatan keuangan (khusus kepala sekolah / yang boleh
 * mengelola profil sekolah). Skor di atas berubah LANGSUNG saat diatur,
 * memakai data sekolah yang sebenarnya; baru tersimpan setelah "Simpan".
 * Setiap simpan tercatat di riwayat (0037) — siapa, kapan, dan APA yang
 * diubah (dibandingkan dengan simpanan sebelumnya).
 * Biaya rutin "Isi sendiri" dirinci per baris: keterangan + nominal (0038).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { Ikon, KepalaHalaman } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { rp, waktuTampil } from '../lib/format.js'
import { KATEGORI_KELUAR, NAMA_BULAN, geserBulan } from '../lib/kas.js'
import { ATURAN_BAWAAN, BATAS_TARGET, KUNCI, LABEL_STATUS, NAMA, PENGARUH, PRESET, ZONA, rapikanAturan, ringkasPerubahan } from '../lib/kesehatan.js'
import { useKesehatan } from './useKesehatan.js'

const DESK = {
  cad: { pra: 'Aman kalau kas bebas cukup untuk biaya rutin selama', satuan: 'bulan' },
  arus: { teks: 'Jadi merah kalau pengeluaran lebih besar dari pemasukan 2 bulan berturut-turut.' },
  spp: { pra: 'Target SPP yang sudah masuk', satuan: '%' },
  tungg: { pra: 'Aman kalau tunggakan tidak lebih dari … SPP sebulan', satuan: '%' },
  keg: { teks: 'Jadi kuning kalau ada kegiatan yang pengeluarannya lebih besar dari uang masuknya.' },
  nota: { pra: 'Target pengeluaran yang ada foto notanya', satuan: '%' },
  proy: { teks: 'Jadi merah kalau kas bebas diperkirakan habis dalam 3 bulan ke depan.' },
}
const PILIHAN_PRESET = [
  ['longgar', 'Longgar', 'sekolah baru / kecil'],
  ['normal', 'Normal', 'disarankan'],
  ['ketat', 'Ketat', 'yayasan ketat'],
]
const CHIP = { aman: 'bg-ok-soft text-ok-deep', pantau: 'bg-warn-soft text-warn-deep', tindakan: 'bg-danger-soft text-danger' }
const WARNA_ZONA = { hijau: 'text-ok-deep bg-ok-soft', kuning: 'text-warn-deep bg-warn-soft', merah: 'text-danger bg-danger-soft', kosong: 'text-muted bg-isi' }

const SARAN_RUTIN = ['Gaji guru', 'Honor guru', 'Gaji TU', 'Listrik & air', 'Internet', 'ATK', 'Konsumsi', 'Sewa gedung', 'Kebersihan', 'Transport', 'Perawatan gedung']
const BARIS_AWAL = ['Gaji / honor guru', 'Listrik & air', 'ATK']
let nomorBaris = 0
const barisBaru = (nama = '', nominal = '') => ({ k: ++nomorBaris, nama, nominal })

/** Isi tersimpan → draf yang bisa diedit (baris rincian diberi kunci; angka lama tanpa rincian jadi 1 baris). */
function keDraf(isi) {
  const a = rapikanAturan(isi)
  if (a.rutinRincian) return { ...a, rutinRincian: a.rutinRincian.map((r) => barisBaru(r.nama, r.nominal)) }
  if (a.rutinManual) return { ...a, rutinRincian: [barisBaru('', a.rutinManual)] }
  return a
}

const TANDA = {
  tambah: ['+', 'bg-ok-soft text-ok-deep'],
  hapus: ['−', 'bg-danger-soft text-danger'],
  ubah: ['✎', 'bg-[#E6EEFF] text-brand dark:bg-white/10'],
  info: ['•', 'bg-isi text-muted'],
}

function Stepper({ nilai, satuan, kurang, tambah, label }) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <button type="button" onClick={kurang} aria-label={`Kurangi ${label}`} className="permen permen-biru grid h-12 w-12 shrink-0 place-items-center rounded-[15px]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span className="min-w-0 flex-1 text-center" aria-live="polite">
        <b className="font-display text-[27px] font-semibold text-[#1B2559] dark:text-ink">{nilai}</b>{' '}
        <span className="text-[14.5px] font-bold text-muted">{satuan}</span>
      </span>
      <button type="button" onClick={tambah} aria-label={`Tambah ${label}`} className="permen permen-biru grid h-12 w-12 shrink-0 place-items-center rounded-[15px]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}

function Saklar({ on, ubah, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={ubah}
      className={`relative h-[34px] w-[58px] shrink-0 rounded-full transition-colors ${on ? 'bg-ok' : 'bg-[#C9D1DE] dark:bg-white/15'}`}>
      <span className={`absolute top-1 h-[26px] w-[26px] rounded-full bg-white shadow transition-[left] ${on ? 'left-[28px]' : 'left-1'}`} />
    </button>
  )
}

export default function AturIndikator() {
  const { boleh, toast, petugas, pembayaran, biaya, paket } = useData()
  const nav = useNavigate()
  const bisa = boleh('sekolah')
  const { d, hitung, indikator, setIndikator, bulanIni } = useKesehatan()
  const [draf, setDraf] = useState(null)
  const [simpan, setSimpan] = useState(false)
  const [riwayat, setRiwayat] = useState([])
  const [baru, setBaru] = useState({ nama: '', bulan: 12, nominal: '' })
  const [isiKas, setIsiKas] = useState('') // '' | 'memuat' | 'kas' | 'kosong'

  useEffect(() => { if (d.siap && !draf) setDraf(keDraf(indikator.isi)) }, [d.siap, indikator.isi, draf])
  useEffect(() => { api.riwayatIndikator().then(setRiwayat).catch(() => {}) }, [indikator.diubahPada])

  const a = draf || rapikanAturan(null)
  const kes = useMemo(() => hitung(a), [hitung, a])
  const kr = Object.fromEntries((kes?.kriteria || []).map((x) => [x.k, x]))
  const ubah = (patch) => setDraf((x) => ({ ...(x || a), ...patch }))
  const ubahTarget = (k, arah) => {
    const b = BATAS_TARGET[k]
    const v = Math.min(b.max, Math.max(b.min, a.target[k] + arah * b.langkah))
    ubah({ target: { ...a.target, [k]: v }, preset: 'sendiri' })
  }
  const berubah = JSON.stringify(rapikanAturan(indikator.isi)) !== JSON.stringify(rapikanAturan(a))

  // ---------- biaya rutin: isi sendiri (rincian) ----------
  const manual = Array.isArray(a.rutinRincian)
  const rincian = a.rutinRincian || []
  const totalRincian = rincian.reduce((s, r) => s + (Number(r.nominal) || 0), 0)
  const ubahRincian = (list) => ubah({ rutinRincian: list, rutinManual: list.reduce((s, r) => s + (Number(r.nominal) || 0), 0) || null })
  const ubahBaris = (k, patch) => ubahRincian(rincian.map((r) => (r.k === k ? { ...r, ...patch } : r)))

  /** Rata-rata pengeluaran per kategori 3 bulan penuh terakhir (tanpa pengeluaran berlabel kegiatan). */
  const ambilDariKas = async () => {
    const bulan = [1, 2, 3].map((n) => geserBulan(bulanIni, -n))
    const laps = await Promise.all(bulan.map((b) => api.kasLaporanBulan(b, { pembayaran, biaya, paket }).catch(() => null)))
    const jumlah = {}
    let adaBulan = 0
    laps.forEach((lap, i) => {
      if (!lap) return
      const keg = {}
      ;(d.keg || []).filter((k) => String(k.tanggal).slice(0, 7) === bulan[i]).forEach((k) => { keg[k.kategori] = (keg[k.kategori] || 0) + Number(k.nominal || 0) })
      let total = 0
      ;(lap.keluarPerKategori || []).forEach((x) => {
        const v = Math.max(0, Number(x.nominal || 0) - (keg[x.kategori] || 0))
        if (v > 0) { jumlah[x.kategori] = (jumlah[x.kategori] || 0) + v; total += v }
      })
      if (total > 0) adaBulan += 1
    })
    if (!adaBulan) return []
    return Object.entries(jumlah)
      .map(([nama, v]) => barisBaru(nama.slice(0, 60), Math.round(v / adaBulan / 1000) * 1000))
      .filter((r) => r.nominal > 0)
      .sort((x, y) => y.nominal - x.nominal)
      .slice(0, 20)
  }

  const pilihManual = async (mau) => {
    if (!mau) { setIsiKas(''); return ubah({ rutinRincian: null, rutinManual: null }) }
    if (manual) return
    ubah({ rutinRincian: [] })
    setIsiKas('memuat')
    let rows = []
    try { rows = await ambilDariKas() } catch { rows = [] }
    setIsiKas(rows.length ? 'kas' : 'kosong')
    const list = rows.length ? rows : BARIS_AWAL.map((n) => barisBaru(n))
    setDraf((x) => (Array.isArray(x?.rutinRincian) && x.rutinRincian.length === 0
      ? { ...x, rutinRincian: list, rutinManual: list.reduce((s, r) => s + (Number(r.nominal) || 0), 0) || null }
      : x))
  }

  const tambahBaris = () => {
    if (rincian.length >= 20) return toast('Maksimal 20 biaya rutin')
    ubahRincian([...rincian, barisBaru()])
    setTimeout(() => document.getElementById(`rutin-nama-${nomorBaris}`)?.focus(), 30)
  }

  const simpanAturan = async () => {
    if (!bisa) return
    if (manual) {
      const isi = rincian.filter((r) => String(r.nama).trim() || Number(r.nominal) > 0)
      if (!isi.length) return toast('Isi minimal satu biaya rutin, atau pilih Otomatis')
      const tanpaNama = isi.find((r) => !String(r.nama).trim())
      if (tanpaNama) {
        document.getElementById(`rutin-nama-${tanpaNama.k}`)?.focus()
        return toast('Setiap biaya rutin perlu keterangan, mis. Gaji guru')
      }
      const tanpaNominal = isi.find((r) => !(Number(r.nominal) > 0))
      if (tanpaNominal) return toast(`Isi nominal untuk "${tanpaNominal.nama.trim()}"`)
    }
    const bersih = rapikanAturan(a)
    setSimpan(true)
    try {
      await api.simpanIndikator(bersih, petugas)
      setIndikator({ isi: bersih, diubahNama: petugas, diubahPada: new Date().toISOString() })
      setDraf(keDraf(bersih))
      setIsiKas('')
      toast('Pengaturan indikator disimpan')
    } catch (e) {
      toast(e.message)
    } finally {
      setSimpan(false)
    }
  }

  const tambahTerjadwal = () => {
    const nominal = Number(baru.nominal) || 0
    if (!baru.nama.trim() || nominal <= 0) return toast('Isi nama dan nominal pengeluaran dulu')
    if (a.terjadwal.length >= 20) return toast('Maksimal 20 pengeluaran terjadwal')
    ubah({ terjadwal: [...a.terjadwal, { nama: baru.nama.trim().slice(0, 60), bulan: Number(baru.bulan), nominal }] })
    setBaru({ nama: '', bulan: 12, nominal: '' })
  }

  const zona = kes?.zona || 'kosong'
  const label = 'mb-1.5 block text-[14px] font-extrabold'

  return (
    <>
      <KepalaHalaman judul="Atur indikator" sub="Cara menilai kesehatan keuangan sekolah" gambar="koin" kembali={() => nav('/guru')} />

      {indikator.belumAktif && (
        <p className="card mb-3 border-l-4 border-warn text-[14px] font-semibold text-warn-deep">
          Penyimpanan pengaturan belum aktif. Jalankan file 0037_indikator_kesehatan.sql di Supabase SQL Editor. Sementara itu dasbor memakai pengaturan bawaan (Normal).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-5">
        {/* ---------- kiri: pratinjau, tingkat ketat, biaya rutin ---------- */}
        <div className={`grid min-w-0 gap-4 lg:gap-5 ${manual ? '' : 'lg:sticky lg:top-4'}`}>
          <div className="card kartu-timbul lg:p-5">
            <span className="text-[15px] font-extrabold text-muted">Dengan pengaturan ini</span>
            <div className="mt-1.5 flex items-center gap-3.5">
              <b className={`font-display text-[50px] font-bold leading-none ${WARNA_ZONA[zona].split(' ')[0]}`}>{kes?.skor ?? '—'}</b>
              <span className="min-w-0">
                <span className={`inline-block rounded-full px-3 py-1 text-[14.5px] font-extrabold ${WARNA_ZONA[zona]}`}>{ZONA[zona].label}</span>
                <span className="mt-1 block text-[13.5px] font-semibold text-muted">Berubah langsung saat Ibu mengatur{berubah ? ' — belum disimpan' : ''}</span>
              </span>
            </div>
            <div className="relative mt-4 h-3.5 rounded-full" style={{ background: 'linear-gradient(90deg,#FF7A6B 0 40%,#FFC94D 40% 70%,#3DD07F 70% 100%)' }}>
              {kes?.skor != null && <span className="absolute -top-1.5 h-[26px] w-2 -translate-x-1/2 rounded-full bg-[#1B2559] ring-2 ring-white transition-[left] duration-300 dark:bg-white dark:ring-[#1B2559]" style={{ left: `${kes.skor}%` }} />}
            </div>
            <div className="relative mt-1 h-4 text-[12px] font-bold text-muted">
              <span className="absolute left-0">0</span><span className="absolute left-[40%] -translate-x-1/2">40</span><span className="absolute left-[70%] -translate-x-1/2">70</span><span className="absolute right-0">100</span>
            </div>
          </div>

          <div className="card lg:p-5">
            <h2 className="judul-kartu mb-2.5 text-[19px]">Seberapa ketat?</h2>
            <div role="radiogroup" aria-label="Tingkat ketat" className="grid grid-cols-3 gap-2">
              {PILIHAN_PRESET.map(([v, l, sub]) => (
                <button key={v} type="button" role="radio" aria-checked={a.preset === v}
                  onClick={() => ubah({ preset: v, target: { ...PRESET[v] } })}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-1.5 py-2.5 text-center ${a.preset === v ? 'permen permen-biru outline outline-[3px] outline-offset-2 outline-brand' : 'tombol-putih'}`}>
                  <b className="text-[15.5px] font-extrabold">{l}</b>
                  <span className="text-[12px] font-bold leading-tight opacity-80">{sub}</span>
                </button>
              ))}
            </div>
            {a.preset === 'sendiri' && <p className="mt-2 text-[13.5px] font-bold text-muted">Angka target sudah Ibu ubah sendiri.</p>}
          </div>

          <div className="card lg:p-5">
            <h2 className="judul-kartu text-[19px]">Biaya rutin per bulan</h2>
            <p className="mb-3 text-[13.5px] font-semibold text-muted">Dipakai untuk menghitung "kas cukup berapa bulan".</p>
            <div role="radiogroup" aria-label="Biaya rutin" className="grid gap-2">
              {[
                [false, 'Otomatis', kes?.rutinOtomatis ? <>Rata-rata 3 bulan terakhir: <b className="text-ink">{rp(kes.rutinOtomatis)}</b> (pengeluaran tanpa kegiatan)</> : 'Belum ada catatan pengeluaran 3 bulan terakhir'],
                [true, 'Isi sendiri', 'Rinci per pos: gaji guru, listrik, sewa, dll.'],
              ].map(([m, l, sub]) => {
                const on = manual === m
                return (
                  <button key={l} type="button" role="radio" aria-checked={on} onClick={() => pilihManual(m)}
                    className={`flex items-center gap-3 rounded-[18px] border-[2.5px] bg-kartu px-3.5 py-3 text-left ${on ? 'border-brand' : 'border-line'}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-[2.5px] ${on ? 'border-brand' : 'border-line'}`}>{on && <span className="h-3 w-3 rounded-full bg-brand" />}</span>
                    <span className="min-w-0"><b className="block text-[15.5px] font-extrabold">{l}</b><span className="text-[13.5px] font-semibold text-muted">{sub}</span></span>
                  </button>
                )
              })}
            </div>
            {manual && (
              <div className="mt-3.5">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <b className="text-[15px] font-extrabold">Rincian biaya per bulan</b>
                  <span className="shrink-0 text-[13px] font-bold text-muted">{rincian.length} pos</span>
                </div>
                {isiKas === 'memuat' && <p className="rounded-[14px] bg-isi px-3 py-3 text-[14px] font-semibold text-muted">Mengambil dari catatan kas 3 bulan terakhir…</p>}
                {isiKas === 'kas' && <p className="mb-2 text-[13px] font-semibold text-muted">Sudah diisi dari rata-rata catatan kas 3 bulan terakhir. Silakan ubah keterangan atau nominalnya.</p>}
                <datalist id="saran-rutin">{[...new Set([...SARAN_RUTIN, ...KATEGORI_KELUAR.map((x) => x.nama)])].map((n) => <option key={n} value={n} />)}</datalist>
                <div className="border-t-[1.5px] border-dashed border-line">
                  {rincian.map((r, i) => (
                    <div key={r.k} className="grid grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-x-2 gap-y-1.5 border-b-[1.5px] border-dashed border-line py-2.5 sm:grid-cols-[28px_minmax(0,1fr)_150px_44px] lg:grid-cols-[28px_minmax(0,1fr)_44px] xl:grid-cols-[28px_minmax(0,1fr)_150px_44px]">
                      <span className="col-start-1 row-start-1 grid h-7 w-7 place-items-center rounded-full bg-isi text-[13px] font-extrabold text-muted">{i + 1}</span>
                      <label htmlFor={`rutin-nama-${r.k}`} className="sr-only">Keterangan biaya {i + 1}</label>
                      <input id={`rutin-nama-${r.k}`} list="saran-rutin" className="field-input col-start-2 row-start-1 min-w-0" value={r.nama} maxLength={60}
                        placeholder="Keterangan, mis. Gaji guru" onChange={(e) => ubahBaris(r.k, { nama: e.target.value })} />
                      <InputNominal value={r.nominal} onChange={(v) => ubahBaris(r.k, { nominal: v })} placeholder="0" aria-label={`Nominal ${r.nama || `biaya ${i + 1}`} per bulan`}
                        className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1" />
                      <button type="button" aria-label={`Hapus ${r.nama || `biaya ${i + 1}`}`} onClick={() => ubahRincian(rincian.filter((x) => x.k !== r.k))}
                        className="col-start-3 row-start-1 grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger sm:col-start-4 lg:col-start-3 xl:col-start-4">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                {isiKas !== 'memuat' && (
                  <button type="button" onClick={tambahBaris} className="tombol-putih mt-2.5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[16px] text-[15px] font-extrabold text-brand">
                    + Tambah biaya bulanan
                  </button>
                )}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] bg-[#E6EEFF] px-3.5 py-3 dark:bg-white/10">
                  <span className="text-[14.5px] font-extrabold">Total per bulan</span>
                  <b className="font-display text-[22px] font-semibold text-[#1B2559] dark:text-ink">{rp(totalRincian)}</b>
                </div>
                <p className="mt-2.5 flex gap-2 text-[13px] font-semibold leading-relaxed text-muted">
                  <span className="mt-0.5 shrink-0"><Ikon.info size={16} /></span>
                  <span>Ini hanya perkiraan untuk menghitung indikator — <b className="text-ink">tidak mencatat pengeluaran</b>. Uang yang benar-benar keluar tetap dicatat di Kas sekolah.</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---------- kanan: 7 hal yang dicek, terjadwal, simpan ---------- */}
        <div className="grid min-w-0 gap-4 lg:gap-5">
          <div className="card lg:p-5">
            <h2 className="judul-kartu text-[19px]">Hal yang dicek</h2>
            <p className="mb-1 text-[13.5px] font-semibold text-muted">Matikan yang tidak sesuai dengan sekolah Ibu.</p>
            {KUNCI.map((k) => {
              const on = a.aktif[k]
              const x = kr[k]
              const dk = DESK[k]
              return (
                <div key={k} className="border-b-[1.5px] border-dashed border-line py-3.5 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-50'}`}>
                      <b className="block text-[16px] font-extrabold">{NAMA[k]}</b>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold ${on && CHIP[x?.status] ? CHIP[x.status] : 'bg-isi text-muted'}`}>{on ? LABEL_STATUS[x?.status] || '—' : 'Tidak dicek'}</span>
                        <span className="rounded-full bg-isi px-2.5 py-0.5 text-[12.5px] font-bold text-muted">Pengaruh {PENGARUH[k]}</span>
                      </span>
                    </div>
                    <Saklar on={on} label={`Cek ${NAMA[k]}`} ubah={() => ubah({ aktif: { ...a.aktif, [k]: !on } })} />
                  </div>
                  <div className={on ? '' : 'pointer-events-none opacity-50'}>
                    <p className="mt-2 text-[14.5px] font-semibold leading-relaxed">{dk.teks || dk.pra}{k === 'spp' ? ` per tanggal ${a.sppTanggal}` : ''}{dk.teks ? '' : ':'}</p>
                    {BATAS_TARGET[k] && (
                      <Stepper nilai={a.target[k]} satuan={dk.satuan} label={NAMA[k]} kurang={() => ubahTarget(k, -1)} tambah={() => ubahTarget(k, 1)} />
                    )}
                    {k === 'spp' && (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-[14px] bg-isi px-3 py-2">
                        <span className="text-[14px] font-bold">Dinilai mulai tanggal</span>
                        <span className="flex items-center gap-2">
                          <button type="button" aria-label="Tanggal lebih awal" onClick={() => ubah({ sppTanggal: Math.max(1, a.sppTanggal - 1) })} className="tombol-putih grid h-10 w-10 place-items-center rounded-[12px] text-[18px] font-extrabold">−</button>
                          <b className="w-8 text-center text-[17px] font-extrabold">{a.sppTanggal}</b>
                          <button type="button" aria-label="Tanggal lebih akhir" onClick={() => ubah({ sppTanggal: Math.min(28, a.sppTanggal + 1) })} className="tombol-putih grid h-10 w-10 place-items-center rounded-[12px] text-[18px] font-extrabold">+</button>
                        </span>
                      </div>
                    )}
                    {x && x.status !== 'mati' && (
                      <p className="mt-2.5 rounded-[12px] bg-isi px-3 py-2 text-[13.5px] font-bold text-muted">
                        Sekarang: {k === 'tungg' ? `${rp(x.nilai || 0)} (${kes.tunggPersen}%)` : k === 'arus' ? (x.selisih == null ? '—' : x.selisih >= 0 ? `lebih ${rp(x.selisih)}` : `kurang ${rp(-x.selisih)}`) : x.nilai}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            <p className="mt-2 flex gap-2.5 rounded-[16px] bg-danger-soft px-3.5 py-3 text-[14px] font-bold leading-relaxed text-danger">
              <span><b className="block font-extrabold">Rem darurat — selalu aktif</b>Kalau kas bebas tinggal kurang dari 1 bulan biaya rutin, status langsung Perlu perhatian.</span>
            </p>
          </div>

          <div className="card lg:p-5">
            <h2 className="judul-kartu text-[19px]">Pengeluaran besar terjadwal</h2>
            <p className="mb-2 text-[13.5px] font-semibold text-muted">Ikut dihitung di "Perkiraan 3 bulan" — mis. insentif akhir semester, sewa gedung.</p>
            {a.terjadwal.length === 0 && <p className="py-2 text-[14px] font-semibold text-muted">Belum ada.</p>}
            {a.terjadwal.map((t, i) => (
              <div key={i} className="row items-center">
                <span className="permen permen-kuning grid h-12 w-12 shrink-0 place-items-center rounded-[15px] text-[12.5px] font-extrabold">{NAMA_BULAN[t.bulan - 1].slice(0, 3).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><b className="block break-words text-[15px] font-extrabold">{t.nama}</b><span className="text-[13px] font-semibold text-muted">Setiap {NAMA_BULAN[t.bulan - 1]}</span></span>
                <b className="shrink-0 text-[15px]">{rp(t.nominal)}</b>
                <button type="button" aria-label={`Hapus ${t.nama}`} onClick={() => ubah({ terjadwal: a.terjadwal.filter((_, j) => j !== i) })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
            <div className="mt-3 grid gap-2.5 rounded-[18px] border-2 border-dashed border-line p-3">
              <div>
                <label className={label} htmlFor="tj-nama">Nama pengeluaran</label>
                <input id="tj-nama" className="field-input" value={baru.nama} maxLength={60} placeholder="mis. Insentif guru akhir semester" onChange={(e) => setBaru({ ...baru, nama: e.target.value })} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2.5">
                <div>
                  <label className={label} htmlFor="tj-bulan">Bulan</label>
                  <select id="tj-bulan" className="field-input" value={baru.bulan} onChange={(e) => setBaru({ ...baru, bulan: Number(e.target.value) })}>
                    {NAMA_BULAN.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Nominal</label>
                  <InputNominal value={baru.nominal} onChange={(v) => setBaru({ ...baru, nominal: v })} placeholder="2.900.000" />
                </div>
              </div>
              <button type="button" onClick={tambahTerjadwal} className="tombol-putih flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] text-[15px] font-extrabold text-brand">
                + Tambah pengeluaran terjadwal
              </button>
            </div>
          </div>

          <div className="grid gap-2.5">
            <button type="button" onClick={simpanAturan} disabled={!bisa || simpan || !berubah} className="bigbtn disabled:opacity-50">
              {simpan ? 'Menyimpan…' : berubah ? 'Simpan pengaturan' : 'Tersimpan'}
            </button>
            <button type="button" onClick={() => { setIsiKas(''); setDraf(keDraf(ATURAN_BAWAAN)) }} className="min-h-[46px] rounded-[16px] text-[15px] font-extrabold text-brand">
              Kembalikan ke bawaan (Normal)
            </button>
          </div>

          {riwayat.length > 0 && (
            <div className="card lg:p-5">
              <h2 className="judul-kartu mb-1 text-[18px]">Riwayat perubahan</h2>
              <p className="mb-1 text-[13.5px] font-semibold text-muted">Siapa mengubah apa — {riwayat.length > 10 ? '10' : riwayat.length} perubahan terakhir.</p>
              {riwayat.slice(0, 10).map((r, i) => {
                const daftar = ringkasPerubahan(r.isi, riwayat[i + 1]?.isi ?? null)
                return (
                  <div key={i} className="border-b-[1.5px] border-dashed border-line py-3 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]">
                      <b className="font-extrabold">{r.diubahNama || 'Tanpa nama'}</b>
                      <span className="font-semibold text-muted">{waktuTampil(r.diubahPada)}</span>
                    </div>
                    {!riwayat[i + 1] && <span className="mt-1 inline-block rounded-full bg-isi px-2.5 py-0.5 text-[12px] font-extrabold text-muted">Simpanan pertama</span>}
                    <ul className="mt-1.5 grid gap-1">
                      {daftar.map((x, j) => (
                        <li key={j} className="flex items-start gap-2 text-[14px] font-semibold leading-snug">
                          <span className={`mt-px grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold ${TANDA[x.jenis][1]}`} aria-hidden="true">{TANDA[x.jenis][0]}</span>
                          <span className={`min-w-0 break-words ${x.jenis === 'hapus' ? 'text-muted line-through decoration-2' : x.jenis === 'info' ? 'text-muted' : ''}`}>
                            {x.jenis === 'hapus' && <span className="sr-only">Dihapus: </span>}{x.jenis === 'tambah' && <span className="sr-only">Ditambah: </span>}{x.teks}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
