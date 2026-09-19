/**
 * Export laporan ke Excel (.xlsx) — dibuat di browser saat guru klik
 * "Export Excel", tidak lewat server. Pakai ExcelJS (bukan xlsx/SheetJS)
 * karena butuh pewarnaan sel per status (lunas/sebagian/nunggak) supaya
 * gampang dibaca sekilas tanpa perlu baca angka satu-satu.
 *
 * 4 sheet:
 *  1. Ringkasan       — angka kunci sekolah, mirip kartu di halaman Laporan
 *  2. SPP per Siswa   — satu baris/siswa, satu kolom/bulan (Juli–Juni)
 *  3. Biaya Kegiatan  — satu baris/siswa, satu kolom/jenis kegiatan
 *  4. Riwayat Transaksi — log mentah semua pembayaran, buat rekonsiliasi
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import {
  BULAN,
  bulanBerjalan,
  dibayarKegiatan,
  dibayarSpp,
  kegiatanBelum,
  perluDitagihSekarang,
  rp,
  sppPerluSekarang,
  statusRingkasSiswa,
  statusSpp,
  tanggalISO,
  tanggalPanjang,
  totalDibayar,
  totalKegiatan,
} from './format.js'
import { WARNA, isiSel, FONT_HEADER, FONT_JUDUL, gayaStatus, LABEL_STATUS, judulLembar, baposHeader } from './exportHelpers.js'

export async function unduhExcel({ siswa, biaya, pembayaran, pengaturan }) {
  const kini = bulanBerjalan()
  const wb = new ExcelJS.Workbook()
  wb.creator = pengaturan.namaSekolah
  wb.created = new Date()

  sheetRingkasan(wb, { siswa, biaya, pembayaran, pengaturan, kini })
  sheetSpp(wb, { siswa, pembayaran, pengaturan, kini })
  sheetKegiatan(wb, { siswa, biaya })
  sheetPrioritas(wb, { siswa, biaya, pengaturan, kini })
  sheetRiwayat(wb, { pembayaran, siswa })

  const buf = await wb.xlsx.writeBuffer()
  const nama = `Laporan-${pengaturan.namaSekolah.replace(/[^a-z0-9]+/gi, '-')}-${tanggalISO()}.xlsx`
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), nama)
}

/* ------------------------------------------------------------------ */

/* ---------------- Sheet 1: Ringkasan ---------------- */

