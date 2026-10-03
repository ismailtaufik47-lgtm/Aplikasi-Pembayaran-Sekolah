import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { AdeganSekolah, Chip, Ikon, Kosong, LangitKepala } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { Pelangi } from '../components/IlustrasiMasuk.jsx'
import { useData } from '../lib/store.jsx'
import { kalimatSpp } from './sheets.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { EMOJI_JENIS, LABEL_JENIS, dibayarPaket, kurangSekarangPaket, paketSiswa } from '../lib/paket.js'
import {
  BULAN, bulanBerjalan, jarakKegiatan, kegiatanBelum, labelJatuhTempoPeriode, perluDitagihSekarang, rp,
  sppPerluSekarang, sppTertunggakRupiah, bulanTertunggak, statusSpp, tanggalKegiatan, teksJatuhTempo,
} from '../lib/format.js'

/**
 * Beranda portal orang tua (desain "ceria").
 *
 * Urutan dari atas: sapaan + gedung TK & dua anak → pilih anak → kartu anak
 * (tagihan yang perlu dibayar + tombol rincian/cara bayar) → 4 menu cepat →
 * peringatan SPP → kegiatan terdekat → ringkasan pembayaran → transaksi
 * terbaru. Di layar lebar: kiri (kartu anak, menu, peringatan, kegiatan),
 * kanan (ringkasan, transaksi).
 */
