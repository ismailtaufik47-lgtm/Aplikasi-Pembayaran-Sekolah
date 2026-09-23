/**
 * Daftar semua sekolah: status, mulai periode, jatuh tempo, siswa aktif,
 * tarif, tagihan per bulan — plus tombol Perpanjang 1 bulan dan menu ⋯
 * (ubah tarif, nonaktifkan / aktifkan kembali).
 *
 * Urutan default: yang paling mendesak di atas (jatuh tempo paling dekat
 * / sudah lewat), sekolah yang sengaja dinonaktifkan admin di paling bawah.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Chip, Ikon, Kosong, PageHead } from '../components/ui.jsx'
import { rp } from '../lib/format.js'
import { labelStatus, teksSisa, tglPendek, useAdmin } from './storeAdmin.jsx'
import AksiSekolah from './AksiSekolah.jsx'

const FILTER = [
  { id: '', label: 'Semua' },
  { id: 'aktif', label: 'Aktif' },
  { id: 'trial', label: 'Uji coba' },
  { id: 'segera', label: 'Segera jatuh tempo' },
  { id: 'nonaktif', label: 'Tidak aktif' },
]

/** Cocokkan sekolah dengan filter. 'aktif' & 'trial' menurut status
 *  aslinya (termasuk yang segera jatuh tempo). */
const cocok = (s, f) =>
  !f ||
  (f === 'aktif' && s.kode === 'aktif') ||
  (f === 'trial' && s.kode === 'trial') ||
  (f === 'segera' && s.kategori === 'segera') ||
  (f === 'nonaktif' && s.kode === 'kadaluarsa')

export default function DaftarSekolah() {
  const { sekolah } = useAdmin()
  const [params, setParams] = useSearchParams()
  const filter = params.get('filter') || ''
  const [cari, setCari] = useState('')
  const [aksi, setAksi] = useState(null)

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return sekolah
      .filter((s) => cocok(s, filter))
      .filter((s) => !q || s.nama.toLowerCase().includes(q) || (s.kontak?.email || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const admA = a.alasan === 'admin' ? 1 : 0
        const admB = b.alasan === 'admin' ? 1 : 0
        return admA - admB || a.sisaHari - b.sisaHari
      })
  }, [sekolah, filter, cari])

  const jumlah = (f) => sekolah.filter((s) => cocok(s, f)).length
  const pilihFilter = (f) => setParams(f ? { filter: f } : {}, { replace: true })

  return (
    <>
      <div className="pb-1.5 pt-3.5 lg:hidden">
        <h1 className="text-xl font-extrabold">Sekolah</h1>
      </div>
      <PageHead judul="Sekolah" sub={`${sekolah.length} sekolah terdaftar · perpanjang langganan & atur status`} />

      <div className="mb-3 mt-2 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-soft lg:mt-4 lg:max-w-md">
        <span className="text-muted"><Ikon.cari size={18} /></span>
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama sekolah atau email…"
          className="flex-1 bg-transparent font-medium outline-none"
        />
      </div>

      <div className="noscroll mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTER.map((f) => (
          <button
            key={f.id}
            onClick={() => pilihFilter(f.id)}
            className={`whitespace-nowrap rounded-pill px-3.5 py-2 text-[13px] font-bold ${
              filter === f.id ? 'bg-brand text-white' : 'bg-white text-muted'
            }`}
          >
            {f.label} <span className="opacity-70">{jumlah(f.id)}</span>
          </button>
        ))}
      </div>

      {hasil.length === 0 ? (
        <div className="card"><Kosong>Tidak ada sekolah yang cocok.</Kosong></div>
      ) : (
        <>
          {/* ---------- mobile: kartu ---------- */}
          <div className="grid gap-3 lg:hidden">
            {hasil.map((s) => (
              <KartuSekolah key={s.id} s={s} setAksi={setAksi} />
            ))}
          </div>

          {/* ---------- desktop: tabel ---------- */}
          <div className="hidden overflow-x-auto rounded-card bg-white shadow-soft lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                  <th className="min-w-[170px] px-4 py-3">Sekolah</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="whitespace-nowrap px-3 py-3">Mulai periode</th>
                  <th className="px-3 py-3">Jatuh tempo</th>
                  <th className="px-3 py-3 text-right">Siswa</th>
                  <th className="px-3 py-3 text-right">Tarif</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">Tagihan / bln</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((s) => {
                  const st = labelStatus(s)
                  return (
                    <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-[#FAFBFF]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-ink">{s.nama}</div>
                        <div className="truncate text-xs text-muted">{s.kontak?.email || 'belum ada staf'}</div>
                      </td>
                      <td className="px-3 py-3"><Chip warna={st.warna}>{st.teks}</Chip></td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{tglPendek(s.aktifSejak)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="font-semibold text-ink">{tglPendek(s.jatuhTempo)}</div>
                        <div className={`text-xs ${s.sisaHari < 0 ? 'text-danger' : 'text-muted'}`}>{teksSisa(s)}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{s.jumlahSiswaAktif}</td>
                      <td className="px-3 py-3 text-right text-muted">
                        {rp(s.tarif)}
                        {s.tarifKhusus && <div className="text-[10.5px] font-bold text-grape">khusus</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-extrabold text-ink">{rp(s.tagihanBulanan)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="whitespace-nowrap rounded-xl bg-brand px-3 py-1.5 text-[12.5px] font-extrabold text-white active:scale-95"
                            onClick={() => setAksi({ jenis: 'perpanjang', s })}
                            title="Perpanjang 1 bulan"
                          >
                            Perpanjang
                          </button>
                          <button
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#F1F4F9]"
                            onClick={() => setAksi({ jenis: 'menu', s })}
                            aria-label={`Aksi lain untuk ${s.nama}`}
                          >
                            <Ikon.titikTiga size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AksiSekolah aksi={aksi} setAksi={setAksi} />
    </>
  )
}

function KartuSekolah({ s, setAksi }) {
  const st = labelStatus(s)
  const Info = ({ label, children }) => (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[13.5px] font-bold text-ink">{children}</div>
    </div>
  )
  return (
    <div className="card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="min-w-0">
          <b className="block truncate text-[15px] font-extrabold">{s.nama}</b>
          <span className="block truncate text-[12px] text-muted">{s.kontak?.email || 'belum ada staf'}</span>
        </span>
        <Chip warna={st.warna}>{st.teks}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Info label="Mulai periode">{tglPendek(s.aktifSejak)}</Info>
        <Info label="Jatuh tempo">
          {tglPendek(s.jatuhTempo)}
          <span className={`block text-[11.5px] font-semibold ${s.sisaHari < 0 ? 'text-danger' : 'text-muted'}`}>{teksSisa(s)}</span>
        </Info>
        <Info label="Siswa × tarif">
          {s.jumlahSiswaAktif} × {rp(s.tarif)}
          {s.tarifKhusus && <span className="ml-1 text-[10.5px] font-bold text-grape">khusus</span>}
        </Info>
        <Info label="Tagihan / bulan">{rp(s.tagihanBulanan)}</Info>
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          className="flex-1 rounded-2xl bg-brand py-2.5 text-[13.5px] font-extrabold text-white active:scale-[.98]"
          onClick={() => setAksi({ jenis: 'perpanjang', s })}
        >
          Perpanjang 1 bulan
        </button>
        <button
          className="grid w-11 place-items-center rounded-2xl border border-line bg-white text-muted"
          onClick={() => setAksi({ jenis: 'menu', s })}
          aria-label={`Aksi lain untuk ${s.nama}`}
        >
          <Ikon.titikTiga size={18} />
        </button>
      </div>
    </div>
  )
}
