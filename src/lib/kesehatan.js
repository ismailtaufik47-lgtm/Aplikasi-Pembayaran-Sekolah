/**
 * Indikator kesehatan keuangan sekolah (dasbor kepala sekolah).
 *
 * 7 hal yang dicek — masing-masing Aman / Pantau / Perlu tindakan:
 *   cad   Cadangan kas bebas   kas bebas ÷ biaya rutin per bulan
 *   arus  Arus kas bulanan     masuk − keluar; minus 2 bulan berturut = merah
 *   spp   SPP bulan ini        % SPP masuk vs target per tanggal tertentu
 *   tungg Tunggakan            tagihan lewat jatuh tempo ÷ SPP sebulan
 *   keg   Kegiatan nombok      ada kegiatan yang terpakai > uang masuknya
 *   nota  Kerapian nota        % pengeluaran bulan ini yang ada foto notanya
 *   proy  Perkiraan 3 bulan    kas bebas terendah 3 bulan ke depan
 *
 * Skor = Σ(bobot × nilai) ÷ Σ bobot indikator yang dinilai  (Aman 1, Pantau ½,
 * Perlu tindakan 0) → 70+ Sehat, 40–69 Waspada, <40 Perlu perhatian.
 * Rem darurat: kas bebas < 1 bulan biaya rutin → langsung Perlu perhatian.
 *
 * Kas bebas = saldo kas − sisa dana kegiatan yang BELUM berlangsung (uang yang
 * sudah dipungut untuk acara tertentu = dana terikat, prinsip ISAK 35).
 *
 * Bobot & batas zona adalah rancangan Kasceria (bukan standar resmi) dan bisa
 * diatur sekolah di layar "Atur indikator". Semua perhitungan di sini murni
 * (tanpa akses database) supaya mudah diuji dan selalu sama di HP & PC.
 */
import { kegiatanLewat } from './statusSiswa.js'
import { targetSpp } from './format.js'

export const KUNCI = ['cad', 'arus', 'spp', 'tungg', 'keg', 'nota', 'proy']
export const BOBOT = { cad: 25, arus: 15, spp: 15, tungg: 15, keg: 10, nota: 5, proy: 15 }
export const NAMA = {
  cad: 'Cadangan kas bebas', arus: 'Arus kas bulanan', spp: 'SPP bulan ini', tungg: 'Tunggakan',
  keg: 'Kegiatan nombok', nota: 'Kerapian nota', proy: 'Perkiraan 3 bulan',
}
export const PENGARUH = { cad: 'besar', arus: 'sedang', spp: 'sedang', tungg: 'sedang', keg: 'kecil', nota: 'kecil', proy: 'besar' }
export const PRESET = {
  longgar: { cad: 2, spp: 70, tungg: 50, nota: 70 },
  normal: { cad: 3, spp: 85, tungg: 30, nota: 90 },
  ketat: { cad: 4, spp: 90, tungg: 20, nota: 100 },
}
export const BATAS_TARGET = {
  cad: { min: 1, max: 6, langkah: 1 },
  spp: { min: 50, max: 100, langkah: 5 },
  tungg: { min: 10, max: 100, langkah: 10 },
  nota: { min: 50, max: 100, langkah: 10 },
}
const SEMUA_AKTIF = Object.fromEntries(KUNCI.map((k) => [k, true]))
export const ATURAN_BAWAAN = { preset: 'normal', target: { ...PRESET.normal }, aktif: SEMUA_AKTIF, sppTanggal: 20, rutinManual: null, rutinRincian: null, terjadwal: [] }

export const NILAI = { aman: 1, pantau: 0.5, tindakan: 0 }
export const LABEL_STATUS = { aman: 'Aman', pantau: 'Pantau', tindakan: 'Perlu tindakan', belum: 'Belum dinilai', kosong: 'Data belum ada', mati: 'Tidak dicek' }
export const ZONA = {
  hijau: { label: 'SEHAT', pendek: 'Sehat' },
  kuning: { label: 'WASPADA', pendek: 'Waspada' },
  merah: { label: 'PERLU PERHATIAN', pendek: 'Perlu perhatian' },
  kosong: { label: 'BELUM BISA DINILAI', pendek: 'Belum bisa dinilai' },
}

