// Lembar tulis: catatan anak (1 anak, maks. 1 foto) & kabar kelas (semua ortu, maks. 3 foto).
// Foto opsional; kalau sekolah mematikan foto, bagian foto tidak ditampilkan.
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/ui.jsx'
import Avatar from '../components/Avatar.jsx'
import { IkonT, Foto } from '../tumbuh/bagian.jsx'
import * as t from '../tumbuh/api.js'
import { namaKelas } from '../tumbuh/skala.js'

const KATA_CEPAT = ['Berani tampil', 'Mandiri', 'Suka menolong', 'Mau berbagi', 'Fokus', 'Kreatif']

/**
 * awal: { jenis: 'catatan'|'kabar', id?, siswaId?, teks?, aspekId?, foto?, terbit? }
 * selesai(pesan) dipanggil setelah tersimpan / terhapus.
 */
export default function SheetTulis({ awal, tutup, data, selesai }) {
  const buka = !!awal
  const catatan = awal?.jenis === 'catatan'
  const maks = catatan ? 1 : 3
  const [siswaId, setSiswaId] = useState(null)
  const [teks, setTeks] = useState('')
  const [aspekId, setAspekId] = useState(null)
  const [foto, setFoto] = useState([]) // alamat Storage (lama) atau data URL (baru)
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')
  const pilihFile = useRef(null)
  const daftarAnak = useRef(null)

  useEffect(() => {
    if (!awal) return
    setSiswaId(awal.siswaId || null)
    setTeks(awal.teks || '')
    setAspekId(awal.aspekId || null)
    setFoto(awal.foto || [])
    setGalat(''); setSibuk('')
  }, [awal])

  // anak terpilih digulir ke depan supaya terlihat
  useEffect(() => {
    if (!buka || !siswaId) return
    daftarAnak.current?.querySelector(`[data-id="${siswaId}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [buka, siswaId])

  if (!buka) return null
  const bolehFoto = data.atur.foto
  const anak = data.siswa
  const nama = (id) => anak.find((x) => x.id === id)

  const tambahFoto = async (e) => {
    const file = [...(e.target.files || [])].slice(0, maks - foto.length)
    e.target.value = ''
    try {
      const baru = []
      for (const f of file) baru.push(await t.siapkanFoto(f))
      setFoto((x) => [...x, ...baru].slice(0, maks))
    } catch (err) { setGalat(err.message) }
  }
  const tambahKata = (k) => setTeks((x) => (x.includes(k) ? x : (x.trim() ? x.trim() + ' ' : '') + k + '.'))

  const simpan = async (terbit) => {
    setGalat('')
    if (catatan && !siswaId) return setGalat('Pilih anak dulu.')
    if (!teks.trim()) return setGalat('Tulis ceritanya dulu.')
    setSibuk(terbit ? 'terbit' : 'draf')
    const diunggah = []
    try {
      const alamat = []
      for (const f of foto) {
        if (f.startsWith('data:')) { const a = await t.unggahFoto(f, data.sekolah.id); diunggah.push(a); alamat.push(a) } else alamat.push(f)
      }
      if (catatan) await t.kelasCatatanSimpan({ id: awal.id || null, siswaId, teks: teks.trim(), aspekId, foto: alamat, terbit })
      else await t.kelasKabarSimpan({ id: awal.id || null, teks: teks.trim(), foto: alamat, terbit })
      // foto lama yang dibuang dari tulisan ini → hapus dari Storage
      await t.hapusFoto((awal.foto || []).filter((f) => !alamat.includes(f)))
      selesai(terbit ? (catatan ? `Catatan untuk ${nama(siswaId)?.panggilan || nama(siswaId)?.nama.split(' ')[0]} terbit` : 'Kabar kelas terbit') : 'Tersimpan sebagai draf')
    } catch (err) {
      await t.hapusFoto(diunggah)
      setGalat(err.message); setSibuk('')
    }
  }
  const hapus = async () => {
    if (!awal.id) return
    setSibuk('hapus')
    try { await t.kelasTulisanHapus(awal.jenis, awal.id); selesai('Tulisan dihapus') } catch (err) { setGalat(err.message); setSibuk('') }
  }

  return (
    <Sheet buka tutup={tutup}
      judul={awal.id ? (catatan ? 'Ubah catatan' : 'Ubah kabar kelas') : catatan ? 'Catatan anak' : 'Kabar kelas'}
      lead={catatan ? 'Hanya bisa dibaca orang tua anak ini.' : `Untuk semua orang tua ${namaKelas(data.kelas)} (${anak.length} anak).`}>
      <div className="flex flex-col gap-3.5 pb-1">
        {catatan && (
          <div>
            <span className="mb-1.5 block text-[12.5px] font-extrabold">Untuk</span>
            <div ref={daftarAnak} className="noscroll -mx-[18px] flex gap-1.5 overflow-x-auto px-[18px] lg:-mx-6 lg:px-6">
              {anak.map((a) => (
                <button key={a.id} data-id={a.id} type="button" onClick={() => setSiswaId(a.id)}
                  className={`flex shrink-0 flex-col items-center gap-1 rounded-[16px] px-1.5 py-1.5 ${siswaId === a.id ? 'permen permen-kecil permen-pink' : ''}`}>
                  <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={42} />
                  <span className="max-w-[56px] truncate text-[11px] font-extrabold">{a.panggilan || a.nama.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!catatan && bolehFoto && <BarisFoto foto={foto} setFoto={setFoto} maks={maks} pilih={() => pilihFile.current?.click()} besar />}

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-extrabold">{catatan ? 'Ceritakan singkat' : 'Cerita hari ini'}</span>
          <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={4} maxLength={2000}
            placeholder={catatan ? 'Mis. Hari ini berani maju bercerita di depan kelas…' : 'Mis. Hari ini anak-anak menanam kacang hijau…'}
            className="field-input block min-h-[96px] w-full resize-none text-[14px] font-semibold leading-relaxed" />
        </label>

        {catatan && (
          <div className="flex flex-wrap gap-1.5">
            {KATA_CEPAT.map((k) => (
              <button key={k} type="button" onClick={() => tambahKata(k)}
                className={`rounded-pill px-3 py-1.5 text-[12px] font-extrabold ${teks.includes(k) ? 'permen permen-kecil permen-pink' : 'border-[1.5px] border-[#DCE6F4] bg-kartu dark:border-line'}`}>{k}</button>
            ))}
          </div>
        )}

        {catatan && bolehFoto && <BarisFoto foto={foto} setFoto={setFoto} maks={maks} pilih={() => pilihFile.current?.click()} />}

        {catatan && data.aspek.length > 0 && (
          <div>
            <span className="mb-1.5 block text-[12.5px] font-extrabold">Terkait aspek <span className="font-semibold text-muted">(opsional)</span></span>
            <div className="flex flex-wrap gap-1.5">
              {data.aspek.map((a) => (
                <button key={a.id} type="button" onClick={() => setAspekId(aspekId === a.id ? null : a.id)}
                  className={`rounded-pill px-3 py-1.5 text-[12px] font-extrabold ${aspekId === a.id ? 'permen permen-kecil permen-ungu' : 'border-[1.5px] border-[#DCE6F4] bg-kartu dark:border-line'}`}>{a.pendek}</button>
              ))}
            </div>
          </div>
        )}

        {!catatan && bolehFoto && foto.length > 0 && (
          <p className="flex items-start gap-2 rounded-[14px] bg-warn-soft px-3 py-2.5 text-[12px] font-semibold leading-snug text-warn-deep">
            <IkonT.foto size={16} className="mt-px" /> Pastikan orang tua sudah setuju anaknya tampil di foto kelas.
          </p>
        )}

        {galat && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger">{galat}</p>}

        <div className="grid grid-cols-[1fr_1.4fr] gap-2.5 pt-1">
          <button className="bigbtn-ghost disabled:opacity-60" disabled={!!sibuk} onClick={() => simpan(false)}>
            {sibuk === 'draf' ? 'Menyimpan…' : 'Simpan draf'}
          </button>
          <button className="bigbtn flex items-center justify-center gap-2 disabled:opacity-60" disabled={!!sibuk} onClick={() => simpan(true)}>
            <IkonT.kirim size={17} sw={2.4} />{sibuk === 'terbit' ? 'Mengirim…' : awal.terbit ? 'Simpan' : 'Terbitkan'}
          </button>
        </div>
        {awal.id && (
          <button className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-extrabold text-danger disabled:opacity-60" disabled={!!sibuk} onClick={hapus}>
            <IkonT.tempat size={16} />{sibuk === 'hapus' ? 'Menghapus…' : 'Hapus tulisan ini'}
          </button>
        )}
        <input ref={pilihFile} type="file" accept="image/*" multiple={!catatan} className="hidden" onChange={tambahFoto} />
      </div>
    </Sheet>
  )
}

function BarisFoto({ foto, setFoto, maks, pilih, besar = false }) {
  const buang = (f) => setFoto((x) => x.filter((y) => y !== f))
  return (
    <div className={besar ? 'grid grid-cols-3 gap-2' : 'flex items-center gap-2.5'}>
      {foto.map((f) => (
        <span key={f} className={`relative ${besar ? 'aspect-square' : 'h-[64px] w-[64px]'}`}>
          <Foto alamat={f} className="h-full w-full !rounded-[14px]" />
          <button type="button" aria-label="Buang foto" onClick={() => buang(f)}
            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#1B2559] text-white shadow"><IkonT.silang size={13} sw={3} /></button>
        </span>
      ))}
      {foto.length < maks && (
        <button type="button" onClick={pilih}
          className={`grid place-items-center rounded-[14px] border-[1.5px] border-dashed border-[#C9D3E6] text-muted ${besar ? 'aspect-square' : 'h-[64px] w-[64px]'}`}>
          <span className="flex flex-col items-center gap-1 text-[11px] font-extrabold"><IkonT.kamera size={22} />{besar && 'Tambah'}</span>
        </button>
      )}
      {!besar && <span className="min-w-0 flex-1 text-[11.5px] font-semibold leading-snug text-muted">Foto opsional, maks. {maks}. Dikecilkan otomatis.</span>}
    </div>
  )
}
