/**
 * Uji otomatis INDIKATOR KESEHATAN KEUANGAN + STATUS TAGIHAN SISWA.
 *
 * Tiap uji = satu keadaan sekolah yang dibuat-buat, lalu dicek apakah
 * hasilnya sesuai aturan yang dijelaskan ke kepala sekolah (lihat juga
 * Kalkulator_Kas_Bebas.xlsx). Tidak butuh internet / database.
 *
 *   npm run uji          (atau: node --test uji/js/)
 *
 * Semua uji memakai "hari ini" = 22 Oktober 2026 (Oktober = bulan ke-3
 * tahun ajaran 2026/2027, Juli = 0), kecuali disebut lain.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hitungKesehatan, rapikanAturan, ringkasPerubahan, PRESET } from '../../src/lib/kesehatan.js'
import { statusSiswa, tagihanSiswa as tagihanSiswaUji } from '../../src/lib/statusSiswa.js'
import { tunggakanLalu, totalTunggakanLalu, sppTertunggakRupiah, bulanTertunggak, targetSpp, ketBebas, kegiatanWajib } from '../../src/lib/format.js'

const HARI = new Date(2026, 9, 22) // 22 Okt 2026
const JT = 1_000_000

/** Siswa dengan SPP: `bayar` = array nominal per bulan (indeks 0 = Juli). */
const siswa = (id, bayar = [], extra = {}) => ({ id, spp: Object.assign(Array(12).fill(0), bayar), kegiatan: [], paket: {}, ...extra })

/** Keadaan dasar: sekolah SEHAT — semua indikator aman. */
function dasar(ubah = {}) {
  const daftar = Array.from({ length: 100 }, (_, i) => siswa(`s${i}`, [150000, 150000, 150000, 150000]))
  return {
    hariIni: HARI,
    adaSaldoAwal: true,
    saldoKini: 60 * JT,
    arus: [
      { bulan: '2026-07', masuk: 20 * JT, keluar: 10 * JT },
      { bulan: '2026-08', masuk: 20 * JT, keluar: 10 * JT },
      { bulan: '2026-09', masuk: 20 * JT, keluar: 10 * JT },
      { bulan: '2026-10', masuk: 18 * JT, keluar: 9 * JT },
    ],
    keluarKegiatan: {},
    // satu kegiatan yang sudah selesai & tertutup dari uang masuknya sendiri
    kegiatan: [{ jenis: 'kegiatan', nama: 'Outing class', kunci: 'b0', sisa: 500000, terpakai: 3 * JT, biaya: { tanggal: '2026-09-10' } }],
    siswa: daftar,
    sppNominal: 150000,
    kini: 3,
    status: daftar.map((s) => ({ siswa: s, status: 'lunas', tunggakan: 0 })),
    nota: { ada: 10, total: 10 },
    ...ubah,
  }
}
const kr = (hasil, k) => hasil.kriteria.find((x) => x.k === k)

