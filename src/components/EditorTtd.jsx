/**
 * Editor tanda tangan + stempel untuk dokumen resmi.
 * Dipakai di Profil sekolah (kuitansi orang tua) dan panel admin
 * (invoice & kuitansi sewa).
 *
 *  • Tanda tangan: digambar langsung di layar (jari / mouse), ATAU upload
 *    foto tanda tangan di kertas.
 *  • Stempel: upload foto cap.
 *
 * Foto yang diupload otomatis DIBERSIHKAN: latar putih/kertas dibuat
 * transparan dan sisi kosong dipotong, supaya di kuitansi terlihat seperti
 * tinta asli, bukan tempelan kotak foto. Hasil disimpan sebagai PNG data URL.
 */
import { useEffect, useRef, useState } from 'react'

const TINTA = '#1B2A6B'

/* ===================== pengolahan gambar ===================== */

/** Potong sisi transparan, sisakan sedikit jarak. */
function potongKosong(canvas, jarak = 8) {
  const ctx = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  const px = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null // kosong
  x0 = Math.max(0, x0 - jarak); y0 = Math.max(0, y0 - jarak)
  x1 = Math.min(w - 1, x1 + jarak); y1 = Math.min(h - 1, y1 + jarak)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/**
 * Foto (kertas putih) → PNG transparan. Piksel terang dibuang, piksel
 * gelap dipertahankan dengan transparansi halus di tepinya.
 */
export async function bersihkanFoto(file, maks = 700) {
  if (!/^image\//.test(file.type)) throw new Error('File harus berupa gambar (JPG/PNG).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, gagal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => gagal(new Error('Gambar tidak bisa dibaca.'))
      i.src = url
    })
    const skala = Math.min(1, maks / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * skala)
    c.height = Math.round(img.height * skala)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const data = ctx.getImageData(0, 0, c.width, c.height)
    const px = data.data
    for (let i = 0; i < px.length; i += 4) {
      const terang = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (px[i + 3] < 10) continue
      // >= 205 dianggap kertas; 150–205 transisi halus; lebih gelap = tinta penuh
      const a = terang >= 205 ? 0 : terang <= 150 ? 255 : Math.round(((205 - terang) / 55) * 255)
      px[i + 3] = Math.min(px[i + 3], a)
    }
    ctx.putImageData(data, 0, 0)
    const hasil = potongKosong(c)
    if (!hasil) throw new Error('Tidak ada coretan yang terbaca. Coba foto dengan tinta lebih tebal.')
    return hasil.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Logo: warna asli dipertahankan (TIDAK dihapus latarnya seperti TTD),
 * hanya diperkecil ke maks 400px dan sisi transparan dipotong.
 * PNG transparan tetap transparan; JPG tetap berlatar seperti aslinya.
 */
export async function siapkanLogo(file, maks = 400) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Logo harus berupa gambar PNG atau JPG.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, gagal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => gagal(new Error('Gambar tidak bisa dibaca.'))
      i.src = url
    })
    const skala = Math.min(1, maks / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * skala))
    c.height = Math.max(1, Math.round(img.height * skala))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    if (file.type === 'image/jpeg') return c.toDataURL('image/jpeg', 0.9)
    return (potongKosong(c, 2) || c).toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Pengunggah logo kecil dengan pratinjau. */
