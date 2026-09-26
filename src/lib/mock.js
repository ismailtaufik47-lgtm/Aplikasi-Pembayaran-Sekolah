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

export const biaya = [
  { id: 'b1', sekolah_id: idSekolah, nama: 'PMB', nominal: 350000, urutan: 1 },
  { id: 'b2', sekolah_id: idSekolah, nama: 'Dana usaha', nominal: 100000, urutan: 2 },
  { id: 'b3', sekolah_id: idSekolah, nama: 'Manasik haji', nominal: 150000, urutan: 3 },
  { id: 'b4', sekolah_id: idSekolah, nama: 'Outing class', nominal: 200000, urutan: 4 },
  { id: 'b5', sekolah_id: idSekolah, nama: 'Pas foto', nominal: 20000, urutan: 5 },
  { id: 'b6', sekolah_id: idSekolah, nama: 'Pentas seni', nominal: 185000, urutan: 6 },
  { id: 'b7', sekolah_id: idSekolah, nama: 'Aksera / porseni', nominal: 75000, urutan: 7 },
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
  ...['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((sid, i) => ({
    id: 'pmb' + i, siswa_id: sid, jenis: 'kegiatan', periode: null, biaya_id: 'b1',
    keterangan: 'Biaya kegiatan — PMB', nominal: 350000, metode: 'Transfer', petugas: 'Kantor TK', dibayar_pada: hari(52),
  })),
  // contoh cicilan — supaya progress bar "sebagian" kelihatan di mode demo
  { id: 'p13', siswa_id: 's7', jenis: 'spp', periode: 0, biaya_id: null, keterangan: 'SPP bulanan — Juli', nominal: 100000, metode: 'Tunai', petugas: 'Bu Yanti', dibayar_pada: hari(40) },
  { id: 'p14', siswa_id: 's6', jenis: 'kegiatan', periode: null, biaya_id: 'b6', keterangan: 'Biaya kegiatan — Pentas seni', nominal: 100000, metode: 'Transfer', petugas: 'Bu Yanti', dibayar_pada: hari(20) },
]

/** Wali murid yang membuka portal demo — punya dua anak. */
export const waliDemo = { nama: 'Ibu Wulan', anak: ['s1', 's4'] }

/** Dipakai lib/api.js sebagai pengganti hasil query Supabase. */
export function bentukDemo() {
  return { sekolah, biaya, siswa, pembayaran, wali: null }
}
