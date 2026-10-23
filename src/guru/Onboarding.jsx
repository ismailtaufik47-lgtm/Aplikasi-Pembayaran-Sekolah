/**
 * Ditampilkan sekali, tepat setelah akun Google baru berhasil login
 * tapi belum terhubung ke sekolah mana pun (belum ada baris `profil`).
 *
 * Dua jalur:
 *  - "Saya kepala sekolah" → daftarkan_sekolah(), jadi peran 'kepala'
 *  - "Saya Admin/TU"       → aktivasi_kode(), pakai kode dari kepsek
 *
 * Begitu salah satu berhasil, `onSelesai` dipanggil supaya GuruApp
 * memuat ulang data — sejak itu `muatDataGuru()` akan menemukan profil
 * yang baru dibuat dan masuk normal.
 *
 * v41: tampilan disamakan dengan layar masuk (langit, kartu, anak mengintip).
 */
import { useState } from 'react'
import { KUNCI_PERAN_DAFTAR } from '../components/DaftarPeran.jsx'
import LayarKode from '../components/LayarKode.jsx'
import LatarMasuk, {
  AkunMasuk, Garis, JudulKartu, KartuMasuk, KepalaLangkah, KepalaMerek, KotakInfo, PemisahAtau, PilihanPeran, SambutanPc, TombolUtama,
} from '../components/LatarMasuk.jsx'
import { TRIAL_HARI } from '../lib/langganan.js'
import * as api from '../lib/api.js'

// Petunjuk peran dari layar DaftarPeran (sebelum Google). Dibaca sekali per muat
// halaman — disimpan di luar komponen supaya render ganda (StrictMode) tidak menghilangkannya.
let petunjuk
const ambilPetunjuk = () => {
  if (petunjuk === undefined) {
    petunjuk = sessionStorage.getItem(KUNCI_PERAN_DAFTAR) || ''
    sessionStorage.removeItem(KUNCI_PERAN_DAFTAR)
  }
  return petunjuk
}

export default function Onboarding({ onSelesai }) {
  const [langkah, setLangkah] = useState(() => {
    const h = ambilPetunjuk()
    return h === 'kepala' ? 'daftar' : h === 'tu' ? 'kode' : 'pilih'
  })

  if (langkah === 'kode') {
    return (
      <LayarKode
        judul="Gabung ke sekolah"
        sub="Masukkan kode aktivasi dari kepala sekolah"
        label="Kode aktivasi"
        tombol="Hubungkan ke sekolah"
        ikonTombol="sekolah"
        kembali={() => setLangkah('pilih')}
        onSelesai={onSelesai}
        info={<>Belum punya kode? Minta ke kepala sekolah — dibuat di menu <b>Kode aktivasi</b>. Kode berlaku 7 hari & hanya bisa dipakai sekali.</>}
      />
    )
  }
  if (langkah === 'daftar') return <FormDaftar kembali={() => setLangkah('pilih')} onSelesai={onSelesai} />
  return <Pilih ke={setLangkah} />
}

function Pilih({ ke }) {
  return (
    <LatarMasuk kepala={<KepalaMerek />} sisiKiri={<SambutanPc />}>
      <KartuMasuk>
        <JudulKartu
          judul="Selangkah lagi"
          sub="Akun Google ini belum terhubung ke sekolah mana pun. Pilih yang sesuai posisi Anda."
        />
        <AkunMasuk />
        <PilihanPeran
          utama
          ikon="kartu"
          warna="biru"
          judul="Saya Admin/TU sekolah"
          sub="Sekolah sudah terdaftar & saya punya kode aktivasi dari kepala sekolah"
          onClick={() => ke('kode')}
        />
        <PemisahAtau />
        <PilihanPeran
          ikon="sekolah"
          warna="ungu"
          judul="Saya kepala sekolah"
          sub="Sekolah belum ada — daftarkan untuk pertama kali"
          onClick={() => ke('daftar')}
        />
      </KartuMasuk>
    </LatarMasuk>
  )
}

function FormDaftar({ kembali, onSelesai }) {
  const [nama, setNama] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const kirim = async () => {
    if (!nama.trim()) return setGalat('Isi nama sekolah dulu')
    setSibuk(true)
    setGalat('')
    try {
      await api.daftarkanSekolah({ nama: nama.trim() })
      onSelesai?.()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <LatarMasuk
      kepala={<KepalaLangkah ikon="sekolah" warna="ungu" judul="Daftarkan sekolah" sub="Anda menjadi kepala sekolah / admin utama" />}
      sisiKiri={<SambutanPc />}
      kembali={kembali}
    >
      <KartuMasuk>
        <JudulKartu tengah judul="Daftarkan sekolah" sub="Anda menjadi kepala sekolah / admin utama" className="judul-kartu-pc hidden lg:flex" />

        <AkunMasuk />

        <div className="flex items-end gap-3">
          <span className="permen permen-ungu grid h-11 w-11 shrink-0 place-items-center rounded-[14px] lg:h-12 lg:w-12">
            <Garis nama="sekolah" size={21} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="nama-sekolah" className="text-[13px] font-extrabold">Nama sekolah</label>
            <input
              id="nama-sekolah"
              value={nama}
              onChange={(e) => { setNama(e.target.value); setGalat('') }}
              onKeyDown={(e) => e.key === 'Enter' && kirim()}
              placeholder="contoh: TK Islam Al-Falah"
              autoFocus
              autoComplete="organization"
              className="h-[46px] w-full rounded-[14px] border-[1.5px] border-[#DCE3EF] bg-[#F7F9FE] px-3.5 text-[14.5px] font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft dark:border-line dark:bg-isi lg:h-[50px] lg:text-[15px]"
            />
          </div>
        </div>

        {galat && (
          <p role="alert" className="flex items-center gap-1.5 text-[12.5px] font-bold text-danger"><Garis nama="awas" size={15} sw={2.4} />{galat}</p>
        )}

        <TombolUtama ikon="sekolah" onClick={kirim} disabled={sibuk}>
          {sibuk ? 'Mendaftarkan…' : 'Daftarkan & lanjutkan'}
        </TombolUtama>

        <KotakInfo ikon="info" nada="info">
          Masa uji coba gratis <b>{TRIAL_HARI} hari</b> langsung aktif. Alamat, logo & nama kepala sekolah bisa dilengkapi nanti di menu <b>Profil sekolah</b>.
        </KotakInfo>
      </KartuMasuk>
    </LatarMasuk>
  )
}
