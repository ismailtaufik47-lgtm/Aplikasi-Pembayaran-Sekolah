/**
 * Helper visual bersama untuk export Excel (ExcelJS) — dipisah dari
 * exportExcel.js supaya exportTagihan.js (dan export lain di masa
 * depan) bisa pakai palet warna & gaya yang SAMA tanpa copy-paste.
 */

// Palet warna selaras dengan aplikasi (hex tanpa '#', format yang dipakai ExcelJS)
export const WARNA = {
  brand: 'FF3B6EF6', brandSoft: 'FFEAF0FE', brandDeep: 'FF2A55CC',
  ok: 'FF177C40', okSoft: 'FFE8F8EE',
  warn: 'FF8A5A08', warnSoft: 'FFFEF4E4',
  danger: 'FFB91C1C', dangerSoft: 'FFFDECEC',
  grape: 'FF6D28D9', grapeSoft: 'FFF1ECFE',
  abu: 'FF8A93A6', abuSoft: 'FFF1F2F6',
  putih: 'FFFFFFFF', teks: 'FF151A26',
}

export const isiSel = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
export const FONT_HEADER = { bold: true, color: { argb: WARNA.putih }, size: 11 }
export const FONT_JUDUL = { bold: true, color: { argb: WARNA.putih }, size: 16 }

/** Warna latar+teks per status — dipakai berulang di beberapa sheet. */
export function gayaStatus(status) {
  const map = {
    lunas: [WARNA.okSoft, WARNA.ok],
    sebagian: [WARNA.warnSoft, WARNA.warn],
    nunggak: [WARNA.dangerSoft, WARNA.danger],
    'belum-bayar': [WARNA.warnSoft, WARNA.warn],
    belum: [WARNA.dangerSoft, WARNA.danger],
    menunggu: [WARNA.abuSoft, WARNA.abu],
  }
  const [bg, fg] = map[status] || map.menunggu
  return { fill: isiSel(bg), font: { color: { argb: fg }, bold: true } }
}

export const LABEL_STATUS = {
  lunas: 'Lunas', sebagian: 'Sebagian', nunggak: 'Nunggak',
  'belum-bayar': 'Belum bayar', belum: 'Menunggak', menunggu: 'Menunggu',
}

export function judulLembar(ws, kolTerakhir, judul, sub) {
  ws.mergeCells(1, 1, 1, kolTerakhir)
  const c1 = ws.getCell(1, 1)
  c1.value = judul
  c1.font = FONT_JUDUL
  c1.fill = isiSel(WARNA.brand)
  c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30

  ws.mergeCells(2, 1, 2, kolTerakhir)
  const c2 = ws.getCell(2, 1)
  c2.value = sub
  c2.font = { italic: true, color: { argb: WARNA.abu }, size: 10 }
  c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 20
}

export function baposHeader(ws, baris, label, warnaBg = WARNA.brandDeep) {
  const row = ws.getRow(baris)
  label.forEach((teks, i) => {
    const c = row.getCell(i + 1)
    c.value = teks
    c.font = FONT_HEADER
    c.fill = isiSel(warnaBg)
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { bottom: { style: 'thin', color: { argb: WARNA.putih } } }
  })
  row.height = 26
}

export const PAGE_SETUP_LANDSCAPE = {
  orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
  margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
}