const angka = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
const jepit = (v, a, b) => Math.min(b, Math.max(a, v))

/** Gabungkan isi tersimpan (bisa sebagian / kosong) dengan bawaan + rapikan. */
export function rapikanAturan(isi) {
  const x = isi && typeof isi === 'object' ? isi : {}
  const preset = ['longgar', 'normal', 'ketat', 'sendiri'].includes(x.preset) ? x.preset : 'normal'
  const dasar = PRESET[preset] || PRESET.normal
  const target = {}
  Object.entries(BATAS_TARGET).forEach(([k, b]) => { target[k] = jepit(angka(x.target?.[k], dasar[k]), b.min, b.max) })
  const aktif = {}
  KUNCI.forEach((k) => { aktif[k] = x.aktif?.[k] !== false })
  const terjadwal = Array.isArray(x.terjadwal)
    ? x.terjadwal
        .map((t) => ({ nama: String(t?.nama || '').slice(0, 60), bulan: jepit(Math.round(angka(t?.bulan, 1)), 1, 12), nominal: Math.max(0, Math.round(angka(t?.nominal, 0))) }))
        .filter((t) => t.nama && t.nominal > 0)
        .slice(0, 20)
    : []
  // biaya rutin "isi sendiri": rincian { nama, nominal } — total = jumlah semua baris
  const rincian = Array.isArray(x.rutinRincian)
    ? x.rutinRincian
        .map((r) => ({ nama: String(r?.nama || '').trim().slice(0, 60), nominal: Math.max(0, Math.round(angka(r?.nominal, 0))) }))
        .filter((r) => r.nama && r.nominal > 0)
        .slice(0, 20)
    : []
  const rutin = rincian.length ? rincian.reduce((s, r) => s + r.nominal, 0) : angka(x.rutinManual, null)
  return {
    preset, target, aktif, terjadwal,
    sppTanggal: jepit(Math.round(angka(x.sppTanggal, 20)), 1, 28),
    rutinManual: rutin && rutin > 0 ? Math.round(rutin) : null,
    rutinRincian: rincian.length ? rincian : null,
  }
}

const rpPendek = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const NAMA_PRESET = { longgar: 'Longgar', normal: 'Normal', ketat: 'Ketat', sendiri: 'Diatur sendiri' }
const SATUAN = { cad: ' bulan', spp: '%', tungg: '%', nota: '%' }
const NAMA_TARGET = { cad: 'Target cadangan kas', spp: 'Target SPP masuk', tungg: 'Batas tunggakan', nota: 'Target foto nota' }
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Apa saja yang berubah dari `lama` ke `baru` (dua isi pengaturan) — untuk
 * Riwayat perubahan. `lama` null = simpanan pertama (tampilkan isinya).
 * → [{ jenis: 'tambah' | 'hapus' | 'ubah' | 'info', teks }]
 */
