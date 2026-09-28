/**
 * Hak akses per fitur — cermin dari supabase/migrations/0029_hak_akses_pembatalan.sql.
 *
 * Dua peran sekolah:
 *   kepala → kepala sekolah
 *   admin  → admin / TU (tata usaha)
 *
 * Tingkat: 'tidak' | 'lihat' | 'kelola'.
 * Pengaturan per sekolah diatur admin aplikasi (panel admin → sekolah → Hak akses).
 *
 * PENTING: yang di sini hanya untuk MENAMPILKAN/MENYEMBUNYIKAN menu & tombol.
 * Penegakan sebenarnya ada di database (RLS & fungsi), jadi walau ada yang
 * mengakali tampilan, server tetap menolak.
 */

export const PERAN = {
  kepala: { label: 'Kepala sekolah', pendek: 'Kepala' },
  admin: { label: 'Admin/TU', pendek: 'Admin/TU' },
}

export const labelPeran = (p) => PERAN[p]?.label || 'Staf sekolah'

/** Urutan & keterangan fitur. `pilihan` = tingkat yang boleh dipilih. */
export const FITUR = [
  { id: 'siswa', label: 'Data siswa', emoji: '🧒', ket: 'Tambah, ubah, hapus siswa & data wali', pilihan: ['tidak', 'lihat', 'kelola'] },
  { id: 'pembayaran', label: 'Pembayaran', emoji: '💵', ket: 'Catat pembayaran SPP & kegiatan, lihat tagihan', pilihan: ['tidak', 'lihat', 'kelola'] },
  { id: 'batal', label: 'Pembatalan transaksi', emoji: '↩️', ket: 'Batalkan pembayaran/kas yang salah (wajib alasan)', pilihan: ['tidak', 'lihat', 'kelola'] },
  { id: 'kas', label: 'Kas sekolah', emoji: '💰', ket: 'Catat pengeluaran & pemasukan lain, saldo awal', pilihan: ['tidak', 'lihat', 'kelola'] },
  { id: 'lap_pembayaran', label: 'Laporan pembayaran', emoji: '📊', ket: 'Ketertiban bayar SPP & kegiatan', pilihan: ['tidak', 'lihat'] },
  { id: 'lap_keuangan', label: 'Laporan keuangan', emoji: '📒', ket: 'Arus kas masuk–keluar & saldo', pilihan: ['tidak', 'lihat'] },
  { id: 'ai', label: 'Tanya AI', emoji: '🤖', ket: 'Tanya soal data sekolah ke asisten AI', pilihan: ['tidak', 'kelola'] },
  { id: 'biaya', label: 'Jenis biaya & SPP', emoji: '🏷️', ket: 'Nominal SPP, jatuh tempo, biaya kegiatan', pilihan: ['tidak', 'lihat', 'kelola'] },
  { id: 'sekolah', label: 'Profil sekolah & akun', emoji: '🏫', ket: 'Profil, logo, kode aktivasi, langganan', pilihan: ['tidak', 'kelola'] },
]

export const TINGKAT = {
  tidak: { label: 'Tidak', nilai: 0 },
  lihat: { label: 'Lihat', nilai: 1 },
  kelola: { label: 'Kelola', nilai: 2 },
}

export const STANDAR = {
  kepala: {
    siswa: 'lihat', pembayaran: 'lihat', batal: 'kelola', kas: 'lihat',
    lap_pembayaran: 'lihat', lap_keuangan: 'lihat', ai: 'kelola', biaya: 'lihat', sekolah: 'kelola',
  },
  admin: {
    siswa: 'kelola', pembayaran: 'kelola', batal: 'kelola', kas: 'kelola',
    lap_pembayaran: 'lihat', lap_keuangan: 'lihat', ai: 'kelola', biaya: 'kelola', sekolah: 'tidak',
  },
}

/** Contoh susunan siap pakai di panel admin. */
export const PRESET = [
  { id: 'standar', label: 'Standar', ket: 'Kepala melihat & membatalkan, Admin/TU mengerjakan transaksi', nilai: null },
  {
    id: 'kepala-tu',
    label: 'Kepala merangkap TU',
    ket: 'Sekolah kecil tanpa TU — kepala sekolah bisa semuanya',
    nilai: {
      kepala: { siswa: 'kelola', pembayaran: 'kelola', batal: 'kelola', kas: 'kelola', biaya: 'kelola' },
      admin: {},
    },
  },
  {
    id: 'tu-penuh',
    label: 'TU dipercaya penuh',
    ket: 'Admin/TU juga mengurus profil sekolah, kode aktivasi & langganan',
    nilai: { kepala: {}, admin: { sekolah: 'kelola' } },
  },
]

/** Lengkapi akses (bisa sebagian/null) dengan nilai standar peran itu. */
export function lengkapiAkses(peran, akses) {
  const dasar = STANDAR[peran] || {}
  const hasil = { ...dasar, ...(akses || {}) }
  if (peran === 'kepala') hasil.sekolah = 'kelola'
  return hasil
}

