/**
 * Export Excel dari halaman Tagihan — beda dari exportExcel.js (yang
 * satu sheet berisi SEMUA siswa dengan 12 kolom bulan). Di sini:
 *  1. Ringkasan & Rekap — rekap tunggakan SPP PER BULAN (Juli berapa,
 *     Agustus berapa, dst) dan rekap tunggakan PER JENIS KEGIATAN,
 *     supaya kepala sekolah/guru langsung lihat pola tunggakannya
 *     di bulan/kegiatan mana yang paling bermasalah.
 *  2. Satu sheet per KELAS — daftar tagihan (baris = satu tagihan,
 *     persis seperti tabel di halaman Tagihan) khusus siswa kelas itu.
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import {
  BULAN,
  dibayarKegiatan,
  dibayarSpp,
  rp,
  statusSpp,
  tanggalISO,
  tanggalPanjang,
} from './format.js'
import { WARNA, isiSel, gayaStatus, judulLembar, baposHeader, PAGE_SETUP_LANDSCAPE } from './exportHelpers.js'

export async function unduhExcelTagihan({ tagihan, siswa, pengaturan, kini }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = pengaturan.namaSekolah
  wb.created = new Date()

  sheetRekap(wb, { tagihan, siswa, pengaturan, kini })

  const kelasUrut = [...new Set(siswa.map((s) => s.kelas))].sort()
  kelasUrut.forEach((k) => sheetKelas(wb, { kelas: k, tagihan: tagihan.filter((t) => t.kelas === k), pengaturan }))

  const buf = await wb.xlsx.writeBuffer()
  const nama = `Tagihan-${pengaturan.namaSekolah.replace(/[^a-z0-9]+/gi, '-')}-${tanggalISO()}.xlsx`
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), nama)
}

/* ---------------- Sheet: Ringkasan & Rekap ---------------- */

