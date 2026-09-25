/**
 * Jawaban contoh Tanya AI untuk MODE DEMO (tanpa Supabase/AI sungguhan).
 * Menebak maksud pertanyaan dari kata kunci lalu menyusun jawaban dari
 * data demo — bentuk datanya sama dengan hasil fungsi database, jadi
 * tampilan & tombol Unduh Excel bisa dicoba tanpa server.
 */
import {
  BULAN, bulanBerjalan, bulanTertunggak, perluDitagihSekarang, rp, sppPerluSekarang, sudahLewatJatuhTempo, tanggalISO,
} from './format.js'

const CATATAN = '\n\n*(Mode demo — ini contoh jawaban dari data demo, bukan AI sungguhan.)*'

function tunggakan({ siswa, pengaturan }) {
  const { sppNominal: n, tanggalJatuhTempo: jt } = pengaturan
  const kini = bulanBerjalan()
  const lewat = sudahLewatJatuhTempo(jt)
  const daftar = siswa
    .filter((s) => perluDitagihSekarang(s, n, jt))
    .map((s) => ({
      nama: s.nama, kelas: s.kelas, wali: s.wali,
      jumlah_bulan_nunggak: bulanTertunggak(s, n),
      bulan_nunggak: BULAN.slice(0, kini).map((b, i) => ({ bulan: b, dibayar: s.spp[i] || 0, kurang: n - (s.spp[i] || 0) })).filter((b) => b.kurang > 0),
      bulan_berjalan_lewat_jatuh_tempo_belum_lunas: lewat && (s.spp[kini] || 0) < n,
      perlu_dibayar_sekarang_spp: sppPerluSekarang(s, n, jt),
    }))
    .sort((a, b) => b.jumlah_bulan_nunggak - a.jumlah_bulan_nunggak || b.perlu_dibayar_sekarang_spp - a.perlu_dibayar_sekarang_spp)
  const hasil = {
    mode: 'siswa yang perlu ditagih sekarang', kelas: 'semua kelas', jumlah_siswa: daftar.length,
    total_kurang_spp_rupiah: daftar.reduce((t, s) => t + s.perlu_dibayar_sekarang_spp, 0), siswa: daftar,
  }
  const tampil = daftar.slice(0, 15)
  const jawaban =
    `Ada **${daftar.length} siswa** yang perlu ditagih SPP sekarang, dengan total kekurangan **${rp(hasil.total_kurang_spp_rupiah)}**.\n\n` +
    '| Nama | Kelas | Nunggak | Perlu dibayar |\n|---|---|---|---|\n' +
    tampil.map((s) => `| ${s.nama} | ${s.kelas} | ${s.jumlah_bulan_nunggak ? s.jumlah_bulan_nunggak + ' bulan' : 'Bulan ini'} | ${rp(s.perlu_dibayar_sekarang_spp)} |`).join('\n') +
    (daftar.length > 15 ? `\n\nDan ${daftar.length - 15} siswa lainnya — unduh Excel untuk daftar lengkap.` : '') +
    '\n\nYang nunggak paling lama sebaiknya diingatkan lebih dulu lewat WhatsApp.'
  return { jawaban, data: [{ alat: 'daftar_tunggakan', hasil }] }
}

function transaksiHariIni({ pembayaran, siswa }) {
  const hariIni = tanggalISO()
  const t = pembayaran.filter((p) => tanggalISO(new Date(p.tanggal)) === hariIni)
  const nama = (id) => siswa.find((s) => s.id === id) || {}
  const total = t.reduce((a, p) => a + p.nominal, 0)
  const hasil = {
    dari: hariIni, sampai: hariIni, jumlah_transaksi: t.length, total,
    tunai: t.filter((p) => p.metode === 'Tunai').reduce((a, p) => a + p.nominal, 0),
    transfer: t.filter((p) => p.metode === 'Transfer').reduce((a, p) => a + p.nominal, 0),
    transaksi: t.map((p) => ({
      waktu: new Date(p.tanggal).toLocaleString('sv-SE').slice(0, 16), siswa: nama(p.siswaId).nama, kelas: nama(p.siswaId).kelas,
      untuk: p.ket, nominal: p.nominal, metode: p.metode, petugas: p.petugas,
    })),
  }
  const jawaban = t.length
    ? `Hari ini ada **${t.length} transaksi** dengan total **${rp(total)}** (tunai ${rp(hasil.tunai)}, transfer ${rp(hasil.transfer)}).\n\n` +
      '| Jam | Siswa | Untuk | Nominal |\n|---|---|---|---|\n' +
      hasil.transaksi.map((x) => `| ${x.waktu.slice(11)} | ${x.siswa} | ${x.untuk} | ${rp(x.nominal)} |`).join('\n')
    : 'Belum ada transaksi pembayaran yang dicatat hari ini.'
  return { jawaban, data: [{ alat: 'transaksi', hasil }] }
}

