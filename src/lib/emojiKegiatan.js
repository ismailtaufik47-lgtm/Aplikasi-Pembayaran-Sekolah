/**
 * Emoji untuk jenis biaya kegiatan.
 *
 *   1. Kalau guru memilih emoji sendiri → disimpan di biaya.emoji, itu yang dipakai.
 *   2. Kalau belum → ditebak otomatis dari nama kegiatan pakai kata kunci
 *      di bawah (mis. "Manasik haji" → 🕋, "Outbond" → 🏕️).
 *   3. Tidak ada kata kunci yang cocok → 🎈.
 *
 * Tambah kata kunci baru cukup di daftar KAMUS. Urutan penting: yang lebih
 * spesifik ditaruh di atas (mis. "pas foto" sebelum "foto").
 */

const KAMUS = [
  [['manasik', 'haji', 'umroh', 'umrah', 'kabah', "ka'bah"], '🕋'],
  [['qurban', 'kurban', 'idul adha'], '🐑'],
  [['ramadhan', 'ramadan', 'puasa', 'sahur', 'buka bersama', 'bukber', 'pesantren kilat'], '🌙'],
  [['peduli', 'sedekah', 'infaq', 'infak', 'zakat', 'amal', 'donasi', 'santunan'], '🤲'],
  [['maulid', 'isra', 'idul fitri', 'halal bihalal', 'pengajian', 'hafalan', 'tahfidz', 'iqro'], '🕌'],
  [['outbond', 'outbound', 'alam', 'kemah', 'camping', 'berkemah', 'hiking', 'kebun', 'petik'], '🏕️'],
  [['outing', 'field trip', 'karyawisata', 'study tour', 'wisata', 'kunjungan', 'jalan-jalan', 'rekreasi'], '🚌'],
  [['renang', 'berenang', 'kolam'], '🏊'],
  [['porseni', 'aksera', 'olahraga', 'lomba', 'senam', 'sport', 'jalan sehat', 'gerak jalan'], '🏅'],
  [['pentas', 'seni', 'panggung', 'tari', 'drama', 'teater', 'akhir tahun'], '🎭'],
  [['drumband', 'drum band', 'marching', 'musik', 'angklung', 'rebana', 'marawis'], '🥁'],
  [['mewarnai', 'melukis', 'lukis', 'menggambar', 'gambar', 'prakarya', 'kreasi'], '🎨'],
  [['wisuda', 'perpisahan', 'kelulusan', 'lulus', 'toga'], '🎓'],
  [['pas foto', 'foto', 'photo', 'dokumentasi', 'album'], '📸'],
  [['pmb', 'pendaftaran', 'daftar ulang', 'uang pangkal', 'formulir', 'registrasi'], '📝'],
  [['seragam', 'baju', 'batik', 'kaos', 'topi', 'atribut'], '👕'],
  [['buku', 'modul', 'lks', 'majalah', 'iqra', 'alat tulis', 'atk'], '📚'],
  [['makan', 'katering', 'catering', 'snack', 'gizi', 'susu', 'bekal'], '🍱'],
  [['kesehatan', 'dokter', 'posyandu', 'gigi', 'imunisasi', 'uks'], '🩺'],
  [['asuransi'], '🛡️'],
  [['tabungan', 'menabung'], '🐷'],
  [['agustus', 'kemerdekaan', '17an', 'hut ri'], '🇮🇩'],
  [['kartini', 'busana', 'fashion', 'baju adat'], '👗'],
  [['ulang tahun', 'milad', 'hari anak', 'hut sekolah', 'perayaan', 'pesta'], '🎉'],
  [['ekskul', 'ekstrakurikuler', 'kursus', 'les'], '⭐'],
  [['dana usaha', 'usaha', 'bazar', 'kas', 'iuran'], '💰'],
  [['listrik', 'gedung', 'pembangunan', 'sarana', 'renovasi'], '🏫'],
]

export const EMOJI_DEFAULT = '🎈'

/** Tebak emoji dari nama kegiatan (tanpa melihat pilihan manual). */
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Kata kunci dicocokkan di AWAL kata (supaya "alam" tidak cocok dengan
 * "salam"/"malam"); kata kunci pendek (≤ 3 huruf) harus satu kata utuh.
 */
const pola = (k) => new RegExp(`(^|[^a-z0-9])${escape(k)}${k.length <= 3 ? '($|[^a-z0-9])' : ''}`)
const KAMUS_POLA = KAMUS.map(([kata, e]) => [kata.map(pola), e])

export function tebakEmoji(nama = '') {
  const n = String(nama).toLowerCase()
  for (const [daftar, e] of KAMUS_POLA) {
    if (daftar.some((re) => re.test(n))) return e
  }
  return EMOJI_DEFAULT
}

/** Emoji yang dipakai untuk satu jenis biaya: pilihan manual, kalau tidak ada → tebakan. */
export const emojiKegiatan = (b) => (b && b.emoji) || tebakEmoji(b?.nama)

/** Pilihan untuk pemilih emoji manual. */
export const PILIHAN_EMOJI = [
  '🕋', '🕌', '🌙', '🤲', '🐑', '🏕️', '🚌', '🏊',
  '🏅', '🎭', '🥁', '🎨', '🎓', '📸', '📝', '👕',
  '📚', '🍱', '🩺', '🛡️', '🇮🇩', '👗', '🎉',
  '⭐', '💰', '🏫', '🎈', '🧸', '🌳', '🚒', '🍎',
]

export const FONT_EMOJI = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }