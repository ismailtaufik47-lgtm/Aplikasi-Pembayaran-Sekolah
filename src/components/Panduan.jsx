/**
 * Video panduan (YouTube) di dalam aplikasi — data di src/lib/panduan.js.
 *
 *  <TontonHalaman />   tombol kecil "Tonton caranya" untuk halaman yang sedang dibuka
 *                      (dipasang di KepalaHalaman & kepala aplikasi guru) — tidak tampil
 *                      kalau halaman itu belum punya video.
 *  <DaftarVideo untuk="kas|kelas|ortu" />   daftar kartu video (sampul, judul, durasi)
 *  <KartuPanduan />    kartu menuju halaman Panduan video (menu Lainnya aplikasi kas)
 *  (halaman /guru/panduan ada di src/guru/Panduan.jsx)
 *
 * Video diputar di jendela dalam aplikasi lewat youtube-nocookie.com (mode privasi YouTube):
 * pengguna tidak perlu mengunduh apa pun, kualitas menyesuaikan sinyal.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { gambarVideo, videoHalaman, videoUntuk } from '../lib/panduan.js'

const G = (d, sw = 2.4) => ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{d}</svg>
)
const IkonPutar = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" fill="currentColor" /></svg>
)
const IkonTutup = G(<path d="M6 6l12 12M18 6L6 18" />, 2.6)
const IkonKanan = G(<path d="M9 5l7 7-7 7" />, 2.6)

/** Jendela pemutar (tegak 9:16, juga pas untuk video mendatar). */
export function PemutarVideo({ video, tutup }) {
  useEffect(() => {
    if (!video) return
    const esc = (e) => e.key === 'Escape' && tutup()
    document.addEventListener('keydown', esc)
    const lama = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = lama }
  }, [video, tutup])
  if (!video) return null
  const src = `https://www.youtube-nocookie.com/embed/${video.idYt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  return createPortal(
    <div className="fixed inset-0 z-[90] flex animate-fade flex-col items-center justify-center bg-[rgba(8,12,24,.88)] p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && tutup()} role="dialog" aria-modal="true" aria-label={video.judul}>
      <div className="flex w-full max-w-[min(440px,calc((100dvh-120px)*9/16))] items-center gap-3 pb-2.5 text-white">
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-extrabold uppercase tracking-[.08em] text-white/60">Video panduan {video.no}</span>
          <b className="block truncate text-[15px] font-extrabold">{video.judul}</b>
        </span>
        <button type="button" onClick={tutup} aria-label="Tutup video" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25">
          <IkonTutup size={20} />
        </button>
      </div>
      <div className="aspect-[9/16] w-full max-w-[min(440px,calc((100dvh-120px)*9/16))] overflow-hidden rounded-[22px] bg-black shadow-[0_20px_60px_rgba(0,0,0,.5)]">
        <iframe
          src={src}
          title={video.judul}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>,
    document.body,
  )
}

/** Tombol kecil "Tonton caranya" — dipakai di kepala halaman. */
export function TombolTonton({ video, className = '' }) {
  const [buka, setBuka] = useState(false)
  if (!video) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={`tombol-tonton inline-flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-extrabold text-ink shadow-[0_4px_12px_rgba(27,37,89,.10)] transition active:scale-[.97] dark:bg-white/10 ${className}`}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#FF3B30] text-white"><IkonPutar size={12} /></span>
        Tonton caranya{video.durasi ? <span className="font-bold text-muted">· {video.durasi}</span> : null}
      </button>
      <PemutarVideo video={buka ? video : null} tutup={() => setBuka(false)} />
    </>
  )
}

/** Tombol untuk halaman yang sedang dibuka (otomatis dari alamat). */
export function TontonHalaman({ className = '' }) {
  const { pathname } = useLocation()
  return <TombolTonton video={videoHalaman(pathname)} className={className} />
}

function Sampul({ v, besar = false }) {
  const [gagal, setGagal] = useState(false)
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-[linear-gradient(160deg,#6A95FF,#3B6EF6)] ${besar ? 'aspect-[16/10] w-full rounded-[18px]' : 'h-[64px] w-[88px] rounded-[14px]'}`}>
      {!gagal && <img src={gambarVideo(v.idYt)} alt="" loading="lazy" onError={() => setGagal(true)} className="absolute inset-0 h-full w-full object-cover" />}
      {gagal && <span className="absolute inset-0 grid place-items-center font-display text-[26px] font-bold text-white/90">{v.no}</span>}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"><IkonPutar size={14} className="ml-0.5" /></span>
      </span>
      {v.durasi && <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-px text-[10.5px] font-extrabold text-white">{v.durasi}</span>}
    </span>
  )
}

/** Daftar video sebuah aplikasi. Tidak tampil sama sekali kalau belum ada video berlink. */
export function DaftarVideo({ untuk, judul = 'Video panduan', sub, className = '' }) {
  const [putar, setPutar] = useState(null)
  const daftar = videoUntuk(untuk)
  if (!daftar.length) return null
  return (
    <section className={className}>
      {judul && <div className="seghead"><h2>{judul}</h2></div>}
      {sub && <p className="-mt-1 mb-2.5 text-[12.5px] font-semibold text-muted">{sub}</p>}
      <div className="card !p-0 lg:grid lg:grid-cols-2 lg:gap-0">
        {daftar.map((v) => (
          <button key={v.id} type="button" onClick={() => setPutar(v)}
            className="flex w-full items-center gap-3.5 border-b border-line px-3.5 py-3 text-left transition last:border-b-0 hover:bg-isi/60 lg:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <Sampul v={v} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-extrabold uppercase tracking-[.06em] text-muted">Video {v.no}</span>
              <b className="line-clamp-2 block text-[14px] font-extrabold leading-snug">{v.judul}</b>
            </span>
            <IkonKanan size={18} className="text-[#C3CDDC]" />
          </button>
        ))}
      </div>
      <PemutarVideo video={putar} tutup={() => setPutar(null)} />
    </section>
  )
}

/** Kartu menuju halaman Panduan video (menu Lainnya aplikasi kas). */
export function KartuPanduan({ className = '' }) {
  const nav = useNavigate()
  const jumlah = videoUntuk('kas').length
  if (!jumlah) return null
  return (
    <button type="button" onClick={() => nav('/guru/panduan')} className={`card flex w-full items-center gap-3.5 text-left transition active:scale-[.99] ${className}`}>
      <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] bg-[#FF3B30] text-white shadow-[inset_0_-3px_0_#D42A21]"><IkonPutar size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">Video panduan</span>
        <span className="block text-xs font-semibold text-muted">{jumlah} video cara pakai, 2–3 menit</span>
      </span>
      <IkonKanan size={18} className="text-[#C3CDDC]" />
    </button>
  )
}