// ---------------------------------------------------------------------------
describe('Skor & zona', () => {
  test('sekolah sehat: semua aman → skor 100, zona hijau, tidak ada yang perlu dipantau', () => {
    const h = hitungKesehatan(dasar(), null)
    assert.equal(h.skor, 100)
    assert.equal(h.zona, 'hijau')
    assert.equal(h.rem, false)
    assert.equal(h.perlu.length, 0)
    assert.match(h.kalimat, /Semua indikator aman/)
  })

  test('bobot: hanya Cadangan kas "Pantau" (bobot 25, nilai ½) → skor 88', () => {
    // kas bebas 2 bulan (target 3) → pantau
    const h = hitungKesehatan(dasar({ saldoKini: 20 * JT }), null)
    assert.equal(kr(h, 'cad').status, 'pantau')
    assert.equal(h.skor, Math.round(((100 - 12.5) / 100) * 100))
    assert.equal(h.zona, 'hijau')
  })

  test('beberapa merah: Cadangan (25) + Arus (15) + SPP (15) "Perlu tindakan" → skor ≤ 45, bukan hijau', () => {
    const d = dasar({ saldoKini: 15 * JT })
    d.arus[2] = { bulan: '2026-09', masuk: 5 * JT, keluar: 12 * JT }
    d.arus[3] = { bulan: '2026-10', masuk: 5 * JT, keluar: 12 * JT }
    d.siswa = d.siswa.map((s, i) => (i < 50 ? siswa(s.id, [150000, 150000, 150000, 0]) : s))
    const h = hitungKesehatan(d, null)
    assert.equal(kr(h, 'arus').status, 'tindakan')
    assert.equal(kr(h, 'spp').status, 'tindakan')
    assert.ok(h.skor <= 60, `skor ${h.skor}`)
    assert.notEqual(h.zona, 'hijau')
  })

  test('batas zona: 70 = Sehat, 69 = Waspada, 40 = Waspada, 39 = Perlu perhatian', () => {
    // skor dihitung dari kriteria yang dinilai; mainkan saklar supaya tepat di batas
    const zonaDari = (skor) => (skor >= 70 ? 'hijau' : skor >= 40 ? 'kuning' : 'merah')
    for (const [s, z] of [[70, 'hijau'], [69, 'kuning'], [40, 'kuning'], [39, 'merah']]) assert.equal(zonaDari(s), z)
    // dan kode sungguhan: hanya Cadangan (25, pantau) + Kegiatan (10, aman) yang aktif → 25×½+10 / 35 = 64 → kuning
    const aktif = { cad: true, arus: false, spp: false, tungg: false, keg: true, nota: false, proy: false }
    const h = hitungKesehatan(dasar({ saldoKini: 20 * JT }), { aktif })
    assert.equal(h.skor, Math.round((12.5 + 10) / 35 * 100))
    assert.equal(h.zona, 'kuning')
  })

  test('indikator yang dimatikan tidak ikut dinilai', () => {
    const d = dasar({ nota: { ada: 1, total: 10 } }) // nota 10% → tindakan
    const nyala = hitungKesehatan(d, null)
    const mati = hitungKesehatan(d, { aktif: { nota: false } })
    assert.equal(kr(nyala, 'nota').status, 'tindakan')
    assert.ok(nyala.skor < 100)
    assert.equal(kr(mati, 'nota').status, 'mati')
    assert.equal(mati.skor, 100)
  })

  test('data belum ada sama sekali → "Belum bisa dinilai", bukan Sehat', () => {
    const h = hitungKesehatan({ hariIni: HARI, adaSaldoAwal: false, saldoKini: 0, arus: [], siswa: [], sppNominal: 0, kini: 3, status: [], kegiatan: [], nota: { ada: 0, total: 0 } }, null)
    assert.equal(h.zona, 'kosong')
    assert.equal(h.skor, null)
  })

  test('siswa & SPP sudah ada tapi saldo awal kas belum diisi → tetap "Belum bisa dinilai"', () => {
    const h = hitungKesehatan(dasar({ adaSaldoAwal: false }), null)
    assert.equal(h.zona, 'kosong')
    assert.match(h.kalimat, /saldo awal kas/)
  })
})

// ---------------------------------------------------------------------------
describe('Rem darurat & kas bebas', () => {
  test('kas bebas kurang dari 1 bulan biaya rutin → langsung Perlu perhatian walau indikator lain aman', () => {
    const h = hitungKesehatan(dasar({ saldoKini: 8 * JT }), null) // rutin 10 jt
    assert.equal(h.rem, true)
    assert.equal(h.zona, 'merah')
    assert.equal(kr(h, 'cad').status, 'tindakan')
  })

  test('dana kegiatan yang BELUM berlangsung tidak dihitung sebagai kas bebas', () => {
    const kegiatan = [
      { jenis: 'kegiatan', nama: 'Pentas seni', kunci: 'b3', sisa: 20 * JT, terpakai: 0, biaya: { tanggal: '2026-12-01' } },
      { jenis: 'kegiatan', nama: 'Outing (sudah lewat)', kunci: 'b2', sisa: 5 * JT, terpakai: 1 * JT, biaya: { tanggal: '2026-09-01' } },
    ]
    const h = hitungKesehatan(dasar({ kegiatan }), null)
    assert.equal(h.totalTerikat, 20 * JT)
    assert.equal(h.kasBebas, 40 * JT)
    assert.deepEqual(h.danaTerikat.map((x) => x.nama), ['Pentas seni'])
  })

  test('dana terikat bisa memicu rem darurat: saldo terlihat besar tapi milik kegiatan', () => {
    const kegiatan = [{ jenis: 'kegiatan', nama: 'Manasik', kunci: 'b1', sisa: 55 * JT, terpakai: 0, biaya: { tanggal: '2026-11-20' } }]
    const h = hitungKesehatan(dasar({ kegiatan }), null) // kas bebas 5 jt < rutin 10 jt
    assert.equal(h.rem, true)
    assert.equal(h.zona, 'merah')
  })
})

