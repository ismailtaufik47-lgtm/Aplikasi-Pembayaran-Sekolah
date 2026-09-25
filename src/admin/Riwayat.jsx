/**
 * Riwayat perpanjangan langganan (24 bulan terakhir), dikelompokkan per
 * bulan dengan subtotal. Transaksi TERAKHIR tiap sekolah bisa dibatalkan
 * (untuk salah klik) — jatuh tempo sekolah itu dikembalikan seperti semula.
 */
import { useMemo, useState } from 'react'
import { Kosong, PageHead, Sheet } from '../components/ui.jsx'
import { rp } from '../lib/format.js'
import { tglPendek, useAdmin } from './storeAdmin.jsx'
import * as api from './apiAdmin.js'

const judulBulan = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
const jam = (d) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export default function Riwayat() {
  const { riwayat, batalkan, sibuk, unduhDokumen } = useAdmin()
  const [konfirm, setKonfirm] = useState(null)
  const [unduh, setUnduh] = useState(null)

  const kuitansi = (r) =>
    unduhDokumen(async () => {
      setUnduh(r.id)
      try {
        const [d, { unduhKuitansiSewa }] = await Promise.all([api.kuitansiSewa(r.id), import('../lib/dokumen.js')])
        await unduhKuitansiSewa(d)
      } finally {
        setUnduh(null)
      }
    })

  // id transaksi terakhir per sekolah (riwayat sudah urut terbaru dulu)
  const terakhir = useMemo(() => {
    const set = new Set(), sudah = new Set()
    riwayat.forEach((r) => {
      if (!sudah.has(r.sekolahId)) { sudah.add(r.sekolahId); set.add(r.id) }
    })
    return set
  }, [riwayat])

  const grup = useMemo(() => {
    const peta = new Map()
    riwayat.forEach((r) => {
      const d = new Date(r.dibuatPada)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (!peta.has(k)) peta.set(k, { judul: judulBulan(d), total: 0, baris: [] })
      const g = peta.get(k)
      g.total += Number(r.nominal)
      g.baris.push(r)
    })
    return [...peta.values()]
  }, [riwayat])

  const ya = async () => {
    try {
      await batalkan(konfirm)
      setKonfirm(null)
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }

  return (
    <>
      <div className="pb-1.5 pt-3.5 lg:hidden">
        <h1 className="text-xl font-extrabold">Riwayat</h1>
      </div>
      <PageHead judul="Riwayat pembayaran" sub="Semua perpanjangan langganan yang sudah dikonfirmasi (24 bulan terakhir)" />

      {grup.length === 0 ? (
        <div className="card mt-2 lg:mt-4"><Kosong>Belum ada perpanjangan yang tercatat.</Kosong></div>
      ) : (
        grup.map((g) => (
          <div key={g.judul} className="mt-2 lg:mt-4">
            <div className="seghead !mt-3">
              <b className="text-[14px] font-extrabold">{g.judul}</b>
              <span className="text-[13px] font-bold text-muted">
                {g.baris.length} trx · <b className="text-ink">{rp(g.total)}</b>
              </span>
            </div>
            <div className="card">
              {g.baris.map((r) => {
                const d = new Date(r.dibuatPada)
                return (
                  <div key={r.id} className="row items-start">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{r.namaSekolah}</span>
                      <span className="block text-[12px] text-muted">
                        {r.jumlahSiswa} siswa × {rp(r.tarif)} × {r.bulan} bln · periode {tglPendek(r.periodeMulai)} – {tglPendek(r.sampaiBaru)}
                      </span>
                      <span className="block text-[11.5px] text-muted">
                        {tglPendek(d)} {jam(d)}{r.dicatatOleh ? ` · oleh ${r.dicatatOleh}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block text-[14px] font-extrabold text-ink">{rp(r.nominal)}</b>
                      <button className="mt-1 block w-full text-right text-[12px] font-bold text-brand disabled:opacity-50" onClick={() => kuitansi(r)} disabled={!!unduh}>
                        {unduh === r.id ? 'Menyiapkan…' : '📄 Kuitansi'}
                      </button>
                      {terakhir.has(r.id) && (
                        <button className="mt-1 text-[12px] font-bold text-danger" onClick={() => setKonfirm(r)}>
                          Batalkan
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <Sheet buka={!!konfirm} tutup={() => setKonfirm(null)} judul="Batalkan perpanjangan?" lead={konfirm?.namaSekolah}>
        {konfirm && (
          <>
            <p className="mb-5 text-[13.5px] text-muted">
              Transaksi {rp(konfirm.nominal)} dihapus dari riwayat & grafik, dan jatuh tempo sekolah dikembalikan ke{' '}
              <b className="text-ink">
                {konfirm.sampaiLama ? tglPendek(konfirm.sampaiLama) : 'kondisi sebelum pernah sewa (masa uji coba)'}
              </b>
              .
            </p>
            <button className="w-full rounded-2xl bg-danger py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60" onClick={ya} disabled={sibuk}>
              {sibuk ? 'Membatalkan…' : 'Ya, batalkan'}
            </button>
            <div className="h-2.5" />
            <button className="bigbtn-ghost" onClick={() => setKonfirm(null)}>Tidak jadi</button>
          </>
        )}
      </Sheet>
    </>
  )
}