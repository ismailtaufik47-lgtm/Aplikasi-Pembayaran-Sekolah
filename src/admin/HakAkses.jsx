/**
 * Hak akses per sekolah — diatur admin aplikasi (panel admin → sekolah → ⋯ → Hak akses).
 *
 * Tiap sekolah punya dua peran: Kepala sekolah & Admin/TU. Untuk tiap
 * fitur dipilih tingkatnya: Tidak · Lihat · Kelola. Ada susunan siap pakai
 * (preset) supaya tidak perlu mengisi satu per satu.
 *
 * Aturan pengaman (sama persis dengan admin_atur_hak_akses() di database):
 *   • Kepala sekolah selalu bisa mengelola profil sekolah, kode aktivasi & langganan.
 *   • Minimal satu peran bisa mencatat pembayaran, mengelola siswa,
 *     dan mengatur jenis biaya — supaya sekolah tidak "terkunci".
 */
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../components/ui.jsx'
import { FITUR, PERAN, PRESET, STANDAR, TINGKAT, lengkapiAkses, periksaAkses } from '../lib/akses.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import { useAdmin } from './storeAdmin.jsx'
import * as api from './apiAdmin.js'

const sama = (a, b) => FITUR.every((f) => a.kepala[f.id] === b.kepala[f.id] && a.admin[f.id] === b.admin[f.id])
const hasilPreset = (nilai) => ({
  kepala: lengkapiAkses('kepala', { ...STANDAR.kepala, ...(nilai?.kepala || {}) }),
  admin: lengkapiAkses('admin', { ...STANDAR.admin, ...(nilai?.admin || {}) }),
})

export function SheetHakAkses({ s, tutup }) {
  const { aturHakAkses, sibuk } = useAdmin()
  const [awal, setAwal] = useState(null) // { akses, standar }
  const [galat, setGalat] = useState('')

  useEffect(() => {
    if (!s) return
    setAwal(null)
    setGalat('')
    api.hakAkses(s.id)
      .then((d) => setAwal({ akses: hasilPreset(d.akses), standar: !!d.standar }))
      .catch((e) => setGalat(e.message))
  }, [s])

  if (!s) return null

  const simpan = async (hak) => {
    try {
      await aturHakAkses(s, hak)
      tutup()
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }

  return (
    <Sheet buka tutup={tutup} judul="Hak akses" lead={s.nama}>
      {galat ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] font-semibold text-danger">
          {/could not find the function|schema cache/i.test(galat)
            ? 'Fitur hak akses belum aktif di database. Jalankan 0029_hak_akses_pembatalan.sql di Supabase SQL Editor.'
            : galat}
        </p>
      ) : !awal ? (
        <p className="py-8 text-center text-[13.5px] font-semibold text-muted">Memuat hak akses…</p>
      ) : (
        <EditorHakAkses awal={awal.akses} sibuk={sibuk} onSimpan={simpan} onBatal={tutup} />
      )}
    </Sheet>
  )
}

