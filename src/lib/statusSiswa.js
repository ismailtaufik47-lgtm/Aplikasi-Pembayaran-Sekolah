/**
 * Status tagihan SATU SISWA — aturannya sama persis dengan menu Tagihan:
 *
 *   nunggak  : ada tagihan yang sudah lewat jatuh tempo & belum lunas
 *              (SPP bulan yang sudah lewat · kegiatan yang tanggalnya sudah
 *              lewat · tahap PMB/daftar ulang yang lewat jatuh tempo)
 *   mencicil : tidak ada yang lewat, tapi ada yang baru dibayar sebagian
 *   belum    : tidak ada yang lewat, ada tagihan berjalan yang belum dibayar
 *   lunas    : semua tagihan yang sudah ditagihkan beres
 *
 * Status siswa = status TERBURUK dari semua tagihannya. Kolom "Tunggakan"
 * = jumlah rupiah yang berstatus nunggak saja, jadi "Nunggak" muncul kalau
 * dan hanya kalau Tunggakan > 0.
 */
import { BULAN, kegiatanLaluBelum, kegiatanWajib, rp, taPendek, targetSpp, tunggakanLalu } from './format.js'
import { dibayarPaket, kurangSekarangPaket, paketSiswa, statusPaket, sudahLewat, tahapPaket } from './paket.js'

export const STATUS_TAGIHAN = {
  nunggak: { label: 'Nunggak', chip: 'red', permen: 'pink', urut: 0 },
  mencicil: { label: 'Mencicil', chip: 'amber', permen: 'kuning', urut: 1 },
  belum: { label: 'Belum bayar', chip: 'grey', permen: 'biru', urut: 2 },
  lunas: { label: 'Lunas', chip: 'green', permen: 'tosca', urut: 3 },
}
export const URUTAN_STATUS = ['nunggak', 'mencicil', 'belum', 'lunas']

/** Kegiatan dianggap jatuh tempo pada TANGGAL KEGIATANNYA (kalau diisi). */
export const kegiatanLewat = (b, hariIni = new Date()) => !!b?.tanggal && sudahLewat(b.tanggal, hariIni)

const pendekBulan = (i) => BULAN[i].slice(0, 3)

/**
 * Semua tagihan berjalan satu siswa: [{ jenis, label, status, kurang }].
 * `kurang` untuk paket yang nunggak = tahap yang sudah lewat saja.
 */
export function tagihanSiswa(s, { biaya = [], paket = [], sppNominal = 0, kini, hariIni = new Date() }) {
  // SPP tahun ajaran yang sudah lewat & belum lunas → selalu Nunggak
  const out = tunggakanLalu(s, sppNominal).map((x) => ({ jenis: 'spp', ta: x.ta, indeks: x.indeks, label: x.label, status: 'nunggak', kurang: x.kurang }))
  // kegiatan tahun ajaran lalu yang belum lunas (0042) → Nunggak
  kegiatanLaluBelum(s).forEach((k) => out.push({ jenis: 'kegiatan', ta: k.ta, biayaId: k.biayaId, label: `${k.nama} ${taPendek(k.ta)}`, status: 'nunggak', kurang: k.kurang, dibayar: k.dibayar }))
  for (let i = 0; i <= kini; i++) {
    const d = s.spp?.[i] || 0
    const t = targetSpp(s, i, sppNominal)
    if (t <= 0) continue // bulan sebelum masuk / sesudah keluar (0042)
    if (d >= t) { out.push({ jenis: 'spp', indeks: i, label: `SPP ${BULAN[i]}`, status: 'lunas', kurang: 0 }); continue }
    out.push({
      jenis: 'spp', indeks: i, label: `SPP ${BULAN[i]}`, kurang: t - d,
      status: i < kini ? 'nunggak' : d > 0 ? 'mencicil' : 'belum',
    })
  }
  biaya.forEach((b, i) => {
    if (!kegiatanWajib(s, i)) return // tidak ditagihkan ke siswa ini (0042)
    const d = s.kegiatan?.[i] || 0
    const nominal = Number(b.nominal) || 0
    if (nominal <= 0 || d >= nominal) { out.push({ jenis: 'kegiatan', indeks: i, label: b.nama, status: 'lunas', kurang: 0 }); return }
    out.push({
      jenis: 'kegiatan', indeks: i, label: b.nama, kurang: nominal - d, dibayar: d,
      status: kegiatanLewat(b, hariIni) ? 'nunggak' : d > 0 ? 'mencicil' : 'belum',
    })
  })
  paketSiswa(paket, s.id).forEach((p) => {
    const d = dibayarPaket(s, p.id)
    const st = statusPaket(p, d, hariIni)
    const tahap = tahapPaket(p, d, hariIni)
    const telat = tahap.filter((t) => t.lewat && !t.lunas)
    const lunasTahap = tahap.filter((t) => t.lunas).length
    out.push({
      jenis: 'paket', id: p.id, paketJenis: p.jenis, label: p.nama,
      status: st === 'terlambat' ? 'nunggak' : st,
      kurang: st === 'terlambat' ? kurangSekarangPaket(p, d, hariIni) : Math.max(0, p.total - d),
      tahapTelat: telat.map((t) => t.nama), lunasTahap, jumlahTahap: tahap.length,
    })
  })
  return out
}

