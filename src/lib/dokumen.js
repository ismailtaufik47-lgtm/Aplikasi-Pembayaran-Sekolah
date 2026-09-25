/**
 * Dokumen PDF resmi yang dibuat di browser:
 *
 *   unduhKuitansiBayar(d)  — kuitansi pembayaran SPP/kegiatan untuk orang tua
 *                            (TTD bendahara + stempel sekolah + QR verifikasi)
 *   unduhKuitansiSewa(d)   — bukti pembayaran sewa aplikasi oleh sekolah
 *   unduhInvoiceSewa(d)    — invoice (tagihan) sewa aplikasi untuk sekolah
 *
 * Datanya diambil dari RPC database (kuitansi_staf / kuitansi_portal /
 * kuitansi_sewa / data_penerbit) supaya isinya pasti sama dengan catatan
 * resmi. QR mengarah ke /verifikasi/<id> — siapa pun bisa memindainya
 * untuk memastikan kuitansi itu benar-benar tercatat (bukan hasil edit).
 *
 * File ini cukup berat (jsPDF + QR), jadi selalu dimuat dengan
 * import() saat tombol unduh diklik, bukan ikut halaman awal.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import { NAMA_APLIKASI } from './langganan.js'

/* ===================== utilitas ===================== */

const W = {
  brand: [59, 110, 246], brandSoft: [234, 240, 254], brandDeep: [42, 85, 204],
  ok: [23, 124, 64], okSoft: [232, 248, 238],
  warn: [138, 90, 8], warnSoft: [254, 244, 228],
  danger: [185, 28, 28], dangerSoft: [253, 236, 236],
  teks: [21, 26, 38], abu: [110, 118, 135], garis: [226, 230, 238], latar: [246, 247, 251],
}

export const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID')

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']

/** 1250000 → "satu juta dua ratus lima puluh ribu" */
export function terbilang(angka) {
  const n = Math.floor(Math.abs(Number(angka) || 0))
  const t = (x) => {
    if (x < 12) return SATUAN[x]
    if (x < 20) return `${t(x - 10)} belas`
    if (x < 100) return `${t(Math.floor(x / 10))} puluh${x % 10 ? ' ' + t(x % 10) : ''}`
    if (x < 200) return `seratus${x > 100 ? ' ' + t(x - 100) : ''}`
    if (x < 1000) return `${t(Math.floor(x / 100))} ratus${x % 100 ? ' ' + t(x % 100) : ''}`
    if (x < 2000) return `seribu${x > 1000 ? ' ' + t(x - 1000) : ''}`
    if (x < 1e6) return `${t(Math.floor(x / 1000))} ribu${x % 1000 ? ' ' + t(x % 1000) : ''}`
    if (x < 1e9) return `${t(Math.floor(x / 1e6))} juta${x % 1e6 ? ' ' + t(x % 1e6) : ''}`
    if (x < 1e12) return `${t(Math.floor(x / 1e9))} miliar${x % 1e9 ? ' ' + t(x % 1e9) : ''}`
    return `${t(Math.floor(x / 1e12))} triliun${x % 1e12 ? ' ' + t(x % 1e12) : ''}`
  }
  const kata = n === 0 ? 'nol' : t(n)
  return kata.charAt(0).toUpperCase() + kata.slice(1) + ' rupiah'
}

const ZONA = { timeZone: 'Asia/Jakarta' }
const keDate = (v) => (typeof v === 'string' && v.length === 10 ? new Date(v + 'T00:00:00+07:00') : new Date(v))
export const tglPanjang = (v) => keDate(v).toLocaleDateString('id-ID', { ...ZONA, day: 'numeric', month: 'long', year: 'numeric' })
const jamWib = (v) => keDate(v).toLocaleTimeString('id-ID', { ...ZONA, hour: '2-digit', minute: '2-digit' }).replace(':', '.') + ' WIB'

/** Alamat halaman verifikasi untuk QR. */
export const urlVerifikasi = (id) => `${typeof window !== 'undefined' ? window.location.origin : ''}/verifikasi/${id}`

const namaFile = (t) => t.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')