/** Editor murni (tanpa panggilan server) — dipakai sheet di atas. */
export function EditorHakAkses({ awal, sibuk, onSimpan, onBatal }) {
  const [nilai, setNilai] = useState(awal)
  useEffect(() => setNilai(awal), [awal])

  const preset = useMemo(() => PRESET.find((p) => sama(hasilPreset(p.nilai), nilai))?.id || 'kustom', [nilai])
  const salah = periksaAkses(nilai)
  const berubah = !sama(nilai, awal)

  const ubah = (peran, fitur, t) =>
    setNilai((n) => ({ ...n, [peran]: lengkapiAkses(peran, { ...n[peran], [fitur]: t }) }))

  return (
    <>
      {/* preset */}
      <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">Pilih susunan</div>
      <div className="mb-4 grid gap-2">
        {PRESET.map((p) => {
          const on = preset === p.id
          return (
            <button
              key={p.id}
              onClick={() => setNilai(hasilPreset(p.nilai))}
              className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left ${on ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}
            >
              <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand' : 'border-[#C9D0DC]'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-brand" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-[14px] font-extrabold ${on ? 'text-brand' : ''}`}>{p.label}</span>
                <span className="block text-[12px] font-semibold leading-snug text-muted">{p.ket}</span>
              </span>
            </button>
          )
        })}
        {preset === 'kustom' && (
          <div className="rounded-2xl border border-grape bg-grape-soft px-3.5 py-2.5 text-[12.5px] font-bold text-grape">
            ✏️ Kustom — diatur per fitur di bawah
          </div>
        )}
      </div>

      {/* matriks */}
      <div className="mb-1.5 flex items-end justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Atur per fitur</span>
      </div>
      <div className="card !p-0">
        <div className="grid grid-cols-2 gap-2 border-b border-line px-3.5 py-2 text-[11.5px] font-extrabold uppercase tracking-wide text-muted">
          <span className="pl-0.5">👩‍💼 {PERAN.kepala.pendek}</span>
          <span className="pl-0.5">🧑‍💻 {PERAN.admin.pendek}</span>
        </div>
        {FITUR.map((f) => (
          <div key={f.id} className="border-b border-line px-3.5 py-3 last:border-0">
            <div className="mb-2 flex items-start gap-2">
              <span className="text-[16px] leading-5" style={FONT_EMOJI}>{f.emoji}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-extrabold leading-5">{f.label}</span>
                <span className="block text-[11.5px] font-semibold leading-snug text-muted">{f.ket}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['kepala', 'admin'].map((peran) => (
                <Segmen
                  key={peran}
                  pilihan={f.pilihan}
                  nilai={nilai[peran][f.id]}
                  kunci={peran === 'kepala' && f.id === 'sekolah'}
                  onPilih={(t) => ubah(peran, f.id, t)}
                  label={`${f.label} untuk ${PERAN[peran].label}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 px-1 text-[11.5px] font-semibold leading-relaxed text-muted">
        <b className="text-ink">Lihat</b> = bisa membuka & mengunduh, tidak bisa mengubah.{' '}
        <b className="text-ink">Kelola</b> = bisa menambah & mengubah. Profil sekolah untuk kepala sekolah selalu Kelola 🔒.
        Berlaku saat akun sekolah membuka ulang aplikasi.
      </p>

      {salah.length > 0 && (
        <div className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-bold text-danger">
          {salah.map((t) => <div key={t}>⚠️ {t}</div>)}
        </div>
      )}

      <div className="sticky bottom-0 -mx-[18px] mt-4 bg-canvas px-[18px] pb-1 pt-2 lg:-mx-6 lg:px-6">
        <button
          className="bigbtn disabled:opacity-50"
          disabled={sibuk || salah.length > 0 || !berubah}
          onClick={() => onSimpan(preset === 'standar' ? null : nilai)}
        >
          {sibuk ? 'Menyimpan…' : berubah ? 'Simpan hak akses' : 'Belum ada perubahan'}
        </button>
        <div className="h-2" />
        <button className="bigbtn-ghost" onClick={onBatal} disabled={sibuk}>Batal</button>
      </div>
    </>
  )
}

const WARNA = {
  tidak: 'bg-[#6B7385] text-white',
  lihat: 'bg-brand text-white',
  kelola: 'bg-ok text-white',
}

function Segmen({ pilihan, nilai, onPilih, kunci, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-[#EEF1F6] p-[3px] dark:bg-isi">
      {pilihan.map((t) => {
        const on = nilai === t
        return (
          <button
            key={t}
            role="radio"
            aria-checked={on}
            disabled={kunci}
            onClick={() => onPilih(t)}
            style={on ? { colorScheme: 'light' } : undefined}
            className={`flex-1 rounded-[9px] py-1.5 text-[11.5px] font-extrabold transition ${
              on ? WARNA[t] : 'text-muted'
            } ${kunci && !on ? 'opacity-40' : ''}`}
          >
            {kunci && on ? '🔒 ' : ''}{TINGKAT[t].label}
          </button>
        )
      })}
    </div>
  )
}
