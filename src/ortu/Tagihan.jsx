import { useState } from 'react'
import { Chevron, Chip, Ikon, Kosong, Segment, Track } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { BULAN, bulanBerjalan, dibayarKegiatan, labelJatuhTempoPeriode, dibayarSpp, persenBayar, rp, statusSpp, tanggalKegiatan } from '../lib/format.js'
import { IkonBank, JudulAnak } from './Beranda.jsx'
import { EMOJI_JENIS, LABEL_PANJANG, dibayarPaket, keteranganPaket, kurangSekarangPaket, paketSiswa, statusPaket, tahapPaket, tglPendek, urutPaket } from '../lib/paket.js'

/** Warna ubin bulan & chip per status SPP. */
const GAYA = {
  lunas: { permen: 'permen-tosca', teks: 'text-ok-deep', bar: '#22C55E' },
  sebagian: { permen: 'permen-kuning', teks: 'text-warn-deep', bar: '#F5A524' },
  nunggak: { permen: 'permen-pink', teks: 'text-danger', bar: '#EF4444' },
  'belum-bayar': { permen: 'permen-kuning', teks: 'text-warn-deep', bar: '#F5A524' },
  menunggu: { permen: 'permen-abu', teks: 'text-muted', bar: '#C9D0DC' },
}

export default function Tagihan({ aktif, bukaCaraBayar, bukaKegiatan }) {
  const { pengaturan, biaya, paket } = useData()
  // ?tab=kegiatan / ?tab=pmb → langsung buka tab itu (dipakai dari Beranda & pemberitahuan)
  const [seg, setSeg] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'kegiatan' ? 'keg' : t === 'pmb' ? 'paket' : 'spp'
  })
  const kini = bulanBerjalan()
  const a = aktif
  const paketAnak = paketSiswa(paket, a.id).sort(urutPaket)
  const tab = seg === 'paket' && !paketAnak.length ? 'spp' : seg

  return (
    <>
      <JudulAnak anak={a} judul="Rincian tagihan" sub={`${a.nama} · Kelas ${a.kelas} · ${pengaturan.tahunAjaran}`} />

      <div className="lg:max-w-[420px]">
        <Segment
          nilai={tab}
          ubah={setSeg}
          opsi={[
            { nilai: 'spp', label: 'Iuran SPP' },
            { nilai: 'keg', label: paketAnak.length ? 'Kegiatan' : 'Biaya kegiatan' },
            ...(paketAnak.length ? [{ nilai: 'paket', label: 'PMB & DU' }] : []),
          ]}
        />
      </div>
      {tab === 'paket' && paketAnak.map((p) => <PaketAnak key={p.id} p={p} dibayar={dibayarPaket(a, p.id)} />)}
      {tab === 'keg' && biaya.length > 0 && (
        <p className="sub-halaman -mt-1 mb-2.5 px-1 text-[12.5px] font-bold">Ketuk kegiatan untuk melihat jadwal & keterangan lengkapnya.</p>
      )}

      <div className={`card !py-1.5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:!px-6 ${tab === 'paket' ? '!hidden' : ''}`}>
        {tab === 'spp'
          ? BULAN.map((b, i) => {
              const dibayar = dibayarSpp(a, i)
              const target = pengaturan.sppNominal
              const status = statusSpp(dibayar, target, i, kini, pengaturan.tanggalJatuhTempo)
              const g = GAYA[status]
              return (
                <Baris
                  key={b}
                  ubin={<span className={`permen permen-kecil ${g.permen} grid h-11 w-11 shrink-0 place-items-center rounded-[14px] font-display text-[14px] font-bold`}>{b.slice(0, 3)}</span>}
                  judul={b}
                  catatan={
                    <b className={`font-extrabold ${g.teks}`}>
                      {status === 'lunas' ? 'Lunas · sudah dibayar penuh'
                      : status === 'sebagian' ? `Kurang ${rp(target - dibayar)}`
                      : status === 'nunggak' ? `Terlambat · jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i)}`
                      : status === 'belum-bayar' ? `Belum bayar · jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i)}`
                      : `Jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i)}`}
                    </b>
                  }
                  dibayar={dibayar}
                  target={target}
                  warnaBar={g.bar}
                />
              )
            })
          : biaya.length === 0
          ? <Kosong>Belum ada biaya kegiatan pada tahun ajaran ini.</Kosong>
          : biaya.map((b, i) => {
              const dibayar = dibayarKegiatan(a, i)
              const lunas = dibayar >= b.nominal
              const sebagian = !lunas && dibayar > 0
              const tgl = tanggalKegiatan(b, true)
              return (
                <Baris
                  key={b.id}
                  ubin={<GambarKegiatan emoji={emojiKegiatan(b)} size={44} className="rounded-[14px]" />}
                  judul={b.nama}
                  ketuk={bukaKegiatan ? () => bukaKegiatan(b.id) : null}
                  catatan={
                    <>
                      {tgl && <span className="font-bold text-brand">{tgl} · </span>}
                      <b className={`font-extrabold ${lunas ? 'text-ok-deep' : 'text-warn-deep'}`}>
                        {lunas ? 'Lunas' : sebagian ? `Kurang ${rp(b.nominal - dibayar)}` : 'Belum dibayar'}
                      </b>
                    </>
                  }
                  dibayar={dibayar}
                  target={b.nominal}
                  warnaBar={lunas ? '#22C55E' : '#F5A524'}
                />
              )
            })}
      </div>

      <button className="bigbtn mt-4 flex items-center justify-center gap-2 lg:max-w-[340px]" onClick={bukaCaraBayar}>
        <IkonBank size={19} />
        Lihat cara pembayaran
      </button>
    </>
  )
}

