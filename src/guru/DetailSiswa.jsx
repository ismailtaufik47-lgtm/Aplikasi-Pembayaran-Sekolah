import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, IkonWhatsappPolos, Kosong, Segment, Sheet, Track } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import SheetPeriode from './SheetPeriode.jsx'
import { KartuRiwayatKelas, LABEL_AKHIR, SheetKeluar, SheetMasaTerdaftar, teksMasa } from './RiwayatKelas.jsx'
import PilihTa from '../components/PilihTa.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import * as api from '../lib/api.js'
import {
  BULAN,
  bulanBerjalan,
  bulanDitagih,
  dibayarKegiatan,
  dibayarSpp,
  kegiatanBelum,
  kegiatanLaluBelum,
  kegiatanWajib,
  ketBebas,
  lunasSpp,
  namaBulanTa,
  persenBayar,
  rp,
  taPendek,
  sppPerluSekarang,
  statusSpp,
  targetSpp,
  targetSppTahun,
  totalDibayar,
  totalKegiatanLalu,
  totalKegiatanSiswa,
  tunggakanLaluPerTa,
} from '../lib/format.js'
import { kegiatanLewat } from '../lib/statusSiswa.js'
import {
  BADGE_PAKET, EMOJI_JENIS, LABEL_JENIS, WARNA_JENIS, dibayarPaket, keteranganPaket, kurangSekarangPaket, paketSiswa, statusPaket, tahapPaket, tglPendek, urutPaket,
} from '../lib/paket.js'

