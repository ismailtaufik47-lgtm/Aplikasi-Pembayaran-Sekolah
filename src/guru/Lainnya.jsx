/**
 * Menu "Lainnya" — tempat berlabuh halaman yang tidak muat di bottom
 * nav mobile. Isinya mengikuti hak akses akun (lib/akses.js): menu yang
 * sudah jadi tab di bawah tidak diulang di sini. Semua akun dapat
 * Profil akun, tema & Keluar.
 */
import { useNavigate } from 'react-router-dom'
import { EmojiMenu, Ikon, KartuTema, PageHead } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { AvatarStaf } from '../components/Avatar.jsx'
import { labelPeran, menuSekolah, pilihTab } from '../lib/akses.js'

export default function Lainnya() {
  const { peran, petugas, avatarSaya, modeDemo, boleh } = useData()
  const { keluar } = useAuth()
  const nav = useNavigate()

  const menu = menuSekolah(boleh)
  const diTab = new Set(pilihTab(menu, boleh('pembayaran')).map((t) => t.id))
  const daftar = menu.filter((m) => !diTab.has(m.id))

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <EmojiMenu id="lainnya" size={38} />
        <h2 className="text-[17px] font-extrabold">Lainnya</h2>
      </div>
      <PageHead judul="Lainnya" sub="Pengaturan dan menu tambahan" />

      {daftar.length > 0 && <div className="card mb-4 lg:mt-4 lg:max-w-md">
        {daftar.map((m) => (
          <button key={m.ke} className="row w-full text-left" onClick={() => nav(m.ke)}>
            <EmojiMenu id={m.emoji} size={44} className="rounded-[14px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{m.label}</span>
              <span className="block truncate text-xs text-muted">{m.sub}</span>
            </span>
            <Ikon.kembali size={16} className="rotate-180 text-[#C3CDDC]" />
          </button>
        ))}
      </div>}

      <button className="card mb-4 flex w-full items-center gap-3.5 text-left lg:max-w-md" onClick={() => nav('/guru/profil-akun')}>
        <AvatarStaf nama={petugas} avatar={avatarSaya} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold">{petugas || 'Profil akun'}</span>
          <span className="block text-xs text-muted">{labelPeran(peran)} · lihat & ubah profil akun</span>
        </span>
        <Ikon.kembali size={16} className="rotate-180 text-[#C3CDDC]" />
      </button>

      <KartuTema className="mb-4 lg:max-w-md" />

      {!modeDemo && (
        <button
          className="w-full max-w-md rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={keluar}
        >
          Keluar
        </button>
      )}
    </>
  )
}