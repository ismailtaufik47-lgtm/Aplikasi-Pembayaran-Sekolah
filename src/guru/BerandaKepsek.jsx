/**
 * Beranda KEPALA SEKOLAH (v25) — dasbor pemantauan yang mudah dibaca di HP:
 *
 *   sapaan · speedometer "Kesehatan keuangan" (skor 0–100) · celengan SPP
 *   berisi uang kertas · perlu perhatian (maks. 3) · 4 kartu ringkasan ·
 *   masuk & keluar 6 bulan · Tanya SAKU · pengaturan sekolah
 *
 * Setiap kartu bisa diketuk → pop-up rincian (RincianKepsek.jsx). Angka kas
 * diambil dari fungsi kas_* di database (sama dengan menu Kas & Laporan);
 * status tagihan dari lib/statusSiswa.js (sama dengan menu Tagihan & Siswa);
 * penilaian dari lib/kesehatan.js. Admin/TU tetap memakai Beranda.jsx.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/store.jsx'
import { AdeganSekolah as AdeganBeranda, EmojiMenu, Ikon, Sheet } from '../components/ui.jsx'
import Speedometer from '../components/Speedometer.jsx'
import CelenganUang from '../components/CelenganUang.jsx'
import { Garis, KartuSaku } from './KartuBeranda.jsx'
import RincianKepsek from './RincianKepsek.jsx'
import { BULAN, bulanBerjalan, rp, tanggalISO } from '../lib/format.js'
import { NAMA_BULAN, geserBulan, kunciBulan } from '../lib/kas.js'
import { ZONA, desimal } from '../lib/kesehatan.js'
import { useKesehatan } from './useKesehatan.js'
import { menuSekolah } from '../lib/akses.js'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu']

function salamWaktu(jam = new Date().getHours()) {
  if (jam < 11) return 'Selamat pagi'
  if (jam < 15) return 'Selamat siang'
  if (jam < 18) return 'Selamat sore'
  return 'Selamat malam'
}

/** "Rp 8,7 juta" untuk angka besar (lebih mudah dibaca), selain itu rupiah biasa. */
export const rpJuta = (n) => (Math.abs(n) >= 1e6 ? `${n < 0 ? '−' : ''}Rp ${desimal(Math.abs(n) / 1e6)} juta` : rp(n))

const WARNA_ZONA = {
  hijau: { teks: 'text-ok-deep', latar: 'bg-ok-soft', bulat: 'bg-[#2FBF71] shadow-[inset_0_-4px_0_#1E9A57]' },
  kuning: { teks: 'text-warn-deep', latar: 'bg-warn-soft', bulat: 'bg-[#F5B53D] shadow-[inset_0_-4px_0_#D99A1E]' },
  merah: { teks: 'text-danger', latar: 'bg-danger-soft', bulat: 'bg-[#EF4444] shadow-[inset_0_-4px_0_#C62828]' },
  kosong: { teks: 'text-muted', latar: 'bg-isi', bulat: 'bg-[#AEB6C8] shadow-[inset_0_-4px_0_#8A93A6]' },
}
const IKON_ZONA = {
  hijau: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  kuning: <path d="M12 6v8M12 18v.01" />,
  merah: <path d="M7 7l10 10M17 7L7 17" />,
  kosong: <path d="M8 12h8" />,
}

