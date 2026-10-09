/**
 * Jawaban contoh SAKU untuk MODE DEMO (tanpa Supabase/AI sungguhan).
 * Menebak maksud pertanyaan dari kata kunci lalu menyusun jawaban dari
 * data demo — bentuk datanya sama dengan hasil fungsi database, jadi
 * tampilan & tombol Unduh Excel bisa dicoba tanpa server.
 */
import {
  BULAN, bulanBerjalan, bulanTertunggak, kegiatanLaluBelum, namaBulanTa, perluDitagihSekarang, rp, sppPerluSekarang, sudahLewatJatuhTempo,
  tahunAjaranBerjalan, tanggalISO, targetSpp, tunggakanLalu as tunggakanLaluSpp,
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
      bulan_nunggak: BULAN.slice(0, kini).map((b, i) => ({ bulan: b, dibayar: s.spp[i] || 0, kurang: targetSpp(s, i, n) - (s.spp[i] || 0) })).filter((b) => b.kurang > 0),
      bulan_berjalan_lewat_jatuh_tempo_belum_lunas: lewat && (s.spp[kini] || 0) < targetSpp(s, kini, n),
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
    tabungan: t.filter((p) => p.metode === 'Tabungan').reduce((a, p) => a + p.nominal, 0),
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
      lunas_spp_bulan_berjalan: ss.filter((s) => (s.spp[bulanBerjalan()] || 0) >= targetSpp(s, bulanBerjalan(), n)).length,
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
  const lunas = siswa.filter((s) => (s.spp[i] || 0) >= targetSpp(s, i, n)).length
  const sebagian = siswa.filter((s) => (s.spp[i] || 0) > 0 && (s.spp[i] || 0) < targetSpp(s, i, n)).length
  const masuk = pembayaran.filter((p) => bulanBerjalan(new Date(p.tanggal)) === i && new Date(p.tanggal).getFullYear() === new Date().getFullYear())
  const total = masuk.reduce((t, p) => t + p.nominal, 0)
  const jawaban =
    `Rekap **${BULAN[i]}** sampai hari ini:\n\n` +
    `- SPP lunas: **${lunas}** dari ${siswa.length} siswa\n- Bayar sebagian: **${sebagian}** siswa\n- Belum bayar: **${siswa.length - lunas - sebagian}** siswa\n` +
    `- Uang masuk bulan ini: **${rp(total)}** dari ${masuk.length} transaksi`
  return { jawaban, data: [] }
}

