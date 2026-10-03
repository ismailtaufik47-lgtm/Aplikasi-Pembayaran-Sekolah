/**
 * Form alasan pembatalan — dipakai untuk membatalkan pembayaran
 * (Riwayat pembayaran, kartu siswa) maupun transaksi kas.
 *
 * Alurnya sengaja sederhana:
 *   1. ketuk "Batalkan transaksi"
 *   2. pilih alasan cepat (atau ketik sendiri)
 *   3. "Ya, batalkan"
 * Transaksi tidak dihapus: tercatat di Riwayat pembatalan lengkap dengan
 * siapa, kapan, dan alasannya.
 */
import { useState } from 'react'
import { rp } from '../lib/format.js'

const CEPAT_BAYAR = ['Salah nominal', 'Salah siswa', 'Salah bulan/kegiatan', 'Tercatat dua kali']
const CEPAT_KAS = ['Salah nominal', 'Salah kategori', 'Salah tanggal', 'Tercatat dua kali']

export default function FormBatal({ nominal, jenis = 'bayar', sibuk, onKirim, onBatal }) {
  const [alasan, setAlasan] = useState('')
  const cepat = jenis === 'kas' ? CEPAT_KAS : CEPAT_BAYAR
  const cukup = alasan.trim().length >= 3

  return (
    <div className="rounded-2xl border border-danger/30 bg-kartu p-3.5">
      <div className="text-[14px] font-extrabold text-danger">Batalkan transaksi {rp(nominal)}?</div>
      <p className="mb-3 mt-0.5 text-[12px] font-semibold text-muted">
        {jenis === 'kas'
          ? 'Transaksi tetap terlihat dicoret dan saldo kas dihitung ulang.'
          : 'Tagihan siswa kembali seperti sebelum dibayar. Kuitansinya tercatat DIBATALKAN.'}
      </p>

      <div className="mb-2 text-[12.5px] font-bold">Alasan</div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {cepat.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAlasan(c)}
            className={`rounded-pill border px-3 py-1.5 text-[12px] font-bold ${
              alasan === c ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-kartu text-muted'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        className="field-input mb-3"
        maxLength={200}
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        placeholder="atau tulis alasan lain…"
      />

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-2xl bg-[#F1F2F6] py-3 text-[14px] font-bold text-muted"
          onClick={onBatal}
          disabled={sibuk}
        >
          Tidak jadi
        </button>
        <button
          type="button"
          className="flex-[1.4] rounded-2xl bg-danger py-3 text-[14px] font-extrabold text-white disabled:opacity-50"
          disabled={sibuk || !cukup}
          onClick={() => onKirim(alasan.trim())}
        >
          {sibuk ? 'Membatalkan…' : 'Ya, batalkan'}
        </button>
      </div>
    </div>
  )
}
