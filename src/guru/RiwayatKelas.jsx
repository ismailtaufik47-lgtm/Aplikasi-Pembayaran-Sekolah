/**
 * Riwayat kelas siswa per tahun ajaran (0042) — dipakai di Kartu siswa.
 *
 *   KartuRiwayatKelas : daftar tahun ajaran → kelas → hasil akhir tahun
 *   SheetMasaTerdaftar: ubah kelas, bulan mulai & bulan terakhir ditagih (tahun berjalan)
 *   SheetKeluar       : keluar / pindah sekolah di tengah tahun
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pil, Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, namaBulanTa, taPendek, tahunAjaranBerjalan } from '../lib/format.js'

export const LABEL_AKHIR = {
  naik: 'Naik kelas',
  tinggal: 'Tinggal kelas',
  lulus: 'Lulus',
  tidak_lanjut: 'Tidak melanjutkan',
  keluar: 'Keluar',
  pindah: 'Pindah sekolah',
}

/** Keterangan masa terdaftar satu baris: "Juli – Juni", "sejak Oktober", "Juli – Maret (pindah)". */
export function teksMasa(k) {
  const awal = k.mulai > 0 ? `masuk ${namaBulanTa(k.ta, k.mulai)}` : ''
  const akhir = k.selesai != null && k.selesai < 11 ? `s/d ${namaBulanTa(k.ta, k.selesai)}` : ''
  return [awal, akhir].filter(Boolean).join(' · ')
}

