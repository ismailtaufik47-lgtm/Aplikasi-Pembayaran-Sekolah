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
import { waktuTampil, tanggalKeTimestamp, tahunAjaranBerjalan } from './format.js'

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
      // Tahun ajaran tidak lagi disimpan per sekolah — dihitung dari tanggal hari ini.
      tahunAjaran: tahunAjaranBerjalan(),
      kepalaSekolah: sekolah.kepala_sekolah || '',
      alamat: sekolah.alamat || '',
      // Nomor WhatsApp sekolah/TU — tujuan tombol WhatsApp di portal orang tua.
      waSekolah: sekolah.wa || '',
      sppNominal: sekolah.spp_nominal,
      tanggalJatuhTempo: sekolah.tanggal_jatuh_tempo,
      rekening: sekolah.rekening || [],
      // Langganan — dipakai lib/langganan.js untuk hitung status di layar.
      // (Kolomnya ikut terbawa karena muatDataGuru select '*' dari sekolah.)
      trialMulai: sekolah.trial_mulai || null,
      langgananSampai: sekolah.langganan_sampai || null,
      // Tarif langganan per siswa aktif per bulan. NULL = pakai tarif
      // default aplikasi (lihat HARGA_PER_SISWA_DEFAULT di lib/langganan.js).
      hargaPerSiswa: sekolah.harga_per_siswa ?? null,
      // TRUE = dinonaktifkan paksa oleh admin aplikasi (lihat 0018_panel_admin.sql).
      dinonaktifkanAdmin: !!sekolah.dinonaktifkan_admin,
    },
    biaya: biaya.map((b) => ({ id: b.id, nama: b.nama, nominal: b.nominal, emoji: b.emoji || null })),
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
  if (modeDemo) return { ...bentuk(mock.bentukDemo()), petugas: 'Bu Rina', peran: 'admin', pinAktif: false, avatarSaya: null }

  const { data: pengguna } = await supabase.auth.getUser()
  const { data: profil, error: eProfil } = await supabase
    .from('profil')
    .select('nama, peran, pin_aktif, avatar, sekolah:sekolah_id (*)')
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
    pinAktif: profil.pin_aktif,
    avatarSaya: Number.isInteger(profil.avatar) ? profil.avatar : null,
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


function pesanSiswa(error) {
  if (error.code === '23505') return 'NIS ini sudah dipakai siswa lain'
  return error.message
}

export async function tambahBiaya({ sekolahId, nama, nominal, urutan, emoji = null }) {
  if (modeDemo) return { id: 'demo-' + Date.now(), nama, nominal, emoji }
  const { data, error } = await supabase
    .from('biaya')
    .insert({ sekolah_id: sekolahId, nama, nominal, urutan, emoji })
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

/** Data kuitansi untuk portal orang tua — dicek lewat token tautan. */
export async function kuitansiPortal(token, id, demo) {
  if (modeDemo || !token) return kuitansiDemo(demo)
  return panggil('kuitansi_portal', { p_token: token, p_id: id })
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

/* ===================== Tanya AI (khusus kepala sekolah) ===================== */

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
    console.error('[Tanya AI]', error.name, error.context || error)
    const status = error.context?.status
    if (status === 404) throw new Error('Tanya AI belum aktif: fungsi "tanya-ai" belum di-deploy ke Supabase (lihat supabase/README.md bagian 6).')
    if (status === 401) throw new Error('Sesi login habis. Silakan keluar lalu masuk lagi.')
    if (error.name === 'FunctionsFetchError') {
      // Fungsi yang belum di-deploy juga jatuh ke sini: browser memblokir
      // jawaban 404 tanpa header CORS, jadi terlihat seperti gagal koneksi.
      throw new Error('Tidak bisa menghubungi fungsi Tanya AI di Supabase. Paling sering karena fungsi "tanya-ai" belum di-deploy (lihat supabase/README.md bagian 6). Kalau sudah, cek koneksi internet.')
    }
    throw new Error(`Server Tanya AI bermasalah (kode ${status || error.name}). Cek log di Dashboard Supabase → Edge Functions → tanya-ai → Logs.`)
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