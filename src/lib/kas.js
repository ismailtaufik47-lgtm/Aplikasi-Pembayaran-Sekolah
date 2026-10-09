/**
 * Perhitungan buku kas sekolah — semuanya dihitung di sini dari dua sumber:
 *   1. pembayaran orang tua (SPP & biaya kegiatan) — otomatis, tidak diinput ulang
 *   2. tabel kas — pengeluaran & pemasukan lain yang dicatat kepala/admin
 *
 * Transaksi yang dibatalkan tetap ditampilkan (dicoret) tapi TIDAK dihitung.
 * Gerakan sebelum tanggal "mulai" dianggap sudah termasuk saldo awal.
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

/** Kategori pengeluaran KEGIATAN (0035): dipakai saat pengeluaran diberi label kegiatan. */
export const KATEGORI_KEGIATAN = [
  { nama: 'Transportasi', e: '🚌', warna: 'biru' },
  { nama: 'Konsumsi', e: '🍱', warna: 'kuning' },
  { nama: 'Perlengkapan', e: '🎒', warna: 'tosca' },
  { nama: 'Sewa tempat/alat', e: '🏕️', warna: 'ungu' },
  { nama: 'Dokumentasi', e: '📸', warna: 'pink' },
  { nama: 'Honor panitia', e: '🧑‍🏫', warna: 'biru' },
  { nama: 'Lain-lain', e: '📦', warna: 'kuning' },
]
export const warnaKategoriKegiatan = (nama) => KATEGORI_KEGIATAN.find((k) => k.nama === nama)?.warna || 'kuning'