function sheetRingkasan(wb, { siswa, biaya, pembayaran, pengaturan, kini }) {
  const ws = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] })
  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }
  ws.columns = [{ width: 22 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 20 }]

  judulLembar(ws, 5, `Laporan Keuangan — ${pengaturan.namaSekolah}`, `Tahun ajaran ${pengaturan.tahunAjaran} · Dicetak ${tanggalPanjang()}`)

  const masuk = pembayaran.reduce((t, p) => t + p.nominal, 0)
  const tunggakanSpp = siswa.reduce((t, s) => t + sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini), 0)
  const kurangKegiatan = siswa.reduce((t, s) => t + kegiatanBelum(s, biaya), 0)
  const menunggak = siswa.filter((s) => perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)).length
  const targetTahun = 12 * pengaturan.sppNominal * siswa.length + totalKegiatan(biaya) * siswa.length
  const totalSemuaDibayar = siswa.reduce((t, s) => t + totalDibayar(s), 0)
  const tingkat = targetTahun ? Math.round((totalSemuaDibayar / targetTahun) * 1000) / 10 : 0

  // --- kartu KPI (5 kolom) ---
  // Tunggakan SPP dan Kurang Bayar Kegiatan sengaja DIPISAH — dulu
  // digabung jadi satu "Total Tunggakan" yang bikin bingung apakah
  // termasuk kegiatan. Sekarang jelas: SPP itu kewajiban bulanan,
  // kegiatan itu sekali bayar per item.
  const kartu = [
    ['Total Siswa', String(siswa.length), WARNA.brandSoft, WARNA.brandDeep],
    ['Total Pemasukan', rp(masuk), WARNA.okSoft, WARNA.ok],
    ['Tunggakan SPP', rp(tunggakanSpp), WARNA.warnSoft, WARNA.warn],
    ['Kurang Bayar Kegiatan', rp(kurangKegiatan), WARNA.warnSoft, WARNA.warn],
    ['Tingkat Pembayaran', `${tingkat}%`, WARNA.brandSoft, WARNA.brandDeep],
  ]
  const baseRow = 4
  kartu.forEach(([label, nilai, bg, fg], i) => {
    const col = i + 1
    const cLabel = ws.getCell(baseRow, col)
    cLabel.value = label
    cLabel.font = { size: 9, color: { argb: WARNA.abu } }
    cLabel.fill = isiSel(bg)
    cLabel.alignment = { horizontal: 'center' }
    const cNilai = ws.getCell(baseRow + 1, col)
    cNilai.value = nilai
    cNilai.font = { bold: true, size: 15, color: { argb: fg } }
    cNilai.fill = isiSel(bg)
    cNilai.alignment = { horizontal: 'center' }
    ws.getCell(baseRow + 2, col).fill = isiSel(bg)
  })
  ws.getRow(baseRow).height = 18
  ws.getRow(baseRow + 1).height = 26
  ws.getRow(baseRow + 2).height = 6

  // --- breakdown status siswa ---
  let r = baseRow + 4
  ws.getCell(r, 1).value = 'Status Pembayaran Siswa'
  ws.getCell(r, 1).font = { bold: true, size: 12 }
  r += 1
  baposHeader(ws, r, ['Status', 'Jumlah Siswa', 'Persentase', ''])
  r += 1
  const hitung = { lunas: 0, sebagian: 0, belum: 0 }
  siswa.forEach((s) => hitung[statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)]++)
  ;[['lunas', 'Lunas'], ['sebagian', 'Sebagian'], ['belum', 'Menunggak']].forEach(([key, label]) => {
    const n = hitung[key]
    const persen = siswa.length ? Math.round((n / siswa.length) * 1000) / 10 : 0
    const gaya = gayaStatus(key)
    ws.getCell(r, 1).value = label
    ws.getCell(r, 2).value = n
    ws.getCell(r, 2).alignment = { horizontal: 'center' }
    ws.getCell(r, 3).value = `${persen}%`
    ws.getCell(r, 3).alignment = { horizontal: 'center' }
    ;[1, 2, 3, 4].forEach((c) => { ws.getCell(r, c).fill = gaya.fill; ws.getCell(r, c).font = gaya.font })
    r += 1
  })

  // --- kontribusi per jenis biaya ---
  r += 2
  ws.getCell(r, 1).value = 'Kontribusi per Jenis Biaya'
  ws.getCell(r, 1).font = { bold: true, size: 12 }
  r += 1
  baposHeader(ws, r, ['Jenis Biaya', 'Total Terkumpul', '', ''])
  r += 1
  const totalSpp = siswa.reduce((t, s) => t + s.spp.reduce((x, v) => x + (v || 0), 0), 0)
  const barisBiaya = [['Iuran SPP', totalSpp], ...biaya.map((b, i) => [b.nama, siswa.reduce((t, s) => t + (s.kegiatan[i] || 0), 0)])]
  barisBiaya.forEach(([nama, nilai]) => {
    ws.mergeCells(r, 1, r, 2)
    ws.getCell(r, 1).value = nama
    ws.getCell(r, 3).value = rp(nilai)
    ws.getCell(r, 3).font = { bold: true }
    ws.getRow(r).eachCell((c) => { c.border = { bottom: { style: 'hair', color: { argb: WARNA.abuSoft } } } })
    r += 1
  })

  ws.getCell(r + 1, 1).value = 'Menunggak sekarang:'
  ws.getCell(r + 1, 2).value = `${menunggak} siswa`
  ws.getCell(r + 1, 1).font = { italic: true, color: { argb: WARNA.abu }, size: 10 }
  ws.getCell(r + 1, 2).font = { italic: true, color: { argb: WARNA.abu }, size: 10 }
}

/* ---------------- Sheet 2: SPP per Siswa ---------------- */

