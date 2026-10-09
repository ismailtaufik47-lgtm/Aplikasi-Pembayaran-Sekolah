/**
 * Tagihan › "Sudah lulus / keluar, masih menunggak" (0044).
 * Siswa yang sudah tidak aktif tidak ikut dimuat di daftar siswa, jadi daftarnya
 * dibaca dari server saat menu Tagihan dibuka. Hilang sendiri kalau semuanya lunas.
 */
import { useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Chip, IkonWhatsapp, Sheet } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import InputTanggal from '../components/InputTanggal.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { labelKelasSiswa, namaBulanTa, rp, tanggalISO, taPendek } from '../lib/format.js'

export const labelItem = (x) => (x.jenis === 'spp' ? `SPP ${namaBulanTa(x.ta, x.i)}` : `${x.nama} ${taPendek(x.ta)}`)

/** "SPP 2 bulan · 1 kegiatan" */
function ringkasItem(item) {
  const n = item.filter((x) => x.jenis === 'spp').length
  const k = item.length - n
  return [n && `SPP ${n} bulan`, k && `${k} kegiatan`].filter(Boolean).join(' · ')
}

function pesanWa(s, pengaturan) {
  let t = `Assalamu'alaikum ${s.wali || 'Bapak/Ibu Wali Murid'} 🙏\n\n`
  t += `Mohon izin mengingatkan, masih ada tagihan ananda *${s.nama}* yang belum lunas sebesar *${rp(s.total)}*:\n`
  s.item.forEach((x) => { t += `• ${labelItem(x)} — ${rp(x.target - x.dibayar)}\n` })
  t += '\n'
  const rek = pengaturan.rekening || []
  if (rek.length) {
    t += 'Pembayaran bisa dilakukan via transfer ke:\n'
    rek.forEach((r) => { t += `🏦 ${r.bank} ${r.nomor} a.n. ${r.atasNama}\n` })
    t += '\n'
  }
  t += 'Mohon konfirmasi ke sekolah setelah membayar ya, Bapak/Ibu 🙏 Terima kasih banyak atas perhatiannya 😊'
  return t
}