export default function DetailSiswa({ onCatat, onUbah }) {
  const { id } = useParams()
  const nav = useNavigate()
  const { siswa, biaya, biayaLain, paket, pembayaran, pengaturan, toast, boleh } = useData()
  const [seg, setSeg] = useState('spp')
  // Tahun ajaran yang dilihat (0044): tahun lalu dibuka lengkap 12 bulan; transaksinya dibaca saat dibuka
  const [taLihat, setTaLihat] = useState(pengaturan.tahunAjaran)
  const [bayarLama, setBayarLama] = useState(null) // pembayaran siswa ini dari server (semua tahun)
  const [versiLama, setVersiLama] = useState(0)
  const [periode, setPeriode] = useState(null) // { jenis, indeks, ta?, biayaLaluId? } | null
  const [sheetMasa, setSheetMasa] = useState(false)
  const [sheetKeluar, setSheetKeluar] = useState(false)
  const [linkOrtu, setLinkOrtu] = useState(null) // { token, nama } | null, saat sheet link dibuka
  const [memuatLink, setMemuatLink] = useState(false)
  const s = siswa.find((x) => x.id === id)
  const kini = bulanBerjalan()
  const lamaDilihat = taLihat !== pengaturan.tahunAjaran
  useEffect(() => { setTaLihat(pengaturan.tahunAjaran); setBayarLama(null) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!lamaDilihat || !s) return undefined
    let aktif = true
    api.pembayaranSiswa(s.id, { pembayaran, biaya }).then((d) => aktif && setBayarLama(d)).catch((e) => aktif && toast('Gagal memuat riwayat: ' + e.message))
    return () => { aktif = false }
  }, [lamaDilihat, s?.id, versiLama]) // eslint-disable-line react-hooks/exhaustive-deps
  const bisaUbah = boleh('siswa')
  const bisaCatat = boleh('pembayaran')

  if (!s) return <Kosong>Data siswa tidak ditemukan.</Kosong>

  // tahun ajaran lalu yang tercatat untuk siswa ini (terbaru dulu)
  const taLewat = (s.keanggotaan || []).map((k) => k.ta).filter((t) => t < pengaturan.tahunAjaran).sort().reverse()

  // PMB & daftar ulang yang ditagihkan ke siswa ini (0033)
  const paketS = paketSiswa(paket, s.id).sort(urutPaket)
  const bayarPaket = paketS.reduce((t, p) => t + Math.min(p.total, dibayarPaket(s, p.id)), 0)
  const dibayar = totalDibayar(s) + bayarPaket
  // target tahun ini = bulan-bulan saat terdaftar × tarif kelasnya + kegiatan yang ditagihkan (0042)
  const total = targetSppTahun(s, pengaturan.sppNominal) + totalKegiatanSiswa(s, biaya) + paketS.reduce((t, p) => t + p.total, 0)
  // + tunggakan SPP & kegiatan tahun ajaran lalu supaya "sisa" = semua yang masih harus dibayar
  const lalu = tunggakanLaluPerTa(s, pengaturan.sppNominal)
  const kegLalu = kegiatanLaluBelum(s)
  const taLalu = [...new Set([...lalu.map((g) => g.ta), ...kegLalu.map((k) => k.ta)])].sort()
  const tunggakLalu = lalu.reduce((t, g) => t + g.total, 0) + totalKegiatanLalu(s)
  const sisaTahunAjaran = total - dibayar + tunggakLalu
  const perluSekarang = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(s, biaya) + totalKegiatanLalu(s)
    + paketS.reduce((t, p) => t + kurangSekarangPaket(p, dibayarPaket(s, p.id)), 0)
  const jmlLunasSpp = lunasSpp(s, pengaturan.sppNominal)
  const jmlBulan = bulanDitagih(s, pengaturan.sppNominal)
  const kegS = biaya.filter((_, i) => kegiatanWajib(s, i))
  const jmlLunasKeg = biaya.filter((b, i) => kegiatanWajib(s, i) && dibayarKegiatan(s, i) >= b.nominal).length

  const statusKartu = (jenisX, i, jumlah, target) => {
    if (jenisX !== 'spp') {
      if (jumlah >= target) return { warna: 'green', label: 'Lunas' }
      // kegiatan jatuh tempo pada tanggal kegiatannya (sama dengan menu Tagihan & Siswa)
      if (kegiatanLewat(biaya[i])) return { warna: 'red', label: 'Nunggak' }
      if (jumlah > 0) return { warna: 'amber', label: 'Mencicil' }
      return { warna: 'grey', label: 'Belum bayar' }
    }
    // sama dengan menu Tagihan: bulan yang sudah lewat & baru dicicil = Nunggak
    const st = statusSpp(jumlah, target, i, kini, pengaturan.tanggalJatuhTempo)
    if (st === 'bebas') return { warna: 'grey', label: ketBebas(s, i), bebas: true }
    const status = st === 'sebagian' && i < kini ? 'nunggak' : st
    return {
      lunas: { warna: 'green', label: 'Lunas' },
      sebagian: { warna: 'amber', label: 'Mencicil' },
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
                {s.daftarDepan && <div className="mt-0.5 text-[12px] font-extrabold">Mulai tahun ajaran {s.daftarDepan.ta}</div>}
                {s.terdaftar?.mulai > 0 && <div className="mt-0.5 text-[12px] font-extrabold">Masuk {namaBulanTa(s.terdaftar.ta, s.terdaftar.mulai)}</div>}
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
                {tunggakLalu > 0 ? 'Sisa seluruhnya (tunggakan tahun lalu + tahun ini, termasuk bulan yang belum jatuh tempo)' : 'Sisa tahun ajaran (termasuk bulan yang belum jatuh tempo)'}: {rp(sisaTahunAjaran)}
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
                <span>{jmlLunasSpp}/{jmlBulan} bulan lunas</span>
              </div>
              <Track persen={jmlBulan ? (jmlLunasSpp / jmlBulan) * 100 : 0} warna="#3B6EF6" tinggi={7} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className="text-muted">Biaya kegiatan</span>
                <span>{jmlLunasKeg}/{kegS.length} item lunas</span>
              </div>
              <Track persen={kegS.length ? (jmlLunasKeg / kegS.length) * 100 : 0} warna="#8B5CF6" tinggi={7} />
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
          <div className="hidden lg:block">
            <KartuRiwayatKelas s={s} bisaUbah={bisaUbah} onAtur={() => setSheetMasa(true)} onKeluar={() => setSheetKeluar(true)} />
          </div>
        </div>

        <div className="min-w-0">
          {taLewat.length > 0 && (
            <div className="noscroll -mx-0.5 mb-3 flex gap-1.5 overflow-x-auto px-0.5" role="group" aria-label="Tahun ajaran">
              <button type="button" aria-pressed={!lamaDilihat} onClick={() => setTaLihat(pengaturan.tahunAjaran)}
                className={`shrink-0 rounded-pill px-3.5 py-2 text-[12.5px] font-extrabold ${!lamaDilihat ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-muted dark:border-line'}`}>
                Tahun ini <span className="font-bold opacity-75">{taPendek(pengaturan.tahunAjaran)}</span>
              </button>
              <PilihTa on={lamaDilihat} nilai={lamaDilihat ? taLihat : ''} ubah={(t) => { setTaLihat(t); if (seg === 'paket') setSeg('spp') }} daftar={taLewat} label="Tahun lalu" className="!py-[7px] !text-[12.5px]" />
            </div>
          )}
          {lamaDilihat ? (
            <TahunLalu s={s} ta={taLihat} seg={seg} setSeg={setSeg} biayaLain={biayaLain} buka={setPeriode} />
          ) : (
          <>
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

          {s.daftarDepan && (
            <div className="card mb-3.5 flex items-start gap-3 !py-3">
              <span className="tile h-[38px] w-[38px] shrink-0 rounded-[12px] bg-brand-soft text-brand"><Ikon.kalender size={19} /></span>
              <p className="text-[13px] font-semibold leading-snug">
                <b className="block font-extrabold">Siswa baru tahun ajaran {s.daftarDepan.ta} · Kelas {s.daftarDepan.kelas}</b>
                <span className="text-muted">Belum ada tagihan SPP & kegiatan tahun ini. Tagihan mulai otomatis 1 Juli.</span>
              </p>
            </div>
          )}

          {seg !== 'paket' && taLalu.map((t) => {
            const g = lalu.find((x) => x.ta === t) || { items: [], total: 0 }
            const kl = kegLalu.filter((k) => k.ta === t)
            const jml = g.total + kl.reduce((a, k) => a + k.kurang, 0)
            return (
            <div key={t} className="card mb-3.5 border-l-4 border-danger !py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <b className="text-[15px] font-extrabold text-danger">Tunggakan tahun ajaran {t}</b>
                <b className="text-[15px] font-extrabold text-danger">{rp(jml)}</b>
              </div>
              <p className="mt-0.5 text-[12.5px] font-semibold text-muted">
                {g.items.length && kl.length ? 'SPP & kegiatan' : kl.length ? 'Kegiatan' : 'SPP'} tahun ajaran lalu yang belum lunas. Ketuk untuk mencatat pembayaran.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {kl.map((k) => (
                  <button
                    key={k.biayaId}
                    type="button"
                    onClick={() => setPeriode({ jenis: 'kegiatan', indeks: -1, biayaLaluId: k.biayaId })}
                    className="rounded-[14px] border-[1.5px] border-danger/35 bg-kartu px-3 py-2 text-left active:scale-[.98]"
                  >
                    <b className="block text-[13.5px] font-extrabold text-danger">{k.nama}</b>
                    <span className="block text-[11.5px] font-bold text-muted">{k.dibayar > 0 ? `kurang ${rp(k.kurang)}` : rp(k.kurang)}</span>
                  </button>
                ))}
                {g.items.map((x) => (
                  <button
                    key={x.indeks}
                    type="button"
                    onClick={() => setPeriode({ jenis: 'spp', indeks: x.indeks, ta: g.ta })}
                    className="rounded-[14px] border-[1.5px] border-danger/35 bg-kartu px-3 py-2 text-left active:scale-[.98]"
                  >
                    <b className="block text-[13.5px] font-extrabold text-danger">{namaBulanTa(g.ta, x.indeks)}</b>
                    <span className="block text-[11.5px] font-bold text-muted">{x.dibayar > 0 ? `kurang ${rp(x.kurang)}` : rp(x.kurang)}</span>
                  </button>
                ))}
              </div>
            </div>
            )
          })}

          <div className={`lg:grid lg:grid-cols-2 lg:gap-3.5 2xl:grid-cols-3 ${seg === 'paket' || s.daftarDepan ? '!hidden' : ''}`}>
            {seg === 'spp'
              ? BULAN.map((b, i) => {
                  const jml = dibayarSpp(s, i)
                  const t = targetSpp(s, i, pengaturan.sppNominal)
                  return (
                    <Kartu
                      key={b}
                      nomor={i + 1}
                      judul={b}
                      dibayar={jml}
                      target={t}
                      status={statusKartu('spp', i, jml, t)}
                      onClick={() => setPeriode({ jenis: 'spp', indeks: i })}
                    />
                  )
                })
              : biaya.length === 0
              ? <Kosong>Belum ada biaya kegiatan. Tambahkan di menu Jenis biaya.</Kosong>
              : biaya.map((b, i) => {
                  const jml = dibayarKegiatan(s, i)
                  const ikut = kegiatanWajib(s, i)
                  return (
                    <Kartu
                      key={b.id}
                      nomor={i + 1}
                      judul={b.nama}
                      ikon={emojiKegiatan(b)}
                      dibayar={jml}
                      target={b.nominal}
                      status={ikut || jml > 0 ? statusKartu('kegiatan', i, jml, b.nominal) : { warna: 'grey', label: 'Tidak ikut', bebas: true }}
                      onClick={() => setPeriode({ jenis: 'kegiatan', indeks: i })}
                    />
                  )
                })}
          </div>
          </>
          )}
        </div>
      </div>

      <SheetPeriode
        buka={!!periode}
        tutup={() => setPeriode(null)}
        siswaId={s.id}
        jenis={periode?.jenis}
        indeks={periode?.indeks}
        ta={periode?.ta || null}
        biayaLaluId={periode?.biayaLaluId || null}
        transaksiLuar={lamaDilihat ? bayarLama : null}
        onBerubah={() => lamaDilihat && setVersiLama((v) => v + 1)}
      />
      <div className="lg:hidden">
        <KartuRiwayatKelas s={s} bisaUbah={bisaUbah} onAtur={() => setSheetMasa(true)} onKeluar={() => setSheetKeluar(true)} />
      </div>
      <SheetMasaTerdaftar buka={sheetMasa} tutup={() => setSheetMasa(false)} s={s} />
      <SheetKeluar buka={sheetKeluar} tutup={() => setSheetKeluar(false)} s={s} />

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
 * Kartu siswa › tahun ajaran lalu (0044): 12 bulan SPP & kegiatan tahun itu, lengkap.
 * Angkanya dari ringkasan tunggakan (sudah ada di HP); rincian transaksinya dibaca saat
 * kartu bulan/kegiatan diketuk.
 */
function TahunLalu({ s, ta, seg, setSeg, biayaLain, buka }) {
  const k = (s.keanggotaan || []).find((x) => x.ta === ta)
  const target = s.sppTargetLalu?.[ta] || Array(12).fill(0)
  const bayar = s.sppLalu?.[ta] || Array(12).fill(0)
  const keg = biayaLain.filter((b) => b.tahunAjaran === ta)
  const kl = (s.kegiatanLalu || []).filter((x) => x.ta === ta)
  const targetSpp = target.reduce((t, v) => t + v, 0)
  const masukSpp = target.reduce((t, v, i) => t + (v > 0 ? Math.min(v, bayar[i] || 0) : 0), 0)
  const targetKeg = kl.reduce((t, x) => t + x.nominal, 0)
  const masukKeg = kl.reduce((t, x) => t + Math.min(x.nominal, x.dibayar), 0)
  const sisa = targetSpp - masukSpp + targetKeg - masukKeg
  const status = (dibayar, tg) => (!(tg > 0) ? { warna: 'grey', label: 'Tidak terdaftar', bebas: true }
    : dibayar >= tg ? { warna: 'green', label: 'Lunas' } : { warna: 'red', label: dibayar > 0 ? 'Kurang' : 'Nunggak' })
  return (
    <>
      <div className={`card mb-3.5 !py-3 ${sisa > 0 ? 'border-l-4 border-danger' : ''}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <b className="text-[15px] font-extrabold">Tahun ajaran {ta}</b>
          <b className={`text-[15px] font-extrabold ${sisa > 0 ? 'text-danger' : 'text-ok-deep'}`}>{sisa > 0 ? `Sisa ${rp(sisa)}` : 'Lunas ✓'}</b>
        </div>
        <p className="mt-0.5 text-[12.5px] font-semibold text-muted">
          {k ? `Kelas ${k.kelas} · ${teksMasa(k) || 'Juli – Juni'}${k.akhir ? ` · ${LABEL_AKHIR[k.akhir]}` : ''}` : 'Tidak terdaftar di tahun ini'}
          {' · '}SPP {rp(masukSpp)} dari {rp(targetSpp)}{targetKeg ? ` · kegiatan ${rp(masukKeg)} dari ${rp(targetKeg)}` : ''}
        </p>
      </div>
      <div className="lg:max-w-[420px]">
        <Segment nilai={seg === 'keg' ? 'keg' : 'spp'} ubah={setSeg} opsi={[{ nilai: 'spp', label: 'Iuran SPP' }, { nilai: 'keg', label: 'Kegiatan' }]} />
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-3.5 2xl:grid-cols-3">
        {seg !== 'keg'
          ? BULAN.map((b, i) => (
              <Kartu key={b} nomor={i + 1} judul={namaBulanTa(ta, i)} dibayar={bayar[i] || 0} target={target[i]}
                status={status(bayar[i] || 0, target[i])}
                onClick={() => target[i] > 0 && buka({ jenis: 'spp', indeks: i, ta })} />
            ))
          : keg.length === 0
          ? <Kosong>Tidak ada biaya kegiatan di tahun ajaran {ta}.</Kosong>
          : keg.map((b, i) => {
              const x = kl.find((y) => y.biayaId === b.id)
              return (
                <Kartu key={b.id} nomor={i + 1} judul={b.nama} ikon={emojiKegiatan(b)} dibayar={x?.dibayar || 0} target={b.nominal}
                  status={x ? status(x.dibayar, x.nominal) : { warna: 'grey', label: 'Tidak ikut', bebas: true }}
                  onClick={() => x && buka({ jenis: 'kegiatan', indeks: -1, biayaLaluId: b.id })} />
              )
            })}
      </div>
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
      className={`${status.bebas ? 'opacity-55 ' : ''}mb-2.5 w-full rounded-[20px] bg-kartu px-3.5 py-3 text-left shadow-[0_8px_24px_rgba(30,64,140,.08)] transition hover:-translate-y-[1px] hover:shadow-[0_10px_26px_rgba(30,64,140,.14)] dark:shadow-[0_8px_24px_rgba(0,0,0,.3)] lg:mb-0 lg:p-4`}
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
            {status.bebas && !dibayar ? 'Tidak ditagih' : <>{rp(dibayar)} <span className="opacity-60">/ {rp(target)}</span></>}
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
