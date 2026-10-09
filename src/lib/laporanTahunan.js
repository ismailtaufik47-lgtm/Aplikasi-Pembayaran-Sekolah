/**
 * Laporan satu tahun ajaran — versi MODE DEMO (tanpa database).
 * Bentuk hasilnya sama dengan fungsi laporan_tahunan() di 0043, supaya
 * layar Laporan › Tahun ajaran bisa dicoba tanpa server.
 */
import { bulanBerjalan, sudahLewatJatuhTempo, tahunAjaranBerjalan } from './format.js'
import { tarifKelas, targetDari, wajibKegiatan } from './bentukData.js'

const jumlah = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0)

/**
 * d: { ta, siswa, biaya, biayaLain, paket, pembayaran, tarif, tanggalJatuhTempo, kas }
 *   kas: { saldoAwal, saldoAkhir, perBulan: [{ bulan, masuk, keluar }], masukPerKategori, keluarPerKategori } | null
 */
export function laporanTahunanDemo(d) {
  const ta = d.ta
  const kini = tahunAjaranBerjalan()
  const berjalan = ta === kini
  const y = Number(ta.slice(0, 4))
  const hariIni = new Date()
  const bln = !berjalan ? 12 : bulanBerjalan(hariIni) + (sudahLewatJatuhTempo(d.tanggalJatuhTempo, hariIni) ? 1 : 0)
  const t = d.tarif[ta] || d.tarif[kini] || { standar: 0, kelas: {} }

  // siswa yang terdaftar di tahun ini + target & bayar SPP per bulan
  const st = d.siswa
    .map((s) => {
      const k = (s.keanggotaan || []).find((x) => x.ta === ta) || (berjalan ? s.terdaftar : null)
      if (!k) return null
      const target = berjalan ? s.sppTarget || targetDari(d.tarif, k) : s.sppTargetLalu?.[ta] || targetDari(d.tarif, k)
      const bayar = berjalan ? s.spp : s.sppLalu?.[ta] || Array(12).fill(0)
      return { s, k, target, bayar, tarif: tarifKelas(d.tarif, ta, k.kelas) }
    })
    .filter(Boolean)

  const perBulan = Array.from({ length: 12 }, (_, i) => {
    const di = st.filter((x) => x.target[i] > 0)
    return {
      i, ditagih: di.length,
      target: jumlah(di, (x) => x.target[i]),
      masuk: jumlah(di, (x) => x.bayar[i] || 0),
      lunas: di.filter((x) => (x.bayar[i] || 0) >= x.target[i]).length,
      sebagian: di.filter((x) => (x.bayar[i] || 0) > 0 && (x.bayar[i] || 0) < x.target[i]).length,
    }
  })
  const kurangSpp = (x) => jumlah(x.target.map((v, i) => (i < bln ? Math.max(0, v - (x.bayar[i] || 0)) : 0)))
  const kelasList = [...new Set(st.map((x) => x.k.kelas))].sort()

  // kegiatan tahun ini
  const keg = berjalan ? d.biaya.map((b, i) => ({ b, i })) : d.biayaLain.filter((b) => b.tahunAjaran === ta).map((b) => ({ b, i: -1 }))
  const kegSiswa = (b, i) => st.filter((x) => (i >= 0 ? x.s.kegiatanWajib?.[i] !== false : wajibKegiatan(x.k, b)))
    .map((x) => ({ x, dibayar: i >= 0 ? x.s.kegiatan[i] || 0 : (x.s.kegiatanLalu || []).find((k) => k.biayaId === b.id)?.dibayar || 0 }))
  // jatuh tempo kegiatan = tanggalnya (sama dengan menu Tagihan); tahun lalu = semua sudah jatuh tempo
  const lewatKeg = (b) => !berjalan || (!!b.tanggal && new Date(b.tanggal + 'T00:00:00') < hariIni)
  const kurangKeg = (x) => jumlah(keg, ({ b, i }) => {
    if (!lewatKeg(b)) return 0
    const ada = kegSiswa(b, i).find((y) => y.x === x)
    return ada ? Math.max(0, b.nominal - ada.dibayar) : 0
  })

  const tunggak = st.map((x) => ({ id: x.s.id, nama: x.s.nama, kelas: x.k.kelas, status: 'aktif', akhir: x.k.akhir, spp: kurangSpp(x), kegiatan: kurangKeg(x) }))
    .filter((x) => x.spp + x.kegiatan > 0)
    .sort((a, b) => b.spp + b.kegiatan - (a.spp + a.kegiatan) || a.nama.localeCompare(b.nama))

  const akhir = {}
  st.forEach((x) => { const a = x.k.akhir || 'belum'; akhir[a] = (akhir[a] || 0) + 1 })

  return {
    ta, berjalan,
    mulai: `${y}-07-01`, selesai: `${y + 1}-06-30`,
    sampai: berjalan ? hariIni.toISOString().slice(0, 10) : `${y + 1}-06-30`,
    tarif: t,
    siswa: {
      jumlah: st.length,
      masukTengah: st.filter((x) => x.k.mulai > 0).length,
      keluar: st.filter((x) => ['keluar', 'pindah'].includes(x.k.akhir)).length,
      akhir,
      perKelas: kelasList.map((k) => ({ kelas: k, jumlah: st.filter((x) => x.k.kelas === k).length })),
    },
    spp: {
      target: jumlah(perBulan, (b) => b.target),
      masuk: jumlah(perBulan, (b) => b.masuk),
      jatuhTempo: Math.min(bln, 12),
      tunggakan: jumlah(st, kurangSpp),
      perBulan,
      perKelas: kelasList.map((k) => {
        const di = st.filter((x) => x.k.kelas === k)
        return {
          kelas: k, siswa: di.length, tarif: di[0]?.tarif || 0,
          target: jumlah(di, (x) => jumlah(x.target)), masuk: jumlah(di, (x) => jumlah(x.bayar.map((v, i) => (x.target[i] > 0 ? v || 0 : 0)))),
          tunggakan: jumlah(di, kurangSpp),
        }
      }),
    },
    kegiatan: keg.map(({ b, i }) => {
      const ks = kegSiswa(b, i)
      const masuk = d.pembayaran.filter((p) => p.jenis === 'kegiatan' && (p.biayaId === b.id || (i >= 0 && p.indeks === i))).reduce((t2, p) => t2 + p.nominal, 0)
      return {
        id: b.id, nama: b.nama, emoji: b.emoji || null, nominal: b.nominal, tanggal: b.tanggal || null,
        siswa: ks.length, lunas: ks.filter((y) => y.dibayar >= b.nominal).length, target: b.nominal * ks.length,
        masuk, terpakai: d.terpakai?.[b.id] ?? null,
      }
    }),
    paket: (d.paket || []).filter((p) => p.tahunAjaran === ta).map((p) => ({
      id: p.id, jenis: p.jenis, nama: p.nama, total: p.total, siswa: p.siswaIds.length, target: p.total * p.siswaIds.length,
      masuk: d.pembayaran.filter((x) => x.jenis === 'paket' && x.paketId === p.id).reduce((t2, x) => t2 + x.nominal, 0),
    })),
    tunggakan: {
      spp: jumlah(tunggak, (x) => x.spp),
      kegiatan: jumlah(tunggak, (x) => x.kegiatan),
      siswa: tunggak.length,
      daftar: tunggak.slice(0, 100),
    },
    kas: d.kas,
  }
}

/** Daftar tahun ajaran (terbaru dulu) dari data demo — bentuk sama dengan daftar_tahun_ajaran(). */
export function daftarTahunDemo({ siswa, pembayaran, tarif }) {
  const kini = tahunAjaranBerjalan()
  const kode = new Set([kini])
  siswa.forEach((s) => (s.keanggotaan || []).forEach((k) => { if (k.ta <= kini) kode.add(k.ta) }))
  return [...kode].sort().reverse().map((ta) => {
    const st = siswa.filter((s) => (s.keanggotaan || []).some((k) => k.ta === ta) || (ta === kini && s.terdaftar))
    const target = jumlah(st, (s) => jumlah(ta === kini ? s.sppTarget || [] : s.sppTargetLalu?.[ta] || targetDari(tarif, (s.keanggotaan || []).find((k) => k.ta === ta))))
    const sppMasuk = pembayaran.filter((p) => p.jenis === 'spp' && (p.tahunAjaran || kini) === ta).reduce((t, p) => t + p.nominal, 0)
    return { kode: ta, berjalan: ta === kini, siswa: st.length, sppTarget: target, sppMasuk, pembayaranMasuk: sppMasuk }
  })
}