/** Gambar data URL, diskalakan agar muat di kotak lebar×tinggi (rata tengah). */
function gambarMuat(doc, dataUrl, x, y, lebar, tinggi, opacity = 1) {
  if (!dataUrl) return
  try {
    const p = doc.getImageProperties(dataUrl)
    const skala = Math.min(lebar / p.width, tinggi / p.height)
    const w = p.width * skala
    const h = p.height * skala
    if (opacity < 1) doc.setGState(new doc.GState({ opacity }))
    doc.addImage(dataUrl, p.fileType || 'PNG', x + (lebar - w) / 2, y + (tinggi - h) / 2, w, h, undefined, 'FAST')
    if (opacity < 1) doc.setGState(new doc.GState({ opacity: 1 }))
  } catch {
    /* gambar rusak — lewati saja, kuitansi tetap jadi */
  }
}

/* ===================== kerangka kuitansi (A5 mendatar) ===================== */

/**
 * @param {object} k
 *   penerbit: { nama, alamat, kontak }
 *   nomor, tanggal (ISO)
 *   baris: [[label, nilai], ...]
 *   nominal, status: { teks, warna: 'ok'|'warn' }
 *   ttd: { jabatan, nama, gambar, stempel, kota? }
 *   qrUrl
 */
async function kuitansiPdf(k) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' })
  const L = 210
  const M = 12

  // latar kartu tipis
  doc.setDrawColor(...W.garis)
  doc.setLineWidth(0.3)
  doc.roundedRect(6, 6, L - 12, 148 - 12, 3, 3, 'S')

  // ---------- kop ----------
  doc.setFillColor(...W.brand)
  doc.rect(M, 12, 2.2, 15, 'F')
  doc.setTextColor(...W.teks)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(doc.splitTextToSize(k.penerbit.nama || '-', 118)[0], M + 5, 17.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...W.abu)
  const kop = [k.penerbit.alamat, k.penerbit.kontak].filter(Boolean).join(' · ')
  doc.text(doc.splitTextToSize(kop || ' ', 118).slice(0, 2), M + 5, 22)

  doc.setTextColor(...W.brand)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('KUITANSI', L - M, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...W.teks)
  doc.text(`No. ${k.nomor}`, L - M, 23, { align: 'right' })
  doc.setTextColor(...W.abu)
  doc.text(tglPanjang(k.tanggal), L - M, 27, { align: 'right' })

  doc.setDrawColor(...W.garis)
  doc.line(M, 31, L - M, 31)

  // ---------- rincian ----------
  let y = 39
  k.baris.forEach(([label, nilai]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...W.abu)
    doc.text(label, M, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...W.teks)
    const isi = doc.splitTextToSize(String(nilai ?? '-'), 82)
    doc.text(isi.slice(0, 2), M + 36, y)
    y += isi.length > 1 ? 10.5 : 7
  })

  // ---------- kotak jumlah ----------
  const bx = 136
  const by = 35
  doc.setFillColor(...W.brandSoft)
  doc.roundedRect(bx, by, L - M - bx, 30, 3, 3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...W.brandDeep)
  doc.text('JUMLAH DIBAYAR', bx + 5, by + 7)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...W.teks)
  doc.text(rp(k.nominal), bx + 5, by + 16.5)
  if (k.status) {
    const [bg, fg] = k.status.warna === 'warn' ? [W.warnSoft, W.warn] : [W.okSoft, W.ok]
    doc.setFontSize(8)
    const lebar = doc.getTextWidth(k.status.teks) + 7
    doc.setFillColor(...bg)
    doc.roundedRect(bx + 5, by + 20.5, lebar, 6, 3, 3, 'F')
    doc.setTextColor(...fg)
    doc.text(k.status.teks, bx + 8.5, by + 24.7)
  }

  // ---------- terbilang ----------
  const ty = Math.max(y + 1, 82)
  doc.setFillColor(...W.latar)
  doc.roundedRect(M, ty, L - 2 * M, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(9)
  doc.setTextColor(...W.teks)
  doc.text(`Terbilang:  ${terbilang(k.nominal)}`, M + 4, ty + 6.4, { maxWidth: L - 2 * M - 8 })

  // ---------- QR verifikasi ----------
  const qy = ty + 15
  if (k.qrUrl) {
    try {
      const qr = await QRCode.toDataURL(k.qrUrl, { margin: 0, width: 360, errorCorrectionLevel: 'M' })
      doc.addImage(qr, 'PNG', M, qy, 24, 24)
    } catch {
      /* QR gagal dibuat — kuitansi tetap jadi */
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...W.teks)
    doc.text('Cek keaslian kuitansi', M + 28, qy + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...W.abu)
    doc.text(doc.splitTextToSize('Pindai kode QR ini dengan kamera HP. Kuitansi asli akan menampilkan data yang sama persis.', 62), M + 28, qy + 9.5)
  }

  // ---------- tanda tangan ----------
  const sx = 150 // tengah blok tanda tangan
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...W.teks)
  doc.text(`${k.ttd.kota ? k.ttd.kota + ', ' : ''}${tglPanjang(k.tanggal)}`, sx, qy - 1, { align: 'center' })
  doc.text(k.ttd.jabatan || '', sx, qy + 3.5, { align: 'center' })
  // stempel sedikit menimpa tanda tangan, seperti cap asli
  gambarMuat(doc, k.ttd.stempel, sx - 30, qy + 3, 27, 27, 0.85)
  gambarMuat(doc, k.ttd.gambar, sx - 22, qy + 5, 44, 19)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const nama = k.ttd.nama || '( ............................ )'
  doc.text(nama, sx, qy + 28.5, { align: 'center' })
  if (k.ttd.nama) {
    const lw = doc.getTextWidth(nama)
    doc.setDrawColor(...W.teks)
    doc.setLineWidth(0.25)
    doc.line(sx - lw / 2, qy + 29.4, sx + lw / 2, qy + 29.4)
  }

  // ---------- kaki ----------
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(...W.abu)
  doc.text(
    `Kuitansi elektronik ini sah tanpa tanda tangan basah. Diterbitkan melalui ${NAMA_APLIKASI}.`,
    L / 2, 148 - 9.5, { align: 'center' },
  )
  return doc
}

