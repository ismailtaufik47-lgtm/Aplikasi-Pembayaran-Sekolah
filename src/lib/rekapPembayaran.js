/**
 * Hitungan laporan pembayaran TAHUN AJARAN BERJALAN — satu sumber untuk layar
 * Laporan › Pembayaran, unduhan PDF/Excel, dan Beranda (v32), supaya angkanya
 * selalu sama di mana pun, dan sama dengan Laporan › Tahunan (server, 0043/0045).
 *
 * Aturan:
 *  • SPP satu bulan: hanya siswa yang DITAGIH bulan itu (tarif kelasnya, masa
 *    terdaftar) — siswa yang masuk belakangan / mendaftar tahun depan tidak
 *    dihitung, siswa yang keluar di tengah tahun tetap dihitung untuk bulan
 *    sebelum ia keluar (pakai `siswaTahunIni` dari store).
 *  • Tunggakan SPP tahun ini: bulan yang SUDAH LEWAT & belum lunas (bulan berjalan
 *    belum dihitung — sama dengan menu Tagihan).
 *  • Uang masuk per bulan: menurut TANGGAL transaksi, hanya di tahun ajaran
 *    berjalan (data yang dimuat juga berisi pembayaran lama milik tunggakan).
 */
import { bulanBerjalan, dibayarSpp, kegiatanLaluBelum, rentangTa, tahunAjaranBerjalan, tanggalKunci, targetSpp, totalTunggakanLalu, tunggakanLalu } from './format.js'

/** Pembayaran yang TANGGALNYA di tahun ajaran ta (bawaan: berjalan). */
export function bayarTahunIni(pembayaran = [], ta = tahunAjaranBerjalan()) {
  const r = rentangTa(ta)
  return pembayaran.filter((p) => {
    const k = tanggalKunci(p.tanggal)
    return k >= r.dari && k <= r.sampai
  })
}

/** SPP bulan ke-i (0 = Juli) tahun berjalan. */
export function sppBulan(siswa, i, nominal = 0) {
  const h = { ditagih: 0, target: 0, masuk: 0, kurang: 0, lunas: 0, sebagian: 0, belum: 0, tingkat: 0 }
  siswa.forEach((s) => {
    const t = targetSpp(s, i, nominal)
    if (!(t > 0)) return
    const d = Math.min(dibayarSpp(s, i), t)
    h.ditagih++
    h.target += t
    h.masuk += d
    if (d >= t) h.lunas++
    else if (d > 0) h.sebagian++
    else h.belum++
  })
  h.kurang = h.target - h.masuk
  h.tingkat = h.ditagih ? Math.round((h.lunas / h.ditagih) * 1000) / 10 : 0
  return h
}

/** Tunggakan SPP tahun ini satu siswa: bulan yang sudah lewat & belum lunas. */
export function tunggakanSppTahunIni(s, nominal = 0, kini = bulanBerjalan()) {
  let t = 0
  for (let i = 0; i < kini; i++) t += Math.max(0, targetSpp(s, i, nominal) - dibayarSpp(s, i))
  return t
}

/** Uang masuk per bulan kalender tahun berjalan: [{ spp, kegiatan, paket, total }] × 12. */
export function masukPerBulan(pembayaran = [], ta = tahunAjaranBerjalan()) {
  const out = Array.from({ length: 12 }, () => ({ spp: 0, kegiatan: 0, paket: 0, total: 0 }))
  bayarTahunIni(pembayaran, ta).forEach((p) => {
    const b = out[bulanBerjalan(new Date(p.tanggal))]
    b[p.jenis === 'spp' ? 'spp' : p.jenis === 'paket' ? 'paket' : 'kegiatan'] += p.nominal
    b.total += p.nominal
  })
  return out
}

/** Ringkasan satu tahun berjalan untuk laporan. siswa = siswaTahunIni. */
export function ringkasTahunIni({ siswa, pembayaran, sppNominal, kini = bulanBerjalan() }) {
  const perSiswa = siswa.map((s) => ({ s, tunggakan: tunggakanSppTahunIni(s, sppNominal, kini) }))
  return {
    tunggakanSpp: perSiswa.reduce((t, x) => t + x.tunggakan, 0),
    menunggak: perSiswa.filter((x) => x.tunggakan > 0).length,
    // tunggakan SPP tahun-tahun lalu (siswa aktif) — ditampilkan terpisah
    tunggakanLalu: siswa.reduce((t, s) => t + totalTunggakanLalu(s, sppNominal), 0),
    masuk: bayarTahunIni(pembayaran).reduce((t, p) => t + p.nominal, 0),
    ditagih: siswa.filter((s) => s.terdaftar || (s.sppTarget || []).some((v) => v > 0)).length,
  }
}

/** Uang masuk tahun ajaran ini per jenis biaya: [{ nama, e, nilai }] terbesar dulu. */
export function pemasukanPerJenis(pembayaran = [], biaya = [], paket = [], { emojiKegiatan = () => '🎈', emojiPaket = {}, ta: kini = tahunAjaranBerjalan() } = {}) {
  const m = new Map()
  const tambah = (kunci, nama, e, n) => { const x = m.get(kunci) || { kunci, nama, e, nilai: 0 }; x.nilai += n; m.set(kunci, x) }
  bayarTahunIni(pembayaran, kini).forEach((p) => {
    // pelunasan SPP tahun lalu dipisah, supaya "Iuran SPP" sama dengan "SPP terkumpul" di Laporan › Tahunan
    if (p.jenis === 'spp') return p.tahunAjaran && p.tahunAjaran !== kini
      ? tambah('spp-lalu', 'Pelunasan SPP tahun lalu', '📅', p.nominal)
      : tambah('spp', 'Iuran SPP', '📅', p.nominal)
    if (p.jenis === 'paket') {
      const pk = paket.find((x) => x.id === p.paketId)
      return tambah('pk-' + p.paketId, pk?.nama || 'PMB / daftar ulang', emojiPaket[pk?.jenis] || '🎒', p.nominal)
    }
    const b = biaya.find((x) => x.id === p.biayaId)
    if (b) return tambah('b-' + b.id, b.nama, emojiKegiatan(b), p.nominal)
    return tambah('lalu', 'Kegiatan tahun lalu', '🎈', p.nominal)
  })
  return [...m.values()].filter((x) => x.nilai > 0).sort((a, b) => b.nilai - a.nilai)
}

/** Siswa yang punya tagihan tahun ini (terdaftar tahun ini, atau masih menunggak tahun lalu) — penyebut status. */
export const siswaBertagihan = (siswa, sppNominal = 0) =>
  siswa.filter((s) => s.terdaftar || tunggakanLalu(s, sppNominal).length || kegiatanLaluBelum(s).length)

/** "Nama (sudah keluar)" untuk siswa yang keluar di tengah tahun. */
export const namaLaporan = (s) => (s.status === 'keluar' ? `${s.nama} (sudah keluar)` : s.nama)

/** Keterangan tarif: "Rp 150.000/bulan" atau "standar Rp 150.000 · kelas B Rp 165.000". */
export function teksTarif(pengaturan) {
  const t = pengaturan.tarifSpp?.[pengaturan.tahunAjaran] || { standar: pengaturan.sppNominal, kelas: {} }
  const k = Object.entries(t.kelas || {})
  const r = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
  return k.length ? `SPP standar ${r(t.standar)} · ${k.map(([x, n]) => `kelas ${x} ${r(n)}`).join(' · ')}` : `${r(t.standar)}/bulan`
}