function sheetSpp(wb, { siswa, pembayaran, pengaturan, kini }) {
  const ws = wb.addWorksheet('SPP per Siswa', { views: [{ state: 'frozen', xSplit: 4, ySplit: 3, showGridLines: false }] })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }

  // Semua 12 bulan tahun ajaran ditampilkan penuh (Juli s.d. Juni),
  // dengan tahun kalender yang benar sesuai tahun ajaran — indeks 0-5
  // (Juli-Desember) masuk tahun pertama, 6-11 (Januari-Juni) tahun kedua.
  const [thnAwal, thnAkhir] = (pengaturan.tahunAjaran || '').split('/')
  const tahunBulan = (i) => (i <= 5 ? thnAwal : thnAkhir) || ''

  const colTotal = 5 + 12
  const colKurang = colTotal + 1
  const colStatus = colKurang + 1

  ws.columns = [
    { width: 5 }, { width: 22 }, { width: 7 }, { width: 12 },
    ...Array.from({ length: 12 }, () => ({ width: 13 })),
    { width: 15 }, { width: 15 }, { width: 17 },
  ]

  judulLembar(ws, colStatus, `SPP per Siswa — ${pengaturan.namaSekolah}`, `Tahun ajaran ${pengaturan.tahunAjaran} · Rp${pengaturan.sppNominal.toLocaleString('id-ID')}/bulan · Posisi ${tanggalPanjang()}`)

  // header (baris 3) — nama bulan + tahun kalendernya di baris kecil
  const header = ['No', 'Nama Siswa', 'Kelas', 'NIS', ...BULAN.map((b, i) => `${b} ${tahunBulan(i)}`), 'Total Dibayar', 'Kurang Bayar', 'Status']
  baposHeader(ws, 3, header)

  siswa.forEach((s, idx) => {
    const r = 4 + idx
    ws.getCell(r, 1).value = idx + 1
    ws.getCell(r, 2).value = s.nama
    ws.getCell(r, 3).value = s.kelas
    ws.getCell(r, 4).value = s.nis

    BULAN.forEach((_, i) => {
      const dibayar = dibayarSpp(s, i)
      const status = statusSpp(dibayar, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
      const cell = ws.getCell(r, 5 + i)
      cell.value = dibayar > 0 ? dibayar : status === 'menunggu' ? null : 0
      cell.numFmt = '"Rp" #,##0'
      const gaya = gayaStatus(status)
      cell.fill = gaya.fill
      cell.font = { ...gaya.font, size: 9 }
      cell.alignment = { horizontal: 'right' }
    })

    const totalDb = s.spp.reduce((t, v) => t + (v || 0), 0)
    ws.getCell(r, colTotal).value = totalDb
    ws.getCell(r, colTotal).numFmt = '"Rp" #,##0'
    ws.getCell(r, colTotal).font = { bold: true }
    ws.getCell(r, colTotal).alignment = { horizontal: 'right' }

    // Kurang Bayar = tunggakan SPP yang perlu ditagih sekarang (bulan lalu
    // yang belum lunas + bulan ini kalau sudah lewat jatuh tempo). TIDAK
    // termasuk bulan mendatang yang belum jatuh tempo.
    const kurang = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
    ws.getCell(r, colKurang).value = kurang
    ws.getCell(r, colKurang).numFmt = '"Rp" #,##0'
    ws.getCell(r, colKurang).font = { bold: true, color: { argb: kurang > 0 ? WARNA.danger : WARNA.ok } }
    ws.getCell(r, colKurang).alignment = { horizontal: 'right' }

    // Status besar bergaya banner: LUNAS/AMAN (hijau), KURANG BAYAR
    // (oranye, cuma bulan ini), MENUNGGAK (merah, ada bulan lalu bolong)
    const st = statusSppSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
    let teks, bg, fg
    if (st === 'lunas') { teks = 'LUNAS / AMAN'; [bg, fg] = ['FF57BB8A', WARNA.putih] }
    else if (st === 'nunggak') { teks = 'MENUNGGAK'; [bg, fg] = ['FFE8613C', WARNA.putih] }
    else { teks = 'KURANG BAYAR'; [bg, fg] = ['FFE8A33C', WARNA.putih] }
    const cS = ws.getCell(r, colStatus)
    cS.value = teks
    cS.fill = isiSel(bg)
    cS.font = { bold: true, color: { argb: fg } }
    cS.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
  })

  // baris TOTAL PEMASUKAN SPP
  const rTotal = 4 + siswa.length
  ws.getCell(rTotal, 2).value = 'Total Pemasukan SPP'
  ws.getCell(rTotal, 2).font = { bold: true }
  ws.getRow(rTotal).eachCell({ includeEmpty: true }, (c) => { c.fill = isiSel('FFE9ECF2') })
  BULAN.forEach((_, i) => {
    const c = ws.getCell(rTotal, 5 + i)
    c.value = siswa.reduce((t, s) => t + dibayarSpp(s, i), 0) || null
    c.numFmt = '"Rp" #,##0'
    c.font = { bold: true, size: 9 }
    c.alignment = { horizontal: 'right' }
  })
  ws.getCell(rTotal, colTotal).value = siswa.reduce((t, s) => t + s.spp.reduce((x, v) => x + (v || 0), 0), 0)
  ws.getCell(rTotal, colTotal).numFmt = '"Rp" #,##0'
  ws.getCell(rTotal, colTotal).font = { bold: true }
  ws.getCell(rTotal, colTotal).alignment = { horizontal: 'right' }
  ws.getCell(rTotal, colKurang).value = siswa.reduce((t, s) => t + sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini), 0)
  ws.getCell(rTotal, colKurang).numFmt = '"Rp" #,##0'
  ws.getCell(rTotal, colKurang).font = { bold: true, color: { argb: WARNA.danger } }
  ws.getCell(rTotal, colKurang).alignment = { horizontal: 'right' }
  ws.getRow(rTotal).height = 20


  // filter di header supaya guru bisa sortir/saring
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colStatus } }
}

