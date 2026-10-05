/**
 * Laporan › Kegiatan (0035): untuk setiap kegiatan (biaya kegiatan + paket
 * PMB / daftar ulang) — uang masuk dari orang tua vs pengeluaran kas yang
 * diberi label kegiatan itu, sisa / nombok, rincian per kategori, nota.
 *
 * HP : daftar kegiatan → ketuk → halaman rincian (tombol kembali).
 * PC : tabel semua kegiatan di kiri, rincian kegiatan terpilih di kanan.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveAs } from 'file-saver'
import { Chevron, Chip, Ikon, Kosong, Sheet, Track } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { rp, tanggalKegiatan } from '../lib/format.js'
import { FONT_EMOJI } from '../lib/emojiKegiatan.js'
import { emojiKategori, namaFileNota, tglKas, warnaKategoriKegiatan } from '../lib/kas.js'
import { hitungRekapKegiatan } from '../lib/kegiatanKas.js'
import { Banner } from './GrafikLaporan.jsx'

const rpTanda = (n) => (n < 0 ? '−' + rp(-n) : rp(n))
const tglKeg = (k) => (k.biaya ? tanggalKegiatan(k.biaya, true) : k.paket?.tahunAjaran ? `TA ${k.paket.tahunAjaran}` : '') || 'Tanggal belum diisi'
const persen = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)

/** Status singkat: belum ada pengeluaran / sisa / nombok. */
function status(k) {
  if (!k.terpakai) return { teks: 'Belum ada pengeluaran', warna: 'grey', bar: '#C9D0DC' }
  if (k.sisa >= 0) return { teks: `Sisa ${rp(k.sisa)}`, warna: 'green', bar: '#F2994A' }
  return { teks: `Nombok ${rp(-k.sisa)}`, warna: 'red', bar: '#EF4444' }
}

