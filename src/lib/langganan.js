/**
 * Langganan — konfigurasi + perhitungan status & biaya di sisi layar.
 *
 * Status yang sama juga dihitung di database (fungsi hitung_status_langganan)
 * dan itulah yang MENEGAKKAN penguncian: trigger menolak pencatatan saat
 * kadaluarsa, dan portal_wali menolak akses setelah masa tenggang. Yang di
 * sini hanya untuk TAMPILAN (hitung mundur, spanduk, layar terkunci, harga).
 *
 * Angka di bawah harus SAMA dengan yang ada di migrasi 0013_langganan.sql.
 *
 * Model harga: PER SISWA AKTIF per bulan (bukan paket flat). Tarif default
 * berlaku untuk semua sekolah, tapi admin aplikasi bisa mengatur tarif
 * khusus per sekolah (sekolah.harga_per_siswa) lewat ubahHargaPerSiswa().
 */

/* ===================== KONFIGURASI — silakan sesuaikan ===================== */

/** GANTI dengan nomor WhatsApp Anda (pengembang), format 62xxxxxxxxxx. */
export const WA_PENGEMBANG = '628000000000'

export const NAMA_APLIKASI = 'Aplikasi Pembayaran TK'

/**
 * Rekening bank tujuan transfer — tampil langsung di halaman Langganan
 * (dengan tombol salin) supaya sekolah tidak perlu tanya nomor rekening
 * lewat WhatsApp. WhatsApp hanya dipakai untuk kirim bukti transfer &
 * konfirmasi aktivasi. GANTI dengan rekening Anda; boleh isi lebih dari satu.
 */
export const REKENING_BANK = [
  { bank: 'BCA', nomor: '1234567890', atasNama: 'Nama Pemilik' },
  { bank: 'BRI', nomor: '0987654321', atasNama: 'Nama Pemilik' },
]

/** Lama masa uji coba (hari). Harus sama dengan di SQL (15). */
export const TRIAL_HARI = 15

/** Tenggang portal orang tua setelah masa aktif habis (hari). Sama dengan SQL (7). */
export const TENGGANG_PORTAL_HARI = 7

/** Tarif default: Rp per siswa aktif per bulan. Sekolah bisa punya tarif
 *  khusus (pengaturan.hargaPerSiswa) yang menimpa nilai ini. */
export const HARGA_PER_SISWA_DEFAULT = 5000

/** Batas minimum tagihan bulanan, supaya sekolah dengan sangat sedikit
 *  siswa tetap wajar ditagih (opsional — set 0 untuk menonaktifkan). */
export const MINIMUM_TAGIHAN_BULANAN = 0

/**
 * Hanya berlaku BULANAN — tanpa pilihan semester/tahunan. Harga dihitung
 * dinamis dari jumlah siswa aktif × tarif/siswa, tanpa diskon durasi.
 */
export const DURASI = [
  { id: 'bulanan', nama: 'Bulanan', bulan: 1, diskon: 0, unggulan: true, catatan: 'Bayar tiap bulan, tanpa ikatan' },
]

/* ===================== perhitungan status ===================== */

const HARI = 864e5
const keDate = (v) => (v ? new Date(v) : null)
const tglSaja = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const selisihHari = (a, b) => Math.round((tglSaja(a) - tglSaja(b)) / HARI)

/**
 * Hitung status langganan dari objek `pengaturan` (yang memuat trialMulai
 * dan langgananSampai). Aman dipanggil walau datanya belum lengkap
 * (mis. mode demo) — trial dianggap baru berjalan 7 hari agar UI tetap hidup.
 *
 * Mengembalikan: { status, sisaHari, trialSampai, langgananSampai,
 * aktifSampai, portalSampai, sisaPortalHari, portalAktif, sudahBayar }.
 * status = 'trial' | 'aktif' | 'kadaluarsa'.
 */
export function hitungLangganan(pengaturan) {
  const now = new Date()
  const trialMulai = keDate(pengaturan?.trialMulai) || new Date(now.getTime() - 7 * HARI)
  const bayarSampai = keDate(pengaturan?.langgananSampai)

  const trialSampai = new Date(trialMulai.getTime() + TRIAL_HARI * HARI)
  const aktifSampai = new Date(
    Math.max(trialSampai.getTime(), bayarSampai ? bayarSampai.getTime() : trialSampai.getTime())
  )
  const portalSampai = new Date(aktifSampai.getTime() + TENGGANG_PORTAL_HARI * HARI)

  const sudahBayar = !!bayarSampai && selisihHari(bayarSampai, now) >= 0
  // Dinonaktifkan paksa oleh admin aplikasi (sekolah.dinonaktifkan_admin) →
  // diperlakukan sama dengan kadaluarsa, apa pun tanggalnya.
  const nonaktifAdmin = !!pengaturan?.dinonaktifkanAdmin
  let status
  if (nonaktifAdmin) status = 'kadaluarsa'
  else if (selisihHari(aktifSampai, now) < 0) status = 'kadaluarsa'
  else if (sudahBayar) status = 'aktif'
  else if (selisihHari(trialSampai, now) >= 0) status = 'trial'
  else status = 'kadaluarsa'

  return {
    status,
    nonaktifAdmin,
    sisaHari: selisihHari(aktifSampai, now),
    trialSampai,
    langgananSampai: bayarSampai,
    aktifSampai,
    portalSampai,
    sisaPortalHari: selisihHari(portalSampai, now),
    portalAktif: selisihHari(portalSampai, now) >= 0,
    sudahBayar,
  }
}

