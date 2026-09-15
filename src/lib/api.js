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
import { waktuTampil, tanggalKeTimestamp } from './format.js'

export { modeDemo }

/* ===================== pembentuk bentuk data UI ===================== */

/**
 * Mengubah baris database menjadi bentuk yang dipakai komponen.
 *
 * `spp`/`kegiatan` di sini bukan boolean lunas/belum, tapi RUPIAH yang
 * sudah dibayar per bulan/kegiatan — dijumlahkan dari semua baris
 * pembayaran siswa itu. Ini yang memungkinkan pembayaran sebagian
 * (cicilan): satu bulan boleh punya beberapa transaksi kecil, dan
 * jumlahnya di sini selalu sinkron dengan total transaksinya, karena
 * memang dihitung ulang dari situ setiap kali data dimuat.
 */
function bentuk({ sekolah, biaya, siswa, pembayaran, wali }) {
  const urutanBiaya = biaya.map((b) => b.id)

  const daftarBayar = pembayaran.map((p) => ({
    id: p.id,
    siswaId: p.siswa_id,
    jenis: p.jenis,
    indeks: p.jenis === 'spp' ? p.periode : urutanBiaya.indexOf(p.biaya_id),
    ket: p.keterangan,
    nominal: p.nominal,
    metode: p.metode,
    petugas: p.petugas || '',
    waktu: waktuTampil(p.dibayar_pada),
    tanggal: p.dibayar_pada,
  }))

  const daftarSiswa = siswa.map((s) => {
    const spp = Array(12).fill(0)
    const kegiatan = biaya.map(() => 0)
    daftarBayar.forEach((p) => {
      if (p.siswaId !== s.id || p.indeks < 0) return
      if (p.jenis === 'spp') spp[p.indeks] += p.nominal
      else kegiatan[p.indeks] += p.nominal
    })
    return {
      id: s.id,
      nama: s.nama,
      panggilan: s.panggilan || s.nama.split(' ')[0],
      jenis: s.jenis_kelamin,
      kelas: s.kelas,
      nis: s.nis,
      wali: s.wali || '',
      hp: s.hp || '',
      guru: s.guru || '',
      avatar: Number.isInteger(s.avatar) ? s.avatar : null,
      foto: s.foto || '',
      spp,
      kegiatan,
    }
  })

  return {
    pengaturan: {
      id: sekolah.id,
      namaSekolah: sekolah.nama,
      tahunAjaran: sekolah.tahun_ajaran,
      sppNominal: sekolah.spp_nominal,
      tanggalJatuhTempo: sekolah.tanggal_jatuh_tempo,
      rekening: sekolah.rekening || [],
    },
    biaya: biaya.map((b) => ({ id: b.id, nama: b.nama, nominal: b.nominal })),
    siswa: daftarSiswa,
    pembayaran: daftarBayar,
    wali: wali || null,
  }
}

/* ===================== baca ===================== */

/** Dipakai panel guru. Membutuhkan sesi login yang aktif. */
export async function muatDataGuru() {
  // 'admin' dipilih supaya mode demo menunjukkan kemampuan paling lengkap
  // (catat pembayaran + kode aktivasi). Untuk mencoba tampilan kepala
  // sekolah yang lebih terbatas, ganti sementara jadi 'kepala' di sini.
  if (modeDemo) return { ...bentuk(mock.bentukDemo()), petugas: 'Bu Rina', peran: 'admin' }

  const { data: pengguna } = await supabase.auth.getUser()
  const { data: profil, error: eProfil } = await supabase
    .from('profil')
    .select('nama, peran, sekolah:sekolah_id (*)')
    .eq('id', pengguna.user.id)
    .single()

  if (eProfil) throw new Error('Akun ini belum terhubung ke sekolah mana pun')

  const sekolahId = profil.sekolah.id
  const [siswa, biaya, pembayaran] = await Promise.all([
    supabase.from('siswa').select('*').eq('sekolah_id', sekolahId).eq('aktif', true).order('nama'),
    supabase.from('biaya').select('*').eq('sekolah_id', sekolahId).eq('aktif', true).order('urutan'),
    supabase.from('pembayaran').select('*').eq('sekolah_id', sekolahId).order('dibayar_pada', { ascending: false }),
  ])

  const gagal = [siswa, biaya, pembayaran].find((r) => r.error)
  if (gagal) throw new Error(gagal.error.message)

  return {
    ...bentuk({
      sekolah: profil.sekolah,
      biaya: biaya.data,
      siswa: siswa.data,
      pembayaran: pembayaran.data,
    }),
    petugas: profil.nama,
    peran: profil.peran,
  }
}