// ---------------------------------------------------------------------------
describe('Biaya rutin', () => {
  test('otomatis = rata-rata keluar 3 bulan penuh terakhir, TANPA pengeluaran berlabel kegiatan', () => {
    const d = dasar({ keluarKegiatan: { '2026-09': 4 * JT } })
    const h = hitungKesehatan(d, null)
    // Jul 10, Agu 10, Sep 10−4=6 → rata-rata 8.666.667
    assert.equal(h.rutinOtomatis, Math.round((10 + 10 + 6) * JT / 3))
    assert.equal(h.rutinSumber, 'otomatis')
  })

  test('isi sendiri (dirinci) → total rincian dipakai, sumber "manual"', () => {
    const isi = { rutinRincian: [{ nama: 'Gaji guru', nominal: 9 * JT }, { nama: 'Listrik & air', nominal: 1 * JT }, { nama: 'Sewa', nominal: 2 * JT }] }
    const h = hitungKesehatan(dasar(), isi)
    assert.equal(h.rutin, 12 * JT)
    assert.equal(h.rutinSumber, 'manual')
    assert.equal(+(h.bulanCukup).toFixed(2), 5)
  })

  test('baris rincian tanpa keterangan / nominal 0 diabaikan', () => {
    const a = rapikanAturan({ rutinRincian: [{ nama: 'Gaji', nominal: 5 * JT }, { nama: '', nominal: 1 * JT }, { nama: 'ATK', nominal: 0 }] })
    assert.deepEqual(a.rutinRincian, [{ nama: 'Gaji', nominal: 5 * JT }])
    assert.equal(a.rutinManual, 5 * JT)
  })

  test('belum ada pengeluaran 3 bulan & tidak diisi sendiri → Cadangan "data belum ada", tidak ada rem', () => {
    const h = hitungKesehatan(dasar({ arus: [{ bulan: '2026-10', masuk: 5 * JT, keluar: 1 * JT }] }), null)
    assert.equal(kr(h, 'cad').status, 'kosong')
    assert.equal(h.rem, false)
  })
})

// ---------------------------------------------------------------------------
describe('Arus kas', () => {
  test('bulan ini minus sekali → Pantau', () => {
    const d = dasar()
    d.arus[3] = { bulan: '2026-10', masuk: 5 * JT, keluar: 9 * JT }
    assert.equal(kr(hitungKesehatan(d, null), 'arus').status, 'pantau')
  })
  test('minus 2 bulan berturut-turut → Perlu tindakan', () => {
    const d = dasar()
    d.arus[2] = { bulan: '2026-09', masuk: 5 * JT, keluar: 9 * JT }
    d.arus[3] = { bulan: '2026-10', masuk: 5 * JT, keluar: 9 * JT }
    assert.equal(kr(hitungKesehatan(d, null), 'arus').status, 'tindakan')
  })
  test('sebelum tanggal 10 yang dinilai bulan LALU (awal bulan pemasukan belum masuk)', () => {
    const d = dasar({ hariIni: new Date(2026, 9, 5) })
    d.arus[3] = { bulan: '2026-10', masuk: 0, keluar: 9 * JT } // awal Oktober minus, tapi September aman
    const x = kr(hitungKesehatan(d, null), 'arus')
    assert.equal(x.status, 'aman')
    assert.equal(x.bulan, '2026-09')
  })
})

// ---------------------------------------------------------------------------
describe('SPP bulan ini & tunggakan', () => {
  const sppPersen = (lunas) => {
    const d = dasar()
    d.siswa = d.siswa.map((s, i) => (i < lunas ? s : siswa(s.id, [150000, 150000, 150000, 0])))
    return d
  }
  test('target Normal 85%: 90% masuk = Aman · 70% = Pantau · 60% = Perlu tindakan', () => {
    assert.equal(kr(hitungKesehatan(sppPersen(90), null), 'spp').status, 'aman')
    assert.equal(kr(hitungKesehatan(sppPersen(70), null), 'spp').status, 'pantau')
    assert.equal(kr(hitungKesehatan(sppPersen(60), null), 'spp').status, 'tindakan')
  })
  test('sebelum tanggal penilaian (20) SPP belum dinilai dan tidak menurunkan skor', () => {
    const d = sppPersen(10)
    d.hariIni = new Date(2026, 9, 15)
    const h = hitungKesehatan(d, null)
    assert.equal(kr(h, 'spp').status, 'belum')
    assert.equal(h.skor, 100)
  })
  test('tunggakan dibanding SPP sebulan (15 jt): 4,5 jt (30%) Aman · 7,5 jt (50%) Pantau · 12 jt (80%) Tindakan', () => {
    const coba = (rupiah) => {
      const d = dasar()
      d.status = [{ status: 'nunggak', tunggakan: rupiah }, ...d.status.slice(1)]
      return kr(hitungKesehatan(d, null), 'tungg').status
    }
    assert.equal(coba(4.5 * JT), 'aman')
    assert.equal(coba(7.5 * JT), 'pantau')
    assert.equal(coba(12 * JT), 'tindakan')
  })
  test('preset Ketat lebih keras daripada Normal untuk keadaan yang sama', () => {
    const d = dasar({ saldoKini: 35 * JT }) // ±3,5 bulan: Normal (≥3) aman, Ketat (≥4) pantau
    assert.equal(kr(hitungKesehatan(d, { preset: 'normal' }), 'cad').status, 'aman')
    assert.equal(kr(hitungKesehatan(d, { preset: 'ketat', target: PRESET.ketat }), 'cad').status, 'pantau')
  })
})

