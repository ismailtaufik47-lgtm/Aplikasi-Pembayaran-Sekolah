/**
 * Unduh "Rekap tahun ajaran" (Laporan › Tahunan, 0043) — untuk yayasan / arsip.
 *   unduhPdfTahunan   : A4 tegak, opsional blok tanda tangan kepala sekolah
 *   unduhExcelTahunan : satu lembar per bagian (ringkasan, SPP, kelas, kegiatan, kas, tunggakan)
 * Dimuat dengan import() saat tombol diklik (jsPDF & ExcelJS berat).
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { BULAN } from './format.js'
import { muatTtdSekolah } from './api.js'
import { WARNA, isiSel, judulLembar, baposHeader } from './exportHelpers.js'

const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID')
const persen = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–')
const tgl = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const namaFile = (p, ta) => `Rekap-${ta.replace('/', '-')}-${p.namaSekolah.replace(/[^a-z0-9]+/gi, '-')}`
const AKHIR = { naik: 'Naik kelas', tinggal: 'Tinggal kelas', lulus: 'Lulus', tidak_lanjut: 'Tidak melanjutkan', keluar: 'Keluar', pindah: 'Pindah sekolah', belum: 'Belum diproses' }
const namaBulanKas = (b) => `${BULAN[(Number(b.slice(5)) + 5) % 12]} ${b.slice(0, 4)}`

/** Baris ringkasan — dipakai PDF & Excel supaya isinya sama. */
function ringkasan(lap) {
  const r = [
    ['Siswa terdaftar', `${lap.siswa.jumlah} siswa (${lap.siswa.perKelas.map((k) => `${k.kelas}: ${k.jumlah}`).join(', ') || '-'})`],
    ['Masuk tengah tahun / keluar', `${lap.siswa.masukTengah} / ${lap.siswa.keluar} siswa`],
    ['Tarif SPP standar', `${rp(lap.tarif?.standar)} per bulan${Object.keys(lap.tarif?.kelas || {}).length ? ' · khusus: ' + Object.entries(lap.tarif.kelas).map(([k, v]) => `${k} ${rp(v)}`).join(', ') : ''}`],
    ['Target SPP setahun', rp(lap.spp.target)],
    ['SPP terkumpul', `${rp(lap.spp.masuk)} (${persen(lap.spp.masuk, lap.spp.target)})`],
    ['Tunggakan SPP', rp(lap.tunggakan.spp)],
    ['Tunggakan biaya kegiatan', rp(lap.tunggakan.kegiatan)],
    ['Siswa masih menunggak', `${lap.tunggakan.siswa} siswa`],
  ]
  if (lap.kas) r.push(
    ['Saldo kas 1 Juli', rp(lap.kas.saldoAwal)],
    ['Total pemasukan kas', rp(lap.kas.masuk)],
    ['Total pengeluaran kas', rp(lap.kas.keluar)],
    [lap.berjalan ? 'Saldo kas sekarang' : 'Saldo kas 30 Juni', rp(lap.kas.saldoAkhir)],
  )
  return r
}

/* ============================== PDF ============================== */

function gambar(doc, dataUrl, x, y, lebar, tinggi) {
  if (!dataUrl) return
  try {
    const p = doc.getImageProperties(dataUrl)
    const s = Math.min(lebar / p.width, tinggi / p.height)
    doc.addImage(dataUrl, p.fileType || 'PNG', x + (lebar - p.width * s) / 2, y + (tinggi - p.height * s) / 2, p.width * s, p.height * s, undefined, 'FAST')
  } catch { /* gambar rusak — lewati */ }
}

