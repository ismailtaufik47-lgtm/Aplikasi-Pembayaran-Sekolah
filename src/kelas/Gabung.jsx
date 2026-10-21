/**
 * Layar "Gabung ke kelas": guru yang baru masuk dengan Google memasukkan kode
 * undangan 6 huruf dari admin/kepala sekolah (Penilaian anak › Guru kelas › Undang).
 * Tampilan sama dengan layar masuk (langit, kartu, anak mengintip), tema hijau.
 */
import { useRef, useState } from 'react'
import * as api from '../lib/api.js'
import LatarMasuk, { AkunMasuk, Garis, JudulKartu, KartuMasuk, KepalaLangkah, KotakInfo, SambutanPc, TombolUtama } from '../components/LatarMasuk.jsx'

const KOSONG = ['', '', '', '', '', '']
const bersihkan = (t) => (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export default function GabungKelas({ onSelesai }) {
  const [kode, setKode] = useState(KOSONG)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [goyang, setGoyang] = useState(0)
  const kotak = useRef([])
  const fokus = (i) => kotak.current[Math.max(0, Math.min(5, i))]?.focus()

  const isi = (mulai, teks) => {
    const huruf = bersihkan(teks).slice(0, 6 - mulai).split('')
    if (!huruf.length) return
    const baru = [...kode]
    huruf.forEach((h, j) => { baru[mulai + j] = h })
    setKode(baru)
    setGalat('')
    fokus(mulai + huruf.length)
    if (baru.every(Boolean) && mulai + huruf.length >= 6) kirim(baru.join(''))
  }

  const tombol = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const baru = [...kode]
      if (baru[i]) { baru[i] = ''; setKode(baru) } else if (i > 0) { baru[i - 1] = ''; setKode(baru); fokus(i - 1) }
      setGalat('')
    } else if (e.key === 'ArrowLeft') fokus(i - 1)
    else if (e.key === 'ArrowRight') fokus(i + 1)
    else if (e.key === 'Enter') kirim()
  }

  const kirim = async (gabung = kode.join('')) => {
    if (sibuk) return
    if (gabung.length < 6) { setGalat('Lengkapi 6 huruf kode undangan.'); setGoyang((x) => x + 1); return }
    setSibuk(true)
    setGalat('')
    try {
      await api.aktivasiKode(gabung)
      onSelesai?.()
    } catch (e) {
      setGalat(e.message)
      setGoyang((x) => x + 1)
      setKode(KOSONG)
      setTimeout(() => fokus(0), 30)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <LatarMasuk
      kepala={<KepalaLangkah ikon="kunci" warna="tosca" judul="Gabung ke kelas" sub="Masukkan kode undangan dari sekolah Anda" />}
      sisiKiri={<SambutanPc />}
    >
      <KartuMasuk>
        <JudulKartu tengah judul="Gabung ke kelas" sub="Masukkan kode undangan dari sekolah Anda" className="judul-kartu-pc hidden lg:flex" />

        <AkunMasuk />

        <div className="flex flex-col gap-2">
          <label htmlFor="kode-0" className="flex items-center justify-between text-[13px] font-extrabold">
            Kode undangan
            <span className="text-[12px] font-bold text-muted">6 huruf</span>
          </label>
          <div key={goyang} className={`grid grid-cols-6 gap-2 ${goyang ? 'goyang' : ''}`} onPaste={(e) => { e.preventDefault(); isi(0, e.clipboardData.getData('text')) }}>
            {kode.map((c, i) => (
              <input
                key={i}
                id={`kode-${i}`}
                ref={(el) => { kotak.current[i] = el }}
                value={c}
                onChange={(e) => isi(i, e.target.value.slice(-6))}
                onKeyDown={(e) => tombol(i, e)}
                onFocus={(e) => e.target.select()}
                autoFocus={i === 0}
                autoCapitalize="characters"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                spellCheck={false}
                inputMode="text"
                aria-label={`Huruf ke-${i + 1}`}
                className={`kotak-kode h-[58px] w-full min-w-0 rounded-[16px] text-center font-display text-[26px] font-semibold uppercase text-ink outline-none lg:h-[62px] ${c ? 'terisi' : ''} ${galat ? 'salah' : ''}`}
              />
            ))}
          </div>
          {galat
            ? <p role="alert" className="flex items-center gap-1.5 text-[12.5px] font-bold text-danger"><Garis nama="awas" size={15} sw={2.4} />{galat}</p>
            : <p className="text-[12px] font-semibold text-muted">Huruf besar/kecil sama saja. Bisa ditempel dari WA.</p>}
        </div>

        <TombolUtama ikon="sekolah" onClick={() => kirim()} disabled={sibuk}>
          {sibuk ? 'Memeriksa kode…' : 'Masuk ke kelas'}
        </TombolUtama>

        <KotakInfo ikon="tanya" nada="info">
          Belum punya kode? Minta ke admin atau kepala sekolah — dibuat di menu <b>Penilaian anak › Guru kelas</b>. Kode berlaku 7 hari.
        </KotakInfo>

      </KartuMasuk>
    </LatarMasuk>
  )
}