function sheetRekap(wb, { tagihan, siswa, pengaturan, kini }) {
  const ws = wb.addWorksheet('Ringkasan & Rekap', { views: [{ showGridLines: false }] })
  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: PAGE_SETUP_LANDSCAPE.margins }
  ws.columns = [{ width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }]

  judulLembar(ws, 5, `Rekap Tagihan — ${pengaturan.namaSekolah}`, `Tahun ajaran ${pengaturan.tahunAjaran} · Posisi ${tanggalPanjang()}`)

  // --- kartu KPI ---
  const total = tagihan.length
  const lunas = tagihan.filter((t) => t.status === 'lunas').length
  const totalSisa = tagihan.reduce((t, x) => t + x.sisa, 0)
  const kartu = [
    ['Total Tagihan', String(total), WARNA.brandSoft, WARNA.brandDeep],
    ['Lunas', String(lunas), WARNA.okSoft, WARNA.ok],
    ['Belum Lunas', String(total - lunas), WARNA.warnSoft, WARNA.warn],
    ['Total Belum Terbayar', rp(totalSisa), WARNA.dangerSoft, WARNA.danger],
  ]
  const baseRow = 4
  kartu.forEach(([label, nilai, bg, fg], i) => {
    const col = i + 1
    const cL = ws.getCell(baseRow, col)
    cL.value = label; cL.font = { size: 9, color: { argb: WARNA.abu } }; cL.fill = isiSel(bg); cL.alignment = { horizontal: 'center' }
    const cN = ws.getCell(baseRow + 1, col)
    cN.value = nilai; cN.font = { bold: true, size: 15, color: { argb: fg } }; cN.fill = isiSel(bg); cN.alignment = { horizontal: 'center' }
    ws.getCell(baseRow + 2, col).fill = isiSel(bg)
  })
  ws.getRow(baseRow).height = 18
  ws.getRow(baseRow + 1).height = 26
  ws.getRow(baseRow + 2).height = 6

  // --- rekap tunggakan SPP per bulan ---
  let r = baseRow + 4
  ws.getCell(r, 1).value = 'Rekap Tunggakan SPP per Bulan'
  ws.getCell(r, 1).font = { bold: true, size: 12 }
  r += 1
  baposHeader(ws, r, ['Bulan', 'Target', 'Terkumpul', 'Tunggakan', 'Siswa Belum Lunas'])
  r += 1
  for (let i = 0; i <= kini; i++) {
    const baris = tagihan.filter((t) => t.jenis === 'spp' && t.indeks === i)
    const target = baris.reduce((t, x) => t + x.target, 0)
    const terkumpul = baris.reduce((t, x) => t + x.dibayar, 0)
    const tunggakan = baris.reduce((t, x) => t + x.sisa, 0)
    const belumLunas = baris.filter((x) => x.status !== 'lunas').length
    ws.getCell(r, 1).value = BULAN[i]
    ws.getCell(r, 1).font = { bold: true }
    ws.getCell(r, 2).value = target
    ws.getCell(r, 2).numFmt = '"Rp" #,##0'
    ws.getCell(r, 3).value = terkumpul
    ws.getCell(r, 3).numFmt = '"Rp" #,##0'
    ws.getCell(r, 3).font = { color: { argb: WARNA.ok } }
    ws.getCell(r, 4).value = tunggakan
    ws.getCell(r, 4).numFmt = '"Rp" #,##0'
    ws.getCell(r, 4).font = { bold: true, color: { argb: tunggakan > 0 ? WARNA.danger : WARNA.abu } }
    ws.getCell(r, 5).value = belumLunas
    ws.getCell(r, 5).alignment = { horizontal: 'center' }
    ws.getRow(r).eachCell((c) => { c.border = { bottom: { style: 'hair', color: { argb: WARNA.abuSoft } } } })
    r += 1
  }
  // baris total SPP
  const spTotalTarget = tagihan.filter((t) => t.jenis === 'spp').reduce((t, x) => t + x.target, 0)
  const spTotalMasuk = tagihan.filter((t) => t.jenis === 'spp').reduce((t, x) => t + x.dibayar, 0)
  const spTotalSisa = tagihan.filter((t) => t.jenis === 'spp').reduce((t, x) => t + x.sisa, 0)
  ws.getCell(r, 1).value = 'TOTAL SPP'
  ws.getCell(r, 1).font = { bold: true, color: { argb: WARNA.brandDeep } }
  ws.getRow(r).eachCell({ includeEmpty: true }, (c) => { c.fill = isiSel('FFE9ECF2') })
  ws.getCell(r, 2).value = spTotalTarget; ws.getCell(r, 2).numFmt = '"Rp" #,##0'; ws.getCell(r, 2).font = { bold: true }
  ws.getCell(r, 3).value = spTotalMasuk; ws.getCell(r, 3).numFmt = '"Rp" #,##0'; ws.getCell(r, 3).font = { bold: true, color: { argb: WARNA.ok } }
  ws.getCell(r, 4).value = spTotalSisa; ws.getCell(r, 4).numFmt = '"Rp" #,##0'; ws.getCell(r, 4).font = { bold: true, color: { argb: WARNA.danger } }
  ws.getRow(r).height = 20
  r += 3

  // --- rekap tunggakan biaya kegiatan ---
  ws.getCell(r, 1).value = 'Rekap Tunggakan Biaya Kegiatan'
  ws.getCell(r, 1).font = { bold: true, size: 12 }
  r += 1
  baposHeader(ws, r, ['Jenis Kegiatan', 'Target', 'Terkumpul', 'Tunggakan', 'Siswa Belum Lunas'])
  r += 1
  const jenisKegiatan = [...new Set(tagihan.filter((t) => t.jenis === 'kegiatan').map((t) => t.labelJenis))]
  jenisKegiatan.forEach((nama) => {
    const baris = tagihan.filter((t) => t.jenis === 'kegiatan' && t.labelJenis === nama)
    const target = baris.reduce((t, x) => t + x.target, 0)
    const terkumpul = baris.reduce((t, x) => t + x.dibayar, 0)
    const tunggakan = baris.reduce((t, x) => t + x.sisa, 0)
    const belumLunas = baris.filter((x) => x.status !== 'lunas').length
    ws.getCell(r, 1).value = nama
    ws.getCell(r, 1).font = { bold: true }
    ws.getCell(r, 2).value = target; ws.getCell(r, 2).numFmt = '"Rp" #,##0'
    ws.getCell(r, 3).value = terkumpul; ws.getCell(r, 3).numFmt = '"Rp" #,##0'; ws.getCell(r, 3).font = { color: { argb: WARNA.ok } }
    ws.getCell(r, 4).value = tunggakan; ws.getCell(r, 4).numFmt = '"Rp" #,##0'
    ws.getCell(r, 4).font = { bold: true, color: { argb: tunggakan > 0 ? WARNA.danger : WARNA.abu } }
    ws.getCell(r, 5).value = belumLunas
    ws.getCell(r, 5).alignment = { horizontal: 'center' }
    ws.getRow(r).eachCell((c) => { c.border = { bottom: { style: 'hair', color: { argb: WARNA.abuSoft } } } })
    r += 1
  })
  if (jenisKegiatan.length === 0) {
    ws.getCell(r, 1).value = 'Belum ada jenis biaya kegiatan.'
    ws.getCell(r, 1).font = { italic: true, color: { argb: WARNA.abu } }
    r += 1
  } else {
    const kgTotalTarget = tagihan.filter((t) => t.jenis === 'kegiatan').reduce((t, x) => t + x.target, 0)
    const kgTotalMasuk = tagihan.filter((t) => t.jenis === 'kegiatan').reduce((t, x) => t + x.dibayar, 0)
    const kgTotalSisa = tagihan.filter((t) => t.jenis === 'kegiatan').reduce((t, x) => t + x.sisa, 0)
    ws.getCell(r, 1).value = 'TOTAL KEGIATAN'
    ws.getCell(r, 1).font = { bold: true, color: { argb: WARNA.brandDeep } }
    ws.getRow(r).eachCell({ includeEmpty: true }, (c) => { c.fill = isiSel('FFE9ECF2') })
    ws.getCell(r, 2).value = kgTotalTarget; ws.getCell(r, 2).numFmt = '"Rp" #,##0'; ws.getCell(r, 2).font = { bold: true }
    ws.getCell(r, 3).value = kgTotalMasuk; ws.getCell(r, 3).numFmt = '"Rp" #,##0'; ws.getCell(r, 3).font = { bold: true, color: { argb: WARNA.ok } }
    ws.getCell(r, 4).value = kgTotalSisa; ws.getCell(r, 4).numFmt = '"Rp" #,##0'; ws.getCell(r, 4).font = { bold: true, color: { argb: WARNA.danger } }
    ws.getRow(r).height = 20
  }
}

