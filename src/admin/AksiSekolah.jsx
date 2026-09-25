/**
 * Lembar aksi untuk satu sekolah — dipakai halaman Ringkasan & Sekolah.
 *
 *   aksi = { jenis: 'perpanjang' | 'menu' | 'nonaktif' | 'tarif', s } | null
 *
 * Setiap aksi yang mengubah data selalu lewat konfirmasi dulu (nominal,
 * tanggal lama → baru), supaya tidak ada perpanjangan karena salah klik.
 */
import { useEffect, useState } from 'react'
import { Chip, Sheet } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { rp } from '../lib/format.js'
import { AI_BATAS_DEFAULT, HARGA_PER_SISWA_DEFAULT } from '../lib/langganan.js'
import { labelStatus, perkiraanPerpanjang, tglPendek, useAdmin } from './storeAdmin.jsx'
import * as api from './apiAdmin.js'

export default function AksiSekolah({ aksi, setAksi }) {
  const tutup = () => setAksi(null)
  const s = aksi?.s
  return (
    <>
      <SheetPerpanjang s={aksi?.jenis === 'perpanjang' ? s : null} tutup={tutup} />
      <SheetMenu s={aksi?.jenis === 'menu' ? s : null} tutup={tutup} buka={(jenis) => setAksi({ jenis, s })} />
      <SheetNonaktif s={aksi?.jenis === 'nonaktif' ? s : null} tutup={tutup} />
      <SheetTarif s={aksi?.jenis === 'tarif' ? s : null} tutup={tutup} />
      <SheetKuotaAI s={aksi?.jenis === 'kuota' ? s : null} tutup={tutup} />
    </>
  )
}

/* ---------- baris info kecil ---------- */
const Baris = ({ label, children, tebal }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
    <span className="font-semibold text-muted">{label}</span>
    <span className={`text-right ${tebal ? 'font-extrabold text-ink' : 'font-bold text-ink'}`}>{children}</span>
  </div>
)

/* ---------- perpanjang 1 bulan ---------- */
function SheetPerpanjang({ s, tutup }) {
  const { perpanjang, sibuk } = useAdmin()
  if (!s) return null
  const p = perkiraanPerpanjang(s, 1)
  const st = labelStatus(s)

  const ya = async () => {
    try {
      await perpanjang(s, 1)
      tutup()
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }

  return (
    <Sheet buka tutup={tutup} judul="Perpanjang 1 bulan" lead={s.nama}>
      <div className="card mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Tagihan</span>
          <Chip warna={st.warna}>{st.teks}</Chip>
        </div>
        <Baris label="Siswa aktif">{s.jumlahSiswaAktif} siswa</Baris>
        <Baris label={`Tarif per siswa${s.tarifKhusus ? ' (khusus)' : ''}`}>{rp(s.tarif)} / bln</Baris>
        <div className="my-2 border-t border-line" />
        <Baris label="Nominal dicatat" tebal>
          <span className="text-[18px]">{rp(p.nominal)}</span>
        </Baris>
      </div>

      <div className="card mb-3">
        <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Masa aktif</span>
        <Baris label="Jatuh tempo sekarang">{tglPendek(s.jatuhTempo)}</Baris>
        <Baris label="Jatuh tempo baru" tebal>
          <span className="text-ok-deep">{tglPendek(p.sampai)}</span>
        </Baris>
        <p className="mt-1 text-[12px] font-semibold text-muted">
          {s.sisaHari >= 0
            ? `Disambung dari masa aktif sekarang, jadi sisa ${s.kode === 'trial' ? 'uji coba' : 'sewa'} tidak hangus. Periode baru mulai ${tglPendek(p.mulai)}.`
            : `Masa aktif sudah lewat, jadi periode baru mulai hari ini (${tglPendek(p.mulai)}).`}
        </p>
      </div>

      {s.jumlahSiswaAktif === 0 && (
        <p className="mb-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn-deep">
          Sekolah ini belum punya siswa aktif, jadi nominal yang tercatat Rp0.
        </p>
      )}
      {s.alasan === 'admin' && (
        <p className="mb-3 rounded-xl bg-[#F1F2F6] px-3.5 py-2.5 text-[12.5px] font-semibold text-muted">
          Sekolah ini masih <b className="text-ink">dinonaktifkan admin</b>. Perpanjangan tidak otomatis
          mengaktifkannya — aktifkan kembali lewat menu ⋯ kalau sudah beres.
        </p>
      )}

      <button className="bigbtn disabled:opacity-60" onClick={ya} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : `Ya, perpanjang · ${rp(p.nominal)}`}
      </button>
      <div className="h-2.5" />
      <button className="bigbtn-ghost" onClick={tutup}>Batal</button>
    </Sheet>
  )
}

