/**
 * Excel "Rekap kegiatan" (Laporan › Kegiatan):
 *   • sheet "Rekap kegiatan" — satu baris per kegiatan: target, uang masuk,
 *     terpakai, sisa / nombok, jumlah nota. Kolom Sisa & baris TOTAL memakai
 *     RUMUS, jadi kalau angka diedit di Excel totalnya ikut berubah.
 *   • satu sheet per kegiatan — ringkasan dana, rincian pengeluaran,
 *     subtotal per kategori (SUMIF), dan siswa yang belum lunas.
 * Bisa juga satu kegiatan saja (tombol Excel di halaman rincian kegiatan).
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { tanggalISO, tanggalPanjang, tanggalKegiatan } from './format.js'
import { WARNA, isiSel, judulLembar, baposHeader, PAGE_SETUP_LANDSCAPE } from './exportHelpers.js'
import { tglKas } from './kas.js'

const RUPIAH = '"Rp "#,##0;[Red]-"Rp "#,##0'
const TOTAL = { bold: true, color: { argb: WARNA.brandDeep } }
const ISI_TOTAL = isiSel(WARNA.brandSoft)

const lembar = (wb, nama) => {
  const dasar = String(nama).replace(/\s*\/\s*/g, '-').replace(/[\\?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Kegiatan'
  let unik = dasar
  for (let n = 2; wb.getWorksheet(unik); n++) unik = `${dasar.slice(0, 25)} (${n})`
  const ws = wb.addWorksheet(unik, { views: [{ showGridLines: false }] })
  ws.pageSetup = PAGE_SETUP_LANDSCAPE
  return ws
}

const tglKeg = (k) => (k.biaya ? tanggalKegiatan(k.biaya, true) : k.paket?.tahunAjaran ? `TA ${k.paket.tahunAjaran}` : '') || '-'

function sel(ws, r, c, nilai, gaya = {}) {
  const x = ws.getCell(r, c)
  x.value = nilai
  if (gaya.rp) x.numFmt = RUPIAH
  if (gaya.persen) x.numFmt = '0%'
  if (gaya.font) x.font = gaya.font
  if (gaya.fill) x.fill = gaya.fill
  x.alignment = { vertical: 'middle', horizontal: gaya.kanan ? 'right' : 'left', wrapText: !!gaya.wrap }
  return x
}

function lembarRekap(wb, daftar, sekolah, ta) {
  const ws = lembar(wb, 'Rekap kegiatan')
  const kol = [['Kegiatan', 30], ['Tanggal', 16], ['Siswa', 9], ['Target', 16], ['Uang masuk', 16], ['Terpakai', 16], ['Sisa / nombok', 17], ['Jml nota', 10]]
  kol.forEach(([, w], i) => { ws.getColumn(i + 1).width = w })
  judulLembar(ws, kol.length, `Rekap kegiatan — ${sekolah}${ta ? ' · tahun ajaran ' + ta : ''}`,
    `Uang masuk = pembayaran orang tua untuk kegiatan itu · Terpakai = pengeluaran kas berlabel kegiatan · dicetak ${tanggalPanjang()}`)
  baposHeader(ws, 4, kol.map(([l]) => l))
  daftar.forEach((k, i) => {
    const r = 5 + i
    const z = i % 2 ? { fill: isiSel('FFF7F8FC') } : {}
    sel(ws, r, 1, k.nama, z)
    sel(ws, r, 2, tglKeg(k), z)
    sel(ws, r, 3, k.siswa, { ...z, kanan: true })
    sel(ws, r, 4, k.target, { ...z, rp: true, kanan: true })
    sel(ws, r, 5, k.masuk, { ...z, rp: true, kanan: true })
    sel(ws, r, 6, k.terpakai, { ...z, rp: true, kanan: true })
    sel(ws, r, 7, { formula: `E${r}-F${r}`, result: k.sisa }, { ...z, rp: true, kanan: true, font: { bold: true, color: { argb: k.sisa < 0 ? WARNA.danger : k.terpakai ? WARNA.ok : WARNA.abu } } })
    sel(ws, r, 8, k.nota.length + (k.notaLama || 0), { ...z, kanan: true })
  })
  const a = 5, z = 4 + daftar.length, t = z + 1
  sel(ws, t, 1, 'TOTAL', { font: TOTAL, fill: ISI_TOTAL })
  sel(ws, t, 2, '', { fill: ISI_TOTAL })
  ;[3, 4, 5, 6, 7, 8].forEach((c) => {
    const h = String.fromCharCode(64 + c)
    const hasil = daftar.reduce((s, k) => s + ([0, 0, k.siswa, k.target, k.masuk, k.terpakai, k.sisa, k.nota.length + (k.notaLama || 0)][c - 1] || 0), 0)
    sel(ws, t, c, daftar.length ? { formula: `SUM(${h}${a}:${h}${z})`, result: hasil } : 0, { rp: c >= 4 && c <= 7, kanan: true, font: TOTAL, fill: ISI_TOTAL })
  })
  ws.getRow(t).height = 24
  sel(ws, t + 2, 1, 'Sisa minus (merah) = nombok: kekurangannya tertutup dari kas sekolah.', { font: { italic: true, color: { argb: WARNA.abu }, size: 10 } })
  sel(ws, t + 3, 1, 'Rincian pengeluaran setiap kegiatan ada di sheet berikutnya.', { font: { italic: true, color: { argb: WARNA.abu }, size: 10 } })
}

function lembarKegiatan(wb, k, sekolah) {
  const ws = lembar(wb, k.nama)
  const lebar = [6, 14, 36, 20, 17, 10, 18]
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  judulLembar(ws, 7, `${k.nama}${k.biaya ? ' — ' + (tanggalKegiatan(k.biaya) || 'tanggal belum diisi') : ''}`,
    `${sekolah} · Rp ${Number(k.nominal).toLocaleString('id-ID')} per siswa × ${k.siswa} siswa · dicetak ${tanggalPanjang()}`)

  // ---------- rincian dulu (dipakai rumus ringkasan) ----------
  const r0 = 12
  baposHeader(ws, r0, ['No', 'Tanggal', 'Uraian', 'Kategori', 'Nominal', 'Nota', 'Dicatat oleh'])
  k.rincian.forEach((x, i) => {
    const r = r0 + 1 + i
    const z = i % 2 ? { fill: isiSel('FFF7F8FC') } : {}
    sel(ws, r, 1, i + 1, z)
    sel(ws, r, 2, tglKas(x.tanggal, true), z)
    sel(ws, r, 3, x.uraian || '-', { ...z, wrap: true })
    sel(ws, r, 4, x.kategori, z)
    sel(ws, r, 5, Number(x.nominal), { ...z, rp: true, kanan: true })
    const ada = (x.notaFile || []).length > 0 || x.notaLama
    sel(ws, r, 6, ada ? 'Ada' : '-', { ...z, font: ada ? { bold: true, color: { argb: WARNA.ok } } : { color: { argb: WARNA.abu } } })
    sel(ws, r, 7, x.dicatatNama || '-', z)
  })
  const ra = r0 + 1, rz = r0 + Math.max(1, k.rincian.length)
  if (!k.rincian.length) sel(ws, ra, 3, 'Belum ada pengeluaran untuk kegiatan ini.', { font: { italic: true, color: { argb: WARNA.abu } } })
  const rt = rz + 1
  sel(ws, rt, 2, 'TOTAL', { font: TOTAL, fill: ISI_TOTAL })
  ;[1, 3, 4, 6, 7].forEach((c) => sel(ws, rt, c, '', { fill: ISI_TOTAL }))
  sel(ws, rt, 5, { formula: `SUM(E${ra}:E${rz})`, result: k.terpakai }, { rp: true, kanan: true, font: TOTAL, fill: ISI_TOTAL })
  sel(ws, rt, 6, `${k.nota.length + (k.notaLama || 0)} nota`, { font: TOTAL, fill: ISI_TOTAL })

  // ---------- ringkasan dana (baris 4–10) ----------
  baposHeader(ws, 4, ['', 'RINGKASAN DANA', '', '', 'Nominal', '', ''])
  ws.mergeCells(4, 2, 4, 4)
  const baris = [
    [`Target (${k.siswa} siswa)`, k.target, null],
    [`Uang masuk dari orang tua (${k.lunas} siswa lunas)`, k.masuk, null],
    [`Belum masuk (${k.siswa - k.lunas} siswa belum lunas)`, { formula: 'E5-E6', result: k.target - k.masuk }, null],
    ['Total pengeluaran', { formula: `E${rt}`, result: k.terpakai }, WARNA.danger],
    [k.sisa < 0 ? 'NOMBOK (ditutup kas sekolah)' : 'SISA DANA', { formula: 'E6-E8', result: k.sisa }, 'total'],
  ]
  baris.forEach(([l, v, w], i) => {
    const r = 5 + i
    ws.mergeCells(r, 2, r, 4)
    const total = w === 'total'
    sel(ws, r, 2, l, total ? { font: TOTAL, fill: ISI_TOTAL } : {})
    sel(ws, r, 5, v, { rp: true, kanan: true, ...(total ? { font: TOTAL, fill: ISI_TOTAL } : w ? { font: { bold: true, color: { argb: w } } } : {}) })
  })

  // ---------- per kategori (SUMIF dari tabel rincian) ----------
  let r = rt + 2
  baposHeader(ws, r, ['', 'PER KATEGORI', '', '', 'Nominal', '%', ''])
  ws.mergeCells(r, 2, r, 4)
  k.perKategori.forEach((x, i) => {
    const rr = r + 1 + i
    ws.mergeCells(rr, 2, rr, 4)
    sel(ws, rr, 2, x.kategori)
    sel(ws, rr, 5, { formula: `SUMIF(D${ra}:D${rz},B${rr},E${ra}:E${rz})`, result: x.nominal }, { rp: true, kanan: true })
    sel(ws, rr, 6, { formula: `IF($E$${rt}=0,0,E${rr}/$E$${rt})`, result: k.terpakai ? x.nominal / k.terpakai : 0 }, { persen: true, kanan: true })
  })
  r += 1 + Math.max(1, k.perKategori.length) + 1

  // ---------- siswa belum lunas ----------
  baposHeader(ws, r, ['No', 'SISWA BELUM LUNAS', '', 'Kelas', 'Kurang', 'Sudah bayar', ''])
  ws.mergeCells(r, 2, r, 3)
  if (!k.belumBayar.length) sel(ws, r + 1, 2, 'Semua siswa sudah lunas.', { font: { italic: true, color: { argb: WARNA.ok } } })
  k.belumBayar.forEach((s, i) => {
    const rr = r + 1 + i
    ws.mergeCells(rr, 2, rr, 3)
    sel(ws, rr, 1, i + 1)
    sel(ws, rr, 2, s.nama)
    sel(ws, rr, 4, s.kelas)
    sel(ws, rr, 5, s.kurang, { rp: true, kanan: true, font: { color: { argb: WARNA.danger } } })
    sel(ws, rr, 6, s.dibayar, { rp: true, kanan: true })
  })
}

/** daftar: hasil rekapKegiatan(); `satu` = hanya satu kegiatan (tanpa sheet rekap). */
export async function unduhExcelKegiatan({ daftar, pengaturan, satu = false }) {
  const sekolah = pengaturan?.namaSekolah || 'Sekolah'
  const wb = new ExcelJS.Workbook()
  wb.creator = sekolah
  wb.created = new Date()
  if (!satu) lembarRekap(wb, daftar, sekolah, pengaturan?.tahunAjaran)
  daftar.forEach((k) => lembarKegiatan(wb, k, sekolah))
  const buf = await wb.xlsx.writeBuffer()
  const nama = satu && daftar[0] ? daftar[0].nama : 'Rekap-kegiatan'
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${nama.replace(/[^a-z0-9]+/gi, '-')}-${sekolah.replace(/[^a-z0-9]+/gi, '-')}-${tanggalISO()}.xlsx`)
}
