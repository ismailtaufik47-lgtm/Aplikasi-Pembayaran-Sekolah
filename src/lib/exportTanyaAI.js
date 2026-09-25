/**
 * Unduh Excel dari satu jawaban Tanya AI.
 *
 * Yang diekspor BUKAN teks jawaban AI, tapi data mentah hasil fungsi
 * database (tools) yang dipakai untuk menjawab — jadi isinya lengkap
 * (tidak terpotong 15 baris seperti di layar) dan angkanya pasti sama
 * dengan database. Satu tool = satu sheet.
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { rp, tanggalISO, tanggalPanjang } from './format.js'
import { WARNA, isiSel, judulLembar, baposHeader, PAGE_SETUP_LANDSCAPE } from './exportHelpers.js'

const RUPIAH = '"Rp"#,##0'

const LABEL_STATUS = {
  lunas: 'Lunas', sebagian: 'Sebagian', nunggak: 'Nunggak',
  'belum-bayar': 'Belum bayar', menunggu: 'Belum jatuh tempo', belum: 'Belum bayar',
}

/** Tulis tabel mulai baris `r`; kolom bertanda rp:true diformat rupiah. */
function tabel(ws, r, kolom, baris) {
  baposHeader(ws, r, kolom.map((k) => k.label))
  baris.forEach((isi, i) => {
    const row = ws.getRow(r + 1 + i)
    kolom.forEach((k, j) => {
      const c = row.getCell(j + 1)
      c.value = isi[j] ?? ''
      if (k.rp) c.numFmt = RUPIAH
      c.alignment = { vertical: 'top', wrapText: !!k.wrap }
      if (i % 2) c.fill = isiSel('FFF7F8FC')
    })
  })
  kolom.forEach((k, j) => { ws.getColumn(j + 1).width = Math.max(ws.getColumn(j + 1).width || 0, k.lebar || 14) })
  return r + 1 + baris.length
}

function barisTotal(ws, r, label, nilai, kol) {
  ws.getCell(r, 1).value = label
  ws.getCell(r, 1).font = { bold: true }
  const c = ws.getCell(r, kol)
  c.value = nilai
  c.numFmt = RUPIAH
  c.font = { bold: true, color: { argb: WARNA.brandDeep } }
}

/** Sheet baru; nama dibuat unik (Excel menolak nama sheet kembar, maks 31 huruf). */
const sheet = (wb, nama) => {
  const dasar = nama.replace(/[\\/?*[\]:]/g, ' ').slice(0, 27)
  let unik = dasar
  for (let n = 2; wb.getWorksheet(unik); n++) unik = `${dasar} (${n})`
  const ws = wb.addWorksheet(unik, { views: [{ showGridLines: false }] })
  ws.pageSetup = PAGE_SETUP_LANDSCAPE
  return ws
}

/* ---------------- per tool ---------------- */

