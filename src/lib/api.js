/**
 * Lapisan akses data — satu-satunya tempat yang tahu soal Supabase.
 *
 * Dua jalur baca:
 *   • Guru : login lewat Supabase Auth, membaca tabel langsung. RLS
 *            memastikan yang terbaca hanya sekolahnya sendiri.
 *   • Ortu : tanpa login, memanggil RPC portal_wali(token). Fungsi itu
 *            security definer, jadi anon key tidak pernah menyentuh tabel.
 *
 * Kalau VITE_SUPABASE_URL kosong, semua fungsi di sini memakai data contoh
 * dari lib/mock.js supaya aplikasi tetap bisa dijalankan tanpa database.
 */
import { supabase, modeDemo } from './supabase.js'
import * as mock from './mock.js'
import { sudahNonaktif, tahunAjaranBerjalan, tanggalKeTimestamp, waktuTampil } from './format.js'
import { itemTunggakan, tunggakanNonaktifDemo } from './tunggakanLama.js'
import { lengkapiAkses } from './akses.js'
import * as kas from './kas.js'
import { ambilSemua } from './ambilSemua.js'
import { bentuk, bentukPaket, bentukSiswaLain, infoKegiatan, kolomInfo } from './bentukData.js'
import { daftarTahunDemo, laporanTahunanDemo } from './laporanTahunan.js'

export { modeDemo }

/* pembentuk bentuk data UI → lib/bentukData.js */

/* ===================== baca ===================== */

/** Dipakai panel guru. Membutuhkan sesi login yang aktif. */
export async function muatDataGuru() {
  // Mode demo: peran bawaan 'admin' (Admin/TU). Untuk mencoba tampilan
  // kepala sekolah, jalankan di konsol browser:
  //   localStorage.setItem('tk_demo_peran', 'kepala'); location.reload()
  //   localStorage.setItem('tk_demo_habis', '1')  → coba tampilan sewa habis (transaksi terkunci)
  if (modeDemo) {
    const peran = demoPeran()
    if (localStorageAman('tk_demo_nonaktif') === '1') throw new Error(pesanNonaktif({ sekolah: 'TK Tunas Ceria', oleh: 'Bu Kepsek' }))
    const d = bentuk(mock.bentukDemo())
    if (demoHabis()) d.pengaturan = { ...d.pengaturan, trialMulai: '2025-01-01', langgananSampai: '2025-02-01' }
    d.pengaturan = { ...d.pengaturan, infoTa: { ta: tahunAjaranBerjalan(), kenaikanSudah: true, taDepan: d.pengaturan.taDepan, kenaikanDepanSudah: false } }
    return {
      ...d,
      siswaLain: mock.siswaNonaktif.map(bentukSiswaLain),
      petugas: peran === 'kepala' ? 'Bu Kepsek' : 'Bu Rina',
      peran,
      akses: lengkapiAkses(peran, null),
      pinAktif: false,
      avatarSaya: null,
    }
  }

  const { data: pengguna } = await supabase.auth.getUser()
  const { data: profil, error: eProfil } = await supabase
    .from('profil')
    .select('nama, peran, pin_aktif, avatar, sekolah:sekolah_id (*)')
    .eq('id', pengguna.user.id)
    .single()

  if (eProfil) throw new Error('Akun ini belum terhubung ke sekolah mana pun')
  // Akun dinonaktifkan kepala sekolah (0032): baris profil masih terbaca,
  // tapi data sekolahnya tidak (RLS) → tampilkan layar "akun dinonaktifkan".
  if (!profil.sekolah) {
    const { data: st } = await supabase.rpc('status_akun_saya')
    if (st && st.aktif === false) throw new Error(pesanNonaktif(st))
    throw new Error('Data sekolah tidak bisa dimuat. Coba lagi beberapa saat.')
  }

  const sekolahId = profil.sekolah.id
  // 0042: buka tahun ajaran baru kalau hari ini sudah lewat 1 Juli (sekali per tahun, otomatis).
  // Database sebelum 0042 → fungsinya belum ada, aplikasi tetap jalan seperti dulu.
  const infoTa = await supabase.rpc('siapkan_tahun_ajaran').then((r) => (r.error ? null : r.data), () => null)
  const [siswa, biaya, pembayaran, logo, hak, paket, paketSiswa, siswaTahun, tahunAjaran] = await Promise.all([
    ambilSemua(() => supabase.from('siswa').select('*', { count: 'exact' }).eq('sekolah_id', sekolahId).eq('aktif', true).order('nama').order('id')),
    supabase.from('biaya').select('*').eq('sekolah_id', sekolahId).eq('aktif', true).order('urutan'),
    // > 1.000 baris (batas Supabase) → ditarik bertahap, lihat lib/ambilSemua.js
    // 0044: hanya tahun ajaran berjalan + yang terkait tunggakan (lihat muatPembayaran)
    muatPembayaran(sekolahId, !!infoTa),
    // Logo sekolah (Profil sekolah → Logo). Kalau gagal/belum ada, aplikasi tetap jalan pakai ikon 🏫.
    supabase.from('sekolah_ttd').select('logo').eq('sekolah_id', sekolahId).maybeSingle().then((r) => (r.error ? null : r.data?.logo || null), () => null),
    // Hak akses per fitur (0029). Kalau fungsinya belum ada → pakai standar peran.
    supabase.rpc('hak_akses_saya').then((r) => (r.error ? null : r.data), () => null),
    // Paket PMB & daftar ulang (0033). Kalau tabelnya belum ada → aplikasi tetap jalan tanpa paket.
    supabase.from('paket_biaya').select('*').eq('sekolah_id', sekolahId).eq('aktif', true).then((r) => (r.error ? [] : r.data), () => []),
    ambilSemua(() => supabase.from('paket_siswa').select('paket_id, siswa_id', { count: 'exact' }).eq('sekolah_id', sekolahId).order('paket_id').order('siswa_id'))
      .then((r) => (r.error ? [] : r.data), () => []),
    // Keanggotaan siswa per tahun ajaran & tarif SPP (0042). null = belum dipasang.
    infoTa
      ? ambilSemua(() => supabase.from('siswa_tahun').select('*', { count: 'exact' }).eq('sekolah_id', sekolahId).order('siswa_id').order('tahun_ajaran'))
          .then((r) => (r.error ? null : r.data), () => null)
      : null,
    infoTa ? supabase.from('tahun_ajaran').select('*').eq('sekolah_id', sekolahId).then((r) => (r.error ? [] : r.data), () => []) : [],
  ])

  const gagal = [siswa, biaya, pembayaran].find((r) => r.error)
  if (gagal) throw new Error(gagal.error.message)
  // nama siswa lulus / keluar yang pembayarannya ikut termuat (mis. melunasi tunggakan tahun ini)
  const siswaLain = await muatSiswaLain(pembayaran.data, siswa.data)

  const hasil = bentuk({
      sekolah: profil.sekolah,
      biaya: biaya.data,
      siswa: siswa.data,
      pembayaran: pembayaran.data,
      paket,
      paketSiswa,
      siswaTahun,
      tahunAjaran,
      ringkasLalu: pembayaran.ringkasLalu,
    })
  return {
    ...hasil,
    siswaLain,
    pengaturan: { ...hasil.pengaturan, logo, infoTa, ringan: !!pembayaran.ringkasLalu },
    petugas: profil.nama,
    peran: profil.peran,
    akses: lengkapiAkses(profil.peran, hak?.akses || null),
    pinAktif: profil.pin_aktif,
    avatarSaya: Number.isInteger(profil.avatar) ? profil.avatar : null,
  }
}

/**
 * Pembayaran yang ditarik saat aplikasi dibuka.
 * 0044: pembayaran_dimuat() = tahun ajaran berjalan + pembayaran milik tagihan lama yang belum
 * lunas, ditambah ringkasan_tunggakan_lalu() (bulan/kegiatan lama yang masih kurang). Data tahun
 * lama yang sudah beres tidak ikut → aplikasi tetap ringan dari tahun ke tahun.
 * Database sebelum 0044 → semua pembayaran ditarik seperti dulu.
 */
async function muatPembayaran(sekolahId, ada42) {
  if (ada42) {
    const [r, ring] = await Promise.all([
      ambilSemua(() => supabase.rpc('pembayaran_dimuat', {}, { count: 'exact' }).order('dibayar_pada', { ascending: false }).order('id')),
      supabase.rpc('ringkasan_tunggakan_lalu').then((x) => x, (e) => ({ error: e })),
    ])
    if (!r.error && !ring.error && ring.data) return { ...r, ringkasLalu: ring.data }
  }
  const r = await ambilSemua(() => supabase.from('pembayaran').select('*', { count: 'exact' }).eq('sekolah_id', sekolahId)
    .order('dibayar_pada', { ascending: false }).order('id'))
  return { ...r, ringkasLalu: null }
}

const KOLOM_SISWA_LAIN = 'id, nama, panggilan, kelas, nis, jenis_kelamin, avatar, foto, status_siswa, tahun_lulus, wali, hp'
async function muatSiswaLain(bayar, siswa) {
  const ada = new Set((siswa || []).map((s) => s.id))
  const ids = [...new Set((bayar || []).map((p) => p.siswa_id).filter((id) => !ada.has(id)))]
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('siswa').select(KOLOM_SISWA_LAIN).in('id', ids.slice(i, i + 100)).then((r) => r, () => ({ data: null }))
    out.push(...(data || []).map(bentukSiswaLain))
  }
  return out
}

/* ===================== portal orang tua (tautan + NIS) ===================== */

/** Pesan untuk layar gerbang NIS; `e.gerbang` = { galat, sisa, menit }. */
function galatGerbang(g) {
  const pesan =
    g.galat === 'terkunci' ? `Terlalu banyak percobaan. Coba lagi dalam ${g.menit || 15} menit.`
    : g.galat === 'nis_salah' ? `NIS tidak cocok dengan data ananda.${g.sisa ? ` Sisa ${g.sisa} kali percobaan.` : ''}`
    : 'Masukkan NIS ananda untuk membuka portal.'
  const e = new Error(pesan)
  e.gerbang = g
  return e
}

/** Normalisasi NIS: tanpa spasi/tanda baca, huruf kecil — sama dengan nis_rapi() di database. */
export const nisRapi = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Mode demo: meniru batas 5 kali salah di database.
const demoGerbang = { gagal: 0, kunciSampai: 0 }
function cekNisDemo(anak, nis) {
  if (!nisRapi(nis)) return { galat: 'perlu_nis' }
  if (demoGerbang.kunciSampai > Date.now()) return { galat: 'terkunci', menit: Math.ceil((demoGerbang.kunciSampai - Date.now()) / 60000) }
  if (anak.some((s) => nisRapi(s.nis) === nisRapi(nis))) { demoGerbang.gagal = 0; return null }
  demoGerbang.gagal += 1
  if (demoGerbang.gagal >= 5) {
    demoGerbang.gagal = 0
    demoGerbang.kunciSampai = Date.now() + 15 * 60000
    return { galat: 'terkunci', menit: 15 }
  }
  return { galat: 'nis_salah', sisa: 5 - demoGerbang.gagal }
}

/** Identitas sekolah untuk layar "Masukkan NIS" — tanpa data anak. */
export async function portalGerbang(token) {
  if (modeDemo) return { sekolah: 'TK Tunas Ceria', wa: '6281234567890', logo: null, aktif: true, demo: true }
  if (!token) throw new Error('Tautan portal tidak lengkap. Minta tautan baru ke pihak sekolah.')
  return panggil('portal_gerbang', { p_token: token })
}

