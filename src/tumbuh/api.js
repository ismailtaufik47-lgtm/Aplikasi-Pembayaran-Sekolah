// Lapisan data fitur tumbuh kembang (0052): guru kelas, pengaturan admin, portal ortu.
// Mode demo (tanpa .env): data contoh di memori, supaya layar bisa dicoba.
import { supabase, modeDemo } from '../lib/supabase.js'
import { penggunaSaya } from '../lib/api.js'

const BUCKET = 'tumbuh'
const BELUM_0052 = 'Fitur tumbuh kembang belum aktif di database. Jalankan 0052_tumbuh_kembang.sql di Supabase › SQL Editor.'

const BELUM_0055 = 'Ceklis periode sebelumnya belum aktif di database. Jalankan 0055_ceklis_periode_lalu.sql di Supabase › SQL Editor.'

async function rpc(nama, arg, belum = BELUM_0052) {
  const { data, error } = await supabase.rpc(nama, arg)
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new Error(belum)
    throw new Error(rapikanPesan(error.message))
  }
  return data
}
const rapikanPesan = (m) => (/permission denied/i.test(m) ? 'Akun ini tidak punya akses untuk ini.' : m)

/* ====================== foto ====================== */

/** Kecilkan foto ke JPG maks. 1280px (±150–250 KB). */
export async function siapkanFoto(file) {
  if (!/^image\//.test(file.type)) throw new Error('File harus berupa foto.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, gagal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => gagal(new Error('Foto tidak bisa dibaca.'))
      i.src = url
    })
    const skala = Math.min(1, 1280 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * skala))
    c.height = Math.max(1, Math.round(img.height * skala))
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    let hasil = c.toDataURL('image/jpeg', 0.7)
    if (hasil.length > 420000) hasil = c.toDataURL('image/jpeg', 0.55)
    if (hasil.length > 900000) throw new Error('Foto terlalu besar.')
    return hasil
  } finally {
    URL.revokeObjectURL(url)
  }
}

function dataUrlKeBlob(dataUrl) {
  const [kepala, isi] = String(dataUrl).split(',')
  const tipe = (kepala.match(/data:([^;]+)/) || [, 'image/jpeg'])[1]
  const biner = atob(isi)
  const buf = new Uint8Array(biner.length)
  for (let i = 0; i < biner.length; i++) buf[i] = biner.charCodeAt(i)
  return new Blob([buf], { type: tipe })
}

const fotoDemo = new Map()
/** Unggah foto (data URL) → alamat di Storage: <sekolah>/<acak>.jpg */
export async function unggahFoto(dataUrl, sekolahId) {
  const alamat = `${sekolahId}/${crypto.randomUUID()}.jpg`
  if (modeDemo) { fotoDemo.set(alamat, dataUrl); return alamat }
  const { error } = await supabase.storage.from(BUCKET).upload(alamat, dataUrlKeBlob(dataUrl), { contentType: 'image/jpeg', upsert: false })
  if (error) {
    const m = error.message || ''
    if (/bucket not found|not found/i.test(m)) throw new Error(BELUM_0052)
    if (/row-level security|unauthorized|403/i.test(m)) throw new Error('Akun ini tidak punya akses menyimpan foto.')
    throw new Error('Gagal mengunggah foto: ' + m)
  }
  return alamat
}
export function urlFoto(alamat) {
  if (!alamat) return null
  if (alamat.startsWith('data:')) return alamat
  if (modeDemo) return fotoDemo.get(alamat) || CONTOH_FOTO[alamat] || null
  return supabase.storage.from(BUCKET).getPublicUrl(alamat).data.publicUrl
}
export async function hapusFoto(alamat = []) {
  const daftar = alamat.filter(Boolean)
  if (!daftar.length) return
  if (modeDemo) { daftar.forEach((a) => fotoDemo.delete(a)); return }
  for (let i = 0; i < daftar.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(daftar.slice(i, i + 100)).catch(() => {})
  }
}

/* ====================== guru kelas ====================== */