function lembarTunggakan(wb, h, sekolah) {
  const ws = sheet(wb, 'Tunggakan')
  const perBulan = h.siswa.some((s) => s.status_bulan_diminta)
  const kegiatan = h.siswa.some((s) => s.kegiatan_belum_lunas)
  const kolom = [
    { label: 'No', lebar: 5 },
    { label: 'Nama siswa', lebar: 26 },
    { label: 'Kelas', lebar: 10 },
    { label: 'Wali', lebar: 20 },
    ...(perBulan ? [{ label: 'Status bulan itu', lebar: 16 }, { label: 'Kurang bulan itu', lebar: 16, rp: true }] : []),
    { label: 'Jml bulan nunggak', lebar: 11 },
    { label: 'Rincian bulan nunggak', lebar: 36, wrap: true },
    { label: 'Perlu dibayar (SPP)', lebar: 18, rp: true },
    ...(kegiatan ? [{ label: 'Kegiatan belum lunas', lebar: 36, wrap: true }] : []),
  ]
  judulLembar(ws, kolom.length, `${h.mode[0].toUpperCase()}${h.mode.slice(1)} — ${sekolah}`,
    `Kelas: ${Array.isArray(h.kelas) ? h.kelas.join(', ') : h.kelas} · ${h.jumlah_siswa} siswa · posisi ${tanggalPanjang()}`)
  const baris = h.siswa.map((s, i) => [
    i + 1, s.nama, s.kelas, s.wali || '',
    ...(perBulan ? [LABEL_STATUS[s.status_bulan_diminta] || s.status_bulan_diminta, s.kurang_bulan_diminta] : []),
    s.jumlah_bulan_nunggak,
    (s.bulan_nunggak || []).map((b) => (b.dibayar > 0 ? `${b.bulan} (kurang ${rp(b.kurang)})` : b.bulan)).join(', ')
      + (s.bulan_berjalan_lewat_jatuh_tempo_belum_lunas ? (s.bulan_nunggak?.length ? ' + bulan ini' : 'Bulan ini') : ''),
    s.perlu_dibayar_sekarang_spp,
    ...(kegiatan ? [(s.kegiatan_belum_lunas || []).map((k) => `${k.kegiatan} ${rp(k.kurang)}`).join(', ')] : []),
  ])
  const r = tabel(ws, 4, kolom, baris)
  barisTotal(ws, r + 1, 'Total kekurangan SPP', h.total_kurang_spp_rupiah, kolom.findIndex((k) => k.label === 'Perlu dibayar (SPP)') + 1)
  if (h.total_kurang_kegiatan_rupiah != null) barisTotal(ws, r + 2, 'Total kekurangan kegiatan', h.total_kurang_kegiatan_rupiah, kolom.length)
}

function lembarTransaksi(wb, h, sekolah) {
  const ws = sheet(wb, 'Transaksi')
  const kolom = [
    { label: 'Waktu', lebar: 17 }, { label: 'Siswa', lebar: 26 }, { label: 'Kelas', lebar: 10 },
    { label: 'Untuk', lebar: 24 }, { label: 'Nominal', lebar: 15, rp: true }, { label: 'Metode', lebar: 11 },
    { label: 'Petugas', lebar: 16 },
  ]
  judulLembar(ws, kolom.length, `Transaksi pembayaran — ${sekolah}`,
    h.dari === h.sampai ? `Tanggal ${h.dari}` : `${h.dari} s.d. ${h.sampai}`)
  const r = tabel(ws, 4, kolom, h.transaksi.map((t) => [t.waktu, t.siswa, t.kelas, t.untuk || t.jenis, t.nominal, t.metode, t.petugas || '']))
  barisTotal(ws, r + 1, `Total (${h.jumlah_transaksi} transaksi)`, h.total, 5)
  barisTotal(ws, r + 2, 'Tunai', h.tunai, 5)
  barisTotal(ws, r + 3, 'Transfer', h.transfer, 5)
}

function lembarKelas(wb, h, sekolah) {
  const ws = sheet(wb, 'Perbandingan kelas')
  const kolom = [
    { label: 'Kelas', lebar: 14 }, { label: 'Jumlah siswa', lebar: 12 }, { label: 'Perlu ditagih', lebar: 12 },
    { label: 'Total bulan nunggak', lebar: 13 }, { label: 'Kurang SPP', lebar: 16, rp: true },
    { label: 'Kurang kegiatan', lebar: 16, rp: true }, { label: `Lunas SPP ${h.bulan_berjalan}`, lebar: 14 },
    { label: 'SPP terkumpul', lebar: 16, rp: true },
  ]
  judulLembar(ws, kolom.length, `Perbandingan kelas — ${sekolah}`, `Posisi ${tanggalPanjang()}`)
  tabel(ws, 4, kolom, h.kelas.map((k) => [
    k.kelas, k.jumlah_siswa, k.siswa_perlu_ditagih, k.total_bulan_nunggak, k.kurang_spp_rupiah,
    k.kurang_kegiatan_rupiah, k.lunas_spp_bulan_berjalan, k.spp_terkumpul_tahun_ajaran,
  ]))
}

