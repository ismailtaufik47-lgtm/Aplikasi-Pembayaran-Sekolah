// Ceklis sekelas: satu indikator per layar, satu baris per anak.
// Isian awal = nilai terakhir sebelumnya; tersimpan otomatis.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pil } from '../components/ui.jsx'
import { KepalaKelas } from './merek.jsx'
import { Gulir, BilahBawah } from './bingkai.jsx'
import Avatar from '../components/Avatar.jsx'
import { IkonT, PilSkala } from '../tumbuh/bagian.jsx'
import { daftarSkala, infoNilai } from '../tumbuh/skala.js'
import * as t from '../tumbuh/api.js'

export default function Ceklis({ data, setPeriode, kembali, toast }) {
  const p = data.periode
  const semuaInd = useMemo(() => data.aspek.flatMap((a) => a.indikator.map((x) => ({ ...x, aspek: a }))), [data.aspek])

  if (data.atur.periode === 'tema' && !p) return <TemaBaru setPeriode={setPeriode} kembali={kembali} />
  if (!p || !p.fokus.length) return <PilihFokus data={data} semuaInd={semuaInd} setPeriode={setPeriode} kembali={kembali} />
  return <IsiCeklis data={data} semuaInd={semuaInd} setPeriode={setPeriode} kembali={kembali} toast={toast} />
}

