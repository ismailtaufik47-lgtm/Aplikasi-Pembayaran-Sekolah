/**
 * Sheet Kenaikan Kelas — wizard 3 langkah untuk kepala sekolah:
 *
 * Langkah 1: PILIH KELAS
 *   Tampilkan semua kelas aktif + jumlah siswanya. Guru centang kelas
 *   mana yang akan diproses (bisa pilih semua atau sebagian).
 *
 * Langkah 2: ATUR PEMETAAN
 *   Tiap kelas yang dipilih → pilih aksinya:
 *   - "Naik ke …"  : pilih kelas tujuan (bisa ketik nama kelas baru)
 *   - "Luluskan"   : siswa jadi alumni, tahun_lulus = tahun ajaran saat ini
 *   Perubahan bisa diatur berbeda per kelas (mis: A1 naik ke B1, B2 lulus).
 *
 * Langkah 3: KONFIRMASI & PROSES
 *   Ringkasan rencana + tombol konfirmasi. Progress bar saat proses jalan.
 */
import { useState } from 'react'
import { Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'

/**
 * Deteksi jenjang dari nama kelas — dipakai untuk mengunci pilihan aksi
 * yang tidak masuk akal (kelas awal tidak mungkin langsung lulus, kelas
 * akhir tidak mungkin "naik" lagi). Cuma menebak dari huruf PERTAMA
 * nama kelas (A1, A2, Adzkia → jenjang 'A'; B1, B2, Bunga → jenjang
 * 'B'). Nama kelas yang tidak diawali A/B (mis. "Kelompok Bermain")
 * dibiarkan bebas pilih apapun karena tidak bisa ditebak levelnya.
 */
function jenjangKelas(nama) {
  const huruf = (nama || '').trim().charAt(0).toUpperCase()
  if (huruf === 'A') return 'awal'   // TK A — cuma boleh naik, tidak boleh lulus
  if (huruf === 'B') return 'akhir'  // TK B — cuma boleh lulus, tidak boleh naik
  return null                        // tidak bisa ditebak — bebas pilih
}

export default function SheetKenaikanKelas({ buka, tutup, onSelesai }) {
  const { siswa, pengaturan, segarkan } = useData()
  const [langkah, setLangkah] = useState(1)
  const [kelasDipilih, setKelasDipilih] = useState([])   // array nama kelas
  const [peta, setPeta] = useState({})                    // { namaKelas: { aksi: 'naik'|'lulus', tujuan: '' } }
  const [progres, setProgres] = useState(null)
  const [hasil, setHasil] = useState(null)
  const [sudahYakin, setSudahYakin] = useState(false)

  // Hitung kelas unik yang ada beserta jumlah siswanya
  const kelasRingkas = Object.entries(
    siswa.reduce((acc, s) => {
      acc[s.kelas] = (acc[s.kelas] || 0) + 1
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b, 'id'))

  const reset = () => {
    setLangkah(1); setKelasDipilih([]); setPeta({}); setProgres(null); setHasil(null); setSudahYakin(false)
  }

  const toggleKelas = (k) => {
    setKelasDipilih((lama) =>
      lama.includes(k) ? lama.filter((x) => x !== k) : [...lama, k]
    )
    // Kalau kelas ini baru dicentang dan jenjangnya bisa ditebak dari
    // namanya, langsung set aksi default-nya supaya guru tidak perlu
    // pilih manual untuk kasus yang sudah jelas.
    const j = jenjangKelas(k)
    if (j === 'akhir') setAksi(k, 'lulus')
    else if (j === 'awal') setAksi(k, 'naik')
  }

  const setAksi = (kelas, aksi) =>
    setPeta((lama) => ({ ...lama, [kelas]: { ...lama[kelas], aksi, tujuan: aksi === 'lulus' ? '' : (lama[kelas]?.tujuan || '') } }))

  const setTujuan = (kelas, tujuan) =>
    setPeta((lama) => ({ ...lama, [kelas]: { ...lama[kelas], tujuan } }))

  const bolehLanjutKe2 = kelasDipilih.length > 0

  const bolehKonfirmasi = kelasDipilih.every((k) => {
    const p = peta[k]
    if (!p?.aksi) return false
    if (p.aksi === 'naik' && !p.tujuan?.trim()) return false
    return true
  })

  // Hitung rencana yang akan dijalankan
  const rencana = kelasDipilih.map((k) => {
    const siswaDiKelas = siswa.filter((s) => s.kelas === k)
    const p = peta[k] || {}
    return { kelas: k, aksi: p.aksi, tujuan: p.tujuan, siswaIds: siswaDiKelas.map((s) => s.id), jumlah: siswaDiKelas.length }
  })

  const jalankan = async () => {
    setLangkah(4)
    let totalBerhasil = 0, totalGagal = 0

    for (const r of rencana) {
      setProgres({ kelas: r.kelas, aksi: r.aksi, tujuan: r.tujuan })
      try {
        if (r.aksi === 'lulus') {
          const hasil = await api.luluskanMassal(r.siswaIds, pengaturan.tahunAjaran)
          totalBerhasil += hasil.berhasil
          totalGagal += hasil.gagal
        } else {
          const petaKelas = r.siswaIds.map((id) => ({ siswaId: id, kelasBaru: r.tujuan }))
          const hasil = await api.naikkanKelasMassal(petaKelas)
          totalBerhasil += hasil.berhasil
          totalGagal += hasil.gagal
        }
      } catch {
        totalGagal += r.jumlah
      }
    }

    setHasil({ berhasil: totalBerhasil, gagal: totalGagal })
    setProgres(null)
    setLangkah(5)
    if (totalBerhasil > 0) segarkan()
  }

  const tutupDanReset = () => { reset(); tutup() }

  return (
    <Sheet buka={buka} tutup={tutupDanReset} judul="Kenaikan Kelas" lead="Proses naik kelas dan kelulusan akhir tahun">

      {/* ── LANGKAH 1: PILIH KELAS ─────────────────────────── */}
      {langkah === 1 && (
        <>
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
            Pilih kelas yang akan diproses. Di langkah berikutnya Anda bisa atur
            apakah tiap kelas naik ke kelas lain atau lulus.
          </p>

          <div className="mb-4 space-y-2">
            {kelasRingkas.length === 0 ? (
              <p className="text-center text-[13px] text-muted">Belum ada siswa aktif.</p>
            ) : (
              kelasRingkas.map(([k, n]) => {
                const terpilih = kelasDipilih.includes(k)
                return (
                  <button
                    key={k}
                    onClick={() => toggleKelas(k)}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
                      terpilih ? 'border-brand bg-brand-soft' : 'border-line bg-white'
                    }`}
                  >
                    <span className={`text-[14.5px] font-bold ${terpilih ? 'text-brand' : 'text-ink'}`}>
                      Kelas {k}
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className="text-[13px] text-muted">{n} siswa</span>
                      <span className={`grid h-5 w-5 place-items-center rounded-full border-2 text-[11px] font-bold ${
                        terpilih ? 'border-brand bg-brand text-white' : 'border-[#D1D9EC] text-transparent'
                      }`}>✓</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <div className="mb-3 flex gap-2.5">
            <button
              className="flex-1 rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted"
              onClick={() => {
                const semuaTerpilih = kelasDipilih.length === kelasRingkas.length
                const daftarBaru = semuaTerpilih ? [] : kelasRingkas.map(([k]) => k)
                setKelasDipilih(daftarBaru)
                if (!semuaTerpilih) {
                  daftarBaru.forEach((k) => {
                    const j = jenjangKelas(k)
                    if (j === 'akhir') setAksi(k, 'lulus')
                    else if (j === 'awal') setAksi(k, 'naik')
                  })
                }
              }}
            >
              {kelasDipilih.length === kelasRingkas.length ? 'Batal pilih semua' : 'Pilih semua kelas'}
            </button>
          </div>

          <button
            className="bigbtn disabled:opacity-60"
            onClick={() => setLangkah(2)}
            disabled={!bolehLanjutKe2}
          >
            Lanjut — atur aksi tiap kelas
          </button>
        </>
      )}

      {/* ── LANGKAH 2: ATUR PEMETAAN ───────────────────────── */}
      {langkah === 2 && (
        <>
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
            Tentukan aksi untuk tiap kelas. Siswa bisa naik ke kelas lain
            (ketik nama kelas tujuan) atau dinyatakan lulus menjadi alumni.
            Kelas yang namanya diawali <b className="text-ink">A</b> otomatis
            dikunci ke "Naik kelas", dan yang diawali <b className="text-ink">B</b> otomatis
            dikunci ke "Lulus" — kelas dengan nama lain (mis. "Kelompok Bermain") bebas dipilih.
          </p>

          <div className="mb-4 space-y-4">
            {kelasDipilih.map((k) => {
              const n = kelasRingkas.find(([kk]) => kk === k)?.[1] || 0
              const p = peta[k] || {}
              const j = jenjangKelas(k)
              const naikDikunci = j === 'akhir'  // kelas B: tidak bisa "naik" lagi
              const lulusDikunci = j === 'awal'  // kelas A: belum bisa lulus
              return (
                <div key={k} className="rounded-2xl border border-line bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-extrabold text-ink">Kelas {k}</span>
                    <span className="text-[12px] text-muted">{n} siswa</span>
                  </div>

                  <div className="mb-3 flex gap-2">
                    <button
                      onClick={() => !naikDikunci && setAksi(k, 'naik')}
                      disabled={naikDikunci}
                      title={naikDikunci ? 'Kelas ini terdeteksi jenjang akhir — tidak bisa naik lagi, cuma bisa lulus' : ''}
                      className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold border-2 transition ${
                        naikDikunci
                          ? 'cursor-not-allowed border-line bg-[#F4F5F9] text-[#B7BECC]'
                          : p.aksi === 'naik' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'
                      }`}
                    >
                      📈 Naik kelas
                    </button>
                    <button
                      onClick={() => !lulusDikunci && setAksi(k, 'lulus')}
                      disabled={lulusDikunci}
                      title={lulusDikunci ? 'Kelas ini terdeteksi jenjang awal — belum bisa lulus, cuma bisa naik' : ''}
                      className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold border-2 transition ${
                        lulusDikunci
                          ? 'cursor-not-allowed border-line bg-[#F4F5F9] text-[#B7BECC]'
                          : p.aksi === 'lulus' ? 'border-ok bg-ok-soft text-ok-deep' : 'border-line text-muted'
                      }`}
                    >
                      🎓 Lulus
                    </button>
                  </div>

                  {p.aksi === 'naik' && (
                    <div>
                      <label className="mb-1 block text-[12px] font-bold text-muted">Kelas tujuan</label>
                      <input
                        value={p.tujuan || ''}
                        onChange={(e) => setTujuan(k, e.target.value)}
                        placeholder="Contoh: B1, Kelompok Bermain 2…"
                        className="field-input text-[14px]"
                      />
                    </div>
                  )}

                  {p.aksi === 'lulus' && (
                    <p className="rounded-xl bg-ok-soft px-3 py-2 text-[12px] text-ok-deep">
                      ✓ {n} siswa akan dijadikan alumni (tahun lulus: {pengaturan.tahunAjaran})
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <button className="bigbtn mb-2.5 disabled:opacity-60" onClick={() => setLangkah(3)} disabled={!bolehKonfirmasi}>
            Lanjut ke konfirmasi
          </button>
          <button className="bigbtn-ghost" onClick={() => setLangkah(1)}>Kembali</button>
        </>
      )}

      {/* ── LANGKAH 3: KONFIRMASI ──────────────────────────── */}
      {langkah === 3 && (
        <>
          <p className="mb-4 text-[12.5px] font-semibold text-muted">
            Periksa rencana di bawah sebelum dikonfirmasi. Proses ini <b className="text-ink">tidak bisa dibatalkan massal</b> — perubahan individual masih bisa dikoreksi lewat Edit Siswa.
          </p>

          <div className="mb-5 divide-y divide-line rounded-2xl border border-line overflow-hidden">
            {rencana.map((r) => (
              <div key={r.kelas} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{r.aksi === 'lulus' ? '🎓' : '📈'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">
                    {r.aksi === 'lulus'
                      ? `Kelas ${r.kelas} → Lulus (alumni)`
                      : `Kelas ${r.kelas} → Kelas ${r.tujuan}`}
                  </p>
                  <p className="text-[12px] text-muted">{r.jumlah} siswa</p>
                </div>
                <span className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${r.aksi === 'lulus' ? 'bg-ok-soft text-ok-deep' : 'bg-brand-soft text-brand'}`}>
                  {r.aksi === 'lulus' ? 'Luluskan' : 'Naik'}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-4 rounded-xl bg-warn-soft px-3.5 py-3 text-[12.5px] font-semibold leading-relaxed text-warn-deep">
            ⚠️ Total <b>{rencana.reduce((t, r) => t + r.jumlah, 0)} siswa</b> akan diproses.
            Data pembayaran dan riwayat transaksi tetap tersimpan utuh.
          </div>

          <label className="mb-4 flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-3">
            <input type="checkbox" checked={sudahYakin} onChange={(e) => setSudahYakin(e.target.checked)} className="h-4 w-4" />
            <span className="text-[12.5px] font-semibold text-ink">Saya sudah yakin dan siap memproses perubahan ini</span>
          </label>

          <button className="bigbtn mb-2.5 disabled:opacity-50" onClick={jalankan} disabled={!sudahYakin}>
            Ya, proses sekarang
          </button>
          <button className="bigbtn-ghost" onClick={() => setLangkah(2)}>Kembali edit</button>
        </>
      )}

      {/* ── LANGKAH 4: PROSES ──────────────────────────────── */}
      {langkah === 4 && progres && (
        <div className="py-8 text-center">
          <div className="mb-3 text-3xl">⏳</div>
          <p className="mb-1.5 text-[15px] font-extrabold">Sedang memproses…</p>
          <p className="text-[13px] text-muted">
            {progres.aksi === 'lulus'
              ? `Meluluskan kelas ${progres.kelas}…`
              : `Memindahkan kelas ${progres.kelas} → ${progres.tujuan}…`}
          </p>
        </div>
      )}

      {/* ── LANGKAH 5: SELESAI ─────────────────────────────── */}
      {langkah === 5 && hasil && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-2xl">✅</div>
          <p className="mb-1 text-[15px] font-extrabold">Kenaikan kelas selesai!</p>
          <p className="mb-5 text-[13px] text-muted">
            <b className="text-ok">{hasil.berhasil} siswa</b> berhasil diproses
            {hasil.gagal > 0 && <>, <b className="text-danger">{hasil.gagal} gagal</b></>}
          </p>
          <button className="bigbtn" onClick={tutupDanReset}>Tutup</button>
        </div>
      )}
    </Sheet>
  )
}