export async function unduhPdfTahunan({ lap, pengaturan, ttd = true }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const biru = [42, 85, 204]
  let y = 16

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(21, 26, 38)
  doc.text(`Rekap Tahun Ajaran ${lap.ta}`, M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 98, 116)
  y += 6; doc.text(pengaturan.namaSekolah + (pengaturan.alamat ? ' · ' + pengaturan.alamat : ''), M, y)
  y += 5; doc.text(`Periode ${tgl(lap.mulai)} – ${tgl(lap.berjalan ? lap.sampai : lap.selesai)}${lap.berjalan ? ' (tahun ajaran berjalan)' : ''}`, M, y)
  doc.setDrawColor(...biru); doc.setLineWidth(0.6); doc.line(M, y + 3, W - M, y + 3)
  y += 8

  const tabel = (judul, head, body, opsi = {}) => {
    if (y > H - 40) { doc.addPage(); y = 16 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(21, 26, 38)
    doc.text(judul, M, y)
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M }, head: head ? [head] : undefined, body,
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [230, 233, 240], lineWidth: 0.2 },
      headStyles: { fillColor: biru, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 253] },
      ...opsi,
    })
    y = doc.lastAutoTable.finalY + 8
  }

  tabel('Ringkasan', null, ringkasan(lap), { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58 } } })
  tabel('SPP per bulan', ['Bulan', 'Siswa ditagih', 'Lunas', 'Target', 'Terkumpul', '%'],
    lap.spp.perBulan.map((b) => [BULAN[b.i], b.ditagih, b.lunas, rp(b.target), rp(b.masuk), persen(b.masuk, b.target)]),
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } })
  tabel('SPP per kelas', ['Kelas', 'Siswa', 'Tarif/bulan', 'Target', 'Terkumpul', 'Tunggakan'],
    lap.spp.perKelas.map((k) => [k.kelas, k.siswa, rp(k.tarif), rp(k.target), rp(k.masuk), rp(k.tunggakan)]),
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } })
  if (lap.kegiatan.length) tabel('Biaya kegiatan', ['Kegiatan', 'Siswa', 'Lunas', 'Target', 'Masuk', 'Terpakai', 'Sisa'],
    lap.kegiatan.map((k) => [k.nama, k.siswa, k.lunas, rp(k.target), rp(k.masuk), k.terpakai == null ? '–' : rp(k.terpakai), k.terpakai == null ? '–' : rp(k.masuk - k.terpakai)]),
    { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } })
  if (lap.paket.length) tabel('PMB & daftar ulang', ['Paket', 'Siswa', 'Target', 'Masuk', '%'],
    lap.paket.map((p) => [p.nama, p.siswa, rp(p.target), rp(p.masuk), persen(p.masuk, p.target)]))
  tabel('Akhir tahun ajaran (kenaikan kelas)', null,
    Object.entries(lap.siswa.akhir || {}).map(([k, n]) => [AKHIR[k] || k, `${n} siswa`]), { columnStyles: { 0: { cellWidth: 58 } } })
  if (lap.kas) {
    tabel('Buku kas per bulan', ['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih'],
      lap.kas.perBulan.map((b) => [namaBulanKas(b.bulan), rp(b.masuk), rp(b.keluar), rp(b.masuk - b.keluar)]),
      { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } })
    tabel('Pengeluaran per kategori', ['Kategori', 'Jumlah'], lap.kas.keluarPerKategori.map((k) => [k.kategori, rp(k.nominal)]), { columnStyles: { 1: { halign: 'right' } } })
  }
  if (lap.tunggakan.daftar.length) tabel(`Siswa masih menunggak (${lap.tunggakan.siswa})`, ['Nama', 'Kelas', 'Status', 'SPP', 'Kegiatan', 'Total'],
    lap.tunggakan.daftar.map((x) => [x.nama, x.kelas, x.status === 'aktif' ? 'Aktif' : x.status === 'alumni' ? 'Alumni' : 'Keluar', rp(x.spp), rp(x.kegiatan), rp(x.spp + x.kegiatan)]),
    { columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } })

  // ---- tanda tangan kepala sekolah (opsional) ----
  if (ttd) {
    if (y > H - 55) { doc.addPage(); y = 20 }
    const t = await muatTtdSekolah(pengaturan.id).catch(() => null)
    // gambar TTD tersimpan dipakai hanya kalau milik kepala sekolah; selain itu dikosongkan untuk tanda tangan basah
    const milikKepala = t && (/kepala/i.test(t.jabatan || '') || (t.nama && t.nama === pengaturan.kepalaSekolah))
    const sx = W - M - 32
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(21, 26, 38)
    doc.text(`${tgl(new Date().toISOString().slice(0, 10))}`, sx, y, { align: 'center' })
    doc.text('Kepala Sekolah', sx, y + 5, { align: 'center' })
    if (t?.stempel) gambar(doc, t.stempel, sx - 30, y + 6, 27, 27)
    if (milikKepala && t.ttd) gambar(doc, t.ttd, sx - 22, y + 8, 44, 19)
    doc.setFont('helvetica', 'bold')
    doc.text(pengaturan.kepalaSekolah || '( ............................ )', sx, y + 33, { align: 'center' })
  }

  const n = doc.internal.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 147, 166)
    doc.text(`Rekap ${lap.ta} · ${pengaturan.namaSekolah} · dibuat dengan Kasceria`, M, H - 8)
    doc.text(`Hal. ${i}/${n}`, W - M, H - 8, { align: 'right' })
  }
  doc.save(namaFile(pengaturan, lap.ta) + '.pdf')
}

