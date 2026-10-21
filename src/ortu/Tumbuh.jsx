// Portal orang tua — tab "Tumbuh" (0052): ringkasan & grafik perkembangan, catatan guru,
// kabar kelas, rincian per kemampuan. Bagian tanpa isi TIDAK ditampilkan (tanpa kotak kosong).
// Tanpa peringkat / perbandingan antar-anak.
import { useState } from 'react'
import { AvatarStaf } from '../components/Avatar.jsx'
import { JudulAnak } from './Beranda.jsx'
import { DeretFoto, LihatFoto, IkonT } from '../tumbuh/bagian.jsx'
import { RingkasTumbuh, GrafikAspek, KartuKemampuan, KeteranganSkala, Tunas, seriAspek } from '../tumbuh/grafik.jsx'
import { pakaiSkala, waktuSingkat, namaKelas } from '../tumbuh/skala.js'

const KOSONG = { periode: [], catatan: [], kabar: [], guru: null }
const TIAP = { minggu: 'setiap minggu', '2minggu': 'setiap 2 minggu', bulan: 'sebulan sekali', tema: 'setiap tema' }

export default function Tumbuh({ aktif, tumbuh }) {
  const [foto, setFoto] = useState(null)
  const [semuaCatatan, setSemuaCatatan] = useState(false)
  const [semuaKabar, setSemuaKabar] = useState(false)
  const panggil = aktif.panggilan || aktif.nama.split(' ')[0]
  const ta = tumbuh.anak.find((a) => a.siswaId === aktif.id) || KOSONG
  const skala = tumbuh.atur.skala
  const aspek = tumbuh.aspek
  const periode = ta.periode
  const adaNilai = pakaiSkala(skala) && periode.length > 0 && seriAspek(aspek, periode).length > 0
  const adaCerita = ta.catatan.length > 0 || ta.kabar.length > 0
  const baru = ta.catatan.filter((c) => Date.now() - new Date(c.waktu).getTime() < 7 * 864e5).length
  const sub = [panggil, ta.kelas && namaKelas(ta.kelas), ta.guru && `Wali kelas ${ta.guru}`].filter(Boolean).join(' · ')

  const cerita = adaCerita && (
    <div>
      {ta.catatan.length > 0 && (
        <>
          <div className="seghead relative z-[2] lg:mt-0">
            <h2>Catatan untuk {panggil}</h2>
            {baru > 0 && <span className="chip bg-pink-100 text-[#86154A] dark:bg-pink-500/20 dark:text-pink-200">{baru} baru</span>}
          </div>
          <div className="grid gap-3">
            {(semuaCatatan ? ta.catatan : ta.catatan.slice(0, 3)).map((c) => <KartuCatatan key={c.id} c={c} aspek={aspek} buka={setFoto} />)}
          </div>
          {ta.catatan.length > 3 && !semuaCatatan && <TombolSemua onClick={() => setSemuaCatatan(true)}>Lihat {ta.catatan.length - 3} catatan lainnya</TombolSemua>}
        </>
      )}
      {ta.kabar.length > 0 && (
        <>
          <div className={`seghead relative z-[2] ${ta.catatan.length ? '' : 'lg:mt-0'}`}><h2>Kabar {namaKelas(ta.kelas)}</h2></div>
          <div className="grid gap-3">
            {(semuaKabar ? ta.kabar : ta.kabar.slice(0, 2)).map((k) => <KartuKabar key={k.id} k={k} buka={setFoto} />)}
          </div>
          {ta.kabar.length > 2 && !semuaKabar && <TombolSemua onClick={() => setSemuaKabar(true)}>Lihat {ta.kabar.length - 2} kabar sebelumnya</TombolSemua>}
        </>
      )}
    </div>
  )

  const rincian = (atas) => (
    <>
      <div className={`seghead relative z-[2] ${atas ? 'lg:mt-0' : 'lg:mb-0 lg:mt-2'}`}><h2>Rincian per kemampuan</h2></div>
      <div className="grid gap-3">
        {aspek.map((a, i) => <KartuKemampuan key={a.id} aspek={a} i={i} periode={periode} skala={skala} />)}
        <KeteranganSkala skala={skala} />
      </div>
    </>
  )

  return (
    <>
      <JudulAnak anak={aktif} judul="Tumbuh kembang" sub={sub} />

      {!adaNilai ? (
        <div className="mx-auto grid max-w-[640px] grid-cols-[minmax(0,1fr)] gap-3.5">
          {pakaiSkala(skala) && <PenilaianSegera panggil={panggil} tiap={TIAP[tumbuh.atur.periode]} />}
          {cerita}
          {!adaCerita && !pakaiSkala(skala) && (
            <section className="card flex items-center gap-3.5 !p-4">
              <Tunas className="h-16 w-16 shrink-0" kecil />
              <p className="text-[13.5px] font-semibold leading-relaxed">
                Catatan & kabar dari {ta.guru || 'guru kelas'} tentang {panggil} akan muncul di sini.
              </p>
            </section>
          )}
        </div>
      ) : adaCerita ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
            <RingkasTumbuh aspek={aspek} periode={periode} panggil={panggil} />
            <GrafikAspek aspek={aspek} periode={periode} skala={skala} />
            <div className="hidden lg:contents">{rincian(false)}</div>
          </div>
          <div>
            {cerita}
            <div className="lg:hidden">{rincian(false)}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
            <RingkasTumbuh aspek={aspek} periode={periode} panggil={panggil} />
            <GrafikAspek aspek={aspek} periode={periode} skala={skala} />
          </div>
          <div>{rincian(true)}</div>
        </div>
      )}

      {adaNilai ? (
        <p className="sub-halaman mb-5 mt-4 px-3 text-center text-[12px] font-bold leading-relaxed">
          Penilaian ini untuk melihat perkembangan {panggil} dari waktu ke waktu, bukan untuk dibandingkan dengan teman-temannya.
        </p>
      ) : <div className="h-5" />}
      <LihatFoto alamat={foto} tutup={() => setFoto(null)} />
    </>
  )
}