/* ---------------- Sheet per kelas ---------------- */

function sheetKelas(wb, { kelas, tagihan, pengaturan }) {
  const ws = wb.addWorksheet(`Kelas ${kelas}`, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] })
  ws.pageSetup = PAGE_SETUP_LANDSCAPE
  ws.columns = [
    { width: 14 }, { width: 24 }, { width: 20 }, { width: 13 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
  ]

  const namaSiswaUnik = new Set(tagihan.map((t) => t.siswaId)).size
  judulLembar(ws, 8, `Tagihan Kelas ${kelas} — ${pengaturan.namaSekolah}`, `${namaSiswaUnik} siswa · ${tagihan.length} tagihan`)
  baposHeader(ws, 3, ['No. Tagihan', 'Nama Siswa', 'Jenis Biaya', 'Jatuh Tempo', 'Total', 'Dibayar', 'Sisa', 'Status'])

  if (tagihan.length === 0) {
    ws.mergeCells(4, 1, 4, 8)
    ws.getCell(4, 1).value = 'Belum ada tagihan untuk kelas ini.'
    ws.getCell(4, 1).font = { italic: true, color: { argb: WARNA.abu } }
    return
  }

  // urutkan per siswa lalu per jenis, supaya tagihan satu anak berdekatan
  const urut = [...tagihan].sort((a, b) => a.nama.localeCompare(b.nama) || a.no.localeCompare(b.no))

  urut.forEach((t, i) => {
    const r = 4 + i
    ws.getCell(r, 1).value = t.no
    ws.getCell(r, 1).font = { size: 9, color: { argb: WARNA.abu } }
    ws.getCell(r, 2).value = t.nama
    ws.getCell(r, 3).value = t.labelJenis
    ws.getCell(r, 4).value = t.jatuhTempo || '—'
    ws.getCell(r, 5).value = t.target; ws.getCell(r, 5).numFmt = '"Rp" #,##0'
    ws.getCell(r, 6).value = t.dibayar; ws.getCell(r, 6).numFmt = '"Rp" #,##0'; ws.getCell(r, 6).font = { color: { argb: WARNA.ok } }
    ws.getCell(r, 7).value = t.sisa; ws.getCell(r, 7).numFmt = '"Rp" #,##0'
    ws.getCell(r, 7).font = { bold: true, color: { argb: t.sisa > 0 ? WARNA.danger : WARNA.abu } }

    const statusKey = t.status === 'nunggak' ? 'nunggak' : t.status === 'sebagian' ? 'sebagian' : t.status === 'lunas' ? 'lunas' : 'belum-bayar'
    const gaya = gayaStatus(statusKey)
    const label = { nunggak: 'Jatuh Tempo', sebagian: 'Sebagian', lunas: 'Lunas', 'belum-bayar': 'Belum' }[statusKey]
    ws.getCell(r, 8).value = label
    ws.getCell(r, 8).fill = gaya.fill
    ws.getCell(r, 8).font = gaya.font
    ws.getCell(r, 8).alignment = { horizontal: 'center' }

    ws.getRow(r).eachCell((c, col) => { if (col !== 8) c.border = { bottom: { style: 'hair', color: { argb: WARNA.abuSoft } } } })
  })

  // baris total kelas
  const rTotal = 4 + urut.length
  ws.getCell(rTotal, 2).value = `Total kelas ${kelas}`
  ws.getCell(rTotal, 2).font = { bold: true }
  ws.getRow(rTotal).eachCell({ includeEmpty: true }, (c) => { c.fill = isiSel('FFE9ECF2') })
  ws.getCell(rTotal, 5).value = urut.reduce((t, x) => t + x.target, 0); ws.getCell(rTotal, 5).numFmt = '"Rp" #,##0'; ws.getCell(rTotal, 5).font = { bold: true }
  ws.getCell(rTotal, 6).value = urut.reduce((t, x) => t + x.dibayar, 0); ws.getCell(rTotal, 6).numFmt = '"Rp" #,##0'; ws.getCell(rTotal, 6).font = { bold: true, color: { argb: WARNA.ok } }
  ws.getCell(rTotal, 7).value = urut.reduce((t, x) => t + x.sisa, 0); ws.getCell(rTotal, 7).numFmt = '"Rp" #,##0'; ws.getCell(rTotal, 7).font = { bold: true, color: { argb: WARNA.danger } }
  ws.getRow(rTotal).height = 20

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 8 } }
}