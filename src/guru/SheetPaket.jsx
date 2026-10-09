/**
 * Form buat / ubah paket PMB & Daftar ulang (dibuka dari Jenis biaya).
 *
 *  1. Jenis (PMB / Daftar ulang) & tahun ajaran
 *  2. Rincian biaya — informasi untuk orang tua; totalnya = tagihan per siswa
 *  3. Jadwal cicilan (opsional) — tahap + jatuh tempo; orang tua tetap boleh
 *     membayar berapa saja, jadwal hanya untuk pengingat & status "terlambat"
 *  4. Ditagihkan ke — per kelas atau pilih siswa satu per satu
 *
 * Semua aturan juga diperiksa ulang di database (0033_pmb_daftar_ulang.sql).
 */
import { useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { Ikon, KolomCari, Sheet } from '../components/ui.jsx'
import InputTanggal from '../components/InputTanggal.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { rp, tahunAjaranBerjalan } from '../lib/format.js'
import { EMOJI_JENIS, LABEL_JENIS, LABEL_PANJANG, tahunAjaranBerikut, totalRincian } from '../lib/paket.js'

const CONTOH_RINCIAN = {
  pmb: ['Formulir pendaftaran', 'Uang gedung & sarana', 'Seragam', 'Buku, LKS & alat tulis', 'Kegiatan setahun'],
  du: ['Kegiatan setahun', 'Buku & LKS', 'Seragam', 'Pemeliharaan sarana', 'Asuransi & kartu pelajar'],
}

const barisKosong = () => ({ nama: '', nominal: '' })

export default function SheetPaket({ buka, tutup, paketId = null, jenisAwal = 'pmb' }) {
  const { paket, siswa, pembayaran, simpanPaket, hapusPaket, toast, cegahKunci } = useData()
  const lama = paket.find((p) => p.id === paketId) || null
  const taKini = tahunAjaranBerjalan()

  const [jenis, setJenis] = useState(jenisAwal)
  const [ta, setTa] = useState(taKini)
  const [nama, setNama] = useState('')
  const [namaManual, setNamaManual] = useState(false)
  const [rincian, setRincian] = useState([barisKosong()])
  const [pakaiTahap, setPakaiTahap] = useState(false)
  const [tahap, setTahap] = useState([])
  const [dipilih, setDipilih] = useState(() => new Set())
  const [bukaDaftar, setBukaDaftar] = useState(false)
  const [cari, setCari] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [yakinHapus, setYakinHapus] = useState(false)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    if (!buka) return
    setGalat('')
    setYakinHapus(false)
    setBukaDaftar(false)
    setCari('')
    if (lama) {
      setJenis(lama.jenis)
      setTa(lama.tahunAjaran)
      setNama(lama.nama)
      setNamaManual(true)
      setRincian(lama.rincian.map((r) => ({ ...r })))
      setPakaiTahap(lama.tahap.length > 0)
      setTahap(lama.tahap.map((t) => ({ ...t })))
      setDipilih(new Set(lama.siswaIds))
    } else {
      setJenis(jenisAwal)
      // tahun ajaran yang belum punya paket jenis ini (biasanya tahun berjalan / tahun depan)
      const sudah = new Set(paket.filter((p) => p.jenis === jenisAwal).map((p) => p.tahunAjaran))
      setTa(sudah.has(taKini) ? tahunAjaranBerikut(taKini) : taKini)
      setNamaManual(false)
      setRincian([barisKosong()])
      setPakaiTahap(false)
      setTahap([])
      setDipilih(new Set())
    }
  }, [buka, paketId])

  // nama otomatis mengikuti jenis & tahun ajaran sampai diubah sendiri
  useEffect(() => {
    if (!namaManual) setNama(`${LABEL_JENIS[jenis]} ${ta}`)
  }, [jenis, ta, namaManual])

  const total = totalRincian(rincian)
  const jumlahTahap = tahap.reduce((t, x) => t + (Number(x.nominal) || 0), 0)
  const sudahBayar = useMemo(
    () => new Set(lama ? pembayaran.filter((p) => p.jenis === 'paket' && p.paketId === lama.id).map((p) => p.siswaId) : []),
    [lama, pembayaran]
  )
  const kelas = useMemo(() => [...new Set(siswa.map((s) => s.kelas))].sort(), [siswa])
  const pilihanTa = [...new Set([taKini, tahunAjaranBerikut(taKini), ...(lama ? [lama.tahunAjaran] : [])])].sort()

  /* ---------- rincian ---------- */
  const ubahRincian = (i, u) => setRincian((r) => r.map((x, j) => (j === i ? { ...x, ...u } : x)))
  const hapusRincian = (i) => setRincian((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [barisKosong()]))
  const isiContoh = () => setRincian(CONTOH_RINCIAN[jenis].map((n) => ({ nama: n, nominal: '' })))

  /* ---------- tahap ---------- */
  const nyalakanTahap = (on) => {
    setPakaiTahap(on)
    if (on && tahap.length === 0) bagiRata(3)
  }
  /**
   * Bagi total ke n tahap (dibulatkan ribuan; sisa pembulatan masuk tahap terakhir).
   * Tanggal usulan: paket tahun ajaran DEPAN → Mei, Juni, Juli, … sebelum tahun
   * ajaran mulai; paket tahun BERJALAN → tanggal 15 mulai bulan depan.
   */
  function bagiRata(n = tahap.length || 3) {
    const per = Math.floor(total / n / 1000) * 1000
    const awal = Number(String(ta).slice(0, 4))
    const kini = new Date()
    const mulai = ta === taKini ? new Date(kini.getFullYear(), kini.getMonth() + 1, 15) : new Date(awal, 4, 15)
    setTahap(
      Array.from({ length: n }, (_, i) => {
        const d = new Date(mulai.getFullYear(), mulai.getMonth() + i, 15)
        return {
          nama: `Tahap ${i + 1}`,
          jatuhTempo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`,
          nominal: i === n - 1 ? total - per * (n - 1) : per,
        }
      })
    )
  }
  const ubahTahap = (i, u) => setTahap((t) => t.map((x, j) => (j === i ? { ...x, ...u } : x)))
  const tambahTahap = () =>
    setTahap((t) => [...t, { nama: `Tahap ${t.length + 1}`, jatuhTempo: '', nominal: Math.max(0, total - t.reduce((n, x) => n + (Number(x.nominal) || 0), 0)) }])
  const hapusTahap = (i) => setTahap((t) => t.filter((_, j) => j !== i).map((x, j) => ({ ...x, nama: /^Tahap \d+$/.test(x.nama) ? `Tahap ${j + 1}` : x.nama })))

  /* ---------- siswa ---------- */
  const siswaKelas = (k) => siswa.filter((s) => s.kelas === k)
  const kelasPenuh = (k) => siswaKelas(k).length > 0 && siswaKelas(k).every((s) => dipilih.has(s.id))
  const aturKelas = (k) => {
    const penuh = kelasPenuh(k)
    setDipilih((d) => {
      const baru = new Set(d)
      siswaKelas(k).forEach((s) => (penuh && !sudahBayar.has(s.id) ? baru.delete(s.id) : baru.add(s.id)))
      return baru
    })
  }
  const aturSiswa = (id) => {
    if (sudahBayar.has(id)) return toast('Siswa ini sudah membayar paket ini, jadi tetap ditagih.')
    setDipilih((d) => {
      const baru = new Set(d)
      baru.has(id) ? baru.delete(id) : baru.add(id)
      return baru
    })
  }
  const daftarSiswa = siswa.filter((s) => !cari || s.nama.toLowerCase().includes(cari.toLowerCase()) || s.kelas.toLowerCase() === cari.toLowerCase())

  /* ---------- simpan ---------- */
  const periksa = () => {
    const isi = rincian.filter((r) => r.nama.trim() || Number(r.nominal))
    if (!nama.trim()) return 'Nama paket belum diisi'
    if (!isi.length) return 'Isi minimal satu rincian biaya'
    const kosong = isi.find((r) => !r.nama.trim() || !(Number(r.nominal) > 0))
    if (kosong) return kosong.nama.trim() ? `Nominal "${kosong.nama.trim()}" belum diisi` : 'Ada rincian yang belum diberi nama'
    if (pakaiTahap) {
      if (!tahap.length) return 'Tambahkan minimal satu tahap, atau matikan jadwal cicilan'
      if (tahap.some((t) => !t.jatuhTempo)) return 'Isi tanggal jatuh tempo semua tahap'
      if (tahap.some((t) => !(Number(t.nominal) > 0))) return 'Isi nominal semua tahap'
      for (let i = 1; i < tahap.length; i++) if (tahap[i].jatuhTempo <= tahap[i - 1].jatuhTempo) return `Tanggal ${tahap[i].nama} harus setelah ${tahap[i - 1].nama}`
      if (jumlahTahap !== total) return `Jumlah tahap ${rp(jumlahTahap)} belum sama dengan total ${rp(total)}`
    }
    return ''
  }

  const simpan = async () => {
    if (cegahKunci('simpan paket')) return
    const salah = periksa()
    if (salah) return setGalat(salah)
    setGalat('')
    setSibuk(true)
    try {
      await simpanPaket({
        id: lama?.id || null,
        jenis,
        tahunAjaran: ta,
        nama: nama.trim(),
        rincian: rincian.filter((r) => r.nama.trim()).map((r) => ({ nama: r.nama.trim(), nominal: Number(r.nominal) })),
        tahap: pakaiTahap ? tahap.map((t) => ({ nama: t.nama.trim() || '', jatuhTempo: t.jatuhTempo, nominal: Number(t.nominal) })) : [],
        siswaIds: [...dipilih],
      })
      toast(`${nama.trim()} disimpan · ditagihkan ke ${dipilih.size} siswa`)
      tutup()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  const hapus = async () => {
    setSibuk(true)
    try {
      const hasil = await hapusPaket(lama.id)
      toast(hasil === 'diarsipkan' ? `${lama.nama} diarsipkan — riwayat pembayarannya tetap tersimpan` : `${lama.nama} dihapus`)
      tutup()
    } catch {
      /* pesan ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  const label = 'mb-1.5 block text-[13px] font-bold'

  return (
    <Sheet
      buka={buka}
      tutup={() => !sibuk && tutup()}
      judul={lama ? `Ubah ${lama.nama}` : 'Paket PMB / daftar ulang'}
      lead="Rincian tampil di portal orang tua & kuitansi. Pembayaran boleh dicicil berapa saja."
    >
      {/* 1. jenis & tahun ajaran */}
      <span className={label}>Jenis paket</span>
      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        {['pmb', 'du'].map((j) => {
          const on = jenis === j
          return (
            <button
              key={j}
              type="button"
              disabled={!!lama}
              onClick={() => setJenis(j)}
              aria-pressed={on}
              className={`flex items-center gap-2.5 rounded-[18px] p-2.5 text-left disabled:cursor-default ${
                on ? `permen permen-kecil ${j === 'pmb' ? 'permen-pink' : 'permen-ungu'}` : 'tombol-putih opacity-80'
              } ${lama && !on ? 'hidden' : ''}`}
            >
              <GambarKegiatan emoji={EMOJI_JENIS[j]} size={36} className="rounded-[11px]" />
              <span className="min-w-0">
                <b className="block text-[13.5px] font-extrabold leading-tight">{LABEL_JENIS[j]}</b>
                <span className="block text-[11px] font-bold opacity-80">{j === 'pmb' ? 'Siswa baru' : 'Siswa lama'}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className={label}>Tahun ajaran</span>
          <select className="field-input" value={ta} onChange={(e) => setTa(e.target.value)}>
            {pilihanTa.map((t) => (
              <option key={t} value={t}>{t}{t === taKini ? ' (berjalan)' : ''}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Nama paket</span>
          <input className="field-input" maxLength={80} value={nama} onChange={(e) => { setNama(e.target.value); setNamaManual(true) }} />
        </label>
      </div>

      {/* 2. rincian */}
      <div className="card mb-3.5 !p-3.5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <div className="judul-kartu text-[16px]">Rincian biaya</div>
            <div className="text-[11.5px] font-semibold text-muted">{LABEL_PANJANG[jenis]} — untuk informasi orang tua</div>
          </div>
          {rincian.length === 1 && !rincian[0].nama && (
            <button type="button" className="shrink-0 text-[12px] font-extrabold text-brand" onClick={isiContoh}>Isi contoh</button>
          )}
        </div>
        {rincian.map((r, i) => (
          <div key={i} className="flex items-center gap-2 border-b-[1.5px] border-dashed border-line py-2 last:border-b-0">
            <input
              className="field-input min-w-0 flex-1 !py-2.5 !text-[13.5px]"
              placeholder={CONTOH_RINCIAN[jenis][i] || 'Nama rincian'}
              maxLength={80}
              value={r.nama}
              onChange={(e) => ubahRincian(i, { nama: e.target.value })}
              aria-label={`Nama rincian ${i + 1}`}
            />
            <InputNominal className="w-[122px] shrink-0 [&_input]:!py-2.5 [&_input]:!pr-2 [&_input]:!text-[13.5px]" value={r.nominal} onChange={(v) => ubahRincian(i, { nominal: v })} placeholder="0" aria-label={`Nominal rincian ${i + 1}`} />
            <button type="button" onClick={() => hapusRincian(i)} className="grid h-9 w-8 shrink-0 place-items-center text-muted hover:text-danger" aria-label={`Hapus rincian ${i + 1}`}>
              <Ikon.plus size={18} className="rotate-45" />
            </button>
          </div>
        ))}
        {rincian.length < 20 && (
          <button type="button" onClick={() => setRincian((r) => [...r, barisKosong()])}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#B9CBEF] bg-brand-soft/40 py-2.5 text-[13px] font-extrabold text-brand dark:border-line">
            <Ikon.plus size={16} /> Tambah rincian
          </button>
        )}
        <div className="kotak-lunas mt-3 flex items-center justify-between rounded-[16px] px-3.5 py-2.5">
          <span className="text-[13px] font-extrabold">Total per siswa</span>
          <b className="font-display text-[22px] font-bold">{rp(total)}</b>
        </div>
      </div>

      {/* 3. jadwal cicilan */}
      <div className="card mb-3.5 !p-3.5">
        <label className="flex cursor-pointer items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="judul-kartu block text-[16px]">Jadwal cicilan</span>
            <span className="block text-[11.5px] font-semibold leading-snug text-muted">
              Opsional. Orang tua tetap boleh bayar berapa saja — jadwal ini untuk pengingat & status terlambat.
            </span>
          </span>
          <input type="checkbox" className="peer sr-only" checked={pakaiTahap} onChange={(e) => nyalakanTahap(e.target.checked)} />
          <span aria-hidden="true" className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${pakaiTahap ? 'bg-ok shadow-[inset_0_-2px_0_#169A48]' : 'bg-[#D7DEEA] dark:bg-white/15'}`}>
            <i className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${pakaiTahap ? 'left-[23px]' : 'left-[3px]'}`} />
          </span>
        </label>
        {pakaiTahap && (
          <>
            <div className="mt-2">
              {tahap.map((t, i) => (
                <div key={i} className="flex items-center gap-2 border-b-[1.5px] border-dashed border-line py-2 last:border-b-0">
                  <span className="permen permen-kecil permen-biru grid h-9 w-7 shrink-0 place-items-center rounded-[10px] font-display text-[14px] font-bold">{i + 1}</span>
                  <div className="min-w-0 flex-1"><InputTanggal kecil value={t.jatuhTempo} onChange={(v) => ubahTahap(i, { jatuhTempo: v })} placeholder="Jatuh tempo" aria-label={`Jatuh tempo tahap ${i + 1}`} className="!gap-1 !px-2.5 !py-2.5 !text-[12.5px]" /></div>
                  <InputNominal className="w-[112px] shrink-0 [&_input]:!py-2.5 [&_input]:!pr-2 [&_input]:!text-[13px]" value={t.nominal} onChange={(v) => ubahTahap(i, { nominal: v })} placeholder="0" aria-label={`Nominal tahap ${i + 1}`} />
                  <button type="button" onClick={() => hapusTahap(i)} className="grid h-9 w-7 shrink-0 place-items-center text-muted hover:text-danger" aria-label={`Hapus tahap ${i + 1}`}>
                    <Ikon.plus size={18} className="rotate-45" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tahap.length < 12 && (
                <button type="button" onClick={tambahTahap} className="tombol-putih rounded-pill px-3 py-1.5 text-[12px] font-extrabold">+ Tahap</button>
              )}
              {total > 0 && (
                <button type="button" onClick={() => bagiRata()} className="tombol-putih rounded-pill px-3 py-1.5 text-[12px] font-extrabold">Bagi rata</button>
              )}
              <span className={`ml-auto flex items-center gap-1 text-[12px] font-extrabold ${jumlahTahap === total && total > 0 ? 'text-ok-deep' : 'text-warn-deep'}`}>
                {jumlahTahap === total && total > 0 ? <><Ikon.cek size={15} /> Jumlah tahap = total</> : `Selisih ${rp(total - jumlahTahap)}`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 4. ditagihkan ke */}
      <div className="card mb-3.5 !p-3.5">
        <div className="judul-kartu text-[16px]">Ditagihkan ke</div>
        <div className="mb-2.5 text-[11.5px] font-semibold text-muted">
          {jenis === 'pmb' ? 'Biasanya siswa baru (kelas paling awal).' : 'Biasanya siswa lama yang naik kelas.'} Siswa baru nanti bisa langsung ditagih dari form Tambah siswa.
        </div>
        <div className="flex flex-wrap gap-2">
          {kelas.map((k) => {
            const on = kelasPenuh(k)
            return (
              <button key={k} type="button" onClick={() => aturKelas(k)} aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-pill px-3 py-2 text-[12.5px] font-extrabold ${on ? 'permen permen-kecil permen-tosca' : 'tombol-putih'}`}>
                {on && <Ikon.cek size={14} />}Kelas {k} · {siswaKelas(k).length}
              </button>
            )
          })}
          <button type="button" onClick={() => setBukaDaftar((b) => !b)} className="tombol-putih flex items-center gap-1.5 rounded-pill px-3 py-2 text-[12.5px] font-extrabold">
            <Ikon.siswa size={15} /> {bukaDaftar ? 'Tutup daftar' : 'Pilih siswa…'}
          </button>
        </div>
        <div className="mt-2.5 text-[12.5px] font-extrabold text-[#34405C] dark:text-[#B8C3DC]">{dipilih.size} siswa dipilih</div>
        {bukaDaftar && (
          <div className="mt-2.5">
            <KolomCari nilai={cari} ubah={setCari} placeholder="Cari nama atau kelas…" />
            <div className="noscroll mt-2 max-h-[280px] overflow-y-auto rounded-[16px] border-[1.5px] border-line">
              {daftarSiswa.map((s) => {
                const on = dipilih.has(s.id)
                const kunci = sudahBayar.has(s.id)
                return (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
                    <input type="checkbox" checked={on} onChange={() => aturSiswa(s.id)} className="h-[18px] w-[18px] accent-[#3B6EF6]" />
                    <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{s.nama}</span>
                    <span className="shrink-0 text-[11.5px] font-bold text-muted">{kunci ? 'sudah bayar' : `Kelas ${s.kelas}`}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {galat && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-bold text-danger">{galat}</p>}
      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={sibuk}>
        {sibuk ? 'Menyimpan…' : 'Simpan paket'}
      </button>
      {lama && (
        yakinHapus ? (
          <div className="mt-3 rounded-2xl bg-danger-soft p-3.5 text-[12.5px] font-semibold text-danger">
            {sudahBayar.size > 0
              ? `Sudah ada ${sudahBayar.size} siswa yang membayar. Paket akan diarsipkan (tidak tampil lagi di tagihan), riwayat & kuitansinya tetap tersimpan.`
              : 'Paket ini belum punya pembayaran dan akan dihapus.'}
            <div className="mt-2.5 flex gap-2">
              <button className="bigbtn-tutup !py-2.5 !text-[13px]" onClick={hapus} disabled={sibuk}>{sudahBayar.size > 0 ? 'Ya, arsipkan' : 'Ya, hapus'}</button>
              <button className="bigbtn-ghost !py-2.5 !text-[13px]" onClick={() => setYakinHapus(false)} disabled={sibuk}>Batal</button>
            </div>
          </div>
        ) : (
          <button className="mt-2.5 w-full py-2.5 text-[13px] font-extrabold text-danger" onClick={() => setYakinHapus(true)}>
            {sudahBayar.size > 0 ? 'Arsipkan paket' : 'Hapus paket'}
          </button>
        )
      )}
    </Sheet>
  )
}
