/**
 * Aplikasi GURU KELAS — /kelas (juga tumbuh.kasceria.my.id).
 * Terpisah dari aplikasi kas: guru kelas hanya melihat anak di kelasnya,
 * mengisi ceklis perkembangan, menulis catatan anak & kabar kelas.
 * Hak akses dijaga database (fungsi kelas_*, 0052) — bukan hanya tampilan.
 */
import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Muat, Sheet, Toast, Track, PilihTema } from '../components/ui.jsx'
import Avatar, { AvatarStaf } from '../components/Avatar.jsx'
import Masuk from '../components/Masuk.jsx'
import { KartuPasang } from '../components/PasangAplikasi.jsx'
import { DaftarVideo } from '../components/Panduan.jsx'
import { useAuth } from '../lib/auth.jsx'
import { MerekCtx } from '../lib/merek.js'
import { segarkanTema } from '../lib/tema.js'
import * as api from '../lib/api.js'
import * as t from '../tumbuh/api.js'
import { IkonT, Foto } from '../tumbuh/bagian.jsx'
import { pakaiSkala, waktuSingkat, namaKelas } from '../tumbuh/skala.js'
import { Bingkai, Gulir, BilahAtas, TabKelas, SampingKelas } from './bingkai.jsx'
import SheetTulis from './SheetTulis.jsx'
import Ceklis from './Ceklis.jsx'
import GabungKelas from './Gabung.jsx'
import { KepalaKelas, MEREK_KELAS, NAMA_APP } from './merek.jsx'
import { alamatKas } from '../lib/domain.js'

/** Pembungkus: identitas & warna "Tumbuh Ceria" untuk semua layar /kelas (juga layar masuk). */
export default function KelasApp() {
  useEffect(() => {
    // index.html sudah memasang kelas ini sebelum aplikasi dimuat; ini untuk pindah
    // halaman tanpa muat ulang (mis. dari /guru ke /kelas) dan dilepas saat keluar dari /kelas.
    const html = document.documentElement
    html.classList.add('tema-kelas'); segarkanTema()
    return () => { html.classList.remove('tema-kelas'); segarkanTema() }
  }, [])
  return (
    <MerekCtx.Provider value={MEREK_KELAS}>
      <AplikasiKelas />
    </MerekCtx.Provider>
  )
}

function AplikasiKelas() {
  const { sesi, siap, keluar, modeDemo } = useAuth()
  const [status, setStatus] = useState(null) // null | 'guru' | 'baru' | 'staf' | 'nonaktif' | {galat}
  const [data, setData] = useState(null)
  const [pesan, setPesan] = useState('')
  const toast = useCallback((m) => { setPesan(m); setTimeout(() => setPesan(''), 2600) }, [])

  const muat = useCallback(async () => {
    setStatus(null)
    try {
      const st = await t.kelasStatus()
      if (st !== 'guru') return setStatus(st)
      setData(await t.kelasAwal())
      setStatus('guru')
    } catch (e) {
      setStatus({ galat: e.message })
    }
  }, [])

  useEffect(() => { if (sesi) muat() }, [sesi, muat])

  if (!siap) return <Muat>Menyiapkan sesi…</Muat>
  if (!sesi) return <Masuk tujuan="/kelas" judulGoogle="Untuk guru kelas yang baru diundang, atau kalau lupa PIN." />
  if (status === null) return <Muat>Memuat kelas…</Muat>
  if (status?.galat) return <Muat aksi={muat}>Gagal memuat: {status.galat}</Muat>
  if (status === 'baru') return <GabungKelas onSelesai={muat} />
  if (status === 'staf') {
    return (
      <Muat aksi={() => { window.location.href = alamatKas() }} label="Buka aplikasi sekolah">
        Akun ini akun kepala sekolah / Admin/TU, bukan akun guru kelas. {NAMA_APP} khusus untuk guru kelas.
      </Muat>
    )
  }
  if (status === 'nonaktif') {
    return <Muat aksi={keluar} label="Keluar">Akun guru kelas ini sedang dinonaktifkan kepala sekolah. Hubungi pihak sekolah.</Muat>
  }

  return <Kelas data={data} setData={setData} muatUlang={muat} toast={toast} pesan={pesan} modeDemo={modeDemo} />
}