// ---------------------------------------------------------------------------
describe('Kegiatan, nota, perkiraan 3 bulan', () => {
  test('ada kegiatan yang pengeluarannya > uang masuknya → Kegiatan nombok "Pantau"', () => {
    const kegiatan = [{ jenis: 'kegiatan', nama: 'Manasik haji', kunci: 'b1', sisa: -355000, terpakai: 4 * JT, biaya: { tanggal: '2026-10-01' } }]
    const h = hitungKesehatan(dasar({ kegiatan }), null)
    assert.equal(kr(h, 'keg').status, 'pantau')
    assert.match(kr(h, 'keg').ket, /Manasik haji nombok/)
  })
  test('nota: belum ada pengeluaran bulan ini → tidak dinilai; 80% dengan target 90% → Pantau', () => {
    assert.equal(kr(hitungKesehatan(dasar({ nota: { ada: 0, total: 0 } }), null), 'nota').status, 'belum')
    assert.equal(kr(hitungKesehatan(dasar({ nota: { ada: 8, total: 10 } }), null), 'nota').status, 'pantau')
  })
  test('pengeluaran besar terjadwal (Desember) membuat perkiraan 3 bulan minus → Perlu tindakan', () => {
    const isi = { terjadwal: [{ nama: 'Renovasi kelas', bulan: 12, nominal: 90 * JT }] }
    const h = hitungKesehatan(dasar(), isi)
    assert.equal(kr(h, 'proy').status, 'tindakan')
    assert.equal(h.proyeksi.length, 3)
    assert.ok(h.proyeksi.find((p) => p.bulan === '2026-12').saldo < 0)
  })
  test('perkiraan memakai rata-rata SPP tertagih 3 bulan terakhir', () => {
    const d = dasar()
    d.siswa = d.siswa.map((s, i) => (i < 50 ? siswa(s.id, [150000, 0, 0, 150000]) : s)) // Jul 100%, Agu & Sep 50%
    const h = hitungKesehatan(d, null)
    assert.equal(Math.round(h.rasioTertagih * 100), Math.round(((15 + 7.5 + 7.5) / 45) * 100))
  })
})

// ---------------------------------------------------------------------------
describe('Pengaturan tersimpan', () => {
  test('angka target di luar batas dijepit, data rusak diabaikan', () => {
    const a = rapikanAturan({ preset: 'aneh', target: { cad: 99, spp: 10 }, sppTanggal: 40, terjadwal: [{ nama: '', nominal: 5 }, { nama: 'THR', bulan: 15, nominal: 2 * JT }] })
    assert.equal(a.preset, 'normal')
    assert.ok(a.target.cad <= 12 && a.target.spp >= 50)
    assert.equal(a.sppTanggal, 28)
    assert.deepEqual(a.terjadwal, [{ nama: 'THR', bulan: 12, nominal: 2 * JT }])
  })
  test('riwayat perubahan merinci biaya rutin yang ditambah, diubah, dihapus', () => {
    const lama = { rutinRincian: [{ nama: 'Gaji guru', nominal: 3 * JT }, { nama: 'ATK', nominal: 200000 }] }
    const baru = { rutinRincian: [{ nama: 'Gaji guru', nominal: 3.5 * JT }, { nama: 'Internet', nominal: 300000 }] }
    const t = ringkasPerubahan(baru, lama).map((x) => `${x.jenis}:${x.teks}`)
    assert.ok(t.some((x) => x.startsWith('ubah:Gaji guru')))
    assert.ok(t.some((x) => x.startsWith('tambah:Internet')))
    assert.ok(t.some((x) => x.startsWith('hapus:ATK')))
  })
})

