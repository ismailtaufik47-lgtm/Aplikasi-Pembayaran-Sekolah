/**
 * Paket biaya PMB (pendaftaran murid baru) & Daftar ulang — 0033.
 *
 * Satu paket = rincian biaya (informasi untuk orang tua) + jadwal cicilan
 * opsional (tahap + jatuh tempo). Orang tua boleh membayar BERAPA SAJA;
 * uang yang masuk mengisi tahap paling awal yang belum lunas. Status &
 * kalimat keterangan di sini dipakai panel sekolah, portal orang tua,
 * ekspor, dan lonceng — supaya angkanya selalu sama di semua tempat.
 *
 * Bentuk paket di aplikasi:
 *   { id, jenis: 'pmb'|'du', tahunAjaran, nama, total,
 *     rincian: [{ nama, nominal }], tahap: [{ nama, jatuhTempo: 'YYYY-MM-DD', nominal }],
 *     siswaIds: [id siswa yang ditagih] }
 * Rupiah yang sudah dibayar per siswa: siswa.paket[paket.id].
 */
import { rp, tanggalDari } from './format.js'

export const LABEL_JENIS = { pmb: 'PMB', du: 'Daftar ulang' }
export const LABEL_PANJANG = { pmb: 'Pendaftaran murid baru', du: 'Daftar ulang siswa lama' }
/** Warna permen tiap jenis (sama di semua layar). */
export const WARNA_JENIS = { pmb: 'pink', du: 'ungu' }
/** Emoji → gambar kegiatan (lihat Gambar.jsx): formulir & tumpukan buku. */
export const EMOJI_JENIS = { pmb: '📝', du: '📚' }