export default function TunggakanNonaktif() {
  const { pengaturan, pembayaran, boleh, toast } = useData()
  const [data, setData] = useState(null)
  const [bayar, setBayar] = useState(null) // siswa yang sedang dicatat
  const lihat = boleh('pembayaran', 'lihat')

  const [versi, setVersi] = useState(0)
  const demo = useRef({})
  demo.current = { pembayaran } // mode demo: pembayaran yang baru dicatat ikut dihitung
  useEffect(() => {
    if (!lihat) return undefined
    let aktif = true
    api.tunggakanNonaktif(demo.current).then((d) => aktif && setData(d)).catch(() => aktif && setData([]))
    return () => { aktif = false }
  }, [lihat, versi])

  if (!lihat || !data?.length) return null
  const total = data.reduce((t, s) => t + s.total, 0)

  const kirimWa = (s) => {
    const nomor = (s.hp || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
    if (!nomor) return toast('Nomor HP orang tua belum diisi')
    window.open(`https://wa.me/${nomor}?text=${encodeURIComponent(pesanWa(s, pengaturan))}`, '_blank')
  }

  return (
    <section className="mt-5" aria-labelledby="judul-nonaktif">
      <div className="seghead !mt-0">
        <h2 id="judul-nonaktif">Sudah lulus / keluar, masih menunggak</h2>
        <span className="shrink-0 whitespace-nowrap pl-3 text-[12.5px] font-bold text-muted">{data.length} siswa · {rp(total)}</span>
      </div>
      <div className="card !py-1.5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:!px-6">
        {data.map((s) => (
          <div key={s.id} className="row items-center">
            <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[14.5px] font-bold">{s.nama}</span>
                <Chip warna={s.status === 'alumni' ? 'blue' : 'grey'}>{labelKelasSiswa(s)}</Chip>
              </div>
              <div className="truncate text-xs text-muted">
                {ringkasItem(s.item)} · {s.status === 'alumni' ? `dulu kelas ${s.kelas}` : s.akhir === 'pindah' ? 'pindah sekolah' : `kelas ${s.kelas}`}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <b className="text-[13.5px] font-extrabold text-danger">Sisa {rp(s.total)}</b>
                <span className="flex items-center gap-3 text-[12.5px] font-bold">
                  <button className="flex items-center gap-1 text-ok-deep" onClick={() => kirimWa(s)} aria-label={`Kirim pengingat WhatsApp ke wali ${s.nama}`}>
                    <IkonWhatsapp size={16} /><span className="hidden sm:inline">WA</span>
                  </button>
                  <button className="text-brand" onClick={() => setBayar(s)}>{boleh('pembayaran') ? 'Catat' : 'Rincian'}</button>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-[12px] font-semibold leading-snug text-muted">
        Tidak ikut daftar di atas karena sudah tidak aktif. Orang tuanya tetap bisa membuka portal (lihat saja) sampai tagihannya lunas.
      </p>
      <SheetBayarNonaktif s={bayar} tutup={() => setBayar(null)} selesai={() => { setBayar(null); setVersi((v) => v + 1) }} />
    </section>
  )
}

function SheetBayarNonaktif({ s, tutup, selesai }) {
  const { catatTunggakanLain, boleh, cegahKunci, toast } = useData()
  const bisaCatat = boleh('pembayaran')
  const [pilih, setPilih] = useState(0)
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('Tunai')
  const [tanggal, setTanggal] = useState(tanggalISO())
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!s) return
    setPilih(0)
    setNominal(s.item[0] ? s.item[0].target - s.item[0].dibayar : '')
    setMetode('Tunai')
    setTanggal(tanggalISO())
  }, [s])

  if (!s) return null
  const x = s.item[pilih]
  const sisa = x ? x.target - x.dibayar : 0
  const n = Number(nominal) || 0

  const simpan = async () => {
    if (cegahKunci('bayar')) return
    if (n <= 0) return toast('Isi nominal dulu')
    if (n > sisa) return toast(`Nominal melebihi sisa tagihan — maksimal ${rp(sisa)}`)
    setSibuk(true)
    try {
      await catatTunggakanLain(s, x, { nominal: n, metode, tanggal })
      toast(`${labelItem(x)} · ${rp(n)} tersimpan${n >= sisa ? ' — lunas' : ''}`)
      selesai()
    } catch {
      /* pesan ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={!!s} tutup={() => !sibuk && tutup()} judul={bisaCatat ? 'Catat pembayaran' : 'Rincian tunggakan'} lead={`${s.nama} · ${labelKelasSiswa(s)} · sisa ${rp(s.total)}`}>
      <div className="mb-1.5 text-[13px] font-bold">{bisaCatat ? 'Tagihan yang dibayar' : 'Tagihan yang belum lunas'}</div>
      <div className="card mb-4 !py-1" role={bisaCatat ? 'radiogroup' : undefined}>
        {s.item.map((it, i) => {
          const on = bisaCatat && i === pilih
          return (
            <button
              key={`${it.ta}-${it.jenis}-${it.i ?? it.biayaId}`}
              type="button"
              role={bisaCatat ? 'radio' : undefined}
              aria-checked={bisaCatat ? on : undefined}
              disabled={!bisaCatat}
              onClick={() => { setPilih(i); setNominal(it.target - it.dibayar) }}
              className="row w-full items-center text-left disabled:opacity-100"
            >
              {bisaCatat && (
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand' : 'border-[#C9D3E6] dark:border-line'}`}>
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-extrabold">{labelItem(it)}</b>
                <span className="block text-[12px] font-semibold text-muted">
                  {it.dibayar > 0 ? `Dibayar ${rp(it.dibayar)} dari ${rp(it.target)}` : `Tahun ajaran ${it.ta}`}
                </span>
              </span>
              <b className="shrink-0 text-[13.5px] font-extrabold text-danger">{rp(it.target - it.dibayar)}</b>
            </button>
          )
        })}
      </div>

      {bisaCatat && x && (
        <>
          <label className="mb-1.5 block text-[13px] font-bold">Jumlah dibayar</label>
          <InputNominal className="mb-1.5" value={nominal} onChange={setNominal} placeholder={String(sisa)} />
          <p className={`mb-4 text-xs font-semibold ${n > sisa ? 'text-danger' : 'text-muted'}`}>
            {n > sisa ? `Melebihi sisa ${labelItem(x)}. Maksimal ${rp(sisa)}.` : `Sisa ${labelItem(x)} ${rp(sisa)}. Boleh diisi kurang untuk bayar sebagian.`}
          </p>
          <label className="mb-1.5 block text-[13px] font-bold">Metode pembayaran</label>
          <div className="mb-4 flex gap-2.5">
            {['Tunai', 'Transfer', 'Tabungan'].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metode === m}
                onClick={() => setMetode(m)}
                className={`min-w-0 flex-1 rounded-[14px] px-1 py-2.5 text-[13.5px] font-extrabold ${metode === m ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-muted dark:border-line'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="mb-1.5 block text-[13px] font-bold">Tanggal pembayaran</label>
          <div className="mb-4"><InputTanggal value={tanggal} max={tanggalISO()} onChange={setTanggal} aria-label="Tanggal pembayaran" /></div>
          <button className="bigbtn disabled:opacity-50" onClick={simpan} disabled={sibuk || n <= 0 || n > sisa}>
            {sibuk ? 'Menyimpan…' : 'Simpan pembayaran'}
          </button>
        </>
      )}
    </Sheet>
  )
}
