/**
 * Sheet Kenaikan Kelas (0042) — tahun ajaran X → X+1, untuk kepala sekolah / TU.
 *
 * Langkah 1  PER KELAS   : tiap kelas naik ke kelas apa, atau lulus.
 * Langkah 2  PER SISWA   : bisa diubah satu-satu — tinggal kelas (mis. 2 tahun di TK A),
 *                          lulus, tidak melanjutkan, atau naik ke kelas lain.
 * Langkah 3  KONFIRMASI  : ringkasan → proses_kenaikan() di database.
 *
 * Kapan berlaku: disiapkan sebelum 1 Juli → kelas siswa berubah otomatis saat
 * tahun ajaran baru dibuka. Dijalankan sesudah 1 Juli (terlambat) → langsung
 * berlaku (siswa sudah dibawa otomatis ke kelas lamanya). Boleh diulang.
 */
import { useMemo, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { bulanBerjalan, tahunAjaranBerjalan } from '../lib/format.js'
import { geserTa } from '../lib/bentukData.js'

/**
 * Tebak jenjang dari huruf pertama nama kelas (A1, Adzkia → 'awal'; B1, Bunga → 'akhir').
 * Dipakai untuk usulan awal saja — semua tetap bisa diubah.
 */
function jenjangKelas(nama) {
  const huruf = (nama || '').trim().charAt(0).toUpperCase()
  if (huruf === 'A') return 'awal'
  if (huruf === 'B') return 'akhir'
  return null
}
/** Usulan kelas tujuan: A1 → B1, A → B, KB → '' */
const usulTujuan = (k) => (jenjangKelas(k) === 'awal' ? 'B' + k.trim().slice(1) : '')

const AKSI = {
  naik: { label: 'Naik', emoji: '📈', warna: 'bg-brand-soft text-brand' },
  tinggal: { label: 'Tinggal kelas', emoji: '🔁', warna: 'bg-warn-soft text-warn-deep' },
  lulus: { label: 'Lulus', emoji: '🎓', warna: 'bg-ok-soft text-ok-deep' },
  tidak_lanjut: { label: 'Tidak lanjut', emoji: '👋', warna: 'bg-[#F1F2F6] text-muted dark:bg-white/10' },
}

export default function SheetKenaikanKelas({ buka, tutup }) {
  const { siswa, pengaturan, prosesKenaikan } = useData()
  const taKini = tahunAjaranBerjalan()
  const info = pengaturan.infoTa || {}
  // Juli–Maret & kenaikan tahun ini belum diproses → usulkan "terlambat" (dari tahun lalu)
  const telat = bulanBerjalan() < 9 && info.kenaikanSudah === false
  const [dari, setDari] = useState(telat ? geserTa(taKini, -1) : taKini)
  const ke = geserTa(dari, 1)
  const langsung = ke <= taKini

  const [langkah, setLangkah] = useState(1)
  const [kelasAksi, setKelasAksi] = useState({}) // { A1: { aksi: 'naik', tujuan: 'B1' } }
  const [perSiswa, setPerSiswa] = useState({}) // { siswaId: { aksi, kelas } } — pengecualian
  const [yakin, setYakin] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  const [hasil, setHasil] = useState(null)

  // siswa yang terdaftar di tahun asal, dengan kelasnya SAAT ITU
  const anggota = useMemo(
    () => siswa
      .map((s) => ({ s, k: (s.keanggotaan || []).find((x) => x.ta === dari) || (dari === taKini && s.terdaftar) || null }))
      .filter((x) => x.k && !['keluar', 'pindah'].includes(x.k.akhir))
      .sort((a, b) => a.k.kelas.localeCompare(b.k.kelas, 'id') || a.s.nama.localeCompare(b.s.nama, 'id')),
    [siswa, dari, taKini],
  )
  const kelasList = useMemo(() => [...new Set(anggota.map((x) => x.k.kelas))], [anggota])

  const aksiKelas = (k) => kelasAksi[k] || (jenjangKelas(k) === 'akhir' ? { aksi: 'lulus', tujuan: '' } : { aksi: 'naik', tujuan: usulTujuan(k) })
  const rencanaSiswa = ({ s, k }) => {
    const x = perSiswa[s.id]
    if (x) return x
    const a = aksiKelas(k.kelas)
    return { aksi: a.aksi, kelas: a.aksi === 'naik' ? a.tujuan : a.aksi === 'tinggal' ? k.kelas : '' }
  }
  const semua = anggota.map((x) => ({ ...x, r: rencanaSiswa(x) }))
  const kurangTujuan = semua.filter((x) => x.r.aksi === 'naik' && !x.r.kelas?.trim())
  const hitung = Object.fromEntries(Object.keys(AKSI).map((a) => [a, semua.filter((x) => x.r.aksi === a).length]))
  const nPengecualian = Object.keys(perSiswa).length

  const reset = () => { setLangkah(1); setKelasAksi({}); setPerSiswa({}); setYakin(false); setHasil(null); setSibuk(false) }
  const tutupReset = () => { if (!sibuk) { reset(); tutup() } }
  const gantiDari = (t) => { setDari(t); setKelasAksi({}); setPerSiswa({}); setLangkah(1) }

  const ubahSiswa = (x, aksi, kelas) => {
    const dasar = (() => { const a = aksiKelas(x.k.kelas); return { aksi: a.aksi, kelas: a.aksi === 'naik' ? a.tujuan : a.aksi === 'tinggal' ? x.k.kelas : '' } })()
    const baru = { aksi, kelas: kelas ?? (aksi === 'tinggal' ? x.k.kelas : aksi === 'naik' ? (perSiswa[x.s.id]?.kelas || aksiKelas(x.k.kelas).tujuan) : '') }
    setPerSiswa((p) => {
      const n = { ...p }
      if (baru.aksi === dasar.aksi && (baru.kelas || '') === (dasar.kelas || '')) delete n[x.s.id]
      else n[x.s.id] = baru
      return n
    })
  }

  const jalankan = async () => {
    setSibuk(true)
    try {
      const r = await prosesKenaikan(dari, semua.map((x) => ({ siswa: x.s.id, aksi: x.r.aksi, kelas: x.r.kelas?.trim() || null })))
      setHasil(r)
      setLangkah(4)
    } catch {
      /* pesan ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  const lead = langkah === 4 ? undefined : `Tahun ajaran ${dari} → ${ke}`

  return (
    <Sheet buka={buka} tutup={tutupReset} judul={langkah === 4 ? undefined : 'Kenaikan kelas'} lead={lead}>
      {langkah < 4 && (
        <div className="mb-3.5 grid grid-cols-2 gap-1 rounded-[18px] bg-isi p-1" role="tablist" aria-label="Tahun ajaran">
          {[geserTa(taKini, -1), taKini].map((t) => (
            <button key={t} type="button" role="tab" aria-selected={dari === t} onClick={() => gantiDari(t)}
              className={`rounded-[14px] px-1 py-2 text-[12px] font-extrabold leading-tight ${dari === t ? 'permen permen-kecil permen-biru' : 'text-muted'}`}>
              {t.slice(2, 4)}/{t.slice(7)} → {geserTa(t, 1).slice(2, 4)}/{geserTa(t, 1).slice(7)}
              <span className="block text-[10.5px] font-bold opacity-80">{t < taKini ? 'terlambat · langsung berlaku' : 'berlaku 1 Juli'}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── 1. PER KELAS ─────────────────────────── */}
      {langkah === 1 && (
        <>
          {anggota.length === 0 ? (
            <p className="mb-4 rounded-2xl bg-canvas px-4 py-5 text-center text-[13px] font-semibold text-muted">Tidak ada siswa terdaftar di tahun ajaran {dari}.</p>
          ) : (
            <div className="mb-4 space-y-2.5">
              {kelasList.map((k) => {
                const a = aksiKelas(k)
                const n = anggota.filter((x) => x.k.kelas === k).length
                const set = (u) => setKelasAksi((p) => ({ ...p, [k]: { ...aksiKelas(k), ...u } }))
                return (
                  <div key={k} className="rounded-2xl border border-line bg-kartu p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <b className="text-[14.5px] font-extrabold">Kelas {k}</b>
                      <span className="text-[12px] font-semibold text-muted">{n} siswa</span>
                    </div>
                    <div className="mb-2.5 grid grid-cols-3 gap-1.5">
                      {['naik', 'tinggal', 'lulus'].map((x) => (
                        <button key={x} type="button" aria-pressed={a.aksi === x} onClick={() => set({ aksi: x, tujuan: x === 'naik' ? a.tujuan || usulTujuan(k) : '' })}
                          className={`rounded-xl border-2 py-2 text-[12.5px] font-extrabold ${a.aksi === x ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}>
                          {AKSI[x].emoji} {x === 'tinggal' ? 'Tetap' : AKSI[x].label}
                        </button>
                      ))}
                    </div>
                    {a.aksi === 'naik' && (
                      <input className="field-input text-[14px]" value={a.tujuan} onChange={(e) => set({ tujuan: e.target.value })} placeholder="Kelas tujuan, mis. B1" aria-label={`Kelas tujuan untuk ${k}`} />
                    )}
                    {a.aksi === 'tinggal' && <p className="text-[12px] font-semibold text-warn-deep">Semua siswa tetap di kelas {k} tahun depan.</p>}
                    {a.aksi === 'lulus' && <p className="text-[12px] font-semibold text-ok-deep">Jadi alumni{langsung ? '' : ' mulai 1 Juli'} · tahun lulus {dari}.</p>}
                  </div>
                )
              })}
            </div>
          )}
          <button className="bigbtn disabled:opacity-60" disabled={!anggota.length} onClick={() => setLangkah(2)}>
            Lanjut — periksa per siswa
          </button>
        </>
      )}

      {/* ── 2. PER SISWA ─────────────────────────── */}
      {langkah === 2 && (
        <>
          <p className="mb-3 text-[12.5px] font-semibold leading-snug text-muted">
            Ubah siswa yang berbeda dari kelasnya — mis. <b className="text-ink">tinggal kelas</b> (2 tahun di TK A) atau tidak melanjutkan.
          </p>
          {kelasList.map((k) => (
            <div key={k} className="mb-3">
              <div className="mb-1.5 px-1 text-[12.5px] font-extrabold text-muted">Kelas {k}</div>
              <div className="card !px-3 !py-1">
                {semua.filter((x) => x.k.kelas === k).map((x) => {
                  const beda = !!perSiswa[x.s.id]
                  return (
                    <div key={x.s.id} className={`border-b border-dashed border-line py-2.5 last:border-b-0 ${beda ? '-mx-3 bg-warn-soft/40 px-3' : ''}`}>
                      <div className="flex items-center gap-2.5">
                        <Avatar nama={x.s.nama} jenis={x.s.jenis} avatar={x.s.avatar} foto={x.s.foto} size={34} />
                        <b className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold">{x.s.nama}</b>
                        <select className="field-input !w-auto !py-1.5 !pl-2.5 !pr-7 text-[12.5px] font-extrabold" value={x.r.aksi}
                          onChange={(e) => ubahSiswa(x, e.target.value)} aria-label={`Rencana untuk ${x.s.nama}`}>
                          <option value="naik">📈 Naik</option>
                          <option value="tinggal">🔁 Tinggal kelas</option>
                          <option value="lulus">🎓 Lulus</option>
                          <option value="tidak_lanjut">👋 Tidak lanjut</option>
                        </select>
                      </div>
                      {x.r.aksi === 'naik' && (
                        <div className="mt-1.5 flex items-center gap-2 pl-[44px]">
                          <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-muted">ke kelas</span>
                          <input className="field-input !py-1.5 text-[13px]" value={x.r.kelas || ''} onChange={(e) => ubahSiswa(x, 'naik', e.target.value)} placeholder="mis. B1" aria-label={`Kelas tujuan ${x.s.nama}`} />
                        </div>
                      )}
                      {x.r.aksi === 'tinggal' && <p className="mt-1 pl-[44px] text-[12px] font-semibold text-warn-deep">Tetap di kelas {x.k.kelas} tahun {ke}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {kurangTujuan.length > 0 && (
            <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] font-bold text-danger">{kurangTujuan.length} siswa naik kelas belum diisi kelas tujuannya.</p>
          )}
          <button className="bigbtn mb-2.5 disabled:opacity-60" disabled={kurangTujuan.length > 0} onClick={() => setLangkah(3)}>
            Lanjut ke konfirmasi{nPengecualian ? ` · ${nPengecualian} diubah` : ''}
          </button>
          <button className="bigbtn-ghost" onClick={() => setLangkah(1)}>Kembali</button>
        </>
      )}

      {/* ── 3. KONFIRMASI ─────────────────────────── */}
      {langkah === 3 && (
        <>
          <div className="mb-3.5 grid grid-cols-2 gap-2">
            {Object.entries(AKSI).map(([a, m]) => (
              <div key={a} className={`rounded-2xl px-3.5 py-3 ${m.warna}`}>
                <b className="block font-display text-[24px] font-bold leading-none">{hitung[a]}</b>
                <span className="text-[12px] font-extrabold">{m.emoji} {m.label}</span>
              </div>
            ))}
          </div>
          <div className="mb-3.5 rounded-2xl bg-canvas px-3.5 py-3 text-[12.5px] font-semibold leading-relaxed">
            {semua.filter((x) => x.r.aksi === 'naik').length > 0 && (
              <p>Naik: {[...new Set(semua.filter((x) => x.r.aksi === 'naik').map((x) => `${x.k.kelas} → ${x.r.kelas}`))].join(' · ')}</p>
            )}
            {hitung.tinggal > 0 && <p>Tinggal kelas: {semua.filter((x) => x.r.aksi === 'tinggal').map((x) => x.s.panggilan || x.s.nama).join(', ')}</p>}
            <p className="mt-1.5 text-muted">
              {langsung
                ? `Langsung berlaku untuk tahun ajaran ${ke} yang sedang berjalan.`
                : `Disimpan untuk ${ke}. Kelas & status siswa berubah otomatis 1 Juli — sampai itu tagihan tahun ini tetap berjalan seperti biasa.`}
              {' '}Riwayat kelas & pembayaran tetap utuh, dan wizard ini boleh dijalankan ulang kalau ada yang salah.
            </p>
          </div>
          <label className="mb-4 flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-3">
            <input type="checkbox" checked={yakin} onChange={(e) => setYakin(e.target.checked)} className="h-4 w-4" />
            <span className="text-[12.5px] font-semibold">Saya sudah memeriksa rencana ini</span>
          </label>
          <button className="bigbtn mb-2.5 disabled:opacity-50" onClick={jalankan} disabled={!yakin || sibuk}>
            {sibuk ? 'Memproses…' : `Proses ${semua.length} siswa`}
          </button>
          <button className="bigbtn-ghost" onClick={() => setLangkah(2)} disabled={sibuk}>Kembali</button>
        </>
      )}

      {/* ── 4. SELESAI ─────────────────────────── */}
      {langkah === 4 && hasil && (
        <div className="pb-1 pt-3 text-center">
          <div className="mb-3 text-[44px] leading-none">🎉</div>
          <h3 className="text-[18px] font-extrabold">Kenaikan kelas {hasil.langsung ? 'diproses' : 'disiapkan'}</h3>
          <p className="mb-5 mt-1.5 text-[13.5px] font-semibold leading-relaxed text-muted">
            {hasil.naik} naik · {hasil.tinggal} tinggal kelas · {hasil.lulus} lulus{hasil.tidakLanjut ? ` · ${hasil.tidakLanjut} tidak lanjut` : ''}
            <br />
            {hasil.langsung ? `Kelas siswa sudah diperbarui untuk ${hasil.ke}.` : `Berlaku otomatis 1 Juli ${hasil.ke.slice(0, 4)}.`}
          </p>
          <button className="bigbtn" onClick={tutupReset}>Selesai</button>
        </div>
      )}
    </Sheet>
  )
}