/* ---------- menu ⋯ ---------- */
function SheetMenu({ s, tutup, buka }) {
  const { unduhDokumen } = useAdmin()
  const [sibuk, setSibuk] = useState(false)
  if (!s) return null
  const kuota = s.aiBatasHarian == null ? `${AI_BATAS_DEFAULT}/hari (default)` : s.aiBatasHarian === 0 ? 'dimatikan' : `${s.aiBatasHarian}/hari`

  // Invoice sewa bulan berikutnya — periode dihitung sama seperti tombol Perpanjang.
  const invoice = () =>
    unduhDokumen(async () => {
      setSibuk(true)
      try {
        const [penerbit, { unduhInvoiceSewa }] = await Promise.all([api.dataPenerbit(), import('../lib/dokumen.js')])
        const p = perkiraanPerpanjang(s, 1)
        unduhInvoiceSewa({
          penerbit,
          sekolah: { id: s.id, nama: s.nama, alamat: s.alamat, kepalaSekolah: s.kepalaSekolah },
          jumlahSiswa: s.jumlahSiswaAktif, tarif: s.tarif, bulan: 1,
          periodeMulai: p.mulai, periodeSampai: p.sampai,
          jatuhTempo: s.sisaHari >= 0 && s.jatuhTempo ? s.jatuhTempo : p.mulai,
        })
      } finally {
        setSibuk(false)
      }
    })

  return (
    <Sheet buka tutup={tutup} judul={s.nama} lead={s.kontak ? `${s.kontak.nama} · ${s.kontak.email}` : 'Belum ada kontak staf'}>
      <button className="bigbtn mb-2.5 disabled:opacity-60" onClick={invoice} disabled={sibuk}>
        {sibuk ? 'Menyiapkan invoice…' : `🧾 Unduh invoice · ${rp(s.tagihanBulanan)}`}
      </button>
      <button className="bigbtn-ghost mb-2.5" onClick={() => buka('tarif')}>
        Ubah tarif per siswa
      </button>
      <button className="bigbtn-ghost mb-2.5" onClick={() => buka('kuota')}>
        🤖 Kuota Tanya AI · {kuota}
      </button>
      {s.dinonaktifkanAdmin ? (
        <button className="w-full rounded-2xl bg-ok-soft py-3.5 text-[15px] font-extrabold text-ok-deep" onClick={() => buka('nonaktif')}>
          Aktifkan kembali
        </button>
      ) : (
        <button className="w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger" onClick={() => buka('nonaktif')}>
          Nonaktifkan sekolah
        </button>
      )}
    </Sheet>
  )
}

