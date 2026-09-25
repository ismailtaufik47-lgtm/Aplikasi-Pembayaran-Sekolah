/**
 * Profil akun pribadi — dipakai guru/TU maupun kepala sekolah.
 * Nama tampilan dan PIN login bisa diubah dari sini (peran & sekolah
 * ditentukan lewat kode aktivasi / pendaftaran, bukan diri sendiri).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ikon, PageHead, Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { pinLemah } from '../lib/api.js'
import { AVATAR_STAF, AvatarStaf } from '../components/Avatar.jsx'

const labelPeran = { kepala: 'Kepala sekolah', admin: 'Admin', guru: 'Guru' }

export default function ProfilAkun() {
  const { petugas, peran, pengaturan, pinAktif, modeDemo, ubahNamaSaya, aturPinAkun, matikanPinAkun, avatarSaya, ubahAvatarSaya, toast } = useData()
  const { keluar } = useAuth()
  const nav = useNavigate()
  const [nama, setNama] = useState(petugas)
  const [sibuk, setSibuk] = useState(false)
  const [formPin, setFormPin] = useState(false)
  const [mematikan, setMematikan] = useState(false)
  const [pilihAvatar, setPilihAvatar] = useState(false)

  const gantiAvatar = async (i) => {
    try {
      await ubahAvatarSaya(i)
      setPilihAvatar(false)
      toast(i === null ? 'Avatar dihapus' : 'Avatar disimpan')
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  useEffect(() => setNama(petugas), [petugas])
  const berubah = nama.trim() && nama.trim() !== petugas

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama tidak boleh kosong')
    setSibuk(true)
    try {
      await ubahNamaSaya(nama.trim())
      toast('Nama disimpan')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  const matikan = async () => {
    setMematikan(true)
    try {
      await matikanPinAkun()
      toast('PIN dimatikan')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setMematikan(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white border border-line" onClick={() => nav(-1)}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Profil akun</h2>
      </div>
      <PageHead judul="Profil akun" sub="Nama tampilan yang muncul di kartu pembayaran dan struk" />

      <div className="card mb-4 flex items-center gap-3.5 lg:mt-4 lg:max-w-md">
        <button
          className="relative shrink-0 rounded-full active:scale-95"
          onClick={() => setPilihAvatar(true)}
          aria-label="Ganti avatar"
        >
          <AvatarStaf nama={petugas} avatar={avatarSaya} size={64} />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-brand text-[11px] text-white">✏️</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{petugas || '—'}</div>
          <div className="mt-1">
            <span className="inline-block rounded-pill bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
              {labelPeran[peran] || peran}
            </span>
            <button className="ml-2.5 text-[12.5px] font-bold text-brand" onClick={() => setPilihAvatar(true)}>
              Ganti avatar
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-4 lg:max-w-md">
        <label className="mb-1.5 block text-[13px] font-bold">Nama tampilan</label>
        <input
          className="field-input mb-3.5"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama Anda"
        />
        <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={!berubah || sibuk}>
          {sibuk ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
      </div>

      {!modeDemo && (
        <div className="card mb-4 lg:max-w-md">
          <div className="row">
            <span className="tile bg-grape-soft text-grape"><Ikon.info size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-bold">Login dengan PIN</div>
              <div className="text-xs text-muted">{pinAktif ? 'Aktif' : 'Belum diaktifkan'}</div>
            </div>
            <button
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 ${pinAktif ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'}`}
              onClick={pinAktif ? matikan : () => setFormPin(true)}
              disabled={mematikan}
            >
              {mematikan ? 'Memproses…' : pinAktif ? 'Matikan' : 'Aktifkan'}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            PIN tersimpan di server (bukan di perangkat ini), jadi bisa dipakai masuk dari perangkat mana pun —
            cukup email dan PIN, tanpa perlu pilih akun Google tiap kali.
          </p>
        </div>
      )}

      <div className="card mb-4 lg:max-w-md">
        <div className="row">
          <span className="tile bg-brand-soft text-brand"><Ikon.rumah size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold">{pengaturan?.namaSekolah}</div>
            <div className="truncate text-xs text-muted">{pengaturan?.alamat || `Tahun ajaran ${pengaturan?.tahunAjaran}`}</div>
          </div>
        </div>
      </div>

      {!modeDemo && (
        <button
          className="w-full max-w-md rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
          onClick={keluar}
        >
          Keluar
        </button>
      )}
      {modeDemo && <p className="text-center text-[12px] text-muted">Mode demo — belum tersambung ke Supabase.</p>}

      <SheetAturPin
        buka={formPin}
        tutup={() => setFormPin(false)}
        aturPinAkun={aturPinAkun}
        toast={toast}
      />
      <Sheet buka={pilihAvatar} tutup={() => setPilihAvatar(false)} judul="Pilih avatar" lead="Tampil di menu samping dan profil akun Anda">
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          {AVATAR_STAF.map((_, i) => (
            <button
              key={i}
              onClick={() => gantiAvatar(i)}
              aria-pressed={avatarSaya === i}
              className={`grid place-items-center rounded-2xl p-1.5 transition ${avatarSaya === i ? 'bg-brand-soft ring-2 ring-brand' : 'hover:bg-line'}`}
            >
              <AvatarStaf nama={petugas} avatar={i} size={56} />
            </button>
          ))}
        </div>
        <div className="h-4" />
        {avatarSaya !== null && (
          <button className="bigbtn-ghost mb-2.5" onClick={() => gantiAvatar(null)}>Pakai huruf depan nama saja</button>
        )}
        <button className="bigbtn-ghost" onClick={() => setPilihAvatar(false)}>Tutup</button>
      </Sheet>
    </>
  )
}

function SheetAturPin({ buka, tutup, aturPinAkun, toast }) {
  const [langkah, setLangkah] = useState('isi') // isi | konfirmasi
  const [pin, setPin] = useState('')
  const [ulang, setUlang] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!buka) return
    setLangkah('isi'); setPin(''); setUlang(''); setGalat(''); setSibuk(false)
  }, [buka])

  const isiAngka = (nilai, set) => set(nilai.replace(/\D/g, '').slice(0, 6))

  const lanjut = () => {
    if (pin.length !== 6) return setGalat('PIN harus 6 angka')
    if (pinLemah(pin)) return setGalat('PIN terlalu mudah ditebak — hindari angka sama semua atau berurutan')
    setGalat(''); setLangkah('konfirmasi')
  }

  const simpanPin = async () => {
    if (ulang !== pin) { setGalat('PIN tidak sama, coba lagi'); setUlang(''); return }
    setSibuk(true)
    try {
      await aturPinAkun(pin)
      toast('PIN aktif — bisa dipakai masuk dari perangkat mana pun')
      tutup()
    } catch {
      /* pesan galat sudah ditangani store, sheet tetap terbuka */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul={langkah === 'isi' ? 'Buat PIN baru' : 'Ulangi PIN'}
      lead={langkah === 'isi' ? 'Isi 6 angka yang mudah Anda ingat' : 'Ketik sekali lagi untuk konfirmasi'}
    >
      {langkah === 'isi' ? (
        <>
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => isiAngka(e.target.value, setPin)}
            placeholder="••••••"
            className="field-input mb-1.5 text-center text-[22px] font-extrabold tracking-[.5em]"
          />
          {galat && <p className="mb-3 text-center text-[13px] font-bold text-danger">{galat}</p>}
          {!galat && <div className="mb-3 h-[18px]" />}
          <button className="bigbtn disabled:opacity-60" onClick={lanjut} disabled={pin.length !== 6}>
            Lanjut
          </button>
        </>
      ) : (
        <>
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            value={ulang}
            onChange={(e) => isiAngka(e.target.value, setUlang)}
            placeholder="••••••"
            className="field-input mb-1.5 text-center text-[22px] font-extrabold tracking-[.5em]"
          />
          {galat && <p className="mb-3 text-center text-[13px] font-bold text-danger">{galat}</p>}
          {!galat && <div className="mb-3 h-[18px]" />}
          <button className="bigbtn disabled:opacity-60" onClick={simpanPin} disabled={ulang.length !== 6 || sibuk}>
            {sibuk ? 'Menyimpan…' : 'Simpan PIN'}
          </button>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={() => setLangkah('isi')} disabled={sibuk}>Kembali</button>
        </>
      )}
    </Sheet>
  )
}