export default function Beranda({ akar, anak, aktif, pilihAnak, bukaStruk, bukaCaraBayar, bukaKegiatan }) {
  const { pengaturan, biaya, paket, pembayaran, wali } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()
  const a = aktif
  const spp = pengaturan.sppNominal

  // Headline kartu sengaja BUKAN total 12 bulan — hanya tunggakan bulan
  // lalu, bulan ini kalau sudah lewat jatuh tempo, dan kegiatan terbuka.
  const sppPerlu = sppPerluSekarang(a, spp, pengaturan.tanggalJatuhTempo, kini)
  const kegPerlu = kegiatanBelum(a, biaya)
  const nKegBelum = biaya.filter((b, i) => (a.kegiatan[i] || 0) < b.nominal).length
  // PMB / daftar ulang: hanya tahap yang sudah jatuh tempo (tanpa jadwal → seluruh sisanya)
  const paketPerlu = paketSiswa(paket, a.id).map((p) => ({ p, n: kurangSekarangPaket(p, dibayarPaket(a, p.id)) })).filter((x) => x.n > 0)
  const pkPerlu = paketPerlu.reduce((t, x) => t + x.n, 0)
  const perluSekarang = sppPerlu + kegPerlu + pkPerlu
  const lunasSemua = perluSekarang <= 0
  const bagian = [
    sppPerlu > 0 && `SPP ${rp(sppPerlu)}`,
    kegPerlu > 0 && `Kegiatan ${rp(kegPerlu)}`,
    ...paketPerlu.map((x) => `${LABEL_JENIS[x.p.jenis]} ${rp(x.n)}`),
  ].filter(Boolean)
  const judulTagihan =
    bagian.length > 1 ? 'Tagihan yang perlu dibayar'
    : sppPerlu > 0 ? 'SPP yang perlu dibayar'
    : pkPerlu > 0 ? `${LABEL_JENIS[paketPerlu[0].p.jenis]} yang perlu dibayar`
    : 'Biaya kegiatan yang belum dibayar'
  const rincianTagihan =
    bagian.length > 1 ? bagian.join(' · ')
    : sppPerlu > 0 ? 'Sudah lewat jatuh tempo'
    : pkPerlu > 0 ? `Cicilan ${paketPerlu[0].p.nama} yang sudah jatuh tempo`
    : `${nKegBelum} kegiatan belum lunas`
  const teksSpp = kalimatSpp(a, pengaturan, kini)
  const adaPerlu = !!teksSpp || perluDitagihSekarang(a, spp, pengaturan.tanggalJatuhTempo, kini)
  const iBerikut = a.spp.findIndex((v, i) => i >= kini && (v || 0) < spp)
  const riwayatAnak = pembayaran.filter((p) => p.siswaId === a.id)

  // Kegiatan terdekat yang belum lewat (punya tanggal).
  const terdekat = biaya
    .map((b, i) => ({ b, i, j: jarakKegiatan(b) }))
    .filter((x) => x.j && !x.j.selesai)
    .sort((x, y) => x.j.selisih - y.j.selisih)[0]

  const status = (i) => statusSpp(a.spp[i] || 0, spp, i, kini, pengaturan.tanggalJatuhTempo)
  const bulanRingkas = kini > 0 ? [kini - 1, kini] : [0, 1]
  const tunggakan = sppTertunggakRupiah(a, spp, kini)
  const nTunggak = bulanTertunggak(a, spp, kini)

  const kartuAnak = (
    <section className="kartu-anak-portal relative overflow-hidden rounded-[26px] p-[18px] text-white lg:p-5">
      <Pelangi className="pointer-events-none absolute -top-3 right-[-30px] w-[170px] opacity-30 lg:right-[18%] lg:w-[190px]" />
      <div className="relative flex items-center gap-3.5">
        <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={60} className="ring-4 ring-white/90" />
        <span className="min-w-0">
          <b className="line-clamp-2 block font-display text-[21px] font-semibold leading-[1.15]">{a.nama}</b>
          <span className="mt-0.5 block text-[12.5px] font-bold opacity-95">Kelas {a.kelas} · NIS {a.nis}</span>
        </span>
      </div>
      <div className="relative mt-3.5 rounded-[18px] bg-kartu px-3.5 py-3 text-ink">
        {lunasSemua ? (
          <div className="flex items-center gap-3">
            <span className="permen permen-tosca grid h-12 w-12 shrink-0 place-items-center rounded-[15px]"><Ikon.cek size={24} /></span>
            <span className="min-w-0">
              <b className="judul-halaman block font-display text-[21px] font-bold leading-tight">Semua tagihan lunas</b>
              <span className="block text-[12px] font-bold leading-snug text-muted">
                {iBerikut >= 0
                  ? `Berikutnya: SPP ${BULAN[iBerikut]} ${rp(spp - (a.spp[iBerikut] || 0))} · jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, iBerikut)}`
                  : 'SPP satu tahun ajaran ini sudah lunas semua. Terima kasih!'}
              </span>
            </span>
          </div>
        ) : (
          <>
            <span className="text-[12px] font-bold text-muted">{judulTagihan}</span>
            <b className="judul-halaman block break-all font-display text-[28px] font-bold leading-tight tracking-[-.3px] lg:text-[30px]">{rp(perluSekarang)}</b>
            <span className="text-[12px] font-bold text-muted">{rincianTagihan}</span>
          </>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => nav(akar + '/tagihan')} className="flex h-[42px] items-center justify-center gap-1.5 rounded-[14px] bg-brand text-[13px] font-extrabold text-white active:translate-y-px">
            <Ikon.nota size={17} />
            Lihat rincian
          </button>
          <button onClick={bukaCaraBayar} className="flex h-[42px] items-center justify-center gap-1.5 rounded-[14px] bg-ok text-[13px] font-extrabold text-white active:translate-y-px">
            <IkonBank size={17} />
            Cara bayar
          </button>
        </div>
      </div>
    </section>
  )

  const menuCepat = (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <MenuCepat warna="tosca" ikon={<IkonBank size={20} />} judul="Cara bayar" sub="Rekening & tunai" onClick={bukaCaraBayar} />
      <MenuCepat warna="ungu" ikon={<IkonRiwayat size={20} />} judul="Riwayat bayar" sub="Semua transaksi" onClick={() => nav(akar + '/riwayat')} />
      <MenuCepat warna="biru" ikon={<Ikon.nota size={20} />} judul="Tagihan" sub="Rincian per bulan" onClick={() => nav(akar + '/tagihan')} />
      <MenuCepat warna="kuning" ikon={<Ikon.kalender size={20} />} judul="Kegiatan" sub="Jadwal & info" onClick={() => nav(akar + '/kegiatan')} />
    </div>
  )

  const peringatan = !lunasSemua && (
    <button
      onClick={() => nav(akar + '/tagihan')}
      className={`flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left ${adaPerlu ? 'spanduk-kuning' : 'kotak-lunas'}`}
    >
      <span className={`permen permen-kecil grid h-10 w-10 shrink-0 place-items-center rounded-[13px] ${adaPerlu ? 'permen-kuning' : 'permen-tosca'}`}>
        {adaPerlu ? <Ikon.peringatan size={20} /> : <Ikon.cek size={20} />}
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug">
        <b className="block text-[13.5px] font-extrabold">{adaPerlu ? 'Ada SPP yang perlu dibayar' : 'SPP bulan ini sudah lunas'}</b>
        {adaPerlu
          ? teksSpp || `SPP ${BULAN[kini]} belum dibayar. Jatuh tempo setiap ${teksJatuhTempo(pengaturan.tanggalJatuhTempo)}.`
          : 'Terima kasih atas ketepatannya, Ayah/Bunda!'}
      </span>
      <Ikon.kembali size={16} className="shrink-0 rotate-180 opacity-70" />
    </button>
  )

  // Cicilan PMB / daftar ulang yang terlambat → spanduk sendiri (bukan tergabung ke SPP)
  const telatPaket = paketPerlu.filter((x) => paketSiswa(paket, a.id).includes(x.p) && x.p.tahap.length > 0)
  const peringatanPaket = telatPaket.length > 0 && (
    <button onClick={() => nav(akar + '/tagihan?tab=pmb')} className="spanduk-kuning flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left">
      <GambarKegiatan emoji={EMOJI_JENIS[telatPaket[0].p.jenis]} size={40} className="rounded-[13px]" />
      <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug">
        <b className="block text-[13.5px] font-extrabold">Cicilan {telatPaket[0].p.nama} sudah jatuh tempo</b>
        Kurang {rp(telatPaket.reduce((t, x) => t + x.n, 0))}. Ketuk untuk melihat jadwal & rinciannya.
      </span>
      <Ikon.kembali size={16} className="shrink-0 rotate-180 opacity-70" />
    </button>
  )

  const kegiatanDekat = terdekat && (
    <div className="card">
      <KepalaKartu judul="Kegiatan terdekat" tautan="Semua" onTautan={() => nav(akar + '/kegiatan')} />
      <button className="flex w-full items-center gap-3 text-left" onClick={() => bukaKegiatan(terdekat.b.id)}>
        <GambarKegiatan emoji={emojiKegiatan(terdekat.b)} size={52} className="rounded-[16px]" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] font-extrabold">{terdekat.b.nama}</b>
          <span className="block text-[12px] font-semibold text-muted">
            {tanggalKegiatan(terdekat.b)}{terdekat.b.waktu ? ` · ${terdekat.b.waktu}` : ''}
          </span>
          {terdekat.b.lokasi && <span className="block truncate text-[12px] font-semibold text-muted">{terdekat.b.lokasi}</span>}
        </span>
        <Chip warna="blue">{terdekat.j.label}</Chip>
      </button>
    </div>
  )

  const ringkasan = (
    <div>
      <h2 className="judul-kartu mb-2.5 px-0.5 text-[19px]">Ringkasan pembayaran</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {bulanRingkas.map((i, n) => (
          <KotakRingkas
            key={i}
            warna={n === 0 ? 'pink' : 'kuning'}
            ikon={<Ikon.kalender size={17} />}
            judul={`SPP ${BULAN[i]}`}
            sub={i === kini ? 'Bulan ini' : i < kini ? 'Bulan lalu' : 'Bulan depan'}
            onClick={() => nav(akar + '/tagihan')}
          >
            <StatusMini status={status(i)} />
          </KotakRingkas>
        ))}
        <KotakRingkas warna="ungu" ikon={<Ikon.dompet size={17} />} judul="Tunggakan" sub={nTunggak > 0 ? `${nTunggak} bulan` : 'Tidak ada'} onClick={() => nav(akar + '/tagihan')}>
          <b className={`text-[14px] font-extrabold ${tunggakan > 0 ? 'text-danger' : 'text-ok-deep'}`}>{rp(tunggakan)}</b>
        </KotakRingkas>
        <KotakRingkas warna="tosca" ikon={<IkonRiwayat size={17} />} judul="Riwayat" sub={`${riwayatAnak.length} transaksi`} onClick={() => nav(akar + '/riwayat')}>
          <span className="text-[12px] font-extrabold text-brand">Lihat semua →</span>
        </KotakRingkas>
      </div>
    </div>
  )

  const transaksi = (
    <div className="card">
      <KepalaKartu judul="Transaksi terbaru" tautan={riwayatAnak.length ? 'Semua' : null} onTautan={() => nav(akar + '/riwayat')} />
      {riwayatAnak.length === 0 ? (
        <Kosong>Belum ada pembayaran tercatat.</Kosong>
      ) : (
        <div className="-mt-1">
          {riwayatAnak.slice(0, 3).map((p) => <BarisTransaksi key={p.id} p={p} buka={() => bukaStruk(p.id)} />)}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* ---------- sapaan + gedung TK ---------- */}
      <div className="relative mb-1 mt-1 min-h-[176px] lg:hidden">
        <AdeganSekolah className="absolute -right-[14px] bottom-0 h-[156px] w-[176px]" />
        <div className="relative z-[1] max-w-[52%] pt-1">
          <h1 className="judul-halaman font-display text-[26px] font-bold leading-[1.12] tracking-[-.3px]">Assalamu'alaikum, {wali.nama}!</h1>
          <p className="sub-halaman mt-2 text-[12.5px] font-bold leading-snug">Pantau tagihan & kegiatan ananda dengan mudah.</p>
        </div>
      </div>
      <div className="hero-beranda relative mb-6 hidden min-h-[210px] overflow-hidden rounded-[28px] lg:flex">
        <div className="relative z-[1] min-w-0 flex-1 px-9 py-8">
          <h1 className="judul-halaman font-display text-[36px] font-bold leading-[1.1] tracking-[-.4px] xl:text-[38px]">Assalamu'alaikum, {wali.nama}!</h1>
          <p className="sub-halaman mt-2 max-w-[540px] text-[15px] font-bold leading-relaxed">
            Selamat datang di Portal Orang Tua {pengaturan.namaSekolah}. Pantau tagihan, pembayaran, dan kegiatan ananda dengan mudah.
          </p>
          {anak.length > 1 && <PilihAnak anak={anak} aktif={a} pilih={pilihAnak} className="mt-4" />}
        </div>
        <AdeganSekolah besar className="relative mr-8 hidden h-[210px] w-[360px] shrink-0 self-end xl:block" />
      </div>

      {anak.length > 1 && <PilihAnak anak={anak} aktif={a} pilih={pilihAnak} className="mb-3.5 lg:hidden" />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5 lg:gap-[18px]">
          {kartuAnak}
          {menuCepat}
          {peringatanPaket}
          {peringatan}
          {kegiatanDekat}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5 lg:gap-[18px]">
          {ringkasan}
          {transaksi}
        </div>
      </div>
      <p className="sub-halaman px-2 pb-1 pt-4 text-center text-[11.5px] font-bold leading-relaxed">
        Status berubah setelah sekolah mencatat pembayaran — biasanya di hari yang sama.
      </p>
    </>
  )
}

/* ---------- potongan kecil (dipakai juga halaman Riwayat) ---------- */

export const IkonBank = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
  </svg>
)
export const IkonRiwayat = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5V9h4.5" /><path d="M12 8v4.5l3 2" />
  </svg>
)

