/**
 * Baris database → bentuk data yang dipakai layar (siswa dengan rupiah SPP per
 * bulan, kegiatan, paket). Dipisah dari api.js supaya murni (tanpa Supabase)
 * dan bisa dipakai juga oleh skrip uji di folder uji/.
 */
import { waktuTampil, tahunAjaranBerjalan } from './format.js'

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
/** Info kegiatan untuk orang tua (0026_info_kegiatan.sql) — kolom DB → nama di aplikasi. */
export const infoKegiatan = (b) => ({
  tanggal: b.tanggal || null,
  tanggalSelesai: b.tanggal_selesai || null,
  waktu: b.waktu || '',
  lokasi: b.lokasi || '',
  deskripsi: b.deskripsi || '',
  perlengkapan: b.perlengkapan || '',
})

/** Kebalikan infoKegiatan: nama di aplikasi → kolom DB. Teks kosong disimpan NULL. */
export const kolomInfo = (i = {}) => ({
  tanggal: i.tanggal || null,
  tanggal_selesai: (i.tanggal && i.tanggalSelesai && i.tanggalSelesai > i.tanggal) ? i.tanggalSelesai : null,
  waktu: i.waktu?.trim() || null,
  lokasi: i.lokasi?.trim() || null,
  deskripsi: i.deskripsi?.trim() || null,
  perlengkapan: i.perlengkapan?.trim() || null,
})

/** Baris paket_biaya (0033) → bentuk paket di aplikasi (lihat lib/paket.js). */
export const bentukPaket = (k, paketSiswa = []) => ({
  id: k.id,
  jenis: k.jenis,
  tahunAjaran: k.tahun_ajaran,
  nama: k.nama,
  total: k.total,
  rincian: Array.isArray(k.rincian) ? k.rincian : [],
  tahap: Array.isArray(k.tahap) ? k.tahap : [],
  siswaIds: k.siswa || paketSiswa.filter((x) => x.paket_id === k.id).map((x) => x.siswa_id),
})

/** '2026/2027' ± n tahun */
export const geserTa = (ta, n) => { const a = Number(String(ta).slice(0, 4)) + n; return `${a}/${a + 1}` }
/** Bulan (0 = Juli) dari tanggal 'YYYY-MM-DD' */
export const bulanTa = (iso) => { const m = Number(String(iso).slice(5, 7)); return m >= 7 ? m - 7 : m + 5 }

/**
 * Tarif SPP semua tahun ajaran: { '2026/2027': { standar, kelas: { B1: 175000 } } }.
 * Tahun tanpa baris (database sebelum 0042) → nominal sekolah.
 */
/** Target SPP 12 bulan dari satu baris keanggotaan (0 = tidak ditagih). */
export const targetDari = (tarif, k) =>
  Array.from({ length: 12 }, (_, i) => (k && i >= k.mulai && i <= (k.selesai ?? 11) ? tarifKelas(tarif, k.ta, k.kelas) : 0))
/** Kegiatan b ditagihkan ke siswa dengan keanggotaan k? (tanggal kegiatan di dalam masa terdaftar) */
export const wajibKegiatan = (k, b) => !!k && (!b.tanggal || (bulanTa(b.tanggal) >= k.mulai && bulanTa(b.tanggal) <= (k.selesai ?? 11)))

export function bentukTarif(tahunAjaran = [], sekolah) {
  const out = {}
  tahunAjaran.forEach((t) => { out[t.kode] = { standar: Number(t.spp_nominal) || 0, kelas: t.spp_kelas || {} } })
  const kini = tahunAjaranBerjalan()
  if (!out[kini]) out[kini] = { standar: Number(sekolah?.spp_nominal) || 0, kelas: {} }
  return out
}
export const tarifKelas = (tarif, ta, kelas) => {
  const t = tarif[ta] || tarif[tahunAjaranBerjalan()] || { standar: 0, kelas: {} }
  return Number(t.kelas?.[kelas] ?? t.standar) || 0
}

/** Bentuk ringkas siswa di luar daftar aktif (lulus / keluar) — untuk nama di Transaksi & Tagihan. */
export const bentukSiswaLain = (s) => ({
  id: s.id, nama: s.nama, panggilan: s.panggilan || s.nama.split(' ')[0], kelas: s.kelas || '', nis: s.nis || '',
  jenis: s.jenis_kelamin, avatar: Number.isInteger(s.avatar) ? s.avatar : null, foto: s.foto || '',
  status: s.status_siswa || 'aktif', tahunLulus: s.tahun_lulus || null, wali: s.wali || '', hp: s.hp || '',
})