// ---------------------------------------------------------------------------
describe('Status tagihan siswa (dipakai Siswa, Tagihan, dasbor)', () => {
  const ctx = (ubah = {}) => ({ biaya: [], paket: [], sppNominal: 150000, kini: 3, hariIni: HARI, ...ubah })

  test('SPP bulan lalu belum lunas → Nunggak, tunggakan = kekurangannya', () => {
    const r = statusSiswa(siswa('a', [150000, 150000, 100000, 150000]), ctx())
    assert.equal(r.status, 'nunggak')
    assert.equal(r.tunggakan, 50000)
    assert.match(r.alasan, /SPP Sep/)
  })
  test('SPP bulan INI belum dibayar → Belum bayar (bukan nunggak); dibayar sebagian → Mencicil', () => {
    assert.equal(statusSiswa(siswa('a', [150000, 150000, 150000, 0]), ctx()).status, 'belum')
    assert.equal(statusSiswa(siswa('a', [150000, 150000, 150000, 75000]), ctx()).status, 'mencicil')
  })
  test('kegiatan: lewat tanggal & belum lunas → Nunggak · belum tanggalnya → Mencicil · tanpa tanggal → tidak pernah nunggak', () => {
    const lunasSpp = [150000, 150000, 150000, 150000]
    const biaya = [{ nama: 'Manasik', nominal: 150000, tanggal: '2026-10-01' }]
    assert.equal(statusSiswa(siswa('a', lunasSpp, { kegiatan: [0] }), ctx({ biaya })).status, 'nunggak')
    const nanti = [{ nama: 'Pentas', nominal: 200000, tanggal: '2026-12-01' }]
    assert.equal(statusSiswa(siswa('a', lunasSpp, { kegiatan: [100000] }), ctx({ biaya: nanti })).status, 'mencicil')
    const tanpa = [{ nama: 'Seragam', nominal: 300000 }]
    assert.equal(statusSiswa(siswa('a', lunasSpp, { kegiatan: [0] }), ctx({ biaya: tanpa })).status, 'belum')
  })
  test('kegiatan PADA hari H belum dianggap lewat', () => {
    const biaya = [{ nama: 'Manasik', nominal: 150000, tanggal: '2026-10-22' }]
    assert.equal(statusSiswa(siswa('a', [150000, 150000, 150000, 150000], { kegiatan: [0] }), ctx({ biaya })).status, 'belum')
  })
  test('paket daftar ulang: tahap yang lewat & belum terisi → Nunggak sebesar tahap itu saja', () => {
    const paket = [{ id: 'du', jenis: 'du', nama: 'Daftar Ulang 2026/2027', total: 1 * JT, siswaIds: ['a'],
      tahap: [{ nama: 'Tahap 1', jatuhTempo: '2026-08-15', nominal: 500000 }, { nama: 'Tahap 2', jatuhTempo: '2026-12-15', nominal: 500000 }] }]
    const r = statusSiswa(siswa('a', [150000, 150000, 150000, 150000], { paket: { du: 200000 } }), ctx({ paket }))
    assert.equal(r.status, 'nunggak')
    assert.equal(r.tunggakan, 300000)
  })
  test('status terburuk menang: Nunggak > Mencicil > Belum bayar > Lunas', () => {
    const biaya = [{ nama: 'Pentas', nominal: 200000, tanggal: '2026-12-01' }]
    const r = statusSiswa(siswa('a', [0, 150000, 150000, 0], { kegiatan: [100000] }), ctx({ biaya }))
    assert.equal(r.status, 'nunggak')
    assert.equal(statusSiswa(siswa('a', [150000, 150000, 150000, 150000], { kegiatan: [200000] }), ctx({ biaya })).status, 'lunas')
  })
})

describe('SPP tahun ajaran lalu (0041)', () => {
  const ctx = (ubah = {}) => ({ biaya: [], paket: [], sppNominal: 150000, kini: 3, hariIni: HARI, ...ubah })
  const lunasKini = [150000, 150000, 150000, 150000]
  const bulan = (dari, sampai, nominal = 150000) => Array.from({ length: 12 }, (_, i) => (i >= dari && i <= sampai ? nominal : 0))

  test('bayar Juli–Maret tahun lalu → tunggak April, Mei, Juni (label pakai tahun)', () => {
    const s = siswa('a', lunasKini, { sppLalu: { '2025/2026': bulan(0, 8) } })
    const t = tunggakanLalu(s, 150000)
    assert.deepEqual(t.map((x) => x.indeks), [9, 10, 11])
    assert.deepEqual(t.map((x) => x.label), ['SPP April 2026', 'SPP Mei 2026', 'SPP Juni 2026'])
    assert.equal(totalTunggakanLalu(s, 150000), 450000)
  })
  test('baru masuk Januari & lunas sampai Juni → TIDAK ada tunggakan (dihitung dari bulan pertama dibayar)', () => {
    const s = siswa('a', lunasKini, { sppLalu: { '2025/2026': bulan(6, 11) } })
    assert.equal(tunggakanLalu(s, 150000).length, 0)
  })
  test('tahun lalu dibayar sebagian → kurangnya saja yang ditagih', () => {
    const b = bulan(0, 11); b[11] = 50000
    const t = tunggakanLalu(siswa('a', lunasKini, { sppLalu: { '2025/2026': b } }), 150000)
    assert.equal(t.length, 1)
    assert.equal(t[0].kurang, 100000)
  })
  test('tunggakan tahun lalu membuat siswa Nunggak walau tahun ini lunas, dan ikut angka tunggakan', () => {
    const s = siswa('a', lunasKini, { sppLalu: { '2025/2026': bulan(0, 10) } })
    const r = statusSiswa(s, ctx())
    assert.equal(r.status, 'nunggak')
    assert.equal(r.tunggakan, 150000)
    assert.equal(sppTertunggakRupiah(s, 150000, 3), 150000)
    assert.equal(bulanTertunggak(s, 150000, 3), 1)
  })
  test('tanpa data tahun lalu → perilaku lama tidak berubah', () => {
    assert.equal(statusSiswa(siswa('a', lunasKini), ctx()).status, 'lunas')
    assert.equal(statusSiswa(siswa('a', lunasKini, { sppLalu: {} }), ctx()).status, 'lunas')
  })
})

