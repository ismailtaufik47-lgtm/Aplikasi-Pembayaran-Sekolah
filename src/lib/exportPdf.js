/**
 * Export laporan ke PDF — dibuat di browser saat guru klik "Export PDF".
 * Sengaja lebih ringkas dari versi Excel: cuma data siswa + status SPP
 * per bulan (kode 1 huruf + warna, supaya 12 bulan muat dalam satu
 * halaman) + status biaya kegiatan. Grafik digambar ke <canvas> lalu
 * ditempel sebagai gambar — tidak butuh library chart tambahan.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  BULAN,
  bulanBerjalan,
  bulanTertunggak,
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
} from './format.js'

const WARNA = {
  brand: [59, 110, 246], brandDeep: [42, 85, 204],
  ok: [23, 124, 64], okSoft: [232, 248, 238],
  warn: [138, 90, 8], warnSoft: [254, 244, 228],
  danger: [185, 28, 28], dangerSoft: [253, 236, 236],
  abu: [138, 147, 166], abuSoft: [241, 242, 246],
  teks: [21, 26, 38], putih: [255, 255, 255],
}

const KODE_STATUS = { lunas: 'L', sebagian: 'S', nunggak: 'N', 'belum-bayar': 'B', menunggu: '–' }
const WARNA_STATUS = {
  lunas: [WARNA.okSoft, WARNA.ok],
  sebagian: [WARNA.warnSoft, WARNA.warn],
  nunggak: [WARNA.dangerSoft, WARNA.danger],
  'belum-bayar': [WARNA.warnSoft, WARNA.warn],
  belum: [WARNA.dangerSoft, WARNA.danger],
  menunggu: [WARNA.abuSoft, WARNA.abu],
}

export function unduhPdf({ siswa, biaya, pembayaran, pengaturan }) {
  const kini = bulanBerjalan()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const lebar = doc.internal.pageSize.getWidth()
  const M = 10 // margin

  // ---------- header ----------
  doc.setFillColor(...WARNA.brand)
  doc.rect(0, 0, lebar, 24, 'F')
  doc.setTextColor(...WARNA.putih)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(`Laporan Keuangan — ${pengaturan.namaSekolah}`, M, 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`Tahun ajaran ${pengaturan.tahunAjaran} · Dicetak ${tanggalPanjang()}`, M, 19)

  // ---------- ringkasan angka ----------
  const masuk = pembayaran.reduce((t, p) => t + p.nominal, 0)
  const totalTunggakan = siswa.reduce((t, s) => t + sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(s, biaya), 0)
  const menunggak = siswa.filter((s) => perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)).length
  const hitung = { lunas: 0, sebagian: 0, belum: 0 }
  siswa.forEach((s) => hitung[statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)]++)

  let y = 32
  const kartu = [
    ['Total Siswa', String(siswa.length)],
    ['Total Pemasukan', rp(masuk)],
    ['Total Tunggakan', rp(totalTunggakan)],
    ['Siswa Menunggak', `${menunggak} siswa`],
  ]
  const lebarKartu = (lebar - 2 * M - 3 * 4) / 4
  kartu.forEach(([label, nilai], i) => {
    const x = M + i * (lebarKartu + 4)
    doc.setFillColor(...WARNA.abuSoft)
    doc.roundedRect(x, y, lebarKartu, 18, 2, 2, 'F')
    doc.setTextColor(...WARNA.abu); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(label, x + 4, y + 7)
    doc.setTextColor(...WARNA.teks); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(nilai, x + 4, y + 14)
  })

  // ---------- grafik kecil: donut status + bar 6 bulan terakhir ----------
  y += 24
  const tinggiGrafik = 38
  const lebarGrafik = (lebar - 2 * M - 6) / 2
  const donutImg = gambarDonut(hitung, siswa.length)
  const barImg = gambarBar(siswa, pengaturan, kini)
  doc.addImage(donutImg, 'PNG', M, y, lebarGrafik, tinggiGrafik)
  doc.addImage(barImg, 'PNG', M + lebarGrafik + 6, y, lebarGrafik, tinggiGrafik)

  // ---------- tabel SPP per bulan ----------
  y += tinggiGrafik + 8
  doc.setTextColor(...WARNA.teks); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Status Pembayaran SPP per Bulan', M, y)
  y += 2

  const kolomBulan = BULAN.map((b) => ({ header: b.slice(0, 3), key: b }))
  autoTable(doc, {
    startY: y + 3,
    margin: { left: M, right: M },
    head: [['Nama Siswa', 'Kelas', ...kolomBulan.map((k) => k.header), 'Tunggakan', 'Status']],
    body: siswa.map((s) => {
      const baris = BULAN.map((_, i) => {
        const dibayar = dibayarSpp(s, i)
        const status = statusSpp(dibayar, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
        return { teks: KODE_STATUS[status], status }
      })
      const tunggakanSiswa = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
      let statusAkhir, labelAkhir
      if (!perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)) {
        statusAkhir = 'lunas'; labelAkhir = 'Lunas'
      } else if (bulanTertunggak(s, pengaturan.sppNominal, kini) > 0) {
        statusAkhir = 'nunggak'; labelAkhir = 'Nunggak'
      } else if (baris.some((b) => b.status === 'sebagian')) {
        statusAkhir = 'sebagian'; labelAkhir = 'Sebagian'
      } else {
        statusAkhir = 'belum-bayar'; labelAkhir = 'Belum bayar'
      }
      return [s.nama, s.kelas, ...baris.map((b) => b.teks), rp(tunggakanSiswa), { teks: labelAkhir, status: statusAkhir }]
    }),
    styles: { fontSize: 7.5, cellPadding: 1.6, halign: 'center', lineColor: [238, 240, 245], lineWidth: 0.2 },
    headStyles: { fillColor: WARNA.brandDeep, textColor: WARNA.putih, fontSize: 7, halign: 'center' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 40 },
      1: { cellWidth: 14 },
      14: { cellWidth: 22 },
      15: { cellWidth: 24 },
    },
    didParseCell(data) {
      if (data.section !== 'body') return
      const raw = data.cell.raw
      if (raw && typeof raw === 'object' && raw.status) {
        const [bg, fg] = WARNA_STATUS[raw.status] || WARNA_STATUS.menunggu
        data.cell.styles.fillColor = bg
        data.cell.styles.textColor = fg
        data.cell.styles.fontStyle = 'bold'
        data.cell.text = [String(raw.teks)]
      }
    },
    didDrawPage() { tempelFooter(doc, lebar) },
  })

  legenda(doc, M, doc.lastAutoTable.finalY + 4, LEGENDA_SPP)

  // ---------- tabel biaya kegiatan ----------
  if (biaya.length > 0) {
    let yKeg = doc.lastAutoTable.finalY + 14
    if (yKeg > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); yKeg = 20 }
    doc.setTextColor(...WARNA.teks); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('Status Pembayaran Biaya Kegiatan', M, yKeg)

    autoTable(doc, {
      startY: yKeg + 3,
      margin: { left: M, right: M },
      head: [['Nama Siswa', 'Kelas', ...biaya.map((b) => b.nama), 'Total Dibayar', 'Status']],
      body: siswa.map((s) => {
        let jmlLunas = 0
        const kol = biaya.map((b, i) => {
          const dibayar = dibayarKegiatan(s, i)
          const status = dibayar >= b.nominal ? 'lunas' : dibayar > 0 ? 'sebagian' : 'belum'
          if (status === 'lunas') jmlLunas++
          return { teks: status === 'lunas' ? 'L' : status === 'sebagian' ? '½' : '–', status }
        })
        const totalDb = biaya.reduce((t, _, i) => t + dibayarKegiatan(s, i), 0)
        const statusAkhir = jmlLunas === biaya.length ? 'lunas' : jmlLunas === 0 ? 'belum' : 'sebagian'
        const labelAkhir = jmlLunas === biaya.length ? 'Semua lunas' : jmlLunas === 0 ? 'Belum ada' : `${jmlLunas}/${biaya.length} lunas`
        return [s.nama, s.kelas, ...kol.map((k) => k), rp(totalDb), { teks: labelAkhir, status: statusAkhir }]
      }),
      styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center', lineColor: [238, 240, 245], lineWidth: 0.2 },
      headStyles: { fillColor: WARNA.brandDeep, textColor: WARNA.putih, fontSize: 7.5, halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 42 }, 1: { cellWidth: 16 } },
      didParseCell(data) {
        if (data.section !== 'body') return
        const raw = data.cell.raw
        if (raw && typeof raw === 'object' && raw.status) {
          const [bg, fg] = WARNA_STATUS[raw.status] || WARNA_STATUS.menunggu
          data.cell.styles.fillColor = bg
          data.cell.styles.textColor = fg
          data.cell.styles.fontStyle = 'bold'
          data.cell.text = [String(raw.teks)]
        }
      },
      didDrawPage() { tempelFooter(doc, lebar) },
    })
    legenda(doc, M, doc.lastAutoTable.finalY + 4, LEGENDA_KEGIATAN)
  }

  tempelFooter(doc, lebar)
  doc.save(`Laporan-${pengaturan.namaSekolah.replace(/[^a-z0-9]+/gi, '-')}-${tanggalISO()}.pdf`)
}

function legenda(doc, x, y, item) {
  doc.setFontSize(7.5)
  let cx = x
  item.forEach(([kode, [bg, fg], label]) => {
    doc.setFillColor(...bg)
    doc.roundedRect(cx, y, 5, 5, 1, 1, 'F')
    doc.setTextColor(...fg); doc.setFont('helvetica', 'bold')
    doc.text(kode, cx + (kode.length > 1 ? 0.6 : 1.6), y + 3.8)
    doc.setTextColor(...WARNA.abu); doc.setFont('helvetica', 'normal')
    doc.text(label, cx + 7, y + 3.8)
    cx += 7 + doc.getTextWidth(label) + 6
  })
}

const LEGENDA_SPP = [['L', WARNA_STATUS.lunas, 'Lunas'], ['S', WARNA_STATUS.sebagian, 'Sebagian'], ['N', WARNA_STATUS.nunggak, 'Nunggak'], ['B', WARNA_STATUS['belum-bayar'], 'Belum bayar bulan ini'], ['–', WARNA_STATUS.menunggu, 'Menunggu jatuh tempo']]
const LEGENDA_KEGIATAN = [['L', WARNA_STATUS.lunas, 'Lunas'], ['½', WARNA_STATUS.sebagian, 'Sebagian'], ['–', WARNA_STATUS.belum, 'Belum bayar']]

function tempelFooter(doc, lebar) {
  const h = doc.internal.pageSize.getHeight()
  doc.setFontSize(7.5); doc.setTextColor(...WARNA.abu); doc.setFont('helvetica', 'normal')
  doc.text(`Dicetak ${tanggalPanjang()} — Aplikasi Pembayaran TK`, 10, h - 6)
  const halaman = doc.internal.getCurrentPageInfo().pageNumber
  doc.text(`Halaman ${halaman}`, lebar - 10, h - 6, { align: 'right' })
}

/* ---------------- grafik kecil digambar ke canvas ---------------- */

