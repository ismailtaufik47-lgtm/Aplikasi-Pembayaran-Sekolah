export const BULAN = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
]

/** Indeks bulan berjalan dalam siklus tahun ajaran (Juli = 0). */
export function bulanBerjalan(d = new Date()) {
  const m = d.getMonth() // 0 = Januari
  return m >= 6 ? m - 6 : m + 6
}

/**
 * Tahun ajaran berjalan, dihitung otomatis dari tanggal (Juli–Juni):
 * 23 Sep 2026 → '2026/2027', 10 Feb 2027 → '2026/2027', 1 Jul 2027 → '2027/2028'.
 * Tidak disimpan di database, jadi tidak perlu diubah manual tiap tahun.
 */
export function tahunAjaranBerjalan(d = new Date()) {
  const y = d.getFullYear()
  return d.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

export const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

export const tanggalPanjang = (d = new Date()) =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export const jamMenit = (d = new Date()) =>
  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')

/** Format YYYY-MM-DD (zona waktu lokal, bukan UTC) — dipakai untuk <input type="date">. */
export function tanggalISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Gabungkan tanggal (dari <input type="date">, string "YYYY-MM-DD") dengan
 * JAM saat ini, supaya transaksi yang di-backdate tetap punya jam yang wajar
 * (bukan selalu 00.00) — lalu dikembalikan sebagai ISO timestamp untuk
 * dikirim ke database. new Date(y,m,d,...) sengaja dipakai (bukan
 * new Date("YYYY-MM-DD")) supaya tidak ada pergeseran tanggal akibat parsing UTC.
 */
export function tanggalKeTimestamp(tanggalStr) {
  if (!tanggalStr) return undefined
  const [y, m, d] = tanggalStr.split('-').map(Number)
  const skrg = new Date()
  return new Date(y, m - 1, d, skrg.getHours(), skrg.getMinutes(), skrg.getSeconds()).toISOString()
}

/** Kunci pengelompokan per hari (lokal), untuk mengelompokkan riwayat transaksi. */
export function tanggalKunci(iso) {
  return tanggalISO(new Date(iso))
}

/** Judul kelompok hari: "Hari ini" / "Kemarin" / tanggal lengkap. */
export function hariTampil(iso) {
  const d = new Date(iso)
  const hariIni = new Date()
  const sama = (a, b) => a.toDateString() === b.toDateString()
  const kemarin = new Date(hariIni.getTime() - 864e5)
  if (sama(d, hariIni)) return 'Hari ini'
  if (sama(d, kemarin)) return 'Kemarin'
  return tanggalPanjang(d)
}


export function waktuTampil(iso) {
  const d = new Date(iso)
  const hariIni = new Date()
  const sama = (a, b) => a.toDateString() === b.toDateString()
  const kemarin = new Date(hariIni.getTime() - 864e5)
  if (sama(d, hariIni)) return `Hari ini, ${jamMenit(d)}`
  if (sama(d, kemarin)) return `Kemarin, ${jamMenit(d)}`
  return `${tanggalPanjang(d)}, ${jamMenit(d)}`
}

/* =====================================================================
 * Status pembayaran per bulan/kegiatan.
 *
 * `siswa.spp` dan `siswa.kegiatan` menyimpan RUPIAH YANG SUDAH DIBAYAR
 * untuk tiap bulan/kegiatan — bukan boolean lunas/belum. Ini yang
 * membuat pembayaran sebagian (cicilan) bisa terekam: satu bulan boleh
 * dicicil lewat beberapa transaksi, jumlahnya dijumlahkan otomatis saat
 * data dimuat (lihat bentuk() di lib/api.js). "Lunas" bukan status yang
 * disimpan, melainkan diturunkan: dibayar >= target.
 * ===================================================================== */

/* ---------------- tanggal jatuh tempo SPP ----------------
 * Disimpan sebagai angka 1–28, atau 31 yang berarti "AKHIR BULAN".
 * Nilai 31 otomatis menyesuaikan jumlah hari tiap bulan:
 * 30 September, 31 Oktober, 28/29 Februari, dst.
 */
export const AKHIR_BULAN = 31

export const jatuhTempoAkhirBulan = (tgl) => Number(tgl) >= 29

/** Jumlah hari dalam bulan (bulan: 0 = Januari). */
export const jumlahHariBulan = (tahun, bulan) => new Date(tahun, bulan + 1, 0).getDate()

/** Tanggal jatuh tempo yang berlaku di bulan kalender tertentu (bulan: 0 = Januari). */
export const tanggalJatuhTempoDi = (tgl, tahun, bulan) => Math.min(Number(tgl) || 10, jumlahHariBulan(tahun, bulan))

/** Teks singkat aturan jatuh tempo: "tanggal 10" atau "akhir bulan". */
export const teksJatuhTempo = (tgl) => (jatuhTempoAkhirBulan(tgl) ? 'akhir bulan' : `tanggal ${tgl}`)

/**
 * Tanggal jatuh tempo SPP untuk periode tahun ajaran ke-i (0 = Juli),
 * contoh: "10 Agustus", "30 September" (akhir bulan).
 */
export function labelJatuhTempoPeriode(tgl, i, now = new Date()) {
  const [awal] = tahunAjaranBerjalan(now).split('/').map(Number)
  const tahun = i < 6 ? awal : awal + 1
  const bulan = (i + 6) % 12
  return `${tanggalJatuhTempoDi(tgl, tahun, bulan)} ${BULAN[i]}`
}

/** Hari ini sudah lewat tanggal jatuh tempo bulan berjalan? */
export function sudahLewatJatuhTempo(tanggalJatuhTempo, hariIni = new Date()) {
  return hariIni.getDate() > tanggalJatuhTempoDi(tanggalJatuhTempo, hariIni.getFullYear(), hariIni.getMonth())
}

/**
 * Status satu bulan SPP siswa: 'lunas' | 'sebagian' | 'nunggak' | 'belum-bayar' | 'menunggu'.
 *
 * Bedanya 'nunggak' dan 'belum-bayar' ini yang sering bikin orang tua
 * merasa "kok sudah dibilang nunggak padahal baru lewat tanggalnya
 * beberapa hari" — jadi sengaja dipisah:
 *  - 'nunggak'     : bulan itu SUDAH BERLALU SEPENUHNYA (i < kini) dan belum lunas.
 *                    Ini yang dihitung sebagai "N bulan nunggak".
 *  - 'belum-bayar' : masih BULAN BERJALAN, tanggal jatuh tempo sudah lewat,
 *                    tapi belum ada pembayaran. Belum dianggap tunggakan
 *                    karena bulannya sendiri belum selesai.
 *  - 'menunggu'    : bulan berjalan yang belum jatuh tempo, atau bulan mendatang.
 */
export function statusSpp(dibayar, target, i, kini, tanggalJatuhTempo, hariIni = new Date()) {
  if (dibayar >= target) return 'lunas'
  if (dibayar > 0) return 'sebagian'
  if (i < kini) return 'nunggak'
  if (i === kini) return sudahLewatJatuhTempo(tanggalJatuhTempo, hariIni) ? 'belum-bayar' : 'menunggu'
  return 'menunggu'
}

export const dibayarSpp = (s, i) => s.spp[i] || 0
export const dibayarKegiatan = (s, i) => s.kegiatan[i] || 0

/** Persentase untuk progress bar, dibatasi 0–100 walau kelebihan bayar. */
export const persenBayar = (dibayar, target) =>
  target > 0 ? Math.min(100, Math.round((dibayar / target) * 100)) : 0

/** Jumlah bulan SPP yang sudah LUNAS PENUH (bukan sekadar tersentuh). */
export const lunasSpp = (s, sppNominal) =>
  s.spp.filter((v) => (v || 0) >= sppNominal).length

export const totalKegiatan = (biaya) => biaya.reduce((t, b) => t + b.nominal, 0)

/** Total rupiah kegiatan yang sudah masuk, termasuk yang baru sebagian. */
export const kegiatanTerbayar = (s) => s.kegiatan.reduce((t, v) => t + (v || 0), 0)

/** Total rupiah kegiatan yang masih kurang. */
export const kegiatanBelum = (s, biaya) =>
  biaya.reduce((t, b, i) => t + Math.max(0, b.nominal - (s.kegiatan[i] || 0)), 0)

/** Total rupiah yang sudah masuk dari siswa ini — SPP + kegiatan, termasuk cicilan. */
export const totalDibayar = (s) =>
  s.spp.reduce((t, v) => t + (v || 0), 0) + kegiatanTerbayar(s)

/**
 * Jumlah bulan yang SUDAH BERLALU SEPENUHNYA (i < kini, TIDAK termasuk
 * bulan berjalan) dan belum lunas. Ini dasar untuk label "N bulan
 * nunggak" — bulan berjalan yang cuma lewat tanggal jatuh tempo TIDAK
 * ikut terhitung di sini (lihat statusSpp / sppPerluSekarang).
 */
export function bulanTertunggak(s, sppNominal, kini = bulanBerjalan()) {
  let n = 0
  for (let i = 0; i < kini; i++) if ((s.spp[i] || 0) < sppNominal) n++
  return n
}

/** Rupiah kekurangan dari bulan-bulan yang SUDAH BERLALU saja (tunggakan murni). */
export function sppTertunggakRupiah(s, sppNominal, kini = bulanBerjalan()) {
  let t = 0
  for (let i = 0; i < kini; i++) t += Math.max(0, sppNominal - (s.spp[i] || 0))
  return t
}

/**
 * Rupiah SPP yang PERLU DIBAYAR SEKARANG: tunggakan bulan-bulan lalu,
 * ditambah bulan berjalan KALAU tanggal jatuh temponya sudah lewat.
 * Dipakai untuk headline "perlu dibayar sekarang" — beda dari
 * sppTertunggakRupiah supaya bulan berjalan yang belum jatuh tempo
 * tidak ikut membuat angkanya terlihat seperti utang menumpuk.
 */
export function sppPerluSekarang(s, sppNominal, tanggalJatuhTempo, kini = bulanBerjalan(), hariIni = new Date()) {
  let t = sppTertunggakRupiah(s, sppNominal, kini)
  if (sudahLewatJatuhTempo(tanggalJatuhTempo, hariIni)) {
    t += Math.max(0, sppNominal - (s.spp[kini] || 0))
  }
  return t
}

/**
 * Siswa ini perlu ditagih sekarang? Benar kalau ada tunggakan bulan
 * lalu, ATAU bulan berjalan sudah lewat jatuh tempo dan belum lunas.
 */
export function perluDitagihSekarang(s, sppNominal, tanggalJatuhTempo, kini = bulanBerjalan(), hariIni = new Date()) {
  if (bulanTertunggak(s, sppNominal, kini) > 0) return true
  return sudahLewatJatuhTempo(tanggalJatuhTempo, hariIni) && (s.spp[kini] || 0) < sppNominal
}

/**
 * Label ringkas untuk chip/daftar siswa: "{n} bulan" kalau ada
 * tunggakan bulan lalu, "Belum bayar" kalau cuma bulan berjalan yang
 * lewat jatuh tempo, atau null kalau tidak ada yang perlu ditagih.
 */
export function labelTunggakan(s, sppNominal, tanggalJatuhTempo, kini = bulanBerjalan(), hariIni = new Date()) {
  const n = bulanTertunggak(s, sppNominal, kini)
  if (n > 0) return { teks: `${n} bulan`, warna: n > 1 ? 'red' : 'amber' }
  if (sudahLewatJatuhTempo(tanggalJatuhTempo, hariIni) && (s.spp[kini] || 0) < sppNominal) {
    return { teks: 'Belum bayar', warna: 'amber' }
  }
  return null
}

/**
 * Klasifikasi status keseluruhan satu siswa: 'lunas' | 'sebagian' | 'belum'.
 * Dipakai di donut "Status pembayaran" dan tabel daftar siswa supaya
 * keduanya selalu sepakat. TIDAK cuma lihat bulan berjalan — kalau
 * dilihat cuma bulan berjalan, siswa yang baru dicicil untuk bulan
 * LALU (mis. Agustus, padahal sekarang sudah September) tidak akan
 * kelihatan pergerakannya — padahal jelas ada progres.
 */
export function statusRingkasSiswa(s, sppNominal, tanggalJatuhTempo, kini = bulanBerjalan(), hariIni = new Date()) {
  if (!perluDitagihSekarang(s, sppNominal, tanggalJatuhTempo, kini, hariIni)) return 'lunas'
  for (let i = 0; i <= kini; i++) {
    const bayar = s.spp[i] || 0
    if (bayar > 0 && bayar < sppNominal) return 'sebagian'
  }
  return 'belum'
}

export function sisaTagihan(s, biaya, sppNominal) {
  const sisaSppTotal = s.spp.reduce((t, v) => t + Math.max(0, sppNominal - (v || 0)), 0)
  return sisaSppTotal + kegiatanBelum(s, biaya)
}
/**
 * Nomor kuitansi yang tampil di layar — rumusnya SAMA dengan nomor_dokumen()
 * di database (0024): KW-<tahun><bulan WIB>-<8 huruf pertama id>.
 */
export function nomorKuitansi(id, waktu) {
  const t = new Date(waktu).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD
  return `KW-${t.slice(2, 4)}${t.slice(5, 7)}-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

/** Nomor WhatsApp sekolah dalam format wa.me (62…), atau '' kalau belum diisi. */
export function waSekolah(pengaturan) {
  const n = String(pengaturan?.waSekolah || '').replace(/[^0-9]/g, '')
  if (!n) return ''
  return n.startsWith('0') ? '62' + n.slice(1) : n
}
