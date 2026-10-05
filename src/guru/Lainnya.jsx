/**
 * Menu "Lainnya" — tempat berlabuh halaman yang tidak muat di bottom
 * nav mobile. Isinya mengikuti hak akses akun (lib/akses.js): menu yang
 * sudah jadi tab di bawah tidak diulang di sini. Semua akun dapat
 * Profil akun, tema & Keluar.
 */
import { useNavigate } from 'react-router-dom'
import { EmojiMenu, Ikon, KartuTema, KepalaHalaman } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { AvatarStaf } from '../components/Avatar.jsx'
import { labelPeran, menuSekolah, pilihTab } from '../lib/akses.js'

export default function Lainnya() {
  const { peran, petugas, avatarSaya, modeDemo, boleh } = useData()
  const { keluar } = useAuth()
  const nav = useNavigate()

  const menu = menuSekolah(boleh, peran)
  const diTab = new Set(pilihTab(menu, boleh('pembayaran') || (menu.some((m) => m.id === 'kas') && boleh('kas'))).map((t) => t.id))
  const daftar = menu.filter((m) => !diTab.has(m.id))

  const utama = daftar.filter((m) => m.grup === 'menu')
  const atur = daftar.filter((m) => m.grup !== 'menu')
  const Panah = () => <Ikon.kembali size={17} className="shrink-0 rotate-180 text-[#A3ABBB]" />

  return (
    <>
      <KepalaHalaman judul="Lainnya" gambar="anak" sub="Semua menu & pengaturan" />

      <div className="lg:max-w-[760px]">
        {utama.length > 0 && (
          <div className="mb-3.5 grid grid-cols-2 gap-3">
            {utama.map((m) => (
              <button key={m.ke} className="card flex min-w-0 flex-col items-start gap-2.5 text-left transition active:scale-[.98]" onClick={() => nav(m.ke)}>
                <EmojiMenu id={m.emoji} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-extrabold">{m.label}</span>
                  <span className="line-clamp-2 block text-[12px] font-semibold text-muted">{m.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {atur.length > 0 && (
          <div className="card mb-3.5 !py-2">
            <div className="px-0.5 pb-0.5 pt-1.5 text-[11.5px] font-extrabold uppercase tracking-[.09em] text-muted">Pengaturan</div>
            {atur.map((m) => (
              <button key={m.ke} className="row w-full text-left" onClick={() => nav(m.ke)}>
                <EmojiMenu id={m.emoji} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-extrabold">{m.label}</span>
                  <span className="block truncate text-xs font-semibold text-muted">{m.sub}</span>
                </span>
                <Panah />
              </button>
            ))}
          </div>
        )}

        <button className="card mb-3.5 flex w-full items-center gap-3.5 text-left" onClick={() => nav('/guru/profil-akun')}>
          <AvatarStaf nama={petugas} avatar={avatarSaya} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold">{petugas || 'Profil akun'}</span>
            <span className="block text-xs font-semibold text-muted">{labelPeran(peran)} · ubah PIN & avatar di Profil akun</span>
          </span>
          <Panah />
        </button>

        <KartuTema className="mb-3.5" />

        {!modeDemo && (
          <button
            className="mb-2 w-full rounded-[18px] bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger shadow-[inset_0_-3px_0_rgba(239,68,68,.2)]"
            onClick={keluar}
          >
            Keluar
          </button>
        )}
      </div>
    </>
  )
}