/* ===================== kuitansi pembayaran orang tua ===================== */

/** Bentuk isi kuitansi dari hasil RPC kuitansi_staf / kuitansi_portal. */
export function isiKuitansiBayar(d) {
  const sisa = Math.max(0, (d.target || 0) - (d.terbayarSampaiIni || 0))
  const lunas = sisa === 0
  return {
    penerbit: { nama: d.sekolah.nama, alamat: d.sekolah.alamat },
    nomor: d.nomor,
    tanggal: d.dibayarPada,
    baris: [
      ['Telah terima dari', d.siswa.wali ? `${d.siswa.wali} (orang tua/wali)` : `Orang tua/wali ${d.siswa.nama}`],
      ['Nama siswa', `${d.siswa.nama} · Kelas ${d.siswa.kelas}${d.siswa.nis ? ' · NIS ' + d.siswa.nis : ''}`],
      ['Untuk pembayaran', d.keterangan],
      ['Cara bayar', `${d.metode} · ${jamWib(d.dibayarPada)}`],
      ['Dicatat oleh', d.petugas || '-'],
    ],
    nominal: d.nominal,
    status: lunas
      ? { teks: 'LUNAS', warna: 'ok' }
      : { teks: `SEBAGIAN — sisa ${rp(sisa)}`, warna: 'warn' },
    ttd: {
      jabatan: d.ttd?.jabatan || 'Kepala Sekolah',
      nama: d.ttd?.nama || d.sekolah.kepalaSekolah || '',
      gambar: d.ttd?.gambar,
      stempel: d.ttd?.stempel,
    },
    qrUrl: d.id && !String(d.id).startsWith('demo') ? urlVerifikasi(d.id) : null,
  }
}

export async function buatKuitansiBayar(d) {
  return kuitansiPdf(isiKuitansiBayar(d))
}

export async function unduhKuitansiBayar(d) {
  const doc = await buatKuitansiBayar(d)
  doc.save(`Kuitansi-${namaFile(d.siswa.nama)}-${d.nomor}.pdf`)
}

/* ===================== kuitansi sewa aplikasi ===================== */

const kontakPenerbit = (p) =>
  [p?.wa && `WA ${p.wa}`, p?.email].filter(Boolean).join(' · ')