function kanvas(w, h) {
  const c = document.createElement('canvas')
  const skala = 3 // render 3x lalu diskalakan turun oleh PDF, supaya tidak buram
  c.width = w * skala; c.height = h * skala
  const ctx = c.getContext('2d')
  ctx.scale(skala, skala)
  return { c, ctx }
}

function gambarDonut(hitung, total) {
  const { c, ctx } = kanvas(200, 100)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#151A26'
  ctx.fillText('Status Pembayaran', 4, 14)

  const cx = 42, cy = 55, R = 30, LEBAR = 10
  const warna = { lunas: '#22C55E', sebagian: '#F5A524', belum: '#EF4444' }
  const label = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Menunggak' }
  let mulai = -Math.PI / 2
  ;['lunas', 'sebagian', 'belum'].forEach((k) => {
    const frac = total ? hitung[k] / total : 0
    if (frac <= 0) return
    const akhir = mulai + frac * 2 * Math.PI
    ctx.beginPath()
    ctx.arc(cx, cy, R, mulai, akhir)
    ctx.strokeStyle = warna[k]
    ctx.lineWidth = LEBAR
    ctx.stroke()
    mulai = akhir
  })
  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI)
    ctx.strokeStyle = '#EEF0F5'; ctx.lineWidth = LEBAR; ctx.stroke()
  }
  ctx.fillStyle = '#151A26'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(String(total), cx, cy + 5)
  ctx.textAlign = 'left'

  let ly = 30
  ;['lunas', 'sebagian', 'belum'].forEach((k) => {
    ctx.fillStyle = warna[k]
    ctx.fillRect(94, ly - 7, 8, 8)
    ctx.fillStyle = '#475467'
    ctx.font = '9px sans-serif'
    ctx.fillText(`${label[k]}: ${hitung[k]}`, 106, ly)
    ly += 16
  })

  return c.toDataURL('image/png')
}