/* ---------------- pilih indikator fokus ---------------- */
function PilihFokus({ data, semuaInd, setPeriode, kembali }) {
  const [pilih, setPilih] = useState(() => new Set(data.periode?.fokus?.length ? data.periode.fokus : []))
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const ubah = (id) => setPilih((s) => { const b = new Set(s); b.has(id) ? b.delete(id) : b.size < 8 && b.add(id); return b })
  const mulai = async () => {
    setSibuk(true); setGalat('')
    try { setPeriode(await t.kelasPeriodeBuka([...pilih])) } catch (e) { setGalat(e.message); setSibuk(false) }
  }
  const bar = (
    <BilahBawah>
      <span className="min-w-0 flex-1">
        <b className="block text-[13.5px] font-extrabold leading-tight">{pilih.size} indikator dipilih</b>
        <span className="block text-[11.5px] font-bold text-muted">Saran: 3–5 indikator per periode</span>
      </span>
      <button className="bigbtn !w-auto shrink-0 !px-5 !py-3 disabled:opacity-50" disabled={!pilih.size || sibuk} onClick={mulai}>
        {sibuk ? 'Menyimpan…' : 'Mulai ceklis'}
      </button>
    </BilahBawah>
  )
  if (!semuaInd.length) {
    return (
      <Gulir>
        <KepalaKelas polos kembali={kembali} judul="Ceklis" sub="Belum ada indikator penilaian. Minta admin atau kepala sekolah mengisinya di menu Penilaian anak." />
      </Gulir>
    )
  }
  return (
    <>
     <Gulir>
      <KepalaKelas polos kembali={kembali} judul={`Ceklis ${data.periode?.label || ''}`.trim()} sub="Pilih kemampuan yang dinilai periode ini (maks. 8). Tidak perlu semuanya." />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      {data.aspek.map((a) => a.indikator.length > 0 && (
        <section key={a.id} className="card mb-3 !p-0 lg:mb-0">
          <b className="block px-3.5 pb-1.5 pt-3 text-[13px] font-extrabold text-muted">{a.pendek}</b>
          {a.indikator.map((x) => {
            const on = pilih.has(x.id)
            return (
              <button key={x.id} type="button" onClick={() => ubah(x.id)} className="flex w-full items-center gap-3 border-t border-line px-3.5 py-3 text-left">
                <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border-2 ${on ? 'border-brand bg-brand text-white' : 'border-[#CBD3E2] bg-kartu'}`}>
                  {on && <IkonT.centang size={13} sw={3.2} />}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug">{x.nama}</span>
                {x.khas && <span className="chip bg-warn-soft text-warn-deep">Khas sekolah</span>}
              </button>
            )
          })}
        </section>
      ))}
      </div>
      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-semibold text-danger lg:mt-4">{galat}</p>}
      <div className="h-3" />
     </Gulir>
     {bar}
    </>
  )
}

/* ---------------- periode tema: beri nama tema ---------------- */
function TemaBaru({ setPeriode, kembali }) {
  const [tema, setTema] = useState('')
  const [galat, setGalat] = useState('')
  const mulai = async () => {
    try { setPeriode(await t.kelasPeriodeBuka(null, tema)) } catch (e) { setGalat(e.message) }
  }
  return (
    <Gulir>
      <KepalaKelas polos kembali={kembali} judul="Tema baru" sub="Sekolah menilai per tema. Tulis tema yang sedang berjalan." />
      <div className="card !p-4 lg:max-w-[560px]">
        <input value={tema} onChange={(e) => setTema(e.target.value)} maxLength={60} placeholder="Mis. Tanaman di sekitarku" className="field-input w-full text-[15px] font-semibold" />
        {galat && <p className="mt-2 text-[13px] font-semibold text-danger">{galat}</p>}
        <button className="bigbtn mt-3 disabled:opacity-50" disabled={!tema.trim()} onClick={mulai}>Mulai tema ini</button>
      </div>
    </Gulir>
  )
}

/* ---------------- isi ceklis ---------------- */
function IsiCeklis({ data, semuaInd, setPeriode, kembali, toast }) {
  const p = data.periode
  const fokus = p.fokus.map((id) => semuaInd.find((x) => x.id === id)).filter(Boolean)
  const [muat, setMuat] = useState(true)
  const [ke, setKe] = useState(0)
  const [isian, setIsian] = useState({})   // { ind: { siswa: n } } — yang tampil
  const [tersimpan, setTersimpan] = useState({}) // { ind: { siswa: n } } — yang sudah di server
  const [awal, setAwal] = useState({})
  const [sibuk, setSibuk] = useState(false)
  const kotor = useRef(new Set()) // indikator yang belum disimpan
  const skala = data.atur.skala

  useEffect(() => {
    let batal = false
    t.kelasCeklis(p.id).then((d) => {
      if (batal) return
      const peta = (xs) => xs.reduce((m, { s, i, n }) => ((m[i] = m[i] || {})[s] = n, m), {})
      const sv = peta(d.nilai || []); const aw = peta(d.awal || [])
      const tampil = {}
      p.fokus.forEach((i) => {
        tampil[i] = { ...(aw[i] || {}), ...(sv[i] || {}) }
        // isian awal yang belum tersimpan → perlu disimpan juga
        if (Object.keys(tampil[i]).some((s) => sv[i]?.[s] == null)) kotor.current.add(i)
      })
      setTersimpan(sv); setAwal(aw); setIsian(tampil); setMuat(false)
    }).catch((e) => { toast(e.message); setMuat(false) })
    return () => { batal = true }
  }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const simpan = useCallback(async (indId) => {
    if (!kotor.current.has(indId)) return true
    const daftar = Object.entries(isian[indId] || {}).map(([s, n]) => ({ s, n }))
    if (!daftar.length) { kotor.current.delete(indId); return true }
    kotor.current.delete(indId)
    try {
      const hasil = await t.kelasNilaiSimpan(p.id, indId, daftar)
      setTersimpan((x) => ({ ...x, [indId]: { ...(isian[indId] || {}) } }))
      setPeriode({ ...hasil, tersimpan: undefined })
      return true
    } catch (e) {
      kotor.current.add(indId); toast('Gagal menyimpan: ' + e.message); return false
    }
  }, [isian, p.id, setPeriode, toast])

  // simpan otomatis 1,2 detik setelah ketukan terakhir
  const ind = fokus[ke]
  useEffect(() => {
    if (!ind || !kotor.current.has(ind.id)) return
    const h = setTimeout(() => simpan(ind.id), 1200)
    return () => clearTimeout(h)
  }, [isian, ind, simpan])

  const pilih = (siswaId, n) => {
    kotor.current.add(ind.id)
    setIsian((x) => ({ ...x, [ind.id]: { ...(x[ind.id] || {}), [siswaId]: n } }))
  }
  const pindah = async (k) => { await simpan(ind.id); setKe(k); document.querySelector('.langit-gulir')?.scrollTo({ top: 0 }) }
  const akhir = ke === fokus.length - 1
  const terbitkan = async () => {
    setSibuk(true)
    try {
      for (const f of fokus) if (!(await simpan(f.id))) throw new Error('Ada nilai yang belum tersimpan.')
      setPeriode(await t.kelasPeriodeTerbit(p.id, true))
      toast('Ceklis terbit — orang tua sudah bisa melihat grafiknya')
      kembali()
    } catch (e) { toast(e.message) } finally { setSibuk(false) }
  }

  const lengkap = (i) => data.siswa.every((x) => isian[i]?.[x.id] != null)
  const kosong = ind ? data.siswa.filter((x) => isian[ind.id]?.[x.id] == null).length : 0
  const berubah = ind ? data.siswa.filter((x) => awal[ind.id]?.[x.id] != null && isian[ind.id]?.[x.id] !== awal[ind.id][x.id]).length : 0

  const bar = ind && (
      <BilahBawah>
        {ke > 0 && (
          <button aria-label="Indikator sebelumnya" onClick={() => pindah(ke - 1)} className="tombol-putih grid h-12 w-12 shrink-0 place-items-center rounded-[16px]"><IkonT.kiri size={20} sw={2.6} /></button>
        )}
        <span className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-extrabold leading-tight">Indikator {ke + 1} dari {fokus.length}</b>
          <span className="block truncate text-[11.5px] font-bold text-muted">{kosong ? `${kosong} anak belum dipilih` : 'Tersimpan otomatis'}</span>
        </span>
        {akhir ? (
          <button className="bigbtn !w-auto shrink-0 !px-5 !py-3 flex items-center gap-2 disabled:opacity-60" disabled={sibuk} onClick={p.terbit ? async () => { await simpan(ind.id); kembali() } : terbitkan}>
            {p.terbit ? 'Selesai' : sibuk ? 'Mengirim…' : <><IkonT.kirim size={17} sw={2.4} />Terbitkan</>}
          </button>
        ) : (
          <button className="bigbtn !w-auto shrink-0 !px-5 !py-3 flex items-center gap-2" onClick={() => pindah(ke + 1)}>Berikutnya <IkonT.kanan size={18} sw={2.6} /></button>
        )}
      </BilahBawah>
  )

  if (muat) return <Gulir><p className="py-16 text-center text-[13.5px] font-bold text-muted">Memuat ceklis…</p></Gulir>
  if (!ind) return null

  return (
    <>
     <Gulir>
      <KepalaKelas polos kembali={async () => { await simpan(ind.id); kembali() }}
        judul={`Ceklis ${p.pendek}`} sub={p.terbit ? 'Sudah terbit — perubahan langsung terlihat orang tua.' : 'Isian awal = nilai sebelumnya. Cukup ubah anak yang berbeda.'} />

      <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="lg:sticky lg:top-0 lg:flex lg:flex-col-reverse lg:gap-4">
      <div className="noscroll -mx-[18px] mb-3 flex gap-2 overflow-x-auto px-[18px] pb-1 lg:hidden">
        {fokus.map((x, n) => (
          <Pil key={x.id} on={n === ke} warna="tosca" onClick={() => pindah(n)}
            ikon={lengkap(x.id) && n !== ke ? <IkonT.centang size={15} sw={2.8} /> : <span className="text-[12px] opacity-70">{n + 1}</span>}>
            {x.nama.length > 22 ? x.nama.slice(0, 21) + '…' : x.nama}
          </Pil>
        ))}
      </div>
      {/* PC: daftar indikator fokus tegak, nama lengkap */}
      <nav className="card hidden !p-2 lg:block">
        <b className="block px-2.5 pb-1.5 pt-1.5 text-[12px] font-extrabold uppercase tracking-[.04em] text-muted">Indikator periode ini</b>
        {fokus.map((x, n) => {
          const on = n === ke
          return (
            <button key={x.id} type="button" onClick={() => pindah(n)} aria-current={on ? 'step' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-[13.5px] leading-snug transition ${on ? 'nav-aktif font-extrabold' : 'font-bold hover:bg-isi'}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${lengkap(x.id) ? 'bg-ok text-white' : on ? 'bg-brand text-white' : 'bg-isi text-muted'}`}>
                {lengkap(x.id) ? <IkonT.centang size={14} sw={3} /> : n + 1}
              </span>
              <span className="min-w-0 flex-1">{x.nama}</span>
            </button>
          )
        })}
      </nav>

      <section className="card !p-4 lg:!p-5">
        <span className={`chip permen permen-kecil permen-${['ungu', 'pink', 'biru', 'oranye', 'tosca', 'kuning'][data.aspek.indexOf(ind.aspek) % 6]}`}>{ind.aspek.pendek}</span>
        <h2 className="mt-2 text-[18px] font-extrabold leading-snug">{ind.nama}</h2>
        {ind.keterangan && <p className="mt-1 text-[12.5px] font-semibold leading-snug text-muted">{ind.keterangan}</p>}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t-[1.5px] border-dashed border-line pt-3">
          {daftarSkala(skala).map((s, k) => (
            <span key={s.kode} className="flex items-center gap-2 text-[11.5px] font-bold text-muted">
              <PilSkala n={k + 1} skala={skala} /> <span className="leading-tight">{s.label}</span>
            </span>
          ))}
        </div>
      </section>

      </div>
      <div>
      <div className="seghead lg:!mt-0">
        <h2>{data.siswa.length} anak</h2>
        {berubah > 0 && <span className="chip bg-brand-soft text-brand">{berubah} diubah</span>}
      </div>
      <div className="card mb-5 !p-0">
        {data.siswa.map((a) => {
          const v = isian[ind.id]?.[a.id]
          const sebelum = awal[ind.id]?.[a.id]
          return (
            <div key={a.id} className="flex items-center gap-2.5 border-b border-line py-2.5 pl-3 pr-2.5 last:border-b-0 lg:gap-3.5 lg:px-4">
              <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={36} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-extrabold leading-tight lg:text-[14.5px]"><span className="lg:hidden">{a.panggilan || a.nama.split(' ')[0]}</span><span className="hidden lg:inline">{a.nama}</span></b>
                <span className="block truncate text-[11px] font-bold text-muted">
                  {v == null ? 'belum dipilih'
                    : sebelum == null ? 'baru'
                      : v !== sebelum ? <span className="text-brand">diubah · dulu {infoNilai(skala, sebelum).kode}</span>
                        : 'tetap'}
                </span>
              </span>
              <span className="flex shrink-0 gap-1 lg:gap-1.5">
                {daftarSkala(skala).map((s, k) => {
                  const on = v === k + 1
                  return (
                    <button key={s.kode} onClick={() => pilih(a.id, k + 1)} aria-pressed={on} aria-label={`${a.nama}: ${s.label}`}
                      className={`h-9 rounded-[11px] text-[11px] font-extrabold transition lg:h-10 lg:w-[56px] lg:text-[12.5px] ${skala === 'bintang' ? 'w-[40px] text-[10px]' : k >= 2 ? 'w-[42px]' : 'w-[36px]'} ${
                        on ? `pil-skala skala-${k + 1}` : 'border-[1.5px] border-[#E3E8F2] bg-kartu text-[#8A93A6] dark:border-line'
                      }`}>
                      {skala === 'bintang' ? `${k + 1}★` : s.kode}
                    </button>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>
      </div>
      </div>
     </Gulir>
     {bar}
    </>
  )
}