export const tglPendek = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/** "SPP bulanan — Agustus" → "SPP Agustus"; "Biaya kegiatan — Manasik haji" → "Manasik haji". */
export const judulTransaksi = (ket = '') =>
  ket.startsWith('SPP bulanan — ') ? 'SPP ' + ket.slice(14)
  : ket.startsWith('Biaya kegiatan — ') ? ket.slice(17)
  : ket

/** Satu baris transaksi: gambar kegiatan / ubin kalender SPP, nominal + "Kuitansi". */
export function BarisTransaksi({ p, buka }) {
  const { biaya, paket } = useData()
  const b = p.jenis === 'kegiatan' ? biaya[p.indeks] : null
  const pk = p.jenis === 'paket' ? paket.find((x) => x.id === p.paketId) : null
  const emojiPk = pk ? EMOJI_JENIS[pk.jenis] : p.jenis === 'paket' ? (String(p.ket).startsWith('Daftar ulang') ? '📚' : '📝') : null
  return (
    <button className="row w-full text-left" onClick={buka}>
      {emojiPk ? (
        <GambarKegiatan emoji={emojiPk} size={42} className="rounded-[13px]" />
      ) : b ? (
        <GambarKegiatan emoji={emojiKegiatan(b)} size={42} className="rounded-[13px]" />
      ) : (
        <span className="permen permen-kecil permen-biru grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px]"><Ikon.kalender size={19} /></span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-extrabold">{judulTransaksi(p.ket)}</b>
        <span className="block truncate text-[12px] font-semibold text-muted">{tglPendek(p.tanggal)} · {p.metode}</span>
      </span>
      <span className="shrink-0 text-right">
        <b className="block text-[14px] font-extrabold text-ok-deep">{rp(p.nominal)}</b>
        <span className="text-[12px] font-extrabold text-brand">Kuitansi</span>
      </span>
    </button>
  )
}

export const KepalaKartu = ({ judul, sub, tautan, onTautan }) => (
  <div className="mb-2.5 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="judul-kartu text-[18px] leading-tight">{judul}</h2>
      {sub && <p className="mt-0.5 text-[12px] font-semibold text-muted">{sub}</p>}
    </div>
    {tautan && (
      <button type="button" onClick={onTautan} className="flex shrink-0 items-center gap-0.5 pt-0.5 text-[13px] font-extrabold text-brand">
        {tautan}
        <Ikon.kembali size={15} className="rotate-180" />
      </button>
    )}
  </div>
)

/** Pilih anak (kalau satu wali punya lebih dari satu anak). */
export function PilihAnak({ anak, aktif, pilih, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {anak.map((k) => {
        const on = k.id === aktif.id
        return (
          <button
            key={k.id}
            onClick={() => pilih(k.id)}
            aria-pressed={on}
            className={`flex shrink-0 items-center gap-2 rounded-pill py-[5px] pl-[5px] pr-3.5 text-left ${
              on ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu dark:border-line'
            }`}
          >
            <Avatar nama={k.nama} jenis={k.jenis} avatar={k.avatar} foto={k.foto} size={32} />
            <span>
              <b className="block text-[13px] font-extrabold leading-tight">{k.panggilan}</b>
              <span className="block text-[11px] font-bold opacity-80">Kelas {k.kelas}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MenuCepat({ warna, ikon, judul, sub, onClick }) {
  return (
    <button onClick={onClick} className="card flex min-w-0 items-center gap-2.5 !rounded-[20px] !p-3 text-left transition active:scale-[.97]">
      <span className={`permen permen-kecil permen-${warna} grid h-10 w-10 shrink-0 place-items-center rounded-[13px]`}>{ikon}</span>
      <span className="min-w-0">
        <b className="block truncate text-[13.5px] font-extrabold">{judul}</b>
        <span className="block truncate text-[11px] font-semibold text-muted">{sub}</span>
      </span>
    </button>
  )
}

function KotakRingkas({ warna, ikon, judul, sub, children, onClick }) {
  return (
    <button onClick={onClick} className="card flex min-h-[132px] min-w-0 flex-col items-start gap-2 !rounded-[18px] !p-3 text-left active:scale-[.97]">
      <span className={`permen permen-kecil permen-${warna} grid h-[34px] w-[34px] place-items-center rounded-[11px]`}>{ikon}</span>
      <span className="min-w-0">
        <b className="block text-[13px] font-extrabold leading-tight">{judul}</b>
        <span className="block text-[11.5px] font-semibold text-muted">{sub}</span>
      </span>
      <span className="mt-auto">{children}</span>
    </button>
  )
}

function StatusMini({ status }) {
  const s = {
    lunas: ['Lunas', 'green'],
    sebagian: ['Sebagian', 'amber'],
    nunggak: ['Terlambat', 'red'],
    'belum-bayar': ['Belum bayar', 'amber'],
    menunggu: ['Belum jatuh tempo', 'grey'],
  }[status]
  return <Chip warna={s[1]}>{s[0]}</Chip>
}

/** Kepala halaman portal: avatar anak + judul besar + keterangan, pelangi di pojok. */
export function JudulAnak({ anak, judul, sub }) {
  return (
    <header className="relative mb-4 mt-1 lg:mb-6 lg:mt-3">
      <LangitKepala />
      <div className="relative z-[1] flex items-center gap-3 lg:gap-4">
        <Avatar nama={anak.nama} jenis={anak.jenis} avatar={anak.avatar} foto={anak.foto} size={48} className="ring-[3px] ring-white lg:!h-[60px] lg:!w-[60px]" />
        <div className="min-w-0">
          <h1 className="judul-halaman font-display text-[25px] font-bold leading-[1.1] tracking-[-.3px] lg:text-[32px]">{judul}</h1>
          {sub && <p className="sub-halaman mt-0.5 text-[12.5px] font-bold leading-snug lg:text-[14px]">{sub}</p>}
        </div>
      </div>
    </header>
  )
}

