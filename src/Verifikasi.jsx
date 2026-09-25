/**
 * /verifikasi/:kode — halaman yang terbuka saat QR di kuitansi dipindai.
 *
 * Siapa pun (tanpa login) bisa memastikan kuitansi itu benar-benar
 * tercatat di aplikasi. Kalau seseorang mengedit angka di PDF, angka di
 * halaman ini tetap angka asli dari database, jadi langsung ketahuan.
 * Datanya sengaja minimal (nama siswa disamarkan).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as api from './lib/api.js'
import { rp } from './lib/format.js'
import { NAMA_APLIKASI } from './lib/langganan.js'

const tgl = (v) =>
  new Date(v).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const Baris = ({ k, v }) => (
  <div className="flex justify-between gap-4 border-b border-line py-2.5 text-[13.5px] last:border-0">
    <span className="font-semibold text-muted">{k}</span>
    <span className="text-right font-bold">{v}</span>
  </div>
)

export default function Verifikasi() {
  const { kode } = useParams()
  const [hasil, setHasil] = useState(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    api.verifikasiDokumen(kode).then(setHasil).catch((e) => setGalat(e.message))
  }, [kode])

  return (
    <div className="flex min-h-dvh items-start justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 text-center text-[12.5px] font-bold uppercase tracking-wide text-muted">Cek keaslian kuitansi</div>

        {!hasil && !galat && <div className="card py-10 text-center text-[14px] font-semibold text-muted">Memeriksa…</div>}

        {galat && <div className="card py-8 text-center text-[14px] font-semibold text-danger">Gagal memeriksa: {galat}</div>}

        {hasil && !hasil.sah && (
          <div className="card text-center">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-danger-soft text-3xl">⚠️</div>
            <h1 className="text-[19px] font-extrabold text-danger">Kuitansi tidak ditemukan</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {hasil.demo
                ? 'Ini mode demo — verifikasi hanya berjalan saat aplikasi terhubung ke database.'
                : 'Tidak ada transaksi dengan kode ini. Kuitansi mungkin palsu, atau transaksinya sudah dibatalkan oleh sekolah. Silakan konfirmasi langsung ke pihak sekolah.'}
            </p>
          </div>
        )}

        {hasil?.sah && (
          <div className="card">
            <div className="text-center">
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-3xl">✅</div>
              <h1 className="text-[19px] font-extrabold text-ok-deep">Kuitansi asli</h1>
              <p className="mt-1 text-[13px] text-muted">
                Tercatat resmi di {NAMA_APLIKASI}. Pastikan angka di bawah sama dengan kuitansi yang Anda pegang.
              </p>
            </div>
            <div className="mt-5 rounded-2xl bg-[#F7F8FC] px-4 py-1.5">
              <Baris k="Nomor" v={hasil.nomor} />
              <Baris k={hasil.jenis === 'kuitansi_sewa' ? 'Dari sekolah' : 'Sekolah'} v={hasil.sekolah} />
              {hasil.jenis === 'kuitansi_sewa' && <Baris k="Diterima oleh" v={hasil.penerbit} />}
              {hasil.siswa && <Baris k="Siswa" v={`${hasil.siswa} · ${hasil.kelas}`} />}
              <Baris k="Untuk" v={hasil.keterangan} />
              {hasil.metode && <Baris k="Metode" v={hasil.metode} />}
              <Baris k="Tanggal" v={tgl(hasil.tanggal)} />
              <Baris k="Jumlah" v={<span className="text-[16px] text-ok-deep">{rp(hasil.nominal)}</span>} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}