export async function buatKuitansiSewa(d) {
  const p = d.penerbit || {}
  return kuitansiPdf({
    penerbit: { nama: p.namaUsaha || NAMA_APLIKASI, alamat: p.alamat, kontak: kontakPenerbit(p) },
    nomor: d.nomor,
    tanggal: d.dibuatPada,
    baris: [
      ['Telah terima dari', d.sekolah.nama],
      ['Untuk pembayaran', `Sewa ${NAMA_APLIKASI} ${d.bulan} bulan`],
      ['Rincian', `${d.jumlahSiswa} siswa × ${rp(d.tarif)} × ${d.bulan} bulan`],
      ['Masa aktif', `${tglPanjang(d.periodeMulai)} s.d. ${tglPanjang(d.sampaiBaru)}`],
    ],
    nominal: d.nominal,
    status: { teks: 'LUNAS', warna: 'ok' },
    ttd: { jabatan: p.jabatan || 'Pemilik', nama: p.namaPenandatangan || '', gambar: p.ttd, stempel: p.stempel },
    qrUrl: urlVerifikasi(d.id),
  })
}

export async function unduhKuitansiSewa(d) {
  const doc = await buatKuitansiSewa(d)
  doc.save(`Kuitansi-Sewa-${namaFile(d.sekolah.nama)}-${d.nomor}.pdf`)
}

/* ===================== invoice sewa (A4 tegak) ===================== */

/**
 * @param {object} d
 *   penerbit (data_penerbit), sekolah: { id, nama, alamat, kepalaSekolah }
 *   jumlahSiswa, tarif, bulan, periodeMulai, periodeSampai, jatuhTempo, (tanggal ISO)
 */
export function buatInvoiceSewa(d) {
  const p = d.penerbit || {}
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 210
  const M = 16
  const terbit = d.tanggalTerbit || new Date().toISOString()
  const nomor = d.nomor || `INV-${terbit.slice(2, 4)}${terbit.slice(5, 7)}-${String(d.sekolah.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`
  const total = d.jumlahSiswa * d.tarif * d.bulan

  // pita atas
  doc.setFillColor(...W.brand)
  doc.rect(0, 0, L, 5, 'F')

  // penerbit
  doc.setTextColor(...W.teks)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(p.namaUsaha || NAMA_APLIKASI, M, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...W.abu)
  const kontak = [p.alamat, kontakPenerbit(p)].filter(Boolean)
  doc.text(doc.splitTextToSize(kontak.join('\n') || ' ', 100), M, 28)

  // judul
  doc.setTextColor(...W.brand)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('INVOICE', L - M, 23, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(...W.teks)
  const info = [['Nomor', nomor], ['Tanggal', tglPanjang(terbit)], ['Jatuh tempo', tglPanjang(d.jatuhTempo)]]
  info.forEach(([a, b], i) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...W.abu)
    doc.text(a, L - M - 52, 31 + i * 5.2)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...W.teks)
    doc.text(b, L - M, 31 + i * 5.2, { align: 'right' })
  })

  // status
  doc.setFillColor(...W.dangerSoft)
  doc.roundedRect(L - M - 34, 48, 34, 7, 3.5, 3.5, 'F')
  doc.setTextColor(...W.danger)
  doc.setFontSize(8.5)
  doc.text('BELUM DIBAYAR', L - M - 17, 52.6, { align: 'center' })

  // kepada
  doc.setDrawColor(...W.garis)
  doc.line(M, 60, L - M, 60)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...W.abu)
  doc.text('DITAGIHKAN KEPADA', M, 68)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...W.teks)
  doc.text(d.sekolah.nama, M, 74)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...W.abu)
  const ke = [d.sekolah.kepalaSekolah && `u.p. ${d.sekolah.kepalaSekolah} (Kepala Sekolah)`, d.sekolah.alamat].filter(Boolean)
  doc.text(doc.splitTextToSize(ke.join('\n') || ' ', 110), M, 79.5)

  // tabel
  autoTable(doc, {
    startY: 94,
    margin: { left: M, right: M },
    head: [['Deskripsi', 'Siswa aktif', 'Tarif / siswa / bln', 'Bulan', 'Jumlah']],
    body: [[
      `Sewa ${NAMA_APLIKASI}\nPeriode ${tglPanjang(d.periodeMulai)} s.d. ${tglPanjang(d.periodeSampai)}`,
      `${d.jumlahSiswa}`, rp(d.tarif), `${d.bulan}`, rp(total),
    ]],
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3.2, textColor: W.teks, lineColor: W.garis, lineWidth: 0.2 },
    headStyles: { fillColor: W.brand, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' } },
  })
  let y = doc.lastAutoTable.finalY + 8

  // total
  doc.setFillColor(...W.brandSoft)
  doc.roundedRect(L - M - 78, y - 5, 78, 13, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...W.brandDeep)
  doc.text('TOTAL TAGIHAN', L - M - 74, y + 2.8)
  doc.setFontSize(14); doc.setTextColor(...W.teks)
  doc.text(rp(total), L - M - 4, y + 3.2, { align: 'right' })
  y += 15
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...W.abu)
  doc.text(`Terbilang: ${terbilang(total)}`, L - M, y, { align: 'right', maxWidth: 120 })

  // cara bayar
  y += 14
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...W.teks)
  doc.text('Cara pembayaran', M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  y += 6
  const rek = Array.isArray(p.rekening) ? p.rekening.filter((r) => r.nomor) : []
  if (rek.length === 0) {
    doc.setTextColor(...W.abu)
    doc.text('Hubungi kami untuk informasi rekening.', M, y)
    y += 5
  }
  rek.forEach((r) => {
    doc.setTextColor(...W.teks)
    doc.setFont('helvetica', 'bold')
    doc.text(`${r.bank}  ${r.nomor}`, M, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...W.abu)
    doc.text(`a.n. ${r.atasNama || '-'}`, M + 58, y)
    y += 5.5
  })
  doc.setTextColor(...W.abu)
  doc.text(doc.splitTextToSize(
    `Mohon transfer sesuai total tagihan, lalu kirim bukti transfer${p.wa ? ` ke WhatsApp ${p.wa}` : ''}. ` +
    'Masa aktif diperpanjang setelah pembayaran kami terima, dan kuitansi resmi bisa diunduh di menu Langganan.', 105), M, y + 2)

  // tanda tangan penerbit
  const sx = L - M - 32
  const sy = doc.lastAutoTable.finalY + 48
  doc.setTextColor(...W.teks); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Hormat kami,', sx, sy, { align: 'center' })
  gambarMuat(doc, p.stempel, sx - 30, sy + 1, 30, 30, 0.85)
  gambarMuat(doc, p.ttd, sx - 24, sy + 4, 48, 20)
  doc.setFont('helvetica', 'bold')
  const nama = p.namaPenandatangan || p.namaUsaha || NAMA_APLIKASI
  doc.text(nama, sx, sy + 30, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...W.abu)
  doc.text(p.jabatan || 'Pemilik', sx, sy + 35, { align: 'center' })

  // kaki
  doc.setFontSize(7.5); doc.setTextColor(...W.abu)
  doc.text(`Invoice ini dibuat otomatis oleh ${NAMA_APLIKASI} berdasarkan jumlah siswa aktif per ${tglPanjang(terbit)}.`, L / 2, 287, { align: 'center' })
  return { doc, nomor, total }
}

