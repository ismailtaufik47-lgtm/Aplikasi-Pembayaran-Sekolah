/**
 * Perhitungan buku kas sekolah — semuanya dihitung di sini dari dua sumber:
 *   1. pembayaran orang tua (SPP & biaya kegiatan) — otomatis, tidak diinput ulang
 *   2. tabel kas — pengeluaran & pemasukan lain yang dicatat kepala/admin
 *
 * Transaksi yang dibatalkan tetap ditampilkan (dicoret) tapi TIDAK dihitung.
 * Pembayaran sebelum tanggal "mulai" dianggap sudah termasuk saldo awal.
 */
import { tanggalISO } from './format.js'

export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export const KATEGORI_KELUAR = [
  { nama: 'Honor guru', e: '👩‍🏫' },
  { nama: 'ATK', e: '✏️' },
  { nama: 'Listrik & air', e: '💡' },
  { nama: 'Konsumsi', e: '🍱' },
  { nama: 'Kegiatan', e: '🎈' },
  { nama: 'Perawatan gedung', e: '🛠️' },
  { nama: 'Transport', e: '🚌' },
  { nama: 'Lain-lain', e: '📦' },
]
export const KATEGORI_MASUK = [
  { nama: 'Donasi', e: '🤲' },
  { nama: 'Dana BOP', e: '🏛️' },
  { nama: 'Sumbangan yayasan', e: '🏫' },
  { nama: 'Lain-lain', e: '💰' },
]

/** Emoji untuk sebuah kategori (kategori buatan sendiri → emoji umum). */
export function emojiKategori(nama, jenis) {
  if (nama === 'SPP') return '📅'
  if (nama === 'Biaya kegiatan') return '🎟️'
  const daftar = jenis === 'masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR
  return daftar.find((k) => k.nama.toLowerCase() === String(nama).toLowerCase())?.e || (jenis === 'masuk' ? '💰' : '🧾')
}