export default function LaporanKegiatan() {
  const { biaya, paket, siswa, pengaturan, toast, boleh } = useData()
  const [pengeluaran, setPengeluaran] = useState(null)
  const [galat, setGalat] = useState('')
  const [versi, setVersi] = useState(0)
  const [pilih, setPilih] = useState(null) // kunci kegiatan terpilih
  const [bukaHp, setBukaHp] = useState(false) // HP: sedang melihat rincian
  const [unduh, setUnduh] = useState('')
  const atas = useRef(null)

  useEffect(() => {
    let aktif = true
    setGalat('')
    api.kasPengeluaranKegiatan().then((d) => aktif && setPengeluaran(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [versi])

  const daftar = useMemo(
    () => (pengeluaran ? hitungRekapKegiatan({ biaya, paket, siswa, pengeluaran }) : []),
    [pengeluaran, biaya, paket, siswa],
  )
  const terpilih = daftar.find((k) => k.kunci === pilih) || daftar.find((k) => k.terpakai > 0) || daftar[0] || null
  const total = daftar.reduce((t, k) => ({ masuk: t.masuk + k.masuk, terpakai: t.terpakai + k.terpakai, nota: t.nota + k.nota.length }), { masuk: 0, terpakai: 0, nota: 0 })
  const nombok = daftar.filter((k) => k.sisa < 0 && k.terpakai > 0)

  const buka = (k) => {
    setPilih(k.kunci)
    setBukaHp(true)
    requestAnimationFrame(() => atas.current?.scrollIntoView({ block: 'start' }))
  }

  const unduhExcel = async (satu) => {
    if (unduh) return
    setUnduh(satu ? 'excel1' : 'excel')
    try {
      const { unduhExcelKegiatan } = await import('../lib/exportKegiatan.js')
      await unduhExcelKegiatan({ daftar: satu ? [satu] : daftar, pengaturan, satu: !!satu })
      toast('Rekap kegiatan berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat file Excel: ' + e.message)
    } finally {
      setUnduh('')
    }
  }

  const unduhNota = async (k) => {
    if (unduh) return
    setUnduh('zip')
    try {
      const { buatZip } = await import('../lib/zip.js')
      const berkas = []
      for (const alamat of k.nota) {
        const isi = await api.blobNota(alamat)
        if (isi) berkas.push({ nama: namaFileNota(k.rincian, alamat), isi })
      }
      // foto format lama (belum dipindah ke penyimpanan foto)
      for (const r of k.rincian.filter((x) => x.notaLama && !(x.notaFile || []).length)) {
        const [n] = await api.notaKas(r.id)
        if (n?.url) berkas.push({ nama: namaFileNota([{ ...r, notaFile: ['lama.jpg'] }], 'lama.jpg'), isi: await (await fetch(n.url)).blob() })
      }
      if (!berkas.length) return toast('Belum ada foto nota untuk kegiatan ini')
      const zip = await buatZip(berkas)
      saveAs(zip, `Nota-${k.nama.replace(/[^a-z0-9]+/gi, '-')}.zip`)
      toast(`${berkas.length} foto nota diunduh`)
    } catch (e) {
      toast('Gagal mengunduh nota: ' + e.message)
    } finally {
      setUnduh('')
    }
  }

  if (galat) {
    return (
      <div className="card mt-4 text-center">
        <p className="text-[13.5px] font-semibold text-danger">{galat}</p>
        <button className="mt-3 rounded-xl bg-isi px-4 py-2 text-[13px] font-bold" onClick={() => setVersi((v) => v + 1)}>Coba lagi</button>
      </div>
    )
  }
  if (!pengeluaran) return <div className="card mt-4"><Kosong>Memuat rekap kegiatan…</Kosong></div>
  if (!daftar.length) {
    return <div className="card mt-4"><Kosong>Belum ada kegiatan. Tambahkan biaya kegiatan di menu Jenis biaya.</Kosong></div>
  }

  return (
    <div ref={atas} className="mt-4 scroll-mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,370px)] lg:items-start lg:gap-6">
      {/* ---------- semua kegiatan ---------- */}
      <div className={`min-w-0 ${bukaHp ? 'hidden lg:block' : ''}`}>
        <div className="mb-3 flex items-end justify-between gap-2 px-1">
          <h2 className="judul-kartu text-[19px]">Rekap kegiatan</h2>
          <span className="text-[12px] font-extrabold text-[#34405C] dark:text-[#B8C3DC]">Tahun ajaran {pengaturan.tahunAjaran}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
          {[['Uang masuk', total.masuk, 'tosca'], ['Terpakai', total.terpakai, 'pink'], ['Sisa dana semua kegiatan', total.masuk - total.terpakai, 'biru']].map(([l, v, w], i) => (
            <div key={l} className={`permen permen-${w} min-w-0 rounded-[18px] px-3 py-2.5 lg:px-4 lg:py-3 ${i === 2 ? 'col-span-2 flex items-center justify-between gap-2 lg:col-span-1 lg:block' : ''}`}>
              <div className="text-[11.5px] font-extrabold lg:text-[12px]">{l}</div>
              <div className="truncate font-display text-[17px] font-bold lg:text-[20px]">{rpTanda(v)}</div>
            </div>
          ))}
        </div>

        {/* HP: kartu */}
        <div className="card mt-3 lg:hidden">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="judul-kartu text-[17px]">Semua kegiatan</div>
              <div className="text-[12px] text-muted">Uang masuk dari orang tua vs pengeluaran</div>
            </div>
            <button className="mt-0.5 shrink-0 text-[12.5px] font-extrabold text-brand disabled:opacity-50" disabled={!!unduh} onClick={() => unduhExcel(null)}>
              {unduh === 'excel' ? 'Menyiapkan…' : 'Excel ›'}
            </button>
          </div>
          {daftar.map((k, i) => {
            const st = status(k)
            return (
              <button key={k.kunci} className={`block w-full py-3 text-left ${i ? 'border-t-[1.5px] border-dashed border-line' : ''}`} onClick={() => buka(k)}>
                <span className="flex items-center gap-3">
                  <GambarKegiatan emoji={k.emoji} size={42} className="rounded-[14px]" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-extrabold">{k.nama}</b>
                    <span className="block truncate text-[11.5px] font-semibold text-muted">{tglKeg(k)} · {k.rincian.length} rincian · masuk {rp(k.masuk)}</span>
                  </span>
                  <Chevron />
                </span>
                <span className="ml-[54px] mt-2 flex items-center gap-2.5">
                  <span className="min-w-0 flex-1"><Track persen={persen(k.terpakai, k.masuk || k.terpakai)} warna={st.bar} tinggi={6} /></span>
                  <Chip warna={st.warna}>{st.teks}</Chip>
                </span>
              </button>
            )
          })}
        </div>

        {/* PC: tabel */}
        <div className="card mt-4 hidden overflow-hidden !px-0 !pb-0 lg:block">
          <div className="grid grid-cols-[minmax(0,1fr)_88px_120px_120px_130px] gap-x-3 px-5 pb-2.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-muted">
            <span>Kegiatan</span><span className="text-right">Tanggal</span><span className="text-right">Uang masuk</span><span className="text-right">Terpakai</span><span className="text-right">Sisa / nombok</span>
          </div>
          {daftar.map((k) => {
            const on = terpilih?.kunci === k.kunci
            return (
              <button
                key={k.kunci}
                onClick={() => setPilih(k.kunci)}
                aria-pressed={on}
                className={`grid w-full grid-cols-[minmax(0,1fr)_88px_120px_120px_130px] items-center gap-x-3 border-t-[1.5px] border-dashed border-line px-5 py-2.5 text-left ${on ? 'bg-brand-soft/70 shadow-[inset_3px_0_0_#3B6EF6] dark:bg-white/5' : 'hover:bg-isi'}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <GambarKegiatan emoji={k.emoji} size={38} className="rounded-[12px]" />
                  <span className="min-w-0">
                    <b className="block truncate text-[13.5px] font-extrabold">{k.nama}</b>
                    <span className="block truncate text-[11.5px] font-semibold text-muted">{rp(k.nominal)}/siswa · {k.rincian.length} rincian</span>
                  </span>
                </span>
                <span className="text-right text-[12.5px] font-bold">{k.biaya ? tanggalKegiatan(k.biaya, true) || '—' : '—'}</span>
                <b className="text-right text-[13px] font-extrabold">{rp(k.masuk)}</b>
                <b className={`text-right text-[13px] font-extrabold ${k.terpakai ? 'text-danger' : 'text-muted'}`}>{k.terpakai ? rp(k.terpakai) : '—'}</b>
                <b className={`text-right text-[13.5px] font-extrabold ${!k.terpakai ? 'text-muted' : k.sisa < 0 ? 'text-danger' : 'text-ok-deep'}`}>{rpTanda(k.sisa)}</b>
              </button>
            )
          })}
          <div className="grid grid-cols-[minmax(0,1fr)_88px_120px_120px_130px] gap-x-3 border-t-2 border-line bg-isi px-5 py-3 text-[13px] font-extrabold">
            <span>Total {daftar.length} kegiatan</span><span />
            <span className="text-right">{rp(total.masuk)}</span>
            <span className="text-right text-danger">{rp(total.terpakai)}</span>
            <span className={`text-right ${total.masuk - total.terpakai < 0 ? 'text-danger' : 'text-ok-deep'}`}>{rpTanda(total.masuk - total.terpakai)}</span>
          </div>
        </div>
        <button className="tombol-putih mt-3 hidden h-[42px] items-center gap-2 rounded-[14px] px-4 text-[13.5px] font-extrabold disabled:opacity-60 lg:inline-flex" disabled={!!unduh} onClick={() => unduhExcel(null)}>
          <Ikon.excel size={17} />{unduh === 'excel' ? 'Menyiapkan…' : 'Unduh Excel semua kegiatan'}
        </button>

        {nombok.map((k) => (
          <Banner key={k.kunci} nada="warn" e="⚠️">
            <b>{k.nama} nombok {rp(-k.sisa)}.</b> Kekurangannya tertutup dari kas sekolah — bisa jadi bahan evaluasi nominal tahun depan.
          </Banner>
        ))}
        {total.terpakai === 0 && (
          <Banner e="💡">
            Belum ada pengeluaran berlabel kegiatan. Saat mencatat pengeluaran di menu Kas sekolah, pilih <b>Kegiatan</b> lalu isi rinciannya.
            Pengeluaran lama juga bisa ditandai dari detail transaksinya.
          </Banner>
        )}
      </div>

      {/* ---------- rincian satu kegiatan ---------- */}
      <div className={`min-w-0 ${bukaHp ? '' : 'hidden lg:block'}`}>
        {terpilih && (
          <RincianKegiatan
            k={terpilih}
            kembali={() => setBukaHp(false)}
            unduh={unduh}
            unduhExcel={() => unduhExcel(terpilih)}
            unduhNota={() => unduhNota(terpilih)}
            bisaCatat={boleh('kas')}
          />
        )}
      </div>
    </div>
  )
}

function RincianKegiatan({ k, kembali, unduh, unduhExcel, unduhNota, bisaCatat }) {
  const nav = useNavigate()
  const [lihat, setLihat] = useState(null) // baris rincian yang dibuka (foto nota)
  const minus = k.sisa < 0 && k.terpakai > 0
  const jmlNota = k.nota.length + (k.notaLama || 0)
  const keTagihan = () => nav(`/guru/tagihan?jenis=${k.jenis === 'kegiatan' ? 'kegiatan' : k.jenis}`)
  const tambah = () => nav('/guru/kas', { state: { catat: 'keluar', kegiatan: k.kunci } })

  return (
    <div className="grid gap-3">
      <button className="flex w-fit items-center gap-1.5 rounded-full bg-kartu/80 px-3 py-1.5 text-[13px] font-extrabold text-brand lg:hidden dark:bg-white/10" onClick={kembali}>
        <Ikon.kembali size={16} />Semua kegiatan
      </button>

      {/* kartu dana */}
      <div className={`${minus ? 'kartu-dana-minus' : 'kartu-dana'} relative overflow-hidden rounded-[26px] p-4`}>
        <div className="flex items-center gap-3">
          <GambarKegiatan emoji={k.emoji} size={48} className="rounded-[15px]" />
          <div className="min-w-0">
            <div className="truncate font-display text-[21px] font-bold leading-tight">{k.nama}</div>
            <div className="text-[12px] font-extrabold opacity-90">{tglKeg(k)} · {rp(k.nominal)}/siswa</div>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-[16px] bg-white/60 px-3 py-2 dark:bg-white/10">
            <div className="text-[11px] font-extrabold">Uang masuk</div>
            <div className="truncate font-display text-[18px] font-bold">{rp(k.masuk)}</div>
          </div>
          <div className="min-w-0 rounded-[16px] bg-white/60 px-3 py-2 dark:bg-white/10">
            <div className="text-[11px] font-extrabold">Terpakai</div>
            <div className="truncate font-display text-[18px] font-bold text-danger dark:text-[#FFB4B4]">{rp(k.terpakai)}</div>
          </div>
        </div>
        <div className="mt-3"><Track persen={persen(k.terpakai, k.masuk || k.terpakai)} warna={minus ? '#EF4444' : '#EF6C4A'} tinggi={10} /></div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="text-[11.5px] font-extrabold">
            {k.masuk ? `${persen(k.terpakai, k.masuk)}% dana terpakai` : k.terpakai ? 'Belum ada uang masuk' : 'Belum ada pengeluaran'}
          </span>
          <span className="text-right">
            <span className="block text-[11px] font-extrabold">{minus ? 'Nombok' : 'Sisa dana'}</span>
            <b className="font-display text-[24px] font-bold leading-none">{rp(Math.abs(k.sisa))}</b>
          </span>
        </div>
      </div>

      {/* uang masuk */}
      <div className="card">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="judul-kartu text-[17px]">Uang masuk</div>
            <div className="text-[12px] text-muted">Dari pembayaran orang tua · {k.siswa} siswa</div>
          </div>
          <button className="mt-0.5 shrink-0 text-[12.5px] font-extrabold text-brand" onClick={keTagihan}>Lihat siswa ›</button>
        </div>
        <div className="flex justify-between gap-2 text-[12.5px] font-extrabold">
          <span className="min-w-0 truncate">{rp(k.masuk)} dari {rp(k.target)}</span>
          <span className="shrink-0 text-muted">{persen(k.masuk, k.target)}%</span>
        </div>
        <div className="mb-2.5 mt-1.5"><Track persen={persen(k.masuk, k.target)} tinggi={8} /></div>
        <div className="flex flex-wrap gap-1.5">
          <Chip warna="green">{k.lunas} siswa lunas</Chip>
          {k.sebagian > 0 && <Chip warna="amber">{k.sebagian} sebagian</Chip>}
          {k.belum > 0 && <Chip warna="red">{k.belum} belum bayar</Chip>}
        </div>
      </div>

      {/* per kategori */}
      <div className="card">
        <div className="judul-kartu text-[17px]">Pengeluaran per kategori</div>
        <div className="mb-1 text-[12px] text-muted">{k.rincian.length} rincian · total {rp(k.terpakai)}</div>
        {k.perKategori.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted">Belum ada pengeluaran untuk kegiatan ini.</p>
        ) : k.perKategori.map((x) => (
          <div key={x.kategori} className="flex items-center gap-2.5 py-1.5">
            <span className={`permen permen-kecil permen-${warnaKategoriKegiatan(x.kategori)} grid h-8 w-8 shrink-0 place-items-center rounded-[11px] text-[15px]`} style={FONT_EMOJI}>{emojiKategori(x.kategori, 'keluar')}</span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2 text-[12.5px] font-extrabold"><span className="truncate">{x.kategori}</span><span className="shrink-0">{rp(x.nominal)}</span></span>
              <span className="mt-1 block"><Track persen={Math.max(3, persen(x.nominal, k.terpakai))} warna="#F2994A" tinggi={6} /></span>
            </span>
          </div>
        ))}
      </div>

      {/* rincian */}
      <div className="card">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <div className="judul-kartu text-[17px]">Rincian pengeluaran</div>
            <div className="text-[12px] text-muted">Diurutkan menurut tanggal</div>
          </div>
          {bisaCatat && <button className="mt-0.5 shrink-0 text-[12.5px] font-extrabold text-brand" onClick={tambah}>+ Tambah ›</button>}
        </div>
        {k.rincian.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted">Belum ada. {bisaCatat ? 'Ketuk "+ Tambah" untuk mencatat pengeluaran kegiatan ini.' : ''}</p>
        ) : k.rincian.map((r, i) => {
          const adaNota = (r.notaFile || []).length > 0 || r.notaLama
          return (
            <button key={r.id} className={`flex w-full items-center gap-2.5 py-2.5 text-left ${i ? 'border-t-[1.5px] border-dashed border-line' : ''}`} onClick={() => setLihat(r)}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[16px] ${adaNota ? 'bg-[#FFF8E6] dark:bg-white/10' : 'bg-isi'}`} style={FONT_EMOJI} aria-hidden="true">
                {adaNota ? '🧾' : emojiKategori(r.kategori, 'keluar')}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px] font-extrabold">{r.uraian || r.kategori}</b>
                <span className="block truncate text-[11.5px] font-semibold text-muted">{tglKas(r.tanggal)} · {r.kategori}{adaNota ? ' · 📎 nota' : ''}</span>
              </span>
              <b className="shrink-0 text-[13px] font-extrabold text-danger">{rp(r.nominal)}</b>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button className="tombol-putih flex h-12 items-center justify-center gap-2 rounded-[16px] text-[13.5px] font-extrabold disabled:opacity-60" disabled={!!unduh} onClick={unduhExcel}>
          <Ikon.excel size={17} />{unduh === 'excel1' ? 'Menyiapkan…' : 'Unduh Excel'}
        </button>
        <button className="tombol-putih flex h-12 items-center justify-center gap-2 rounded-[16px] text-[13.5px] font-extrabold disabled:opacity-60" disabled={!!unduh || !jmlNota} onClick={unduhNota}>
          <Ikon.unduh size={17} />{unduh === 'zip' ? 'Menyiapkan…' : jmlNota ? `Unduh ${jmlNota} nota (ZIP)` : 'Belum ada nota'}
        </button>
      </div>

      <SheetRincian r={lihat} tutup={() => setLihat(null)} />
    </div>
  )
}

/** Satu rincian + foto notanya. */
function SheetRincian({ r, tutup }) {
  const [nota, setNota] = useState([])
  const [muat, setMuat] = useState(false)
  useEffect(() => {
    setNota([])
    if (!r) return
    const adaFile = (r.notaFile || []).length > 0
    if (!adaFile && !r.notaLama) return
    let aktif = true
    setMuat(true)
    ;(adaFile
      ? Promise.all(r.notaFile.map(async (a) => ({ alamat: a, url: await api.urlNota(a).catch(() => null) })))
      : api.notaKas(r.id))
      .then((d) => aktif && setNota(d))
      .catch(() => aktif && setNota([]))
      .finally(() => aktif && setMuat(false))
    return () => { aktif = false }
  }, [r])
  if (!r) return null
  return (
    <Sheet buka tutup={tutup} judul={r.uraian || r.kategori} lead={`${tglKas(r.tanggal, true)} · ${r.kategori}`}>
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted">Nominal</span>
          <b className="text-[20px] font-extrabold text-danger">−{rp(r.nominal)}</b>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 text-[13px]">
          <span className="font-semibold text-muted">Dicatat oleh</span>
          <b>{r.dicatatNama || '—'}</b>
        </div>
      </div>
      <div className="mb-2 mt-4 text-sm font-extrabold">Foto nota</div>
      <div className="card grid min-h-[110px] place-items-center gap-2 p-2" style={{ background: '#fff' }}>
        {muat ? <span className="text-[13px] text-muted">Memuat foto…</span>
          : nota.some((n) => n.url) ? nota.filter((n) => n.url).map((n, i) => (
            <a key={i} href={n.url} target="_blank" rel="noreferrer" aria-label={`Buka foto nota ${i + 1}`}>
              <img src={n.url} alt={`Nota ${i + 1}`} className="max-h-[360px] rounded-xl object-contain" />
            </a>
          ))
          : <span className="text-[13px] text-muted">Tidak ada foto nota.</span>}
      </div>
      <div className="h-4" />
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}
