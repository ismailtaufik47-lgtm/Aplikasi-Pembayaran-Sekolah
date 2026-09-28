/**
 * Spanduk pengingat langganan — tampil di atas isi panel guru.
 *
 * Tiga kondisi:
 *  1. Trial berjalan — pengingat santai, bisa diklik ke halaman Langganan.
 *  2. Masa aktif tinggal sedikit (≤7 hari) — pengingat serupa, warna waspada.
 *  3. KADALUARSA (trial ATAU langganan habis) — spanduk MENETAP (tidak
 *     hilang sampai diperpanjang), menjelaskan bahwa semua transaksi
 *     terkunci sementara, tapi data tetap bisa dilihat.
 *     Teksnya beda tergantung riwayat sekolah:
 *       • belum pernah bayar (langgananSampai kosong) → "masa uji coba habis"
 *       • pernah bayar tapi sudah lewat tanggalnya    → "masa sewa tidak aktif"
 *       • dinonaktifkan paksa oleh admin aplikasi      → "dinonaktifkan admin"
 *
 * Aplikasi TIDAK dikunci total — semua akun tetap bisa membuka & melihat
 * data. Yang dikunci: catat pembayaran, tambah siswa, catat kas, saldo awal
 * kas, dan pembatalan (ditegakkan juga di database, 0013 & 0029).
 */
import { useNavigate } from 'react-router-dom'
import { Ikon } from './ui.jsx'
import { hitungLangganan, alasanKunci, waAdmin } from '../lib/langganan.js'
import { useData } from '../lib/store.jsx'

export default function SpandukLangganan({ pengaturan }) {
  const nav = useNavigate()
  const { boleh } = useData() || {}
  // Halaman Langganan hanya untuk akun berhak "sekolah" (biasanya kepala sekolah).
  const bisaBayar = boleh ? boleh('sekolah') : true
  const l = hitungLangganan(pengaturan)

  // Aktif dan masih lama → tidak perlu mengganggu.
  if (l.status === 'aktif' && l.sisaHari > 7) return null

  // ---------- kadaluarsa: spanduk menetap, tiga varian teks ----------
  if (l.status === 'kadaluarsa') {
    const alasan = alasanKunci(pengaturan) // 'admin' | 'sewa' | 'trial'
    const teks = {
      admin: {
        judul: 'Aplikasi sedang dinonaktifkan admin',
        isi: 'Semua transaksi (catat pembayaran, siswa baru, kas, pembatalan) sementara dikunci. Data yang sudah ada tetap aman dan tetap bisa dilihat. Silakan hubungi admin aplikasi.',
        tombol: 'Hubungi admin',
      },
      sewa: {
        judul: 'Masa sewa aplikasi tidak aktif',
        isi: 'Sudah jatuh tempo — semua transaksi (catat pembayaran, siswa baru, kas, pembatalan) sementara dikunci. Data yang sudah ada tetap aman dan tetap bisa dilihat.',
        tombol: 'Perpanjang sekarang',
      },
      trial: {
        judul: 'Masa uji coba sudah habis',
        isi: 'Sewa aplikasi untuk mengaktifkan lagi — semua transaksi (catat pembayaran, siswa baru, kas, pembatalan) sementara dikunci. Data yang sudah ada tetap aman dan tetap bisa dilihat.',
        tombol: 'Sewa sekarang',
      },
    }[alasan]
    const kelasTombol = 'mt-3 block w-full rounded-xl bg-danger py-2.5 text-center text-[13px] font-extrabold text-white active:scale-[.98]'
    return (
      <div className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft px-3.5 py-3.5 lg:mt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70 text-danger">
            <Ikon.peringatan size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13.5px] font-extrabold text-danger">{teks.judul}</b>
            <span className="mt-0.5 block text-[12px] font-semibold text-danger/90">{teks.isi}</span>
          </span>
        </div>
        {alasan === 'admin' ? (
          <a href={waAdmin(pengaturan)} target="_blank" rel="noreferrer" className={kelasTombol}>
            {teks.tombol}
          </a>
        ) : bisaBayar ? (
          <button onClick={() => nav('/guru/langganan')} className={kelasTombol}>
            {teks.tombol}
          </button>
        ) : (
          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-center text-[12.5px] font-bold text-danger">
            Minta kepala sekolah memperpanjang sewa aplikasi.
          </div>
        )}
      </div>
    )
  }

  const trial = l.status === 'trial'
  const sisa = Math.max(0, l.sisaHari)
  const mendesak = sisa <= 3

  const warna = trial
    ? mendesak
      ? 'border-warn/40 bg-warn-soft'
      : 'border-brand/25 bg-brand-soft'
    : 'border-warn/40 bg-warn-soft'

  const teksWarna = trial && !mendesak ? 'text-brand' : 'text-warn-deep'

  return (
    <button
      onClick={() => bisaBayar && nav('/guru/langganan')}
      className={`mt-3 flex w-full items-center gap-3 rounded-2xl border ${warna} px-3.5 py-3 text-left lg:mt-5`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70 ${teksWarna}`}>
        {trial ? <Ikon.jam size={18} /> : <Ikon.peringatan size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <b className={`block text-[13.5px] font-extrabold ${teksWarna}`}>
          {trial
            ? sisa === 0
              ? 'Masa uji coba berakhir hari ini'
              : `Masa uji coba tersisa ${sisa} hari`
            : sisa === 0
              ? 'Langganan berakhir hari ini'
              : `Langganan berakhir dalam ${sisa} hari`}
        </b>
        <span className="block truncate text-[12px] font-semibold text-muted">
          {trial
            ? 'Berlangganan agar semua fitur tetap aktif setelah masa uji coba.'
            : 'Perpanjang sekarang supaya tidak terputus.'}
        </span>
      </span>
      <span className={`shrink-0 rounded-pill px-3 py-1.5 text-[12px] font-extrabold text-white ${mendesak || !trial ? 'bg-warn' : 'bg-brand'}`}>
        Langganan
      </span>
    </button>
  )
}