const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-09-15" → "15 Sep" (atau "15 Sep 2026" kalau tahun=true). */
export function tglPendek(iso, tahun = false) {
  const d = tanggalDari(iso)
  if (!d) return ''
  return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}${tahun ? ' ' + d.getFullYear() : ''}`
}

const awalHari = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Tanggal jatuh tempo sudah LEWAT (hari ini > jatuh tempo)? */
export function sudahLewat(iso, hariIni = new Date()) {
  const d = tanggalDari(iso)
  return !!d && awalHari(hariIni) > d
}

export const dibayarPaket = (s, paketId) => (s?.paket && s.paket[paketId]) || 0
export const totalRincian = (rincian = []) => rincian.reduce((t, r) => t + (Number(r.nominal) || 0), 0)

/** Paket yang ditagihkan ke satu siswa. */
export const paketSiswa = (paket = [], siswaId) => paket.filter((p) => p.siswaIds.includes(siswaId))

/**
 * Pembagian uang yang sudah masuk ke tiap tahap (tahap paling awal diisi dulu).
 * Tiap tahap: { nama, jatuhTempo, nominal, terisi, kurang, lunas, lewat }.
 */
export function tahapPaket(p, dibayar, hariIni = new Date()) {
  let sisa = dibayar
  return (p.tahap || []).map((t) => {
    const terisi = Math.max(0, Math.min(sisa, t.nominal))
    sisa -= terisi
    return { ...t, terisi, kurang: t.nominal - terisi, lunas: terisi >= t.nominal, lewat: sudahLewat(t.jatuhTempo, hariIni) }
  })
}

/**
 * Status satu paket untuk satu siswa:
 *   'lunas'     : dibayar ≥ total
 *   'terlambat' : ada tahap yang jatuh temponya sudah lewat tapi belum terisi penuh
 *   'mencicil'  : sudah ada pembayaran, tidak ada yang terlambat
 *   'belum'     : belum ada pembayaran sama sekali, tidak ada yang terlambat
 */
export function statusPaket(p, dibayar, hariIni = new Date()) {
  if (dibayar >= p.total) return 'lunas'
  if (tahapPaket(p, dibayar, hariIni).some((t) => t.lewat && !t.lunas)) return 'terlambat'
  return dibayar > 0 ? 'mencicil' : 'belum'
}

export const BADGE_PAKET = {
  lunas: { teks: 'Lunas', warna: 'green' },
  terlambat: { teks: 'Terlambat', warna: 'red' },
  mencicil: { teks: 'Mencicil', warna: 'amber' },
  belum: { teks: 'Belum bayar', warna: 'amber' },
}

/**
 * Rupiah yang PERLU DIBAYAR SEKARANG: tahap yang sudah lewat jatuh tempo
 * dan belum terisi. Paket tanpa jadwal cicilan → seluruh sisanya.
 */
export function kurangSekarangPaket(p, dibayar, hariIni = new Date()) {
  if (dibayar >= p.total) return 0
  if (!p.tahap?.length) return p.total - dibayar
  return tahapPaket(p, dibayar, hariIni).filter((t) => t.lewat).reduce((n, t) => n + t.kurang, 0)
}

/** Tahap berikutnya yang belum lunas (null kalau lunas / tanpa jadwal). */
export const tahapBerikut = (p, dibayar, hariIni = new Date()) =>
  tahapPaket(p, dibayar, hariIni).find((t) => !t.lunas) || null

/**
 * Kalimat keterangan untuk guru & orang tua, contoh:
 *   "Tahap 2 kurang Rp 200.000 · lewat 15 Sep"
 *   "Tahap 3 jatuh tempo 15 Des"
 *   "Lunas" / "Belum ada pembayaran" / "Kurang Rp 1.200.000"
 */
export function keteranganPaket(p, dibayar, hariIni = new Date()) {
  if (dibayar >= p.total) return 'Sudah lunas'
  const tahap = tahapPaket(p, dibayar, hariIni)
  if (!tahap.length) return dibayar > 0 ? `Kurang ${rp(p.total - dibayar)}` : 'Belum ada pembayaran'
  const telat = tahap.filter((t) => t.lewat && !t.lunas)
  if (telat.length) {
    const a = telat[0]
    const z = telat[telat.length - 1]
    const nama = telat.length > 1 ? `${a.nama}–${z.nama.replace(/^Tahap\s*/i, '')}` : a.nama
    const kurang = telat.reduce((n, t) => n + t.kurang, 0)
    return a.terisi > 0 || telat.length > 1
      ? `${nama} kurang ${rp(kurang)} · lewat ${tglPendek(a.jatuhTempo)}`
      : `${nama} belum dibayar · lewat ${tglPendek(a.jatuhTempo)}`
  }
  const b = tahap.find((t) => !t.lunas)
  return b.terisi > 0
    ? `${b.nama} kurang ${rp(b.kurang)} · jatuh tempo ${tglPendek(b.jatuhTempo)}`
    : `${b.nama} jatuh tempo ${tglPendek(b.jatuhTempo)}`
}

/**
 * Pratinjau "uang ini masuk ke mana" saat mencatat cicilan:
 * [{ nama, isi, lunasSetelah, kurangSetelah }]. Kelebihan bayar dilaporkan
 * sebagai { nama: 'Kelebihan', isi } supaya petugas sadar.
 */
export function alokasiCicilan(p, dibayar, nominal) {
  const hasil = []
  let uang = Math.max(0, Number(nominal) || 0)
  if (!uang) return hasil
  const tahap = p.tahap?.length ? tahapPaket(p, dibayar) : [{ nama: 'Sisa tagihan', nominal: p.total, terisi: Math.min(dibayar, p.total) }]
  for (const t of tahap) {
    const kurang = t.nominal - t.terisi
    if (kurang <= 0 || uang <= 0) continue
    const isi = Math.min(kurang, uang)
    uang -= isi
    hasil.push({ nama: t.nama, isi, lunasSetelah: isi >= kurang, kurangSetelah: kurang - isi })
  }
  if (uang > 0) hasil.push({ nama: 'Kelebihan', isi: uang, lunasSetelah: true, kurangSetelah: 0 })
  return hasil
}

/** Tahun ajaran sesudah "2026/2027" → "2027/2028". */
export function tahunAjaranBerikut(ta) {
  const a = Number(String(ta).slice(0, 4)) || new Date().getFullYear()
  return `${a + 1}/${a + 2}`
}

/** Urutan tampil: tahun ajaran terbaru dulu, PMB sebelum daftar ulang. */
export const urutPaket = (a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran) || a.jenis.localeCompare(b.jenis) * -1

/**
 * Paket yang TERLAMBAT untuk satu siswa: [{ p, kurang }] — kurang = rupiah
 * tahap yang sudah lewat jatuh tempo. Dipakai lonceng & "perlu ditagih" Beranda.
 */
export function paketTerlambat(paket = [], s, hariIni = new Date()) {
  return paket
    .filter((p) => p.siswaIds.includes(s.id))
    .map((p) => ({ p, d: dibayarPaket(s, p.id) }))
    .filter(({ p, d }) => statusPaket(p, d, hariIni) === 'terlambat')
    .map(({ p, d }) => ({ p, kurang: kurangSekarangPaket(p, d, hariIni) }))
}