/** Dipakai portal orang tua. Tanpa login: token dari URL + NIS salah satu anak. */
export async function muatDataPortal(token, nis) {
  if (modeDemo) {
    const d = demoDenganNonaktif()
    // anak yang sudah lulus / keluar hanya tampil selama masih menunggak (0044)
    const anak = d.siswa.filter((s) => mock.waliDemo.anak.includes(s.id) && (!sudahNonaktif(s) || itemTunggakan(s, d.biaya, d.pengaturan).length))
    const g = cekNisDemo(anak, nis)
    if (g) throw galatGerbang(g)
    const id = new Set(anak.map((s) => s.id))
    const paket = d.paket.filter((p) => p.siswaIds.some((x) => id.has(x))).map((p) => ({ ...p, siswaIds: p.siswaIds.filter((x) => id.has(x)) }))
    return { ...d, siswa: anak, paket, pembayaran: d.pembayaran.filter((p) => id.has(p.siswaId)), wali: { nama: mock.waliDemo.nama, anak: anak.map((s) => s.id) } }
  }

  if (!token) throw new Error('Tautan portal tidak lengkap. Minta tautan baru ke pihak sekolah.')
  if (!nisRapi(nis)) throw galatGerbang({ galat: 'perlu_nis' })

  const [{ data, error }, gerbang] = await Promise.all([
    supabase.rpc('portal_wali', { p_token: token, p_nis: nis }),
    // Logo sekolah untuk kepala portal. Kalau gagal, portal tetap jalan dengan gambar gedung sekolah.
    supabase.rpc('portal_gerbang', { p_token: token }).then((r) => (r.error ? null : r.data), () => null),
  ])
  if (error) throw new Error(error.message)
  if (data?.gerbang) throw galatGerbang(data.gerbang)

  const hasil = bentuk({
    sekolah: data.sekolah,
    biaya: data.biaya,
    siswa: data.siswa,
    pembayaran: data.pembayaran,
    paket: data.paket || [],
    paketSiswa: data.paket_siswa || [],
    siswaTahun: data.siswa_tahun || null,
    tahunAjaran: data.tahun_ajaran || [],
  })
  // Nama yang ditampilkan di portal diambil dari siswa.wali (nama orang tua
  // yang diisi/diperbarui guru), bukan dari tabel wali.nama (nama akun token
  // yang dibuat sekali saat link digenerate dan tidak ikut terupdate).
  // Kalau ada lebih dari satu anak, ambil nama wali dari anak pertama.
  const namaWali = hasil.siswa[0]?.wali || data.wali.nama || 'Orang tua'
  return {
    ...hasil,
    pengaturan: { ...hasil.pengaturan, logo: gerbang?.logo || null },
    wali: { nama: namaWali, anak: hasil.siswa.map((s) => s.id) },
  }
}

/** Demo: data sekolah + siswa lulus/keluar beserta semua pembayarannya (dipakai portal & Tagihan). */
function demoDenganNonaktif() {
  const dasar = mock.bentukDemo()
  const n = mock.nonaktifDemo()
  const ada = new Set(dasar.pembayaran.map((p) => p.id))
  return bentuk({
    ...dasar,
    siswa: [...dasar.siswa, ...n.siswa],
    siswaTahun: [...dasar.siswaTahun, ...n.siswaTahun],
    pembayaran: [...dasar.pembayaran, ...n.pembayaran.filter((p) => !ada.has(p.id))],
  })
}

/* ===================== data tahun lama (0044) ===================== */

const BELUM_0044 = 'Fitur ini belum aktif di database. Jalankan file 0044_tahun_lama_ringan.sql di Supabase › SQL Editor.'
async function rpc44(nama, arg) {
  const { data, error } = await supabase.rpc(nama, arg)
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new Error(BELUM_0044)
    throw new Error(error.message)
  }
  return data
}

/**
 * Siswa lulus / keluar yang masih menunggak (menu Tagihan).
 * → [{ id, nama, kelas, status, tahunLulus, wali, hp, total, item: [{ jenis, ta, i, biayaId, nama, target, dibayar }] }]
 * demo = { pembayaran } dari layar (supaya pembayaran yang baru dicatat ikut terhitung).
 */
export async function tunggakanNonaktif(demo) {
  if (modeDemo) {
    const n = mock.nonaktifDemo()
    const idN = new Set(n.siswa.map((x) => x.id))
    const ada = new Set(n.pembayaran.map((p) => p.id))
    const baru = (demo?.pembayaran || []).filter((p) => idN.has(p.siswaId) && !ada.has(p.id)).map((p) => ({
      id: p.id, siswa_id: p.siswaId, jenis: p.jenis, periode: p.jenis === 'spp' ? p.indeks : null, tahun_ajaran: p.tahunAjaran,
      biaya_id: p.biayaId, paket_id: null, keterangan: p.ket, nominal: p.nominal, metode: p.metode, petugas: p.petugas, dibayar_pada: p.tanggal,
    }))
    const dn = bentuk({ ...mock.bentukDemo(), siswa: n.siswa, siswaTahun: n.siswaTahun, pembayaran: [...n.pembayaran, ...baru] })
    return tunggakanNonaktifDemo(dn)
  }
  return (await rpc44('tunggakan_nonaktif')) || []
}

/** Bentuk satu baris pembayaran dari server (pembayaran_daftar / tabel) → bentuk di layar. */
const bayarDariBaris = (p, biaya = []) => ({
  id: p.id, siswaId: p.siswa_id, jenis: p.jenis,
  indeks: p.jenis === 'spp' ? p.periode : p.jenis === 'paket' ? p.paket_id : biaya.findIndex((b) => b.id === p.biaya_id),
  biayaId: p.biaya_id || null, tahunAjaran: p.jenis === 'spp' ? p.tahun_ajaran || tahunAjaranBerjalan() : null, paketId: p.paket_id || null,
  ket: p.keterangan, nominal: Number(p.nominal), metode: p.metode, petugas: p.petugas || '',
  waktu: waktuTampil(p.dibayar_pada), tanggal: p.dibayar_pada,
})

/**
 * Riwayat pembayaran orang tua per rentang tanggal, per halaman — Transaksi › tahun ajaran lalu.
 * → { ringkas: { jumlah, total, tunai, transfer, tabungan }, lanjut, item: [pembayaran + siswa] }
 * demo = { pembayaran, siswa, siswaLain, biaya } dari layar.
 */
export async function pembayaranDaftar({ dari, sampai, mulai = 0, batas = 300 }, demo) {
  if (modeDemo) {
    const semua = demo.pembayaran.filter((p) => { const t = tanggalISOLokal(new Date(p.tanggal)); return t >= dari && t <= sampai })
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
    const cari = (id) => demo.siswa.find((x) => x.id === id) || (demo.siswaLain || []).find((x) => x.id === id) || null
    const hit = (m) => semua.filter((p) => p.metode === m).length
    return {
      ringkas: { jumlah: semua.length, total: semua.reduce((t, p) => t + p.nominal, 0), tunai: hit('Tunai'), transfer: hit('Transfer'), tabungan: hit('Tabungan') },
      lanjut: semua.length > mulai + batas,
      item: semua.slice(mulai, mulai + batas).map((p) => ({ ...p, siswa: cari(p.siswaId) })),
    }
  }
  const d = (await rpc44('pembayaran_daftar', { p_dari: dari, p_sampai: sampai, p_mulai: mulai, p_batas: batas }))
  return {
    ...d,
    item: d.item.map((p) => ({ ...bayarDariBaris(p, demo?.biaya), siswa: p.siswa ? bentukSiswaLain(p.siswa) : null })),
  }
}

/** Semua pembayaran SATU siswa (Kartu siswa › tahun lalu) — dibaca saat dibuka, tidak ikut dimuat di awal. */
export async function pembayaranSiswa(siswaId, demo) {
  if (modeDemo) return demo.pembayaran.filter((p) => p.siswaId === siswaId)
  const { data, error } = await ambilSemua(() => supabase.from('pembayaran').select('*', { count: 'exact' }).eq('siswa_id', siswaId)
    .order('dibayar_pada', { ascending: false }).order('id'))
  if (error) throw new Error(error.message)
  return data.map((p) => bayarDariBaris(p, demo?.biaya))
}

/* ===================== tulis (khusus guru) ===================== */

export async function catatPembayaran({ sekolahId, siswaId, jenis, periode, tahunAjaran, biayaId, paketId, keterangan, nominal, metode, petugas, tanggal }) {
  const dibayarPada = tanggalKeTimestamp(tanggal) // undefined kalau tanggal tidak diisi -> kolom pakai default now()
  if (modeDemo) return { id: 'demo-' + Date.now(), dibayar_pada: dibayarPada || new Date().toISOString(), tahun_ajaran: jenis === 'spp' ? tahunAjaran || tahunAjaranBerjalan() : null }

  const { data: pengguna } = await supabase.auth.getUser()
  const baris = {
    sekolah_id: sekolahId,
    siswa_id: siswaId,
    jenis,
    periode: jenis === 'spp' ? periode : null,
    // SPP disimpan bersama tahun ajarannya (0041)
    ...(jenis === 'spp' && tahunAjaran ? { tahun_ajaran: tahunAjaran } : {}),
    biaya_id: jenis === 'kegiatan' ? biayaId : null,
    paket_id: jenis === 'paket' ? paketId : null,
    keterangan,
    nominal,
    metode,
    petugas,
    dicatat_oleh: pengguna.user?.id ?? null,
    ...(dibayarPada ? { dibayar_pada: dibayarPada } : {}),
  }
  let { data, error } = await supabase.from('pembayaran').insert(baris).select().single()
  // Database belum 0041 (kolom tahun_ajaran belum ada): SPP tahun berjalan tetap bisa dicatat.
  if (error && /tahun_ajaran/.test(error.message || '') && baris.tahun_ajaran) {
    if (baris.tahun_ajaran !== tahunAjaranBerjalan()) {
      throw new Error('Membayar SPP tahun ajaran lalu butuh pembaruan database. Jalankan file 0041_spp_tahun_ajaran.sql di Supabase SQL Editor.')
    }
    delete baris.tahun_ajaran
    ;({ data, error } = await supabase.from('pembayaran').insert(baris).select().single())
  }

  if (error) throw new Error(pesanPaket(error))
  return data
}

/* ---------- paket PMB & daftar ulang (0033) ---------- */

function pesanPaket(error) {
  const m = error?.message || String(error)
  if (/paket_id|paket_biaya|paket_simpan|paket_hapus|paket_atur_siswa|pindahkan_biaya_ke_paket/i.test(m) && /does not exist|could not find|schema cache/i.test(m)) {
    return 'Fitur PMB & Daftar ulang belum aktif di database. Jalankan file 0033_pmb_daftar_ulang.sql di Supabase SQL Editor.'
  }
  return m
}