/** Apakah akses `akses` untuk `fitur` minimal `tingkat`. */
export function cekAkses(akses, fitur, tingkat = 'kelola') {
  const punya = TINGKAT[akses?.[fitur]]?.nilai ?? 0
  return punya >= (TINGKAT[tingkat]?.nilai ?? 2)
}

/** Aturan pengaman yang sama dengan admin_atur_hak_akses() di database. */
export function periksaAkses(hak) {
  const k = lengkapiAkses('kepala', hak?.kepala)
  const a = lengkapiAkses('admin', hak?.admin)
  const salah = []
  if (k.pembayaran !== 'kelola' && a.pembayaran !== 'kelola') salah.push('Minimal satu peran harus bisa mencatat pembayaran.')
  if (k.siswa !== 'kelola' && a.siswa !== 'kelola') salah.push('Minimal satu peran harus bisa mengelola data siswa.')
  if (k.biaya !== 'kelola' && a.biaya !== 'kelola') salah.push('Minimal satu peran harus bisa mengatur jenis biaya & nominal SPP.')
  return salah
}

/**
 * Menu panel sekolah. `boleh(fitur, tingkat)` dari store.
 * Dipakai sidebar desktop, tab bar mobile, dan halaman Lainnya — supaya
 * ketiganya selalu konsisten.
 */
export function menuSekolah(boleh) {
  const lihatLaporan = boleh('lap_pembayaran', 'lihat') || boleh('lap_keuangan', 'lihat')
  return [
    { id: 'beranda', label: 'Beranda', emoji: 'beranda', ke: '/guru', grup: 'menu', ada: true },
    { id: 'siswa', label: 'Siswa', emoji: 'siswa', ke: '/guru/siswa', grup: 'menu', sub: 'Data siswa & wali', ada: boleh('siswa', 'lihat') },
    { id: 'tagihan', label: 'Tagihan', emoji: 'tagihan', ke: '/guru/tagihan', grup: 'menu', sub: 'Semua tagihan SPP & kegiatan', ada: boleh('pembayaran', 'lihat') },
    { id: 'pembayaran', label: 'Pembayaran', emoji: 'pembayaran', ke: '/guru/pembayaran', grup: 'menu', sub: 'Riwayat transaksi & pembatalan', ada: boleh('pembayaran', 'lihat') || boleh('batal', 'lihat') },
    { id: 'laporan', label: 'Laporan', emoji: 'laporan', ke: '/guru/laporan', grup: 'menu', sub: 'Laporan pembayaran & keuangan', ada: lihatLaporan },
    { id: 'kas', label: 'Kas sekolah', emoji: 'kas', ke: '/guru/kas', grup: 'menu', sub: 'Pengeluaran, pemasukan & saldo kas', ada: boleh('kas', 'lihat') },
    { id: 'ai', label: 'Tanya AI', emoji: 'ai', ke: '/guru/tanya-ai', grup: 'menu', sub: 'Tanya soal data sekolah', ada: boleh('ai') },
    { id: 'biaya', label: 'Jenis biaya', emoji: 'biaya', ke: '/guru/biaya', grup: 'atur', sub: 'Nominal SPP & biaya kegiatan', ada: boleh('biaya', 'lihat') },
    { id: 'kode-aktivasi', label: 'Kode aktivasi', emoji: 'kode', ke: '/guru/kode-aktivasi', grup: 'atur', sub: 'Undang akun Admin/TU baru', ada: boleh('sekolah') },
    { id: 'profil-sekolah', label: 'Profil sekolah', emoji: 'sekolah', ke: '/guru/profil-sekolah', grup: 'atur', sub: 'Identitas, logo & rekening sekolah', ada: boleh('sekolah') },
    { id: 'langganan', label: 'Langganan', emoji: 'langganan', ke: '/guru/langganan', grup: 'atur', sub: 'Masa aktif aplikasi & perpanjangan', ada: boleh('sekolah') },
  ].filter((m) => m.ada)
}

/**
 * Tab bar mobile: Beranda + 3 tab + Lainnya. Diisi berurutan menurut
 * prioritas dari menu yang boleh dibuka akun ini.
 */
export function pilihTab(menu, bisaCatat) {
  const ada = (id) => menu.find((m) => m.id === id)
  const urutan = [
    ada('siswa') && { id: 'siswa', emoji: 'siswa', label: 'Siswa', ke: '/guru/siswa' },
    bisaCatat && { id: 'bayar', emoji: 'bayar', label: 'Bayar', catat: true },
    ada('pembayaran') && { id: 'pembayaran', emoji: 'pembayaran', label: 'Riwayat', ke: '/guru/pembayaran' },
    ada('laporan') && { id: 'laporan', emoji: 'laporan', label: 'Laporan', ke: '/guru/laporan' },
    ada('ai') && { id: 'ai', emoji: 'ai', label: 'Tanya AI', ke: '/guru/tanya-ai' },
    ada('kas') && { id: 'kas', emoji: 'kas', label: 'Kas', ke: '/guru/kas' },
  ].filter(Boolean)
  return [{ id: 'beranda', emoji: 'beranda', label: 'Beranda', ke: '/guru' }, ...urutan.slice(0, 3)]
}