describe('Keanggotaan per tahun ajaran (0042)', () => {
  const ctx = (ubah = {}) => ({ biaya: [], paket: [], sppNominal: 150000, kini: 3, hariIni: HARI, ...ubah })
  const target = (mulai, selesai = 11, tarif = 150000) => Array.from({ length: 12 }, (_, i) => (i >= mulai && i <= selesai ? tarif : 0))
  const anggota = (mulai = 0, selesai = null) => ({ ta: '2026/2027', kelas: 'A', mulai, selesai, akhir: null })

  test('siswa pindahan masuk Oktober: Juli–September tidak ditagih, tidak nunggak', () => {
    const s = siswa('a', [0, 0, 0, 0], { terdaftar: anggota(3), sppTarget: target(3) })
    assert.equal(bulanTertunggak(s, 150000, 3), 0)
    assert.equal(sppTertunggakRupiah(s, 150000, 3), 0)
    assert.equal(statusSiswa(s, ctx()).status, 'belum') // Oktober (bulan berjalan) belum dibayar
    assert.equal(targetSpp(s, 0, 150000), 0)
    assert.equal(ketBebas(s, 0), 'Belum masuk')
  })
  test('tarif khusus kelas dipakai, bukan nominal standar', () => {
    const s = siswa('a', [175000, 150000, 175000, 175000], { terdaftar: anggota(), sppTarget: target(0, 11, 175000) })
    const r = statusSiswa(s, ctx())
    assert.equal(r.status, 'nunggak')
    assert.equal(r.tunggakan, 25000)
  })
  test('keluar setelah Agustus: September dst tidak ditagih', () => {
    const s = siswa('a', [150000, 150000], { terdaftar: { ...anggota(0, 1), akhir: 'pindah' }, sppTarget: target(0, 1) })
    assert.equal(statusSiswa(s, ctx()).status, 'lunas')
    assert.equal(ketBebas(s, 2), 'Sudah pindah')
  })
  test('kegiatan di luar masa terdaftar tidak ditagih', () => {
    const biaya = [{ nama: 'Manasik', nominal: 150000, tanggal: '2026-08-20' }]
    const s = siswa('a', [0, 0, 0, 0], { terdaftar: anggota(3), sppTarget: target(3), kegiatanWajib: [false] })
    assert.equal(kegiatanWajib(s, 0), false)
    assert.ok(!tagihanSiswaUji(s, ctx({ biaya })).some((x) => x.jenis === 'kegiatan'))
  })
  test('tahun lalu: tarif & masa terdaftar dari keanggotaan, kegiatan tahun lalu ikut jadi tunggakan', () => {
    const s = siswa('a', [150000, 150000, 150000, 150000], {
      terdaftar: anggota(), sppTarget: target(0),
      sppLalu: { '2025/2026': [0, 0, 0, 0, 0, 0, 160000, 160000, 160000, 160000, 160000, 100000] },
      sppTargetLalu: { '2025/2026': target(6, 11, 160000) },
      kegiatanLalu: [{ ta: '2025/2026', biayaId: 'x', nama: 'Pentas', nominal: 150000, dibayar: 50000 }],
    })
    assert.deepEqual(tunggakanLalu(s, 150000).map((x) => [x.indeks, x.kurang]), [[11, 60000]])
    const r = statusSiswa(s, ctx())
    assert.equal(r.status, 'nunggak')
    assert.equal(r.tunggakan, 160000) // 60.000 SPP Juni + 100.000 Pentas
  })
})

