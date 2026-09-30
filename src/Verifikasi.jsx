/**
 * /verifikasi/:kode — halaman yang terbuka saat QR di kuitansi dipindai.
 *
 * Siapa pun (tanpa login) bisa memastikan kuitansi itu benar-benar
 * tercatat di aplikasi. Kalau seseorang mengedit angka di PDF, angka di
 * halaman ini tetap angka asli dari database, jadi langsung ketahuan.
 * Datanya sengaja minimal (nama siswa disamarkan).
 *
 * Tampilan: kerangka ceria yang sama dengan layar masuk (LatarMasuk),
 * lencana status besar di atas kartu — hijau (asli), merah (dibatalkan),
 * oranye (tidak ditemukan).
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as api from './lib/api.js'
import { rp } from './lib/format.js'
import { NAMA_APLIKASI } from './lib/langganan.js'
import { LogoKasceria, TulisanKasceria } from './components/Kasceria.jsx'
import LatarMasuk, { Garis, KartuMasuk, KotakInfo, TombolHantu } from './components/LatarMasuk.jsx'

const ZONA = { timeZone: 'Asia/Jakarta' }
const tgl = (v) =>
  new Date(v).toLocaleString('id-ID', { ...ZONA, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const sekarang = () =>
  new Date().toLocaleString('id-ID', { ...ZONA, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB'

const Baris = ({ k, v }) => (
  <div className="flex justify-between gap-4 border-b border-dashed border-[#DDE3EE] py-2.5 text-[13.5px] last:border-0 dark:border-line">
    <span className="shrink-0 font-semibold text-[#5B6478] dark:text-muted">{k}</span>
    <span className="text-right font-extrabold">{v}</span>
  </div>
)

const Nomor = ({ children }) => <span className="font-mono text-[13px]">{children}</span>

function Kepala() {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <LogoKasceria size={44} />
        <TulisanKasceria className="text-[26px]" />
      </div>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 py-1.5 pl-2.5 pr-3.5 text-[12px] font-extrabold tracking-[.3px] text-[#1B2559] shadow-[0_4px_12px_rgba(27,37,89,.08)] dark:bg-white/10 dark:text-ink">
        <span className="text-brand"><Garis nama="perisai" size={16} sw={2.3} /></span>
        CEK KEASLIAN KUITANSI
      </span>
    </>
  )
}

/** Lencana bulat besar yang "menempel" di tepi atas kartu. */
function Lencana({ ikon, warna }) {
  return (
    <div className="absolute left-1/2 top-0 grid h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_12px_26px_rgba(27,37,89,.16)] dark:bg-kartu">
      <div className={`permen permen-${warna} grid h-[76px] w-[76px] place-items-center rounded-full`} style={{ boxShadow: 'inset 0 -5px 0 var(--p-bayang)' }}>
        <Garis nama={ikon} size={40} sw={3} />
      </div>
    </div>
  )
}

function JudulStatus({ warna, judul, children }) {
  return (
    <div className="flex flex-col gap-1.5 pt-10 text-center">
      <h1 className={`font-display text-[27px] font-bold leading-tight ${warna}`}>{judul}</h1>
      <p className="text-[13px] font-semibold leading-relaxed text-[#5B6478] dark:text-muted">{children}</p>
    </div>
  )
}