/** Buku kas demo — bentuk hasilnya sama dengan ai_kas() di database. */
async function kasDemo(p, { pembayaran }) {
  const api = await import('./api.js')
  const demo = { pembayaran }
  const hariIni = tanggalISO()
  const d = new Date()
  let dari = hariIni.slice(0, 8) + '01'
  let periode = 'bulan ini'
  if (/minggu/.test(p)) {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    dari = tanggalISO(d)
    periode = 'minggu ini'
  }
  const sebelum = new Date(dari + 'T00:00:00')
  sebelum.setDate(sebelum.getDate() - 1)
  const [r, ring, awal] = await Promise.all([
    api.kasRiwayat({ dari, sampai: hariIni, batas: 500 }, demo),
    api.kasRingkasan(demo),
    api.kasSaldoTersedia(tanggalISO(sebelum), demo),
  ])
  const mulai = ring.pengaturan?.mulai
  const bayar = pembayaran.filter((x) => {
    const t = tanggalISO(new Date(x.tanggal))
    return t >= dari && t <= hariIni && (!mulai || t >= mulai)
  })
  const kasSah = r.item.filter((i) => i.sumber === 'kas' && !i.dibatalkanPada && !i.sebelumMulai)
  const perKategori = (jenis) => {
    const m = new Map()
    kasSah.filter((i) => i.jenis === jenis).forEach((i) => m.set(i.kategori, (m.get(i.kategori) || 0) + i.nominal))
    return [...m].map(([kategori, nominal]) => ({ kategori, nominal })).sort((a, b) => b.nominal - a.nominal)
  }
  const spp = bayar.filter((x) => x.jenis === 'spp').reduce((t, x) => t + x.nominal, 0)
  const kegiatan = bayar.filter((x) => x.jenis !== 'spp').reduce((t, x) => t + x.nominal, 0)
  const lain = kasSah.filter((i) => i.jenis === 'masuk').reduce((t, i) => t + i.nominal, 0)
  const keluar = perKategori('keluar')
  const hasil = {
    periode: { dari, sampai: hariIni },
    buku_kas: { saldo_awal_diisi: !!ring.pengaturan, saldo_awal: ring.pengaturan?.saldoAwal, tanggal_mulai_kas: mulai },
    saldo_kas_saat_ini: ring.saldoKini,
    saldo_awal_periode: awal.saldoTanggal,
    saldo_akhir_periode: ring.saldoKini,
    pemasukan: { total: r.total.masuk, spp, kegiatan, lain },
    pengeluaran: { total: r.total.keluar, jumlah_transaksi: kasSah.filter((i) => i.jenis === 'keluar').length },
    selisih_masuk_keluar: r.total.masuk - r.total.keluar,
    pemasukan_per_kategori: [
      ...(spp ? [{ kategori: 'SPP', nominal: spp }] : []),
      ...(kegiatan ? [{ kategori: 'Biaya kegiatan', nominal: kegiatan }] : []),
      ...perKategori('masuk'),
    ],
    pengeluaran_per_kategori: keluar,
    transaksi: r.item.filter((i) => !i.dibatalkanPada && !i.sebelumMulai).map((i) => ({
      tanggal: i.tanggal, jenis: i.jenis,
      kategori: i.sumber === 'bayar' ? `Pembayaran orang tua (${i.jumlah} transaksi SPP/kegiatan)` : i.kategori,
      nominal: i.nominal, keterangan: i.keterangan || null, dicatat_oleh: i.dicatatNama || null,
    })),
  }
  const tabel = (xs) => '| Kategori | Nominal |\n|---|---|\n' + xs.slice(0, 15).map((k) => `| ${k.kategori} | ${rp(k.nominal)} |`).join('\n')
  let jawaban
  if (/pengeluaran|keluar|belanja/.test(p)) {
    jawaban = hasil.pengeluaran.total
      ? `Pengeluaran ${periode} **${rp(hasil.pengeluaran.total)}** dari ${hasil.pengeluaran.jumlah_transaksi} transaksi. Paling besar untuk **${keluar[0].kategori}** (${rp(keluar[0].nominal)}).\n\n${tabel(keluar)}\n\nSaldo kas saat ini **${rp(hasil.saldo_kas_saat_ini)}**.`
      : `Belum ada pengeluaran kas ${periode}. Saldo kas saat ini **${rp(hasil.saldo_kas_saat_ini)}**.`
  } else if (/pemasukan|masuk/.test(p) && !/ringkas/.test(p)) {
    jawaban = `Pemasukan ${periode} **${rp(hasil.pemasukan.total)}**: SPP ${rp(spp)}, biaya kegiatan ${rp(kegiatan)}, pemasukan lain ${rp(lain)}.\n\n` +
      (hasil.pemasukan_per_kategori.length ? tabel(hasil.pemasukan_per_kategori) : '') +
      `\n\nSaldo kas saat ini **${rp(hasil.saldo_kas_saat_ini)}**.`
  } else {
    jawaban = `Ringkasan keuangan ${periode} (${dari} s.d. ${hariIni}):\n\n` +
      `| Keterangan | Nominal |\n|---|---|\n` +
      `| Saldo awal | ${rp(hasil.saldo_awal_periode)} |\n| Pemasukan | ${rp(hasil.pemasukan.total)} |\n` +
      `| Pengeluaran | ${rp(hasil.pengeluaran.total)} |\n| **Saldo kas sekarang** | **${rp(hasil.saldo_kas_saat_ini)}** |\n\n` +
      (!hasil.pemasukan.total && !hasil.pengeluaran.total
        ? `Belum ada pemasukan maupun pengeluaran ${periode}.`
        : hasil.selisih_masuk_keluar >= 0
        ? `Kas ${periode} **surplus ${rp(hasil.selisih_masuk_keluar)}**.`
        : `Kas ${periode} **defisit ${rp(-hasil.selisih_masuk_keluar)}** — pengeluaran lebih besar dari pemasukan.`)
  }
  return { jawaban, data: [{ alat: 'kas', hasil }] }
}