/** 'guru' | 'baru' (belum terhubung sekolah) | 'staf' (kepala/admin) | 'nonaktif' */
export async function kelasStatus() {
  // mode demo: /kelas?layar=kode menampilkan layar "Gabung ke kelas" (hanya npm run dev)
  if (modeDemo) return import.meta.env.DEV && new URLSearchParams(window.location.search).get('layar') === 'kode' ? 'baru' : 'guru'
  await penggunaSaya() // sesi kedaluwarsa → keluar ke layar Masuk (bukan dikira akun baru)
  const { data, error } = await supabase.rpc('status_akun_saya')
  if (error) throw new Error(rapikanPesan(error.message))
  if (!data) return 'baru'
  if (data.aktif === false) return 'nonaktif'
  return data.peran === 'guru' ? 'guru' : 'staf'
}

export async function kelasAwal() {
  if (modeDemo) return demo().awal()
  return rpc('kelas_awal')
}
export async function kelasTulisan(sebelum) {
  if (modeDemo) return demo().tulisan()
  return rpc('kelas_tulisan', { p_sebelum: sebelum || null })
}
export async function kelasPeriodeBuka(fokus, tema) {
  if (modeDemo) return demo().buka(fokus)
  return rpc('kelas_periode_buka', { p_fokus: fokus || null, p_tema: tema || null })
}
/** Periode yang sudah lewat di tahun ajaran ini, terbaru dulu (0055). */
export async function kelasDaftarPeriode() {
  if (modeDemo) return demo().daftarPeriode()
  return rpc('kelas_daftar_periode', undefined, BELUM_0055)
}
/** Buka / buat ceklis periode lalu (tanggal mulai); dengan fokus = simpan indikator yang dinilai. */
export async function kelasPeriodeLaluBuka(mulai, fokus) {
  if (modeDemo) return demo().bukaLalu(mulai, fokus)
  return rpc('kelas_periode_lalu_buka', { p_tgl: mulai, p_fokus: fokus || null }, BELUM_0055)
}
export async function kelasCeklis(periodeId) {
  if (modeDemo) return demo().ceklis(periodeId)
  return rpc('kelas_ceklis', { p_periode: periodeId })
}
/** nilai = [{ s: siswaId, n: 1..4 }] */
export async function kelasNilaiSimpan(periodeId, indikatorId, nilai) {
  if (modeDemo) return demo().simpanNilai(indikatorId, nilai, periodeId)
  return rpc('kelas_nilai_simpan', { p_periode: periodeId, p_indikator: indikatorId, p_nilai: nilai })
}
export async function kelasPeriodeTerbit(periodeId, terbit = true) {
  if (modeDemo) return demo().terbit(terbit, periodeId)
  return rpc('kelas_periode_terbit', { p_periode: periodeId, p_terbit: terbit })
}
export async function kelasCatatanSimpan({ id = null, siswaId, teks, aspekId = null, foto = [], terbit }) {
  if (modeDemo) return demo().simpanTulisan({ jenis: 'catatan', id, siswaId, teks, aspekId, foto, terbit })
  return rpc('kelas_catatan_simpan', { p_id: id, p_siswa: siswaId, p_teks: teks, p_aspek: aspekId, p_foto: foto, p_terbit: !!terbit })
}
export async function kelasKabarSimpan({ id = null, teks, foto = [], terbit }) {
  if (modeDemo) return demo().simpanTulisan({ jenis: 'kabar', id, teks, foto, terbit })
  return rpc('kelas_kabar_simpan', { p_id: id, p_teks: teks, p_foto: foto, p_terbit: !!terbit })
}
export async function kelasTulisanHapus(jenis, id) {
  const foto = modeDemo ? demo().hapusTulisan(jenis, id) : await rpc('kelas_tulisan_hapus', { p_jenis: jenis, p_id: id })
  await hapusFoto(foto || [])
}

/* ====================== admin / kepala ====================== */

