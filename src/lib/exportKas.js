/**
 * Unduh laporan kas bulanan — PDF (siap cetak & tanda tangan) dan Excel.
 * Dimuat dengan import() saat tombol unduh diklik supaya halaman ringan.
 *
 * d = { lap (hasil laporanBulan), baris (hasil barisBukuKas), pengaturan, ttd }
 *   ttd (opsional, dari Profil sekolah): { nama, jabatan, ttd, stempel, logo }
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { WARNA, isiSel, judulLembar, baposHeader } from './exportHelpers.js'
import { labelBulan, NAMA_BULAN } from './kas.js'
import { tanggalPanjang } from './format.js'

const W = {
  brand: [59, 110, 246], brandSoft: [234, 240, 254],
  ok: [23, 124, 64], okSoft: [232, 248, 238],
  danger: [185, 28, 28], dangerSoft: [253, 236, 236],
  teks: [21, 26, 38], abu: [110, 118, 135], garis: [226, 230, 238], latar: [246, 247, 251],
}
const rp = (n) => (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('id-ID')
const tglPendek = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${NAMA_BULAN[m - 1].slice(0, 3)} ${y}`
}
const namaFile = (t) => t.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')

function gambarMuat(doc, dataUrl, x, y, lebar, tinggi, opacity = 1) {
  if (!dataUrl) return
  try {
    const p = doc.getImageProperties(dataUrl)
    const s = Math.min(lebar / p.width, tinggi / p.height)
    const w = p.width * s
    const h = p.height * s
    if (opacity < 1) doc.setGState(new doc.GState({ opacity }))
    doc.addImage(dataUrl, p.fileType || 'PNG', x + (lebar - w) / 2, y + (tinggi - h) / 2, w, h, undefined, 'FAST')
    if (opacity < 1) doc.setGState(new doc.GState({ opacity: 1 }))
  } catch {
    /* gambar rusak — lewati */
  }
}

/* ===================== PDF ===================== */
export function buatPdfKas({ lap, baris, pengaturan, ttd }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = doc.internal.pageSize.getWidth()
  const M = 16
  let y = 14

  // kop
  const adaLogo = !!ttd?.logo
  if (adaLogo) gambarMuat(doc, ttd.logo, M, y - 2, 18, 18)
  const xKop = adaLogo ? M + 22 : M
  doc.setTextColor(...W.teks)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(pengaturan.namaSekolah || 'Sekolah', xKop, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...W.abu)
  if (pengaturan.alamat) doc.text(doc.splitTextToSize(pengaturan.alamat, L - xKop - M), xKop, y + 9.5)
  y += 20
  doc.setDrawColor(...W.teks); doc.setLineWidth(0.6); doc.line(M, y, L - M, y)
  doc.setLineWidth(0.2); doc.line(M, y + 1, L - M, y + 1)
  y += 9

  doc.setTextColor(...W.teks); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('LAPORAN KAS BULANAN', L / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`Bulan ${labelBulan(lap.bulan)}`, L / 2, y + 5.5, { align: 'center' })
  y += 12

  // ringkasan
  const kartu = [
    ['Saldo awal bulan', lap.saldoAwal, W.latar, W.teks],
    ['Total pemasukan', lap.totalMasuk, W.okSoft, W.ok],
    ['Total pengeluaran', lap.totalKeluar, W.dangerSoft, W.danger],
    ['Saldo akhir bulan', lap.saldoAkhir, W.brandSoft, W.brand],
  ]
  const lk = (L - 2 * M - 3 * 3) / 4
  kartu.forEach(([label, nilai, bg, fg], i) => {
    const x = M + i * (lk + 3)
    doc.setFillColor(...bg); doc.roundedRect(x, y, lk, 16, 2, 2, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...W.abu)
    doc.text(label, x + 3, y + 5.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...fg)
    doc.text(rp(nilai), x + 3, y + 12)
  })
  y += 22

  // per kategori (dua tabel berdampingan)
  const lebarTabel = (L - 2 * M - 6) / 2
  const tabelKategori = (judul, data, x, warna) => {
    autoTable(doc, {
      startY: y,
      margin: { left: x },
      tableWidth: lebarTabel,
      head: [[judul, 'Jumlah']],
      body: data.length ? data.map((k) => [k.kategori, rp(k.nominal)]) : [['—', rp(0)]],
      foot: [['Total', rp(data.reduce((t, k) => t + k.nominal, 0))]],
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: W.garis, textColor: W.teks },
      headStyles: { fillColor: warna, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: W.latar, textColor: W.teks, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 32 } },
    })
    return doc.lastAutoTable.finalY
  }
  const y1 = tabelKategori('Pemasukan', lap.masukPerKategori, M, W.ok)
  const y2 = tabelKategori('Pengeluaran', lap.keluarPerKategori, M + lebarTabel + 6, W.danger)
  y = Math.max(y1, y2) + 8

  // buku kas
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...W.teks)
  doc.text('Buku kas', M, y)
  autoTable(doc, {
    startY: y + 2,
    margin: { left: M, right: M },
    head: [['No', 'Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo']],
    body: [
      ['', '', 'Saldo awal bulan', '', '', rp(lap.saldoAwal)],
      ...baris.map((b, i) => [i + 1, tglPendek(b.tanggal), b.uraian, b.masuk ? rp(b.masuk) : '', b.keluar ? rp(b.keluar) : '', rp(b.saldo)]),
    ],
    foot: [['', '', 'Jumlah', rp(lap.totalMasuk), rp(lap.totalKeluar), rp(lap.saldoAkhir)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: W.garis, textColor: W.teks, valign: 'middle' },
    headStyles: { fillColor: W.brand, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: W.latar, textColor: W.teks, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 22 },
      3: { halign: 'right', cellWidth: 25, textColor: W.ok },
      4: { halign: 'right', cellWidth: 25, textColor: W.danger },
      5: { halign: 'right', cellWidth: 27 },
    },
  })
  y = doc.lastAutoTable.finalY + 10

  // tanda tangan
  const H = doc.internal.pageSize.getHeight()
  if (y + 45 > H - 12) { doc.addPage(); y = 20 }
  const kolom = (L - 2 * M) / 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...W.teks)
  doc.text(`Dicetak ${tanggalPanjang()}`, L - M, y, { align: 'right' })
  y += 7
  const kiriX = M + kolom / 2
  const kananX = M + kolom + kolom / 2
  doc.text('Mengetahui,', kiriX, y, { align: 'center' })
  doc.text('Kepala Sekolah', kiriX, y + 4.5, { align: 'center' })
  doc.text('Dibuat oleh,', kananX, y + 0, { align: 'center' })
  doc.text(ttd?.jabatan || 'Bendahara', kananX, y + 4.5, { align: 'center' })
  gambarMuat(doc, ttd?.stempel, kananX - 30, y + 6, 26, 26, 0.85)
  gambarMuat(doc, ttd?.ttd, kananX - 22, y + 8, 44, 18)
  doc.setFont('helvetica', 'bold')
  doc.text(pengaturan.kepalaSekolah || '(.............................)', kiriX, y + 30, { align: 'center' })
  doc.text(ttd?.nama || '(.............................)', kananX, y + 30, { align: 'center' })

  // nomor halaman
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...W.abu)
    doc.text(`Laporan kas ${labelBulan(lap.bulan)} · ${pengaturan.namaSekolah} · hal. ${i}/${n}`, L / 2, H - 7, { align: 'center' })
  }
  return doc
}

