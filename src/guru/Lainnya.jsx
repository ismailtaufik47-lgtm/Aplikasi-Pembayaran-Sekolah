/**
 * Menu "Lainnya" — tempat berlabuh halaman yang tidak muat di bottom
 * nav mobile. Isinya berbeda menurut peran: guru/admin dapat menu
 * operasional (laporan, jenis biaya, kode aktivasi), kepala sekolah
 * dapat menu administratif (kode aktivasi, profil sekolah) — keduanya
 * dapat Profil akun & Keluar.
 */
import { useNavigate } from 'react-router-dom'
import { Ikon, PageHead } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'

export default function Lainnya() {
  const { peran, petugas, modeDemo } = useData()
  const { keluar } = useAuth()
  const nav = useNavigate()
  const bisaUndang = peran === 'kepala' || peran === 'admin'

  const menuOperasional = [
    { label: 'Tagihan', sub: 'Semua tagihan SPP & kegiatan', ikon: <Ikon.nota size={19} />, warna: 'bg-rose-soft text-rose', ke: '/guru/tagihan' },
    { label: 'Laporan', sub: 'Ketertiban bayar & pemasukan', ikon: <Ikon.grafik size={19} />, warna: 'bg-brand-soft text-brand', ke: '/guru/laporan' },
    { label: 'Jenis biaya', sub: 'Nominal SPP & biaya kegiatan', ikon: <Ikon.dokumen size={19} />, warna: 'bg-warn-soft text-warn', ke: '/guru/biaya' },
  ]
  const menuUndang = bisaUndang
    ? [{ label: 'Kode aktivasi', sub: 'Undang guru/admin baru', ikon: <Ikon.info size={19} />, warna: 'bg-grape-soft text-grape', ke: '/guru/kode-aktivasi' }]
    : []
  const menuKepala = peran === 'kepala'
    ? [{ label: 'Profil sekolah', sub: 'Identitas & rekening sekolah', ikon: <Ikon.rumah size={19} />, warna: 'bg-ok-soft text-ok', ke: '/guru/profil-sekolah' }]
    : []
  const menuLangganan = bisaUndang
    ? [{ label: 'Langganan', sub: 'Masa aktif aplikasi & perpanjangan', ikon: <Ikon.dompet size={19} />, warna: 'bg-brand-soft text-brand', ke: '/guru/langganan' }]
    : []

  const daftar = peran === 'kepala'
    ? [...menuUndang, ...menuKepala, ...menuLangganan]
    : [...menuOperasional, ...menuUndang, ...menuLangganan]

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-lg shadow-soft">🏫</span>
        <h2 className="text-[17px] font-extrabold">Lainnya</h2>
      </div>
      <PageHead judul="Lainnya" sub="Pengaturan dan menu tambahan" />

      <div className="card mb-4 lg:mt-4 lg:max-w-md">
        {daftar.map((m) => (
          <button key={m.ke} className="row w-full text-left" onClick={() => nav(m.ke)}>
            <span className={`tile ${m.warna}`}>{m.ikon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{m.label}</span>
              <span className="block truncate text-xs text-muted">{m.sub}</span>
            </span>
            <Ikon.kembali size={16} className="rotate-180 text-[#C3CDDC]" />
          </button>
        ))}
      </div>

      <button className="card mb-4 flex w-full items-center gap-3.5 text-left lg:max-w-md" onClick={() => nav('/guru/profil-akun')}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-soft text-[15px] font-extrabold text-rose">
          {(petugas || 'G')[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold">{petugas || 'Profil akun'}</span>
          <span className="block text-xs text-muted">Lihat & ubah profil akun</span>
        </span>
        <Ikon.kembali size={16} className="rotate-180 text-[#C3CDDC]" />
      </button>

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