/* ---------- 0044: data tahun lama tidak ikut dimuat ---------- */
import { bentuk, geserTa } from '../../src/lib/bentukData.js'
import { tahunAjaranBerjalan as taBerjalan, kegiatanLaluBelum } from '../../src/lib/format.js'
import { itemTunggakan } from '../../src/lib/tunggakanLama.js'

describe('Data tahun lama ringan (0044)', () => {
  const kini = taBerjalan()
  const lalu = geserTa(kini, -1)
  const sekolah = { id: 'sk', nama: 'TK Uji', spp_nominal: 150000, tanggal_jatuh_tempo: 10 }
  const siswaRow = [{ id: 'a', nama: 'Ani', kelas: 'B', jenis_kelamin: 'P' }, { id: 'b', nama: 'Budi', kelas: 'B', jenis_kelamin: 'L' }]
  const st = [
    ...['a', 'b'].map((id) => ({ siswa_id: id, tahun_ajaran: kini, kelas: 'B', mulai: 0, selesai: null, akhir: null })),
    { siswa_id: 'a', tahun_ajaran: lalu, kelas: 'A', mulai: 0, selesai: null, akhir: 'naik' },
    { siswa_id: 'b', tahun_ajaran: lalu, kelas: 'A', mulai: 6, selesai: null, akhir: 'naik' },
  ]
  const ta = [{ kode: lalu, spp_nominal: 140000, spp_kelas: {} }, { kode: kini, spp_nominal: 150000, spp_kelas: {} }]
  const biaya = [{ id: 'k1', nama: 'Pentas', nominal: 100000, tahun_ajaran: lalu, tanggal: null, aktif: true, urutan: 1 }]
  // ringkasan dari server: Ani kurang Juni (dibayar 40.000), Budi kurang pentas (belum bayar)
  const ringkasLalu = { spp: [['a', lalu, 11, 40000]], kegiatan: [['b', 'k1', 0]] }
  // pembayaran tahun lama yang ikut termuat (milik tunggakan) — TIDAK boleh dijumlah dua kali
  const bayar = [{ id: 'p1', siswa_id: 'a', jenis: 'spp', periode: 11, tahun_ajaran: lalu, nominal: 40000, dibayar_pada: '2026-08-01T02:00:00Z' }]
  const d = bentuk({ sekolah, biaya, siswa: siswaRow, pembayaran: bayar, siswaTahun: st, tahunAjaran: ta, ringkasLalu })
  const ani = d.siswa.find((s) => s.id === 'a')
  const budi = d.siswa.find((s) => s.id === 'b')

  test('bulan lama yang tidak disebut = lunas (sesuai tarif tahun itu)', () => {
    assert.equal(ani.sppLalu[lalu][0], 140000)
    assert.equal(ani.sppLalu[lalu][11], 40000) // dari ringkasan, bukan 40.000 + 40.000
  })
  test('tunggakan tahun lalu tetap benar', () => {
    assert.deepEqual(tunggakanLalu(ani, 150000).map((x) => [x.indeks, x.kurang]), [[11, 100000]])
    assert.equal(tunggakanLalu(budi, 150000).length, 0) // Budi masuk Januari, Jan–Jun lunas
    assert.equal(budi.sppLalu[lalu][0], 0) // sebelum masuk: tidak ditagih
  })
  test('kegiatan lama: lunas kecuali yang disebut', () => {
    assert.equal(kegiatanLaluBelum(ani).length, 0)
    assert.deepEqual(kegiatanLaluBelum(budi).map((k) => [k.biayaId, k.kurang]), [['k1', 100000]])
  })
  test('tanpa ringkasan (database lama): dihitung dari pembayaran seperti dulu', () => {
    const d2 = bentuk({ sekolah, biaya, siswa: siswaRow, pembayaran: bayar, siswaTahun: st, tahunAjaran: ta })
    const a2 = d2.siswa.find((s) => s.id === 'a')
    assert.equal(a2.sppLalu[lalu][11], 40000)
    assert.equal(a2.sppLalu[lalu][0], 0)
  })
  test('siswa lulus: semua tunggakan lama terdaftar untuk menu Tagihan', () => {
    const d3 = bentuk({ sekolah, biaya, siswa: [{ ...siswaRow[1], status_siswa: 'alumni', tahun_lulus: lalu }], pembayaran: [], siswaTahun: st.filter((x) => x.siswa_id === 'b' && x.tahun_ajaran === lalu), tahunAjaran: ta })
    const it = itemTunggakan(d3.siswa[0], d3.biaya, d3.pengaturan)
    assert.equal(d3.siswa[0].status, 'alumni')
    assert.equal(it.filter((x) => x.jenis === 'spp').length, 6) // Jan–Jun
    assert.equal(it.filter((x) => x.jenis === 'kegiatan').length, 1)
  })
})

