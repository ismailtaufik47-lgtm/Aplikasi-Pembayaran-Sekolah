/**
 * SheetImportSiswa — upload file Excel (.xlsx/.xls) atau CSV, baca
 * dengan ExcelJS (sudah dipakai project ini untuk export, jadi tidak
 * perlu tambah library baru), tampilkan preview sebelum dimasukkan,
 * validasi (nama + kelas wajib), lalu import satu-satu dengan progress.
 *
 * Kolom yang dikenali (case-insensitive, urutan bebas):
 *   Nama*, Kelas*, NIS, Nama Panggilan, L/P, Nama Wali, HP Orang Tua,
 *   Guru Kelas, Alamat
 * (* = wajib)
 *
 * Template Excel bisa diunduh langsung dari sheet ini.
 */
import { useRef, useState } from 'react'
import { Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'

const PETA_KOLOM = {
  nama:          ['nama', 'nama siswa', 'name', 'student name'],
  kelas:         ['kelas', 'class', 'ruang'],
  nis:           ['nis', 'nomor induk', 'no induk', 'nomor induk siswa'],
  panggilan:     ['panggilan', 'nama panggilan', 'nickname'],
  jenis_kelamin: ['l/p', 'jenis kelamin', 'gender', 'kelamin', 'lp'],
  wali:          ['wali', 'nama wali', 'orang tua', 'nama orang tua', 'ayah/ibu'],
  hp:            ['hp', 'no hp', 'nomor hp', 'telepon', 'no telepon', 'hp orang tua', 'kontak'],
  guru:          ['guru', 'guru kelas', 'wali kelas'],
  alamat:        ['alamat', 'address', 'domisili', 'alamat rumah'],
}

function petakanHeader(headers) {
  const map = {}
  headers.forEach((h, i) => {
    const k = (h || '').toString().toLowerCase().trim()
    for (const [kolom, alias] of Object.entries(PETA_KOLOM)) {
      if (alias.includes(k)) map[kolom] = i
    }
  })
  return map
}

function normalisasiJenis(val) {
  const v = (val || '').toString().toLowerCase().trim()
  if (v === 'l' || v === 'laki' || v === 'laki-laki' || v === 'male') return 'L'
  return 'P'
}

export default function SheetImportSiswa({ buka, tutup }) {
  const { tambahSiswa, toast, pengaturan, siswa: daftarSiswa } = useData()
  const [tahap, setTahap] = useState('upload') // upload | preview | proses | selesai
  const [baris, setBaris] = useState([])
  const [galat, setGalat] = useState([])
  const [progres, setProgres] = useState({ selesai: 0, total: 0 })
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const reset = () => {
    setTahap('upload'); setBaris([]); setGalat([]); setProgres({ selesai: 0, total: 0 }); setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const bacaFile = async (file) => {
    setError('')
    try {
      // Pakai ExcelJS yang sudah ada di project (bukan xlsx/SheetJS terpisah)
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const buf = await file.arrayBuffer()

      // ExcelJS tidak support CSV secara langsung — konversi CSV ke format yang bisa dibaca
      const namaFile = file.name.toLowerCase()
      if (namaFile.endsWith('.csv')) {
        // Baca CSV sebagai teks biasa lalu parse manual
        const teks = new TextDecoder('utf-8').decode(buf)
        const barisTeks = teks.split('\n').map(b => b.trim()).filter(Boolean)
        if (barisTeks.length < 2) return setError('File CSV kosong atau tidak ada data siswa.')
        const barisData = barisTeks.map(b =>
          b.split(',').map(sel => sel.trim().replace(/^"|"$/g, ''))
        )
        prosesData(barisData)
        return
      }

      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      if (!ws) return setError('File Excel tidak punya sheet.')

      const barisData = []
      ws.eachRow((row) => {
        barisData.push(row.values.slice(1).map(v => v ?? ''))
      })
      prosesData(barisData)
    } catch (e) {
      setError('Gagal membaca file: ' + e.message)
    }
  }

  const prosesData = (raw) => {
      if (raw.length < 2) return setError('File kosong atau tidak ada data siswa.')

      const headers = raw[0]
      const map = petakanHeader(headers)

      if (map.nama === undefined) return setError('Kolom "Nama" tidak ditemukan. Pastikan baris pertama adalah header.')
      if (map.kelas === undefined) return setError('Kolom "Kelas" tidak ditemukan. Pastikan ada kolom Kelas.')

      // Kumpulkan semua NIS yang sudah ada di database (case-insensitive)
      const nisAdaSet = new Set((daftarSiswa || []).map(s => (s.nis || '').toLowerCase().trim()))
      // Kumpulkan NIS dalam file ini sendiri untuk deteksi duplikat antar baris
      const nisDalamFile = new Map() // nis -> nomor baris pertama kemunculan

      const hasilBaris = []
      const hasilGalat = []

      raw.slice(1).forEach((row, i) => {
        const nama  = (row[map.nama] || '').toString().trim()
        const kelas = (row[map.kelas] || '').toString().trim()
        if (!nama && !kelas) return
        const nisAsli = (map.nis !== undefined ? row[map.nis] : '').toString().trim()
        const galat = []
        if (!nama)  galat.push('Nama kosong')
        if (!kelas) galat.push('Kelas kosong')
        // Cek NIS duplikat dengan yang sudah ada di database
        if (nisAsli && nisAdaSet.has(nisAsli.toLowerCase())) {
          galat.push(`NIS "${nisAsli}" sudah terdaftar`)
        }
        // Cek NIS duplikat dengan baris lain di file yang sama
        if (nisAsli) {
          if (nisDalamFile.has(nisAsli.toLowerCase())) {
            galat.push(`NIS "${nisAsli}" muncul lebih dari sekali dalam file ini (baris ${nisDalamFile.get(nisAsli.toLowerCase())})`)
          } else {
            nisDalamFile.set(nisAsli.toLowerCase(), i + 2)
          }
        }
        hasilBaris.push({
          baris: i + 2,
          nama,
          kelas,
          nis:           nisAsli,
          panggilan:     (map.panggilan !== undefined    ? row[map.panggilan]     : '').toString().trim(),
          jenis_kelamin: normalisasiJenis(map.jenis_kelamin !== undefined ? row[map.jenis_kelamin] : ''),
          wali:          (map.wali !== undefined         ? row[map.wali]          : '').toString().trim(),
          hp:            (map.hp !== undefined           ? row[map.hp]            : '').toString().trim(),
          guru:          (map.guru !== undefined         ? row[map.guru]          : '').toString().trim(),
          alamat:        (map.alamat !== undefined       ? row[map.alamat]        : '').toString().trim(),
          _galat: galat,
        })
        if (galat.length) hasilGalat.push(i + 2)
      })

      if (!hasilBaris.length) return setError('Tidak ada data siswa yang terbaca.')
      setBaris(hasilBaris)
      setGalat(hasilGalat)
      setTahap('preview')
    }

  const mulaiImport = async () => {
    const valid = baris.filter((b) => !b._galat.length)
    if (!valid.length) return
    setTahap('proses')
    setProgres({ selesai: 0, total: valid.length })
    let berhasil = 0
    const gagalDetail = []

    for (let i = 0; i < valid.length; i++) {
      const b = valid[i]
      try {
        // NIS wajib ada — kalau kosong di file, buat dari indeks supaya
        // unik antar baris (jangan pakai Date.now() karena bisa sama
        // di baris-baris yang diproses dalam millisecond yang sama)
        const nisAman = b.nis || `IMP-${Date.now()}-${i}`
        await tambahSiswa({
          nama: b.nama,
          kelas: b.kelas,
          nis: nisAman,
          panggilan: b.panggilan || null,
          jenis_kelamin: b.jenis_kelamin,
          wali: b.wali || null,
          hp: b.hp || null,
          guru: b.guru || null,
          alamat: b.alamat || null,
          avatar: 0,
        })
        berhasil++
      } catch (e) {
        const pesan = e.message || ''
        if (/NIS ini sudah dipakai/i.test(pesan)) {
          gagalDetail.push(`Baris ${b.baris}: NIS "${b.nis}" sudah terdaftar`)
        } else {
          gagalDetail.push(`Baris ${b.baris}: ${pesan}`)
        }
      }
      setProgres((p) => ({ ...p, selesai: p.selesai + 1 }))
    }
    setProgres({ selesai: valid.length, total: valid.length, berhasil, gagal: gagalDetail.length, gagalDetail })
    setTahap('selesai')
    if (berhasil > 0) toast(`${berhasil} siswa berhasil diimport`)
  }

  const unduhTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const { saveAs } = await import('file-saver')

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Data Siswa')
    ws.columns = [
      { header: 'Nama', key: 'nama', width: 22 },
      { header: 'Kelas', key: 'kelas', width: 8 },
      { header: 'NIS', key: 'nis', width: 12 },
      { header: 'Nama Panggilan', key: 'panggilan', width: 15 },
      { header: 'L/P', key: 'lp', width: 6 },
      { header: 'Nama Wali', key: 'wali', width: 16 },
      { header: 'HP Orang Tua', key: 'hp', width: 15 },
      { header: 'Guru Kelas', key: 'guru', width: 13 },
      { header: 'Alamat', key: 'alamat', width: 26 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.addRow({ nama: 'Aisyah Nur Fadilah', kelas: 'A', nis: '2026-001', panggilan: 'Aisyah', lp: 'P', wali: 'Ibu Sari', hp: '08123456789', guru: 'Bu Rina', alamat: 'Jl. Melati No. 5' })
    ws.addRow({ nama: 'Budi Santoso', kelas: 'A', nis: '2026-002', panggilan: 'Budi', lp: 'L', wali: 'Pak Joko', hp: '08234567890', guru: 'Bu Rina', alamat: '' })

    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'Template-Import-Siswa.xlsx')
  }

  return (
    <Sheet buka={buka} tutup={() => { reset(); tutup() }} judul="Import data siswa" lead="Upload file Excel atau CSV — preview dulu sebelum dimasukkan">

      {/* ── Upload ──────────────────────────────────────── */}
      {tahap === 'upload' && (
        <>
          <div
            className="mb-4 cursor-pointer rounded-2xl border-2 border-dashed border-brand-soft bg-brand-soft/40 px-4 py-8 text-center"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) bacaFile(f) }}
          >
            <div className="mb-2 text-3xl">📂</div>
            <p className="text-[14px] font-bold text-brand">Klik untuk pilih file</p>
            <p className="text-[12px] text-muted">atau drag & drop di sini</p>
            <p className="mt-1.5 text-[11.5px] text-muted">Format: .xlsx, .xls, .csv</p>
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files[0]; if (f) bacaFile(f) }}
            />
          </div>

          {error && <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</p>}

          <button onClick={unduhTemplate} className="bigbtn-ghost text-[13px]">
            ⬇ Unduh template Excel
          </button>

          <div className="mt-4 rounded-xl bg-[#F8F9FC] px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <b className="text-ink">Kolom yang dikenali:</b> Nama (wajib), Kelas (wajib), NIS, Nama Panggilan, L/P, Nama Wali, HP Orang Tua, Guru Kelas, Alamat.
            Urutan kolom bebas — sistem mengenali otomatis dari nama header di baris pertama.
          </div>
        </>
      )}

      {/* ── Preview ─────────────────────────────────────── */}
      {tahap === 'preview' && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-pill bg-ok-soft px-3 py-1 text-[12px] font-bold text-ok">{baris.filter(b => !b._galat.length).length} siap import</span>
            {galat.length > 0 && <span className="rounded-pill bg-danger-soft px-3 py-1 text-[12px] font-bold text-danger">{galat.length} baris bermasalah</span>}
          </div>

          <div className="mb-4 max-h-[40vh] overflow-y-auto rounded-2xl border border-line">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#F1F4F9]">
                <tr>
                  {['Nama', 'Kelas', 'NIS', 'L/P', 'Status'].map((h) => (
                    <th key={h} className="px-2.5 py-2 text-left font-bold text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baris.map((b, i) => (
                  <tr key={i} className={`border-t border-line ${b._galat.length ? 'bg-danger-soft/40' : ''}`}>
                    <td className="px-2.5 py-2 font-medium">{b.nama || <span className="text-danger">kosong</span>}</td>
                    <td className="px-2.5 py-2">{b.kelas || <span className="text-danger">kosong</span>}</td>
                    <td className="px-2.5 py-2 text-muted">{b.nis || '—'}</td>
                    <td className="px-2.5 py-2">{b.jenis_kelamin}</td>
                    <td className="px-2.5 py-2">
                      {b._galat.length
                        ? <span className="text-danger font-bold">⚠ {b._galat.join(', ')}</span>
                        : <span className="text-ok font-bold">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {galat.length > 0 && (
            <p className="mb-3 text-[12px] text-muted">
              Baris bermasalah <b className="text-danger">tidak akan diimport</b> — perbaiki di file Excel lalu upload ulang, atau lanjutkan sekarang untuk import yang valid saja.
            </p>
          )}

          <button className="bigbtn mb-2.5 disabled:opacity-60" onClick={mulaiImport} disabled={baris.filter(b => !b._galat.length).length === 0}>
            Import {baris.filter(b => !b._galat.length).length} siswa sekarang
          </button>
          <button className="bigbtn-ghost" onClick={reset}>Upload file lain</button>
        </>
      )}

      {/* ── Proses ──────────────────────────────────────── */}
      {tahap === 'proses' && (
        <div className="py-6 text-center">
          <p className="mb-3 text-[14px] font-bold">Mengimport data…</p>
          <div className="mx-auto mb-2 h-2.5 w-full max-w-[280px] overflow-hidden rounded-full bg-[#E3E8F5]">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${(progres.selesai / progres.total) * 100}%` }}
            />
          </div>
          <p className="text-[12px] text-muted">{progres.selesai} dari {progres.total} siswa</p>
        </div>
      )}

      {/* ── Selesai ─────────────────────────────────────── */}
      {tahap === 'selesai' && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-2xl">✅</div>
          <p className="mb-1 text-[15px] font-extrabold">Import selesai</p>
          <p className="mb-3 text-[13px] text-muted">
            <b className="text-ok">{progres.berhasil} siswa</b> berhasil ditambahkan
            {progres.gagal > 0 && <>, <b className="text-danger">{progres.gagal} gagal</b></>}
          </p>
          {progres.gagalDetail?.length > 0 && (
            <div className="mb-4 rounded-2xl bg-danger-soft p-3 text-left">
              <p className="mb-1.5 text-[12px] font-bold text-danger">Detail kegagalan:</p>
              {progres.gagalDetail.map((d, i) => (
                <p key={i} className="text-[11.5px] text-danger">{d}</p>
              ))}
              {progres.gagalDetail.some(d => d.includes('NIS') && d.includes('sudah terdaftar')) && (
                <p className="mt-2 text-[11.5px] font-semibold text-danger">
                  💡 Tip: Ganti NIS yang bentrok di file Excel lalu upload ulang.
                </p>
              )}
            </div>
          )}
          <button className="bigbtn" onClick={() => { reset(); tutup() }}>Tutup</button>
          {progres.gagal > 0 && (
            <button className="bigbtn-ghost mt-2.5" onClick={reset}>Coba lagi dengan file baru</button>
          )}
        </div>
      )}
    </Sheet>
  )
}