/** Emoji untuk sebuah kategori (kategori buatan sendiri → emoji umum). */
export function emojiKategori(nama, jenis) {
  if (nama === 'SPP') return '📅'
  if (nama === 'Biaya kegiatan') return '🎟️'
  const daftar = jenis === 'masuk' ? KATEGORI_MASUK : [...KATEGORI_KELUAR, ...KATEGORI_KEGIATAN]
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
 * { id, sumber: 'bayar'|'kas', jenis, tanggal (YYYY-MM-DD), kategori, nominal, keterangan, batal, sebelumMulai, asli }
 *
 * Sejak 0030 perhitungan uang yang sebenarnya dilakukan DATABASE
 * (kas_ringkasan, kas_laporan_bulan, …). Fungsi-fungsi di file ini dipakai
 * untuk mode demo dan sebagai cermin logikanya — aturannya harus sama:
 *   • gerakan sebelum tanggal mulai saldo awal TIDAK dihitung
 *     (pembayaran & kas sama-sama), transaksi dibatalkan tidak dihitung
 *   • saldo dihitung per akhir hari
 */
export function gerakanKas({ pembayaran = [], kas = [], mulai = null }) {
  const dariBayar = pembayaran
    .map((p) => ({
      id: 'p-' + p.id,
      sumber: 'bayar',
      jenis: 'masuk',
      tanggal: tanggalISO(new Date(p.tanggal)),
      kategori: p.jenis === 'spp' ? 'SPP' : p.jenis === 'paket' ? (String(p.ket).startsWith('Daftar ulang') ? 'Daftar ulang' : 'PMB') : 'Biaya kegiatan',
      nominal: p.nominal,
      keterangan: p.ket,
      batal: false,
      urut: p.tanggal,
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
    sebelumMulai: !!mulai && k.tanggal < mulai,
    urut: k.dibuatPada || '',
    asli: k,
  }))
  return [...dariBayar, ...dariKas].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
}

/** Gerakan yang dihitung dalam saldo: tidak dibatalkan & tidak sebelum tanggal mulai. */
const sah = (gerakan) => gerakan.filter((g) => !g.batal && !g.sebelumMulai)
const jumlah = (xs) => xs.reduce((t, g) => t + g.nominal, 0)
const neto = (xs) => xs.reduce((t, g) => t + (g.jenis === 'masuk' ? g.nominal : -g.nominal), 0)

function perKategori(xs) {
  const peta = new Map()
  xs.forEach((g) => peta.set(g.kategori, (peta.get(g.kategori) || 0) + g.nominal))
  return [...peta.entries()].map(([kategori, nominal]) => ({ kategori, nominal })).sort((a, b) => b.nominal - a.nominal)
}

/** Saldo pada akhir tanggal `tgl` (YYYY-MM-DD). */
export function saldoPer(gerakan, saldoAwalKas, tgl) {
  return saldoAwalKas + neto(sah(gerakan).filter((g) => g.tanggal <= tgl))
}

/** Saldo akhir hari TERENDAH mulai tanggal `dari` → { saldo, tanggal }. */
export function saldoTerendah(gerakan, saldoAwalKas, dari) {
  let hasil = { saldo: saldoPer(gerakan, saldoAwalKas, dari), tanggal: dari }
  const hari = [...new Set(sah(gerakan).map((g) => g.tanggal).filter((t) => t > dari))].sort()
  hari.forEach((t) => {
    const s = saldoPer(gerakan, saldoAwalKas, t)
    if (s < hasil.saldo) hasil = { saldo: s, tanggal: t }
  })
  return hasil
}

/**
 * Laporan satu bulan (kunci "YYYY-MM") — bentuknya sama dengan
 * kas_laporan_bulan() di database.
 */
export function laporanBulan({ gerakan, saldoAwalKas = 0, bulan }) {
  const semua = sah(gerakan)
  const saldoAwal = saldoAwalKas + neto(semua.filter((g) => kunciBulan(g.tanggal) < bulan))
  const diBulan = semua.filter((g) => kunciBulan(g.tanggal) === bulan)
  const masuk = diBulan.filter((g) => g.jenis === 'masuk')
  const keluar = diBulan.filter((g) => g.jenis === 'keluar')
  const totalMasuk = jumlah(masuk)
  const totalKeluar = jumlah(keluar)
  const lap = {
    bulan,
    saldoAwal,
    totalMasuk,
    totalKeluar,
    saldoAkhir: saldoAwal + totalMasuk - totalKeluar,
    jumlahKeluar: keluar.length,
    masukPerKategori: perKategori(masuk),
    keluarPerKategori: perKategori(keluar),
    transaksi: diBulan,
  }
  lap.baris = barisBukuKas(lap)
  delete lap.transaksi
  return lap
}

/**
 * Baris buku kas untuk laporan: pembayaran orang tua digabung per hari
 * ("Penerimaan SPP & kegiatan — 5 transaksi"), transaksi kas satu per satu,
 * lengkap dengan saldo berjalan.
 */
export function barisBukuKas(lap) {
  if (lap.baris) return lap.baris
  const perHari = new Map()
  const baris = []
  lap.transaksi.forEach((g) => {
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
  perHari.forEach((k) => baris.push({ tanggal: k.tanggal, uraian: `Penerimaan SPP & biaya kegiatan (${k.n} transaksi)`, masuk: k.masuk, keluar: 0 }))
  baris.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.keluar - b.keluar))
  let saldo = lap.saldoAwal
  return baris.map((b) => {
    saldo += b.masuk - b.keluar
    return { ...b, saldo }
  })
}

/** Pemasukan & pengeluaran per bulan: `n` bulan yang berakhir di `sampai`. */
export function arusKas(gerakan, sampai, n = 6) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const k = geserBulan(sampai, -i)
    const xs = sah(gerakan).filter((g) => kunciBulan(g.tanggal) === k)
    out.push({ bulan: k, masuk: jumlah(xs.filter((g) => g.jenis === 'masuk')), keluar: jumlah(xs.filter((g) => g.jenis === 'keluar')) })
  }
  return out
}

/**
 * Riwayat transaksi satu rentang tanggal, terbaru dulu — bentuknya sama
 * dengan kas_riwayat() di database. Pembayaran orang tua digabung per hari.
 */
export function riwayatKas(gerakan, { dari, sampai, mulaiDari = 0, batas = 30, saring = 'semua' }) {
  const berlabel = (g) => g.sumber === 'kas' && !!(g.asli?.biayaId || g.asli?.paketId)
  const diRentang = gerakan.filter((g) => g.tanggal >= dari && g.tanggal <= sampai)
    .filter((g) => saring === 'semua' || (saring === 'kegiatan') === berlabel(g))
  const bayar = new Map()
  const item = []
  diRentang.forEach((g) => {
    if (g.sumber === 'bayar') {
      const b = bayar.get(g.tanggal) || { sumber: 'bayar', id: null, tanggal: g.tanggal, jenis: 'masuk', kategori: 'Pembayaran orang tua', nominal: 0, jumlah: 0, dibuatPada: '' }
      b.nominal += g.nominal
      b.jumlah += 1
      if (String(g.urut) > b.dibuatPada) b.dibuatPada = String(g.urut)
      bayar.set(g.tanggal, b)
    } else {
      const k = g.asli
      item.push({
        sumber: 'kas', id: k.id, tanggal: k.tanggal, jenis: k.jenis, kategori: k.kategori, nominal: k.nominal,
        keterangan: k.keterangan || '', dicatatNama: k.dicatatNama, dibuatPada: k.dibuatPada || '',
        dibatalkanPada: k.dibatalkanPada || null, dibatalkanNama: k.dibatalkanNama || null, alasanBatal: k.alasanBatal || null,
        adaNota: !!k.adaNota, sebelumMulai: !!g.sebelumMulai, jumlah: 1,
        biayaId: k.biayaId || null, paketId: k.paketId || null, grup: k.grup || null, jmlNota: k.jmlNota || 0,
      })
    }
  })
  const semua = [...item, ...bayar.values()].sort((a, b) =>
    a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1)
      : a.sumber !== b.sumber ? (a.sumber === 'kas' ? -1 : 1)
        : String(b.dibuatPada).localeCompare(String(a.dibuatPada)))
  const dihitung = sah(diRentang)
  return {
    item: semua.slice(mulaiDari, mulaiDari + batas),
    lanjut: semua.length > mulaiDari + batas,
    total: {
      masuk: jumlah(dihitung.filter((g) => g.jenis === 'masuk')),
      keluar: jumlah(dihitung.filter((g) => g.jenis === 'keluar')),
      jumlah: dihitung.length,
    },
  }
}