function TombolSemua({ children, onClick }) {
  return <button onClick={onClick} className="mt-2.5 w-full rounded-[16px] py-2.5 text-[13px] font-extrabold text-brand">{children}</button>
}

function KartuCatatan({ c, aspek, buka }) {
  const a = c.aspekId && aspek.find((x) => x.id === c.aspekId)
  return (
    <article className="card !p-4">
      <header className="flex items-center gap-2.5">
        <AvatarStaf nama={c.penulis || 'Guru kelas'} avatar={c.avatar} size={40} />
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-extrabold leading-tight">{c.penulis || 'Guru kelas'}</b>
          <span className="block text-[12px] font-semibold text-muted">{waktuSingkat(c.waktu)}{a ? ` · ${a.pendek}` : ''}</span>
        </span>
      </header>
      <p className="mt-3 whitespace-pre-line text-[14px] font-semibold leading-relaxed">{c.teks}</p>
      {c.foto?.length > 0 && <DeretFoto foto={c.foto} buka={buka} className="mt-3 overflow-hidden rounded-[16px]" />}
    </article>
  )
}

function KartuKabar({ k, buka }) {
  const adaFoto = k.foto?.length > 0
  return (
    <article className="card overflow-hidden !p-0">
      {adaFoto && <DeretFoto foto={k.foto} buka={buka} />}
      <div className="p-4">
        {adaFoto ? (
          <span className="text-[12px] font-bold text-muted">{waktuSingkat(k.waktu)} · {k.penulis}</span>
        ) : (
          <header className="mb-2 flex items-center gap-2.5">
            <span className="permen permen-kecil permen-kuning grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"><IkonT.tunas size={18} /></span>
            <span className="text-[12px] font-bold text-muted">{waktuSingkat(k.waktu)} · {k.penulis}</span>
          </header>
        )}
        <p className="mt-1 whitespace-pre-line text-[14px] font-semibold leading-relaxed">{k.teks}</p>
      </div>
    </article>
  )
}

/** Belum ada penilaian terbit: satu kartu ramah, bukan halaman kosong. */
function PenilaianSegera({ panggil, tiap }) {
  return (
    <section className="kartu-saldo relative overflow-hidden rounded-[26px] p-4 pr-[110px]">
      <span className="text-[11px] font-extrabold uppercase tracking-[.08em]">Segera hadir</span>
      <b className="mt-1.5 block font-display text-[22px] font-bold leading-[1.15]">Grafik perkembangan {panggil}</b>
      <p className="mt-1.5 text-[12.5px] font-bold leading-snug">Guru kelas menilai {tiap}. Begitu penilaian pertama terbit, grafiknya tampil di sini.</p>
      <Tunas className="pointer-events-none absolute -bottom-1 right-3 h-[92px] w-[92px]" kecil />
    </section>
  )
}