/* ---------------- Sheet 3: Biaya Kegiatan per Siswa ---------------- */

/**
 * Status ringkas SPP satu siswa untuk kolom "Status", dibedakan jelas:
 *  - lunas       : tidak ada tagihan SPP yang perlu ditagih sekarang
 *  - nunggak     : ada bulan yang SUDAH LEWAT tapi belum lunas
 *  - belum-bayar : cuma bulan berjalan yang lewat jatuh tempo & belum dibayar
 *  - sebagian    : ada bulan yang benar-benar dicicil (0 < bayar < target)
 * Urutan pengecekan penting: nunggak & belum-bayar diprioritaskan di atas
 * sebagian, supaya siswa yang lunas bulan lalu tapi belum bayar bulan ini
 * tidak salah dilabeli "sebagian".
 */
function statusSppSiswa(s, sppNominal, tanggalJatuhTempo, kini) {
  if (!perluDitagihSekarang(s, sppNominal, tanggalJatuhTempo, kini)) return 'lunas'
  if (siswa_bulanTertunggak(s, sppNominal, kini) > 0) return 'nunggak'
  for (let i = 0; i <= kini; i++) {
    const bayar = s.spp[i] || 0
    if (bayar > 0 && bayar < sppNominal) return 'sebagian'
  }
  return 'belum-bayar'
}

function siswa_bulanTertunggak(s, sppNominal, kini) {
  let n = 0
  for (let i = 0; i < kini; i++) if ((s.spp[i] || 0) < sppNominal) n++
  return n
}

/* ---------------- Sheet 3: Biaya Kegiatan per Siswa ---------------- */

