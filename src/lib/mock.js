/**
 * Data contoh untuk mode demo (dipakai kalau kredensial Supabase kosong).
 * Bentuk baris di sini sengaja dibuat sama dengan baris tabel Supabase,
 * jadi hasil akhirnya melewati pembentuk yang sama di lib/api.js.
 */
const idSekolah = 'demo-sekolah'

export const sekolah = {
  id: idSekolah,
  nama: 'TK Tunas Ceria',
  kepala_sekolah: 'Ibu Hj. Siti Aminah, S.Pd',
  alamat: 'Jl. Melati No. 12, Bandung',
  wa: '081234567890',
  spp_nominal: 150000,
  tanggal_jatuh_tempo: 10,
  rekening: [
    { bank: 'BSI', nomor: '7123 4567 89', atasNama: 'Yayasan Tunas Ceria' },
    { bank: 'BJB', nomor: '0045 8891 2', atasNama: 'Yayasan Tunas Ceria' },
  ],
}

// Tanggal kegiatan demo dihitung dari hari ini, supaya selalu ada
// kegiatan yang "sebentar lagi" dan yang "sudah lewat".
const tglDepan = (n) => {
  const d = new Date(Date.now() + n * 864e5)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const biaya = [
  { id: 'b2', sekolah_id: idSekolah, nama: 'Dana usaha', nominal: 100000, urutan: 2 },
  {
    id: 'b3', sekolah_id: idSekolah, nama: 'Manasik haji', nominal: 150000, urutan: 3,
    tanggal: tglDepan(5), waktu: '07.30 – 11.00 WIB', lokasi: 'Lapangan Pusdai Jawa Barat, Bandung',
    deskripsi: 'Kegiatan manasik haji cilik untuk mengenalkan rukun Islam kelima kepada ananda. Anak-anak akan praktik thawaf mengelilingi miniatur Ka\'bah, sa\'i, dan melempar jumrah bersama guru kelas.\n\nOrang tua dipersilakan mengantar dan menunggu di area yang disediakan panitia.',
    perlengkapan: 'Pakaian ihram putih (laki-laki) / gamis & kerudung putih (perempuan)\nSandal\nBotol minum\nBekal snack',
  },
  {
    id: 'b4', sekolah_id: idSekolah, nama: 'Outing class', nominal: 200000, urutan: 4,
    tanggal: tglDepan(-20), waktu: '07.00 – 13.00 WIB', lokasi: 'Kampung Gajah, Lembang',
    deskripsi: 'Belajar di luar kelas mengenal hewan dan tanaman. Biaya sudah termasuk bus, tiket masuk, dan makan siang.',
  },
  { id: 'b5', sekolah_id: idSekolah, nama: 'Pas foto', nominal: 20000, urutan: 5 },
  {
    id: 'b6', sekolah_id: idSekolah, nama: 'Pentas seni', nominal: 185000, urutan: 6,
    tanggal: tglDepan(70), waktu: '08.00 WIB – selesai', lokasi: 'Gedung Serbaguna Tunas Ceria',
    deskripsi: 'Pentas seni akhir semester: tari daerah, drama, dan paduan suara. Biaya untuk kostum, tata panggung, dan dokumentasi.',
  },
  {
    id: 'b7', sekolah_id: idSekolah, nama: 'Aksera / porseni', nominal: 75000, urutan: 7,
    tanggal: tglDepan(24), tanggal_selesai: tglDepan(25), waktu: '07.30 – 12.00 WIB', lokasi: 'GOR Pajajaran, Bandung',
    deskripsi: 'Pekan olahraga dan seni antar-TK se-Kota Bandung. Ananda akan ikut lomba estafet bola, mewarnai, dan hafalan surat pendek.',
    perlengkapan: 'Kaos olahraga sekolah\nTopi\nBotol minum',
  },
  { id: 'b8', sekolah_id: idSekolah, nama: 'Peduli ramadhan', nominal: 50000, urutan: 8 },
]

export const siswa = [
  { id: 's1', avatar: 0, nama: 'Aisyah Nur Fadilah', panggilan: 'Aisyah', jenis_kelamin: 'P', kelas: 'A', nis: '2026-001', wali: 'Ibu Wulan', hp: '0812-1122-3344', guru: 'Bu Rina', foto: '' },
  { id: 's2', avatar: 2, nama: 'Muhammad Zidan', panggilan: 'Zidan', jenis_kelamin: 'L', kelas: 'A', nis: '2026-002', wali: 'Bapak Hendra', hp: '0813-5566-7788', guru: 'Bu Rina', foto: '' },
  { id: 's3', avatar: 4, nama: 'Qaisha Putri Maheswari', panggilan: 'Qaisha', jenis_kelamin: 'P', kelas: 'A', nis: '2026-004', wali: 'Bapak Aditya', hp: '0838-7788-2211', guru: 'Bu Rina', foto: '' },
  { id: 's4', avatar: 1, nama: 'Arkan Zaidan Fadilah', panggilan: 'Arkan', jenis_kelamin: 'L', kelas: 'B', nis: '2026-009', wali: 'Ibu Wulan', hp: '0812-1122-3344', guru: 'Bu Yanti', foto: '' },
  { id: 's5', avatar: 3, nama: 'Raffasya Putra', panggilan: 'Raffa', jenis_kelamin: 'L', kelas: 'B', nis: '2026-011', wali: 'Ibu Sari', hp: '0821-4433-1122', guru: 'Bu Yanti', foto: '' },
  { id: 's6', avatar: 5, nama: 'Khansa Aulia', panggilan: 'Khansa', jenis_kelamin: 'P', kelas: 'B', nis: '2026-015', wali: 'Ibu Dewi', hp: '0857-2211-9900', guru: 'Bu Yanti', foto: '' },
  { id: 's7', avatar: 2, nama: 'Zafran Alkhalifi', panggilan: 'Zafran', jenis_kelamin: 'L', kelas: 'B', nis: '2026-018', wali: 'Ibu Ratna', hp: '0852-3344-5566', guru: 'Bu Yanti', foto: '' },
]

const hari = (n) => new Date(Date.now() - n * 864e5).toISOString()

/* ---------- PMB & daftar ulang demo (0033) ---------- */
const sekarang = new Date()
const awalTa = sekarang.getMonth() >= 6 ? sekarang.getFullYear() : sekarang.getFullYear() - 1
const taDemo = `${awalTa}/${awalTa + 1}`
const taLalu = `${awalTa - 1}/${awalTa}`
const BULAN_DEMO = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni']
/** "MM-DD" pada tahun ajaran berjalan (Jul–Des = tahun awal), tidak pernah melewati hari ini. */
const tglTa = (mmdd) => {
  const [m, d] = mmdd.split('-').map(Number)
  const t = new Date(m >= 7 ? awalTa : awalTa + 1, m - 1, d, 9, 30)
  return (t > sekarang ? new Date(Date.now() - 3600e3) : t).toISOString()
}
const isoTa = (mmdd) => {
  const [m] = mmdd.split('-').map(Number)
  return `${m >= 7 ? awalTa : awalTa + 1}-${mmdd}`
}

export const paket = [
  {
    id: 'pk1', sekolah_id: idSekolah, jenis: 'pmb', tahun_ajaran: taDemo, nama: `PMB ${taDemo}`, total: 3700000,
    rincian: [
      { nama: 'Formulir pendaftaran', nominal: 150000 }, { nama: 'Uang gedung & sarana', nominal: 2000000 },
      { nama: 'Seragam (4 stel)', nominal: 650000 }, { nama: 'Buku, LKS & alat tulis', nominal: 400000 },
      { nama: 'Kegiatan setahun', nominal: 500000 },
    ],
    tahap: [
      { nama: 'Tahap 1', jatuhTempo: isoTa('07-15'), nominal: 1500000 },
      { nama: 'Tahap 2', jatuhTempo: isoTa('09-15'), nominal: 1200000 },
      { nama: 'Tahap 3', jatuhTempo: isoTa('12-15'), nominal: 1000000 },
    ],
  },
  {
    id: 'pk2', sekolah_id: idSekolah, jenis: 'du', tahun_ajaran: taDemo, nama: `Daftar ulang ${taDemo}`, total: 1850000,
    rincian: [
      { nama: 'Kegiatan setahun', nominal: 600000 }, { nama: 'Buku & LKS', nominal: 450000 },
      { nama: 'Seragam olahraga baru', nominal: 250000 }, { nama: 'Pemeliharaan sarana', nominal: 400000 },
      { nama: 'Asuransi & kartu pelajar', nominal: 150000 },
    ],
    tahap: [
      { nama: 'Tahap 1', jatuhTempo: isoTa('07-15'), nominal: 1000000 },
      { nama: 'Tahap 2', jatuhTempo: isoTa('10-15'), nominal: 850000 },
    ],
  },
]
export const paketSiswa = [
  ...['s1', 's2', 's3'].map((x) => ({ paket_id: 'pk1', siswa_id: x })),
  ...['s4', 's5', 's6', 's7'].map((x) => ({ paket_id: 'pk2', siswa_id: x })),
]

export const pembayaran = [
  { id: 'p1', siswa_id: 's5', jenis: 'spp', periode: 1, biaya_id: null, keterangan: 'SPP bulanan — Agustus', nominal: 150000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(12) },
  { id: 'p2', siswa_id: 's3', jenis: 'kegiatan', periode: null, biaya_id: 'b4', keterangan: 'Biaya kegiatan — Outing class', nominal: 200000, metode: 'Transfer', petugas: 'Bu Rina', dibayar_pada: hari(14) },
  { id: 'p3', siswa_id: 's3', jenis: 'spp', periode: 1, biaya_id: null, keterangan: 'SPP bulanan — Agustus', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: hari(16) },
  { id: 'p4', siswa_id: 's4', jenis: 'spp', periode: 1, biaya_id: null, keterangan: 'SPP bulanan — Agustus', nominal: 150000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(17) },
  { id: 'p5', siswa_id: 's1', jenis: 'kegiatan', periode: null, biaya_id: 'b4', keterangan: 'Biaya kegiatan — Outing class', nominal: 200000, metode: 'Transfer', petugas: 'Bu Rina', dibayar_pada: hari(32) },
  { id: 'p6', siswa_id: 's4', jenis: 'kegiatan', periode: null, biaya_id: 'b3', keterangan: 'Biaya kegiatan — Manasik haji', nominal: 150000, metode: 'Transfer', petugas: 'Kantor TK', dibayar_pada: hari(38) },
  { id: 'p7', siswa_id: 's1', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: hari(45) },
  { id: 'p8', siswa_id: 's2', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: hari(45) },
  { id: 'p9', siswa_id: 's3', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: hari(46) },
  { id: 'p10', siswa_id: 's4', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(46) },
  { id: 'p11', siswa_id: 's5', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(47) },
  { id: 'p12', siswa_id: 's6', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Transfer', petugas: 'Bu Yanti', dibayar_pada: hari(47) },
  // PMB & daftar ulang (0033) — cicilan, tanggal mengikuti tahun ajaran berjalan
  ...[
    ['pk1', 's1', 1500000, '07-10', 'Tunai'], ['pk1', 's1', 1000000, '09-12', 'Transfer'],
    ['pk1', 's2', 1500000, '07-14', 'Tunai'],
    ['pk1', 's3', 3700000, '09-12', 'Transfer'],
    ['pk2', 's4', 1000000, '07-08', 'Transfer'],
    ['pk2', 's5', 1850000, '09-02', 'Tabungan'],
    ['pk2', 's6', 1000000, '07-20', 'Tunai'], ['pk2', 's6', 850000, '09-25', 'Tunai'],
    ['pk2', 's7', 500000, '07-25', 'Tunai'],
  ].map(([pk, sid, nominal, tgl, metode], i) => ({
    id: 'pp' + i, siswa_id: sid, jenis: 'paket', periode: null, biaya_id: null, paket_id: pk,
    keterangan: pk === 'pk1' ? `PMB ${taDemo}` : `Daftar ulang ${taDemo}`, nominal, metode, petugas: 'Bu Rina', dibayar_pada: tglTa(tgl),
  })),
  // SPP tahun ajaran LALU (0041) — supaya "Tunggakan 2025/2026" kelihatan di mode demo:
  //  • Qaisha  : bayar Juli–Maret → tunggak April–Juni
  //  • Arkan   : bayar Juli–Mei   → tunggak Juni
  //  • Zidan   : baru masuk Januari, bayar Januari–Juni → tidak ada tunggakan
  ...[['s3', 0, 8], ['s4', 0, 10], ['s2', 6, 11]].flatMap(([sid, dari, sampai]) =>
    Array.from({ length: sampai - dari + 1 }, (_, k) => dari + k).map((i) => ({
      id: `pl-${sid}-${i}`, siswa_id: sid, jenis: 'spp', periode: i, tahun_ajaran: taLalu, biaya_id: null,
      keterangan: `SPP bulanan — ${BULAN_DEMO[i]} ${i < 6 ? awalTa - 1 : awalTa}`, nominal: 150000,
      metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: new Date(i < 6 ? awalTa - 1 : awalTa, (i + 6) % 12, 6, 9, 0).toISOString(),
    }))),
  // contoh cicilan — supaya progress bar "sebagian" kelihatan di mode demo
  { id: 'p13', siswa_id: 's7', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 100000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(40) },
  { id: 'p14', siswa_id: 's6', jenis: 'kegiatan', periode: null, biaya_id: 'b6', keterangan: 'Biaya kegiatan — Pentas seni', nominal: 100000, metode: 'Transfer', petugas: 'Bu Yanti', dibayar_pada: hari(20) },
]

/** Wali murid yang membuka portal demo — punya dua anak. */
// Rayyan (sa1) kakaknya, sudah lulus tapi masih menunggak → tetap tampil di portal (0044)
export const waliDemo = { nama: 'Ibu Wulan', anak: ['s1', 's4', 'sa1'] }

/** Dipakai lib/api.js sebagai pengganti hasil query Supabase. */
/* ---------- tahun ajaran & keanggotaan demo (0042) ---------- */
// Riwayat kelas: Qaisha tinggal kelas di A (2 tahun di TK A), Arkan naik A → B,
// Zidan masuk Januari tahun lalu di KB lalu naik ke A, Naura siswa baru tahun depan.
const taDepan = `${awalTa + 1}/${awalTa + 2}`
export const tahunAjaranDemo = [
  { kode: taLalu, spp_nominal: 150000, spp_kelas: {} },
  { kode: taDemo, spp_nominal: 150000, spp_kelas: {} },
]
const kelasKini = { s1: 'A', s2: 'A', s3: 'A', s4: 'B', s5: 'B', s6: 'B', s7: 'B' }
export const siswaTahunDemo = [
  ...Object.entries(kelasKini).map(([id, kelas]) => ({ siswa_id: id, tahun_ajaran: taDemo, kelas, mulai: 0, selesai: null, akhir: null })),
  { siswa_id: 's3', tahun_ajaran: taLalu, kelas: 'A', mulai: 0, selesai: null, akhir: 'tinggal' },
  { siswa_id: 's4', tahun_ajaran: taLalu, kelas: 'A', mulai: 0, selesai: null, akhir: 'naik' },
  { siswa_id: 's2', tahun_ajaran: taLalu, kelas: 'KB', mulai: 6, selesai: null, akhir: 'naik' },
  { siswa_id: 's8', tahun_ajaran: taDepan, kelas: 'A', mulai: 0, selesai: null, akhir: null },
]
const siswaDepan = { id: 's8', avatar: 5, nama: 'Naura Salsabila', panggilan: 'Naura', jenis_kelamin: 'P', kelas: 'A', nis: `${awalTa + 1}-001`, wali: 'Ibu Fitri', hp: '0813-9090-1212', guru: '', foto: '' }
// kegiatan tahun lalu: Qaisha baru bayar sebagian → ikut jadi tunggakan tahun lalu
const biayaLalu = [{ id: 'bl1', sekolah_id: idSekolah, nama: 'Pentas akhir tahun', nominal: 150000, urutan: 1, tahun_ajaran: taLalu, tanggal: `${awalTa}-06-13` }]
const bayarKegLalu = [['s3', 50000], ['s4', 150000], ['s2', 150000]].map(([sid, nominal]) => ({
  id: `plk-${sid}`, siswa_id: sid, jenis: 'kegiatan', periode: null, biaya_id: 'bl1', keterangan: `Biaya kegiatan — Pentas akhir tahun ${taLalu}`,
  nominal, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: new Date(awalTa, 5, 2, 9, 0).toISOString(),
}))

/* ---------- siswa sudah lulus / keluar yang masih menunggak (0044) ---------- */
// Rayyan: kakak Aisyah & Arkan (wali Ibu Wulan), lulus tahun lalu — SPP Mei (dicicil) & Juni + pentas belum lunas.
// Kirana: pindah kota, terakhir ditagih September tahun ini — SPP September belum dibayar.
export const siswaNonaktif = [
  { id: 'sa1', avatar: 3, nama: 'Rayyan Alfarizi', panggilan: 'Rayyan', jenis_kelamin: 'L', kelas: 'B', nis: `${awalTa - 2}-014`, wali: 'Ibu Wulan', hp: '0812-1122-3344', guru: 'Bu Yanti', foto: '', status_siswa: 'alumni', tahun_lulus: taLalu },
  { id: 'sk1', avatar: 4, nama: 'Kirana Larasati', panggilan: 'Kirana', jenis_kelamin: 'P', kelas: 'A', nis: `${awalTa}-007`, wali: 'Ibu Maya', hp: '0819-2233-4455', guru: 'Bu Rina', foto: '', status_siswa: 'keluar', tahun_lulus: null },
]
const siswaTahunNonaktif = [
  { siswa_id: 'sa1', tahun_ajaran: taLalu, kelas: 'B', mulai: 0, selesai: null, akhir: 'lulus' },
  { siswa_id: 'sk1', tahun_ajaran: taDemo, kelas: 'A', mulai: 0, selesai: 2, akhir: 'pindah' },
]
const bayarNonaktifLama = Array.from({ length: 10 }, (_, i) => ({
  id: `pa1-${i}`, siswa_id: 'sa1', jenis: 'spp', periode: i, tahun_ajaran: taLalu, biaya_id: null,
  keterangan: `SPP bulanan — ${BULAN_DEMO[i]} ${i < 6 ? awalTa - 1 : awalTa}`, nominal: 150000,
  metode: 'Transfer', petugas: 'Bu Rina', dibayar_pada: new Date(i < 6 ? awalTa - 1 : awalTa, (i + 6) % 12, 8, 9, 0).toISOString(),
}))
// pembayaran tahun ini (ikut tampil di Transaksi walau siswanya sudah tidak aktif)
const bayarNonaktifKini = [
  { id: 'pa1-10', siswa_id: 'sa1', jenis: 'spp', periode: 10, tahun_ajaran: taLalu, biaya_id: null, keterangan: `SPP bulanan — Mei ${awalTa}`, nominal: 100000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: hari(20) },
  { id: 'pk1-0', siswa_id: 'sk1', jenis: 'spp', periode: 0, tahun_ajaran: taDemo, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: tglTa('07-08') },
  { id: 'pk1-1', siswa_id: 'sk1', jenis: 'spp', periode: 1, tahun_ajaran: taDemo, biaya_id: null, keterangan: 'SPP bulanan — Agustus', nominal: 150000, metode: 'Tunai', petugas: 'Bu Rina', dibayar_pada: tglTa('08-06') },
]

export function bentukDemo() {
  return {
    sekolah, biaya: [...biaya, ...biayaLalu], siswa: [...siswa, siswaDepan], pembayaran: [...pembayaran, ...bayarKegLalu, ...bayarNonaktifKini], paket, paketSiswa, wali: null,
    siswaTahun: siswaTahunDemo, tahunAjaran: tahunAjaranDemo,
  }
}

/** Data mentah siswa lulus/keluar (untuk Tagihan › "Sudah lulus / keluar" & portal demo). */
export function nonaktifDemo() {
  return { siswa: siswaNonaktif, siswaTahun: siswaTahunNonaktif, pembayaran: [...bayarNonaktifLama, ...bayarNonaktifKini] }
}

/* ---------- buku kas demo (0028) ---------- */
const tgl = (n) => {
  const d = new Date(Date.now() - n * 864e5)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const awalBulan = (geser) => {
  const d = new Date()
  const a = new Date(d.getFullYear(), d.getMonth() + geser, 1)
  return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-01`
}

export const kasPengaturanDemo = { saldo_awal: 2500000, mulai: awalBulan(-2) }

export const kasDemo = [
  { id: 'k1', jenis: 'keluar', tanggal: tgl(40), kategori: 'Honor guru', nominal: 1500000, keterangan: 'Honor Bu Rina & Bu Yanti bulan lalu', dicatat_nama: 'Bu Kepsek' },
  { id: 'k2', jenis: 'keluar', tanggal: tgl(33), kategori: 'ATK', nominal: 185000, keterangan: 'Kertas HVS, krayon, lem', dicatat_nama: 'Bu Rina' },
  { id: 'k3', jenis: 'masuk', tanggal: tgl(30), kategori: 'Donasi', nominal: 750000, keterangan: 'Donasi alumni untuk mainan outdoor', dicatat_nama: 'Bu Kepsek' },
  { id: 'k4', jenis: 'keluar', tanggal: tgl(21), kategori: 'Transportasi', nominal: 1200000, keterangan: 'Sewa bus outing class', dicatat_nama: 'Bu Rina', biaya_id: 'b4', grup: 'g-out1', nota_file: ['demo/nota-a.svg'] },
  { id: 'k4b', jenis: 'keluar', tanggal: tgl(21), kategori: 'Konsumsi', nominal: 210000, keterangan: 'Snack & air mineral outing', dicatat_nama: 'Bu Rina', biaya_id: 'b4', grup: 'g-out1', nota_file: ['demo/nota-a.svg'] },
  { id: 'k10', jenis: 'keluar', tanggal: tgl(5), kategori: 'Perlengkapan', nominal: 240000, keterangan: 'Kain ihram & mukena anak', dicatat_nama: 'Bu Rina', biaya_id: 'b3', grup: 'g-man1', nota_file: ['demo/nota-b.svg'] },
  { id: 'k11', jenis: 'keluar', tanggal: tgl(4), kategori: 'Konsumsi', nominal: 175000, keterangan: 'Nasi kotak 10 pcs', dicatat_nama: 'Bu Rina', biaya_id: 'b3', grup: 'g-man2', nota_file: ['demo/nota-c.svg'] },
  { id: 'k12', jenis: 'keluar', tanggal: tgl(4), kategori: 'Konsumsi', nominal: 30000, keterangan: 'Air mineral 1 dus', dicatat_nama: 'Bu Rina', biaya_id: 'b3', grup: 'g-man2', nota_file: ['demo/nota-c.svg'] },
  { id: 'k13', jenis: 'keluar', tanggal: tgl(2), kategori: 'Dokumentasi', nominal: 60000, keterangan: 'Cetak foto dokumentasi', dicatat_nama: 'Bu Rina', biaya_id: 'b3' },
  { id: 'k5', jenis: 'keluar', tanggal: tgl(12), kategori: 'Honor guru', nominal: 1500000, keterangan: 'Honor Bu Rina & Bu Yanti', dicatat_nama: 'Bu Kepsek' },
  { id: 'k6', jenis: 'keluar', tanggal: tgl(9), kategori: 'Listrik & air', nominal: 320000, keterangan: 'Token listrik & PDAM', dicatat_nama: 'Bu Rina' },
  { id: 'k7', jenis: 'keluar', tanggal: tgl(6), kategori: 'Konsumsi', nominal: 240000, keterangan: 'Snack rapat wali murid', dicatat_nama: 'Bu Rina' },
  { id: 'k8', jenis: 'keluar', tanggal: tgl(6), kategori: 'Konsumsi', nominal: 420000, keterangan: 'Salah ketik nominal', dicatat_nama: 'Bu Rina', dibatalkan_pada: new Date().toISOString(), dibatalkan_nama: 'Bu Kepsek', alasan_batal: 'Nominal salah, dicatat ulang' },
  { id: 'k9', jenis: 'masuk', tanggal: tgl(3), kategori: 'Dana BOP', nominal: 2000000, keterangan: 'BOP PAUD tahap 2', dicatat_nama: 'Bu Kepsek' },
]

/** Foto nota contoh (mode demo) — gambar nota sederhana, bukan foto sungguhan. */
function gambarNota(toko, baris) {
  const isi = baris.map(([u, n], i) => `<text x="22" y="${118 + i * 30}" font-size="17" fill="#333">${u}</text><text x="378" y="${118 + i * 30}" font-size="17" text-anchor="end" fill="#333">${n}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${190 + baris.length * 30}" viewBox="0 0 400 ${190 + baris.length * 30}"><rect width="100%" height="100%" fill="#FFFDF6"/><text x="200" y="46" font-size="22" font-weight="700" text-anchor="middle" fill="#222" font-family="monospace">${toko}</text><text x="200" y="72" font-size="13" text-anchor="middle" fill="#777" font-family="monospace">NOTA CONTOH - MODE DEMO</text><g font-family="monospace">${isi}</g><line x1="22" x2="378" y1="${100 + baris.length * 30}" y2="${100 + baris.length * 30}" stroke="#999" stroke-dasharray="4 4"/></svg>`
  return 'data:image/svg+xml;base64,' + btoa(svg)
}
export const notaDemo = () => ({
  'demo/nota-a.svg': gambarNota('PO SINAR JAYA', [['Sewa bus 1 unit', '1.200.000'], ['Snack + air', '210.000']]),
  'demo/nota-b.svg': gambarNota('TOKO BUSANA AMANAH', [['Kain ihram anak', '140.000'], ['Mukena anak', '100.000']]),
  'demo/nota-c.svg': gambarNota('RM BAROKAH', [['Nasi kotak x10', '175.000'], ['Air mineral 1 dus', '30.000']]),
})