/** Simpan paket baru / perubahan paket + daftar siswa yang ditagih (satu transaksi di database). */
export async function simpanPaket({ id = null, jenis, tahunAjaran, nama, rincian, tahap, siswaIds }) {
  const data = { jenis, tahunAjaran, nama, rincian, tahap }
  if (modeDemo) {
    const total = rincian.reduce((t, r) => t + Number(r.nominal), 0)
    return bentukPaket({ id: id || 'demo-paket-' + Date.now(), jenis, tahun_ajaran: tahunAjaran, nama, rincian, tahap, total, siswa: siswaIds || [] })
  }
  const { data: baris, error } = await supabase.rpc('paket_simpan', { p_id: id, p_data: data, p_siswa: siswaIds ?? null })
  if (error) throw new Error(pesanPaket(error))
  return bentukPaket(baris)
}

/** Hapus paket. Yang sudah ada pembayarannya hanya diarsipkan → 'diarsipkan'. */
export async function hapusPaket(id, adaBayar) {
  if (modeDemo) return adaBayar ? 'diarsipkan' : 'dihapus'
  const { data, error } = await supabase.rpc('paket_hapus', { p_id: id })
  if (error) throw new Error(pesanPaket(error))
  return data
}

/** Tagihkan (ikut=true) / lepaskan satu siswa dari paket. */
export async function aturSiswaPaket(paketId, siswaId, ikut) {
  if (modeDemo) return true
  const { error } = await supabase.rpc('paket_atur_siswa', { p_paket: paketId, p_siswa: siswaId, p_ikut: ikut })
  if (error) throw new Error(pesanPaket(error))
  return true
}

/** Pindahkan biaya kegiatan lama ("PMB", "Daftar ulang") beserta pembayarannya ke paket. */
export async function pindahkanBiayaKePaket(biayaId, jenis) {
  if (modeDemo) throw new Error('Di mode demo, pemindahan ini tidak bisa dicoba.')
  const { data, error } = await supabase.rpc('pindahkan_biaya_ke_paket', { p_biaya: biayaId, p_jenis: jenis })
  if (error) throw new Error(pesanPaket(error))
  return data
}

/**
 * Membatalkan satu pembayaran (0029). Bukan hapus: baris dipindah ke arsip
 * pembatalan lengkap dengan alasan, siapa & kapan. Kuitansinya jadi
 * "DIBATALKAN" saat QR-nya dicek.
 */
export async function batalkanPembayaran(id, alasan, demo) {
  if (modeDemo) {
    if (demo) batalDemo.unshift({ ...demo, dibatalkanPada: new Date().toISOString(), alasan })
    return true
  }
  const { error } = await supabase.rpc('batalkan_pembayaran', { p_id: id, p_alasan: alasan })
  if (error) throw new Error(pesanBatal(error))
  return true
}

// Mode demo: pembatalan disimpan di memori selama halaman terbuka.
const batalDemo = []

/** Riwayat transaksi yang dibatalkan (pembayaran + kas), terbaru dulu. */
export async function riwayatPembatalan() {
  if (modeDemo) {
    const kas = (kasMemori || []).filter((k) => k.dibatalkan_pada).map((k) => ({
      id: k.id, sumber: 'kas', jenis: k.jenis, uraian: k.kategori + (k.keterangan ? ' — ' + k.keterangan : ''),
      nominal: k.nominal, tanggal: k.tanggal, petugas: k.dicatat_nama,
      dibatalkanPada: k.dibatalkan_pada, dibatalkanNama: k.dibatalkan_nama, alasan: k.alasan_batal,
    }))
    return [...batalDemo, ...kas].sort((a, b) => String(b.dibatalkanPada).localeCompare(String(a.dibatalkanPada)))
  }
  const { data, error } = await supabase.rpc('riwayat_pembatalan', { p_batas: 300 })
  if (error) throw new Error(pesanBatal(error))
  return data || []
}

function pesanBatal(error) {
  const m = error?.message || String(error)
  if (/could not find the function|schema cache/i.test(m)) {
    return 'Fitur pembatalan belum aktif di database. Jalankan file 0029_hak_akses_pembatalan.sql di Supabase SQL Editor.'
  }
  return m
}

/* ---------- data siswa ---------- */

export async function tambahSiswa({ sekolahId, ...data }) {
  if (modeDemo) return { id: 'demo-' + Date.now(), ...data }
  const { data: baris, error } = await supabase
    .from('siswa')
    .insert({
      sekolah_id: sekolahId,
      nama: data.nama?.trim(),
      panggilan: data.panggilan?.trim() || null,
      jenis_kelamin: data.jenis_kelamin,
      kelas: data.kelas?.trim(),
      nis: data.nis?.trim(),
      wali: data.wali?.trim() || null,
      hp: data.hp?.trim() || null,
      guru: data.guru?.trim() || null,
      alamat: data.alamat?.trim() || null,
      avatar: Number.isInteger(data.avatar) ? data.avatar : null,
    })
    .select()
    .single()
  if (error) throw new Error(pesanSiswa(error))
  return baris
}

export async function ubahSiswa(id, data) {
  if (modeDemo) return { id, ...data }
  const patch = {
    nama: data.nama?.trim(),
    panggilan: data.panggilan?.trim() || null,
    jenis_kelamin: data.jenis_kelamin,
    kelas: data.kelas?.trim(),
    nis: data.nis?.trim(),
    wali: data.wali?.trim() || null,
    hp: data.hp?.trim() || null,
    guru: data.guru?.trim() || null,
    alamat: data.alamat?.trim() || null,
    avatar: Number.isInteger(data.avatar) ? data.avatar : null,
  }
  const { data: baris, error } = await supabase
    .from('siswa')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(pesanSiswa(error))

  // Sinkronkan nama di tabel wali supaya portal orang tua juga
  // menampilkan nama yang baru — kalau link portal belum pernah
  // dibuat, wali_siswa tidak akan menemukan baris apapun dan
  // query ini diam-diam tidak melakukan apa-apa (aman).
  if (patch.wali) {
    const { data: ws } = await supabase
      .from('wali_siswa')
      .select('wali_id')
      .eq('siswa_id', id)
    if (ws?.length) {
      const waliIds = ws.map((w) => w.wali_id)
      await supabase.from('wali').update({ nama: patch.wali }).in('id', waliIds)
    }
  }

  return baris
}

/**
 * Siswa yang keluar dinonaktifkan, bukan dihapus, supaya riwayat
 * pembayarannya tetap utuh untuk laporan dan bukti bayar orang tua.
 */