function Kelas({ data, setData, muatUlang, toast, pesan }) {
  const ke = useNavigate()
  const { pathname } = useLocation()
  const [tulis, setTulis] = useState(null) // awal SheetTulis
  const [pilihBagikan, setPilihBagikan] = useState(false)
  const adaCeklis = pakaiSkala(data.atur.skala)
  const aktif = pathname.includes('/anak') ? 'anak' : pathname.includes('/ceklis') ? 'ceklis' : pathname.includes('/lainnya') ? 'lainnya' : 'beranda'

  const segarkanTulisan = async () => {
    try { const tulisan = await t.kelasTulisan(); setData((d) => ({ ...d, tulisan })) } catch { /* biarkan */ }
  }
  const setPeriode = (periode) => setData((d) => ({ ...d, periode }))
  const tab = <TabKelas aktif={aktif} ke={ke} bagikan={() => setPilihBagikan(true)} adaCeklis={adaCeklis} />

  const samping = <SampingKelas data={data} aktif={aktif} ke={ke} bagikan={() => setPilihBagikan(true)} adaCeklis={adaCeklis} />

  return (
    <Bingkai samping={samping}>
      <Routes>
        <Route index element={<><Gulir><Beranda data={data} ke={ke} bukaTulis={setTulis} /></Gulir>{tab}</>} />
        <Route path="anak" element={<><Gulir><Anak data={data} ke={ke} bukaTulis={setTulis} /></Gulir>{tab}</>} />
        {adaCeklis && <Route path="ceklis" element={<Ceklis data={data} setPeriode={setPeriode} kembali={() => ke('/kelas')} toast={toast} />} />}
        <Route path="lainnya" element={<><Gulir><Lainnya data={data} setData={setData} muatUlang={muatUlang} toast={toast} /></Gulir>{tab}</>} />
        <Route path="*" element={<Navigate to="/kelas" replace />} />
      </Routes>

      <Sheet buka={pilihBagikan} tutup={() => setPilihBagikan(false)} judul="Bagikan ke orang tua" lead="Mau membagikan apa?">
        <div className="grid gap-2.5 pb-1">
          <PilihanBagikan warna="kuning" ikon={<IkonT.kamera size={22} />} judul="Kabar kelas" sub={`Cerita & foto untuk semua orang tua ${namaKelas(data.kelas)}`}
            onClick={() => { setPilihBagikan(false); setTulis({ jenis: 'kabar' }) }} />
          <PilihanBagikan warna="pink" ikon={<IkonT.pensil size={22} />} judul="Catatan anak" sub="Momen penting satu anak, hanya untuk orang tuanya"
            onClick={() => { setPilihBagikan(false); setTulis({ jenis: 'catatan' }) }} />
        </div>
      </Sheet>
      <SheetTulis awal={tulis} data={data} tutup={() => setTulis(null)}
        selesai={(m) => { setTulis(null); toast(m); segarkanTulisan() }} />
      <Toast pesan={pesan} />
    </Bingkai>
  )
}

