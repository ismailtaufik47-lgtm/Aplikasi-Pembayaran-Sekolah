// Kerangka aplikasi guru kelas.
//  • HP: layar penuh, tab bawah.  • Tablet: bingkai "HP" di tengah.
//  • PC (≥1024px): layar penuh — menu samping kiri (SampingKelas), isi lebar di kanan.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { KakiRumput, IkonMenu, LogoSekolah } from '../components/ui.jsx'
import { LogoTumbuh, TulisanTumbuh } from './merek.jsx'
import { namaKelas } from '../tumbuh/skala.js'
import { AvatarStaf } from '../components/Avatar.jsx'
import { IkonT } from '../tumbuh/bagian.jsx'

/** Bingkai: layar penuh di HP; di tablet/PC jadi "HP" di tengah layar. */
export function Bingkai({ samping, children }) {
  return (
    <div className="teks-jelas panel-ceria">
      <div className="latar-luar-ceria flex min-h-dvh justify-center sm:py-6 lg:py-0">
        <div className="langit-app relative flex h-dvh w-full max-w-[460px] overflow-hidden sm:h-[min(920px,calc(100dvh-48px))] sm:rounded-[36px] sm:shadow-phone lg:h-dvh lg:max-w-none lg:rounded-none lg:shadow-none">
          {samping}
          {/* sengaja tanpa `relative`: Sheet (absolute) menutup seluruh layar, termasuk menu samping */}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** Area gulir halaman; rumput & taman bermain menutup bagian bawah (tanpa ruang kosong). */
export function Gulir({ children }) {
  const ref = useRef(null)
  const { pathname } = useLocation()
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [pathname])
  return (
    <div ref={ref} className="langit-gulir noscroll flex-1 overflow-y-auto overscroll-contain">
      <div className="flex min-h-full flex-col">
        <div className="w-full px-[18px] pt-3.5 lg:mx-auto lg:max-w-[1180px] lg:px-10 lg:pt-8">{children}</div>
        <KakiRumput className="mt-auto" />
      </div>
    </div>
  )
}

/** Bilah aksi bawah (menggantikan tab, mis. di layar ceklis). */
export function BilahBawah({ children }) {
  return (
    <div className="bilah-tab relative z-10 -mt-5 flex shrink-0 items-center gap-2.5 rounded-t-[22px] px-[18px] pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:mx-auto lg:mb-4 lg:mt-0 lg:w-[calc(100%-80px)] lg:max-w-[1100px] lg:rounded-[22px] lg:px-5 lg:pb-3.5 lg:pt-3.5">
      {children}
    </div>
  )
}

export function BilahAtas({ data, ke }) {
  return (
    <header className="relative z-[3] mb-1.5 flex items-center gap-2.5 lg:hidden">
      <LogoSekolah logo={null} ukuran={42} className="shadow-[inset_0_-3px_0_#E3E9F4,0_4px_12px_rgba(27,37,89,.08)]" />
      <span className="min-w-0 flex-1">
        <b className="judul-halaman line-clamp-1 block text-[15px] font-extrabold leading-tight">{data.sekolah.nama}</b>
        <span className="sub-halaman block truncate text-[12px] font-bold">Guru kelas · {data.guru.nama}</span>
      </span>
      <button type="button" aria-label="Akun saya" onClick={() => ke('/kelas/lainnya')} className="shrink-0 rounded-full">
        <AvatarStaf nama={data.guru.nama} avatar={data.guru.avatar} size={40} />
      </button>
    </header>
  )
}

export function TabKelas({ aktif, ke, bagikan, adaCeklis }) {
  const tab = [
    { id: 'beranda', label: 'Kelas', ikon: <IkonMenu id="beranda" size={20} sw={2.2} />, warna: 'tosca', ke: '/kelas' },
    { id: 'anak', label: 'Anak', ikon: <IkonMenu id="siswa" size={20} sw={2.2} />, warna: 'kuning', ke: '/kelas/anak' },
    { id: 'bagikan', label: 'Bagikan', utama: true },
    adaCeklis && { id: 'ceklis', label: 'Ceklis', ikon: <IkonT.papan size={20} sw={2.2} />, warna: 'pink', ke: '/kelas/ceklis' },
    { id: 'lainnya', label: 'Lainnya', ikon: <IkonMenu id="lainnya" size={20} sw={2.2} />, warna: 'ungu', ke: '/kelas/lainnya' },
  ].filter(Boolean)
  return (
    <nav className="bilah-tab relative z-10 -mt-5 flex shrink-0 items-stretch rounded-t-[22px] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 lg:hidden">
      {tab.map((t) => (
        <button key={t.id} onClick={() => (t.utama ? bagikan() : ke(t.ke))} aria-current={aktif === t.id ? 'page' : undefined}
          className="flex flex-1 flex-col items-center justify-center gap-[3px] py-0.5">
          {t.utama ? (
            <span className="grid h-[38px] w-[46px] place-items-center rounded-[14px] tombol-bagikan bg-brand text-white">
              <IkonT.plus size={22} sw={2.6} />
            </span>
          ) : (
            <span className={`grid h-8 w-[46px] place-items-center rounded-xl transition ${aktif === t.id ? `permen permen-kecil permen-${t.warna}` : 'text-[#7C8AA5] dark:text-muted'}`}>{t.ikon}</span>
          )}
          <span className={`text-[11px] ${t.utama ? 'font-extrabold text-brand' : aktif === t.id ? 'font-extrabold text-[#1B2559] dark:text-ink' : 'font-bold text-[#6B7385] dark:text-muted'}`}>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

/**
 * Menu samping (hanya PC): merek Tumbuh Ceria, kartu sekolah & kelas, tombol
 * "Bagikan ke orang tua", menu, dan kartu guru di bawah.
 */
export function SampingKelas({ data, aktif, ke, bagikan, adaCeklis }) {
  const menu = [
    { id: 'beranda', label: 'Kelas saya', ikon: <IkonMenu id="beranda" size={19} sw={2.2} />, warna: 'tosca', ke: '/kelas' },
    { id: 'anak', label: 'Anak', ikon: <IkonMenu id="siswa" size={19} sw={2.2} />, warna: 'kuning', ke: '/kelas/anak' },
    adaCeklis && { id: 'ceklis', label: 'Ceklis perkembangan', ikon: <IkonT.papan size={19} sw={2.2} />, warna: 'pink', ke: '/kelas/ceklis' },
    { id: 'lainnya', label: 'Akun & pengaturan', ikon: <IkonMenu id="lainnya" size={19} sw={2.2} />, warna: 'ungu', ke: '/kelas/lainnya' },
  ].filter(Boolean)
  return (
    <aside className="sidebar-ceria noscroll relative z-[2] m-4 mr-0 hidden w-[264px] shrink-0 flex-col overflow-y-auto rounded-[28px] bg-kartu px-3.5 py-[18px] lg:flex">
      <div className="flex items-center gap-2.5 px-1.5 pb-3">
        <LogoTumbuh size={42} />
        <TulisanTumbuh className="text-[22px]" />
      </div>
      <div className="kartu-sekolah-sidebar flex items-center gap-2.5 rounded-2xl px-2.5 py-2">
        <LogoSekolah logo={null} ukuran={36} />
        <span className="min-w-0">
          <b className="line-clamp-2 text-[13px] font-extrabold leading-tight">{data.sekolah.nama}</b>
          <span className="block truncate text-[11.5px] font-bold text-muted">{namaKelas(data.kelas)} · {data.siswa.length} anak</span>
        </span>
      </div>

      <button type="button" onClick={bagikan}
        className="mb-3 mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-brand text-[14.5px] font-extrabold text-white active:translate-y-px">
        <IkonT.plus size={20} sw={2.6} /> Bagikan ke orang tua
      </button>

      <nav className="flex flex-col gap-[3px]">
        {menu.map((m) => {
          const on = aktif === m.id
          return (
            <button key={m.id} type="button" onClick={() => ke(m.ke)} aria-current={on ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-[14px] px-2 py-[6px] text-left text-[14px] transition ${on ? 'nav-aktif font-extrabold' : 'font-bold text-ink hover:bg-isi'}`}>
              <span className={`permen permen-kecil permen-${m.warna} grid h-9 w-9 shrink-0 place-items-center rounded-[11px]`}>{m.ikon}</span>
              {m.label}
            </button>
          )
        })}
      </nav>

      <button type="button" onClick={() => ke('/kelas/lainnya')} className="mt-auto flex items-center gap-2.5 rounded-2xl bg-isi px-2.5 py-2.5 text-left">
        <AvatarStaf nama={data.guru.nama} avatar={data.guru.avatar} size={38} />
        <span className="min-w-0">
          <b className="block truncate text-[13.5px] font-extrabold">{data.guru.nama}</b>
          <span className="block truncate text-[11.5px] font-bold text-muted">Guru kelas · {namaKelas(data.kelas)}</span>
        </span>
      </button>
    </aside>
  )
}