export async function nonaktifkanSiswa(id) {
  if (modeDemo) return true
  const { error } = await supabase.from('siswa').update({ aktif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  return true
}

/**
 * Muat daftar siswa termasuk alumni — untuk halaman Siswa yang punya
 * tab Alumni. muatDataGuru hanya mengambil siswa aktif, jadi ini
 * dipanggil terpisah saat tab Alumni dibuka.
 */
export async function muatAlumni(sekolahId) {
  if (modeDemo) return []
  const { data, error } = await supabase
    .from('siswa')
    .select('*')
    .eq('sekolah_id', sekolahId)
    .eq('status_siswa', 'alumni')
    .order('tahun_lulus', { ascending: false })
    .order('nama')
  if (error) throw new Error(error.message)
  return data
}

/**
 * Naikkan kelas satu siswa — update kelas saja, status tetap 'aktif'.
 */
export async function naikkanKelas(siswaId, kelasBaru) {
  if (modeDemo) return true
  const { error } = await supabase
    .from('siswa')
    .update({ kelas: kelasBaru.trim() })
    .eq('id', siswaId)
  if (error) throw new Error(error.message)
  return true
}

/**
 * Naikkan kelas massal — update semua siswa di daftar ID sekaligus.
 * Dipanggil dari sheet Kenaikan Kelas setelah guru mengatur pemetaan
 * "kelas lama → kelas baru" dan mengkonfirmasi.
 */
export async function naikkanKelasMassal(peta) {
  // peta: array of { siswaId, kelasBaru }
  if (modeDemo) return { berhasil: peta.length, gagal: 0 }
  let berhasil = 0; const gagal = []
  for (const { siswaId, kelasBaru } of peta) {
    const { error } = await supabase
      .from('siswa').update({ kelas: kelasBaru.trim() }).eq('id', siswaId)
    if (error) gagal.push(siswaId)
    else berhasil++
  }
  return { berhasil, gagal: gagal.length }
}

/**
 * Luluskan siswa massal — ubah status ke 'alumni', isi tahun_lulus,
 * trigger otomatis set aktif = false.
 */
export async function luluskanMassal(siswaIds, tahunLulus) {
  if (modeDemo) return { berhasil: siswaIds.length, gagal: 0 }
  const { data, error } = await supabase
    .from('siswa')
    .update({ status_siswa: 'alumni', tahun_lulus: tahunLulus })
    .in('id', siswaIds)
    .select('id')
  if (error) throw new Error(error.message)
  return { berhasil: data.length, gagal: siswaIds.length - data.length }
}

/**
 * Kembalikan alumni ke aktif — kalau ada kesalahan input kelulusan.
 */
export async function batalkanLulus(siswaId) {
  if (modeDemo) return true
  const { error } = await supabase
    .from('siswa')
    .update({ status_siswa: 'aktif', tahun_lulus: null })
    .eq('id', siswaId)
  if (error) throw new Error(error.message)
  return true
}

/* ===================== tahun ajaran & keanggotaan (0042) ===================== */

const BELUM_0042 = 'Fitur tahun ajaran belum aktif di database. Jalankan file 0042_tahun_ajaran_keanggotaan.sql di Supabase › SQL Editor.'
async function rpc42(nama, arg) {
  const { data, error } = await supabase.rpc(nama, arg)
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new Error(BELUM_0042)
    throw new Error(error.message)
  }
  return data
}

/** Tarif SPP satu tahun ajaran: nominal standar + kelas yang berbeda { B1: 175000 }. */
export async function aturTarifSpp(ta, standar, kelas = {}) {
  if (modeDemo) return { ta, standar, kelas }
  return rpc42('atur_tarif_spp', { p_ta: ta, p_standar: standar, p_kelas: kelas })
}

/** Kelas & masa terdaftar (bulan mulai / terakhir, 0 = Juli) satu siswa di satu tahun ajaran. */
export async function aturKeanggotaan(siswaId, ta, kelas, mulai = 0, selesai = null) {
  if (modeDemo) return true
  await rpc42('atur_keanggotaan', { p_siswa: siswaId, p_ta: ta, p_kelas: kelas, p_mulai: mulai, p_selesai: selesai })
  return true
}

/** Siswa baru untuk tahun ajaran DEPAN — tidak ditagih apa pun tahun ini. */
export async function daftarkanTahunDepan(siswaId, kelas) {
  if (modeDemo) return true
  await rpc42('daftarkan_tahun_depan', { p_siswa: siswaId, p_kelas: kelas })
  return true
}

/** Keluar / pindah sekolah. bulanTerakhir = bulan terakhir yang masih ditagih SPP (0 = Juli). */
export async function keluarkanSiswa(siswaId, bulanTerakhir, alasan, catatan = '') {
  if (modeDemo) return true
  await rpc42('keluarkan_siswa', { p_siswa: siswaId, p_bulan_terakhir: bulanTerakhir, p_alasan: alasan, p_catatan: catatan || null })
  return true
}

/**
 * Kenaikan kelas dari tahun ajaran `dari` ke tahun berikutnya.
 * rencana: [{ siswa, aksi: 'naik'|'tinggal'|'lulus'|'tidak_lanjut', kelas }]
 * → { ke, langsung, naik, tinggal, lulus, tidakLanjut }
 */
export async function prosesKenaikan(dari, rencana) {
  if (modeDemo) {
    const n = (a) => rencana.filter((r) => r.aksi === a).length
    return { ke: `${Number(dari.slice(0, 4)) + 1}/${Number(dari.slice(0, 4)) + 2}`, langsung: dari < tahunAjaranBerjalan(), naik: n('naik'), tinggal: n('tinggal'), lulus: n('lulus'), tidakLanjut: n('tidak_lanjut') }
  }
  return rpc42('proses_kenaikan', { p_dari: dari, p_rencana: rencana })
}

/** Salin kegiatan (nama, nominal, info) dari tahun ajaran lain. → jumlah yang disalin */
export async function salinKegiatan(dari, ke, ids) {
  if (modeDemo) return ids.length
  return rpc42('salin_kegiatan', { p_dari: dari, p_ke: ke, p_ids: ids })
}

function pesanSiswa(error) {
  if (error.code === '23505') return 'NIS ini sudah dipakai siswa lain'
  return error.message
}

export async function tambahBiaya({ sekolahId, nama, nominal, urutan, emoji = null, info = {}, tahunAjaran = null }) {
  if (modeDemo) return { id: 'demo-' + Date.now(), nama, nominal, emoji, tahun_ajaran: tahunAjaran || tahunAjaranBerjalan(), ...kolomInfo(info) }
  const { data, error } = await supabase
    .from('biaya')
    // tahun_ajaran (0042) hanya dikirim untuk kegiatan tahun depan; tahun berjalan = bawaan database
    .insert({ sekolah_id: sekolahId, nama, nominal, urutan, emoji, ...kolomInfo(info), ...(tahunAjaran ? { tahun_ajaran: tahunAjaran } : {}) })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Ganti emoji satu jenis kegiatan. null = kembali ditebak otomatis dari nama. */
export async function ubahEmojiBiaya(id, emoji) {
  if (modeDemo) return true
  const { error } = await supabase.from('biaya').update({ emoji: emoji || null }).eq('id', id)
  if (error) throw new Error(error.message)
  return true
}

/** Simpan info kegiatan (tanggal, jam, lokasi, deskripsi, perlengkapan) yang dibaca orang tua di portal. */
export async function simpanInfoBiaya(id, info) {
  if (modeDemo) return infoKegiatan(kolomInfo(info))
  const { data, error } = await supabase.from('biaya').update(kolomInfo(info)).eq('id', id).select().single()
  if (error) {
    if (/biaya_info_panjang/.test(error.message)) throw new Error('Teks terlalu panjang. Deskripsi maks. 3.000 huruf.')
    if (/biaya_tanggal_urut/.test(error.message)) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.')
    throw new Error(error.message)
  }
  return infoKegiatan(data)
}

/**
 * Menghapus jenis biaya = menonaktifkan, bukan DELETE. Baris pembayaran
 * lama tetap mengacu ke sini, jadi riwayat dan bukti pembayaran orang tua
 * tidak ikut hilang.
 */
export async function nonaktifkanBiaya(id) {
  if (modeDemo) return true
  const { error } = await supabase.from('biaya').update({ aktif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  return true
}

/** Dipakai baik dari form SPP/kegiatan (guru) maupun Profil Sekolah (kepala) —
 *  field yang tidak dikirim (undefined) tidak ikut diubah. */
export async function simpanPengaturan({ id, namaSekolah, kepalaSekolah, alamat, waSekolah, sppNominal, tanggalJatuhTempo, rekening }) {
  if (modeDemo) return true
  const patch = {}
  if (namaSekolah !== undefined) patch.nama = namaSekolah
  if (kepalaSekolah !== undefined) patch.kepala_sekolah = kepalaSekolah || null
  if (alamat !== undefined) patch.alamat = alamat || null
  if (waSekolah !== undefined) patch.wa = waSekolah || null
  if (sppNominal !== undefined) patch.spp_nominal = sppNominal
  if (tanggalJatuhTempo !== undefined) patch.tanggal_jatuh_tempo = tanggalJatuhTempo
  if (rekening !== undefined) patch.rekening = rekening
  const { error } = await supabase.from('sekolah').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  return true
}

/* ===================== link portal orang tua ===================== */

/**
 * Kalau siswa ini sudah pernah ditautkan ke seorang wali, kembalikan
 * token yang sudah ada (supaya satu wali dengan banyak anak tetap
 * punya satu link, bukan link baru tiap kali diminta).
 */
export async function ambilLinkWali(siswaId) {
  if (modeDemo) return { token: 'demo-wulan', nama: 'Ibu Wulan' }
  const { data, error } = await supabase
    .from('wali_siswa')
    .select('wali:wali_id(token, nama)')
    .eq('siswa_id', siswaId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.wali || null
}

/** Membuat wali baru dari data orang tua yang sudah diisi di kartu siswa. */
export async function buatLinkWali({ sekolahId, siswaId, nama, hp }) {
  if (modeDemo) return { token: 'demo-wulan', nama: nama || 'Orang tua' }
  const { data: wali, error: e1 } = await supabase
    .from('wali')
    .insert({ sekolah_id: sekolahId, nama: nama || 'Orang tua', hp: hp || null })
    .select()
    .single()
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await supabase.from('wali_siswa').insert({ wali_id: wali.id, siswa_id: siswaId })
  if (e2) throw new Error(e2.message)
  return { token: wali.token, nama: wali.nama }
}

/* ===================== profil akun ===================== */

export async function ubahNamaSaya(nama) {
  if (modeDemo) return true
  const { error } = await supabase.rpc('ubah_nama_saya', { p_nama: nama })
  if (error) throw new Error(error.message)
  return true
}

/** Ganti avatar akun sendiri (0–11), null = huruf depan nama. */
export async function ubahAvatarSaya(avatar) {
  if (modeDemo) return true
  const { error } = await supabase.rpc('ubah_avatar_saya', { p_avatar: avatar })
  if (error) throw new Error(error.message)
  return true
}

/* ===================== autentikasi ===================== */

/**
 * Memulai login Google. Supabase mengarahkan browser ke Google, lalu
 * kembali ke `redirectTo` setelah berhasil — sesi baru muncul lewat
 * `onAuthStateChange` di auth.jsx, bukan lewat nilai balik fungsi ini.
 */
export async function masukGoogle(tujuan = '/guru') {
  if (modeDemo) return { url: null }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + tujuan },
  })
  if (error) throw new Error(pesanAuth(error.message))
  return data
}

export async function keluar() {
  if (modeDemo) return true
  await supabase.auth.signOut()
  return true
}

/**
 * Login PIN — PIN-nya sesungguhnya ADALAH password akun Supabase Auth
 * orang ini, cuma dibatasi 6 digit angka di sisi form. Supabase yang
 * meng-hash & menyimpannya (di auth.users, sisi server), kita tidak
 * pernah menyentuh atau menyimpan PIN mentah di database sendiri.
 */
/**
 * Login PIN — PIN-nya sesungguhnya ADALAH password akun Supabase Auth
 * orang ini, cuma dibatasi 6 digit angka di sisi form. Supabase yang
 * meng-hash & menyimpannya (di auth.users, sisi server), kita tidak
 * pernah menyentuh atau menyimpan PIN mentah di database sendiri.
 *
 * Lockout 3x salah dicek & dicatat di SERVER (lihat migrasi
 * 0008_pin_lockout.sql) — bukan di browser, supaya tidak bisa dilewati
 * cuma dengan refresh halaman atau ganti perangkat.
 */

/**
 * Cek apakah email ini punya PIN aktif di server — dipanggil saat
 * pengguna mengetik email di layar Masuk (debounce 800ms), supaya
 * kalau belum ada PIN langsung tampil saran pakai Google tanpa harus
 * coba login dulu dan gagal. Anon, karena memang sebelum login.
 * Menggunakan RPC status_pin yang juga dipakai lockout — hemat satu
 * round-trip. Kalau RPC tidak mengenal email itu, pin_aktif = false.
 */
/**
 * Cek apakah email ini punya PIN aktif di server — dipanggil saat
 * pengguna mengetik email di layar Masuk (debounce 800ms), supaya
 * kalau belum ada PIN langsung tampil saran pakai Google tanpa harus
 * coba login dulu dan gagal. Anon, karena memang sebelum login.
 * Menggunakan RPC status_pin (migrasi 0009 menambah kolom `aktif` ke
 * situ khusus untuk kebutuhan ini) — satu round-trip saja.
 */
export async function cekPinAktif(email) {
  if (modeDemo) return false
  try {
    const { data, error } = await supabase.rpc('status_pin', { p_email: email.trim() })
    if (error || !data?.length) return false
    return data[0].aktif === true
  } catch {
    return false // gagal → jangan blokir pengguna
  }
}

export async function masukPin(email, pin) {
  if (modeDemo) return { url: null }
  const emailBersih = email.trim()

  // Cek dulu apakah sudah terkunci, sebelum buang satu percobaan
  // sign-in yang memang pasti akan ditolak.
  const { data: status } = await supabase.rpc('status_pin', { p_email: emailBersih })
  if (status?.[0]?.terkunci) {
    throw new Error('PIN dikunci setelah 3 kali salah. Minta kepala sekolah membuka kembali lewat menu Profil Sekolah.')
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: emailBersih, password: pin })
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      const { data: hasil } = await supabase.rpc('catat_pin_gagal', { p_email: emailBersih })
      const h = hasil?.[0]
      if (h?.terkunci) {
        throw new Error('PIN salah 3 kali — akun dikunci. Minta kepala sekolah membuka kembali lewat menu Profil Sekolah.')
      }
      const sisa = 3 - (h?.percobaan ?? 0)
      throw new Error(`Email atau PIN salah (sisa ${sisa}x percobaan sebelum terkunci)`)
    }
    throw new Error(pesanAuth(error.message))
  }

  // Berhasil — reset hitungan gagal supaya tidak nyangkut dari percobaan lama.
  await supabase.rpc('reset_percobaan_pin_saya')
  return data
}

/**
 * Cek apakah PIN gampang ditebak — angka sama semua (111111), urut naik
 * (123456) atau turun (654321), atau pola berulang (121212 / 123123).
 * Dicek di sisi klien saat PIN dibuat/diubah, bukan gerbang keamanan
 * utama (itu tetap panjang+lockout) tapi cukup untuk menyaring pola
 * paling jelas mudah ditebak.
 */
export function pinLemah(pin) {
  if (!/^\d{6}$/.test(pin)) return true
  if (new Set(pin).size === 1) return true // 111111, 222222, dst
  if (berurutanSiklis(pin)) return true // 123456, 654321, 098765, 890123, dst (termasuk yang "muter")
  if (pin[0] === pin[2] && pin[2] === pin[4] && pin[1] === pin[3] && pin[3] === pin[5]) return true // 121212
  if (pin.slice(0, 3) === pin.slice(3, 6)) return true // 123123
  return false
}

/** Naik atau turun 1 angka terus-menerus, termasuk yang "muter" lewat
 *  0/9 (mis. 890123 atau 098765) — bukan cuma yang berhenti di ujung. */
function berurutanSiklis(pin) {
  const d = pin.split('').map(Number)
  let naik = true
  let turun = true
  for (let i = 1; i < d.length; i++) {
    if ((d[i - 1] + 1) % 10 !== d[i]) naik = false
    if ((d[i - 1] + 9) % 10 !== d[i]) turun = false
  }
  return naik || turun
}