export function ringkasPerubahan(baruMentah, lamaMentah) {
  const b = rapikanAturan(baruMentah)
  const out = []
  const tambah = (jenis, teks) => out.push({ jenis, teks })
  const rincianTeks = (a) => (a.rutinRincian ? null : a.rutinManual ? rpPendek(a.rutinManual) : 'otomatis')

  if (!lamaMentah) {
    tambah('info', `Tingkat ketat: ${NAMA_PRESET[b.preset]}`)
    if (b.rutinRincian) b.rutinRincian.forEach((r) => tambah('tambah', `${r.nama} ${rpPendek(r.nominal)}/bulan`))
    else tambah('info', `Biaya rutin: ${rincianTeks(b) === 'otomatis' ? 'otomatis (rata-rata 3 bulan)' : `${rincianTeks(b)}/bulan`}`)
    KUNCI.filter((k) => !b.aktif[k]).forEach((k) => tambah('ubah', `${NAMA[k]}: tidak dicek`))
    b.terjadwal.forEach((t) => tambah('tambah', `Terjadwal ${BLN[t.bulan - 1]}: ${t.nama} ${rpPendek(t.nominal)}`))
    if (b.rutinRincian) tambah('info', `Total biaya rutin ${rpPendek(b.rutinManual)}/bulan`)
    return out
  }

  const l = rapikanAturan(lamaMentah)
  if (b.preset !== l.preset) tambah('ubah', `Tingkat ketat: ${NAMA_PRESET[l.preset]} → ${NAMA_PRESET[b.preset]}`)
  // ganti tingkat Longgar/Normal/Ketat sudah otomatis mengganti target — tidak perlu dirinci lagi
  const presetSaja = b.preset !== l.preset && b.preset !== 'sendiri'
  Object.keys(BATAS_TARGET).forEach((k) => {
    if (!presetSaja && b.target[k] !== l.target[k]) tambah('ubah', `${NAMA_TARGET[k]}: ${l.target[k]}${SATUAN[k]} → ${b.target[k]}${SATUAN[k]}`)
  })
  if (b.sppTanggal !== l.sppTanggal) tambah('ubah', `SPP dinilai mulai tanggal ${l.sppTanggal} → ${b.sppTanggal}`)
  KUNCI.forEach((k) => {
    if (b.aktif[k] !== l.aktif[k]) tambah('ubah', `${NAMA[k]}: ${b.aktif[k] ? 'dicek lagi' : 'tidak dicek'}`)
  })

  // biaya rutin
  const rb = b.rutinRincian || []
  const rl = l.rutinRincian || []
  if (!b.rutinManual && l.rutinManual) tambah('ubah', 'Biaya rutin: isi sendiri → otomatis (rata-rata 3 bulan)')
  else if (b.rutinManual && !l.rutinManual) tambah('ubah', 'Biaya rutin: otomatis → isi sendiri')
  if (b.rutinManual) {
    const kunci = (r) => r.nama.toLowerCase()
    const petaL = new Map(rl.map((r) => [kunci(r), r]))
    const petaB = new Map(rb.map((r) => [kunci(r), r]))
    rb.forEach((r) => {
      const x = petaL.get(kunci(r))
      if (!x) tambah('tambah', `${r.nama} ${rpPendek(r.nominal)}/bulan`)
      else if (x.nominal !== r.nominal) tambah('ubah', `${r.nama}: ${rpPendek(x.nominal)} → ${rpPendek(r.nominal)}`)
    })
    rl.forEach((r) => { if (!petaB.has(kunci(r))) tambah('hapus', `${r.nama} ${rpPendek(r.nominal)}/bulan`) })
    if (!rb.length && !rl.length && b.rutinManual !== l.rutinManual) tambah('ubah', `Biaya rutin: ${rincianTeks(l)} → ${rpPendek(b.rutinManual)}/bulan`)
    if (b.rutinManual !== l.rutinManual && (rb.length || rl.length)) {
      tambah('info', `Total biaya rutin ${l.rutinManual ? `${rpPendek(l.rutinManual)} → ` : ''}${rpPendek(b.rutinManual)}/bulan`)
    }
  }

  // pengeluaran besar terjadwal
  const kt = (t) => `${t.nama.toLowerCase()}|${t.bulan}|${t.nominal}`
  const tl = new Set(l.terjadwal.map(kt))
  const tb = new Set(b.terjadwal.map(kt))
  b.terjadwal.forEach((t) => { if (!tl.has(kt(t))) tambah('tambah', `Terjadwal ${BLN[t.bulan - 1]}: ${t.nama} ${rpPendek(t.nominal)}`) })
  l.terjadwal.forEach((t) => { if (!tb.has(kt(t))) tambah('hapus', `Terjadwal ${BLN[t.bulan - 1]}: ${t.nama} ${rpPendek(t.nominal)}`) })

  if (!out.length) tambah('info', 'Disimpan tanpa perubahan')
  return out
}

