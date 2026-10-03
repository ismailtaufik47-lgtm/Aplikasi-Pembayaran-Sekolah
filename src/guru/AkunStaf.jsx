/**
 * Akun staf — khusus kepala sekolah.
 *
 * Daftar semua akun yang terhubung ke sekolah ini. Akun Admin/TU yang sudah
 * tidak bertugas bisa DINONAKTIFKAN: akunnya tetap ada (riwayat transaksi
 * yang pernah dicatat tetap utuh), tapi tidak bisa membuka data sekolah
 * sama sekali sampai diaktifkan lagi. Penguncian sebenarnya dilakukan
 * database (0032_nis_portal_tabungan_akun.sql), bukan hanya tampilan ini.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarStaf } from '../components/Avatar.jsx'
import { BtnKecil, Chip, Ikon, KepalaHalaman, Kosong, KosongCeria, Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'

const tglPendek = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

/** "baru saja" · "3 jam lalu" · "kemarin" · "12 Sep 2026" */
function kapan(iso) {
  if (!iso) return 'belum pernah'
  const menit = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (menit < 5) return 'baru saja'
  if (menit < 60) return `${menit} menit lalu`
  const jam = Math.round(menit / 60)
  if (jam < 24) return `${jam} jam lalu`
  const hari = Math.round(jam / 24)
  if (hari === 1) return 'kemarin'
  if (hari < 7) return `${hari} hari lalu`
  return tglPendek(iso)
}

export default function AkunStaf() {
  const { toast } = useData()
  const nav = useNavigate()
  const [daftar, setDaftar] = useState(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState(null) // akun yang sedang dikonfirmasi
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    setGalat('')
    try {
      setDaftar(await api.daftarAkunSekolah())
    } catch (e) {
      setGalat(e.message)
    }
  }, [])

  useEffect(() => {
    muat()
  }, [muat])

  const simpan = async () => {
    const a = pilih
    setSibuk(true)
    try {
      await api.aturAkunAktif(a.id, !a.aktif)
      toast(a.aktif ? `Akun ${a.nama} dinonaktifkan` : `Akun ${a.nama} aktif lagi`)
      setPilih(null)
      await muat()
    } catch (e) {
      toast(e.message)
    } finally {
      setSibuk(false)
    }
  }

  const staf = (daftar || []).filter((a) => a.peran !== 'kepala')
  const jumlahAktif = staf.filter((a) => a.aktif).length
  const undang = () => nav('/guru/kode-aktivasi')

  return (
    <>
      <KepalaHalaman
        judul="Akun staf"
        gambar="anak"
        kembali={() => nav('/guru/lainnya')}
        sub={
          daftar
            ? `${jumlahAktif} Admin/TU aktif${staf.length > jumlahAktif ? ` · ${staf.length - jumlahAktif} dinonaktifkan` : ''}`
            : 'Siapa saja yang bisa membuka aplikasi sekolah ini'
        }
        aksiHp={null}
        aksi={<BtnKecil utama onClick={undang}><Ikon.plus size={16} />Undang Admin/TU</BtnKecil>}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="card mb-4 !py-2">
          {galat ? (
            <div className="py-6 text-center">
              <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
              <button className="tombol-putih mt-3 rounded-[14px] px-4 py-2 text-[13px] font-extrabold" onClick={muat}>Coba lagi</button>
            </div>
          ) : !daftar ? (
            <Kosong>Memuat daftar akun…</Kosong>
          ) : staf.length === 0 ? (
            <KosongCeria
              judul="Belum ada Admin/TU"
              aksi={<button className="bigbtn flex items-center justify-center gap-2" onClick={undang}><Ikon.plus size={19} /> Buat kode aktivasi</button>}
            >
              Buat kode aktivasi, lalu bagikan ke petugas TU supaya bisa bergabung ke sekolah ini.
            </KosongCeria>
          ) : (
            daftar.map((a) => <BarisAkun key={a.id} a={a} ubah={() => setPilih(a)} />)
          )}
        </div>

        <div>
          <div className="spanduk-kuning mb-4 flex items-start gap-3 rounded-[20px] p-3.5">
            <span className="permen permen-kecil permen-kuning grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"><Ikon.info size={18} /></span>
            <div className="text-[12.5px] font-semibold leading-relaxed">
              <b className="block text-[13.5px] font-extrabold">Kapan menonaktifkan akun?</b>
              Saat petugas berhenti bertugas atau HP-nya hilang. Akun yang dinonaktifkan tidak bisa melihat maupun
              mencatat data apa pun, tapi semua transaksi yang pernah dicatatnya tetap tersimpan.
            </div>
          </div>
          <button className="bigbtn flex items-center justify-center gap-2 lg:hidden" onClick={undang}>
            <Ikon.plus size={19} /> Undang Admin/TU baru
          </button>
        </div>
      </div>

      <Sheet
        buka={!!pilih}
        tutup={() => !sibuk && setPilih(null)}
        judul={pilih ? (pilih.aktif ? `Nonaktifkan akun ${pilih.nama}?` : `Aktifkan lagi akun ${pilih.nama}?`) : ''}
        lead={
          pilih?.aktif
            ? `${pilih.nama} tidak akan bisa membuka aplikasi sampai diaktifkan lagi. Semua transaksi yang pernah dicatatnya tetap tersimpan.`
            : `${pilih?.nama} bisa membuka aplikasi lagi dengan hak akses Admin/TU seperti sebelumnya.`
        }
      >
        {pilih && (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-[18px] bg-kartu p-3 shadow-[0_8px_24px_rgba(30,64,140,.08)]">
              <AvatarStaf nama={pilih.nama} avatar={Number.isInteger(pilih.avatar) ? pilih.avatar : null} size={44} />
              <span className="min-w-0">
                <b className="block truncate text-[14.5px] font-extrabold">{pilih.nama}</b>
                <span className="block truncate text-[12.5px] font-semibold text-muted">{pilih.email || 'Admin/TU'}</span>
              </span>
            </div>
            <button className={`${pilih.aktif ? 'bigbtn-tutup' : 'bigbtn-wa'} mb-2.5 disabled:opacity-60`} onClick={simpan} disabled={sibuk}>
              {sibuk ? 'Menyimpan…' : pilih.aktif ? 'Ya, nonaktifkan' : 'Ya, aktifkan lagi'}
            </button>
            <button className="bigbtn-ghost" onClick={() => setPilih(null)} disabled={sibuk}>Batal</button>
          </>
        )}
      </Sheet>
    </>
  )
}