/**
 * Aktifkan/ubah PIN — dipanggil saat SUDAH login (lewat Google). Set
 * password akun ini jadi PIN yang diketik, lalu tandai `pin_aktif` di
 * tabel profil (cuma penanda UI, PIN aslinya tetap di Supabase Auth).
 */
export async function aturPin(pin) {
  if (pinLemah(pin)) {
    throw new Error('PIN terlalu mudah ditebak — hindari angka sama semua atau berurutan (contoh: 111111, 123456).')
  }
  if (modeDemo) return true
  const { error: eUpdate } = await supabase.auth.updateUser({ password: pin })
  if (eUpdate) throw new Error(pesanAuth(eUpdate.message))
  const { error: eRpc } = await supabase.rpc('tandai_pin_aktif')
  if (eRpc) throw new Error(eRpc.message)
  return true
}

/**
 * Matikan PIN — ganti password ke string acak panjang (yang tidak
 * pernah ditampilkan/disimpan di mana pun) supaya PIN lama pasti tidak
 * bisa dipakai login lagi, baru tandai `pin_aktif = false`.
 */
export async function matikanPin() {
  if (modeDemo) return true
  const acak = crypto.randomUUID() + crypto.randomUUID()
  const { error: eUpdate } = await supabase.auth.updateUser({ password: acak })
  if (eUpdate) throw new Error(pesanAuth(eUpdate.message))
  const { error: eRpc } = await supabase.rpc('matikan_pin')
  if (eRpc) throw new Error(eRpc.message)
  return true
}

/** Khusus kepala sekolah — daftar staf di sekolahnya yang PIN-nya terkunci. */
export async function daftarStafTerkunci() {
  if (modeDemo) return []
  const { data, error } = await supabase.rpc('daftar_staf_terkunci')
  if (error) throw new Error(error.message)
  return data.map((s) => ({ id: s.id, nama: s.nama, peran: s.peran }))
}

/** Khusus kepala sekolah — buka kunci PIN satu staf di sekolahnya. */
export async function bukaKunciPin(profilId) {
  if (modeDemo) return true
  const { error } = await supabase.rpc('buka_kunci_pin', { p_profil_id: profilId })
  if (error) throw new Error(error.message)
  return true
}

function pesanAuth(pesan) {
  if (/provider is not enabled/i.test(pesan))
    return 'Login Google belum diaktifkan untuk aplikasi ini. Hubungi admin sekolah.'
  if (/password.*at least|should be at least/i.test(pesan))
    return 'PIN minimal 6 digit'
  return pesan
}

/* ===================== onboarding (akun baru) ===================== */

/**
 * Dipanggil saat akun Google baru memilih "Saya kepala sekolah/admin".
 * Membuat sekolah baru dan menghubungkan akun ke situ sebagai kepala.
 */
export async function daftarkanSekolah({ nama }) {
  if (modeDemo) return { sekolahId: 'demo', nama, peran: 'kepala' }
  const { data, error } = await supabase.rpc('daftarkan_sekolah', { p_nama: nama })
  if (error) throw new Error(pesanOnboarding(error.message))
  return data
}

/**
 * Dipanggil saat akun Google baru memilih "Saya admin/TU" dan memasukkan
 * kode aktivasi yang didapat dari kepala sekolah.
 */
export async function aktivasiKode(kode) {
  if (modeDemo) return { sekolahId: 'demo', sekolah: 'Sekolah Demo', peran: 'admin' }
  const { data, error } = await supabase.rpc('aktivasi_kode', {
    p_kode: (kode || '').trim().toUpperCase(),
  })
  if (error) throw new Error(pesanOnboarding(error.message))
  return data
}

/** Dipanggil kepala sekolah/admin dari dasbornya untuk membuat kode baru. */
export async function buatKodeAktivasi(peran = 'admin') {
  if (modeDemo) return { kode: 'DEMO01', peran }
  const { data, error } = await supabase.rpc('buat_kode_aktivasi', { p_peran: peran })
  if (error) throw new Error(error.message)
  return data
}

/* ===================== langganan ===================== */

/** Status langganan sekolah dari server (opsional — layar biasanya
 *  cukup menghitung sendiri dari pengaturan lewat lib/langganan.js). */
export async function statusLangganan() {
  if (modeDemo) return null
  const { data, error } = await supabase.rpc('status_langganan')
  if (error) throw new Error(error.message)
  return data
}

/** Khusus admin aplikasi (pengembang): daftar semua sekolah + statusnya. */
export async function daftarLangganan() {
  if (modeDemo) return []
  const { data, error } = await supabase.rpc('daftar_langganan')
  if (error) throw new Error(error.message)
  return data
}

/** Khusus admin aplikasi: perpanjang langganan sekolah N bulan setelah
 *  pembayaran dikonfirmasi manual. */
export async function perpanjangLangganan(sekolahId, bulan = 1) {
  if (modeDemo) return { sekolahId, langgananSampai: null }
  const { data, error } = await supabase.rpc('perpanjang_langganan', {
    p_sekolah_id: sekolahId,
    p_bulan: bulan,
  })
  if (error) throw new Error(error.message)
  return data
}

/** Khusus admin aplikasi: atur tarif langganan per siswa/bulan untuk satu
 *  sekolah (harga khusus/negosiasi). Kirim null untuk kembali ke tarif
 *  default aplikasi. */
export async function ubahHargaPerSiswa(sekolahId, hargaPerSiswa) {
  if (modeDemo) return { sekolahId, hargaPerSiswa }
  const { data, error } = await supabase.rpc('ubah_harga_per_siswa', {
    p_sekolah_id: sekolahId,
    p_harga: hargaPerSiswa,
  })
  if (error) throw new Error(error.message)
  return data
}

/* ===================== kuitansi & dokumen ===================== */

async function panggil(nama, param) {
  const { data, error } = await supabase.rpc(nama, param)
  if (error) throw new Error(error.message)
  return data
}

/**
 * Isi kuitansi versi mode demo — dibentuk dari data di layar (tanpa TTD),
 * supaya tombol unduh tetap bisa dicoba tanpa database.
 */
function kuitansiDemo({ p, s, pengaturan }) {
  return {
    id: 'demo-' + p.id,
    nomor: 'KW-DEMO-' + String(p.id).slice(-6).toUpperCase(),
    dibayarPada: p.tanggal,
    jenis: p.jenis,
    keterangan: p.ket,
    tahunAjaran: p.tahunAjaran || null,
    nominal: p.nominal,
    metode: p.metode,
    petugas: p.petugas,
    target: p.nominal,
    terbayarSampaiIni: p.nominal,
    siswa: { nama: s.nama, kelas: s.kelas, nis: s.nis, wali: s.wali },
    sekolah: { nama: pengaturan.namaSekolah, alamat: pengaturan.alamat, kepalaSekolah: pengaturan.kepalaSekolah },
    ttd: { nama: pengaturan.kepalaSekolah || '', jabatan: 'Kepala Sekolah', gambar: null, stempel: null },
  }
}

/** Data kuitansi untuk staf sekolah (panel guru). */
export async function kuitansiStaf(id, demo) {
  if (modeDemo) return kuitansiDemo(demo)
  return panggil('kuitansi_staf', { p_id: id })
}

/** Data kuitansi untuk portal orang tua — dicek lewat token tautan + NIS. */
export async function kuitansiPortal(token, nis, id, demo) {
  if (modeDemo || !token) return kuitansiDemo(demo)
  const d = await panggil('kuitansi_portal', { p_token: token, p_nis: nis, p_id: id })
  if (d?.gerbang) throw galatGerbang(d.gerbang)
  return d
}