/** Gabungkan nama bulan SPP berurutan: "SPP Agu–Sep" / "SPP Sep". */
function ringkasSpp(semua) {
  // tahun ajaran lalu: "SPP 2025/26 Apr–Jun" (per tahun ajaran)
  const lalu = [...new Set(semua.filter((x) => x.ta).map((x) => x.ta))].map((ta) => {
    const idx = semua.filter((x) => x.ta === ta).map((x) => x.indeks).sort((a, b) => a - b)
    const a = idx[0]
    const z = idx[idx.length - 1]
    const rentang = idx.length === 1 ? pendekBulan(a) : z - a + 1 === idx.length ? `${pendekBulan(a)}–${pendekBulan(z)}` : `${idx.length} bulan`
    return `SPP ${taPendek(ta)} ${rentang}`
  })
  const items = semua.filter((x) => !x.ta)
  if (!items.length) return lalu
  const idx = items.map((x) => x.indeks).sort((a, b) => a - b)
  const a = idx[0]
  const z = idx[idx.length - 1]
  const berurut = z - a + 1 === idx.length
  if (idx.length === 1) return [...lalu, `SPP ${pendekBulan(a)}`]
  return [...lalu, berurut ? `SPP ${pendekBulan(a)}–${pendekBulan(z)}` : `SPP ${idx.length} bulan`]
}

function alasanNunggak(items) {
  const bagian = [
    ...ringkasSpp(items.filter((x) => x.jenis === 'spp')),
    ...items.filter((x) => x.jenis === 'kegiatan').map((x) => x.label),
    ...items.filter((x) => x.jenis === 'paket').map((x) => (x.tahapTelat?.length ? `${x.label.replace(/\s\d{4}\/\d{4}$/, '')} ${x.tahapTelat[0].toLowerCase()}` : x.label)),
  ]
  return bagian.length > 3 ? `${bagian.slice(0, 2).join(' · ')} +${bagian.length - 2} lagi` : bagian.join(' · ')
}

/**
 * → { status, tunggakan, alasan, items }
 *   tunggakan : rupiah yang sudah lewat jatuh tempo (dasar status Nunggak)
 *   alasan    : kalimat pendek di bawah chip, mis. "SPP Sep · Daftar ulang tahap 2"
 */
export function statusSiswa(s, ctx) {
  const items = tagihanSiswa(s, ctx)
  const nunggak = items.filter((x) => x.status === 'nunggak')
  const tunggakan = nunggak.reduce((t, x) => t + x.kurang, 0)
  if (nunggak.length) return { status: 'nunggak', tunggakan, alasan: alasanNunggak(nunggak), items }
  const cicil = items.filter((x) => x.status === 'mencicil')
  if (cicil.length) {
    const x = cicil[0]
    const alasan = x.jenis === 'paket' && x.jumlahTahap
      ? `${x.label.replace(/\s\d{4}\/\d{4}$/, '')}: tahap ${x.lunasTahap} dari ${x.jumlahTahap} lunas`
      : `${x.label} kurang ${rp(x.kurang)}`
    return { status: 'mencicil', tunggakan: 0, alasan: cicil.length > 1 ? `${alasan} +${cicil.length - 1} lagi` : alasan, items }
  }
  const belum = items.filter((x) => x.status === 'belum')
  if (belum.length) {
    const nama = [...ringkasSpp(belum.filter((x) => x.jenis === 'spp')), ...belum.filter((x) => x.jenis !== 'spp').map((x) => x.label)]
    return { status: 'belum', tunggakan: 0, alasan: nama.length > 2 ? `${nama.slice(0, 2).join(' · ')} +${nama.length - 2} lagi` : nama.join(' · '), items }
  }
  return { status: 'lunas', tunggakan: 0, alasan: 'Semua tagihan beres', items }
}