/**
 * Satu paket PMB / daftar ulang untuk orang tua: sisa yang perlu dibayar,
 * jadwal cicilan, dan "untuk apa saja" (rincian biaya dari sekolah).
 */
function PaketAnak({ p, dibayar }) {
  const st = statusPaket(p, dibayar)
  const tahap = tahapPaket(p, dibayar)
  const sisa = Math.max(0, p.total - dibayar)
  const persen = persenBayar(dibayar, p.total)
  return (
    <div className="mb-4 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div className="grid gap-3.5">
        <section className={`${p.jenis === 'pmb' ? 'kartu-saldo-minus' : 'kartu-paket-du'} rounded-[26px] p-4`}>
          <span className="text-[11px] font-extrabold uppercase tracking-[.08em]">{p.jenis === 'pmb' ? 'Biaya pendaftaran (PMB)' : 'Biaya daftar ulang'} · {p.tahunAjaran}</span>
          <div className="mt-2 flex items-center gap-3">
            <GambarKegiatan emoji={EMOJI_JENIS[p.jenis]} size={54} className="!rounded-[16px] shadow-[inset_0_-4px_0_rgba(0,0,0,.07)]" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold">{st === 'lunas' ? 'Sudah lunas — terima kasih!' : 'Sisa yang perlu dibayar'}</span>
              <b className="block break-all font-display text-[28px] font-bold leading-tight">{rp(st === 'lunas' ? p.total : sisa)}</b>
              <span className="block text-[12px] font-extrabold">Sudah dibayar {rp(dibayar)} dari {rp(p.total)}</span>
            </span>
          </div>
          <div className="mt-3 h-[9px] overflow-hidden rounded-full bg-white/65 dark:bg-white/15">
            <i className="block h-full rounded-full bg-ok" style={{ width: `${persen}%` }} />
          </div>
          {st === 'terlambat' && (
            <div className="mt-3 flex items-center gap-2.5 rounded-[16px] bg-white/70 px-3 py-2.5 text-[12px] font-extrabold leading-snug dark:bg-white/10">
              <Ikon.peringatan size={18} />
              <span>{keteranganPaket(p, dibayar)} — mohon segera dibayar ({rp(kurangSekarangPaket(p, dibayar))}).</span>
            </div>
          )}
        </section>

        {tahap.length > 0 && (
          <section className="card !pb-1.5">
            <h2 className="judul-kartu text-[18px]">Jadwal cicilan</h2>
            <p className="mb-1 text-[12px] font-semibold text-muted">Boleh bayar berapa saja, kapan saja sebelum jatuh tempo.</p>
            {tahap.map((t, i) => (
              <div key={i} className="row items-center">
                <span className={`permen permen-kecil grid h-10 w-10 shrink-0 place-items-center rounded-[13px] font-display text-[16px] font-bold ${
                  t.lunas ? 'permen-tosca' : t.lewat ? 'permen-pink' : t.terisi > 0 ? 'permen-kuning' : 'permen-abu'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px] font-extrabold">{t.nama} · {tglPendek(t.jatuhTempo, true)}</b>
                  <span className="block text-[12px] font-semibold text-muted">
                    {t.lunas ? `${rp(t.nominal)} · sudah dibayar penuh` : t.terisi > 0 ? `Kurang ${rp(t.kurang)} dari ${rp(t.nominal)}` : rp(t.nominal)}
                  </span>
                  {t.terisi > 0 && !t.lunas && <div className="mt-1.5"><Track persen={persenBayar(t.terisi, t.nominal)} warna={t.lewat ? '#EF4444' : '#F5A524'} tinggi={5} /></div>}
                </span>
                <Chip warna={t.lunas ? 'green' : t.lewat ? 'red' : 'grey'}>{t.lunas ? 'Lunas' : t.lewat ? 'Terlambat' : 'Akan datang'}</Chip>
              </div>
            ))}
          </section>
        )}
      </div>

      <section className="card">
        <h2 className="judul-kartu text-[18px]">Untuk apa saja?</h2>
        <p className="mb-1 text-[12px] font-semibold text-muted">Rincian {LABEL_PANJANG[p.jenis].toLowerCase()} dari sekolah</p>
        {p.rincian.map((r, i) => (
          <div key={i} className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-line py-2.5 text-[13.5px] font-semibold last:border-b-0">
            <span className="text-[#34405C] dark:text-[#B8C3DC]">{r.nama}</span>
            <b className="shrink-0">{rp(r.nominal)}</b>
          </div>
        ))}
        <div className="mt-1.5 flex justify-between rounded-[14px] bg-canvas px-3 py-2.5 text-[14px] font-extrabold">
          <span>Total</span>
          <span>{rp(p.total)}</span>
        </div>
      </section>
    </div>
  )
}

/**
 * Satu baris tagihan: baris atas = nama + nominal tagihan, baris bawah =
 * keterangan status selebar penuh (tidak berebut tempat dengan angka, jadi
 * tidak terlipat jadi kolom sempit). Cicilan sebagian → bilah + "dibayar".
 */
const Baris = ({ ubin, judul, catatan, dibayar, target, warnaBar, ketuk }) => {
  const Wadah = ketuk ? 'button' : 'div'
  const sebagian = dibayar > 0 && dibayar < target
  return (
    <Wadah className={`row items-center py-3 ${ketuk ? 'w-full text-left' : ''}`} onClick={ketuk || undefined}>
      {ubin}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <b className="min-w-0 truncate text-[14.5px] font-extrabold">{judul}</b>
          <span className="shrink-0 font-display text-[14px] font-bold text-[#34405C] dark:text-[#DCE3F2]">{rp(target)}</span>
        </div>
        <div className="mt-0.5 text-[12px] font-semibold leading-snug text-muted">{catatan}</div>
        {sebagian && (
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="min-w-0 flex-1"><Track persen={persenBayar(dibayar, target)} warna={warnaBar} tinggi={5} /></div>
            <span className="shrink-0 text-[11px] font-extrabold text-muted">dibayar {rp(dibayar)}</span>
          </div>
        )}
      </div>
      {ketuk && <Chevron />}
    </Wadah>
  )
}