export default function BerandaKepsek({ onCatat }) {
  const { pengaturan, siswa, petugas, peran, boleh, segarkan, toast } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()
  const bulanIni = kunciBulan(tanggalISO())
  const namaBulan = NAMA_BULAN[Number(bulanIni.slice(5)) - 1]

  // ---------- data kas, status siswa, rekap kegiatan, penilaian (useKesehatan.js) ----------
  const { d, kes, indikator, statusList, rekap, nota, muatUlang: muatData, versi } = useKesehatan()

  // ---------- perlu perhatian (maks. 3, yang paling berat dulu) ----------
  const perhatian = useMemo(() => {
    if (!kes) return []
    const out = []
    const kr = Object.fromEntries(kes.kriteria.map((x) => [x.k, x]))
    const berat = (k) => (kr[k]?.status === 'tindakan' ? 0 : 1)
    if (kr.cad && ['pantau', 'tindakan'].includes(kr.cad.status)) {
      out.push({ berat: berat('cad'), warna: 'merah', ikon: 'dompet', judul: `Kas bebas tinggal ${kr.cad.nilai.replace('±', '±')}`, sub: kes.rem ? 'Kurang dari 1 bulan biaya rutin — rem darurat' : `Target ≥ ${kes.aturan.target.cad} bulan`, buka: { jenis: 'saldo' } })
    }
    kes.nombok.forEach((x) => out.push({
      berat: 1, warna: 'merah', ikon: 'peringatan', judul: `${x.nama} nombok ${rp(-x.sisa)}`,
      sub: `Ditutup kas sekolah${x.belumBayar?.length ? ` · ${x.belumBayar.length} siswa belum bayar` : ''}`, buka: { jenis: 'keg', kunci: x.kunci },
    }))
    const telatPaket = {}
    statusList.forEach((x) => x.items.filter((i) => i.jenis === 'paket' && i.status === 'nunggak').forEach((i) => {
      telatPaket[i.paketJenis] = (telatPaket[i.paketJenis] || 0) + 1
    }))
    Object.entries(telatPaket).forEach(([j, n]) => out.push({
      berat: 1, warna: 'kuning', ikon: 'jam', judul: `${n} ${j === 'pmb' ? 'calon siswa PMB' : 'siswa daftar ulang'} terlambat`,
      sub: 'Tahap cicilan lewat jatuh tempo', buka: { jenis: 'tunggak', saring: 'paket' },
    }))
    if (kr.spp && ['pantau', 'tindakan'].includes(kr.spp.status)) {
      out.push({ berat: berat('spp'), warna: 'kuning', ikon: 'siswa', judul: `SPP baru ${kes.sppPersen}% — target ${kes.aturan.target.spp}%`, sub: `${kes.belumLunasSpp} siswa belum lunas ${BULAN[kini]}`, buka: { jenis: 'spp' } })
    }
    if (kr.tungg && ['pantau', 'tindakan'].includes(kr.tungg.status)) {
      out.push({ berat: berat('tungg'), warna: 'merah', ikon: 'nota', judul: `Tunggakan ${rpJuta(kes.tunggakan)}`, sub: `${kes.tunggPersen}% dari SPP sebulan · ${kes.anakNunggak} anak`, buka: { jenis: 'tunggak' } })
    }
    if (kr.arus && ['pantau', 'tindakan'].includes(kr.arus.status)) {
      out.push({ berat: berat('arus'), warna: 'merah', ikon: 'keluar', judul: kr.arus.minusLalu ? 'Kas minus 2 bulan berturut-turut' : 'Pengeluaran lebih besar dari pemasukan', sub: `Selisih ${rp(kr.arus.selisih)}`, buka: { jenis: 'keluar' } })
    }
    if (nota.tanpa.length) {
      out.push({ berat: 2, warna: 'biru', ikon: 'kamera', judul: `${nota.tanpa.length} pengeluaran tanpa nota`, sub: nota.tanpa.slice(0, 2).map((k) => k.keterangan || k.kategori).join(' & '), buka: { jenis: 'nota' } })
    }
    if (kr.proy && ['pantau', 'tindakan'].includes(kr.proy.status)) {
      out.push({ berat: berat('proy'), warna: 'merah', ikon: 'grafik', judul: 'Perkiraan 3 bulan: kas menipis', sub: kr.proy.nilai, buka: { jenis: 'sehat' } })
    }
    return out.sort((a, b) => a.berat - b.berat).slice(0, 3)
  }, [kes, statusList, nota, kini])

  // ---------- tren 6 bulan ----------
  const tren = (d.arus || []).slice(-6)
  const [pilihBulan, setPilihBulan] = useState(null)
  const iBulan = pilihBulan ?? tren.length - 1

  // ---------- pop-up ----------
  const [buka, setBuka] = useState(null)
  const bisaAtur = boleh('sekolah')
  const menu = menuSekolah(boleh, peran)
  const adaMenu = (id) => menu.some((m) => m.id === id)
  const tanya = (q) => nav('/guru/tanya-ai', { state: { tanya: q } })
  const muatUlang = () => { segarkan(); muatData(); toast('Data disegarkan') }

  const zona = kes?.zona || 'kosong'
  const wz = WARNA_ZONA[zona]
  const lap = d.lap || {}
  const arusLalu = (d.arus || []).find((a) => a.bulan === geserBulan(bulanIni, -1))
  const hariIni = new Date()
  const tglPendek = `${HARI[hariIni.getDay()]}, ${hariIni.getDate()} ${NAMA_BULAN[hariIni.getMonth()].slice(0, 3)} ${hariIni.getFullYear()}`
  const tglPanjang = `${HARI[hariIni.getDay()]}, ${hariIni.getDate()} ${NAMA_BULAN[hariIni.getMonth()]} ${hariIni.getFullYear()}`
  const salam = `${salamWaktu()}${petugas ? `, ${petugas}` : ''}!`

  const dataRincian = { kes, lap, arus: d.arus || [], arusLalu, info: d.info, statusList, rekap, nota, siswa, pengaturan, kini, namaBulan, bisaAtur, adaMenu }

  return (
    <>
      {/* ---------- HP: sapaan ---------- */}
      <div className="relative mb-3 mt-1 min-h-[150px] lg:hidden">
        <AdeganBeranda className="absolute -right-[14px] bottom-0 h-[140px] w-[158px]" />
        <div className="relative z-[1] max-w-[60%]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[12px] font-extrabold text-[#1B2559] dark:bg-white/10 dark:text-ink">
            <Garis.kalender size={14} />
            {tglPendek}
          </span>
          <h1 className="judul-halaman mt-2.5 font-display text-[27px] font-bold leading-[1.1]">{salam}</h1>
          <p className="sub-halaman mt-1.5 text-[14px] font-bold leading-snug">Keuangan {pengaturan.namaSekolah} hari ini.</p>
        </div>
      </div>

      {/* ---------- PC: sapaan + tombol ---------- */}
      <div className="hero-beranda relative mt-6 hidden min-h-[196px] items-stretch gap-4 overflow-hidden rounded-[28px] lg:flex">
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center gap-2 py-6 pl-7">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-extrabold text-[#1B2559] dark:bg-white/10 dark:text-ink">
            <Garis.kalender size={15} />
            {tglPanjang}
          </span>
          <h1 className="judul-halaman mt-1 font-display text-[36px] font-bold leading-[1.1]">{salam}</h1>
          <p className="sub-halaman text-[15px] font-bold">Ringkasan keuangan {pengaturan.namaSekolah} — ketuk kartu mana saja untuk melihat rinciannya.</p>
        </div>
        <AdeganBeranda besar className="relative hidden h-[196px] w-[330px] shrink-0 self-end xl:block" />
        <div className="relative z-[1] flex w-[228px] shrink-0 flex-col justify-center gap-2.5 py-5 pr-6">
          {bisaAtur && (
            <button onClick={() => nav('/guru/atur-indikator')} className="tombol-putih flex h-[46px] items-center justify-center gap-2 rounded-[14px] text-[14px] font-extrabold">
              <EmojiMenu id="indikator" size={26} latar={false} />
              Atur indikator
            </button>
          )}
          {onCatat && (
            <button onClick={() => onCatat(null)} className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] bg-brand text-[14px] font-extrabold text-white hover:bg-brand-deep">
              <Garis.plus size={18} /> Catat pembayaran
            </button>
          )}
          <button onClick={muatUlang} className="tombol-putih flex h-[42px] items-center justify-center gap-1.5 rounded-[14px] text-[13.5px] font-extrabold">
            <Garis.muat size={16} /> Muat ulang
          </button>
        </div>
      </div>

      {d.galat && (
        <div className="card mt-3 border-l-4 border-danger text-[14px] font-semibold text-danger lg:mt-5">
          Data kas belum bisa dimuat: {d.galat}
        </div>
      )}

      {/* ---------- baris 1: kesehatan · celengan · perlu perhatian ---------- */}
      <div className="grid gap-4 lg:mt-5 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {/* kesehatan keuangan */}
        <button
          type="button"
          onClick={() => setBuka({ jenis: 'sehat' })}
          className="card kartu-timbul flex min-w-0 flex-col items-center text-center lg:p-5"
          aria-label={`Kesehatan keuangan: ${ZONA[zona].pendek}${kes?.skor != null ? `, skor ${kes.skor}` : ''}. Ketuk untuk melihat alasannya`}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="text-[16px] font-extrabold text-[#2F3747] dark:text-ink">Kesehatan keuangan</span>
            <span className="rounded-full bg-isi px-2.5 py-1 text-[12.5px] font-bold text-muted">Hari ini</span>
          </span>
          {d.siap ? <Speedometer skor={kes?.skor ?? null} className="mt-2 w-full max-w-[300px]" /> : <span className="mt-2 block h-[170px] w-full max-w-[300px] animate-pulse rounded-[20px] bg-isi" />}
          <span className="mt-1 flex items-center justify-center gap-2.5">
            <span className={`grid h-10 w-10 place-items-center rounded-full text-white ${wz.bulat}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IKON_ZONA[zona]}</svg>
            </span>
            <b className={`font-display text-[clamp(24px,7vw,34px)] font-bold tracking-wide ${wz.teks}`}>{d.siap ? ZONA[zona].label : 'MEMUAT…'}</b>
          </span>
          {kes?.skor != null && <span className={`mt-1.5 rounded-full px-3 py-1 text-[13.5px] font-extrabold ${wz.latar} ${wz.teks}`}>Skor {kes.skor} dari 100</span>}
          {kes && <span className="mt-2 block text-[15.5px] font-semibold leading-relaxed text-[#2F3747] dark:text-ink">{kes.kalimat}</span>}
          <span className="mt-auto flex items-center gap-1 pt-3 text-[14.5px] font-extrabold text-brand">
            Lihat alasannya <Garis.kanan size={16} />
          </span>
        </button>

        {/* celengan SPP */}
        <button
          type="button"
          onClick={() => setBuka({ jenis: 'spp' })}
          className="card kartu-timbul flex min-w-0 items-center gap-3 text-left lg:flex-col lg:p-5 lg:text-center"
          aria-label={`SPP ${BULAN[kini]}: ${kes?.sppPersen ?? 0} persen masuk. Ketuk untuk melihat siapa yang belum bayar`}
        >
          <span className="hidden w-full text-left text-[16px] font-extrabold text-[#2F3747] dark:text-ink lg:block">SPP bulan ini</span>
          <CelenganUang persen={kes?.sppPersen ?? 0} key={`${kes?.sppPersen}-${versi}`} className="w-[38%] max-w-[150px] shrink-0 lg:mt-1 lg:w-[165px] lg:max-w-none" />
          <span className="min-w-0 flex-1 lg:flex lg:w-full lg:flex-col lg:items-center">
            <span className="block text-[15px] font-extrabold text-[#2F3747] dark:text-ink lg:hidden">SPP {BULAN[kini]}</span>
            <span className="mt-0.5 flex items-baseline gap-1.5 lg:justify-center">
              <b className="font-display text-[34px] font-bold leading-none text-[#1B2559] dark:text-ink">{kes?.sppPersen ?? 0}%</b>
              <span className="text-[14px] font-bold text-muted">masuk</span>
            </span>
            <b className="mt-1 block font-display text-[19px] font-semibold text-[#1B2559] dark:text-ink">{rp(kes?.sppMasuk || 0)}</b>
            <span className="block text-[13.5px] font-semibold text-muted">dari {rp(kes?.sppTarget || 0)}</span>
            <span className="mt-2 flex flex-wrap gap-1.5 lg:justify-center">
              <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[13px] font-extrabold text-ok-deep">{siswa.length - (kes?.belumLunasSpp || 0)} lunas</span>
              {kes?.belumLunasSpp > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[13px] font-extrabold text-danger">{kes.belumLunasSpp} belum</span>}
            </span>
            <span className="mt-2 flex items-center gap-1 text-[14px] font-extrabold text-brand lg:justify-center">
              Lihat siapa saja <Garis.kanan size={15} />
            </span>
          </span>
        </button>

        {/* perlu perhatian */}
        <div className="card kartu-timbul min-w-0 lg:col-span-2 lg:p-5 xl:col-span-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="judul-kartu text-[18px]">Perlu perhatian</h2>
            {perhatian.length > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1.5 text-[13px] font-extrabold text-white">{perhatian.length}</span>
            )}
          </div>
          {!d.siap ? (
            <p className="py-6 text-center text-[14px] font-semibold text-muted">Memuat…</p>
          ) : perhatian.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <span className="permen permen-tosca grid h-12 w-12 shrink-0 place-items-center rounded-[16px]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <span className="text-[15px] font-bold">Tidak ada yang perlu ditindaklanjuti hari ini.</span>
            </div>
          ) : (
            perhatian.map((x, i) => (
              <button key={i} type="button" onClick={() => setBuka(x.buka)} className="row w-full items-center text-left">
                <IkonPerhatian ikon={x.ikon} warna={x.warna} />
                <span className="min-w-0 flex-1">
                  <b className="block break-words text-[15.5px] font-extrabold leading-snug">{x.judul}</b>
                  <span className="block break-words text-[13.5px] font-semibold text-muted">{x.sub}</span>
                </span>
                <Garis.kanan size={18} className="shrink-0 text-muted" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* ---------- 4 kartu ringkasan ---------- */}
      <h2 className="judul-halaman mx-0.5 mb-2.5 mt-5 font-display text-[20px] font-semibold lg:hidden">Ringkasan {namaBulan}</h2>
      <div className="grid grid-cols-2 gap-3 lg:mt-5 lg:gap-5 xl:grid-cols-4">
        <UbinRingkas warna="tosca" ikon={<Garis.masuk size={22} />} label="Uang masuk" nilai={d.siap ? rpJuta(lap.totalMasuk || 0) : '…'}
          kaki={<Banding kini={lap.totalMasuk} lalu={arusLalu?.masuk} />} onClick={() => setBuka({ jenis: 'masuk' })} />
        <UbinRingkas warna="ungu" ikon={<Garis.keluar size={22} />} label="Uang keluar" nilai={d.siap ? rpJuta(lap.totalKeluar || 0) : '…'}
          kaki={<Banding kini={lap.totalKeluar} lalu={arusLalu?.keluar} keluar />} onClick={() => setBuka({ jenis: 'keluar' })} />
        <UbinRingkas warna="kuning" ikon={<Garis.dompet size={22} />} label="Saldo kas" nilai={d.siap ? rpJuta(d.info?.saldoKini || 0) : '…'}
          kaki={kes && d.info?.pengaturan ? `bebas ${rpJuta(kes.kasBebas)}` : 'saldo awal belum diisi'} onClick={() => setBuka({ jenis: 'saldo' })} />
        <UbinRingkas warna="pink" ikon={<Garis.nota size={22} />} label="Tunggakan" nilai={rpJuta(kes?.tunggakan || 0)}
          kaki={kes?.anakNunggak ? `dari ${kes.anakNunggak} anak` : 'tidak ada'} onClick={() => setBuka({ jenis: 'tunggak' })} />
      </div>

      {/* ---------- tren + SAKU + pengaturan ---------- */}
      <div className="mt-4 grid gap-4 lg:mt-5 lg:grid-cols-3 lg:gap-5">
        <div className="card kartu-timbul min-w-0 lg:col-span-2 lg:p-5">
          <h2 className="judul-kartu text-[19px]">Uang masuk &amp; keluar · 6 bulan</h2>
          <p className="mt-0.5 text-[13.5px] font-semibold text-muted">Ketuk bulan untuk melihat angkanya</p>
          <div className="mb-3 mt-3 flex gap-4 text-[13.5px] font-bold">
            <span className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[4px] bg-brand" />Uang masuk</span>
            <span className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[4px] bg-[#F27A2E]" />Uang keluar</span>
          </div>
          <GrafikTren tren={tren} pilih={iBulan} ubah={setPilihBulan} />
        </div>
        <div className="grid min-w-0 content-start gap-4 lg:gap-5">
          {boleh('ai') && (
            <KartuSaku
              onTanya={tanya}
              saran={[
                { ikon: <Garis.siswa size={17} />, label: 'Siapa yang belum bayar SPP?', tanya: 'Siapa saja yang belum bayar SPP bulan ini?' },
                { ikon: <Garis.grafik size={17} />, label: 'Bandingkan dengan bulan lalu', tanya: `Bandingkan pemasukan dan pengeluaran ${namaBulan} dengan bulan lalu` },
                { ikon: <Garis.nota size={17} />, label: 'Kegiatan mana yang nombok?', tanya: 'Kegiatan mana yang pengeluarannya lebih besar dari uang masuknya?' },
              ]}
            />
          )}
          <KartuPengaturan nav={nav} adaMenu={adaMenu} />
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 px-1 text-[12.5px] font-semibold leading-relaxed text-muted lg:mt-5">
        <Ikon.info size={16} className="mt-px shrink-0" />
        <span>Indikator kesehatan adalah alat bantu pemantauan internal sekolah, bukan penilaian atau audit resmi. Cara hitungnya terbuka — ketuk speedometer.{indikator.diubahNama ? ` Aturan terakhir diubah ${indikator.diubahNama}.` : ''}</span>
      </p>

      <Sheet buka={!!buka} tutup={() => setBuka(null)}>
        {buka && <RincianKepsek buka={buka} d={dataRincian} tutup={() => setBuka(null)} ganti={setBuka} />}
      </Sheet>
    </>
  )
}

/* ---------------- bagian kecil ---------------- */

const WARNA_IKON = {
  merah: 'bg-[#FFD3CC] text-[#8F1D12] shadow-[inset_0_-4px_0_#F2A497] dark:bg-[rgba(255,120,100,.18)] dark:text-[#FFB4A8] dark:shadow-none',
  kuning: 'permen permen-kuning',
  biru: 'permen permen-biru',
}
const JALUR = {
  peringatan: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  jam: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  kamera: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.6" /></>,
  siswa: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /></>,
  nota: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  keluar: <><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4 16v3h16v-3" /></>,
  dompet: <><path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 7.5L15 4v3.5" /></>,
  grafik: <path d="M5 20V10M12 20V4M19 20v-7" />,
}
function IkonPerhatian({ ikon, warna }) {
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] ${WARNA_IKON[warna]}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{JALUR[ikon]}</svg>
    </span>
  )
}

function UbinRingkas({ warna, ikon, label, nilai, kaki, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`permen permen-${warna} kartu-timbul flex min-h-[150px] min-w-0 flex-col items-start gap-1 rounded-[24px] p-3.5 text-left lg:min-h-[140px] lg:flex-row lg:items-center lg:gap-3.5 lg:p-5`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-white/75 dark:bg-white/10 lg:h-14 lg:w-14">{ikon}</span>
      <span className="mt-1 block min-w-0 lg:mt-0">
        <span className="block text-[14.5px] font-extrabold">{label}</span>
        <b className="block break-words font-display text-[23px] font-semibold leading-tight lg:text-[26px]">{nilai}</b>
        <span className="mt-0.5 block text-[13px] font-extrabold opacity-90">{kaki}</span>
      </span>
    </button>
  )
}

function Banding({ kini = 0, lalu, keluar = false }) {
  if (lalu == null) return <span>bulan ini</span>
  if (kini === lalu) return <span>sama dengan bulan lalu</span>
  const naik = kini > lalu
  return (
    <span className="inline-flex items-center gap-1">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {naik ? <><path d="M4 16l6-6 4 4 6-6" /><path d="M15 8h5v5" /></> : <><path d="M4 8l6 6 4-4 6 6" /><path d="M15 16h5v-5" /></>}
      </svg>
      {naik ? 'naik' : 'turun'} dari bln lalu{keluar ? '' : ''}
    </span>
  )
}

/** Batang masuk (biru) & keluar (oranye) per bulan; ketuk bulan → angkanya. */
function GrafikTren({ tren, pilih, ubah }) {
  // di layar lebar grafiknya lebih tinggi supaya sejajar dengan kolom kanan (SAKU + pengaturan)
  const [lebar] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches)
  if (!tren.length) return <p className="py-8 text-center text-[14px] font-semibold text-muted">Belum ada data kas.</p>
  const maks = Math.max(1, ...tren.flatMap((t) => [t.masuk, t.keluar]))
  const skala = Math.pow(10, Math.floor(Math.log10(maks)))
  const atas = Math.ceil(maks / skala) * skala
  const garis = [atas, atas / 2]
  const T = lebar ? 300 : 170
  const p = tren[Math.min(pilih, tren.length - 1)]
  const selisih = p.masuk - p.keluar
  const [y, m] = p.bulan.split('-').map(Number)
  return (
    <>
      <div className="flex gap-1.5">
        <div className="relative w-11 shrink-0 text-right text-[12px] font-bold text-muted" style={{ height: T }}>
          {garis.map((g) => (
            <span key={g} className="absolute right-1" style={{ bottom: (g / atas) * T - 8 }}>{rpRingkasJt(g)}</span>
          ))}
          <span className="absolute bottom-[-8px] right-1">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: T }}>
            {garis.map((g) => <div key={g} className="absolute inset-x-0 border-t-[1.5px] border-dashed border-line" style={{ bottom: (g / atas) * T }} />)}
            <div className="absolute inset-x-0 bottom-0 border-t-2 border-[#C9D3E4] dark:border-line" />
          </div>
          <div className="relative flex gap-1">
            {tren.map((t, i) => (
              <button
                key={t.bulan}
                type="button"
                onClick={() => ubah(i)}
                aria-pressed={i === pilih}
                aria-label={`${NAMA_BULAN[Number(t.bulan.slice(5)) - 1]}: masuk ${rp(t.masuk)}, keluar ${rp(t.keluar)}`}
                className={`flex min-w-0 flex-1 flex-col items-center rounded-[14px] ${i === pilih ? 'bg-brand/10 dark:bg-white/10' : ''}`}
              >
                <span className="flex items-end gap-[3px]" style={{ height: T }}>
                  <span className="batang-tumbuh w-[13px] rounded-t-[5px] bg-brand shadow-[inset_-4px_0_0_#2A55CC] sm:w-[18px]" style={{ height: Math.max(2, (t.masuk / atas) * T) }} />
                  <span className="batang-tumbuh w-[13px] rounded-t-[5px] bg-[#F27A2E] shadow-[inset_-4px_0_0_#CF5C14] sm:w-[18px]" style={{ height: Math.max(2, (t.keluar / atas) * T) }} />
                </span>
                <span className={`pb-2 pt-2 text-[13.5px] ${i === pilih ? 'font-extrabold text-brand' : 'font-semibold text-muted'}`}>{NAMA_BULAN[Number(t.bulan.slice(5)) - 1].slice(0, 3)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-[18px] bg-isi px-4 py-3.5">
        <b className="block text-[16px] font-extrabold">{NAMA_BULAN[m - 1]} {y}</b>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-muted"><i className="h-2.5 w-2.5 rounded-[3px] bg-brand" />Masuk</span>
            <b className="text-[16.5px] font-extrabold">{rp(p.masuk)}</b>
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-muted"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#F27A2E]" />Keluar</span>
            <b className="text-[16.5px] font-extrabold">{rp(p.keluar)}</b>
          </div>
        </div>
        <span className={`mt-2.5 inline-flex rounded-full px-3 py-1 text-[14px] font-extrabold ${selisih >= 0 ? 'bg-ok-soft text-ok-deep' : 'bg-danger-soft text-danger'}`}>
          {selisih >= 0 ? `Lebih ${rp(selisih)}` : `Kurang ${rp(-selisih)}`}
        </span>
      </div>
    </>
  )
}

const rpRingkasJt = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n))

function KartuPengaturan({ nav, adaMenu }) {
  const item = [
    adaMenu('profil-sekolah') && { id: 'profil-sekolah', emoji: 'sekolah', label: 'Profil sekolah', sub: 'Identitas, logo & rekening' },
    adaMenu('kode-aktivasi') && { id: 'kode-aktivasi', emoji: 'kode', label: 'Kode aktivasi TU', sub: 'Undang akun Admin/TU baru' },
    adaMenu('akun-staf') && { id: 'akun-staf', emoji: 'akunstaf', label: 'Akun staf', sub: 'Aktifkan / nonaktifkan TU' },
    adaMenu('atur-indikator') && { id: 'atur-indikator', emoji: 'indikator', label: 'Atur indikator', sub: 'Cara menilai kesehatan' },
  ].filter(Boolean)
  if (!item.length) return null
  return (
    <div className="card kartu-timbul min-w-0 lg:p-5">
      <h2 className="judul-kartu mb-1 text-[18px]">Pengaturan sekolah</h2>
      {item.map((m) => (
        <button key={m.id} type="button" onClick={() => nav(`/guru/${m.id}`)} className="row w-full items-center text-left">
          <EmojiMenu id={m.emoji} size={42} />
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-extrabold">{m.label}</b>
            <span className="block text-[13px] font-semibold text-muted">{m.sub}</span>
          </span>
          <Garis.kanan size={18} className="shrink-0 text-muted" />
        </button>
      ))}
    </div>
  )
}