function sheetKegiatan(wb, { siswa, biaya }) {
  const ws = wb.addWorksheet('Biaya Kegiatan', { views: [{ state: 'frozen', xSplit: 4, ySplit: 3, showGridLines: false }] })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }
  const jmlKeg = biaya.length
  const colTotal = 5 + jmlKeg
  const colStatus = colTotal + 1

  ws.columns = [
    { width: 5 }, { width: 24 }, { width: 8 }, { width: 13 },
    ...biaya.map((b) => ({ width: Math.max(15, b.nama.length + 2) })),
    { width: 16 }, { width: 12 },
  ]

  judulLembar(ws, colStatus, `Biaya Kegiatan per Siswa — ${wb.creator}`, `${jmlKeg} jenis kegiatan tahun ajaran ini`)
  baposHeader(ws, 3, ['No', 'Nama Siswa', 'Kelas', 'NIS', ...biaya.map((b) => b.nama), 'Total Dibayar', 'Status'])

  if (jmlKeg === 0) {
    ws.mergeCells(4, 1, 4, colStatus)
    ws.getCell(4, 1).value = 'Belum ada jenis biaya kegiatan yang diatur untuk sekolah ini.'
    ws.getCell(4, 1).font = { italic: true, color: { argb: WARNA.abu } }
    return
  }

  siswa.forEach((s, idx) => {
    const r = 4 + idx
    ws.getCell(r, 1).value = idx + 1
    ws.getCell(r, 2).value = s.nama
    ws.getCell(r, 3).value = s.kelas
    ws.getCell(r, 4).value = s.nis
    let jmlLunas = 0
    biaya.forEach((b, i) => {
      const dibayar = dibayarKegiatan(s, i)
      if (dibayar >= b.nominal) jmlLunas++
      const cell = ws.getCell(r, 5 + i)
      cell.value = dibayar
      cell.numFmt = '"Rp" #,##0'
      cell.alignment = { horizontal: 'right' }
    })
    const totalDb = biaya.reduce((t, _, i) => t + dibayarKegiatan(s, i), 0)
    ws.getCell(r, colTotal).value = totalDb
    ws.getCell(r, colTotal).numFmt = '"Rp" #,##0'
    ws.getCell(r, colTotal).font = { bold: true }
    ws.getCell(r, colTotal).alignment = { horizontal: 'right' }

    // Status besar: LUNAS (semua item lunas, hijau) atau BELUM (merah).
    // Kalau ada yang lunas tapi belum semua, tetap "BELUM" tapi angka
    // per-kolom sudah menunjukkan mana yang sudah/belum.
    const semua = jmlLunas === jmlKeg
    const cS = ws.getCell(r, colStatus)
    cS.value = semua ? 'LUNAS' : 'BELUM'
    cS.fill = isiSel(semua ? 'FF8CC63F' : 'FFF01E1E')
    cS.font = { bold: true, color: { argb: WARNA.putih } }
    cS.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(r).height = 18
  })

  // baris TOTAL biaya kegiatan
  const rTotal = 4 + siswa.length
  ws.getCell(rTotal, 2).value = 'Total biaya kegiatan'
  ws.getCell(rTotal, 2).font = { bold: true }
  ws.getRow(rTotal).eachCell({ includeEmpty: true }, (c) => { c.fill = isiSel('FFE9ECF2') })
  biaya.forEach((_, i) => {
    const c = ws.getCell(rTotal, 5 + i)
    c.value = siswa.reduce((t, s) => t + dibayarKegiatan(s, i), 0)
    c.numFmt = '"Rp" #,##0'
    c.font = { bold: true }
    c.alignment = { horizontal: 'right' }
  })
  ws.getCell(rTotal, colTotal).value = siswa.reduce((t, s) => t + biaya.reduce((x, _, i) => x + dibayarKegiatan(s, i), 0), 0)
  ws.getCell(rTotal, colTotal).numFmt = '"Rp" #,##0'
  ws.getCell(rTotal, colTotal).font = { bold: true }
  ws.getCell(rTotal, colTotal).alignment = { horizontal: 'right' }
  ws.getRow(rTotal).height = 20

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colStatus } }
}

/* ---------------- Sheet: Daftar Prioritas Tindak Lanjut ---------------- */