/** "2026-09" untuk sebuah tanggal ISO / "YYYY-MM-DD". */
export const kunciBulan = (tgl) => String(tgl).slice(0, 7)
export const labelBulan = (kunci) => {
  const [y, m] = kunci.split('-').map(Number)
  return `${NAMA_BULAN[m - 1]} ${y}`
}
export const geserBulan = (kunci, n) => {
  const [y, m] = kunci.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Semua gerakan kas dalam satu bentuk:
 * { id, sumber: 'bayar'|'kas', jenis, tanggal (YYYY-MM-DD), kategori, nominal, keterangan, batal, asli }
 */
export function gerakanKas({ pembayaran = [], kas = [], mulai = null }) {
  const dariBayar = pembayaran
    .map((p) => ({
      id: 'p-' + p.id,
      sumber: 'bayar',
      jenis: 'masuk',
      tanggal: tanggalISO(new Date(p.tanggal)),
      kategori: p.jenis === 'spp' ? 'SPP' : 'Biaya kegiatan',
      nominal: p.nominal,
      keterangan: p.ket,
      batal: false,
      asli: p,
    }))
    .filter((g) => !mulai || g.tanggal >= mulai)
  const dariKas = kas.map((k) => ({
    id: k.id,
    sumber: 'kas',
    jenis: k.jenis,
    tanggal: k.tanggal,
    kategori: k.kategori,
    nominal: k.nominal,
    keterangan: k.keterangan || '',
    batal: !!k.dibatalkanPada,
    asli: k,
  }))
  return [...dariBayar, ...dariKas].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
}

const jumlah = (xs) => xs.reduce((t, g) => t + g.nominal, 0)

function perKategori(xs) {
  const peta = new Map()
  xs.forEach((g) => peta.set(g.kategori, (peta.get(g.kategori) || 0) + g.nominal))
  return [...peta.entries()].map(([kategori, nominal]) => ({ kategori, nominal })).sort((a, b) => b.nominal - a.nominal)
}

/**
 * Laporan satu bulan (kunci "YYYY-MM").
 * saldoAwal = saldo awal kas + semua gerakan sah SEBELUM bulan ini.
 */
export function laporanBulan({ gerakan, saldoAwalKas = 0, bulan }) {
  const sah = gerakan.filter((g) => !g.batal)
  const sebelum = sah.filter((g) => kunciBulan(g.tanggal) < bulan)
  const saldoAwal = saldoAwalKas + jumlah(sebelum.filter((g) => g.jenis === 'masuk')) - jumlah(sebelum.filter((g) => g.jenis === 'keluar'))
  const diBulan = gerakan.filter((g) => kunciBulan(g.tanggal) === bulan)
  const sahBulan = diBulan.filter((g) => !g.batal)
  const masuk = sahBulan.filter((g) => g.jenis === 'masuk')
  const keluar = sahBulan.filter((g) => g.jenis === 'keluar')
  const totalMasuk = jumlah(masuk)
  const totalKeluar = jumlah(keluar)
  return {
    bulan,
    saldoAwal,
    totalMasuk,
    totalKeluar,
    saldoAkhir: saldoAwal + totalMasuk - totalKeluar,
    masukPerKategori: perKategori(masuk),
    keluarPerKategori: perKategori(keluar),
    transaksi: diBulan,
  }
}

/**
 * Baris buku kas untuk laporan cetak: pembayaran orang tua digabung per
 * hari ("Penerimaan SPP & kegiatan — 5 transaksi"), transaksi kas tampil
 * satu per satu, lengkap dengan saldo berjalan. Yang dibatalkan tidak ikut.
 */
export function barisBukuKas(lap) {
  const sah = lap.transaksi.filter((g) => !g.batal)
  const perHari = new Map()
  const baris = []
  sah.forEach((g) => {
    if (g.sumber === 'bayar') {
      const k = perHari.get(g.tanggal) || { tanggal: g.tanggal, uraian: '', masuk: 0, keluar: 0, n: 0 }
      k.masuk += g.nominal
      k.n += 1
      perHari.set(g.tanggal, k)
    } else {
      baris.push({
        tanggal: g.tanggal,
        uraian: g.kategori + (g.keterangan ? ` — ${g.keterangan}` : ''),
        masuk: g.jenis === 'masuk' ? g.nominal : 0,
        keluar: g.jenis === 'keluar' ? g.nominal : 0,
      })
    }
  })
  perHari.forEach((k) => baris.push({ ...k, uraian: `Penerimaan SPP & biaya kegiatan (${k.n} transaksi)` }))
  baris.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.keluar - b.keluar))
  let saldo = lap.saldoAwal
  return baris.map((b) => {
    saldo += b.masuk - b.keluar
    return { ...b, saldo }
  })
}

/** Daftar bulan yang bisa dipilih: dari bulan mulai (atau transaksi pertama) sampai bulan ini. */
export function daftarBulan(gerakan, mulai) {
  const kini = kunciBulan(tanggalISO())
  const awal = mulai ? kunciBulan(mulai) : gerakan.length ? kunciBulan(gerakan[0].tanggal) : kini
  const hasil = []
  for (let k = awal < kini ? awal : kini; k <= kini; k = geserBulan(k, 1)) hasil.push(k)
  return hasil
}

/** Perkecil foto nota ke JPG maks 1200px supaya ringan (< ~400 KB). */
export async function siapkanNota(file) {
  if (!/^image\//.test(file.type)) throw new Error('File nota harus berupa gambar (foto/scan).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, gagal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => gagal(new Error('Gambar tidak bisa dibaca.'))
      i.src = url
    })
    const skala = Math.min(1, 1200 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * skala))
    c.height = Math.max(1, Math.round(img.height * skala))
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    let hasil = c.toDataURL('image/jpeg', 0.72)
    if (hasil.length > 650000) hasil = c.toDataURL('image/jpeg', 0.5)
    if (hasil.length > 690000) throw new Error('Foto nota terlalu besar. Coba foto ulang dengan jarak lebih dekat.')
    return hasil
  } finally {
    URL.revokeObjectURL(url)
  }
}