/**
 * ringkasLalu (0044) = { spp: [[siswa, ta, bulan, dibayar]], kegiatan: [[siswa, biaya, dibayar]] }:
 * HANYA tagihan tahun lalu yang belum lunas. Kalau diisi, pembayaran tahun lama tidak ikut
 * ditarik — bulan/kegiatan lama yang tidak disebut dianggap lunas. null = semua pembayaran ditarik (sebelum 0044).
 */
export function bentuk({ sekolah, biaya: semuaBiaya, siswa, pembayaran, wali, paket = [], paketSiswa = [], siswaTahun = null, tahunAjaran = [], ringkasLalu = null }) {
  // SPP disimpan per bulan + tahun ajaran (0041). Data lama tanpa tahun ajaran
  // dianggap tahun ajaran berjalan.
  const taKini = tahunAjaranBerjalan()
  // 0042: kegiatan milik satu tahun ajaran. `biaya` = tahun berjalan (dipakai semua layar
  // seperti sebelumnya), kegiatan tahun lalu hanya untuk tunggakan.
  const taBiaya = (b) => b.tahun_ajaran || taKini
  const biaya = semuaBiaya.filter((b) => taBiaya(b) === taKini)
  const biayaLain = semuaBiaya.filter((b) => taBiaya(b) !== taKini)
  const urutanBiaya = biaya.map((b) => b.id)
  const tarif = bentukTarif(tahunAjaran, sekolah)
  // keanggotaan per siswa (0042). null = database belum 0042 → semua siswa dianggap terdaftar penuh.
  const anggota = new Map()
  ;(siswaTahun || []).forEach((r) => {
    if (!anggota.has(r.siswa_id)) anggota.set(r.siswa_id, [])
    anggota.get(r.siswa_id).push({ ta: r.tahun_ajaran, kelas: r.kelas, mulai: r.mulai ?? 0, selesai: r.selesai ?? null, akhir: r.akhir || null, catatan: r.catatan || '' })
  })
  const target12 = (k) => targetDari(tarif, k)
  const wajibKeg = wajibKegiatan
  const daftarPaket = paket.map((k) => bentukPaket(k, paketSiswa))
  const ringkasSpp = new Map() // siswa → [[ta, bulan, dibayar]]
  const ringkasKeg = new Map() // siswa → { biaya: dibayar }
  if (ringkasLalu) {
    ;(ringkasLalu.spp || []).forEach(([sid, ta, i, d]) => { if (!ringkasSpp.has(sid)) ringkasSpp.set(sid, []); ringkasSpp.get(sid).push([ta, i, Number(d) || 0]) })
    ;(ringkasLalu.kegiatan || []).forEach(([sid, bid, d]) => { if (!ringkasKeg.has(sid)) ringkasKeg.set(sid, {}); ringkasKeg.get(sid)[bid] = Number(d) || 0 })
  }

  const daftarBayar = pembayaran.map((p) => ({
    id: p.id,
    siswaId: p.siswa_id,
    jenis: p.jenis,
    // SPP: 0–11 · kegiatan: urutan di daftar biaya · paket (PMB/DU): id paket
    indeks: p.jenis === 'spp' ? p.periode : p.jenis === 'paket' ? p.paket_id : urutanBiaya.indexOf(p.biaya_id),
    biayaId: p.biaya_id || null,
    tahunAjaran: p.jenis === 'spp' ? p.tahun_ajaran || taKini : null,
    paketId: p.paket_id || null,
    ket: p.keterangan,
    nominal: p.nominal,
    metode: p.metode,
    petugas: p.petugas || '',
    waktu: waktuTampil(p.dibayar_pada),
    tanggal: p.dibayar_pada,
  }))

  const daftarSiswa = siswa.map((s) => {
    const spp = Array(12).fill(0)
    const sppLalu = {} // { '2025/2026': [12] } — tahun ajaran yang sudah lewat
    const kegiatan = biaya.map(() => 0)
    const bayarPaket = {}
    const bayarKegLain = {}
    daftarBayar.forEach((p) => {
      if (p.siswaId !== s.id) return
      if (p.jenis === 'paket') bayarPaket[p.paketId] = (bayarPaket[p.paketId] || 0) + p.nominal
      else if (ringkasLalu && p.jenis === 'kegiatan' && p.indeks < 0) return // tahun lama: dari ringkasan (di bawah)
      else if (ringkasLalu && p.jenis === 'spp' && p.tahunAjaran < taKini) return
      else if (p.jenis === 'kegiatan' && p.indeks < 0) bayarKegLain[p.biayaId] = (bayarKegLain[p.biayaId] || 0) + p.nominal
      else if (p.indeks < 0) return
      else if (p.jenis === 'spp' && p.tahunAjaran === taKini) spp[p.indeks] += p.nominal
      else if (p.jenis === 'spp' && p.tahunAjaran < taKini) (sppLalu[p.tahunAjaran] ||= Array(12).fill(0))[p.indeks] += p.nominal
      else if (p.jenis === 'spp') return // tahun ajaran mendatang: belum ditampilkan
      else kegiatan[p.indeks] += p.nominal
    })
    // keanggotaan & target per bulan (0042)
    const riwayat = siswaTahun ? (anggota.get(s.id) || []).sort((a, b) => (a.ta < b.ta ? -1 : 1)) : null
    const kini = riwayat ? riwayat.find((k) => k.ta === taKini) || null : { ta: taKini, kelas: s.kelas, mulai: 0, selesai: null, akhir: null }
    const depan = riwayat ? riwayat.find((k) => k.ta > taKini) || null : null
    const lalu = riwayat ? riwayat.filter((k) => k.ta < taKini) : []
    const sppTargetLalu = {}
    lalu.forEach((k) => { sppTargetLalu[k.ta] = target12(k) })
    if (ringkasLalu) {
      // tahun lama: anggap lunas, lalu timpa bulan yang masih kurang dengan angka dari server
      lalu.forEach((k) => { sppLalu[k.ta] = [...sppTargetLalu[k.ta]] })
      ;(ringkasSpp.get(s.id) || []).forEach(([ta, i, d]) => { (sppLalu[ta] ||= Array(12).fill(0))[i] = d })
    }
    const kegKurang = ringkasKeg.get(s.id) || {}
    const kegiatanLalu = []
    biayaLain.forEach((b) => {
      const k = lalu.find((x) => x.ta === taBiaya(b))
      const dibayar = ringkasLalu ? kegKurang[b.id] ?? b.nominal : bayarKegLain[b.id] || 0
      if (k && wajibKeg(k, b)) kegiatanLalu.push({ ta: k.ta, biayaId: b.id, nama: b.nama, nominal: b.nominal, dibayar })
    })
    return {
      id: s.id,
      nama: s.nama,
      terdaftar: kini,
      daftarDepan: !kini && depan ? depan : null,
      keanggotaan: riwayat || [],
      sppTarget: target12(kini),
      tarifSpp: tarifKelas(tarif, taKini, kini?.kelas || s.kelas),
      sppTargetLalu: riwayat ? sppTargetLalu : null,
      kegiatanWajib: biaya.map((b) => wajibKeg(kini, b)),
      kegiatanLalu,
      panggilan: s.panggilan || s.nama.split(' ')[0],
      // portal orang tua (0044): anak yang sudah lulus / keluar tetap tampil selama masih menunggak
      status: s.status_siswa || 'aktif',
      tahunLulus: s.tahun_lulus || null,
      jenis: s.jenis_kelamin,
      kelas: s.kelas,
      nis: s.nis,
      wali: s.wali || '',
      hp: s.hp || '',
      guru: s.guru || '',
      avatar: Number.isInteger(s.avatar) ? s.avatar : null,
      foto: s.foto || '',
      spp,
      sppLalu,
      kegiatan,
      paket: bayarPaket,
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
      sppNominal: tarif[taKini].standar,
      // 0042: tarif per tahun ajaran { ta: { standar, kelas: {...} } }
      tarifSpp: tarif,
      taDepan: geserTa(taKini, 1),
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
    biaya: biaya.map((b) => ({ id: b.id, nama: b.nama, nominal: b.nominal, emoji: b.emoji || null, tahunAjaran: taBiaya(b), ...infoKegiatan(b) })),
    // kegiatan tahun ajaran lain (lalu & depan) — Jenis biaya › pilih tahun, salin kegiatan
    biayaLain: biayaLain.map((b) => ({ id: b.id, nama: b.nama, nominal: b.nominal, emoji: b.emoji || null, tahunAjaran: taBiaya(b), urutan: b.urutan, ...infoKegiatan(b) })),
    siswa: daftarSiswa,
    pembayaran: daftarBayar,
    paket: daftarPaket,
    wali: wali || null,
  }
}