function gambarBar(siswa, pengaturan, kini) {
  const { c, ctx } = kanvas(200, 100)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#151A26'
  ctx.fillText('Pemasukan SPP 6 Bulan Terakhir', 4, 14)

  const mulaiIdx = Math.max(0, kini - 5)
  const data = []
  for (let i = mulaiIdx; i <= kini; i++) {
    const masuk = siswa.reduce((t, s) => t + dibayarSpp(s, i), 0)
    const target = siswa.length * pengaturan.sppNominal
    data.push({ label: BULAN[i].slice(0, 3), masuk, target })
  }
  const maks = Math.max(...data.map((d) => Math.max(d.masuk, d.target)), 1)
  // Anggaran tinggi kanvas (total 100): judul 0–18, area batang 20–70,
  // label bulan di 78, legenda di 84–92. Sengaja disisakan ruang di
  // bawah 92 supaya teks legenda tidak terpotong tepi kanvas.
  const areaX = 8, areaY = 20, areaW = 184, areaH = 50
  const lebarGrup = areaW / data.length
  data.forEach((d, i) => {
    const x = areaX + i * lebarGrup
    const hTarget = (d.target / maks) * areaH
    const hMasuk = (d.masuk / maks) * areaH
    ctx.fillStyle = '#E4E9F5'
    ctx.fillRect(x + 6, areaY + areaH - hTarget, 10, hTarget)
    ctx.fillStyle = '#3B6EF6'
    ctx.fillRect(x + 18, areaY + areaH - hMasuk, 10, hMasuk)
    ctx.fillStyle = '#8A93A6'
    ctx.font = '8px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(d.label, x + 17, areaY + areaH + 8)
  })
  ctx.textAlign = 'left'
  ctx.fillStyle = '#3B6EF6'; ctx.fillRect(4, areaY + areaH + 14, 6, 6)
  ctx.fillStyle = '#475467'; ctx.font = '8px sans-serif'
  ctx.fillText('Pembayaran', 12, areaY + areaH + 19)
  ctx.fillStyle = '#E4E9F5'; ctx.fillRect(70, areaY + areaH + 14, 6, 6)
  ctx.fillStyle = '#475467'
  ctx.fillText('Target', 78, areaY + areaH + 19)

  return c.toDataURL('image/png')
}