/** Dipakai portal orang tua. Tanpa login, cukup token dari URL. */
export async function muatDataPortal(token) {
  if (modeDemo) {
    const d = bentuk(mock.bentukDemo())
    const anak = d.siswa.filter((s) => mock.waliDemo.anak.includes(s.id))
    return { ...d, siswa: anak, wali: { nama: mock.waliDemo.nama, anak: anak.map((s) => s.id) } }
  }

  if (!token) throw new Error('Tautan portal tidak lengkap. Minta tautan baru ke pihak sekolah.')

  const { data, error } = await supabase.rpc('portal_wali', { p_token: token })
  if (error) throw new Error(error.message)

  const hasil = bentuk({
    sekolah: data.sekolah,
    biaya: data.biaya,
    siswa: data.siswa,
    pembayaran: data.pembayaran,
  })
  // Nama yang ditampilkan di portal diambil dari siswa.wali (nama orang tua
  // yang diisi/diperbarui guru), bukan dari tabel wali.nama (nama akun token
  // yang dibuat sekali saat link digenerate dan tidak ikut terupdate).
  // Kalau ada lebih dari satu anak, ambil nama wali dari anak pertama.
  const namaWali = hasil.siswa[0]?.wali || data.wali.nama || 'Orang tua'
  return { ...hasil, wali: { nama: namaWali, anak: hasil.siswa.map((s) => s.id) } }
}

/* ===================== tulis (khusus guru) ===================== */

export async function catatPembayaran({ sekolahId, siswaId, jenis, periode, biayaId, keterangan, nominal, metode, petugas, tanggal }) {
  const dibayarPada = tanggalKeTimestamp(tanggal) // undefined kalau tanggal tidak diisi -> kolom pakai default now()
  if (modeDemo) return { id: 'demo-' + Date.now(), dibayar_pada: dibayarPada || new Date().toISOString() }

  const { data: pengguna } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('pembayaran')
    .insert({
      sekolah_id: sekolahId,
      siswa_id: siswaId,
      jenis,
      periode: jenis === 'spp' ? periode : null,
      biaya_id: jenis === 'kegiatan' ? biayaId : null,
      keterangan,
      nominal,
      metode,
      petugas,
      dicatat_oleh: pengguna.user?.id ?? null,
      ...(dibayarPada ? { dibayar_pada: dibayarPada } : {}),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function hapusPembayaran(id) {
  if (modeDemo) return true
  const { error } = await supabase.from('pembayaran').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return true
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

function pesanSiswa(error) {
  if (error.code === '23505') return 'NIS ini sudah dipakai siswa lain'
  return error.message
}

export async function tambahBiaya({ sekolahId, nama, nominal, urutan }) {
  if (modeDemo) return { id: 'demo-' + Date.now(), nama, nominal }
  const { data, error } = await supabase
    .from('biaya')
    .insert({ sekolah_id: sekolahId, nama, nominal, urutan })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
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
export async function simpanPengaturan({ id, namaSekolah, tahunAjaran, sppNominal, tanggalJatuhTempo, rekening }) {
  if (modeDemo) return true
  const patch = {}
  if (namaSekolah !== undefined) patch.nama = namaSekolah
  if (tahunAjaran !== undefined) patch.tahun_ajaran = tahunAjaran
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

/* ===================== autentikasi ===================== */

/**
 * Memulai login Google. Supabase mengarahkan browser ke Google, lalu
 * kembali ke `redirectTo` setelah berhasil — sesi baru muncul lewat
 * `onAuthStateChange` di auth.jsx, bukan lewat nilai balik fungsi ini.
 */
export async function masukGoogle() {
  if (modeDemo) return { url: null }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(pesanAuth(error.message))
  return data
}

export async function keluar() {
  if (modeDemo) return true
  await supabase.auth.signOut()
  return true
}

function pesanAuth(pesan) {
  if (/provider is not enabled/i.test(pesan))
    return 'Login Google belum diaktifkan untuk aplikasi ini. Hubungi admin sekolah.'
  return pesan
}

/* ===================== onboarding (akun baru) ===================== */

/**
 * Dipanggil saat akun Google baru memilih "Saya kepala sekolah/admin".
 * Membuat sekolah baru dan menghubungkan akun ke situ sebagai kepala.
 */
export async function daftarkanSekolah({ nama, tahunAjaran }) {
  if (modeDemo) return { sekolahId: 'demo', nama, peran: 'kepala' }
  const { data, error } = await supabase.rpc('daftarkan_sekolah', {
    p_nama: nama,
    p_tahun_ajaran: tahunAjaran || null,
  })
  if (error) throw new Error(pesanOnboarding(error.message))
  return data
}

/**
 * Dipanggil saat akun Google baru memilih "Saya guru/TU" dan memasukkan
 * kode aktivasi yang didapat dari kepala sekolah.
 */
export async function aktivasiKode(kode) {
  if (modeDemo) return { sekolahId: 'demo', sekolah: 'Sekolah Demo', peran: 'guru' }
  const { data, error } = await supabase.rpc('aktivasi_kode', {
    p_kode: (kode || '').trim().toUpperCase(),
  })
  if (error) throw new Error(pesanOnboarding(error.message))
  return data
}

/** Dipanggil kepala sekolah/admin dari dasbornya untuk membuat kode baru. */
export async function buatKodeAktivasi(peran = 'guru') {
  if (modeDemo) return { kode: 'DEMO01', peran }
  const { data, error } = await supabase.rpc('buat_kode_aktivasi', { p_peran: peran })
  if (error) throw new Error(error.message)
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