/** Tanda tangan & stempel kuitansi sekolah (null kalau belum pernah diatur). */
export async function muatTtdSekolah(sekolahId) {
  if (modeDemo) return null
  const { data, error } = await supabase
    .from('sekolah_ttd')
    .select('nama_penandatangan, jabatan, ttd, stempel, logo')
    .eq('sekolah_id', sekolahId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data && { nama: data.nama_penandatangan || '', jabatan: data.jabatan || 'Bendahara', ttd: data.ttd, stempel: data.stempel, logo: data.logo }
}

/** Logo sekolah untuk kop kuitansi (null = hapus). Khusus kepala sekolah. */
export async function simpanLogoSekolah(logo) {
  if (modeDemo) return { ok: true }
  return panggil('simpan_logo_sekolah', { p_logo: logo || null })
}

export async function simpanTtdSekolah({ nama, jabatan, ttd, stempel }) {
  if (modeDemo) return { ok: true }
  return panggil('simpan_ttd_sekolah', { p_nama: nama, p_jabatan: jabatan, p_ttd: ttd || null, p_stempel: stempel || null })
}

/** Riwayat pembayaran sewa aplikasi milik sekolah sendiri. */
export async function riwayatSewaSaya() {
  if (modeDemo) return []
  return (await panggil('riwayat_langganan_saya')) || []
}

export async function kuitansiSewa(id) {
  return panggil('kuitansi_sewa', { p_id: id })
}

/** Identitas penerbit invoice (nama usaha, rekening, TTD) dari panel admin. */
export async function dataPenerbit() {
  if (modeDemo) return null
  return panggil('data_penerbit')
}

/** Cek keaslian kuitansi dari kode QR — tanpa login. */
export async function verifikasiDokumen(kode) {
  if (modeDemo) return { sah: false, demo: true }
  return panggil('verifikasi_dokumen', { p_kode: kode })
}

/* ===================== SAKU — Sahabat Keuangan Sekolah (asisten AI) ===================== */

/**
 * Kirim pertanyaan ke Edge Function "tanya-ai" (supabase/functions/tanya-ai).
 * API key AI tidak pernah ada di browser — semuanya lewat server.
 * `riwayat` = beberapa pesan terakhir [{ peran: 'user'|'assistant', teks }]
 * supaya pertanyaan lanjutan ("kalau kelas B?") nyambung.
 * Hasil: { jawaban, data: [{ alat, hasil }], kuota: { terpakai, batas } }
 */
export async function tanyaAI(pesan, riwayat = []) {
  const { data, error } = await supabase.functions.invoke('tanya-ai', { body: { pesan, riwayat } })
  if (error) {
    // Detail lengkap untuk dicek di DevTools (F12 → Console).
    console.error('[SAKU]', error.name, error.context || error)
    const status = error.context?.status
    if (status === 404) throw new Error('SAKU belum aktif: fungsi "tanya-ai" belum di-deploy ke Supabase (lihat supabase/README.md bagian 6).')
    if (status === 401) throw new Error('Sesi login habis. Silakan keluar lalu masuk lagi.')
    if (error.name === 'FunctionsFetchError') {
      // Fungsi yang belum di-deploy juga jatuh ke sini: browser memblokir
      // jawaban 404 tanpa header CORS, jadi terlihat seperti gagal koneksi.
      throw new Error('Tidak bisa menghubungi SAKU (fungsi tanya-ai) di Supabase. Paling sering karena fungsi "tanya-ai" belum di-deploy (lihat supabase/README.md bagian 6). Kalau sudah, cek koneksi internet.')
    }
    throw new Error(`Server SAKU bermasalah (kode ${status || error.name}). Cek log di Dashboard Supabase → Edge Functions → tanya-ai → Logs.`)
  }
  if (data?.galat) throw new Error(data.galat)
  return data
}

function pesanOnboarding(pesan) {
  if (/sudah terhubung ke sekolah lain/i.test(pesan))
    return 'Akun ini sudah terdaftar di sekolah lain. Hubungi admin kalau ini keliru.'
  if (/tidak ditemukan atau sudah dipakai/i.test(pesan))
    return 'Kode salah atau sudah dipakai. Cek lagi dengan kepala sekolah.'
  if (/nama sekolah belum diisi/i.test(pesan)) return 'Isi nama sekolah dulu.'
  return pesan
}
/* ===================== buku kas (0028 + 0030) ===================== */
/*
 * Sejak 0030 semua angka kas (saldo, laporan bulanan, arus kas, riwayat)
 * dihitung DATABASE, dan aturan uang ditegakkan di sana:
 *   • saldo tidak boleh minus (pengeluaran, batal pemasukan/pembayaran, saldo awal)
 *   • tanggal transaksi tidak boleh sebelum tanggal mulai saldo awal
 * Browser hanya mengambil yang ditampilkan (riwayat per halaman), jadi tetap
 * ringan walau transaksinya sudah ribuan.
 */

const bentukKas = (k) => ({
  id: k.id,
  jenis: k.jenis,
  tanggal: k.tanggal,
  kategori: k.kategori,
  nominal: Number(k.nominal),
  keterangan: k.keterangan || '',
  dicatatNama: k.dicatat_nama || '',
  dibuatPada: k.dibuat_pada || null,
  dibatalkanPada: k.dibatalkan_pada || null,
  dibatalkanNama: k.dibatalkan_nama || '',
  alasanBatal: k.alasan_batal || '',
  adaNota: k.ada_nota ?? (!!k.nota || !!k.nota_file?.length),
  biayaId: k.biaya_id || null,
  paketId: k.paket_id || null,
  grup: k.grup || null,
  jmlNota: k.nota_file?.length || (k.nota ? 1 : 0),
  notaFile: k.nota_file || [],
})

async function rpcKas(nama, param) {
  const { data, error } = await supabase.rpc(nama, param)
  if (error) throw new Error(pesanKas(error))
  return data
}

function pesanKas(error) {
  const m = error?.message || String(error)
  if (/could not find the function public\.kas_daftar/i.test(m)) {
    return 'Menu Transaksi belum aktif di database. Jalankan file 0040_daftar_transaksi_kas.sql di Supabase SQL Editor.'
  }
  if (/could not find the function public\.kas_(ringkasan|laporan_bulan|arus|riwayat|saldo_tersedia)/i.test(m)) {
    return 'Pembaruan kas belum aktif di database. Jalankan file 0030_kas_saldo.sql di Supabase SQL Editor.'
  }
  if (/could not find the function public\.(kas_catat_rincian|kas_atur_kegiatan|kas_pengeluaran_kegiatan|kas_nota_file|kas_pindah_nota)|kas_riwayat\(.*p_saring/i.test(m)) {
    return 'Pembaruan "pengeluaran kegiatan" belum aktif di database. Jalankan file 0035_pengeluaran_kegiatan.sql di Supabase SQL Editor.'
  }
  if (/relation .*kas.* does not exist|could not find the (function|table)|schema cache/i.test(m)) {
    return 'Fitur kas belum aktif di database. Jalankan file 0028_kas.sql lalu 0030_kas_saldo.sql di Supabase SQL Editor.'
  }
  return m
}

// ---------- mode demo: data kas di memori selama halaman terbuka ----------
let kasMemori = null
const kasDemoAwal = () => (kasMemori ||= mock.kasDemo.map((k) => ({ dibuat_pada: k.tanggal + 'T08:00:00', ...k })))
const kasDemoAtur = () => ({ saldoAwal: mock.kasPengaturanDemo.saldo_awal, mulai: mock.kasPengaturanDemo.mulai })
/** `demo.pembayaran` = pembayaran di layar (supaya pembayaran yang dicatat saat demo ikut terhitung). */
/** Nama kegiatan / paket untuk label (mode demo). */
function namaLabelDemo(demo, k) {
  if (k.biayaId) return (demo?.biaya || mock.biaya).find((b) => b.id === k.biayaId)?.nama || null
  if (k.paketId) return (demo?.paket || []).find((p) => p.id === k.paketId)?.nama || null
  return null
}
function kasDemo(demo) {
  const atur = kasDemoAtur()
  const pembayaran = demo?.pembayaran || bentuk(mock.bentukDemo()).pembayaran
  const gerakan = kas.gerakanKas({ pembayaran, kas: kasDemoAwal().map(bentukKas), mulai: atur.mulai })
  return { atur, gerakan }
}

/* ===================== laporan per tahun ajaran (0043) ===================== */

const BELUM_0043 = 'Laporan per tahun ajaran belum aktif di database. Jalankan file 0043_laporan_tahunan.sql di Supabase › SQL Editor.'
async function rpc43(nama, arg) {
  const { data, error } = await supabase.rpc(nama, arg)
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new Error(BELUM_0043)
    throw new Error(error.message)
  }
  return data
}
const angka = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^-?\d+$/.test(v) && !['ta', 'kode', 'kelas', 'nama', 'bulan', 'id'].includes(k) ? Number(v) : v))

/** Semua tahun ajaran sekolah (terbaru dulu) + angka ringkas untuk perbandingan. demo = data layar. */
export async function daftarTahunAjaran(demo) {
  if (modeDemo) return daftarTahunDemo({ siswa: demo.siswa, pembayaran: demo.pembayaran, tarif: demo.pengaturan.tarifSpp || {} })
  return angka(await rpc43('daftar_tahun_ajaran'))
}

/** Rekap satu tahun ajaran (siswa, SPP, kegiatan, PMB/DU, kas, tunggakan). demo = data layar. */
export async function laporanTahunan(ta, demo) {
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    const y = Number(ta.slice(0, 4))
    const hariIni = tanggalISOLokal().slice(0, 7)
    const bulan = Array.from({ length: 12 }, (_, i) => `${i < 6 ? y : y + 1}-${String(((i + 6) % 12) + 1).padStart(2, '0')}`)
    const lap = bulan.map((b) => (b <= hariIni ? kas.laporanBulan({ gerakan, saldoAwalKas: atur.saldoAwal, bulan: b }) : null))
    const ada = lap.filter(Boolean)
    const gabung = (kunci) => {
      const m = new Map()
      ada.forEach((l) => l[kunci].forEach((k) => m.set(k.kategori, (m.get(k.kategori) || 0) + k.nominal)))
      return [...m.entries()].map(([kategori, nominal]) => ({ kategori, nominal })).sort((a, b) => b.nominal - a.nominal)
    }
    const terpakai = {}
    kasDemoAwal().forEach((k) => { if (k.biaya_id && k.jenis === 'keluar' && !k.dibatalkan_pada) terpakai[k.biaya_id] = (terpakai[k.biaya_id] || 0) + k.nominal })
    return laporanTahunanDemo({
      ta, siswa: demo.siswa, biaya: demo.biaya, biayaLain: demo.biayaLain || [], paket: demo.paket || [], pembayaran: demo.pembayaran,
      tarif: demo.pengaturan.tarifSpp || {}, tanggalJatuhTempo: demo.pengaturan.tanggalJatuhTempo, terpakai,
      kas: ada.length ? {
        saldoAwal: ada[0].saldoAwal, saldoAkhir: ada[ada.length - 1].saldoAkhir,
        masuk: ada.reduce((t, l) => t + l.totalMasuk, 0), keluar: ada.reduce((t, l) => t + l.totalKeluar, 0),
        mulaiDicatat: atur.mulai,
        perBulan: bulan.map((b, i) => ({ bulan: b, masuk: lap[i]?.totalMasuk || 0, keluar: lap[i]?.totalKeluar || 0 })),
        masukPerKategori: gabung('masukPerKategori'), keluarPerKategori: gabung('keluarPerKategori'),
      } : null,
    })
  }
  return angka(await rpc43('laporan_tahunan', { p_ta: ta }))
}

/** Saldo sekarang, saldo awal, bulan pertama laporan, peringatan data lama. */
export async function kasRingkasan(demo) {
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    const hariIni = tanggalISOLokal()
    const sebelum = kasDemoAwal().filter((k) => !k.dibatalkan_pada && k.tanggal < atur.mulai)
    const kategori = (j) => [...new Set(kasDemoAwal().filter((k) => k.jenis === j).map((k) => k.kategori))]
    return {
      pengaturan: atur,
      saldoKini: kas.saldoPer(gerakan, atur.saldoAwal, hariIni),
      hariIni,
      bulanPertama: atur.mulai.slice(0, 7),
      terendah: kas.saldoTerendah(gerakan, atur.saldoAwal, atur.mulai),
      sebelumMulai: { jumlah: sebelum.length, pertama: sebelum.map((k) => k.tanggal).sort()[0] || null },
      kategori: { masuk: kategori('masuk'), keluar: kategori('keluar') },
    }
  }
  const d = await rpcKas('kas_ringkasan')
  return {
    ...d,
    saldoKini: Number(d.saldoKini),
    pengaturan: d.pengaturan ? { ...d.pengaturan, saldoAwal: Number(d.pengaturan.saldoAwal) } : null,
    terendah: d.terendah ? { ...d.terendah, saldo: Number(d.terendah.saldo) } : null,
    sebelumMulai: d.sebelumMulai || { jumlah: 0, pertama: null },
  }
}

const angkaLap = (l) => ({
  ...l,
  saldoAwal: Number(l.saldoAwal), totalMasuk: Number(l.totalMasuk), totalKeluar: Number(l.totalKeluar),
  saldoAkhir: Number(l.saldoAkhir), jumlahKeluar: Number(l.jumlahKeluar || 0),
  masukPerKategori: (l.masukPerKategori || []).map((k) => ({ ...k, nominal: Number(k.nominal) })),
  keluarPerKategori: (l.keluarPerKategori || []).map((k) => ({ ...k, nominal: Number(k.nominal) })),
  baris: (l.baris || []).map((b) => ({ ...b, masuk: Number(b.masuk), keluar: Number(b.keluar), saldo: Number(b.saldo) })),
})

/** Laporan satu bulan ("YYYY-MM"): saldo awal/akhir, total, per kategori, baris buku kas. */
export async function kasLaporanBulan(bulan, demo) {
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    return kas.laporanBulan({ gerakan, saldoAwalKas: atur.saldoAwal, bulan })
  }
  return angkaLap(await rpcKas('kas_laporan_bulan', { p_bulan: bulan }))
}

/** Pemasukan & pengeluaran per bulan (n bulan berakhir di `sampai`). */
export async function kasArus(sampai, n = 6, demo) {
  if (modeDemo) return kas.arusKas(kasDemo(demo).gerakan, sampai, n)
  const d = await rpcKas('kas_arus', { p_sampai: sampai, p_n: n })
  return (d || []).map((b) => ({ bulan: b.bulan, masuk: Number(b.masuk), keluar: Number(b.keluar) }))
}

/**
 * Menu Transaksi: daftar pengeluaran / pemasukan lain kas yang SAH, per halaman (0040).
 * → { item, lanjut, jumlahTampil, ringkas: { jumlah, total, adaNota } }
 */