/**
 * Daftar transaksi kas SAH satu jenis (menu Transaksi › Pengeluaran / Pemasukan lain) —
 * bentuknya sama dengan kas_daftar() di database (0040).
 *   rows: baris kas bentuk aplikasi (lihat bentukKas di api.js), mulai: tanggal mulai saldo awal
 */
export function daftarKas(rows, { jenis, dari, sampai, mulaiDari = 0, batas = 30, saring = 'semua', nota = 'semua', cari = '' }, mulai, namaKegiatan = () => null) {
  const q = String(cari || '').trim().toLowerCase()
  const dasar = rows
    .filter((k) => k.jenis === jenis && !k.dibatalkanPada && k.tanggal >= dari && k.tanggal <= sampai)
    .filter((k) => saring === 'semua' || (saring === 'kegiatan') === !!(k.biayaId || k.paketId))
    .map((k) => ({ ...k, kegiatan: namaKegiatan(k) }))
    .filter((k) => !q || [k.keterangan, k.kategori, k.kegiatan].some((t) => String(t || '').toLowerCase().includes(q)))
  const tampil = dasar
    .filter((k) => nota === 'semua' || (nota === 'ada') === !!k.adaNota)
    .sort((a, b) => (a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1) : String(b.dibuatPada).localeCompare(String(a.dibuatPada))))
  return {
    item: tampil.slice(mulaiDari, mulaiDari + batas).map((k) => ({
      sumber: 'kas', id: k.id, tanggal: k.tanggal, jenis: k.jenis, kategori: k.kategori, nominal: k.nominal,
      keterangan: k.keterangan || '', dicatatNama: k.dicatatNama, dibuatPada: k.dibuatPada || '', dibatalkanPada: null,
      adaNota: !!k.adaNota, sebelumMulai: !!(mulai && k.tanggal < mulai), jumlah: 1,
      biayaId: k.biayaId || null, paketId: k.paketId || null, grup: k.grup || null, kegiatan: k.kegiatan, jmlNota: k.jmlNota || 0,
    })),
    lanjut: tampil.length > mulaiDari + batas,
    jumlahTampil: tampil.length,
    ringkas: { jumlah: dasar.length, total: jumlah(dasar), adaNota: dasar.filter((k) => k.adaNota).length },
  }
}

/** Daftar bulan yang bisa dipilih: dari `bulanPertama` ("YYYY-MM") sampai bulan ini. */
export function daftarBulan(bulanPertama) {
  const kini = kunciBulan(tanggalISO())
  const awal = bulanPertama && bulanPertama < kini ? bulanPertama : kini
  const hasil = []
  for (let k = awal; k <= kini; k = geserBulan(k, 1)) hasil.push(k)
  return hasil
}

/** "12 Sep" / "12 September 2026" untuk "YYYY-MM-DD". */
export function tglKas(iso, panjang = false) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return panjang ? `${d} ${NAMA_BULAN[m - 1]} ${y}` : `${d} ${NAMA_BULAN[m - 1].slice(0, 3)}`
}