function Langkah({ nomor, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-white text-[12px] font-extrabold text-warn-deep shadow-[0_1px_0_#F3DDB4] dark:bg-kartu dark:shadow-none">
        {nomor}
      </span>
      <span className="text-[12.5px] font-semibold leading-relaxed text-[#5A3D07] dark:text-[#FFE3A8]">{children}</span>
    </div>
  )
}

export default function Verifikasi() {
  const { kode } = useParams()
  const [hasil, setHasil] = useState(null)
  const [galat, setGalat] = useState('')
  const [waktuCek, setWaktuCek] = useState('')

  const periksa = useCallback(() => {
    setHasil(null); setGalat('')
    api.verifikasiDokumen(kode)
      .then((h) => { setHasil(h); setWaktuCek(sekarang()) })
      .catch((e) => setGalat(e.message))
  }, [kode])

  useEffect(() => { periksa() }, [periksa])

  let isi
  if (galat) {
    isi = (
      <>
        <Lencana ikon="muat" warna="abu" />
        <JudulStatus warna="text-ink" judul="Belum bisa memeriksa">
          Koneksi ke server sedang bermasalah ({galat}). Coba lagi sebentar lagi.
        </JudulStatus>
        <TombolHantu ikon="muat" onClick={periksa}>Coba periksa lagi</TombolHantu>
      </>
    )
  } else if (!hasil) {
    isi = (
      <>
        <Lencana ikon="perisai" warna="biru" />
        <JudulStatus warna="text-[#1B2559] dark:text-ink" judul="Memeriksa…">
          Mencocokkan kode kuitansi dengan catatan sekolah.
        </JudulStatus>
        <div className="mx-auto mb-2 h-1.5 w-40 overflow-hidden rounded-full bg-brand-soft">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
      </>
    )
  } else if (hasil.sah) {
    const sewa = hasil.jenis === 'kuitansi_sewa'
    isi = (
      <>
        <Lencana ikon="centang" warna="hijau" />
        <JudulStatus warna="text-ok-deep" judul="Kuitansi asli">Tercatat resmi di {NAMA_APLIKASI}.</JudulStatus>
        <div className="flex items-center justify-between gap-3 rounded-[18px] bg-ok-soft px-4 py-3">
          <span className="text-[12.5px] font-bold text-ok-deep">Jumlah dibayar</span>
          <span className="font-display text-[27px] font-bold text-ok-deep">{rp(hasil.nominal)}</span>
        </div>
        <div className="flex flex-col">
          <Baris k="Nomor" v={<Nomor>{hasil.nomor}</Nomor>} />
          <Baris k={sewa ? 'Dari sekolah' : 'Sekolah'} v={hasil.sekolah} />
          {sewa && hasil.penerbit && <Baris k="Diterima oleh" v={hasil.penerbit} />}
          {hasil.siswa && <Baris k="Siswa" v={`${hasil.siswa}${hasil.kelas ? ` · Kelas ${hasil.kelas}` : ''}`} />}
          <Baris k="Untuk" v={hasil.keterangan} />
          {hasil.metode && <Baris k="Metode" v={hasil.metode} />}
          <Baris k="Tanggal" v={tgl(hasil.tanggal)} />
        </div>
        <KotakInfo ikon="awas" nada="awas">
          Angka atau nomor di kuitansi Anda <b>berbeda</b> dari yang tertulis di sini? Kuitansi itu mungkin sudah diubah — hubungi pihak sekolah.
        </KotakInfo>
        <p className="text-center text-[11.5px] font-semibold leading-relaxed text-[#6B7385] dark:text-muted">
          Diperiksa {waktuCek}{hasil.siswa ? ' · Nama siswa sengaja disingkat' : ''}
        </p>
      </>
    )
  } else if (hasil.dibatalkan) {
    isi = (
      <>
        <Lencana ikon="larang" warna="merah" />
        <JudulStatus warna="text-[#C62828] dark:text-[#FF8A8A]" judul="Kuitansi dibatalkan">
          Transaksi ini pernah tercatat, tetapi sudah dibatalkan oleh sekolah. Kuitansi ini <b className="text-ink">tidak berlaku lagi</b>.
        </JudulStatus>
        <div className="flex items-center justify-between gap-3 rounded-[18px] bg-[#F4F5F9] px-4 py-3">
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-extrabold text-[#C62828] dark:text-[#FF8A8A]">TIDAK BERLAKU</span>
          <span className="font-display text-[27px] font-bold text-[#7C8599] line-through decoration-2">{rp(hasil.nominal)}</span>
        </div>
        <div className="flex flex-col">
          <Baris k="Nomor" v={<Nomor>{hasil.nomor}</Nomor>} />
          <Baris k="Sekolah" v={hasil.sekolah} />
          <Baris k="Untuk" v={hasil.keterangan} />
          <Baris k="Tanggal bayar" v={tgl(hasil.tanggal)} />
          {hasil.dibatalkanPada && (
            <Baris k="Dibatalkan" v={<span className="text-[#C62828] dark:text-[#FF8A8A]">{tgl(hasil.dibatalkanPada)}</span>} />
          )}
        </div>
        <KotakInfo ikon="info" nada="bahaya">
          Silakan konfirmasi ke pihak sekolah sebelum memakai kuitansi ini sebagai bukti bayar.
        </KotakInfo>
        <p className="text-center text-[11.5px] font-semibold text-[#6B7385] dark:text-muted">Diperiksa {waktuCek}</p>
      </>
    )
  } else {
    isi = (
      <>
        <Lencana ikon="tanya" warna="oranye" />
        <JudulStatus warna="text-[#9A5B00] dark:text-warn-deep" judul="Kuitansi tidak ditemukan">
          {hasil.demo
            ? 'Ini mode demo — verifikasi hanya berjalan saat aplikasi terhubung ke database.'
            : `Tidak ada transaksi dengan kode ini di ${NAMA_APLIKASI}. Kuitansi ini mungkin palsu, atau QR-nya salah terbaca.`}
        </JudulStatus>
        <div className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-[#F7E2BC] bg-[#FFF8EC] p-3.5 dark:border-warn/30 dark:bg-warn-soft">
          <span className="text-[12px] font-extrabold tracking-[.4px] text-warn-deep">YANG BISA ANDA LAKUKAN</span>
          <Langkah nomor={1}>Pindai ulang QR langsung dari kuitansi — jangan dari foto yang buram atau terpotong.</Langkah>
          <Langkah nomor={2}>Tanyakan ke pihak sekolah sambil menunjukkan kuitansinya.</Langkah>
        </div>
        <p className="break-all text-center text-[11.5px] font-semibold text-[#6B7385] dark:text-muted">
          Kode yang diperiksa: <span className="font-mono">{kode}</span>
        </p>
      </>
    )
  }

  return (
    <LatarMasuk kepala={<Kepala />} anak={false}>
      <KartuMasuk className="verif-kartu mt-12">{isi}</KartuMasuk>
    </LatarMasuk>
  )
}