/* ---------- nonaktifkan / aktifkan kembali ---------- */
function SheetNonaktif({ s, tutup }) {
  const { setNonaktif, sibuk } = useAdmin()
  if (!s) return null
  const aktifkan = s.dinonaktifkanAdmin

  const ya = async () => {
    try {
      await setNonaktif(s, !aktifkan)
      tutup()
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }

  return (
    <Sheet buka tutup={tutup} judul={aktifkan ? 'Aktifkan kembali?' : 'Nonaktifkan sekolah?'} lead={s.nama}>
      {aktifkan ? (
        <p className="mb-5 text-[13.5px] text-muted">
          Status sekolah kembali mengikuti tanggal jatuh tempo ({tglPendek(s.jatuhTempo)}). Kalau tanggal itu
          sudah lewat, sekolah tetap terkunci sampai diperpanjang.
        </p>
      ) : (
        <ul className="mb-5 grid gap-2 text-[13.5px] text-muted">
          <li>• Tambah siswa & catat pembayaran langsung dikunci, walau jatuh tempo masih {tglPendek(s.jatuhTempo)}.</li>
          <li>• Guru tetap bisa masuk dan melihat semua data — tidak ada yang dihapus.</li>
          <li>• Portal orang tua tetap bisa dibuka.</li>
          <li>• Bisa diaktifkan kembali kapan saja dari menu ini.</li>
        </ul>
      )}
      <button
        className={`w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60 ${aktifkan ? 'bg-ok' : 'bg-danger'}`}
        onClick={ya}
        disabled={sibuk}
      >
        {sibuk ? 'Menyimpan…' : aktifkan ? 'Ya, aktifkan kembali' : 'Ya, nonaktifkan'}
      </button>
      <div className="h-2.5" />
      <button className="bigbtn-ghost" onClick={tutup}>Batal</button>
    </Sheet>
  )
}

/* ---------- kuota Tanya AI per sekolah ---------- */
function SheetKuotaAI({ s, tutup }) {
  const { ubahKuotaAI, sibuk } = useAdmin()
  const [batas, setBatas] = useState('')

  useEffect(() => {
    if (s) setBatas(s.aiBatasHarian == null ? '' : String(s.aiBatasHarian))
  }, [s])

  if (!s) return null
  const simpan = async (nilai) => {
    try {
      await ubahKuotaAI(s, nilai)
      tutup()
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }
  const angka = batas === '' ? null : Math.max(0, Math.min(500, Number(batas) || 0))

  return (
    <Sheet buka tutup={tutup} judul="Kuota Tanya AI" lead={`${s.nama} · terpakai hari ini ${s.aiTerpakaiHariIni || 0} pertanyaan`}>
      <label className="mb-1.5 block text-[12.5px] font-bold text-muted">
        Pertanyaan per hari (kosongkan = default {AI_BATAS_DEFAULT}, isi 0 = matikan)
      </label>
      <input
        className="field-input mb-3"
        inputMode="numeric"
        value={batas}
        onChange={(e) => setBatas(e.target.value.replace(/\D/g, '').slice(0, 3))}
        placeholder={String(AI_BATAS_DEFAULT)}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[10, 30, 50, 100].map((n) => (
          <button key={n} onClick={() => setBatas(String(n))} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold">
            {n}/hari
          </button>
        ))}
      </div>
      <p className="mb-4 rounded-xl bg-[#F5F6FA] px-3.5 py-2.5 text-[12.5px] font-semibold text-muted">
        Kuota dihitung per sekolah (kepala sekolah + admin sekolah digabung), direset setiap tengah malam WIB.
        Setiap pertanyaan memakai saldo API AI Anda.
      </p>
      <button className="bigbtn disabled:opacity-60" onClick={() => simpan(angka)} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : angka === 0 ? 'Matikan Tanya AI' : `Simpan · ${angka ?? AI_BATAS_DEFAULT}/hari`}
      </button>
    </Sheet>
  )
}

/* ---------- tarif khusus per siswa ---------- */
function SheetTarif({ s, tutup }) {
  const { ubahTarif, sibuk } = useAdmin()
  const [harga, setHarga] = useState('')

  useEffect(() => {
    if (s) setHarga(s.tarifKhusus ? s.hargaPerSiswa : '')
  }, [s])

  if (!s) return null
  const tarifBaru = Number(harga) > 0 ? Number(harga) : HARGA_PER_SISWA_DEFAULT

  const simpan = async (nilai) => {
    try {
      await ubahTarif(s, nilai)
      tutup()
    } catch {
      /* toast galat sudah ditampilkan store */
    }
  }

  return (
    <Sheet buka tutup={tutup} judul="Tarif per siswa" lead={`${s.nama} · default aplikasi ${rp(HARGA_PER_SISWA_DEFAULT)}/siswa/bulan`}>
      <label className="mb-1.5 block text-[12.5px] font-bold text-muted">Tarif khusus (kosongkan untuk pakai default)</label>
      <InputNominal value={harga} onChange={setHarga} placeholder={String(HARGA_PER_SISWA_DEFAULT)} className="mb-3" />
      <div className="card mb-4">
        <Baris label="Siswa aktif">{s.jumlahSiswaAktif} siswa</Baris>
        <Baris label="Tagihan per bulan" tebal>{rp(s.jumlahSiswaAktif * tarifBaru)}</Baris>
      </div>
      <button className="bigbtn disabled:opacity-60" onClick={() => simpan(Number(harga) > 0 ? Number(harga) : null)} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : 'Simpan tarif'}
      </button>
      {s.tarifKhusus && (
        <>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={() => simpan(null)} disabled={sibuk}>
            Kembalikan ke tarif default
          </button>
        </>
      )}
    </Sheet>
  )
}