export async function aturAmbil() {
  if (modeDemo) return demo().atur()
  return rpc('tumbuh_atur_ambil')
}
export async function aturSimpan({ skala = null, periode = null, foto = null }) {
  if (modeDemo) return demo().aturSimpan({ skala, periode, foto })
  return rpc('tumbuh_atur_simpan', { p_skala: skala, p_periode: periode, p_foto: foto })
}
export async function pakaiDasar(dasar) {
  if (modeDemo) return demo().pakaiDasar(dasar)
  return rpc('tumbuh_pakai_dasar', { p_dasar: dasar })
}
export async function aspekSimpan({ id = null, nama, pendek }) {
  if (modeDemo) return demo().aspekSimpan({ id, nama, pendek })
  return rpc('tumbuh_aspek_simpan', { p_id: id, p_nama: nama, p_pendek: pendek || null })
}
export async function aspekHapus(id) {
  if (modeDemo) return demo().aspekHapus(id)
  return rpc('tumbuh_aspek_hapus', { p_id: id })
}
export async function indikatorSimpan({ id = null, aspekId, nama, khas = false, keterangan = null }) {
  if (modeDemo) return demo().indikatorSimpan({ id, aspekId, nama, khas })
  return rpc('tumbuh_indikator_simpan', { p_id: id, p_aspek: aspekId, p_nama: nama, p_khas: khas, p_keterangan: keterangan })
}
export async function indikatorHapus(id) {
  if (modeDemo) return demo().indikatorHapus(id)
  return rpc('tumbuh_indikator_hapus', { p_id: id })
}
export async function kodeGuru(kelas) {
  if (modeDemo) return { kode: 'GR' + Math.random().toString(36).slice(2, 6).toUpperCase(), peran: 'guru', kelas }
  return rpc('buat_kode_aktivasi', { p_peran: 'guru', p_kelas: kelas })
}
export async function guruPindah(profilId, kelas) {
  if (modeDemo) return null
  return rpc('tumbuh_guru_pindah', { p_profil: profilId, p_kelas: kelas })
}
export async function fotoLamaBersihkan() {
  const alamat = modeDemo ? [] : await rpc('tumbuh_foto_lama_bersihkan')
  await hapusFoto(alamat || [])
  return (alamat || []).length
}

/* ====================== portal orang tua ====================== */

/** → { atur, aspek, anak: [{ siswaId, kelas, guru, periode, catatan, kabar }] } atau null kalau belum ada. */
export async function portalTumbuh(token, nis, anakDemo = []) {
  if (modeDemo) return demo().portal(anakDemo)
  const { data, error } = await supabase.rpc('portal_tumbuh', { p_token: token, p_nis: nis })
  if (error || data?.gerbang) return null // portal tetap jalan tanpa tab Tumbuh
  return data
}

/* ====================== data demo ====================== */

