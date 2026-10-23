/**
 * Daftar VIDEO PANDUAN (diputar dari YouTube di dalam aplikasi).
 *
 * CARA MENGISI: setelah video diunggah ke YouTube, tempel linknya di `yt`,
 * misalnya  yt: 'https://youtu.be/AbCdEfGhIjK'  atau  yt: 'https://youtube.com/shorts/AbCdEfGhIjK'
 * (boleh juga ID-nya saja: 'AbCdEfGhIjK'). Isi `durasi` seperti '2:40'.
 * Video yang `yt`-nya masih kosong TIDAK ditampilkan — jadi bisa diisi bertahap.
 *
 * Saran unggah: visibilitas "Tidak publik" (Unlisted) kalau hanya untuk pengguna,
 * dan pastikan "Izinkan penyematan" menyala.
 *
 * `untuk`  : 'kas' (kepala sekolah & Admin/TU) | 'kelas' (guru kelas) | 'ortu' (orang tua)
 * `alamat` : halaman tempat tombol "Tonton caranya" muncul otomatis
 *            (awalan bintang = akhiran alamat; contoh di bawah cocok untuk /ortu/TOKEN/bantuan)
 */
export const VIDEO = [
  { id: 'daftar-pin', no: 1, untuk: 'kas', judul: 'Daftar sekolah & PIN masuk', yt: '', durasi: '', alamat: ['/guru/profil-akun'] },
  { id: 'profil-sekolah', no: 2, untuk: 'kas', judul: 'Melengkapi profil sekolah', yt: '', durasi: '', alamat: ['/guru/profil-sekolah'] },
  { id: 'undang-tu', no: 3, untuk: 'kas', judul: 'Mengundang Admin/TU & hak akses', yt: '', durasi: '', alamat: ['/guru/kode-aktivasi', '/guru/akun-staf'] },
  { id: 'biaya', no: 4, untuk: 'kas', judul: 'Jenis biaya & paket biaya', yt: '', durasi: '', alamat: ['/guru/biaya'] },
  { id: 'siswa', no: 5, untuk: 'kas', judul: 'Data siswa & import dari Excel', yt: '', durasi: '', alamat: ['/guru/siswa'] },
  { id: 'bayar', no: 6, untuk: 'kas', judul: 'Mencatat pembayaran & kuitansi', yt: '', durasi: '', alamat: ['/guru/pembayaran'] },
  { id: 'tagihan', no: 7, untuk: 'kas', judul: 'Tagihan, tunggakan & pengingat', yt: '', durasi: '', alamat: ['/guru/tagihan'] },
  { id: 'kas', no: 8, untuk: 'kas', judul: 'Buku kas & saldo awal', yt: '', durasi: '', alamat: ['/guru/kas'] },
  { id: 'laporan', no: 9, untuk: 'kas', judul: 'Laporan bulanan & tahunan', yt: '', durasi: '', alamat: ['/guru/laporan'] },
  { id: 'portal-ortu', no: 10, untuk: 'kas', judul: 'Membagikan portal ke orang tua', yt: '', durasi: '', alamat: [] },
  { id: 'saku', no: 11, untuk: 'kas', judul: 'Bertanya ke asisten SAKU', yt: '', durasi: '', alamat: [] },
  { id: 'kesehatan', no: 12, untuk: 'kas', judul: 'Membaca kesehatan keuangan sekolah', yt: '', durasi: '', alamat: ['/guru/atur-indikator'] },
  { id: 'penilaian', no: 13, untuk: 'kas', judul: 'Penilaian anak & undang guru kelas', yt: '', durasi: '', alamat: ['/guru/atur-penilaian'] },
  { id: 'guru-mulai', no: 14, untuk: 'kelas', judul: 'Mulai: gabung kelas, pasang aplikasi, PIN', yt: '', durasi: '', alamat: ['/kelas/lainnya'] },
  { id: 'guru-harian', no: 15, untuk: 'kelas', judul: 'Ceklis, catatan anak & kabar kelas', yt: '', durasi: '', alamat: ['/kelas', '/kelas/anak', '/kelas/ceklis'] },
  { id: 'ortu', no: 16, untuk: 'ortu', judul: 'Panduan portal untuk orang tua', yt: '', durasi: '', alamat: ['*/bantuan'] },
]

/** Ambil ID YouTube dari link apa pun (youtu.be, watch?v=, shorts/, embed/) atau ID langsung. */
export function idYoutube(isi) {
  const s = String(isi || '').trim()
  if (!s) return ''
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/)
  return m ? m[1] : ''
}

const siap = (v) => !!idYoutube(v.yt)
const lengkap = (v) => ({ ...v, idYt: idYoutube(v.yt) })

/** Video yang sudah punya link, untuk satu aplikasi ('kas' | 'kelas' | 'ortu'). */
export const videoUntuk = (untuk) => VIDEO.filter((v) => v.untuk === untuk && siap(v)).map(lengkap)

/** Video untuk halaman yang sedang dibuka (null kalau tidak ada / belum ada link). */
export function videoHalaman(pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || '/'
  const cocok = (a) => (a.startsWith('*') ? p.endsWith(a.slice(1)) : a === p)
  const v = VIDEO.find((x) => siap(x) && x.alamat.some(cocok))
  return v ? lengkap(v) : null
}

export const gambarVideo = (idYt) => `https://i.ytimg.com/vi/${idYt}/hqdefault.jpg`
