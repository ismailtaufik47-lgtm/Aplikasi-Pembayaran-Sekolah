import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, IkonWhatsappPolos, Kosong, Segment, Sheet, Track } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import SheetPeriode from './SheetPeriode.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
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
import {
  BADGE_PAKET, EMOJI_JENIS, LABEL_JENIS, WARNA_JENIS, dibayarPaket, keteranganPaket, kurangSekarangPaket, paketSiswa, statusPaket, tahapPaket, tglPendek, urutPaket,
} from '../lib/paket.js'

export default function DetailSiswa({ onCatat, onUbah }) {
  const { id } = useParams()
  const nav = useNavigate()
  const { siswa, biaya, paket, pengaturan, toast, boleh } = useData()
  const [seg, setSeg] = useState('spp')
  const [periode, setPeriode] = useState(null) // { jenis, indeks } | null
  const [linkOrtu, setLinkOrtu] = useState(null) // { token, nama } | null, saat sheet link dibuka
  const [memuatLink, setMemuatLink] = useState(false)
  const s = siswa.find((x) => x.id === id)
  const kini = bulanBerjalan()
  const bisaUbah = boleh('siswa')
  const bisaCatat = boleh('pembayaran')

  if (!s) return <Kosong>Data siswa tidak ditemukan.</Kosong>

  // PMB & daftar ulang yang ditagihkan ke siswa ini (0033)
  const paketS = paketSiswa(paket, s.id).sort(urutPaket)
  const bayarPaket = paketS.reduce((t, p) => t + Math.min(p.total, dibayarPaket(s, p.id)), 0)
  const dibayar = totalDibayar(s) + bayarPaket
  const total = 12 * pengaturan.sppNominal + totalKegiatan(biaya) + paketS.reduce((t, p) => t + p.total, 0)
  const sisaTahunAjaran = total - dibayar
  const perluSekarang = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(s, biaya)
    + paketS.reduce((t, p) => t + kurangSekarangPaket(p, dibayarPaket(s, p.id)), 0)
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
      `Assalamu'alaikum, berikut link untuk memantau status pembayaran ${s.nama} di ${pengaturan.namaSekolah}:\n${urlPortal}\n\nSaat link dibuka, masukkan NIS ananda (tertera di kuitansi pembayaran atau kartu siswa). Mohon link ini tidak dibagikan ke orang lain.`
    )
    window.open(`https://wa.me/${nomor}?text=${teks}`, '_blank')
  }

  return (
    <>
      <div className="relative z-[2] mb-3.5 flex items-center gap-3 lg:mb-5 lg:mt-7">
        <button className="tombol-bilah grid h-10 w-10 shrink-0 place-items-center rounded-[14px] active:scale-95" onClick={() => nav('/guru/siswa')} aria-label="Kembali ke daftar siswa">
          <Ikon.kembali size={20} />
        </button>
        <h2 className="judul-halaman font-display text-[20px] font-semibold lg:text-[24px]">Kartu pembayaran</h2>
        {bisaUbah && (
          <button
            className="tombol-putih ml-auto flex items-center gap-1.5 rounded-[14px] px-3.5 py-2 text-[13px] font-extrabold"
            onClick={() => onUbah(s.id)}
          >
            <Ikon.pensil size={16} />
            Ubah
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-7 2xl:grid-cols-[380px_1fr]">
        <div className="lg:sticky lg:top-7">
          <div className="kartu-profil-siswa relative overflow-hidden rounded-[28px] p-[18px] text-white">
            <div className="flex items-center gap-3.5">
              <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={68} className="ring-4 ring-white/90" />
              <div className="min-w-0">
                <div className="line-clamp-2 font-display text-[22px] font-bold leading-[1.1] tracking-[-.2px]">{s.nama}</div>
                <div className="mt-1 text-[12.5px] font-bold opacity-90">Kelas {s.kelas} · NIS {s.nis}</div>
                <div className="truncate text-[12.5px] font-bold opacity-90">{s.wali || 'Wali belum diisi'}{s.hp ? ` · ${s.hp}` : ''}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              <div className="flex-1 rounded-2xl bg-white/15 px-3 py-2.5">
                <div className="text-[11.5px] font-bold opacity-90">Sudah dibayar</div>
                <div className="mt-0.5 font-display text-[19px] font-semibold leading-tight">{rp(dibayar)}</div>
              </div>
              <div className="flex-1 rounded-2xl bg-white/15 px-3 py-2.5">
                <div className="text-[11.5px] font-bold opacity-90">Sisa pembayaran</div>
                <div className="mt-0.5 font-display text-[19px] font-semibold leading-tight">
                  {perluSekarang > 0 ? rp(perluSekarang) : 'Lunas ✓'}
                </div>
              </div>
            </div>
            {sisaTahunAjaran > perluSekarang && (
              <div className="mt-2.5 text-[11.5px] font-semibold leading-snug opacity-85">
                Sisa tahun ajaran (termasuk bulan yang belum jatuh tempo): {rp(sisaTahunAjaran)}
              </div>
            )}
            {(bisaCatat || bisaUbah) && (
              <div className="mt-3.5 flex gap-2.5">
                {bisaCatat && (
                  <button className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFFFFF] py-3 text-[13.5px] font-extrabold text-[#3B6EF6] shadow-[inset_0_-3px_0_#D6E2FF] active:translate-y-px" onClick={() => onCatat(s.id)}>
                    <Ikon.plus size={17} />
                    Catat pembayaran
                  </button>
                )}
                {bisaUbah && (
                  <button className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-ok py-3 text-[13.5px] font-extrabold text-white shadow-[inset_0_-3px_0_#169A48] active:translate-y-px" onClick={bukaLinkOrtu}>
                    <IkonWhatsappPolos size={16} />
                    Kirim ke ortu
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Panel ini terutama untuk desktop — kolom kiri terasa kosong
              kalau cuma berisi kartu biru, jadi diisi ringkasan progres
              yang memang berguna, bukan sekadar dekorasi. */}
          <div className="card mt-4 hidden lg:block">
            <div className="judul-kartu mb-3.5 text-[17px]">Ringkasan tahun ajaran</div>
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
            {paketS.map((p) => (
              <div key={p.id} className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted">{p.nama}</span>
                  <span>{persenBayar(dibayarPaket(s, p.id), p.total)}% dibayar</span>
                </div>
                <Track persen={persenBayar(dibayarPaket(s, p.id), p.total)} warna={p.jenis === 'pmb' ? '#EC4899' : '#8B5CF6'} tinggi={7} />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="lg:max-w-[420px]">
            <Segment
              nilai={seg}
              ubah={setSeg}
              opsi={[
                { nilai: 'spp', label: 'Iuran SPP' },
                { nilai: 'keg', label: 'Kegiatan' },
                ...(paketS.length ? [{ nilai: 'paket', label: 'PMB & DU' }] : []),
              ]}
            />
          </div>

          {seg === 'paket' && (
            <div className="grid gap-3.5 lg:grid-cols-2">
              {paketS.map((p) => (
                <KartuPaket
                  key={p.id}
                  p={p}
                  dibayar={dibayarPaket(s, p.id)}
                  bisaCatat={bisaCatat}
                  buka={() => setPeriode({ jenis: 'paket', indeks: p.id })}
                />
              ))}
            </div>
          )}

          <div className={`lg:grid lg:grid-cols-2 lg:gap-3.5 2xl:grid-cols-3 ${seg === 'paket' ? '!hidden' : ''}`}>
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
                      ikon={emojiKegiatan(b)}
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
            <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warn-soft p-3.5">
              <span className="tile h-[34px] w-[34px] shrink-0 rounded-[11px] bg-warn-soft text-warn"><Ikon.info size={18} /></span>
              <div className="text-[12.5px] font-semibold leading-snug text-warn-deep">
                Saat membuka link, orang tua diminta memasukkan <b>NIS ananda: {s.nis || '—'}</b>. NIS sengaja tidak ikut dikirim di pesan
                WhatsApp — sampaikan terpisah atau lihat di kuitansi.
              </div>
            </div>
            <button className="bigbtn-wa mb-2.5" onClick={kirimWa}>Kirim via WhatsApp</button>
            <button className="bigbtn-ghost" onClick={salinLink}>Salin link</button>
            <p className="mt-4 text-center text-xs text-muted">
              Link ini permanen untuk {s.wali || 'orang tua'} — tanpa login, cukup NIS ananda.
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
 * Kartu PMB / daftar ulang satu siswa: progres, keterangan, jadwal cicilan.
 * Ketuk "Catat cicilan" / kartunya → lembar rincian, riwayat & catat (SheetPeriode).
 */
function KartuPaket({ p, dibayar, bisaCatat, buka }) {
  const st = statusPaket(p, dibayar)
  const b = BADGE_PAKET[st]
  const tahap = tahapPaket(p, dibayar)
  const persen = persenBayar(dibayar, p.total)
  return (
    <div className="card !p-4">
      <button className="flex w-full items-center gap-3 text-left" onClick={buka}>
        <GambarKegiatan emoji={EMOJI_JENIS[p.jenis]} size={48} className="rounded-[15px]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`permen permen-kecil permen-${WARNA_JENIS[p.jenis]} rounded-[8px] px-2 py-0.5 text-[10.5px] font-extrabold`}>{LABEL_JENIS[p.jenis]}</span>
            <b className="truncate font-display text-[17px] font-semibold">{p.tahunAjaran}</b>
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold text-muted">Dibayar {rp(dibayar)} dari {rp(p.total)}</span>
        </span>
        <Chip warna={b.warna}>{b.teks}</Chip>
      </button>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex-1"><Track persen={persen} warna={st === 'lunas' ? '#22C55E' : st === 'terlambat' ? '#EF4444' : '#F5A524'} tinggi={8} /></div>
        <b className="text-[12px] font-extrabold">{persen}%</b>
      </div>
      {st !== 'lunas' && <p className={`mt-1.5 text-[12.5px] font-bold ${st === 'terlambat' ? 'text-danger' : 'text-muted'}`}>{keteranganPaket(p, dibayar)}</p>}
      {tahap.length > 0 && (
        <div className="mt-2.5 flex gap-1.5">
          {tahap.map((t, i) => (
            <span key={i} title={`${t.nama} · ${tglPendek(t.jatuhTempo, true)}`}
              className={`flex-1 rounded-[10px] px-1.5 py-1.5 text-center text-[11px] font-extrabold leading-tight ${
                t.lunas ? 'bg-ok-soft text-ok-deep' : t.lewat ? 'bg-danger-soft text-danger' : t.terisi > 0 ? 'bg-warn-soft text-warn-deep' : 'bg-canvas text-muted'}`}>
              {t.nama.replace(/^Tahap\s*/i, 'T')}
              <span className="block text-[10.5px] font-bold opacity-80">{tglPendek(t.jatuhTempo)}</span>
            </span>
          ))}
        </div>
      )}
      <button className={`mt-3 w-full rounded-[14px] py-2.5 text-[13px] font-extrabold ${bisaCatat && st !== 'lunas' ? 'bg-brand text-white' : 'tombol-putih'}`} onClick={buka}>
        {bisaCatat && st !== 'lunas' ? 'Catat cicilan' : 'Lihat rincian & riwayat'}
      </button>
    </div>
  )
}

/**
 * Kartu satu bulan/kegiatan — seluruh kartu bisa diklik untuk membuka
 * rincian & mencatat pembayaran (termasuk sebagian), bukan tombol kecil
 * di dalamnya. Progress bar di bawah menunjukkan berapa persen sudah
 * terbayar, jadi kartu yang baru dicicil terlihat beda dari yang lunas
 * atau yang sama sekali belum disentuh.
 */
function Kartu({ nomor, ikon, judul, dibayar, target, status, onClick }) {
  const permen =
    status.warna === 'green' ? 'permen-tosca'
    : status.warna === 'red' ? 'permen-pink'
    : status.warna === 'amber' ? 'permen-kuning'
    : 'permen-abu'
  const warnaBar =
    status.warna === 'green' ? '#22C55E'
    : status.warna === 'amber' ? '#F5A524'
    : status.warna === 'red' ? '#EF4444'
    : '#C9D0DC'

  return (
    <button
      onClick={onClick}
      className="mb-2.5 w-full rounded-[20px] bg-kartu px-3.5 py-3 text-left shadow-[0_8px_24px_rgba(30,64,140,.08)] transition hover:-translate-y-[1px] hover:shadow-[0_10px_26px_rgba(30,64,140,.14)] dark:shadow-[0_8px_24px_rgba(0,0,0,.3)] lg:mb-0 lg:p-4"
    >
      <div className="flex items-center gap-3">
        {ikon ? (
          <GambarKegiatan emoji={ikon} size={44} className="rounded-[14px]" />
        ) : (
          <span className={`permen permen-kecil ${permen} grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[14px] font-display text-[14px] font-bold`}>
            {judul.slice(0, 3) || String(nomor).padStart(2, '0')}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-extrabold">{judul}</span>
          <span className="block truncate text-xs font-semibold text-muted">
            {rp(dibayar)} <span className="opacity-60">/ {rp(target)}</span>
          </span>
        </span>
        <Chip warna={status.warna}>{status.label}</Chip>
      </div>
      <div className="mt-3">
        <Track persen={persenBayar(dibayar, target)} warna={warnaBar} tinggi={6} />
      </div>
    </button>
  )
}
