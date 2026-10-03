/**
 * Gerbang portal orang tua: sebelum data ananda tampil, orang tua memasukkan
 * NIS (Nomor Induk Siswa) salah satu anaknya. Pengecekannya di database
 * (portal_wali di 0032) — layar ini hanya formulirnya. Salah 5 kali → tautan
 * dikunci 15 menit.
 *
 * Kalau "Ingat di HP ini" dicentang, NIS disimpan di perangkat ini supaya
 * lain kali portal langsung terbuka.
 */
import { useEffect, useState } from 'react'
import { GedungTK } from '../components/IlustrasiMasuk.jsx'
import LatarMasuk, { JudulKartu, KartuMasuk, KotakInfo, TautanTeks, TombolUtama } from '../components/LatarMasuk.jsx'
import * as api from '../lib/api.js'

export default function GerbangNis({ token, galat, gerbang, memeriksa, onMasuk, nisAwal = '' }) {
  const [nis, setNis] = useState(nisAwal)
  const [ingat, setIngat] = useState(true)
  const [info, setInfo] = useState(null) // { sekolah, wa, logo, aktif, demo }

  useEffect(() => {
    let aktif = true
    api.portalGerbang(token).then((d) => aktif && setInfo(d), () => aktif && setInfo(null))
    return () => { aktif = false }
  }, [token])

  const terkunci = gerbang?.galat === 'terkunci'
  const salah = gerbang && gerbang.galat !== 'perlu_nis' ? galat : ''
  const kirim = (e) => {
    e.preventDefault()
    if (!api.nisRapi(nis) || memeriksa) return
    onMasuk(nis.trim(), ingat)
  }
  const wa = (info?.wa || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
  const tanyaNis = () =>
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent("Assalamu'alaikum, saya orang tua siswa. Boleh minta NIS ananda untuk membuka portal pembayaran sekolah?")}`,
      '_blank',
    )

  return (
    <LatarMasuk
      kepala={
        <>
          <span className="masuk-logo grid place-items-center overflow-hidden border-white bg-[#FFFFFF] shadow-[0_10px_22px_rgba(42,85,204,.18)] dark:border-[#26304A]">
            {info?.logo
              ? <img src={info.logo} alt="Logo sekolah" className="h-[80%] w-[80%] object-contain" />
              : <GedungTK className="h-[74%] w-[92%]" />}
          </span>
          <span className="masuk-tagline mt-2.5 inline-block rounded-full bg-white/80 px-3 py-1 text-[13px] font-extrabold text-[#2C3A5E] dark:bg-white/10 dark:text-[#C9D3EE]">
            Portal Orang Tua
          </span>
        </>
      }
    >
      <KartuMasuk>
        <form onSubmit={kirim} className="flex flex-col gap-[inherit]">
          <JudulKartu
            judul="Masukkan NIS ananda"
            sub={`${info?.sekolah ? info.sekolah + ' · ' : ''}Untuk menjaga data ananda, portal dibuka dengan NIS salah satu anak Ayah/Bunda.`}
          />
          <label className="block">
            <span className="sr-only">NIS ananda</span>
            <input
              value={nis}
              onChange={(e) => setNis(e.target.value.slice(0, 30))}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="contoh: 2026-001"
              aria-invalid={!!salah}
              disabled={terkunci}
              className={`h-[58px] w-full rounded-[18px] border-2 bg-kartu px-4 text-center font-display text-[24px] font-semibold tracking-[.06em] text-[#1B2559] outline-none transition placeholder:font-sans placeholder:text-[15px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#9AA4B8] focus:border-brand focus:ring-4 focus:ring-brand-soft dark:text-ink ${
                salah ? 'border-danger' : 'border-[#DCE6F4] dark:border-line'
              }`}
            />
          </label>

          <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] font-bold text-[#34405C] dark:text-[#B8C3DC]">
            <input type="checkbox" checked={ingat} onChange={(e) => setIngat(e.target.checked)} className="h-[18px] w-[18px] accent-[#3B6EF6]" />
            Ingat di HP ini (tidak perlu mengetik lagi)
          </label>

          {salah && <KotakInfo ikon={terkunci ? 'gembok' : 'awas'} nada="bahaya">{salah}</KotakInfo>}
          {info && info.aktif === false && (
            <KotakInfo ikon="awas" nada="awas">Portal sekolah ini sedang tidak aktif. Silakan hubungi pihak sekolah.</KotakInfo>
          )}
          {info?.demo && !salah && (
            <KotakInfo ikon="info" nada="info">Mode demo: coba NIS <b>2026-001</b> (Aisyah) atau <b>2026-009</b> (Arkan).</KotakInfo>
          )}

          <TombolUtama type="submit" ikon="gembok" disabled={!api.nisRapi(nis) || memeriksa || terkunci}>
            {memeriksa ? 'Memeriksa…' : 'Buka portal'}
          </TombolUtama>

          <p className="text-center text-[12.5px] font-semibold leading-relaxed text-[#5B6478] dark:text-muted">
            NIS tertera di kuitansi pembayaran atau kartu siswa ananda.
            {wa && (
              <>
                <br />
                Belum tahu NIS-nya? <TautanTeks onClick={tanyaNis}>Tanya sekolah lewat WhatsApp</TautanTeks>
              </>
            )}
          </p>
        </form>
      </KartuMasuk>
    </LatarMasuk>
  )
}