function lembarSiswa(wb, h, sekolah) {
  h.siswa.forEach((s, n) => {
    const ws = sheet(wb, `Status ${n + 1} ${s.panggilan || s.nama}`)
    judulLembar(ws, 4, `${s.nama} — ${s.kelas}`, `${sekolah} · wali ${s.wali || '-'} · posisi ${tanggalPanjang()}`)
    let r = tabel(ws, 4, [
      { label: 'Bulan SPP', lebar: 22 }, { label: 'Status', lebar: 18 }, { label: 'Dibayar', lebar: 16, rp: true },
    ], s.spp_per_bulan.map((b) => [b.bulan, LABEL_STATUS[b.status] || b.status, b.dibayar]))
    if (s.kegiatan?.length) {
      r = tabel(ws, r + 1, [
        { label: 'Kegiatan', lebar: 22 }, { label: 'Status', lebar: 18 }, { label: 'Dibayar', lebar: 16, rp: true }, { label: 'Nominal', lebar: 22, rp: true },
      ], s.kegiatan.map((k) => [k.kegiatan, LABEL_STATUS[k.status] || k.status, k.dibayar, k.nominal]))
    }
    barisTotal(ws, r + 1, 'Perlu dibayar sekarang (SPP)', s.ringkasan?.perlu_dibayar_sekarang_spp || 0, 3)
  })
}

function lembarRekap(wb, h, sekolah) {
  const ws = sheet(wb, `Rekap ${h.bulan}`)
  judulLembar(ws, 2, `Rekap ${h.bulan} — ${sekolah}`, `Jatuh tempo SPP ${h.jatuh_tempo_spp} · ${h.keadaan_bulan}`)
  const s = h.spp_bulan_ini
  const m = h.uang_masuk_selama_bulan_ini
  tabel(ws, 4, [{ label: 'Keterangan', lebar: 38 }, { label: 'Nilai', lebar: 18 }], [
    ['Siswa aktif', h.jumlah_siswa_aktif],
    ['SPP lunas (siswa)', s.lunas],
    ['SPP bayar sebagian (siswa)', s.bayar_sebagian],
    ['SPP belum bayar sama sekali (siswa)', s.belum_bayar_sama_sekali],
    ['SPP belum jatuh tempo (siswa)', s.belum_jatuh_tempo],
    ['Target SPP', rp(s.target_rupiah)],
    ['SPP sudah masuk', rp(s.sudah_masuk_rupiah)],
    ['Kekurangan SPP', rp(s.kekurangan_rupiah)],
    ['Uang masuk selama bulan ini (semua)', rp(m.total)],
    ['  – dari SPP', rp(m.spp)],
    ['  – dari kegiatan', rp(m.kegiatan)],
    ['  – tunai', rp(m.tunai)],
    ['  – transfer', rp(m.transfer)],
    ['Jumlah transaksi', m.jumlah_transaksi],
  ])
}

const PEMBUAT = {
  daftar_tunggakan: lembarTunggakan,
  transaksi: lembarTransaksi,
  perbandingan_kelas: lembarKelas,
  status_siswa: lembarSiswa,
  rekap_bulan: lembarRekap,
}

export async function unduhExcelTanyaAI(data, sekolah) {
  const wb = new ExcelJS.Workbook()
  wb.creator = sekolah
  wb.created = new Date()
  data.forEach((d) => {
    if (!PEMBUAT[d.alat] || d.hasil?.galat) return
    PEMBUAT[d.alat](wb, d.hasil, sekolah)
  })
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `TanyaAI-${sekolah.replace(/[^a-z0-9]+/gi, '-')}-${tanggalISO()}.xlsx`)
}