/** Bentuk sama dengan ai_status_kegiatan (0034): kelompok lunas / sebagian / belum. */
function statusKegiatan({ siswa, biaya }, p) {
  const dipilih = biaya.map((b, i) => ({ b, i })).filter(({ b }) => {
    const n = b.nama.toLowerCase()
    return p.includes(n) || n.split(/\s+/).some((k) => k.length > 4 && p.includes(k))
  })
  const daftar = dipilih.length ? dipilih : biaya.map((b, i) => ({ b, i }))
  const urut = (a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama)
  const kegiatan = daftar.map(({ b, i }) => {
    const baris = siswa.map((s) => ({ nama: s.nama, kelas: s.kelas, dibayar: s.kegiatan[i] || 0 })).sort(urut)
    const lunas = baris.filter((x) => x.dibayar >= b.nominal)
    const sebagian = baris.filter((x) => x.dibayar > 0 && x.dibayar < b.nominal)
    const belum = baris.filter((x) => !x.dibayar)
    return {
      kegiatan: b.nama, tanggal: b.tanggal || null, nominal_per_siswa: b.nominal, jumlah_siswa: baris.length,
      target: b.nominal * baris.length,
      terkumpul: baris.reduce((t, x) => t + Math.min(x.dibayar, b.nominal), 0),
      kekurangan: baris.reduce((t, x) => t + Math.max(0, b.nominal - x.dibayar), 0),
      lunas: { jumlah: lunas.length, siswa: lunas.map(({ nama, kelas }) => ({ nama, kelas })) },
      sebagian: { jumlah: sebagian.length, siswa: sebagian.map((x) => ({ nama: x.nama, kelas: x.kelas, dibayar: x.dibayar, kurang: b.nominal - x.dibayar })) },
      belum_bayar: { jumlah: belum.length, siswa: belum.map((x) => ({ nama: x.nama, kelas: x.kelas, kurang: b.nominal })) },
    }
  })
  const perSiswa = [...siswa].sort(urut).map((s) => {
    const kurang = daftar.filter(({ b, i }) => (s.kegiatan[i] || 0) < b.nominal)
    return {
      nama: s.nama, kelas: s.kelas, lunas: `${daftar.length - kurang.length} dari ${daftar.length} kegiatan`,
      total_kurang: kurang.reduce((t, { b, i }) => t + b.nominal - (s.kegiatan[i] || 0), 0),
      belum_lunas: kurang.map(({ b, i }) => ({ kegiatan: b.nama, kurang: b.nominal - (s.kegiatan[i] || 0), status: s.kegiatan[i] ? 'sebagian' : 'belum bayar' })),
    }
  })
  const lunasSemua = perSiswa.filter((x) => !x.belum_lunas.length)
  const masih = perSiswa.filter((x) => x.belum_lunas.length)
  const hasil = {
    kelas: 'semua kelas', jumlah_siswa_aktif: siswa.length, jumlah_kegiatan: daftar.length, kegiatan,
    rekap_per_siswa: {
      lunas_semua_kegiatan: { jumlah: lunasSemua.length, siswa: lunasSemua.map(({ nama, kelas }) => ({ nama, kelas })) },
      masih_ada_kekurangan: { jumlah: masih.length, total_kurang: masih.reduce((t, x) => t + x.total_kurang, 0), siswa: masih },
    },
  }
  const tabelNama = (arr) => '| No | Nama | Kelas |\n|---|---|---|\n' + arr.slice(0, 40).map((x, n) => `| ${n + 1} | ${x.nama} | ${x.kelas} |`).join('\n')
  let jawaban
  if (dipilih.length === 1) {
    const k = kegiatan[0]
    jawaban = `Untuk **${k.kegiatan}** (${rp(k.nominal_per_siswa)} per siswa): **${k.lunas.jumlah} siswa** sudah lunas, ` +
      `**${k.sebagian.jumlah}** bayar sebagian, dan **${k.belum_bayar.jumlah}** belum bayar. Terkumpul **${rp(k.terkumpul)}** dari ${rp(k.target)}.` +
      (k.lunas.jumlah ? `\n\n**Sudah lunas (${k.lunas.jumlah} siswa):**\n\n${tabelNama(k.lunas.siswa)}` : '') +
      (k.sebagian.jumlah + k.belum_bayar.jumlah ? `\n\n**Belum lunas (${k.sebagian.jumlah + k.belum_bayar.jumlah} siswa):**\n\n${tabelNama([...k.sebagian.siswa, ...k.belum_bayar.siswa])}` : '')
  } else {
    jawaban = `Dari ${daftar.length} kegiatan, **${lunasSemua.length} siswa** sudah lunas semua dan **${masih.length} siswa** masih ada kekurangan ` +
      `(total **${rp(hasil.rekap_per_siswa.masih_ada_kekurangan.total_kurang)}**).` +
      (lunasSemua.length ? `\n\n**Lunas semua kegiatan (${lunasSemua.length} siswa):**\n\n${tabelNama(lunasSemua)}` : '') +
      (masih.length ? `\n\n**Masih ada kekurangan (${masih.length} siswa):**\n\n| No | Nama | Kelas | Lunas | Kurang |\n|---|---|---|---|---|\n` +
        masih.slice(0, 40).map((x, n) => `| ${n + 1} | ${x.nama} | ${x.kelas} | ${x.lunas} | ${rp(x.total_kurang)} |`).join('\n') : '')
  }
  return { jawaban, data: [{ alat: 'status_kegiatan', hasil }] }
}