export function unduhInvoiceSewa(d) {
  const { doc, nomor } = buatInvoiceSewa(d)
  doc.save(`Invoice-${namaFile(d.sekolah.nama)}-${nomor}.pdf`)
}

/* ===================== periode tagihan berikutnya ===================== */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Sama dengan `date + interval 'N months'` di Postgres (31 Jan + 1 bln = 28/29 Feb). */
function tambahBulan(s, n) {
  const [y, m, d] = s.split('-').map(Number)
  const awal = new Date(y, m - 1 + n, 1)
  const akhir = new Date(awal.getFullYear(), awal.getMonth() + 1, 0).getDate()
  return ymd(new Date(awal.getFullYear(), awal.getMonth(), Math.min(d, akhir)))
}

/**
 * Periode tagihan sewa berikutnya — logikanya sama dengan admin_perpanjang():
 *  • masih aktif → mulai sehari setelah jatuh tempo, jatuh tempo bayar = tanggal itu
 *  • sudah lewat → mulai hari ini, jatuh tempo bayar = hari ini
 * @param {string} aktifSampai  'YYYY-MM-DD' hari terakhir masa aktif
 */
export function periodeBerikut(aktifSampai, bulan = 1, hariIni = new Date()) {
  const kini = ymd(hariIni)
  const akhir = aktifSampai ? String(aktifSampai).slice(0, 10) : null
  if (akhir && akhir >= kini) {
    const [y, m, d] = akhir.split('-').map(Number)
    return { mulai: ymd(new Date(y, m - 1, d + 1)), sampai: tambahBulan(akhir, bulan), jatuhTempo: akhir }
  }
  return { mulai: kini, sampai: tambahBulan(kini, bulan), jatuhTempo: kini }
}