function PilihanBagikan({ warna, ikon, judul, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3.5 rounded-[20px] border-[1.5px] border-[#DCE6F4] bg-kartu p-3.5 text-left transition hover:border-brand/50 active:scale-[.99] dark:border-line">
      <span className={`permen permen-${warna} grid h-12 w-12 shrink-0 place-items-center rounded-[16px]`}>{ikon}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-extrabold">{judul}</b>
        <span className="block text-[12.5px] font-semibold leading-snug text-muted">{sub}</span>
      </span>
      <IkonT.kanan size={18} className="text-[#C8CDD8]" />
    </button>
  )
}

/* ---------------- beranda kelas ---------------- */
function Beranda({ data, ke, bukaTulis }) {
  const p = data.periode
  const adaCeklis = pakaiSkala(data.atur.skala)
  const persen = p && p.anak ? Math.round((p.dinilai / p.anak) * 100) : 0
  const tutup = p?.selesai ? new Date(p.selesai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : null
  const jenis = { minggu: 'Mingguan', '2minggu': '2 mingguan', bulan: 'Bulanan', tema: 'Per tema' }[data.atur.periode]
  return (
    <>
      <BilahAtas data={data} ke={ke} />
      <KepalaKelas judul={namaKelas(data.kelas)} sub={`${data.siswa.length} anak · ${data.sekolah.nama}`} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-6">
      <div>
      {adaCeklis && (
        <section className="card relative overflow-hidden !p-4 lg:!p-5">
          <div className="flex items-start gap-3">
            <span className="permen permen-tosca grid h-12 w-12 shrink-0 place-items-center rounded-[16px]"><IkonT.papan size={24} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <b className="text-[16px] font-extrabold">{p ? `Ceklis ${p.label}` : 'Ceklis tema'}</b>
                <span className="chip bg-[#E7F8F2] text-[#0C5A47]">{jenis}</span>
                {p?.terbit && <span className="chip bg-ok-soft text-ok-deep">Terbit</span>}
              </div>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-muted">
                {!p ? 'Tulis tema yang sedang berjalan untuk mulai menilai'
                  : !p.fokus.length ? 'Pilih indikator yang dinilai periode ini'
                    : `${p.fokus.length} indikator fokus${tutup ? ` · tutup ${tutup}` : ''}`}
              </p>
            </div>
          </div>
          {p && p.fokus.length > 0 && (
            <>
              <div className="mt-3.5 flex items-center justify-between text-[12.5px] font-extrabold">
                <span>{p.dinilai} dari {p.anak} anak sudah dinilai</span>
                <span className="text-[#0C5A47] dark:text-[#5FDDB5]">{persen}%</span>
              </div>
              <div className="mt-1.5"><Track persen={persen} warna="#2BB894" tinggi={8} /></div>
            </>
          )}
          <button className="bigbtn mt-3.5 flex items-center justify-center gap-2" onClick={() => ke('/kelas/ceklis')}>
            {!p ? 'Mulai tema' : !p.fokus.length ? 'Pilih indikator' : p.terbit ? 'Lihat / ubah ceklis' : p.dinilai ? 'Lanjutkan ceklis' : 'Mulai ceklis'}
            <IkonT.kanan size={18} sw={2.6} />
          </button>
        </section>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-3 lg:mt-5 lg:gap-4">
        <AksiBagikan warna="kuning" ikon={<IkonT.kamera size={22} />} judul="Kabar kelas" sub="Cerita untuk semua orang tua" onClick={() => bukaTulis({ jenis: 'kabar' })} />
        <AksiBagikan warna="pink" ikon={<IkonT.pensil size={22} />} judul="Catatan anak" sub="Momen penting satu anak" onClick={() => bukaTulis({ jenis: 'catatan' })} />
      </div>

      </div>
      <div>
      <div className="seghead lg:!mt-0"><h2>Terakhir dibagikan</h2></div>
      {data.tulisan.length === 0 ? (
        <p className="mb-5 rounded-[20px] border-[1.5px] border-dashed border-[#C9D3E6] px-4 py-4 text-center text-[13px] font-semibold leading-relaxed text-muted dark:border-line">
          Belum ada yang dibagikan. Mulai dengan kabar kelas hari ini — cukup 1–2 kalimat.
        </p>
      ) : (
        <div className="card mb-5 !p-0">
          {data.tulisan.slice(0, 8).map((x) => <BarisTulisan key={x.id} x={x} data={data} buka={() => bukaTulis(x)} />)}
        </div>
      )}
      </div>
      </div>
    </>
  )
}

function AksiBagikan({ warna, ikon, judul, sub, onClick }) {
  return (
    <button onClick={onClick} className="card flex flex-col items-start gap-2.5 !p-3.5 text-left transition active:translate-y-px lg:flex-row lg:items-center lg:gap-3.5 lg:!p-4 lg:hover:-translate-y-0.5">
      <span className={`permen permen-${warna} grid h-11 w-11 place-items-center rounded-[15px]`}>{ikon}</span>
      <span>
        <b className="block text-[15px] font-extrabold leading-tight">{judul}</b>
        <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-muted">{sub}</span>
      </span>
    </button>
  )
}

function BarisTulisan({ x, data, buka }) {
  const anak = x.siswaId && data.siswa.find((s) => s.id === x.siswaId)
  const aspek = x.aspekId && data.aspek.find((a) => a.id === x.aspekId)
  return (
    <button onClick={buka} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left last:border-b-0">
      <span className="shrink-0">
        {x.foto?.length ? <Foto alamat={x.foto[0]} className="h-12 w-12 !rounded-[14px]" />
          : anak ? <Avatar nama={anak.nama} jenis={anak.jenis} avatar={anak.avatar} foto={anak.foto} size={48} />
            : <span className="permen permen-kuning grid h-12 w-12 place-items-center rounded-[14px]"><IkonT.kamera size={22} /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <b className="line-clamp-2 text-[14px] font-extrabold leading-snug">{x.teks}</b>
        <span className="block truncate text-[12px] font-semibold text-muted">
          {x.jenis === 'kabar' ? `Kabar kelas${x.foto?.length ? ` · ${x.foto.length} foto` : ''}` : `Catatan · ${anak ? anak.panggilan || anak.nama.split(' ')[0] : '—'}${aspek ? ` · ${aspek.pendek}` : ''}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {x.terbit ? <span className="chip bg-ok-soft text-ok-deep">Terbit</span> : <span className="chip bg-warn-soft text-warn-deep">Draf</span>}
        <span className="text-[11px] font-bold text-muted">{waktuSingkat(x.waktu)}</span>
      </span>
    </button>
  )
}

/* ---------------- daftar anak ---------------- */
function Anak({ data, ke, bukaTulis }) {
  const jumlah = (id) => data.tulisan.filter((x) => x.siswaId === id).length
  return (
    <>
      <BilahAtas data={data} ke={ke} />
      <KepalaKelas judul="Anak" sub={`${namaKelas(data.kelas)} · ketuk anak untuk menulis catatan`} />
      <div className="card mb-5 !p-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:!bg-transparent lg:!shadow-none 2xl:grid-cols-4">
        {data.siswa.map((a) => (
          <button key={a.id} onClick={() => bukaTulis({ jenis: 'catatan', siswaId: a.id })} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 lg:rounded-[20px] lg:border-b-0 lg:bg-kartu lg:px-4 lg:py-3.5 lg:shadow-[0_8px_24px_rgba(14,90,70,.08)] lg:transition lg:hover:-translate-y-0.5 dark:lg:shadow-none">
            <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={42} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-extrabold">{a.nama}</b>
              <span className="block text-[12px] font-semibold text-muted">{jumlah(a.id) ? `${jumlah(a.id)} catatan terakhir` : 'Belum ada catatan'}</span>
            </span>
            <span className="permen permen-kecil permen-pink grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"><IkonT.pensil size={17} /></span>
          </button>
        ))}
      </div>
    </>
  )
}

/* ---------------- akun ---------------- */
function Lainnya({ data, setData, toast }) {
  const { keluar, modeDemo } = useAuth()
  const ke = useNavigate()
  const [pin, setPin] = useState(false)
  const pinAktif = data.guru.pinAktif
  const matikan = async () => {
    try { await api.matikanPin(); setData((d) => ({ ...d, guru: { ...d.guru, pinAktif: false } })); toast('PIN dimatikan') } catch (e) { toast(e.message) }
  }
  return (
    <>
      <BilahAtas data={data} ke={ke} />
      <KepalaKelas judul="Akun saya" sub={`${namaKelas(data.kelas)} · ${data.sekolah.nama}`} />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div>
      <section className="card flex items-center gap-3 !p-4">
        <AvatarStaf nama={data.guru.nama} avatar={data.guru.avatar} size={52} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[16px] font-extrabold">{data.guru.nama}</b>
          <span className="block text-[12.5px] font-semibold text-muted">Guru kelas · {namaKelas(data.kelas)}</span>
        </span>
      </section>

      <div className="seghead"><h2>Masuk cepat dengan PIN</h2></div>
      <section className="card !p-4">
        <div className="flex items-start gap-3">
          <span className="permen permen-gembok grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"><IkonT.kunci size={21} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14.5px] font-extrabold">{pinAktif ? 'PIN aktif' : 'PIN belum aktif'}</b>
            <span className="block text-[12.5px] font-semibold leading-snug text-muted">
              {pinAktif ? 'Masuk cukup dengan email + PIN 6 angka.' : 'Buat PIN 6 angka supaya tidak perlu masuk Google setiap kali.'}
            </span>
          </span>
        </div>
        <div className={`mt-3 grid gap-2.5 ${pinAktif ? 'grid-cols-2' : ''}`}>
          <button className="bigbtn" onClick={() => setPin(true)}>{pinAktif ? 'Ubah PIN' : 'Buat PIN'}</button>
          {pinAktif && <button className="bigbtn-ghost" onClick={matikan}>Matikan</button>}
        </div>
      </section>

      </div>
      <div>
      <KartuPasang bagian="kelas" className="mt-5 lg:mt-0" />

      <DaftarVideo untuk="kelas" judul="Video panduan" />

      <div className="seghead"><h2>Tampilan</h2></div>
      <PilihTema />
      </div>
      </div>

      {!modeDemo && (
        <button className="mb-5 mt-5 w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger lg:w-auto lg:px-10" onClick={keluar}>Keluar</button>
      )}
      <div className="h-4" />
      <SheetPin buka={pin} tutup={() => setPin(false)} selesai={() => { setPin(false); setData((d) => ({ ...d, guru: { ...d.guru, pinAktif: true } })); toast('PIN tersimpan') }} />
    </>
  )
}

function SheetPin({ buka, tutup, selesai }) {
  const [pin, setPin] = useState('')
  const [ulang, setUlang] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => { if (buka) { setPin(''); setUlang(''); setGalat('') } }, [buka])
  const simpan = async () => {
    setGalat('')
    if (!/^\d{6}$/.test(pin)) return setGalat('PIN harus 6 angka.')
    if (api.pinLemah(pin)) return setGalat('PIN terlalu mudah ditebak — hindari angka sama semua atau berurutan.')
    if (pin !== ulang) return setGalat('Ulangi PIN belum sama.')
    setSibuk(true)
    try { await api.aturPin(pin); selesai() } catch (e) { setGalat(e.message) } finally { setSibuk(false) }
  }
  const kolom = 'field-input w-full text-center text-[22px] font-extrabold tracking-[.5em]'
  return (
    <Sheet buka={buka} tutup={tutup} judul="PIN 6 angka" lead="Dipakai untuk masuk cepat di HP ini dan HP lain.">
      <div className="grid gap-3 pb-1">
        <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" aria-label="PIN baru" className={kolom} />
        <input type="password" inputMode="numeric" maxLength={6} value={ulang} onChange={(e) => setUlang(e.target.value.replace(/\D/g, ''))} placeholder="ulangi" aria-label="Ulangi PIN" className={kolom} />
        {galat && <p className="text-center text-[13px] font-semibold text-danger">{galat}</p>}
        <button className="bigbtn disabled:opacity-60" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan…' : 'Simpan PIN'}</button>
      </div>
    </Sheet>
  )
}