/** "3,4" — satu angka di belakang koma, gaya Indonesia. */
export const desimal = (n) => (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const kunciBln = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const geser = (kunci, n) => {
  const [y, m] = kunci.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return kunciBln(d)
}

/**
 * d = {
 *   hariIni, adaSaldoAwal, saldoKini,
 *   arus: [{ bulan:'YYYY-MM', masuk, keluar }]  (beberapa bulan terakhir, termasuk bulan ini)
 *   keluarKegiatan: { 'YYYY-MM': rupiah pengeluaran berlabel kegiatan }
 *   kegiatan: hasil hitungRekapKegiatan()  (biaya kegiatan + paket)
 *   siswa, sppNominal, kini (indeks bulan tahun ajaran),
 *   status: [{ siswa, status, tunggakan, items }]  (lib/statusSiswa.js)
 *   nota: { ada, total }  (pengeluaran kas bulan ini)
 * }
 */
export function hitungKesehatan(d, aturanMentah) {
  const aturan = rapikanAturan(aturanMentah)
  const t = aturan.target
  const hariIni = d.hariIni || new Date()
  const bulanIni = kunciBln(hariIni)
  const k = {}

  // ---------- biaya rutin: rata-rata 3 bulan penuh terakhir (tanpa kegiatan) ----------
  const arusMap = new Map((d.arus || []).map((a) => [a.bulan, a]))
  const rutinBulan = [1, 2, 3]
    .map((n) => geser(bulanIni, -n))
    .map((b) => {
      const a = arusMap.get(b)
      return a ? Math.max(0, a.keluar - (d.keluarKegiatan?.[b] || 0)) : 0
    })
    .filter((v) => v > 0)
  const rutinOtomatis = rutinBulan.length ? Math.round(rutinBulan.reduce((s, v) => s + v, 0) / rutinBulan.length) : null
  const rutin = aturan.rutinManual || rutinOtomatis
  const rutinSumber = aturan.rutinManual ? 'manual' : rutinOtomatis ? 'otomatis' : null

  // ---------- kas bebas ----------
  const danaTerikat = (d.kegiatan || [])
    .filter((x) => x.jenis === 'kegiatan' && x.sisa > 0 && !kegiatanLewat(x.biaya, hariIni))
    .map((x) => ({ nama: x.nama, sisa: x.sisa, kunci: x.kunci }))
  const totalTerikat = danaTerikat.reduce((s, x) => s + x.sisa, 0)
  const kasBebas = (Number(d.saldoKini) || 0) - totalTerikat
  const bulanCukup = rutin ? kasBebas / rutin : null

  // 1. cadangan kas bebas
  if (!d.adaSaldoAwal) k.cad = { status: 'kosong', nilai: '—', ket: 'Saldo awal kas belum diisi di menu Kas sekolah.' }
  else if (!rutin) k.cad = { status: 'kosong', nilai: '—', ket: 'Belum ada catatan pengeluaran 3 bulan terakhir. Isi biaya rutin per bulan di Atur indikator.' }
  else {
    k.cad = {
      status: bulanCukup >= t.cad ? 'aman' : bulanCukup >= 1 ? 'pantau' : 'tindakan',
      nilai: `±${desimal(Math.max(0, bulanCukup))} bulan`,
      ket: `Target cukup ≥ ${t.cad} bulan biaya rutin (${rutinSumber === 'manual' ? 'diisi sendiri' : 'rata-rata 3 bulan'}).`,
    }
  }
  const rem = !!(d.adaSaldoAwal && rutin && bulanCukup < 1)

  // 2. arus kas — awal bulan (tgl < 10) memakai bulan lalu supaya adil
  const pakaiLalu = hariIni.getDate() < 10
  const bNilai = pakaiLalu ? geser(bulanIni, -1) : bulanIni
  const aNilai = arusMap.get(bNilai)
  const aSebelum = arusMap.get(geser(bNilai, -1))
  if (!d.adaSaldoAwal || !aNilai || (!aNilai.masuk && !aNilai.keluar)) k.arus = { status: 'kosong', nilai: '—', ket: 'Belum ada transaksi kas yang bisa dinilai.' }
  else {
    const selisih = aNilai.masuk - aNilai.keluar
    const minusLalu = aSebelum && aSebelum.masuk - aSebelum.keluar < 0
    k.arus = {
      status: selisih >= 0 ? 'aman' : minusLalu ? 'tindakan' : 'pantau',
      selisih, bulan: bNilai, minusLalu: !!minusLalu,
      ket: selisih >= 0
        ? `${pakaiLalu ? 'Bulan lalu' : 'Bulan ini'} tidak minus. Jadi merah kalau minus 2 bulan berturut-turut.`
        : minusLalu ? 'Minus 2 bulan berturut-turut — pengeluaran terus lebih besar dari pemasukan.'
          : `${pakaiLalu ? 'Bulan lalu' : 'Bulan ini'} minus. Wajar sesekali (mis. ada kegiatan), jadi perhatian kalau berlanjut.`,
    }
  }

  // 3. SPP bulan ini
  const nominal = Number(d.sppNominal) || 0
  // target per siswa: tarif kelasnya, 0 kalau bulan ini belum masuk / sudah keluar (0042)
  const tgt = (x) => targetSpp(x, d.kini, nominal)
  const sppTarget = (d.siswa || []).reduce((s, x) => s + tgt(x), 0)
  const sppMasuk = (d.siswa || []).reduce((s, x) => s + Math.min(tgt(x), x.spp?.[d.kini] || 0), 0)
  const sppPersen = sppTarget ? Math.round((sppMasuk / sppTarget) * 100) : 0
  const belumLunasSpp = (d.siswa || []).filter((x) => (x.spp?.[d.kini] || 0) < tgt(x)).length
  if (!sppTarget) k.spp = { status: 'kosong', nilai: '—', ket: 'Belum ada siswa / nominal SPP.' }
  else if (hariIni.getDate() < aturan.sppTanggal) {
    k.spp = { status: 'belum', nilai: `${sppPersen}% masuk`, ket: `Dinilai mulai tanggal ${aturan.sppTanggal}. Target ${t.spp}% per tanggal ${aturan.sppTanggal}.` }
  } else {
    k.spp = {
      status: sppPersen >= t.spp ? 'aman' : sppPersen >= t.spp - 20 ? 'pantau' : 'tindakan',
      nilai: `${sppPersen}% masuk`,
      ket: `Target ${t.spp}% per tanggal ${aturan.sppTanggal}${sppPersen < t.spp ? ` — ${belumLunasSpp} siswa belum lunas` : ''}.`,
    }
  }

  // 4. tunggakan (lewat jatuh tempo) dibanding SPP sebulan
  const st = d.status || []
  const tunggakan = st.reduce((s, x) => s + (x.tunggakan || 0), 0)
  const anakNunggak = st.filter((x) => x.status === 'nunggak').length
  const tunggPersen = sppTarget ? Math.round((tunggakan / sppTarget) * 100) : 0
  if (!sppTarget) k.tungg = { status: 'kosong', nilai: '—', ket: 'Belum ada siswa / nominal SPP.' }
  else {
    k.tungg = {
      status: tunggPersen <= t.tungg ? 'aman' : tunggPersen <= t.tungg * 2 ? 'pantau' : 'tindakan',
      nilai: tunggakan,
      ket: `${tunggPersen}% dari SPP sebulan · batas ${t.tungg}%.${anakNunggak ? ` ${anakNunggak} anak.` : ''}`,
    }
  }

  // 5. kegiatan nombok
  const nombok = (d.kegiatan || []).filter((x) => x.terpakai > 0 && x.sisa < 0)
  if (!(d.kegiatan || []).length) k.keg = { status: 'kosong', nilai: '—', ket: 'Belum ada kegiatan yang dipungut biayanya.' }
  else k.keg = {
    status: nombok.length ? 'pantau' : 'aman',
    nilai: nombok.length ? `${nombok.length} kegiatan` : 'Tidak ada',
    ket: nombok.length
      ? nombok.slice(0, 2).map((x) => `${x.nama} nombok`).join(', ') + (nombok.length > 2 ? ` +${nombok.length - 2} lagi` : '') + ' — ditutup kas sekolah.'
      : 'Semua kegiatan tertutup dari uang masuknya sendiri.',
  }

  // 6. kerapian nota
  const nTotal = d.nota?.total || 0
  const nAda = d.nota?.ada || 0
  const notaPersen = nTotal ? Math.round((nAda / nTotal) * 100) : 0
  if (!nTotal) k.nota = { status: 'belum', nilai: '—', ket: 'Belum ada pengeluaran bulan ini.' }
  else {
    k.nota = {
      status: notaPersen >= t.nota ? 'aman' : notaPersen >= t.nota - 20 ? 'pantau' : 'tindakan',
      nilai: `${notaPersen}% ada nota`,
      ket: `${nAda} dari ${nTotal} pengeluaran bulan ini ada fotonya · target ${t.nota}%.`,
    }
  }

  // 7. perkiraan 3 bulan
  const rasio = (() => {
    const bulanLalu = [1, 2, 3].map((x) => d.kini - x).filter((i) => i >= 0)
    if (!bulanLalu.length || !sppTarget) return null
    const masuk = bulanLalu.reduce((s, i) => s + (d.siswa || []).reduce((a, x) => a + Math.min(nominal, x.spp?.[i] || 0), 0), 0)
    return masuk / (sppTarget * bulanLalu.length)
  })()
  const rasioPakai = rasio ?? 0.85
  const proyeksi = []
  if (d.adaSaldoAwal && rutin) {
    let saldo = kasBebas
    for (let m = 1; m <= 3; m++) {
      const bln = geser(bulanIni, m)
      const nomorBulan = Number(bln.slice(5))
      const besar = aturan.terjadwal.filter((x) => x.bulan === nomorBulan)
      saldo += sppTarget * rasioPakai - rutin - besar.reduce((s, x) => s + x.nominal, 0)
      proyeksi.push({ bulan: bln, saldo: Math.round(saldo), besar })
    }
  }
  if (!proyeksi.length) k.proy = { status: 'kosong', nilai: '—', ket: 'Butuh saldo awal kas & biaya rutin.' }
  else {
    const terendah = proyeksi.reduce((a, b) => (b.saldo < a.saldo ? b : a))
    k.proy = {
      status: terendah.saldo >= rutin ? 'aman' : terendah.saldo >= 0 ? 'pantau' : 'tindakan',
      terendah,
      nilai: terendah.saldo >= 0 ? (terendah.saldo >= rutin ? 'Aman 3 bulan' : 'Mepet') : 'Diperkirakan minus',
      ket: `Perkiraan memakai SPP ${Math.round(rasioPakai * 100)}% tertagih${rasio == null ? ' (perkiraan awal)' : ' (rata-rata 3 bulan)'}, biaya rutin, dan pengeluaran besar terjadwal.`,
    }
  }

  // ---------- skor ----------
  let a = 0, b = 0
  KUNCI.forEach((x) => {
    if (!aturan.aktif[x]) { k[x] = { ...k[x], status: 'mati' }; return }
    if (NILAI[k[x].status] === undefined) return
    a += BOBOT[x] * NILAI[k[x].status]
    b += BOBOT[x]
  })
  // Tanpa saldo awal kas, 3 indikator terberat (cadangan, arus, perkiraan) tidak bisa
  // dinilai → jangan tampilkan "Sehat" hanya dari sisa indikator yang kecil.
  const skor = b && d.adaSaldoAwal ? Math.round((a / b) * 100) : null
  const zona = rem ? 'merah' : skor == null ? 'kosong' : skor >= 70 ? 'hijau' : skor >= 40 ? 'kuning' : 'merah'

  const kriteria = KUNCI.map((x) => ({ k: x, nama: NAMA[x], pengaruh: PENGARUH[x], ...k[x] }))
  const perlu = kriteria.filter((x) => x.status === 'pantau' || x.status === 'tindakan')

  // kalimat ringkas untuk kepala sekolah
  const kalimat = (() => {
    if (zona === 'kosong') return 'Data belum cukup untuk menilai. Isi saldo awal kas di menu Kas sekolah dulu.'
    const bag = []
    if (bulanCukup != null && d.adaSaldoAwal) bag.push(`Kas bebas cukup ±${desimal(Math.max(0, bulanCukup))} bulan`)
    if (k.arus.status !== 'kosong' && k.arus.status !== 'mati') bag.push(k.arus.selisih >= 0 ? 'bulan ini tidak minus' : 'bulan ini minus')
    let s = bag.length ? bag.join(' dan ') + '.' : ''
    const nama = perlu.slice(0, 2).map((x) => x.nama.replace(' bulan ini', '').replace(' bulanan', ''))
    s += nama.length ? ` Perlu dipantau: ${nama.join(' & ')}.` : ' Semua indikator aman.'
    return s.trim()
  })()

  return {
    aturan, skor, zona, rem, kriteria, perlu, kalimat,
    rutin, rutinOtomatis, rutinSumber, kasBebas, danaTerikat, totalTerikat, bulanCukup,
    sppMasuk, sppTarget, sppPersen, belumLunasSpp, tunggakan, tunggPersen, anakNunggak,
    nombok, notaPersen, nota: { ada: nAda, total: nTotal }, proyeksi, rasioTertagih: rasioPakai,
  }
}
