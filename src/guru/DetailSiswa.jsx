import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, Kosong, Segment, Sheet, Track } from '../components/ui.jsx'
import SheetPeriode from './SheetPeriode.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import {
  BULAN,
  bulanBerjalan,
  dibayarKegiatan,
  dibayarSpp,
  kegiatanBelum,
  lunasSpp,
  persenBayar,
  rp,
  sppPerluSekarang,
  statusSpp,
  totalDibayar,
  totalKegiatan,
} from '../lib/format.js'

export default function DetailSiswa({ onCatat, onUbah }) {
  const { id } = useParams()
  const nav = useNavigate()
  const { siswa, biaya, pengaturan, peran, toast } = useData()
  const [seg, setSeg] = useState('spp')
  const [periode, setPeriode] = useState(null) // { jenis, indeks } | null
  const [linkOrtu, setLinkOrtu] = useState(null) // { token, nama } | null, saat sheet link dibuka
  const [memuatLink, setMemuatLink] = useState(false)
  const s = siswa.find((x) => x.id === id)
  const kini = bulanBerjalan()
  const readOnly = peran === 'kepala'

  if (!s) return <Kosong>Data siswa tidak ditemukan.</Kosong>

  const dibayar = totalDibayar(s)
  const total = 12 * pengaturan.sppNominal + totalKegiatan(biaya)
  const sisaTahunAjaran = total - dibayar
  const perluSekarang = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(s, biaya)
  const jmlLunasSpp = lunasSpp(s, pengaturan.sppNominal)
  const jmlLunasKeg = biaya.filter((b, i) => dibayarKegiatan(s, i) >= b.nominal).length

  const statusKartu = (jenisX, i, jumlah, target) => {
    if (jenisX !== 'spp') {
      if (jumlah >= target) return { warna: 'green', label: 'Lunas' }
      if (jumlah > 0) return { warna: 'amber', label: 'Sebagian' }
      return { warna: 'grey', label: 'Belum' }
    }
    const status = statusSpp(jumlah, target, i, kini, pengaturan.tanggalJatuhTempo)
    return {
      lunas: { warna: 'green', label: 'Lunas' },
      sebagian: { warna: 'amber', label: 'Sebagian' },
      nunggak: { warna: 'red', label: 'Nunggak' },
      'belum-bayar': { warna: 'amber', label: 'Belum bayar' },
      menunggu: { warna: 'grey', label: 'Menunggu' },
    }[status]
  }

  /** Ambil token yang sudah ada, atau buat wali baru dari data orang tua di kartu siswa. */
  const bukaLinkOrtu = async () => {
    setMemuatLink(true)
    setLinkOrtu({}) // buka sheet dalam keadaan memuat
    try {
      let w = await api.ambilLinkWali(s.id)
      if (!w) w = await api.buatLinkWali({ sekolahId: pengaturan.id, siswaId: s.id, nama: s.wali, hp: s.hp })
      setLinkOrtu(w)
    } catch (e) {
      setLinkOrtu(null)
      toast('Gagal membuat link: ' + e.message)
    } finally {
      setMemuatLink(false)
    }
  }

  const urlPortal = linkOrtu?.token ? `${window.location.origin}/ortu/${linkOrtu.token}` : ''
  const salinLink = () => {
    navigator.clipboard?.writeText(urlPortal)
    toast('Link disalin')
  }
  const kirimWa = () => {
    const nomor = (s.hp || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
    const teks = encodeURIComponent(
      `Assalamu'alaikum, berikut link untuk memantau status pembayaran ${s.nama} di ${pengaturan.namaSekolah}:\n${urlPortal}`
    )
    window.open(`https://wa.me/${nomor}?text=${teks}`, '_blank')
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:pt-7">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white shadow-soft" onClick={() => nav('/guru/siswa')}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Kartu pembayaran</h2>
        {!readOnly && (
          <button
            className="ml-auto rounded-xl bg-white px-3 py-2 text-xs font-extrabold shadow-soft"
            onClick={() => onUbah(s.id)}
          >
            Ubah data
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-7 2xl:grid-cols-[360px_1fr]">
        <div className="lg:sticky lg:top-7">
          <div className="rounded-3xl bg-gradient-to-br from-brand to-[#7B95FF] p-[18px] text-white shadow-hero">
            <div className="flex items-center gap-3">
              <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={54} ring />
              <div className="min-w-0">
                <div className="truncate text-[18px] font-extrabold tracking-tight">{s.nama}</div>
                <div className="text-[12.5px] opacity-85">Kelas {s.kelas} · NIS {s.nis}</div>
                <div className="truncate text-[12.5px] opacity-85">{s.wali} · {s.hp}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              <div className="flex-1 rounded-2xl bg-white/15 px-3 py-2.5">
                <div className="text-[11.5px] font-semibold opacity-85">Sudah dibayar</div>
                <div className="mt-0.5 text-[15px] font-extrabold">{rp(dibayar)}</div>
              </div>
              <div className="flex-1 rounded-2xl bg-white/15 px-3 py-2.5">
                <div className="text-[11.5px] font-semibold opacity-85">Sisa pembayaran</div>
                <div className="mt-0.5 text-[15px] font-extrabold">
                  {perluSekarang > 0 ? rp(perluSekarang) : 'Lunas ✅'}
                </div>
              </div>
            </div>
            {sisaTahunAjaran > perluSekarang && (
              <div className="mt-2.5 text-[11.5px] leading-snug opacity-80">
                Sisa total pembayaran SPP (termasuk bulan yang belum jatuh tempo): {rp(sisaTahunAjaran)}
              </div>
            )}
            {!readOnly && (
              <div className="mt-3 flex gap-2.5">
                <button className="flex-1 rounded-2xl bg-white py-2.5 text-[13.5px] font-extrabold text-brand" onClick={() => onCatat(s.id)}>
                  Catat pembayaran
                </button>
                <button className="flex-1 rounded-2xl bg-white/20 py-2.5 text-[13.5px] font-extrabold text-white" onClick={bukaLinkOrtu}>
                  Kirim ke ortu
                </button>
              </div>
            )}
          </div>

          {/* Panel ini terutama untuk desktop — kolom kiri terasa kosong
              kalau cuma berisi kartu biru, jadi diisi ringkasan progres
              yang memang berguna, bukan sekadar dekorasi. */}
          <div className="card mt-4 hidden lg:block">
            <div className="mb-3.5 text-[13px] font-extrabold">Ringkasan tahun ajaran</div>
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className="text-muted">Iuran SPP</span>
                <span>{jmlLunasSpp}/12 bulan lunas</span>
              </div>
              <Track persen={(jmlLunasSpp / 12) * 100} warna="#3B6EF6" tinggi={7} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className="text-muted">Biaya kegiatan</span>
                <span>{jmlLunasKeg}/{biaya.length || 0} item lunas</span>
              </div>
              <Track persen={biaya.length ? (jmlLunasKeg / biaya.length) * 100 : 0} warna="#8B5CF6" tinggi={7} />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="lg:max-w-[300px]">
            <Segment
              nilai={seg}
              ubah={setSeg}
              opsi={[{ nilai: 'spp', label: 'Iuran SPP' }, { nilai: 'keg', label: 'Biaya kegiatan' }]}
            />
          </div>

          <div className="lg:grid lg:grid-cols-2 lg:gap-3.5 xl:grid-cols-3">
            {seg === 'spp'
              ? BULAN.map((b, i) => {
                  const jml = dibayarSpp(s, i)
                  return (
                    <Kartu
                      key={b}
                      nomor={i + 1}
                      judul={b}
                      dibayar={jml}
                      target={pengaturan.sppNominal}
                      status={statusKartu('spp', i, jml, pengaturan.sppNominal)}
                      onClick={() => setPeriode({ jenis: 'spp', indeks: i })}
                    />
                  )
                })
              : biaya.length === 0
              ? <Kosong>Belum ada biaya kegiatan. Tambahkan di menu Jenis biaya.</Kosong>
              : biaya.map((b, i) => {
                  const jml = dibayarKegiatan(s, i)
                  return (
                    <Kartu
                      key={b.id}
                      nomor={i + 1}
                      judul={b.nama}
                      dibayar={jml}
                      target={b.nominal}
                      status={statusKartu('kegiatan', i, jml, b.nominal)}
                      onClick={() => setPeriode({ jenis: 'kegiatan', indeks: i })}
                    />
                  )
                })}
          </div>
        </div>
      </div>

      <SheetPeriode
        buka={!!periode}
        tutup={() => setPeriode(null)}
        siswaId={s.id}
        jenis={periode?.jenis}
        indeks={periode?.indeks}
        readOnly={readOnly}
      />

      <Sheet buka={!!linkOrtu} tutup={() => setLinkOrtu(null)} judul="Link portal orang tua" lead={`Untuk memantau status pembayaran ${s.nama}`}>
        {memuatLink ? (
          <p className="py-6 text-center text-sm text-muted">Menyiapkan link…</p>
        ) : linkOrtu?.token ? (
          <>
            <div className="mb-4 rounded-2xl bg-canvas p-3.5">
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">Link portal</div>
              <div className="break-all text-[13.5px] font-semibold">{urlPortal}</div>
            </div>
            <button className="bigbtn-wa mb-2.5" onClick={kirimWa}>Kirim via WhatsApp</button>
            <button className="bigbtn-ghost" onClick={salinLink}>Salin link</button>
            <p className="mt-4 text-center text-xs text-muted">
              Link ini permanen untuk {s.wali || 'orang tua'} — buka kembali kapan saja tanpa perlu login.
            </p>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-danger">Gagal membuat link. Coba lagi.</p>
        )}
      </Sheet>
    </>
  )
}

/**
 * Kartu satu bulan/kegiatan — seluruh kartu bisa diklik untuk membuka
 * rincian & mencatat pembayaran (termasuk sebagian), bukan tombol kecil
 * di dalamnya. Progress bar di bawah menunjukkan berapa persen sudah
 * terbayar, jadi kartu yang baru dicicil terlihat beda dari yang lunas
 * atau yang sama sekali belum disentuh.
 */
function Kartu({ nomor, judul, dibayar, target, status, onClick }) {
  const warnaBadge =
    status.warna === 'green' ? 'bg-ok-soft text-ok'
    : status.warna === 'red' ? 'bg-danger-soft text-danger'
    : status.warna === 'amber' ? 'bg-warn-soft text-warn'
    : 'bg-[#F2F4F9] text-muted'
  const warnaBar =
    status.warna === 'green' ? '#22C55E'
    : status.warna === 'amber' ? '#F5A524'
    : status.warna === 'red' ? '#EF4444'
    : '#C9D0DC'

  return (
    <button
      onClick={onClick}
      className="mb-2.5 w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-left shadow-soft transition hover:-translate-y-[1px] hover:border-transparent hover:shadow-[0_6px_16px_rgba(21,26,38,.1)] lg:mb-0 lg:p-4"
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-xs font-extrabold ${warnaBadge}`}>
          {status.label === 'Lunas' ? '✓' : String(nomor).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold">{judul}</span>
          <span className="block truncate text-xs text-muted">
            {rp(dibayar)} <span className="opacity-60">/ {rp(target)}</span>
          </span>
        </span>
        <Chip warna={status.warna}>{status.label}</Chip>
      </div>
      <div className="mt-3.5">
        <Track persen={persenBayar(dibayar, target)} warna={warnaBar} tinggi={6} />
      </div>
    </button>
  )
}