const svgFoto = (warnaLangit, isi) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="${warnaLangit}"/>${isi}</svg>`)
const CONTOH_FOTO = {
  'demo/tanam.jpg': svgFoto('#D3EDFF', '<rect y="120" width="320" height="80" fill="#E9C79B"/>' +
    [40, 104, 168, 232].map((x, i) => `<path d="M${x} 92h48l-6 52h-36z" fill="#fff"/><path d="M${x + 24} 104v-${22 + i * 6}" stroke="#3FAE5C" stroke-width="4"/><ellipse cx="${x + 15}" cy="${86 - i * 6}" rx="10" ry="5.5" fill="#5CCB72"/><ellipse cx="${x + 33}" cy="${82 - i * 6}" rx="10" ry="5.5" fill="#46B862"/>`).join('') +
    '<circle cx="286" cy="34" r="16" fill="#FFD35C"/>'),
  'demo/gambar.jpg': svgFoto('#FFF4D6', '<rect y="138" width="320" height="62" fill="#F2C98A"/><rect x="40" y="60" width="120" height="86" rx="6" fill="#fff"/><circle cx="86" cy="92" r="16" fill="#FFD35C"/><path d="M60 132L92 104L118 126L132 112L150 132z" fill="#7BD389"/><rect x="170" y="70" width="110" height="80" rx="6" fill="#fff"/><path d="M190 132c14-30 28-30 40 0M236 132c10-22 20-22 30 0" stroke="#F06A9B" stroke-width="6" fill="none"/>'),
}

let _demo = null
function demo() {
  if (_demo) return _demo
  const idAcak = () => Math.random().toString(36).slice(2, 10)
  const NAMA = ['Aisyah Nur Fadilah', 'Muhammad Zidan', 'Khansa Aulia', 'Raffasya Putra', 'Qaisha Putri Maheswari', 'Arkan Hafidz',
    'Naura Azzahra', 'Daffa Alfarizi', 'Kirana Salsabila', 'Fathan Mubarak', 'Alesha Humaira', 'Gibran Ramadhan',
    'Shanum Larasati', 'Rayyan Al Fatih', 'Hana Mutiara', 'Bima Satria', 'Zahra Kamila', 'Elvano Pratama']
  const siswa = NAMA.map((nama, i) => ({ id: 'd' + i, nama, panggilan: nama.split(' ')[0], jenis: i % 2 ? 'L' : 'P', avatar: i % 6 }))
  const TEMPLATE = {
    merdeka: [
      ['Nilai Agama & Budi Pekerti', 'Agama & budi pekerti', ['Berdoa sebelum & sesudah kegiatan', 'Mengucap salam, maaf & terima kasih', 'Menyayangi teman & makhluk ciptaan Tuhan']],
      ['Jati Diri', 'Jati diri', ['Mau berbagi & bergantian', 'Mandiri ke toilet & merapikan barang', 'Mengenali & mengungkapkan perasaan']],
      ['Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa & Seni', 'Literasi, numerasi & seni', ['Mengenal huruf & bunyinya', 'Membilang benda 1–20', 'Menggambar lalu menceritakannya']],
    ],
    stppa: [
      ['Nilai Agama & Moral', 'Agama & moral', ['Berdoa sebelum & sesudah kegiatan', 'Berperilaku jujur & sopan']],
      ['Fisik-Motorik', 'Fisik-motorik', ['Melompat & menjaga keseimbangan', 'Menggunting & meronce']],
      ['Kognitif', 'Kognitif', ['Mengelompokkan benda menurut warna & bentuk', 'Membilang benda 1–20']],
      ['Bahasa', 'Bahasa', ['Menceritakan pengalaman', 'Mengenal huruf & bunyinya']],
      ['Sosial-Emosional', 'Sosial-emosional', ['Mau berbagi & bergantian', 'Mengenali & mengungkapkan perasaan']],
      ['Seni', 'Seni', ['Menyanyi & bergerak mengikuti irama', 'Menggambar lalu menceritakannya']],
    ],
    sendiri: [],
  }
  const s = {
    atur: { dasar: 'merdeka', skala: 'bmbsh', periode: 'bulan', foto: true },
    aspek: [],
    periode: [], // { id, label, pendek, fokus, terbit, nilai: {siswa: {ind: n}} }
    tulisan: [],
    lama: [], // indikator yang diarsipkan saat dasar penilaian diganti (seperti 0052/0054)
  }
  const isi = (dasar) => {
    s.aspek = TEMPLATE[dasar].map(([nama, pendek, ind], i) => ({
      id: 'a' + idAcak(), nama, pendek, urutan: i + 1,
      indikator: ind.map((n, j) => ({ id: 'i' + idAcak(), nama: n, keterangan: null, khas: false, urutan: j + 1, dipakai: false })),
    }))
  }
  isi('merdeka')
  s.aspek[0].indikator.push({ id: 'i' + idAcak(), nama: 'Hafalan surat pendek', keterangan: null, khas: true, urutan: 4, dipakai: false })
  const semuaInd = () => s.aspek.flatMap((a) => a.indikator)
  // riwayat Jul–Sep (terbit) + Okt (sedang diisi): nilai naik pelan-pelan
  const bulan = [['Juli 2026', 'Jul'], ['Agustus 2026', 'Agu'], ['September 2026', 'Sep'], ['Oktober 2026', 'Okt']]
  bulan.forEach(([label, pendek], b) => {
    const p = { id: 'p' + b, label, pendek, fokus: semuaInd().slice(0, 9).map((x) => x.id), terbit: b < 3 ? `2026-0${7 + b}-28T10:00:00` : null, nilai: {}, mulai: `2026-${String(7 + b).padStart(2, '0')}-01` }
    siswa.forEach((x, i) => {
      if (b === 3 && i >= 12) return // Oktober: 12 dari 18 sudah dinilai
      p.nilai[x.id] = {}
      p.fokus.forEach((ind, k) => { p.nilai[x.id][ind] = Math.min(4, 1 + Math.floor((b + ((i * 7 + k * 3) % 5)) / 2)) })
    })
    s.periode.push(p)
  })
  s.periode.slice(0, 3).forEach((p) => p.fokus.forEach((i) => { const ind = semuaInd().find((x) => x.id === i); if (ind) ind.dipakai = true }))
  const kini = () => s.periode[s.periode.length - 1]
  s.tulisan = [
    { jenis: 'kabar', id: 'k1', teks: 'Hari ini anak-anak menanam kacang hijau di gelas plastik 🌱 Mohon bantu ingatkan ananda menyiram setiap pagi di rumah ya, Ayah/Bunda.', foto: ['demo/tanam.jpg', 'demo/gambar.jpg'], terbit: new Date().toISOString(), penulis: 'Bu Sari', waktu: new Date().toISOString() },
    { jenis: 'catatan', id: 'c1', siswaId: 'd0', aspekId: s.aspek[1].id, teks: 'Hari ini Aisyah berani maju bercerita tentang kacang hijau yang ia tanam. Suaranya jelas dan teman-temannya bertepuk tangan. 👏', foto: [], terbit: new Date(Date.now() - 864e5).toISOString(), penulis: 'Bu Sari', waktu: new Date(Date.now() - 864e5).toISOString() },
    { jenis: 'catatan', id: 'c2', siswaId: 'd13', aspekId: s.aspek[1].id, teks: 'Rayyan mulai mau berbagi mainan balok dengan temannya.', foto: [], terbit: null, penulis: 'Bu Sari', waktu: new Date(Date.now() - 864e5).toISOString() },
  ]
  const akhirBulan = (mulai) => { const d = new Date(`${mulai}T00:00:00`); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('sv-SE') }
  const periodeJson = (p) => p && ({
    id: p.id, jenis: 'bulan', label: p.label, pendek: p.pendek, mulai: p.mulai, selesai: akhirBulan(p.mulai), fokus: p.fokus, terbit: p.terbit,
    dinilai: siswa.filter((x) => p.fokus.length && p.fokus.every((f) => p.nilai[x.id]?.[f])).length, anak: siswa.length,
  })
  const cariPeriode = (id) => s.periode.find((p) => p.id === id) || kini()
  const salin = (o) => JSON.parse(JSON.stringify(o))

  _demo = {
    awal: () => salin({
      guru: { id: 'g1', nama: 'Bu Sari', avatar: 3, pinAktif: false }, sekolah: { id: 'demo', nama: 'TK Tunas Ceria' }, kelas: 'B',
      atur: s.atur, aspek: s.aspek, siswa, periode: s.atur.skala === 'tanpa' ? null : periodeJson(kini()), tulisan: [...s.tulisan].sort((a, b) => (a.waktu < b.waktu ? 1 : -1)),
    }),
    tulisan: () => salin([...s.tulisan].sort((a, b) => (a.waktu < b.waktu ? 1 : -1))),
    buka: (fokus) => { if (fokus) kini().fokus = fokus; return periodeJson(kini()) },
    // periode sebelum periode berjalan (demo: Jul–Sep), terbaru dulu
    daftarPeriode: () => salin(s.periode.slice(0, -1).reverse().map((p) => ({
      ...periodeJson(p), kode: p.mulai.slice(0, 7), terisi: Object.values(p.nilai).reduce((n, m) => n + Object.keys(m).length, 0),
    }))),
    bukaLalu: (mulai, fokus) => {
      const p = s.periode.find((x) => x.mulai === mulai)
      if (!p || p === kini()) throw new Error('Periode ini belum lewat. Pakai ceklis periode berjalan.')
      if (fokus) p.fokus = fokus
      const i = s.periode.indexOf(p)
      const saran = (s.periode[i - 1] || s.periode[i + 1])?.fokus.filter((id) => semuaInd().some((x) => x.id === id)) || []
      return salin({ ...periodeJson(p), kode: p.mulai.slice(0, 7), saran })
    },
    ceklis: (id) => {
      const p = cariPeriode(id); const sebelum = s.periode[s.periode.indexOf(p) - 1]
      const nilai = []; const awal = []
      Object.entries(p.nilai).forEach(([sid, m]) => Object.entries(m).forEach(([i, n]) => nilai.push({ s: sid, i, n })))
      Object.entries(sebelum?.nilai || {}).forEach(([sid, m]) => Object.entries(m).forEach(([i, n]) => p.fokus.includes(i) && awal.push({ s: sid, i, n })))
      const lama = s.lama.filter((x) => p.fokus.includes(x.id) || nilai.some((v) => v.i === x.id))
      return salin({ periode: periodeJson(p), nilai, awal, lama })
    },
    simpanNilai: (ind, daftar, id) => {
      if (s.lama.some((x) => x.id === ind)) throw new Error('Indikator ini sudah diganti sekolah. Nilainya hanya bisa dilihat.')
      const p = cariPeriode(id); daftar.forEach(({ s: sid, n }) => { p.nilai[sid] = { ...(p.nilai[sid] || {}), [ind]: n } })
      return { ...periodeJson(p), tersimpan: daftar.length }
    },
    terbit: (t, id) => { const p = cariPeriode(id); p.terbit = t ? new Date().toISOString() : null; return periodeJson(p) },
    simpanTulisan: (t) => {
      const ada = t.id && s.tulisan.find((x) => x.id === t.id)
      const baru = { ...(ada || {}), ...t, id: t.id || 't' + idAcak(), penulis: 'Bu Sari', waktu: new Date().toISOString(),
        terbit: t.terbit ? (ada?.terbit || new Date().toISOString()) : null }
      s.tulisan = [baru, ...s.tulisan.filter((x) => x.id !== baru.id)]
      return baru.id
    },
    hapusTulisan: (jenis, id) => { const t = s.tulisan.find((x) => x.id === id); s.tulisan = s.tulisan.filter((x) => x.id !== id); return t?.foto || [] },
    atur: () => salin({
      bolehUbah: true, atur: s.atur, aspek: s.aspek,
      kelas: [
        { kelas: 'A', jumlah: 20, guru: [{ id: 'g0', nama: 'Bu Rina', avatar: 1, aktif: true }], kode: null },
        { kelas: 'B', jumlah: 18, guru: [{ id: 'g1', nama: 'Bu Sari', avatar: 3, aktif: true }], kode: null },
        { kelas: 'C', jumlah: 16, guru: [], kode: null },
      ],
      foto: { jumlah: 572, byte: 86 * 1048576 }, fotoLama: 0,
    }),
    aturSimpan: (u) => { Object.entries(u).forEach(([k, v]) => { if (v != null) s.atur[k] = v }); return salin(s.atur) },
    pakaiDasar: (d) => {
      // indikator yang pernah dinilai diarsipkan (nilainya tetap), fokus periode yang belum terbit dikosongkan
      const dinilai = new Set(s.periode.flatMap((p) => Object.values(p.nilai).flatMap((m) => Object.keys(m))))
      s.aspek.forEach((a) => a.indikator.forEach((x) => {
        if (dinilai.has(x.id)) s.lama.push({ id: x.id, nama: x.nama, keterangan: x.keterangan, khas: x.khas, aspek: { id: a.id, nama: a.nama, pendek: a.pendek } })
      }))
      isi(d); s.atur.dasar = d
      if (!kini().terbit) kini().fokus = []
      return salin(s.aspek)
    },
    aspekSimpan: ({ id, nama, pendek }) => {
      if (id) { const a = s.aspek.find((x) => x.id === id); Object.assign(a, { nama, pendek: pendek || nama.slice(0, 40) }); return id }
      if (s.aspek.length >= 6) throw new Error('Maksimal 6 aspek supaya grafik untuk orang tua tetap mudah dibaca.')
      const a = { id: 'a' + idAcak(), nama, pendek: pendek || nama.slice(0, 40), urutan: s.aspek.length + 1, indikator: [] }
      s.aspek.push(a); return a.id
    },
    aspekHapus: (id) => { s.aspek = s.aspek.filter((a) => a.id !== id) },
    indikatorSimpan: ({ id, aspekId, nama, khas }) => {
      if (id) { const x = semuaInd().find((i) => i.id === id); Object.assign(x, { nama, khas }); return id }
      const a = s.aspek.find((x) => x.id === aspekId); const x = { id: 'i' + idAcak(), nama, khas, keterangan: null, urutan: a.indikator.length + 1, dipakai: false }
      a.indikator.push(x); return x.id
    },
    indikatorHapus: (id) => { s.aspek.forEach((a) => { a.indikator = a.indikator.filter((x) => x.id !== id) }) },
    portal: (anakDemo) => salin({
      atur: s.atur,
      // aspek aktif + aspek lama yang punya nilai (grafik lama tidak hilang)
      aspek: [...s.aspek, ...Object.values(s.lama.reduce((m, x) => {
        (m[x.aspek.id] = m[x.aspek.id] || { ...x.aspek, arsip: true, indikator: [] }).indikator.push({ id: x.id, nama: x.nama, khas: x.khas, arsip: true })
        return m
      }, {}))],
      anak: anakDemo.map((a, k) => ({
        siswaId: a.id, kelas: a.kelas, guru: 'Bu Sari',
        periode: s.periode.filter((p) => p.terbit || p === kini()).map((p) => ({ id: p.id, label: p.label, pendek: p.pendek, mulai: p.mulai, nilai: p.nilai[siswa[k % siswa.length].id] || {} }))
          .filter((p) => Object.keys(p.nilai).length),
        catatan: k === 0 ? s.tulisan.filter((t) => t.jenis === 'catatan' && t.terbit && t.siswaId === 'd0').map((t) => ({ ...t, avatar: 3 })) : [],
        kabar: s.tulisan.filter((t) => t.jenis === 'kabar' && t.terbit),
      })),
    }),
  }
  // uji tampilan (hanya npm run dev): /kelas?uji=ganti-dasar → ceklis bulan ini sudah terbit,
  // lalu sekolah mengganti dasar penilaian ke STPPA
  const uji = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('uji') : null
  if (uji === 'ganti-dasar') {
    kini().terbit = new Date().toISOString()
    _demo.pakaiDasar('stppa')
  }
  // /ortu/demo?uji=dasar-bolak → Merdeka (Jul–Okt) → STPPA (2 kemampuan dinilai Okt) → Merdeka lagi
  // /ortu/demo?uji=dasar-stppa → Merdeka (Jul–Okt) → STPPA (2 kemampuan dinilai Okt), tetap STPPA
  if (uji === 'dasar-bolak' || uji === 'dasar-stppa') {
    kini().terbit = new Date().toISOString()
    _demo.pakaiDasar('stppa')
    const stppa = [s.aspek[1].indikator[0].id, s.aspek[2].indikator[0].id]
    siswa.forEach((x) => stppa.forEach((id, k) => { (kini().nilai[x.id] = kini().nilai[x.id] || {})[id] = 2 + k }))
    if (uji === 'dasar-bolak') _demo.pakaiDasar('merdeka')
  }
  // /kelas?uji=ceklis-lalu → September belum diisi, Agustus masih draf (12 dari 18 anak)
  if (uji === 'ceklis-lalu') {
    Object.assign(s.periode[2], { fokus: [], nilai: {}, terbit: null })
    s.periode[1].terbit = null
    siswa.slice(12).forEach((x) => { delete s.periode[1].nilai[x.id] })
  }
  return _demo
}