export function unduhPdfKas(d) {
  const doc = buatPdfKas(d)
  doc.save(`Laporan-kas-${namaFile(labelBulan(d.lap.bulan))}-${namaFile(d.pengaturan.namaSekolah || 'sekolah')}.pdf`)
}

/* ===================== Excel ===================== */
export async function unduhExcelKas({ lap, baris, pengaturan }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = pengaturan.namaSekolah
  const ws = wb.addWorksheet('Laporan kas', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 17 }]
  judulLembar(ws, 6, `Laporan Kas — ${labelBulan(lap.bulan)}`, `${pengaturan.namaSekolah} · dicetak ${tanggalPanjang()}`)

  const uang = '"Rp "#,##0;[Red]-"Rp "#,##0'
  let r = 4
  ;[
    ['Saldo awal bulan', lap.saldoAwal, WARNA.abuSoft],
    ['Total pemasukan', lap.totalMasuk, WARNA.okSoft],
    ['Total pengeluaran', lap.totalKeluar, WARNA.dangerSoft],
    ['Saldo akhir bulan', lap.saldoAkhir, WARNA.brandSoft],
  ].forEach(([label, nilai, bg]) => {
    ws.mergeCells(r, 1, r, 3)
    const a = ws.getCell(r, 1)
    a.value = label; a.font = { bold: true }; a.fill = isiSel(bg)
    const b = ws.getCell(r, 4)
    ws.mergeCells(r, 4, r, 6)
    b.value = nilai; b.numFmt = uang; b.font = { bold: true, size: 12 }; b.fill = isiSel(bg); b.alignment = { horizontal: 'right' }
    r++
  })

  r++
  const blokKategori = (judul, data, warna) => {
    baposHeader(ws, r, ['', judul, '', 'Jumlah'], warna)
    ws.mergeCells(r, 2, r, 3)
    r++
    data.forEach((k) => {
      ws.mergeCells(r, 2, r, 3)
      ws.getCell(r, 2).value = k.kategori
      const c = ws.getCell(r, 4); c.value = k.nominal; c.numFmt = uang
      r++
    })
    ws.mergeCells(r, 2, r, 3)
    ws.getCell(r, 2).value = 'Total'; ws.getCell(r, 2).font = { bold: true }
    const t = ws.getCell(r, 4); t.value = data.reduce((s, k) => s + k.nominal, 0); t.numFmt = uang; t.font = { bold: true }
    r += 2
  }
  blokKategori('Pemasukan', lap.masukPerKategori, WARNA.ok)
  blokKategori('Pengeluaran', lap.keluarPerKategori, WARNA.danger)

  baposHeader(ws, r, ['No', 'Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo'])
  r++
  ws.getCell(r, 3).value = 'Saldo awal bulan'
  ws.getCell(r, 6).value = lap.saldoAwal; ws.getCell(r, 6).numFmt = uang
  r++
  baris.forEach((b, i) => {
    const row = ws.getRow(r)
    row.values = [i + 1, tglPendek(b.tanggal), b.uraian, b.masuk || null, b.keluar || null, b.saldo]
    ;[4, 5, 6].forEach((c) => (row.getCell(c).numFmt = uang))
    row.getCell(4).font = { color: { argb: WARNA.ok } }
    row.getCell(5).font = { color: { argb: WARNA.danger } }
    if (i % 2) row.eachCell((c) => (c.fill = isiSel(WARNA.abuSoft)))
    r++
  })
  const akhir = ws.getRow(r)
  akhir.values = ['', '', 'Jumlah', lap.totalMasuk, lap.totalKeluar, lap.saldoAkhir]
  akhir.font = { bold: true }
  ;[4, 5, 6].forEach((c) => (akhir.getCell(c).numFmt = uang))

  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `Laporan-kas-${namaFile(labelBulan(lap.bulan))}.xlsx`)
}