function perKelas({ siswa, pengaturan }) {
  const { sppNominal: n, tanggalJatuhTempo: jt } = pengaturan
  const kelas = [...new Set(siswa.map((s) => s.kelas))].map((k) => {
    const ss = siswa.filter((s) => s.kelas === k)
    return {
      kelas: k, jumlah_siswa: ss.length,
      siswa_perlu_ditagih: ss.filter((s) => perluDitagihSekarang(s, n, jt)).length,
      total_bulan_nunggak: ss.reduce((t, s) => t + bulanTertunggak(s, n), 0),
      kurang_spp_rupiah: ss.reduce((t, s) => t + sppPerluSekarang(s, n, jt), 0),
      kurang_kegiatan_rupiah: 0,
      lunas_spp_bulan_berjalan: ss.filter((s) => (s.spp[bulanBerjalan()] || 0) >= n).length,
      spp_terkumpul_tahun_ajaran: ss.reduce((t, s) => t + s.spp.reduce((a, v) => a + (v || 0), 0), 0),
    }
  }).sort((a, b) => b.kurang_spp_rupiah - a.kurang_spp_rupiah)
  const [atas] = kelas
  const jawaban =
    `Tunggakan paling banyak ada di **${atas.kelas}**: ${atas.siswa_perlu_ditagih} dari ${atas.jumlah_siswa} siswa perlu ditagih, total **${rp(atas.kurang_spp_rupiah)}**.\n\n` +
    '| Kelas | Siswa | Perlu ditagih | Kurang SPP |\n|---|---|---|---|\n' +
    kelas.map((k) => `| ${k.kelas} | ${k.jumlah_siswa} | ${k.siswa_perlu_ditagih} | ${rp(k.kurang_spp_rupiah)} |`).join('\n')
  return { jawaban, data: [{ alat: 'perbandingan_kelas', hasil: { bulan_berjalan: BULAN[bulanBerjalan()], kelas } }] }
}

function rekap({ siswa, pembayaran, pengaturan }) {
  const n = pengaturan.sppNominal
  const i = bulanBerjalan()
  const lunas = siswa.filter((s) => (s.spp[i] || 0) >= n).length
  const sebagian = siswa.filter((s) => (s.spp[i] || 0) > 0 && (s.spp[i] || 0) < n).length
  const masuk = pembayaran.filter((p) => bulanBerjalan(new Date(p.tanggal)) === i && new Date(p.tanggal).getFullYear() === new Date().getFullYear())
  const total = masuk.reduce((t, p) => t + p.nominal, 0)
  const jawaban =
    `Rekap **${BULAN[i]}** sampai hari ini:\n\n` +
    `- SPP lunas: **${lunas}** dari ${siswa.length} siswa\n- Bayar sebagian: **${sebagian}** siswa\n- Belum bayar: **${siswa.length - lunas - sebagian}** siswa\n` +
    `- Uang masuk bulan ini: **${rp(total)}** dari ${masuk.length} transaksi`
  return { jawaban, data: [] }
}

export async function jawabDemo(pesan, data) {
  await new Promise((r) => setTimeout(r, 900))
  const p = pesan.toLowerCase()
  const hasil =
    /hari ini|transaksi|yang bayar|kemarin/.test(p) ? transaksiHariIni(data)
    : /kelas mana|per kelas|bandingkan|kelas/.test(p) ? perKelas(data)
    : /belum bayar|nunggak|tunggak|belum lunas|tagih/.test(p) ? tunggakan(data)
    : rekap(data)
  return { ...hasil, jawaban: hasil.jawaban + CATATAN, kuota: { terpakai: 1, batas: 30 } }
}