function sheetPrioritas(wb, { siswa, biaya, pengaturan, kini }) {
  const ws = wb.addWorksheet('Prioritas Tindak Lanjut', { views: [{ showGridLines: false }] })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }
  ws.columns = [{ width: 14 }, { width: 26 }, { width: 9 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 42 }]

  // Kumpulkan siswa yang perlu ditindaklanjuti + tentukan prioritasnya.
  // TINGGI  = nunggak bulan lalu (uang sekolah tertahan makin lama).
  // SEDANG  = cuma bulan berjalan yang lewat jatuh tempo.
  const daftar = []
  siswa.forEach((s) => {
    const nunggak = siswa_bulanTertunggak(s, pengaturan.sppNominal, kini)
    const kurangSpp = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
    const perlu = perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
    if (!perlu) return
    // daftar bulan bermasalah (belum lunas s.d. bulan ini)
    const bulanMasalah = []
    for (let i = 0; i <= kini; i++) {
      if ((s.spp[i] || 0) < pengaturan.sppNominal) {
        const st = statusSpp(s.spp[i] || 0, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
        if (st === 'nunggak' || st === 'belum-bayar' || st === 'sebagian') bulanMasalah.push(BULAN[i])
      }
    }
    const rentang = bulanMasalah.length === 0 ? '-'
      : bulanMasalah.length === 1 ? bulanMasalah[0]
      : `${bulanMasalah[0]}–${bulanMasalah[bulanMasalah.length - 1]}`
    const prioritas = nunggak > 0 ? 'TINGGI' : 'SEDANG'
    const catatan = nunggak > 0
      ? (bulanMasalah.length > 1 ? 'Belum ada / kurang pembayaran SPP beberapa bulan' : `${bulanMasalah[0] || ''} belum lunas`)
      : `${bulanMasalah[0] || BULAN[kini]} belum lunas`
    daftar.push({ prioritas, nama: s.nama, kelas: s.kelas, nis: s.nis, kurang: kurangSpp, rentang, catatan, urut: nunggak })
  })
  // urutkan: prioritas tinggi dulu, lalu nominal kurang terbesar
  daftar.sort((a, b) => (b.urut - a.urut) || (b.kurang - a.kurang))

  // judul
  ws.mergeCells(1, 1, 1, 7)
  ws.getCell(1, 1).value = 'DAFTAR PRIORITAS TINDAK LANJUT'
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1F3864' } }
  ws.getRow(1).height = 26

  baposHeader(ws, 2, ['Prioritas', 'Nama Siswa', 'Kelas', 'NIS', 'Kurang Bayar SPP', 'Bulan Bermasalah', 'Catatan'])
  // header ini pakai warna biru tua supaya beda dari sheet lain
  ws.getRow(2).eachCell((c) => { c.fill = isiSel('FF1F3864') })

  if (daftar.length === 0) {
    ws.mergeCells(3, 1, 3, 7)
    ws.getCell(3, 1).value = 'Tidak ada siswa yang perlu ditindaklanjuti. Semua pembayaran SPP aman. 🎉'
    ws.getCell(3, 1).font = { italic: true, color: { argb: WARNA.ok } }
    ws.getCell(3, 1).alignment = { horizontal: 'center' }
    return
  }

  daftar.forEach((d, i) => {
    const r = 3 + i
    const cP = ws.getCell(r, 1)
    cP.value = d.prioritas
    cP.fill = isiSel(d.prioritas === 'TINGGI' ? 'FFE8613C' : 'FFE8A33C')
    cP.font = { bold: true, color: { argb: WARNA.putih } }
    cP.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getCell(r, 2).value = d.nama
    ws.getCell(r, 3).value = d.kelas
    ws.getCell(r, 4).value = d.nis
    ws.getCell(r, 5).value = d.kurang
    ws.getCell(r, 5).numFmt = '"Rp" #,##0'
    ws.getCell(r, 5).font = { bold: true, color: { argb: WARNA.danger } }
    ws.getCell(r, 5).alignment = { horizontal: 'right' }
    ws.getCell(r, 6).value = d.rentang
    ws.getCell(r, 7).value = d.catatan
    ;[2, 3, 4, 6, 7].forEach((c) => { ws.getCell(r, c).alignment = { vertical: 'middle' } })
    ws.getRow(r).height = 20
    ws.getRow(r).eachCell((c) => { c.border = { bottom: { style: 'thin', color: { argb: WARNA.abuSoft } } } })
  })
}

/* ---------------- Sheet 4: Riwayat Transaksi ---------------- */

function sheetRiwayat(wb, { pembayaran, siswa }) {
  const ws = wb.addWorksheet('Riwayat Transaksi', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] })
  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } }
  ws.columns = [{ width: 20 }, { width: 24 }, { width: 9 }, { width: 11 }, { width: 26 }, { width: 15 }, { width: 12 }]
  judulLembar(ws, 7, 'Riwayat Transaksi', `${pembayaran.length} transaksi tercatat`)
  baposHeader(ws, 3, ['Tanggal & Jam', 'Nama Siswa', 'Kelas', 'Jenis', 'Keterangan', 'Nominal', 'Metode'])

  const urut = [...pembayaran].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
  urut.forEach((p, idx) => {
    const r = 4 + idx
    const s = siswa.find((x) => x.id === p.siswaId)
    ws.getCell(r, 1).value = new Date(p.tanggal)
    ws.getCell(r, 1).numFmt = 'dd/mm/yyyy hh:mm'
    ws.getCell(r, 2).value = s?.nama || '(siswa dihapus)'
    ws.getCell(r, 3).value = s?.kelas || '-'
    ws.getCell(r, 4).value = p.jenis === 'spp' ? 'SPP' : 'Kegiatan'
    ws.getCell(r, 5).value = p.ket
    ws.getCell(r, 6).value = p.nominal
    ws.getCell(r, 6).numFmt = '"Rp"#,##0'
    ws.getCell(r, 6).font = { color: { argb: WARNA.ok }, bold: true }
    ws.getCell(r, 7).value = p.metode
    if (idx % 2 === 1) ws.getRow(r).eachCell((c) => { if (!c.fill || c.fill.fgColor?.argb !== WARNA.ok) c.fill = isiSel('FFF8FAFC') })
  })
}