export function KartuRiwayatKelas({ s, bisaUbah, onAtur, onKeluar }) {
  const ta = tahunAjaranBerjalan()
  const baris = [...(s.keanggotaan || [])].sort((a, b) => (a.ta < b.ta ? 1 : -1)) // terbaru di atas
  if (!baris.length) return null
  return (
    <div className="card mt-4 !pb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="judul-kartu text-[16px]">Riwayat kelas</div>
        {bisaUbah && s.terdaftar && (
          <button type="button" onClick={onAtur} className="rounded-pill bg-brand-soft px-3 py-1.5 text-[12px] font-extrabold text-brand active:scale-95">
            Atur masa terdaftar
          </button>
        )}
      </div>
      <ol className="relative">
        {baris.map((k, i) => {
          const kini = k.ta === ta
          const depan = k.ta > ta
          const ket = [
            depan ? 'Rencana tahun depan' : kini ? 'Tahun ini' : null,
            teksMasa(k) || null,
            k.akhir ? LABEL_AKHIR[k.akhir] : !kini && !depan ? 'Dibawa otomatis' : null,
          ].filter(Boolean).join(' · ')
          return (
            <li key={k.ta} className="relative flex gap-3 pb-2.5 last:pb-0">
              {i < baris.length - 1 && <span aria-hidden="true" className="absolute left-[21px] top-[40px] h-[calc(100%-36px)] w-[2px] rounded bg-line" />}
              <span className={`permen permen-kecil grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[14px] text-center font-display text-[11.5px] font-bold leading-[1.05] ${
                depan ? 'permen-abu' : kini ? 'permen-biru' : k.akhir === 'tinggal' ? 'permen-kuning' : 'permen-tosca'}`}>
                {taPendek(k.ta).replace('/', '/​')}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <b className="block text-[14px] font-extrabold">Kelas {k.kelas}</b>
                <span className="block text-[12px] font-semibold leading-snug text-muted">{ket || 'Juli – Juni'}</span>
                {k.catatan && <span className="block text-[11.5px] font-semibold italic text-muted">“{k.catatan}”</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {bisaUbah && s.terdaftar && (
        <button type="button" onClick={onKeluar} className="mt-3 w-full rounded-[14px] border-[1.5px] border-dashed border-line py-2.5 text-[12.5px] font-extrabold text-muted active:scale-[.99]">
          Siswa keluar / pindah sekolah
        </button>
      )}
    </div>
  )
}

const PilihBulan = ({ ta, nilai, ubah, dari = 0, sampai = 11, label, kosong }) => (
  <select className="field-input" value={nilai ?? ''} onChange={(e) => ubah(e.target.value === '' ? null : Number(e.target.value))} aria-label={label}>
    {kosong && <option value="">{kosong}</option>}
    {BULAN.map((_, i) => i >= dari && i <= sampai && <option key={i} value={i}>{namaBulanTa(ta, i)}</option>)}
  </select>
)

export function SheetMasaTerdaftar({ buka, tutup, s }) {
  const { aturKeanggotaan, toast, pengaturan } = useData()
  const ta = tahunAjaranBerjalan()
  const [kelas, setKelas] = useState('')
  const [mulai, setMulai] = useState(0)
  const [selesai, setSelesai] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => {
    if (!buka || !s) return
    setKelas(s.terdaftar?.kelas || s.kelas)
    setMulai(s.terdaftar?.mulai || 0)
    setSelesai(s.terdaftar?.selesai ?? null)
  }, [buka, s])
  if (!s) return null
  const tarif = pengaturan.tarifSpp?.[ta]
  const khusus = tarif?.kelas?.[kelas.trim()]

  const simpan = async () => {
    if (!kelas.trim()) return toast('Isi nama kelas dulu')
    setSibuk(true)
    try {
      await aturKeanggotaan(s.id, { kelas: kelas.trim(), mulai, selesai: selesai != null && selesai < 11 ? selesai : null })
      toast('Masa terdaftar disimpan')
      tutup()
    } catch {
      /* pesan sudah ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Masa terdaftar" lead={`${s.nama} · tahun ajaran ${ta}`}>
      <label className="mb-1.5 block text-[13px] font-bold">Kelas tahun ini</label>
      <input className="field-input mb-1.5" value={kelas} onChange={(e) => setKelas(e.target.value)} placeholder="contoh: A1" />
      <p className="mb-3.5 text-xs font-semibold text-muted">
        {khusus != null ? `SPP kelas ini Rp ${Number(khusus).toLocaleString('id-ID')} (tarif khusus).` : 'SPP mengikuti tarif kelasnya di Jenis biaya › SPP.'}
      </p>
      <div className="mb-1.5 grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1.5 block text-[13px] font-bold">Mulai ditagih</label>
          <PilihBulan ta={ta} nilai={mulai} ubah={(v) => setMulai(v ?? 0)} label="Bulan mulai" />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-bold">Sampai</label>
          <PilihBulan ta={ta} nilai={selesai ?? 11} ubah={setSelesai} dari={mulai} label="Bulan terakhir" />
        </div>
      </div>
      <p className="mb-5 text-xs font-semibold leading-snug text-muted">
        SPP & kegiatan hanya ditagih di bulan-bulan ini. Siswa pindahan yang masuk di tengah tahun: pilih bulan masuknya.
      </p>
      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  )
}

export function SheetKeluar({ buka, tutup, s }) {
  const { keluarkanSiswa, toast } = useData()
  const nav = useNavigate()
  const ta = tahunAjaranBerjalan()
  const [alasan, setAlasan] = useState('pindah')
  const [akhir, setAkhir] = useState(bulanBerjalan())
  const [catatan, setCatatan] = useState('')
  const [yakin, setYakin] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => {
    if (!buka || !s) return
    setAlasan('pindah')
    setAkhir(Math.max(s.terdaftar?.mulai || 0, bulanBerjalan()))
    setCatatan('')
    setYakin(false)
  }, [buka, s])
  if (!s) return null
  const mulai = s.terdaftar?.mulai || 0

  const simpan = async () => {
    setSibuk(true)
    try {
      await keluarkanSiswa(s.id, { bulanTerakhir: akhir, alasan, catatan })
      toast(`${s.panggilan || s.nama} ${alasan === 'pindah' ? 'pindah sekolah' : 'keluar'} — riwayat pembayaran tetap tersimpan`)
      tutup()
      nav('/guru/siswa')
    } catch {
      /* pesan sudah ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Keluar / pindah sekolah" lead={s.nama}>
      <div className="mb-3.5 flex gap-2">
        <Pil on={alasan === 'pindah'} onClick={() => setAlasan('pindah')}>Pindah sekolah</Pil>
        <Pil on={alasan === 'keluar'} onClick={() => setAlasan('keluar')}>Keluar</Pil>
      </div>
      <label className="mb-1.5 block text-[13px] font-bold">Bulan terakhir ditagih SPP</label>
      <PilihBulan ta={ta} nilai={akhir} ubah={(v) => setAkhir(v ?? mulai)} dari={mulai} label="Bulan terakhir ditagih" />
      <p className="mb-3.5 mt-1.5 text-xs font-semibold leading-snug text-muted">
        Tagihan SPP & kegiatan sesudah {namaBulanTa(ta, akhir)} tidak ditagih lagi. Tunggakan sampai bulan itu tetap tercatat.
      </p>
      <label className="mb-1.5 block text-[13px] font-bold">Catatan <span className="font-semibold text-muted">(opsional)</span></label>
      <input className="field-input mb-4" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh: ikut orang tua pindah ke Surabaya" />
      <label className="mb-4 flex items-start gap-2.5 rounded-2xl bg-warn-soft p-3.5 text-[12.5px] font-semibold leading-snug text-warn-deep">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#F5A524]" checked={yakin} onChange={(e) => setYakin(e.target.checked)} />
        <span>
          {s.panggilan || s.nama} tidak tampil lagi di daftar siswa aktif & tagihan. Riwayat pembayaran dan kuitansinya tetap tersimpan.
        </span>
      </label>
      <button className="bigbtn-tutup disabled:opacity-50" onClick={simpan} disabled={!yakin || sibuk}>
        {sibuk ? 'Menyimpan…' : alasan === 'pindah' ? 'Catat pindah sekolah' : 'Catat keluar'}
      </button>
    </Sheet>
  )
}