export async function kasDaftar({ jenis, dari, sampai, mulaiDari = 0, batas = 30, saring = 'semua', nota = 'semua', cari = '' }, demo) {
  if (modeDemo) {
    return kas.daftarKas(kasDemoAwal().map(bentukKas), { jenis, dari, sampai, mulaiDari, batas, saring, nota, cari }, kasDemoAtur().mulai, (k) => namaLabelDemo(demo, k))
  }
  const d = await rpcKas('kas_daftar', {
    p_jenis: jenis, p_dari: dari, p_sampai: sampai, p_mulai_dari: mulaiDari, p_batas: batas,
    p_saring: saring, p_nota: nota, p_cari: cari || null,
  })
  return {
    item: (d.item || []).map((x) => ({ ...x, nominal: Number(x.nominal) })),
    lanjut: !!d.lanjut,
    jumlahTampil: Number(d.jumlahTampil || 0),
    ringkas: { jumlah: Number(d.ringkas?.jumlah || 0), total: Number(d.ringkas?.total || 0), adaNota: Number(d.ringkas?.adaNota || 0) },
  }
}

/** Riwayat transaksi rentang tanggal, per halaman. → { item, lanjut, total } */
export async function kasRiwayat({ dari, sampai, mulaiDari = 0, batas = 30, saring = 'semua' }, demo) {
  if (modeDemo) {
    const r = kas.riwayatKas(kasDemo(demo).gerakan, { dari, sampai, mulaiDari, batas, saring })
    return { ...r, item: r.item.map((x) => (x.sumber === 'kas' ? { ...x, kegiatan: namaLabelDemo(demo, x) } : x)) }
  }
  const param = { p_dari: dari, p_sampai: sampai, p_mulai_dari: mulaiDari, p_batas: batas }
  let d
  try {
    d = await rpcKas('kas_riwayat', { ...param, p_saring: saring })
  } catch (e) {
    // database belum 0035 → riwayat lama (tanpa saringan & label)
    if (saring !== 'semua' || !/0035/.test(e.message)) throw e
    d = await rpcKas('kas_riwayat', param)
  }
  return {
    item: (d.item || []).map((x) => ({ ...x, nominal: Number(x.nominal) })),
    lanjut: !!d.lanjut,
    total: { masuk: Number(d.total?.masuk || 0), keluar: Number(d.total?.keluar || 0), jumlah: Number(d.total?.jumlah || 0) },
  }
}

/** Berapa yang masih bisa dikeluarkan pada tanggal itu tanpa membuat saldo minus. */
export async function kasSaldoTersedia(tanggal, demo) {
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    const r = kas.saldoTerendah(gerakan, atur.saldoAwal, tanggal)
    return { tersedia: Math.max(0, r.saldo), saldoTanggal: kas.saldoPer(gerakan, atur.saldoAwal, tanggal), dibatasiTanggal: r.tanggal !== tanggal ? r.tanggal : null }
  }
  const d = await rpcKas('kas_saldo_tersedia', { p_tanggal: tanggal })
  return { tersedia: Number(d.tersedia), saldoTanggal: Number(d.saldoTanggal), dibatasiTanggal: d.dibatasiTanggal || null }
}