/* ===================== perhitungan biaya (per siswa) ===================== */

/** Tarif per siswa/bulan yang berlaku untuk sekolah ini: tarif khusus
 *  kalau diset admin, kalau tidak pakai tarif default aplikasi. */
export function tarifPerSiswa(pengaturan) {
  const custom = pengaturan?.hargaPerSiswa
  return custom != null && custom > 0 ? custom : HARGA_PER_SISWA_DEFAULT
}

/** Jumlah siswa aktif yang dipakai sebagai dasar tagihan. */
export function jumlahSiswaAktif(daftarSiswa) {
  return Array.isArray(daftarSiswa) ? daftarSiswa.length : 0
}

/** Tagihan per bulan (sebelum diskon durasi), dengan batas minimum. */
export function tagihanPerBulan(pengaturan, daftarSiswa) {
  const total = jumlahSiswaAktif(daftarSiswa) * tarifPerSiswa(pengaturan)
  return Math.max(total, MINIMUM_TAGIHAN_BULANAN)
}

/**
 * Hitung rincian tagihan untuk satu opsi durasi (dari DURASI).
 * Mengembalikan { perBulan, subtotal, diskonRp, total, perBulanEfektif }.
 */
export function hitungTagihanDurasi(pengaturan, daftarSiswa, durasi) {
  const perBulan = tagihanPerBulan(pengaturan, daftarSiswa)
  const subtotal = perBulan * durasi.bulan
  const diskonRp = Math.round(subtotal * durasi.diskon)
  const total = subtotal - diskonRp
  return {
    perBulan,
    subtotal,
    diskonRp,
    total,
    perBulanEfektif: Math.round(total / durasi.bulan),
  }
}

/** Tautan WhatsApp ke pengembang — HANYA untuk konfirmasi pembayaran &
 *  kirim bukti transfer (cara & rekening sudah tampil di halaman, jadi
 *  pesan ini langsung berisi rincian tagihan, tinggal lampirkan bukti). */
export function pesanWaLangganan(pengaturan, daftarSiswa) {
  const nama = pengaturan?.namaSekolah || 'sekolah kami'
  const n = jumlahSiswaAktif(daftarSiswa)
  const tarif = tarifPerSiswa(pengaturan)
  const total = tagihanPerBulan(pengaturan, daftarSiswa)

  const teks =
    `Assalamu'alaikum 🙏\n` +
    `Perkenalkan, saya dari sekolah *${nama}*. Kami ingin memperpanjang sewa aplikasi SPP TK 📱\n\n` +
    `Berikut rinciannya ya:\n` +
    `👨‍🎓 Jumlah siswa aktif: ${n}\n` +
    `💰 Tarif: ${rpSingkat(tarif)}/siswa\n` +
    `💳 Total: *${rpSingkat(total)}*\n\n` +
    `📎 Bukti transfernya saya lampirkan di sini\n\n` +
    `Mohon dibantu aktivasinya ya, terima kasih banyak 🙏😊`
  return `https://wa.me/${WA_PENGEMBANG}?text=${encodeURIComponent(teks)}`
}

/**
 * Kenapa fitur tambah siswa / catat pembayaran sedang dikunci:
 *   'admin' — dinonaktifkan paksa oleh admin aplikasi
 *   'sewa'  — pernah berlangganan, tapi masa sewanya sudah lewat
 *   'trial' — belum pernah berlangganan, masa uji cobanya sudah habis
 *   null    — tidak dikunci
 */
export function alasanKunci(pengaturan) {
  const l = hitungLangganan(pengaturan)
  if (l.status !== 'kadaluarsa') return null
  if (l.nonaktifAdmin) return 'admin'
  return pengaturan?.langgananSampai ? 'sewa' : 'trial'
}

/** Pesan singkat (toast) saat tombol yang terkunci ditekan.
 *  aksi: 'bayar' (catat pembayaran) | 'siswa' (tambah siswa). */
export function pesanKunci(pengaturan, aksi = 'bayar') {
  const apa = aksi === 'siswa' ? 'menambah siswa baru' : 'mencatat pembayaran baru'
  const alasan = alasanKunci(pengaturan)
  if (alasan === 'admin') return `Aplikasi sedang dinonaktifkan admin. Hubungi admin aplikasi untuk ${apa}.`
  if (alasan === 'sewa') return `Masa sewa aplikasi sudah tidak aktif. Perpanjang dulu untuk ${apa}.`
  return `Masa uji coba sudah habis. Sewa aplikasi dulu untuk ${apa}.`
}

/** Tautan WhatsApp ke admin untuk sekolah yang dinonaktifkan paksa. */
export function waAdmin(pengaturan) {
  const teks =
    `Assalamu'alaikum 🙏\n` +
    `Saya dari sekolah *${pengaturan?.namaSekolah || '-'}*. Aplikasi SPP TK kami sedang nonaktif, ` +
    `mohon informasinya ya. Terima kasih 😊`
  return `https://wa.me/${WA_PENGEMBANG}?text=${encodeURIComponent(teks)}`
}

/** Kapan sekolah harus segera diingatkan (spanduk kuning/merah). */
export function perluDiingatkan(l) {
  return l.status === 'kadaluarsa' || (l.status === 'trial') || (l.status === 'aktif' && l.sisaHari <= 7)
}

const rpSingkat = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

export const tanggalPanjangLokal = (d) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'