export function EditorLogo({ logo, ubah, toast }) {
  const [proses, setProses] = useState(false)
  const olah = async (file) => {
    setProses(true)
    try {
      ubah(await siapkanLogo(file))
    } catch (e) {
      toast?.(e.message)
    } finally {
      setProses(false)
    }
  }
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-[84px] w-[84px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-[repeating-conic-gradient(#F4F6FA_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]">
        {logo ? (
          <img src={logo} alt="Logo" className="max-h-[72px] max-w-[72px] object-contain" />
        ) : (
          <span className="px-2 text-center text-[11px] font-semibold text-[#6B7385]">{proses ? 'Memproses…' : 'Belum ada logo'}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <TombolUpload label={logo ? '🔄 Ganti logo' : '📷 Upload logo'} onFile={olah} />
          {logo && (
            <button type="button" onClick={() => ubah(null)} className="px-2 text-[13px] font-bold text-danger">
              Hapus
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          PNG berlatar transparan hasilnya paling rapi. Otomatis diperkecil, warna tidak diubah.
        </p>
      </div>
    </div>
  )
}

/* ===================== pad tanda tangan ===================== */

function PadTtd({ onSelesai, onBatal }) {
  const ref = useRef(null)
  const gambar = useRef({ aktif: false, titik: [] })
  const [ada, setAda] = useState(false)

  useEffect(() => {
    const c = ref.current
    const dpr = Math.max(2, window.devicePixelRatio || 1)
    c.width = c.clientWidth * dpr
    c.height = c.clientHeight * dpr
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = TINTA
    ctx.lineWidth = 2.6
  }, [])

  const posisi = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const mulai = (e) => {
    e.preventDefault()
    ref.current.setPointerCapture?.(e.pointerId)
    gambar.current = { aktif: true, titik: [posisi(e)] }
  }
  const gerak = (e) => {
    if (!gambar.current.aktif) return
    const ctx = ref.current.getContext('2d')
    const t = gambar.current.titik
    t.push(posisi(e))
    if (t.length < 3) return
    // kurva halus lewat titik tengah, supaya garis tidak patah-patah
    const [a, b, c] = t.slice(-3)
    ctx.beginPath()
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2)
    ctx.stroke()
    setAda(true)
  }
  const selesai = () => {
    const t = gambar.current.titik
    if (gambar.current.aktif && t.length === 1) {
      // satu ketukan = titik
      const ctx = ref.current.getContext('2d')
      ctx.beginPath()
      ctx.arc(t[0].x, t[0].y, 1.4, 0, Math.PI * 2)
      ctx.fillStyle = TINTA
      ctx.fill()
      setAda(true)
    }
    gambar.current.aktif = false
  }
  const hapus = () => {
    const c = ref.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setAda(false)
  }
  const pakai = () => {
    const hasil = potongKosong(ref.current, 12)
    if (hasil) onSelesai(hasil.toDataURL('image/png'))
  }

  return (
    <div>
      {/* sengaja selalu putih (juga di mode gelap): seperti kertas, supaya tinta biru tua terlihat */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[#CBD3E6]" style={{ background: '#fff' }}>
        <canvas
          ref={ref}
          className="block h-[180px] w-full touch-none"
          onPointerDown={mulai}
          onPointerMove={gerak}
          onPointerUp={selesai}
          onPointerLeave={selesai}
          onPointerCancel={selesai}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-[#DDE3F0]" />
        {!ada && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] font-semibold text-[#6B7385]">
            Tanda tangan di sini dengan jari atau mouse
          </span>
        )}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={onBatal} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] font-bold">
          Batal
        </button>
        <button type="button" onClick={hapus} disabled={!ada} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] font-bold disabled:opacity-50">
          Ulangi
        </button>
        <button type="button" onClick={pakai} disabled={!ada} className="flex-1 rounded-xl bg-brand px-3.5 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-50">
          Pakai tanda tangan ini
        </button>
      </div>
    </div>
  )
}

/* ===================== kotak pratinjau + tombol ===================== */

function KotakGambar({ src, kosong, tinggi = 110 }) {
  return (
    <div
      className="grid place-items-center rounded-2xl border border-line bg-[repeating-conic-gradient(#F4F6FA_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
      style={{ height: tinggi }}
    >
      {src ? <img src={src} alt="" className="object-contain" style={{ maxHeight: tinggi - 16, maxWidth: '88%' }} /> : (
        <span className="px-4 text-center text-[12.5px] font-semibold text-[#6B7385]">{kosong}</span>
      )}
    </div>
  )
}

function TombolUpload({ label, onFile }) {
  const ref = useRef(null)
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] font-bold">
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </>
  )
}

/**
 * @param {{ ttd: string|null, stempel: string|null }} nilai
 * @param {(ubahan: object) => void} ubah
 * @param {(pesan: string) => void} toast
 */
export default function EditorTtd({ nilai, ubah, toast }) {
  const [gambarLayar, setGambarLayar] = useState(false)
  const [proses, setProses] = useState('')

  const olahFoto = async (file, kunci, maks) => {
    setProses(kunci)
    try {
      ubah({ [kunci]: await bersihkanFoto(file, maks) })
    } catch (e) {
      toast?.(e.message)
    } finally {
      setProses('')
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-1.5 text-[13px] font-bold">Tanda tangan</div>
        {gambarLayar ? (
          <PadTtd
            onBatal={() => setGambarLayar(false)}
            onSelesai={(src) => {
              ubah({ ttd: src })
              setGambarLayar(false)
            }}
          />
        ) : (
          <>
            <KotakGambar src={nilai.ttd} kosong={proses === 'ttd' ? 'Membersihkan foto…' : 'Belum ada tanda tangan'} />
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setGambarLayar(true)} className="rounded-xl bg-brand px-3.5 py-2.5 text-[13px] font-extrabold text-white">
                ✍️ Gambar di layar
              </button>
              <TombolUpload label="📷 Upload foto" onFile={(f) => olahFoto(f, 'ttd', 900)} />
              {nilai.ttd && (
                <button type="button" onClick={() => ubah({ ttd: null })} className="px-2 text-[13px] font-bold text-danger">
                  Hapus
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-bold">Stempel <span className="font-semibold text-muted">(opsional)</span></div>
        <KotakGambar src={nilai.stempel} kosong={proses === 'stempel' ? 'Membersihkan foto…' : 'Belum ada stempel'} />
        <div className="mt-2.5 flex flex-wrap gap-2">
          <TombolUpload label="📷 Upload foto cap" onFile={(f) => olahFoto(f, 'stempel', 500)} />
          {nilai.stempel && (
            <button type="button" onClick={() => ubah({ stempel: null })} className="px-2 text-[13px] font-bold text-danger">
              Hapus
            </button>
          )}
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-muted sm:col-span-2">
        Tips foto: tanda tangan / cap di kertas <b className="text-ink">putih polos</b>, cahaya terang, difoto lurus dari atas.
        Latar kertas otomatis dihapus supaya di kuitansi terlihat seperti tinta asli.
      </p>
    </div>
  )
}
