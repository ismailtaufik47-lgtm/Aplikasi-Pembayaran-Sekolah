import { useEffect, useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, Sheet, Tile, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { FONT_EMOJI, emojiKegiatan } from '../lib/emojiKegiatan.js'
import {
  BULAN, adaInfoKegiatan, bulanBerjalan, jarakKegiatan, nomorKuitansi, persenBayar, rp, statusSpp,
  tanggalKegiatan, teksJatuhTempo, waSekolah,
} from '../lib/format.js'

const gabungBulan = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} dan ${xs[xs.length - 1]}`)

/**
 * Kalimat status SPP untuk orang tua, memisahkan yang BARU DIBAYAR
 * SEBAGIAN dan yang BELUM DIBAYAR SAMA SEKALI, contoh:
 *   "SPP Juli baru dibayar sebagian (kurang Rp50.000), SPP Agustus belum
 *    dibayar. Jatuh tempo setiap akhir bulan."
 * null kalau tidak ada SPP yang perlu diperhatikan.
 */
export function kalimatSpp(anak, pengaturan, kini = bulanBerjalan()) {
  if (!anak) return null
  const sebagian = []
  const belum = []
  BULAN.forEach((b, i) => {
    const dibayar = anak.spp[i] || 0
    const st = statusSpp(dibayar, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
    if (st === 'sebagian') sebagian.push(`SPP ${b} baru dibayar sebagian (kurang ${rp(pengaturan.sppNominal - dibayar)})`)
    else if (st === 'nunggak' || st === 'belum-bayar') belum.push(b)
  })
  const bagian = [...sebagian]
  if (belum.length) bagian.push(`SPP ${gabungBulan(belum)} belum dibayar`)
  if (bagian.length === 0) return null
  return `${bagian.join(', ')}. Jatuh tempo setiap ${teksJatuhTempo(pengaturan.tanggalJatuhTempo)}.`
}

/**
 * Daftar pemberitahuan untuk satu anak — dihitung dari data asli, bukan
 * teks tetap: SPP yang perlu dibayar sekarang, kegiatan yang tinggal
 * seminggu lagi, lalu biaya kegiatan yang belum lunas. Kosong kalau
 * semuanya sudah beres.
 *
 * Setiap item punya `anggota` — daftar hal yang membentuknya (bulan SPP,
 * id kegiatan). Dipakai untuk menandai "sudah dibaca": angka di lonceng
 * hanya menghitung item yang punya anggota BARU sejak lonceng terakhir
 * dibuka (lihat tandaiDibaca di bawah).
 */
export function daftarPemberitahuan(anak, pengaturan, biaya, kini = bulanBerjalan(), hariIni = new Date()) {
  if (!anak) return []
  const hasil = []
  const teksSpp = kalimatSpp(anak, pengaturan, kini)
  if (teksSpp) {
    const bulan = BULAN.map((_, i) => i).filter((i) =>
      ['sebagian', 'nunggak', 'belum-bayar'].includes(statusSpp(anak.spp[i] || 0, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)),
    )
    hasil.push({
      id: 'spp', warna: 'red', judul: `SPP ${anak.panggilan} belum lunas`, isi: teksSpp,
      anggota: bulan.map((i) => `${pengaturan.tahunAjaran}:${i}`),
    })
  }
  // Kegiatan yang dimulai dalam 7 hari ke depan (atau sedang berlangsung).
  biaya.forEach((b, i) => {
    const j = jarakKegiatan(b, hariIni)
    if (!j || j.selesai || j.selisih > 7) return
    hasil.push({
      id: 'agenda-' + b.id, warna: 'blue', emoji: emojiKegiatan(b), biayaId: b.id,
      judul: `${b.nama} · ${j.label.toLowerCase()}`,
      isi: [tanggalKegiatan(b), b.waktu, b.lokasi].filter(Boolean).join(' · '),
      anggota: [`${b.id}@${b.tanggal}`],
    })
  })
  // Biaya kegiatan digabung jadi SATU pemberitahuan supaya lonceng tidak penuh angka.
  const keg = biaya
    .map((b, i) => ({ id: b.id, nama: b.nama, kurang: b.nominal - (anak.kegiatan[i] || 0) }))
    .filter((k) => k.kurang > 0)
  if (keg.length > 0) {
    hasil.push({
      id: 'kegiatan',
      warna: 'grape',
      judul: keg.length === 1 ? `Biaya ${keg[0].nama.toLowerCase()} belum lunas` : `${keg.length} biaya kegiatan belum lunas`,
      isi: `${keg.map((k) => k.nama).join(', ')} · total ${rp(keg.reduce((t, k) => t + k.kurang, 0))}.`,
      anggota: keg.map((k) => k.id),
    })
  }
  return hasil
}

/* ---------- status "sudah dibaca" pemberitahuan ----------
 * Disimpan di perangkat ini (localStorage), per anak:
 *   { [siswaId]: { [id pemberitahuan]: [anggota yang sudah dilihat] } }
 * Sebuah pemberitahuan dianggap BARU hanya kalau ada anggotanya yang belum
 * pernah dilihat — mis. bulan SPP baru jatuh tempo, atau kegiatan baru
 * ditambahkan sekolah. Kalau orang tua melunasi salah satu kegiatan,
 * pemberitahuannya berkurang tapi tidak dianggap baru lagi.
 */
const KUNCI_BACA = 'notif-dibaca'
const pendengarBaca = new Set()
let cacheBaca = null

function bacaSemua() {
  if (cacheBaca) return cacheBaca
  try {
    cacheBaca = JSON.parse(localStorage.getItem(KUNCI_BACA)) || {}
  } catch {
    cacheBaca = {}
  }
  return cacheBaca
}

export function belumDibaca(anakId, daftar, semua = bacaSemua()) {
  const sudah = semua[anakId] || {}
  return daftar.filter((d) => (d.anggota || [d.id]).some((x) => !(sudah[d.id] || []).includes(x)))
}

export function tandaiDibaca(anakId, daftar) {
  cacheBaca = { ...bacaSemua(), [anakId]: Object.fromEntries(daftar.map((d) => [d.id, d.anggota || [d.id]])) }
  try {
    localStorage.setItem(KUNCI_BACA, JSON.stringify(cacheBaca))
  } catch {
    /* mode privat — tetap berlaku sampai halaman ditutup */
  }
  pendengarBaca.forEach((f) => f())
}

const langgananBaca = (f) => {
  pendengarBaca.add(f)
  return () => pendengarBaca.delete(f)
}

/** Jumlah pemberitahuan yang BELUM dibaca untuk anak ini — untuk angka di lonceng. */
export function useJumlahNotif(anak) {
  const { pengaturan, biaya } = useData()
  const semua = useSyncExternalStore(langgananBaca, bacaSemua, bacaSemua)
  if (!anak) return 0
  return belumDibaca(anak.id, daftarPemberitahuan(anak, pengaturan, biaya), semua).length
}

/** Tombol lonceng + angka pemberitahuan baru. Angka hilang setelah lonceng dibuka. */
export function TombolLonceng({ anak, buka, className = '' }) {
  const jumlah = useJumlahNotif(anak)
  return (
    <button
      className={`tile relative bg-white shadow-soft ${className}`}
      onClick={buka}
      aria-label={jumlah ? `Pemberitahuan, ${jumlah} baru` : 'Pemberitahuan'}
    >
      <Ikon.lonceng size={20} />
      {jumlah > 0 && (
        <span className="absolute -right-1 -top-1 grid h-[19px] min-w-[19px] place-items-center rounded-[10px] border-2 border-canvas bg-danger px-1 text-[10px] font-bold text-white">
          {jumlah > 9 ? '9+' : jumlah}
        </span>
      )}
    </button>
  )
}

/* ---------- bukti pembayaran ---------- */
export function SheetStruk({ id, tutup }) {
  const { pembayaran, siswa, pengaturan, toast } = useData()
  const { token } = useParams()
  const [unduh, setUnduh] = useState(false)
  const p = pembayaran.find((x) => x.id === id)
  const s = p && siswa.find((x) => x.id === p.siswaId)
  if (!p || !s) return null

  // Kuitansi PDF resmi: data diambil ulang dari database (lewat token
  // tautan portal) supaya berisi TTD & stempel sekolah + QR verifikasi.
  const unduhKuitansi = async () => {
    if (unduh) return
    setUnduh(true)
    try {
      const [d, { unduhKuitansiBayar }] = await Promise.all([
        api.kuitansiPortal(token, p.id, { p, s, pengaturan }),
        import('../lib/dokumen.js'),
      ])
      await unduhKuitansiBayar(d)
      toast('Kuitansi berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat kuitansi: ' + e.message)
    } finally {
      setUnduh(false)
    }
  }

  return (
    <Sheet buka={!!id} tutup={tutup} judul="Bukti pembayaran" lead="Dicatat oleh pihak sekolah">
      <div className="relative rounded-card bg-white p-5 shadow-soft">
        <div className="mx-auto mb-3 grid h-[60px] w-[60px] place-items-center rounded-full bg-ok-soft text-ok">
          <Ikon.cek size={30} />
        </div>
        <div className="text-center text-[16px] font-extrabold">Pembayaran diterima</div>
        <div className="mb-4 mt-0.5 text-center text-[12.5px] text-muted">{pengaturan.namaSekolah} · {nomorKuitansi(p.id, p.tanggal)}</div>

        <Sobek />
        <div className="flex items-center gap-3 py-2">
          <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{s.nama}</div>
            <div className="text-[12.5px] text-muted">Kelas {s.kelas} · NIS {s.nis}</div>
          </div>
        </div>
        <Sobek />

        <Kv k="Jenis biaya" v={p.ket} />
        <Kv k="Metode" v={p.metode} />
        <Kv k="Waktu" v={p.waktu} />
        <Kv k="Diterima oleh" v={p.petugas} />

        <Sobek />
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-muted">Jumlah dibayar</span>
          <span className="text-xl font-extrabold text-ok-deep">{rp(p.nominal)}</span>
        </div>
      </div>

      <div className="h-3.5" />
      <button className="bigbtn flex items-center justify-center gap-2 disabled:opacity-60" onClick={unduhKuitansi} disabled={unduh}>
        <span aria-hidden="true">📄</span>
        {unduh ? 'Menyiapkan kuitansi…' : 'Unduh kuitansi (PDF)'}
      </button>
      <p className="mt-2 text-center text-[11.5px] font-semibold text-muted">
        Kuitansi resmi bertanda tangan sekolah, dengan kode QR untuk cek keasliannya.
      </p>
      <div className="h-2.5" />
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

const Kv = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-1.5 text-[13.5px]">
    <span className="font-semibold text-muted">{k}</span>
    <span className="text-right font-bold">{v}</span>
  </div>
)

/** Garis putus-putus dengan lekukan di kiri-kanan, meniru kwitansi kertas. */
const Sobek = () => (
  <div className="relative -mx-5 my-3.5 border-t-2 border-dashed border-[#E3E7EF]">
    <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-canvas" />
    <span className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-canvas" />
  </div>
)

/* ---------- cara pembayaran ---------- */
export function SheetCaraBayar({ buka, tutup, anak }) {
  const { pengaturan, toast } = useData()
  const nomorWa = waSekolah(pengaturan)
  const teksWa = encodeURIComponent(
    `Assalamu'alaikum, saya orang tua ${anak?.nama || ''} (Kelas ${anak?.kelas || ''}). Berikut saya kirimkan bukti transfer pembayaran.`,
  )
  const salin = (teks) => {
    navigator.clipboard?.writeText(teks.replace(/\s/g, ''))
    toast('Nomor rekening disalin')
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Cara pembayaran" lead="Pilih salah satu, lalu konfirmasi ke petugas TU atau admin.">
      <div className="mb-2.5 text-sm font-extrabold">1. Transfer ke rekening sekolah</div>
      {pengaturan.rekening.map((r, i) => (
        <div key={r.nomor} className="mb-2.5 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-soft">
          <Tile warna={i % 2 ? 'amber' : 'blue'} className="rounded-xl text-xs font-extrabold">{r.bank}</Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold">{r.nomor}</div>
            <div className="text-[12.5px] text-muted">a.n. {r.atasNama}</div>
          </div>
          <button className="shrink-0 rounded-xl bg-brand-soft px-3 py-2 text-xs font-extrabold text-brand" onClick={() => salin(r.nomor)}>
            Salin
          </button>
        </div>
      ))}

      <div className="mb-2.5 mt-4 text-sm font-extrabold">2. Tunai ke petugas TU/admin</div>
      <div className="card flex items-center gap-3 p-3.5">
        <Tile warna="green"><Ikon.orang size={20} /></Tile>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-bold">{anak.guru}</div>
          <div className="text-[12.5px] text-muted">Setiap hari kerja, 07.30–12.00</div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warn-soft p-3.5">
        <Tile warna="amber" className="h-[34px] w-[34px] rounded-[11px]"><Ikon.info size={18} /></Tile>
        <div className="text-[13px] font-semibold leading-snug text-warn-deep">
          Status di aplikasi berubah setelah petugas sekolah mencatat pembayaran, biasanya di hari yang sama.
        </div>
      </div>

      <div className="h-4" />
      {nomorWa ? (
        <a className="bigbtn-wa block text-center" href={`https://wa.me/${nomorWa}?text=${teksWa}`} target="_blank" rel="noreferrer" onClick={tutup}>
          Kirim bukti transfer via WhatsApp
        </a>
      ) : (
        <button className="bigbtn-wa opacity-50" onClick={() => toast('Nomor WhatsApp sekolah belum diatur. Hubungi TU sekolah secara langsung.')}>
          Kirim bukti transfer via WhatsApp
        </button>
      )}
      <div className="h-2.5" />
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- pemberitahuan ---------- */
export function SheetPengumuman({ buka, tutup, anak, bukaKegiatan }) {
  const { pengaturan, biaya } = useData()
  const daftar = daftarPemberitahuan(anak, pengaturan, biaya)
  const [baru, setBaru] = useState([])

  // Saat lonceng dibuka: ingat mana yang baru (untuk titik merah), lalu
  // tandai semuanya sudah dibaca supaya angka di lonceng hilang.
  useEffect(() => {
    if (!buka || !anak) return
    setBaru(belumDibaca(anak.id, daftar).map((d) => d.id))
    tandaiDibaca(anak.id, daftar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, anak?.id])

  return (
    <Sheet buka={buka} tutup={tutup} judul="Pemberitahuan" lead={`Dari ${pengaturan.namaSekolah}`}>
      {daftar.length === 0 ? (
        <div className="card flex items-start gap-3">
          <Tile warna="green"><Ikon.cek size={20} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold">Tidak ada pemberitahuan</div>
            <div className="text-[12.5px] text-muted">Semua tagihan {anak?.panggilan} sudah lunas. Terima kasih 🙏</div>
          </div>
        </div>
      ) : (
        daftar.map((d) => {
          const isi = (
            <>
              <Tile warna={d.warna}>
                {d.emoji ? <span className="text-[20px]" style={FONT_EMOJI}>{d.emoji}</span>
                  : d.warna === 'red' ? <Ikon.peringatan size={20} /> : <Ikon.kalender size={20} />}
              </Tile>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14.5px] font-bold">
                  <span className="min-w-0">{d.judul}</span>
                  {baru.includes(d.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="baru" />}
                </div>
                <div className="text-[12.5px] text-muted">{d.isi}</div>
                {d.biayaId && <div className="mt-1 text-[12.5px] font-bold text-brand">Lihat info kegiatan ›</div>}
              </div>
            </>
          )
          return d.biayaId && bukaKegiatan ? (
            <button key={d.id} className="card mb-2.5 flex w-full items-start gap-3 text-left" onClick={() => { tutup(); bukaKegiatan(d.biayaId) }}>
              {isi}
            </button>
          ) : (
            <div key={d.id} className="card mb-2.5 flex items-start gap-3">{isi}</div>
          )
        })
      )}
      <div className="h-4" />
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}

/* ---------- info kegiatan ---------- */
const IkonLokasi = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

const BarisInfo = ({ ikon, label, children }) => (
  <div className="flex items-start gap-3 py-2">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{ikon}</span>
    <div className="min-w-0 flex-1">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[14px] font-bold leading-snug">{children}</div>
    </div>
  </div>
)

/**
 * Lembar info satu kegiatan (Manasik haji, Porseni, …) untuk orang tua:
 * jadwal, lokasi, penjelasan, barang bawaan — diisi sekolah di menu
 * Jenis biaya — plus status pembayaran kegiatan itu untuk anak ini.
 */
export function SheetKegiatan({ id, tutup, anak, bukaCaraBayar }) {
  const { biaya, pengaturan } = useData()
  const i = biaya.findIndex((b) => b.id === id)
  const b = biaya[i]
  if (!b || !anak) return null

  const dibayar = anak.kegiatan[i] || 0
  const lunas = dibayar >= b.nominal
  const sebagian = !lunas && dibayar > 0
  const j = jarakKegiatan(b)
  const barang = (b.perlengkapan || '').split('\n').map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)
  const nomorWa = waSekolah(pengaturan)
  const teksWa = encodeURIComponent(
    `Assalamu'alaikum, saya orang tua ${anak.nama} (Kelas ${anak.kelas}). Saya ingin bertanya tentang kegiatan ${b.nama}.`,
  )

  return (
    <Sheet buka={!!b} tutup={tutup}>
      <div className="flex items-center gap-3.5 pr-10">
        <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-[18px] bg-grape-soft text-[30px]" style={FONT_EMOJI}>
          {emojiKegiatan(b)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[19px] font-extrabold leading-tight">{b.nama}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {j && (
              <Chip warna={j.selesai ? 'grey' : j.selisih <= 0 ? 'green' : 'blue'}>
                {j.selesai ? 'Sudah terlaksana' : j.label}
              </Chip>
            )}
            {lunas ? <Chip warna="green">Lunas</Chip> : <Chip warna="amber">{sebagian ? 'Dibayar sebagian' : 'Belum dibayar'}</Chip>}
          </div>
        </div>
      </div>

      {adaInfoKegiatan(b) ? (
        <>
          {(b.tanggal || b.waktu || b.lokasi) && (
            <div className="card mt-4 py-2">
              {b.tanggal && <BarisInfo ikon={<Ikon.kalender size={18} />} label="Tanggal">{tanggalKegiatan(b)}</BarisInfo>}
              {b.waktu && <BarisInfo ikon={<Ikon.jam size={18} />} label="Waktu">{b.waktu}</BarisInfo>}
              {b.lokasi && <BarisInfo ikon={<IkonLokasi />} label="Lokasi">{b.lokasi}</BarisInfo>}
            </div>
          )}
          {b.deskripsi && (
            <>
              <div className="mb-2 mt-4 text-sm font-extrabold">Tentang kegiatan</div>
              <div className="card whitespace-pre-line text-[13.5px] leading-relaxed">{b.deskripsi}</div>
            </>
          )}
          {barang.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-sm font-extrabold">Yang perlu dibawa / dipakai</div>
              <div className="card py-2">
                {barang.map((x) => (
                  <div key={x} className="flex items-start gap-2.5 py-1.5 text-[13.5px] font-semibold">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Ikon.cek size={13} /></span>
                    <span>{x}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5">
          <Tile warna="blue" className="h-[34px] w-[34px] rounded-[11px]"><Ikon.info size={18} /></Tile>
          <div className="text-[13px] font-semibold leading-snug text-brand">
            Sekolah belum menambahkan keterangan untuk kegiatan ini. Silakan tanyakan ke pihak sekolah untuk informasi lebih lanjut.
          </div>
        </div>
      )}

      <div className="mb-2 mt-4 text-sm font-extrabold">Biaya kegiatan</div>
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-semibold text-muted">Total biaya</span>
          <span className="text-[17px] font-extrabold">{rp(b.nominal)}</span>
        </div>
        <div className="mt-2.5"><Track persen={persenBayar(dibayar, b.nominal)} warna={lunas ? '#22C55E' : '#F5A524'} tinggi={6} /></div>
        <div className="mt-2 text-[12.5px] font-semibold text-muted">
          {lunas ? `Sudah dibayar penuh ${rp(dibayar)}. Terima kasih 🙏`
            : sebagian ? `Sudah dibayar ${rp(dibayar)} · kurang ${rp(b.nominal - dibayar)}`
            : `Belum dibayar · ${rp(b.nominal)}`}
        </div>
      </div>

      <div className="h-4" />
      {!lunas && bukaCaraBayar && (
        <button className="bigbtn mb-2.5" onClick={() => { tutup(); bukaCaraBayar() }}>Lihat cara pembayaran</button>
      )}
      {nomorWa && (
        <a className="bigbtn-ghost mb-2.5 block text-center" href={`https://wa.me/${nomorWa}?text=${teksWa}`} target="_blank" rel="noreferrer">
          Tanya sekolah via WhatsApp
        </a>
      )}
      <button className="bigbtn-tutup" onClick={tutup}>Tutup</button>
    </Sheet>
  )
}
