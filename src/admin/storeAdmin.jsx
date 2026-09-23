/**
 * Data & aksi panel admin: daftar sekolah + riwayat perpanjangan, dimuat
 * sekali lalu disegarkan otomatis setiap selesai aksi (perpanjang,
 * batalkan, nonaktifkan, ubah tarif). Toast memakai store utama aplikasi.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useData } from '../lib/store.jsx'
import { tarifPerSiswa } from '../lib/langganan.js'
import * as api from './apiAdmin.js'

const Ctx = createContext(null)
export const useAdmin = () => useContext(Ctx)

/* ===================== utilitas tanggal & status ===================== */

const duaDigit = (n) => String(n).padStart(2, '0')
const keYmd = (d) => `${d.getFullYear()}-${duaDigit(d.getMonth() + 1)}-${duaDigit(d.getDate())}`
export const hariIni = () => keYmd(new Date())

/** 'YYYY-MM-DD' dibaca sebagai tanggal lokal (bukan UTC) supaya tidak mundur sehari. */
const keDate = (v) => (typeof v === 'string' && v.length === 10 ? new Date(v + 'T00:00:00') : new Date(v))

export const tglPendek = (v) =>
  v ? keDate(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const tambahHari = (ymd, n) => {
  const d = keDate(ymd)
  d.setDate(d.getDate() + n)
  return keYmd(d)
}

/** Sama dengan `date + interval 'N months'` di Postgres: 31 Jan + 1 bulan = 28/29 Feb. */
const tambahBulan = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const awal = new Date(y, m - 1 + n, 1)
  const akhirBulan = new Date(awal.getFullYear(), awal.getMonth() + 1, 0).getDate()
  return keYmd(new Date(awal.getFullYear(), awal.getMonth(), Math.min(d, akhirBulan)))
}

/**
 * Perkiraan hasil "Perpanjang N bulan" — logikanya SAMA dengan
 * admin_perpanjang() di database, hanya untuk ditampilkan di konfirmasi:
 *  • masih aktif/trial → disambung dari hari terakhir masa aktif
 *  • sudah lewat       → mulai hari ini, berlaku N bulan penuh
 */
export function perkiraanPerpanjang(s, bulan = 1) {
  const akhir = s.jatuhTempo
  const nominal = s.jumlahSiswaAktif * s.tarif * bulan
  if (akhir && s.sisaHari >= 0) {
    return { mulai: tambahHari(akhir, 1), sampai: tambahBulan(akhir, bulan), nominal }
  }
  const kini = hariIni()
  return { mulai: kini, sampai: tambahBulan(kini, bulan), nominal }
}

/** Bentuk baris daftar_langganan() menjadi data siap tampil. */
function olahSekolah(row) {
  const st = row.status || {}
  const tarif = tarifPerSiswa({ hargaPerSiswa: row.hargaPerSiswa })
  const kode = st.status // 'trial' | 'aktif' | 'kadaluarsa'
  const sisaHari = Number(st.sisaHari ?? 0)
  const kategori =
    kode === 'kadaluarsa' ? 'nonaktif' : sisaHari <= 7 ? 'segera' : kode // trial | aktif | segera | nonaktif
  return {
    ...row,
    tarif,
    tarifKhusus: row.hargaPerSiswa > 0,
    tagihanBulanan: (row.jumlahSiswaAktif || 0) * tarif,
    kode,
    kategori,
    alasan: kode !== 'kadaluarsa' ? null : row.dinonaktifkanAdmin ? 'admin' : row.langgananSampai ? 'sewa' : 'trial',
    jatuhTempo: st.aktifSampai || null,
    sisaHari,
  }
}

/** Label + warna chip status (warna selalu disertai teks, bukan warna saja). */
export function labelStatus(s) {
  if (s.kode === 'kadaluarsa') {
    if (s.alasan === 'admin') return { teks: 'Dinonaktifkan', warna: 'grey' }
    return { teks: s.alasan === 'sewa' ? 'Sewa habis' : 'Trial habis', warna: 'red' }
  }
  if (s.kode === 'trial') return { teks: 'Uji coba', warna: 'blue' }
  if (s.sisaHari <= 7) return { teks: 'Segera jatuh tempo', warna: 'amber' }
  return { teks: 'Aktif', warna: 'green' }
}

/** Keterangan sisa hari di bawah tanggal jatuh tempo. */
export function teksSisa(s) {
  if (s.alasan === 'admin') return 'dinonaktifkan admin'
  if (s.sisaHari < 0) return `lewat ${Math.abs(s.sisaHari)} hari`
  if (s.sisaHari === 0) return 'hari ini'
  return `${s.sisaHari} hari lagi`
}

/* ===================== provider ===================== */

export function AdminProvider({ children }) {
  const { toast } = useData()
  const [sekolah, setSekolah] = useState([])
  const [riwayat, setRiwayat] = useState([])
  const [siap, setSiap] = useState(false)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.daftarSekolah(), api.riwayat(24)])
      setSekolah(a.map(olahSekolah))
      setRiwayat(b)
      setGalat('')
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSiap(true)
    }
  }, [])

  useEffect(() => {
    muat()
  }, [muat])

  /** Jalankan aksi, segarkan data, tampilkan toast. Melempar ulang galat. */
  const jalankan = async (fn, pesanSukses) => {
    setSibuk(true)
    try {
      const hasil = await fn()
      await muat()
      toast(typeof pesanSukses === 'function' ? pesanSukses(hasil) : pesanSukses)
      return hasil
    } catch (e) {
      toast('Gagal: ' + e.message)
      throw e
    } finally {
      setSibuk(false)
    }
  }

  const nilai = {
    sekolah,
    riwayat,
    siap,
    galat,
    sibuk,
    muat,
    perpanjang: (s, bulan = 1) =>
      jalankan(
        () => api.perpanjang(s.id, bulan),
        (h) => `${s.nama} aktif sampai ${tglPendek(h?.langgananSampai)}`
      ),
    batalkan: (r) =>
      jalankan(() => api.batalkan(r.id), `Perpanjangan ${r.namaSekolah} dibatalkan`),
    setNonaktif: (s, nonaktif) =>
      jalankan(
        () => api.setNonaktif(s.id, nonaktif),
        nonaktif ? `${s.nama} dinonaktifkan` : `${s.nama} diaktifkan kembali`
      ),
    ubahTarif: (s, harga) =>
      jalankan(() => api.ubahTarif(s.id, harga), `Tarif ${s.nama} disimpan`),
  }

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>
}