/** Tanggal n hari sebelum hari ini (YYYY-MM-DD). */
export function hariLalu(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return tanggalISO(d)
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

/* ===================== rekap per kegiatan (0035) ===================== */

/**
 * Rekap "uang masuk vs terpakai" untuk setiap kegiatan (biaya kegiatan aktif
 * + paket PMB / daftar ulang). Dipakai Laporan › Kegiatan, Excel, dan kotak
 * "Dana kegiatan" di form pengeluaran — supaya angkanya selalu sama.
 *
 * pengeluaran: hasil kas_pengeluaran_kegiatan() — baris kas SAH berlabel.
 * Hasil per kegiatan:
 *   { kunci: 'b:<id>' | 'p:<id>', id, jenis: 'kegiatan'|'pmb'|'du', nama, emoji, biaya|paket,
 *     nominal, siswa, target, masuk, lunas, sebagian, belum, belumBayar: [{ nama, kelas, kurang }],
 *     terpakai, sisa, perKategori: [{ kategori, nominal }], rincian: [baris kas], nota: [path unik] }
 */
export function rekapKegiatan({ biaya = [], paket = [], siswa = [], pengeluaran = [], emojiKegiatan, emojiPaket = {} }) {
  const keluar = new Map()
  pengeluaran.forEach((k) => {
    const kunci = k.biayaId ? 'b:' + k.biayaId : k.paketId ? 'p:' + k.paketId : null
    if (!kunci) return
    if (!keluar.has(kunci)) keluar.set(kunci, [])
    keluar.get(kunci).push(k)
  })
  const isi = (dasar, daftarSiswa, dibayar) => {
    let masuk = 0, lunas = 0, sebagian = 0, belum = 0
    const belumBayar = []
    daftarSiswa.forEach((s) => {
      const d = dibayar(s)
      masuk += d
      if (d >= dasar.nominal) lunas++
      else {
        if (d > 0) sebagian++
        else belum++
        belumBayar.push({ nama: s.nama, kelas: s.kelas, dibayar: d, kurang: dasar.nominal - d })
      }
    })
    const rincian = (keluar.get(dasar.kunci) || []).slice().sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)))
    const terpakai = rincian.reduce((t, k) => t + Number(k.nominal), 0)
    const per = new Map()
    rincian.forEach((k) => per.set(k.kategori, (per.get(k.kategori) || 0) + Number(k.nominal)))
    const nota = [...new Set(rincian.flatMap((k) => k.notaFile || []))]
    return {
      ...dasar, siswa: daftarSiswa.length, target: dasar.nominal * daftarSiswa.length, masuk, lunas, sebagian, belum,
      belumBayar: belumBayar.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama)),
      terpakai, sisa: masuk - terpakai,
      perKategori: [...per.entries()].map(([kategori, nominal]) => ({ kategori, nominal })).sort((a, b) => b.nominal - a.nominal),
      rincian, nota, notaLama: rincian.filter((k) => k.notaLama).length,
    }
  }
  const dariBiaya = biaya.map((b, i) => isi(
    { kunci: 'b:' + b.id, id: b.id, jenis: 'kegiatan', nama: b.nama, emoji: emojiKegiatan ? emojiKegiatan(b) : null, biaya: b,
      nominal: Number(b.nominal) || 0, tanggal: b.tanggal || null, urut: i },
    // hanya siswa yang ditagih kegiatan ini (0042: masuk / keluar di tengah tahun tidak ikut)
    siswa.filter((s) => !s.kegiatanWajib || s.kegiatanWajib[i] !== false || (Number(s.kegiatan?.[i]) || 0) > 0), (s) => Number(s.kegiatan?.[i]) || 0,
  ))
  const dariPaket = paket.map((p, i) => isi(
    { kunci: 'p:' + p.id, id: p.id, jenis: p.jenis, nama: p.nama, emoji: emojiPaket[p.jenis] || null, paket: p,
      nominal: Number(p.total) || 0, tanggal: null, urut: 1000 + i },
    siswa.filter((s) => p.siswaIds.includes(s.id)), (s) => Number(s.paket?.[p.id]) || 0,
  ))
  return [...dariBiaya, ...dariPaket]
}

/** Nama file foto nota di ZIP: "2026-10-06 Nasi kotak 35 pcs + Air mineral Rp 965.000.jpg". */
export function namaFileNota(rincian, path, urutan = 0) {
  const pakai = rincian.filter((k) => (k.notaFile || []).includes(path))
  const tgl = pakai[0]?.tanggal || ''
  const uraian = pakai.map((k) => k.uraian || k.kategori).join(' + ')
  const total = pakai.reduce((t, k) => t + Number(k.nominal), 0)
  const ext = (String(path).match(/\.(jpg|png|webp|svg)$/) || [, 'jpg'])[1]
  const dasar = `${tgl} ${uraian}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
  return `${dasar} Rp ${total.toLocaleString('id-ID')}${urutan ? ` (${urutan + 1})` : ''}.${ext}`
}
