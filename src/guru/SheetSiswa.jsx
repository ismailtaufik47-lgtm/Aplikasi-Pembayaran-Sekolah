/**
 * Form tambah / ubah siswa.
 *
 * Dipakai dari daftar siswa (tambah baru) dan dari kartu siswa (ubah).
 * Kolom yang wajib hanya nama, kelas, dan NIS — sisanya boleh menyusul,
 * supaya guru bisa memasukkan satu kelas dengan cepat lalu melengkapi
 * data orang tua belakangan.
 */
import { useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import PilihAvatar from '../components/PilihAvatar.jsx'
import { Ikon, Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'

const kosong = {
  nama: '',
  panggilan: '',
  jenis_kelamin: 'P',
  kelas: '',
  nis: '',
  wali: '',
  hp: '',
  guru: '',
  avatar: 0,
}

export default function SheetSiswa({ buka, tutup, siswaId = null, onSimpan }) {
  const { siswa, petugas, tambahSiswa, ubahSiswa, hapusSiswa, toast } = useData()
  const [form, setForm] = useState(kosong)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [konfirmasi, setKonfirmasi] = useState(false)

  const sedangUbah = !!siswaId
  const kelasAda = useMemo(() => [...new Set(siswa.map((s) => s.kelas))].sort(), [siswa])

  useEffect(() => {
    if (!buka) return
    setGalat('')
    setKonfirmasi(false)
    const s = siswa.find((x) => x.id === siswaId)
    setForm(
      s
        ? {
            nama: s.nama,
            panggilan: s.panggilan || '',
            jenis_kelamin: s.jenis,
            kelas: s.kelas,
            nis: s.nis,
            wali: s.wali,
            hp: s.hp,
            guru: s.guru,
            avatar: Number.isInteger(s.avatar) ? s.avatar : 0,
          }
        : { ...kosong, guru: petugas || '', kelas: kelasAda[0] || '', nis: usulNis(siswa) }
    )
  }, [buka, siswaId])

  const isi = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const simpan = async () => {
    if (!form.nama.trim()) return setGalat('Nama siswa belum diisi')
    if (!form.kelas.trim()) return setGalat('Kelas belum diisi')
    if (!form.nis.trim()) return setGalat('NIS belum diisi')

    setSibuk(true)
    setGalat('')
    try {
      const bersih = { ...form, nama: form.nama.trim(), kelas: form.kelas.trim(), nis: form.nis.trim() }
      if (sedangUbah) {
        await ubahSiswa(siswaId, bersih)
        toast('Data ' + bersih.nama + ' diperbarui')
      } else {
        await tambahSiswa(bersih)
        toast(bersih.nama + ' ditambahkan ke kelas ' + bersih.kelas)
      }
      tutup()
      onSimpan?.()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  const hapus = async () => {
    try {
      await hapusSiswa(siswaId)
      toast('Siswa dipindahkan ke daftar tidak aktif')
      tutup()
      onSimpan?.('hapus')
    } catch {
      /* pesan sudah ditampilkan store */
    }
  }

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul={sedangUbah ? 'Ubah data siswa' : 'Tambah siswa baru'}
      lead={sedangUbah ? 'Perubahan langsung berlaku di semua halaman.' : 'Isi nama, kelas, dan NIS. Data orang tua bisa menyusul.'}
    >
      {/* jenis kelamin */}
      <label className="mb-1.5 block text-[13px] font-bold">Jenis kelamin</label>
      <div className="mb-4 flex gap-2.5">
        {[
          ['L', 'Laki-laki', 'bg-brand-soft border-brand text-brand'],
          ['P', 'Perempuan', 'bg-rose-soft border-rose text-rose'],
        ].map(([kode, label, aktifKelas]) => (
          <button
            key={kode}
            type="button"
            onClick={() => setForm((f) => ({ ...f, jenis_kelamin: kode }))}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[14px] border py-3 text-[13.5px] font-bold transition ${
              form.jenis_kelamin === kode ? aktifKelas : 'border-line bg-white text-muted'
            }`}
          >
            <Avatar nama="" jenis={kode} avatar={0} size={24} />
            {label}
          </button>
        ))}
      </div>

      {/* avatar */}
      <label className="mb-2 block text-[13px] font-bold">Pilih avatar</label>
      <div className="mb-4">
        <PilihAvatar
          jenis={form.jenis_kelamin}
          nilai={form.avatar}
          ubah={(i) => setForm((f) => ({ ...f, avatar: i }))}
          nama={form.nama}
        />
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">Nama siswa</label>
      <input className="field-input mb-3.5" placeholder="contoh: Aisyah Nur Fadilah" value={form.nama} onChange={isi('nama')} />

      <div className="mb-3.5 flex gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-bold">Nama panggilan</label>
          <input className="field-input" placeholder="opsional" value={form.panggilan} onChange={isi('panggilan')} />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-bold">NIS</label>
          <input className="field-input" placeholder="2026-001" value={form.nis} onChange={isi('nis')} />
        </div>
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">Kelas</label>
      <input className="field-input" placeholder="contoh: A1" value={form.kelas} onChange={isi('kelas')} />
      {kelasAda.length > 0 && (
        <div className="mb-3.5 mt-2 flex flex-wrap gap-2">
          {kelasAda.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForm((f) => ({ ...f, kelas: k }))}
              className={`rounded-pill px-3 py-1.5 text-xs font-bold ${
                form.kelas === k ? 'bg-brand text-white' : 'bg-white text-muted shadow-soft'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3.5 mt-3.5 flex gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-bold">Nama orang tua</label>
          <input className="field-input" placeholder="opsional" value={form.wali} onChange={isi('wali')} />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-bold">No. HP orang tua</label>
          <input className="field-input" placeholder="opsional" inputMode="tel" value={form.hp} onChange={isi('hp')} />
        </div>
      </div>

      <label className="mb-1.5 block text-[13px] font-bold">Guru kelas</label>
      <input className="field-input mb-4" placeholder="opsional" value={form.guru} onChange={isi('guru')} />

      {galat && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">
          <Ikon.peringatan size={16} />
          {galat}
        </p>
      )}

      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : sedangUbah ? 'Simpan perubahan' : 'Tambahkan siswa'}
      </button>

      {sedangUbah && (
        <>
          <div className="h-2.5" />
          {konfirmasi ? (
            <div className="rounded-2xl bg-danger-soft p-3.5">
              <p className="mb-3 text-[13px] font-semibold text-danger">
                Siswa dipindahkan ke daftar tidak aktif. Riwayat pembayarannya tetap tersimpan.
              </p>
              <div className="flex gap-2.5">
                <button className="flex-1 rounded-xl bg-white py-2.5 text-[13px] font-extrabold" onClick={() => setKonfirmasi(false)}>
                  Batal
                </button>
                <button className="flex-1 rounded-xl bg-danger py-2.5 text-[13px] font-extrabold text-white" onClick={hapus}>
                  Ya, keluarkan
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full rounded-2xl bg-white py-3.5 text-[15px] font-extrabold text-danger shadow-soft"
              onClick={() => setKonfirmasi(true)}
            >
              Keluarkan siswa
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}

/** Usulkan NIS berikutnya dari pola yang sudah dipakai sekolah. */
function usulNis(siswa) {
  const tahun = new Date().getFullYear()
  const nomor = siswa
    .map((s) => Number(String(s.nis).split('-').pop()))
    .filter((n) => !Number.isNaN(n))
  const berikut = (nomor.length ? Math.max(...nomor) : 0) + 1
  return `${tahun}-${String(berikut).padStart(3, '0')}`
}
