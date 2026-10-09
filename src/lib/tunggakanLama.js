/**
 * Tunggakan siswa yang sudah lulus / keluar — versi MODE DEMO (tanpa database).
 * Bentuk hasilnya sama dengan tunggakan_nonaktif() di 0044.
 */
import { bulanBerjalan, sudahLewatJatuhTempo, tahunAjaranBerjalan } from './format.js'

/** Semua tagihan siswa (bentuk dari bentukData) yang belum lunas: tahun lalu + tahun ini yang sudah jatuh tempo. */
export function itemTunggakan(s, biaya, pengaturan, hariIni = new Date()) {
  const kini = tahunAjaranBerjalan(hariIni)
  const bln = bulanBerjalan(hariIni) + (sudahLewatJatuhTempo(pengaturan.tanggalJatuhTempo, hariIni) ? 1 : 0)
  const out = []
  Object.keys(s.sppTargetLalu || {}).sort().forEach((ta) => {
    const tg = s.sppTargetLalu[ta]
    const b = s.sppLalu?.[ta] || []
    tg.forEach((t, i) => { if (t > 0 && (b[i] || 0) < t) out.push({ jenis: 'spp', ta, i, biayaId: null, nama: null, target: t, dibayar: b[i] || 0 }) })
  })
  ;(s.kegiatanLalu || []).forEach((k) => {
    if (k.dibayar < k.nominal) out.push({ jenis: 'kegiatan', ta: k.ta, i: null, biayaId: k.biayaId, nama: k.nama, target: k.nominal, dibayar: k.dibayar })
  })
  ;(s.sppTarget || []).forEach((t, i) => {
    if (i < bln && t > 0 && (s.spp[i] || 0) < t) out.push({ jenis: 'spp', ta: kini, i, biayaId: null, nama: null, target: t, dibayar: s.spp[i] || 0 })
  })
  biaya.forEach((b, i) => {
    const lewat = b.tanggal && new Date(b.tanggal + 'T00:00:00') < hariIni
    if (lewat && s.kegiatanWajib?.[i] && (s.kegiatan[i] || 0) < b.nominal) {
      out.push({ jenis: 'kegiatan', ta: kini, i: null, biayaId: b.id, nama: b.nama, target: b.nominal, dibayar: s.kegiatan[i] || 0 })
    }
  })
  return out.sort((a, b) => (a.ta < b.ta ? -1 : a.ta > b.ta ? 1 : a.jenis === b.jenis ? (a.i ?? 0) - (b.i ?? 0) : a.jenis === 'spp' ? -1 : 1))
}

/** d = hasil bentuk() berisi siswa lulus/keluar saja → bentuk tunggakan_nonaktif(). */
export function tunggakanNonaktifDemo(d) {
  return d.siswa
    .map((s) => {
      const item = itemTunggakan(s, d.biaya, d.pengaturan)
      const k = (s.keanggotaan || [])[s.keanggotaan.length - 1]
      return {
        id: s.id, nama: s.nama, panggilan: s.panggilan, nis: s.nis, kelas: k?.kelas || s.kelas, status: s.status, tahunLulus: s.tahunLulus,
        akhir: k?.akhir || null, jenis: s.jenis, avatar: s.avatar, foto: s.foto, wali: s.wali, hp: s.hp,
        total: item.reduce((t, x) => t + x.target - x.dibayar, 0), item,
      }
    })
    .filter((x) => x.item.length)
    .sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama))
}