/** Tunggakan tahun ajaran lalu, termasuk siswa yang sudah lulus / keluar (bentuk ai_tunggakan_lalu, 0044). */
async function tunggakanLalu({ siswa, pembayaran, pengaturan }) {
  const aktif = siswa.map((s) => ({
    s, status: `masih aktif, kelas ${s.kelas}`,
    rincian: [
      ...tunggakanLaluSpp(s, pengaturan.sppNominal).map((x) => ({ tahun_ajaran: x.ta, kelas_saat_itu: (s.keanggotaan || []).find((k) => k.ta === x.ta)?.kelas || s.kelas, tagihan: x.label, dibayar: x.dibayar, kurang: x.kurang })),
      ...kegiatanLaluBelum(s).map((k) => ({ tahun_ajaran: k.ta, kelas_saat_itu: (s.keanggotaan || []).find((x) => x.ta === k.ta)?.kelas || s.kelas, tagihan: 'Kegiatan ' + k.nama, dibayar: k.dibayar, kurang: k.kurang })),
    ],
  }))
  const kini = tahunAjaranBerjalan()
  const lain = (await (await import('./api.js')).tunggakanNonaktif({ pembayaran })).map((x) => ({
    s: x, status: x.status === 'alumni' ? `sudah lulus${x.tahunLulus ? ` (${x.tahunLulus})` : ''}` : 'sudah keluar / pindah',
    rincian: x.item.filter((it) => it.ta < kini).map((it) => ({ tahun_ajaran: it.ta, kelas_saat_itu: x.kelas, tagihan: it.jenis === 'spp' ? `SPP ${namaBulanTa(it.ta, it.i)}` : 'Kegiatan ' + it.nama, dibayar: it.dibayar, kurang: it.target - it.dibayar })),
  }))
  const daftar = [...aktif, ...lain].filter((x) => x.rincian.length)
    .map((x) => ({ nama: x.s.nama, status: x.status, wali: x.s.wali, kurang_total: x.rincian.reduce((t, r) => t + r.kurang, 0), rincian: x.rincian }))
    .sort((a, b) => b.kurang_total - a.kurang_total)
  const hasil = {
    tahun_ajaran: 'semua tahun ajaran lalu', kelas: 'semua kelas', jumlah_siswa: daftar.length,
    total_kurang_rupiah: daftar.reduce((t, s) => t + s.kurang_total, 0), siswa: daftar,
  }
  const jawaban = daftar.length === 0
    ? 'Tidak ada tunggakan dari tahun ajaran yang sudah lewat. 👍'
    : `Masih ada **${daftar.length} siswa** dengan tunggakan tahun ajaran lalu, total **${rp(hasil.total_kurang_rupiah)}** — ` +
      `${lain.filter((x) => x.rincian.length).length} di antaranya sudah lulus / keluar.\n\n` +
      '| Nama | Status | Tunggakan | Kurang |\n|---|---|---|---|\n' +
      daftar.map((s) => `| ${s.nama} | ${s.status} | ${s.rincian.map((r) => r.tagihan).join(', ')} | ${rp(s.kurang_total)} |`).join('\n') +
      '\n\nSiswa yang sudah lulus / keluar ada di menu Tagihan › "Sudah lulus / keluar, masih menunggak".'
  return { jawaban, data: [{ alat: 'tunggakan_tahun_lalu', hasil }] }
}

export async function jawabDemo(pesan, data) {
  await new Promise((r) => setTimeout(r, 900))
  const p = pesan.toLowerCase()
  if (/saldo|pengeluaran|pemasukan|uang keluar|uang masuk|keuangan|kas\b/.test(p)) {
    const h = await kasDemo(p, data)
    return { ...h, jawaban: h.jawaban + CATATAN, kuota: { terpakai: 1, batas: 30 } }
  }
  const soalKegiatan = /kegiatan|manasik|outing|pentas|renang|wisuda|outbond|study tour/.test(p) ||
    (data.biaya || []).some((b) => p.includes(b.nama.toLowerCase()))
  const hasil =
    soalKegiatan && /lunas|sudah bayar|belum bayar|sebagian|rekap/.test(p) ? statusKegiatan(data, p)
    : /hari ini|transaksi|yang bayar|kemarin/.test(p) ? transaksiHariIni(data)
    : /kelas mana|per kelas|bandingkan|kelas/.test(p) ? perKelas(data)
    : /tahun lalu|tahun ajaran lalu|alumni|lulus|sudah keluar|pindah/.test(p) ? await tunggakanLalu(data)
    : /belum bayar|nunggak|tunggak|belum lunas|tagih/.test(p) ? tunggakan(data)
    : rekap(data)
  return { ...hasil, jawaban: hasil.jawaban + CATATAN, kuota: { terpakai: 1, batas: 30 } }
}