/* ---------- foto nota di Supabase Storage (0035) ---------- */
const BUCKET_NOTA = 'nota'
const notaDemo = new Map() // mode demo: alamat → data URL
let notaDemoSiap = false
const siapkanNotaDemo = () => {
  if (notaDemoSiap) return
  notaDemoSiap = true
  try {
    Object.entries(mock.notaDemo()).forEach(([a, d]) => notaDemo.set(a, d))
  } catch {
    /* tanpa gambar contoh */
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

function pesanStorage(error) {
  const m = error?.message || String(error)
  if (/bucket not found|not found/i.test(m)) return 'Penyimpanan foto nota belum aktif. Jalankan file 0035_pengeluaran_kegiatan.sql di Supabase SQL Editor.'
  if (/row-level security|unauthorized|403/i.test(m)) return 'Akun ini tidak punya akses menyimpan foto nota.'
  if (/payload too large|exceeded|413/i.test(m)) return 'Foto nota terlalu besar.'
  return 'Gagal mengunggah foto nota: ' + m
}

/** Unggah satu foto nota (data URL hasil siapkanNota) → alamatnya di Storage. */
export async function unggahNota(dataUrl, sekolahId) {
  if (modeDemo) {
    const alamat = `demo/${crypto.randomUUID()}.jpg`
    notaDemo.set(alamat, dataUrl)
    return alamat
  }
  const png = String(dataUrl).startsWith('data:image/png')
  const alamat = `${sekolahId}/${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`
  const { error } = await supabase.storage.from(BUCKET_NOTA).upload(alamat, dataUrlKeBlob(dataUrl), {
    contentType: png ? 'image/png' : 'image/jpeg', upsert: false,
  })
  if (error) throw new Error(pesanStorage(error))
  return alamat
}

/** Hapus foto yang sudah terunggah tapi transaksinya gagal disimpan. */
async function hapusNotaTakTerpakai(alamat) {
  if (!alamat.length) return
  if (modeDemo) return alamat.forEach((a) => notaDemo.delete(a))
  try {
    await supabase.storage.from(BUCKET_NOTA).remove(alamat)
  } catch {
    /* sisa file tidak mengganggu */
  }
}

/** Link sementara (1 jam) untuk menampilkan foto nota. */
export async function urlNota(alamat) {
  if (modeDemo) { siapkanNotaDemo(); return notaDemo.get(alamat) || null }
  const { data, error } = await supabase.storage.from(BUCKET_NOTA).createSignedUrl(alamat, 3600)
  if (error) throw new Error(pesanStorage(error))
  return data?.signedUrl || null
}

/** Isi file foto nota (untuk ZIP). */
export async function blobNota(alamat) {
  if (modeDemo) {
    siapkanNotaDemo()
    const d = notaDemo.get(alamat)
    return d ? dataUrlKeBlob(d) : null
  }
  const { data, error } = await supabase.storage.from(BUCKET_NOTA).download(alamat)
  if (error) throw new Error(pesanStorage(error))
  return data
}

/** Foto nota satu transaksi → [{ alamat, url }] (foto format lama: alamat null, url = data URL). */
export async function notaKas(id) {
  if (modeDemo) {
    siapkanNotaDemo()
    const k = kasDemoAwal().find((x) => x.id === id)
    if (k?.nota_file?.length) return k.nota_file.map((a) => ({ alamat: a, url: notaDemo.get(a) || null }))
    return k?.nota ? [{ alamat: null, url: k.nota }] : []
  }
  const { data, error } = await supabase.rpc('kas_nota_file', { p_id: id })
  if (error) {
    // database belum 0035
    const lama = await supabase.from('kas').select('nota').eq('id', id).maybeSingle()
    if (lama.error) throw new Error(pesanKas(lama.error))
    return lama.data?.nota ? [{ alamat: null, url: lama.data.nota }] : []
  }
  const file = data?.file || []
  if (file.length) return Promise.all(file.map(async (a) => ({ alamat: a, url: await urlNota(a).catch(() => null) })))
  return data?.lama ? [{ alamat: null, url: data.lama }] : []
}

/**
 * Pindahkan foto nota format lama (teks di database) ke Storage, sedikit
 * demi sedikit, di latar belakang saat petugas kas membuka halaman Kas.
 * Mengembalikan jumlah yang dipindahkan. Galat diabaikan (dicoba lagi lain kali).
 */
export async function pindahkanNotaLama(sekolahId, maks = 20) {
  if (modeDemo || !sekolahId) return 0
  let n = 0
  try {
    while (n < maks) {
      const { data, error } = await supabase.from('kas').select('id, nota').not('nota', 'is', null).is('nota_file', null).limit(3)
      if (error || !data?.length) break
      for (const k of data) {
        const alamat = await unggahNota(k.nota, sekolahId)
        const { error: e2 } = await supabase.rpc('kas_pindah_nota', { p_id: k.id, p_path: alamat })
        if (e2) {
          await hapusNotaTakTerpakai([alamat])
          return n
        }
        n++
      }
    }
  } catch {
    /* coba lagi lain kali */
  }
  return n
}

const rpDemo = (n) => (n < 0 ? '-' : '') + 'Rp ' + Math.abs(n).toLocaleString('id-ID')

export async function catatKas({ jenis, tanggal, kategori, nominal, keterangan, nota, pencatat }, demo) {
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    if (tanggal < atur.mulai) throw new Error(`Tanggal ${kas.tglKas(tanggal, true)} sebelum tanggal mulai kas (${kas.tglKas(atur.mulai, true)}). Transaksi sebelum tanggal itu sudah termasuk saldo awal — kalau memang perlu dicatat, ubah dulu tanggal mulai saldo awal.`)
    if (jenis === 'keluar') {
      const r = kas.saldoTerendah(gerakan, atur.saldoAwal, tanggal)
      if (nominal > r.saldo) {
        throw new Error(r.tanggal === tanggal
          ? `Saldo kas tidak cukup. Saldo per ${kas.tglKas(tanggal, true)} hanya ${rpDemo(r.saldo)}, pengeluaran ${rpDemo(nominal)}.`
          : `Saldo kas tidak cukup. Pengeluaran tanggal ${kas.tglKas(tanggal, true)} paling banyak ${rpDemo(Math.max(0, r.saldo))} supaya saldo tidak minus pada ${kas.tglKas(r.tanggal, true)}.`)
      }
    }
    const baru = { id: 'k' + Date.now(), jenis, tanggal, kategori, nominal, keterangan, nota, dicatat_nama: pencatat || 'Demo', dibuat_pada: new Date().toISOString() }
    kasDemoAwal().push(baru)
    return bentukKas(baru)
  }
  const id = await rpcKas('kas_catat', {
    p_jenis: jenis, p_tanggal: tanggal, p_kategori: kategori, p_nominal: nominal,
    p_keterangan: keterangan || null, p_nota: nota || null,
  })
  return bentukKas({ id, jenis, tanggal, kategori, nominal, keterangan, nota, dicatat_nama: pencatat, dibuat_pada: new Date().toISOString() })
}

/**
 * Catat satu atau beberapa rincian sekaligus (0035).
 *   rincian : [{ uraian, kategori, nominal }]  — pemasukan lain: tepat 1
 *   biayaId / paketId : label kegiatan (opsional, hanya pengeluaran)
 *   nota    : [data URL] maks 3 — diunggah ke Storage dulu
 */
export async function catatKasRincian({ jenis, tanggal, rincian, biayaId = null, paketId = null, nota = [], sekolahId, pencatat }, demo) {
  const total = rincian.reduce((t, r) => t + Number(r.nominal), 0)
  if (modeDemo) {
    const { atur, gerakan } = kasDemo(demo)
    if (tanggal < atur.mulai) throw new Error(`Tanggal ${kas.tglKas(tanggal, true)} sebelum tanggal mulai kas (${kas.tglKas(atur.mulai, true)}). Transaksi sebelum tanggal itu sudah termasuk saldo awal — kalau memang perlu dicatat, ubah dulu tanggal mulai saldo awal.`)
    if (jenis === 'keluar') {
      const r = kas.saldoTerendah(gerakan, atur.saldoAwal, tanggal)
      if (total > r.saldo) {
        throw new Error(r.tanggal === tanggal
          ? `Saldo kas tidak cukup. Saldo per ${kas.tglKas(tanggal, true)} hanya ${rpDemo(r.saldo)}, total pengeluaran ${rpDemo(total)}.`
          : `Saldo kas tidak cukup. Pengeluaran tanggal ${kas.tglKas(tanggal, true)} paling banyak ${rpDemo(Math.max(0, r.saldo))} supaya saldo tidak minus pada ${kas.tglKas(r.tanggal, true)}.`)
      }
    }
    const alamat = await Promise.all(nota.map((d) => unggahNota(d, sekolahId)))
    const grup = rincian.length > 1 || biayaId || paketId || alamat.length ? 'g' + Date.now() : null
    const baru = rincian.map((r, i) => ({
      id: 'k' + Date.now() + '-' + i, jenis, tanggal, kategori: r.kategori, nominal: Number(r.nominal), keterangan: r.uraian || '',
      nota_file: alamat.length ? alamat : null, biaya_id: biayaId, paket_id: paketId, grup,
      dicatat_nama: pencatat || 'Demo', dibuat_pada: new Date(Date.now() + i).toISOString(),
    }))
    kasDemoAwal().push(...baru)
    return { grup, tanggal, total }
  }
  const alamat = []
  try {
    for (const d of nota) alamat.push(await unggahNota(d, sekolahId))
    const grup = await rpcKas('kas_catat_rincian', {
      p_jenis: jenis, p_tanggal: tanggal,
      p_rincian: rincian.map((r) => ({ uraian: (r.uraian || '').trim(), kategori: r.kategori, nominal: Number(r.nominal) })),
      p_biaya: biayaId, p_paket: paketId, p_nota: alamat.length ? alamat : null,
    })
    return { grup, tanggal, total }
  } catch (e) {
    await hapusNotaTakTerpakai(alamat)
    throw e
  }
}

/** Beri / ganti / hapus label kegiatan pengeluaran yang sudah tercatat. */
export async function aturKegiatanKas(id, { biayaId = null, paketId = null, kategori = null }) {
  if (modeDemo) {
    const k = kasDemoAwal().find((x) => x.id === id)
    if (!k || k.dibatalkan_pada) throw new Error('Transaksi tidak ditemukan.')
    if (k.jenis !== 'keluar') throw new Error('Label kegiatan hanya untuk pengeluaran.')
    Object.assign(k, { biaya_id: biayaId, paket_id: paketId, ...(kategori ? { kategori } : {}) })
    return true
  }
  await rpcKas('kas_atur_kegiatan', { p_id: id, p_biaya: biayaId, p_paket: paketId, p_kategori: kategori })
  return true
}

/** Semua pengeluaran SAH berlabel kegiatan → Laporan › Kegiatan. */
export async function kasPengeluaranKegiatan() {
  if (modeDemo) {
    return kasDemoAwal()
      .filter((k) => !k.dibatalkan_pada && k.jenis === 'keluar' && (k.biaya_id || k.paket_id))
      .map((k) => ({
        id: k.id, tanggal: k.tanggal, kategori: k.kategori, nominal: Number(k.nominal), uraian: k.keterangan || '',
        biayaId: k.biaya_id || null, paketId: k.paket_id || null, grup: k.grup || null,
        notaFile: k.nota_file || [], notaLama: !!k.nota, dicatatNama: k.dicatat_nama || '', dibuatPada: k.dibuat_pada || null,
      }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  }
  const d = await rpcKas('kas_pengeluaran_kegiatan')
  return (d || []).map((k) => ({ ...k, nominal: Number(k.nominal), uraian: k.uraian || '', notaFile: k.notaFile || [] }))
}

export async function batalkanKas(id, alasan, oleh, demo) {
  if (modeDemo) {
    const k = kasDemoAwal().find((x) => x.id === id)
    const salinan = { ...k }
    Object.assign(k, { dibatalkan_pada: new Date().toISOString(), dibatalkan_nama: oleh || 'Demo', alasan_batal: alasan })
    if (k.jenis === 'masuk') {
      const { atur, gerakan } = kasDemo(demo)
      const r = kas.saldoTerendah(gerakan, atur.saldoAwal, k.tanggal)
      if (r.saldo < 0) {
        Object.keys(k).forEach((x) => delete k[x])
        Object.assign(k, salinan)
        throw new Error(`Pemasukan ini tidak bisa dibatalkan: saldo kas akan minus (${rpDemo(r.saldo)} pada ${kas.tglKas(r.tanggal, true)}). Uangnya sudah terpakai — batalkan dulu pengeluaran yang memakainya, atau catat pemasukan penggantinya dulu.`)
      }
    }
    return true
  }
  await rpcKas('kas_batalkan', { p_id: id, p_alasan: alasan })
  return true
}

export async function aturSaldoAwalKas(saldo, mulai, demo) {
  if (modeDemo) {
    if (saldo < 0) throw new Error('Saldo awal tidak boleh minus.')
    const awal = kasDemoAwal().filter((k) => !k.dibatalkan_pada).map((k) => k.tanggal).sort()[0]
    if (awal && mulai > awal) throw new Error(`Sudah ada transaksi kas tanggal ${kas.tglKas(awal, true)}. Tanggal mulai saldo awal paling lambat ${kas.tglKas(awal, true)} (atau batalkan dulu transaksi itu).`)
    const lama = { ...mock.kasPengaturanDemo }
    const minLama = kas.saldoTerendah(kasDemo(demo).gerakan, lama.saldo_awal, lama.mulai).saldo
    Object.assign(mock.kasPengaturanDemo, { saldo_awal: saldo, mulai })
    const r = kas.saldoTerendah(kasDemo(demo).gerakan, saldo, mulai)
    if (r.saldo < 0 && r.saldo < minLama) {
      Object.assign(mock.kasPengaturanDemo, lama)
      throw new Error(`Dengan saldo awal ini, saldo kas akan minus (${rpDemo(r.saldo)} pada ${kas.tglKas(r.tanggal, true)}). Periksa lagi nominal saldo awal dan tanggal mulainya.`)
    }
    return true
  }
  await rpcKas('kas_atur_saldo_awal', { p_saldo: saldo, p_mulai: mulai })
  return true
}

function tanggalISOLokal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Peran yang dipakai mode demo ('admin' kecuali diganti lewat localStorage). */
function demoPeran() {
  try {
    return localStorage.getItem('tk_demo_peran') === 'kepala' ? 'kepala' : 'admin'
  } catch {
    return 'admin'
  }
}

function demoHabis() {
  try {
    return localStorage.getItem('tk_demo_habis') === '1'
  } catch {
    return false
  }
}

/* ===================== akun staf (kepala sekolah) ===================== */

/** Pesan layar "akun dinonaktifkan". GuruApp mengenalinya dari awalan kalimatnya. */
export const AWALAN_NONAKTIF = 'Akun Anda dinonaktifkan'
function pesanNonaktif(st = {}) {
  return `${AWALAN_NONAKTIF} oleh ${st.oleh || 'kepala sekolah'}${st.sekolah ? ` (${st.sekolah})` : ''}.`
}

function localStorageAman(kunci) {
  try {
    return localStorage.getItem(kunci)
  } catch {
    return null
  }
}

// Mode demo: daftar akun contoh (perubahan hanya tersimpan selama halaman terbuka).
const akunDemo = [
  { id: 'demo-kepala', nama: 'Bu Kepsek', peran: 'kepala', avatar: 0, aktif: true, email: 'kepsek.tunasceria@gmail.com', bergabung: '2026-07-01T08:00:00+07:00', terakhirMasuk: new Date().toISOString(), saya: true },
  { id: 'demo-rina', nama: 'Bu Rina', peran: 'admin', avatar: 3, aktif: true, email: 'rina.tu@gmail.com', bergabung: '2026-07-02T09:00:00+07:00', terakhirMasuk: new Date(Date.now() - 3 * 3600e3).toISOString() },
  { id: 'demo-opik', nama: 'Pak Opik', peran: 'admin', avatar: 8, aktif: false, email: 'opik.admin@gmail.com', bergabung: '2026-07-05T09:00:00+07:00', terakhirMasuk: '2026-09-10T10:00:00+07:00', dinonaktifkanPada: '2026-09-20T13:00:00+07:00', dinonaktifkanOleh: 'Bu Kepsek' },
]

/** Semua akun di sekolah ini (khusus kepala sekolah). */
export async function daftarAkunSekolah() {
  if (modeDemo) return akunDemo.map((a) => ({ ...a }))
  return panggil('akun_sekolah_daftar')
}

/** Nonaktifkan (aktif=false) atau aktifkan lagi akun Admin/TU. */
export async function aturAkunAktif(id, aktif) {
  if (modeDemo) {
    const a = akunDemo.find((x) => x.id === id)
    if (!a || a.peran === 'kepala') throw new Error('Akun kepala sekolah tidak bisa dinonaktifkan dari sini.')
    Object.assign(a, { aktif, dinonaktifkanPada: aktif ? null : new Date().toISOString(), dinonaktifkanOleh: aktif ? null : 'Bu Kepsek' })
    return { id, aktif }
  }
  return panggil('akun_sekolah_atur_aktif', { p_id: id, p_aktif: aktif })
}


/* ---------- indikator kesehatan keuangan (0037) ---------- */
const PESAN_0037 = 'Pengaturan indikator belum aktif di database. Jalankan file 0037_indikator_kesehatan.sql di Supabase SQL Editor.'
const belum0037 = (e) => /indikator_atur|indikator_riwayat|atur_indikator|schema cache|does not exist/i.test(e?.message || '')
// mode demo: tersimpan di memori selama halaman terbuka
const indikatorDemo = { isi: null, riwayat: [] }

/** Pengaturan tersimpan sekolah ini → { isi | null, diubahNama, diubahPada, belumAktif } */
export async function muatIndikator() {
  if (modeDemo) return { isi: indikatorDemo.isi, diubahNama: indikatorDemo.riwayat[0]?.diubahNama || null, diubahPada: indikatorDemo.riwayat[0]?.diubahPada || null, belumAktif: false }
  const { data, error } = await supabase.from('indikator_atur').select('isi, diubah_nama, diubah_pada').maybeSingle()
  if (error) {
    if (belum0037(error)) return { isi: null, diubahNama: null, diubahPada: null, belumAktif: true }
    throw new Error(error.message)
  }
  return { isi: data?.isi || null, diubahNama: data?.diubah_nama || null, diubahPada: data?.diubah_pada || null, belumAktif: false }
}

/** Simpan pengaturan (khusus kepala sekolah / yang boleh mengelola profil sekolah). */
export async function simpanIndikator(isi, nama = 'Demo') {
  if (modeDemo) {
    indikatorDemo.isi = isi
    indikatorDemo.riwayat.unshift({ isi, diubahNama: nama, diubahPada: new Date().toISOString() })
    return isi
  }
  const { data, error } = await supabase.rpc('atur_indikator', { p_isi: isi })
  if (error) throw new Error(belum0037(error) ? PESAN_0037 : error.message)
  return data
}

/** Perubahan terbaru (baru → lama): [{ isi, diubahNama, diubahPada }] — `n` + 1 supaya entri ke-n bisa dibandingkan. */
export async function riwayatIndikator(n = 10) {
  if (modeDemo) return indikatorDemo.riwayat.slice(0, n + 1)
  const { data, error } = await supabase.from('indikator_riwayat').select('isi, diubah_nama, diubah_pada').order('diubah_pada', { ascending: false }).order('id', { ascending: false }).limit(n + 1)
  if (error) {
    if (belum0037(error)) return []
    throw new Error(error.message)
  }
  return (data || []).map((r) => ({ isi: r.isi, diubahNama: r.diubah_nama, diubahPada: r.diubah_pada }))
}