/* ============================== Excel ============================== */

function lembar(wb, nama, judul, sub, kolom, baris, uang = []) {
  const ws = wb.addWorksheet(nama, { views: [{ showGridLines: false }] })
  ws.columns = kolom.map(([, lebar]) => ({ width: lebar }))
  judulLembar(ws, kolom.length, judul, sub)
  baposHeader(ws, 3, kolom.map(([l]) => l))
  baris.forEach((b, i) => {
    const r = ws.getRow(4 + i)
    b.forEach((v, j) => {
      const c = r.getCell(j + 1)
      c.value = v
      if (uang.includes(j)) { c.numFmt = '"Rp "#,##0'; c.alignment = { horizontal: 'right' } }
      if (i % 2) c.fill = isiSel(WARNA.brandSoft)
    })
  })
  return ws
}

export async function unduhExcelTahunan({ lap, pengaturan }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = pengaturan.namaSekolah
  const sub = `${pengaturan.namaSekolah} · ${tgl(lap.mulai)} – ${tgl(lap.berjalan ? lap.sampai : lap.selesai)}`
  lembar(wb, 'Ringkasan', `Rekap Tahun Ajaran ${lap.ta}`, sub, [['Uraian', 34], ['Nilai', 70]], ringkasan(lap))
  lembar(wb, 'SPP per bulan', `SPP per bulan — ${lap.ta}`, sub, [['Bulan', 14], ['Siswa ditagih', 14], ['Lunas', 10], ['Mencicil', 10], ['Target', 18], ['Terkumpul', 18]],
    lap.spp.perBulan.map((b) => [BULAN[b.i], b.ditagih, b.lunas, b.sebagian, b.target, b.masuk]), [4, 5])
  lembar(wb, 'Per kelas', `SPP per kelas — ${lap.ta}`, sub, [['Kelas', 14], ['Siswa', 10], ['Tarif/bulan', 16], ['Target', 18], ['Terkumpul', 18], ['Tunggakan', 18]],
    lap.spp.perKelas.map((k) => [k.kelas, k.siswa, k.tarif, k.target, k.masuk, k.tunggakan]), [2, 3, 4, 5])
  lembar(wb, 'Kegiatan', `Biaya kegiatan — ${lap.ta}`, sub, [['Kegiatan', 26], ['Siswa', 10], ['Lunas', 10], ['Target', 18], ['Masuk', 18], ['Terpakai', 18], ['Sisa', 18]],
    lap.kegiatan.map((k) => [k.nama, k.siswa, k.lunas, k.target, k.masuk, k.terpakai ?? null, k.terpakai == null ? null : k.masuk - k.terpakai]), [3, 4, 5, 6])
  if (lap.kas) lembar(wb, 'Kas', `Buku kas per bulan — ${lap.ta}`, `Saldo 1 Juli ${rp(lap.kas.saldoAwal)} · saldo ${lap.berjalan ? 'sekarang' : '30 Juni'} ${rp(lap.kas.saldoAkhir)}`,
    [['Bulan', 18], ['Pemasukan', 18], ['Pengeluaran', 18], ['Selisih', 18]],
    lap.kas.perBulan.map((b) => [namaBulanKas(b.bulan), b.masuk, b.keluar, b.masuk - b.keluar]), [1, 2, 3])
  lembar(wb, 'Tunggakan', `Siswa masih menunggak — ${lap.ta}`, sub, [['Nama', 30], ['Kelas', 10], ['Status', 12], ['SPP', 16], ['Kegiatan', 16], ['Total', 16]],
    lap.tunggakan.daftar.map((x) => [x.nama, x.kelas, x.status === 'aktif' ? 'Aktif' : x.status === 'alumni' ? 'Alumni' : 'Keluar', x.spp, x.kegiatan, x.spp + x.kegiatan]), [3, 4, 5])
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), namaFile(pengaturan, lap.ta) + '.xlsx')
}