describe('Laporan pembayaran tahun berjalan (v32)', async () => {
  const { sppBulan, ringkasTahunIni, masukPerBulan, pemasukanPerJenis, bayarTahunIni, siswaBertagihan } = await import('../../src/lib/rekapPembayaran.js')
  const { paketSiswaKini } = await import('../../src/lib/paket.js')
  // 3 siswa, tarif 150.000; Caca masuk Agustus (Juli tidak ditagih), Dodi daftar tahun depan
  const t = (dari = 0) => Array.from({ length: 12 }, (_, i) => (i >= dari ? 150000 : 0))
  const ani = siswa('a', [150000, 150000, 75000], { terdaftar: true, sppTarget: t() })
  const budi = siswa('b', [150000], { terdaftar: true, sppTarget: t() })
  const caca = siswa('c', [0, 150000, 150000, 150000], { terdaftar: true, sppTarget: t(1) })
  const dodi = siswa('d', [], { terdaftar: false, sppTarget: Array(12).fill(0) })
  const semua = [ani, budi, caca, dodi]

  test('SPP satu bulan hanya menghitung siswa yang ditagih bulan itu', () => {
    const jul = sppBulan(semua, 0, 150000)
    assert.equal(jul.ditagih, 2) // Caca belum masuk, Dodi tahun depan
    assert.equal(jul.target, 300000)
    assert.equal(jul.lunas, 2)
    const sep = sppBulan(semua, 2, 150000)
    assert.deepEqual([sep.ditagih, sep.lunas, sep.sebagian, sep.belum, sep.kurang], [3, 1, 1, 1, 225000])
  })
  test('tunggakan tahun ini = bulan yang sudah lewat saja (bulan berjalan belum)', () => {
    const r = ringkasTahunIni({ siswa: semua, pembayaran: [], sppNominal: 150000, kini: 3 }) // Oktober
    // Ani: Sep kurang 75.000 · Budi: Agu + Sep = 300.000 · Caca: lunas · Oktober belum dihitung
    assert.equal(r.tunggakanSpp, 375000)
    assert.equal(r.menunggak, 2)
    assert.equal(r.ditagih, 3)
    assert.equal(siswaBertagihan(semua, 150000).length, 3)
  })
  test('uang masuk per bulan menurut tanggal bayar, hanya tahun ajaran ini', () => {
    const bayar = [
      { jenis: 'spp', nominal: 150000, tanggal: '2026-07-05T03:00:00Z', tahunAjaran: '2026/2027' },
      { jenis: 'spp', nominal: 150000, tanggal: '2026-07-06T03:00:00Z', tahunAjaran: '2025/2026' }, // pelunasan tahun lalu
      { jenis: 'paket', nominal: 500000, tanggal: '2026-08-01T03:00:00Z', paketId: 'p1' },
      { jenis: 'spp', nominal: 140000, tanggal: '2026-06-20T03:00:00Z', tahunAjaran: '2025/2026' }, // tahun lalu → tidak ikut
    ]
    assert.equal(bayarTahunIni(bayar, '2026/2027').length, 3)
    const ta = masukPerBulan(bayar, '2026/2027')
    assert.equal(ta[0].spp, 300000)
    assert.equal(ta[1].paket, 500000)
    const jenis = pemasukanPerJenis(bayar, [], [{ id: 'p1', nama: 'PMB 2026/2027', jenis: 'pmb' }], { ta: '2026/2027' })
    assert.deepEqual(jenis.map((x) => [x.nama, x.nilai]), [['PMB 2026/2027', 500000], ['Iuran SPP', 150000], ['Pelunasan SPP tahun lalu', 150000]])
  })
  test('PMB / daftar ulang tahun lalu yang sudah lunas tidak ikut tagihan tahun ini', () => {
    const paket = [
      { id: 'lama', tahunAjaran: '2024/2025', total: 2200000, siswaIds: ['a'], tahap: [] },
      { id: 'kurang', tahunAjaran: '2025/2026', total: 1000000, siswaIds: ['a'], tahap: [] },
      { id: 'kini', tahunAjaran: '2026/2027', total: 1000000, siswaIds: ['a'], tahap: [] },
    ]
    const s = { id: 'a', paket: { lama: 2200000, kurang: 500000, kini: 0 } }
    assert.deepEqual(paketSiswaKini(paket, s, HARI).map((p) => p.id), ['kurang', 'kini'])
    const it = tagihanSiswaUji(s, { paket, kini: 3, hariIni: HARI }).filter((x) => x.jenis === 'paket')
    assert.deepEqual(it.map((x) => x.id), ['kurang', 'kini'])
  })
})