function BarisAkun({ a, ubah }) {
  const kepala = a.peran === 'kepala'
  return (
    <div className={`row ${a.aktif ? '' : 'opacity-90'}`}>
      <span className={`relative shrink-0 ${a.aktif ? '' : 'grayscale'}`}>
        <AvatarStaf nama={a.nama} avatar={Number.isInteger(a.avatar) ? a.avatar : null} size={46} />
        {!a.aktif && (
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-danger text-white dark:border-kartu">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M6 6l12 12" /></svg>
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="truncate text-[14.5px] font-extrabold">{a.nama}{a.saya ? ' (Anda)' : ''}</b>
          <Chip warna={kepala ? 'blue' : a.aktif ? 'green' : 'red'}>{kepala ? 'Kepala sekolah' : a.aktif ? 'Aktif' : 'Nonaktif'}</Chip>
        </span>
        {a.email && <span className="block truncate text-[12px] font-semibold text-muted">{a.email}</span>}
        <span className="block text-[11.5px] font-semibold text-muted">
          {a.aktif
            ? `${kepala ? 'Kepala sekolah' : 'Admin/TU'} · terakhir masuk ${kapan(a.terakhirMasuk)}`
            : `Dinonaktifkan ${tglPendek(a.dinonaktifkanPada)}${a.dinonaktifkanOleh ? ` oleh ${a.dinonaktifkanOleh}` : ''}`}
        </span>
      </span>
      {!kepala && (
        <button
          onClick={ubah}
          className={`shrink-0 rounded-[12px] px-3 py-2 text-[12.5px] font-extrabold active:translate-y-px ${
            a.aktif ? 'bg-danger-soft text-danger' : 'bg-ok text-white'
          }`}
        >
          {a.aktif ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      )}
    </div>
  )
}
