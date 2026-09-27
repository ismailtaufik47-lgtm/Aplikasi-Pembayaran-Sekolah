import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chevron, Ikon, Kosong } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { TombolLonceng, kalimatSpp } from './sheets.jsx'
import { FONT_EMOJI, emojiKegiatan } from '../lib/emojiKegiatan.js'
import {
  BULAN, bulanBerjalan, jarakKegiatan, kegiatanBelum, labelJatuhTempoPeriode, perluDitagihSekarang, rp,
  sppPerluSekarang, sppTertunggakRupiah, bulanTertunggak, statusSpp, tanggalKegiatan, teksJatuhTempo,
} from '../lib/format.js'

/**
 * Beranda portal orang tua.
 *
 * Urutan dari atas: sapaan + ilustrasi sekolah → kartu anak (tagihan yang
 * perlu dibayar, 4 menu cepat, status SPP bulan ini) → kegiatan terdekat →
 * ringkasan pembayaran → transaksi terbaru.
 */
export default function Beranda({ akar, anak, aktif, pilihAnak, bukaStruk, bukaCaraBayar, bukaPengumuman, bukaKegiatan }) {
  const { pengaturan, biaya, pembayaran, wali } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()
  const a = aktif
  const spp = pengaturan.sppNominal

  // Headline kartu sengaja BUKAN total 12 bulan — hanya tunggakan bulan
  // lalu, bulan ini kalau sudah lewat jatuh tempo, dan kegiatan terbuka.
  const sppPerlu = sppPerluSekarang(a, spp, pengaturan.tanggalJatuhTempo, kini)
  const kegPerlu = kegiatanBelum(a, biaya)
  const nKegBelum = biaya.filter((b, i) => (a.kegiatan[i] || 0) < b.nominal).length
  const perluSekarang = sppPerlu + kegPerlu
  const lunasSemua = perluSekarang <= 0
  // Judul kotak tagihan mengikuti isinya, supaya tidak bertentangan dengan
  // keterangan "SPP bulan ini sudah lunas" di bawahnya.
  const judulTagihan =
    sppPerlu > 0 && kegPerlu > 0 ? 'Tagihan yang perlu dibayar'
    : sppPerlu > 0 ? 'SPP yang perlu dibayar'
    : 'Biaya kegiatan yang belum dibayar'
  const rincianTagihan =
    sppPerlu > 0 && kegPerlu > 0 ? `SPP ${rp(sppPerlu)} · Kegiatan ${rp(kegPerlu)}`
    : sppPerlu > 0 ? 'Sudah lewat jatuh tempo'
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

  return (
    <>
      {/* ---------- langit + sapaan ---------- */}
      <div className="langit-portal relative -mx-[18px] px-[18px] pb-2 lg:mx-0 lg:mt-6 lg:rounded-[28px] lg:px-9 lg:pb-2">
        <header className="relative z-10 flex items-center gap-3 pt-3 lg:hidden">
          <LogoSekolah logo={pengaturan.logo} ukuran={46} />
          <div className="min-w-0 leading-tight">
            <div className="line-clamp-2 text-[15px] font-extrabold leading-tight">{pengaturan.namaSekolah}</div>
            <div className="text-[12px] font-semibold text-muted">Portal Orang Tua</div>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <TombolLonceng anak={a} buka={bukaPengumuman} className="!h-11 !w-11 !rounded-full" />
          </div>
        </header>

        <div className="relative mt-4 min-h-[150px] lg:mt-0 lg:flex lg:min-h-[190px] lg:items-center">
          <div className="relative z-10 max-w-[60%] lg:max-w-[560px] lg:pt-4">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight lg:text-[30px]">
              Assalamu'alaikum, {wali.nama} <span style={FONT_EMOJI}>👋</span>
            </h1>
            <p className="mt-2 max-w-[92%] text-[12.5px] leading-relaxed text-muted lg:max-w-none lg:text-[14.5px]">
              Selamat datang di Portal Orang Tua {pengaturan.namaSekolah}. Di sini Ayah/Bunda bisa memantau semua informasi
              pembayaran ananda dengan mudah dan aman.
            </p>
          </div>
          <IlustrasiSekolah className="absolute -right-3 bottom-0 w-[44%] max-w-[200px] lg:right-2 lg:w-[290px] lg:max-w-none" />
        </div>
      </div>

      {anak.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {anak.map((k) => (
            <button
              key={k.id}
              onClick={() => pilihAnak(k.id)}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border py-1.5 pl-2 pr-3 shadow-soft ${
                k.id === a.id ? 'border-brand bg-brand-soft' : 'border-line bg-kartu'
              }`}
            >
              <Avatar nama={k.nama} jenis={k.jenis} avatar={k.avatar} foto={k.foto} size={30} />
              <span className="text-left">
                <span className="block text-[13px] font-bold">{k.panggilan}</span>
                <span className="block text-[11px] font-semibold text-muted">Kelas {k.kelas}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div>
          {/* ---------- kartu anak ---------- */}
          <section className="mt-3 overflow-hidden rounded-[26px] bg-kartu shadow-soft lg:mt-0">
            <div className="kartu-anak-atas flex items-center gap-3.5 px-4 pb-3 pt-4 lg:px-5 lg:pt-5">
              <span className="rounded-full bg-kartu p-[3px] shadow-soft">
                <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={62} />
              </span>
              <div className="min-w-0">
                <div className="line-clamp-2 text-[18px] font-extrabold leading-tight lg:text-[20px]">{a.nama}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-muted">Kelas {a.kelas}</span>
                  <span className="rounded-pill bg-brand-soft px-2.5 py-0.5 text-[11.5px] font-bold text-brand">NIS {a.nis}</span>
                </div>
              </div>
            </div>

            <div className="px-3.5 pb-3.5 lg:px-5 lg:pb-5">
              {/* tagihan */}
              {lunasSemua ? (
                <div className="flex items-center gap-3 rounded-[20px] bg-ok-soft p-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ok text-white"><Ikon.cek size={24} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[18px] font-extrabold leading-tight text-ok-deep lg:text-[20px]">Semua tagihan lunas</div>
                    <p className="mt-0.5 text-[12px] font-semibold leading-snug text-ok-deep">
                      {iBerikut >= 0
                        ? `Berikutnya: SPP ${BULAN[iBerikut]} ${rp(spp - (a.spp[iBerikut] || 0))} · jatuh tempo ${labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, iBerikut)}`
                        : 'SPP satu tahun ajaran ini sudah lunas semua. Terima kasih 🎉'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-[20px] border border-line bg-kartu p-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><Ikon.dompet size={24} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold leading-snug text-muted">{judulTagihan}</div>
                    <div className="break-all text-[24px] font-extrabold leading-tight tracking-tight lg:text-[28px]">{rp(perluSekarang)}</div>
                    <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-muted">{rincianTagihan}</p>
                  </div>
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-[13.5px] font-extrabold text-white transition hover:bg-brand-deep active:bg-brand-deep sm:ml-auto sm:w-auto"
                    onClick={() => nav(akar + '/tagihan')}
                  >
                    <Ikon.nota size={18} />
                    Lihat rincian
                  </button>
                </div>
              )}

              {/* menu cepat */}
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:gap-3">
                <MenuCepat warna="hijau" ikon={<Ikon.dompet size={20} />} judul="Cara Bayar" sub="Rekening & tunai" onClick={bukaCaraBayar} />
                <MenuCepat warna="ungu" ikon={<Ikon.dokumen size={20} />} judul="Riwayat Pembayaran" pendek="Riwayat Bayar" sub="Semua transaksi" onClick={() => nav(akar + '/riwayat')} />
                <MenuCepat warna="biru" ikon={<Ikon.nota size={20} />} judul="Tagihan & Tunggakan" sub="Rincian per bulan" onClick={() => nav(akar + '/tagihan')} />
                <MenuCepat warna="oranye" ikon={<Ikon.kalender size={20} />} judul="Biaya Kegiatan" sub="Jadwal & info" onClick={() => nav(akar + '/kegiatan')} />
              </div>

              {/* status SPP — disembunyikan kalau semua lunas (kotak hijau di atas sudah menjelaskan) */}
              {!lunasSemua && <button
                className={`mt-3 flex w-full items-center gap-3 rounded-[18px] p-3 text-left ${adaPerlu ? 'bg-warn-soft' : 'bg-ok-soft'}`}
                onClick={() => nav(akar + '/tagihan')}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${adaPerlu ? 'bg-warn' : 'bg-ok'}`}>
                  {adaPerlu ? <Ikon.peringatan size={18} /> : <Ikon.cek size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] font-extrabold ${adaPerlu ? 'text-warn-deep' : 'text-ok-deep'}`}>
                    {adaPerlu ? 'Ada SPP yang perlu dibayar' : 'SPP bulan ini sudah lunas.'}
                  </span>
                  <span className={`block text-[12px] font-semibold leading-snug ${adaPerlu ? 'text-warn-deep' : 'text-ok-deep'} opacity-90`}>
                    {adaPerlu
                      ? teksSpp || `SPP ${BULAN[kini]} belum dibayar. Jatuh tempo setiap ${teksJatuhTempo(pengaturan.tanggalJatuhTempo)}.`
                      : 'Terima kasih atas ketepatannya, Ayah/Bunda!'}
                  </span>
                </span>
                <Chevron />
              </button>}
            </div>
          </section>

          {/* ---------- kegiatan terdekat ---------- */}
          {terdekat && (
            <>
              <div className="seghead">
                <h2>Kegiatan terdekat</h2>
                <button className="text-[13px] font-bold text-brand" onClick={() => nav(akar + '/kegiatan')}>Lihat semua</button>
              </div>
              <button className="card flex w-full items-center gap-3 text-left" onClick={() => bukaKegiatan(terdekat.b.id)}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-grape-soft text-[24px]" style={FONT_EMOJI}>
                  {emojiKegiatan(terdekat.b)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-extrabold">{terdekat.b.nama}</span>
                  <span className="block text-[12.5px] font-semibold text-muted">{tanggalKegiatan(terdekat.b)}</span>
                  {terdekat.b.waktu && <span className="block text-[12px] font-semibold text-muted">{terdekat.b.waktu}</span>}
                </span>
                <span className="shrink-0 rounded-pill bg-brand-soft px-2.5 py-1 text-[11px] font-extrabold text-brand">{terdekat.j.label}</span>
              </button>
            </>
          )}
        </div>

        <div>
          {/* ---------- ringkasan ---------- */}
          <div className="seghead lg:mt-0">
            <h2>Ringkasan Pembayaran</h2>
            <button className="text-[13px] font-bold text-brand" onClick={() => nav(akar + '/tagihan')}>Lihat semua</button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
            {bulanRingkas.map((i) => (
              <KotakRingkas
                key={i}
                warna="biru"
                ikon={<Ikon.kalender size={17} />}
                judul={<>SPP {BULAN[i]}<span className="block text-[11px] font-semibold text-muted">{i === kini ? 'Bulan ini' : i < kini ? 'Bulan lalu' : 'Bulan depan'}</span></>}
                onClick={() => nav(akar + '/tagihan')}
              >
                <StatusMini status={status(i)} />
              </KotakRingkas>
            ))}
            <KotakRingkas
              warna="oranye"
              ikon={<span className="text-[17px]" style={FONT_EMOJI}>🪙</span>}
              judul="Tunggakan"
              onClick={() => nav(akar + '/tagihan')}
            >
              <span className={`block text-[13.5px] font-extrabold leading-tight ${tunggakan > 0 ? 'text-danger' : 'text-ok-deep'}`}>{rp(tunggakan)}</span>
              <span className="block text-[10.5px] font-semibold text-muted">{nTunggak > 0 ? `${nTunggak} bulan` : 'Tidak ada'}</span>
            </KotakRingkas>
            <KotakRingkas warna="ungu" ikon={<Ikon.jam size={17} />} judul="Riwayat" onClick={() => nav(akar + '/riwayat')}>
              <span className="flex items-center gap-1 text-[12px] font-extrabold text-brand">Lihat semua <span aria-hidden>›</span></span>
            </KotakRingkas>
          </div>

          {/* ---------- transaksi terbaru ---------- */}
          <div className="seghead">
            <h2>Transaksi Terbaru</h2>
            <button className="text-[13px] font-bold text-brand" onClick={() => nav(akar + '/riwayat')}>Lihat semua</button>
          </div>
          <div className="card py-1.5">
            {riwayatAnak.length === 0 ? (
              <Kosong>Belum ada pembayaran tercatat.</Kosong>
            ) : (
              riwayatAnak.slice(0, 3).map((p) => (
                <button key={p.id} className="row w-full text-left" onClick={() => bukaStruk(p.id)}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok text-white"><Ikon.cek size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{judulTransaksi(p.ket)}</span>
                    <span className="block truncate text-[12px] text-muted">{tglPendek(p.tanggal)} · {p.metode}</span>
                  </span>
                  <span className="shrink-0 text-[14px] font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                  <Chevron />
                </button>
              ))
            )}
          </div>
          <p className="px-1 pt-4 text-center text-[11.5px] leading-relaxed text-muted">
            Status berubah setelah sekolah mencatat pembayaran, biasanya di hari yang sama.
          </p>
        </div>
      </div>
    </>
  )
}

const tglPendek = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/** "SPP bulanan — Agustus" → "SPP Agustus"; "Biaya kegiatan — Manasik haji" → "Manasik haji". */
const judulTransaksi = (ket = '') =>
  ket.startsWith('SPP bulanan — ') ? 'SPP ' + ket.slice(14)
  : ket.startsWith('Biaya kegiatan — ') ? ket.slice(17)
  : ket

/* ---------- potongan kecil ---------- */

const WARNA = {
  hijau: { latar: 'menu-hijau', ikon: 'bg-ok' },
  ungu: { latar: 'menu-ungu', ikon: 'bg-grape' },
  biru: { latar: 'menu-biru', ikon: 'bg-brand' },
  oranye: { latar: 'menu-oranye', ikon: 'bg-warn' },
}

function MenuCepat({ warna, ikon, judul, pendek, sub, onClick }) {
  const w = WARNA[warna]
  return (
    <button
      onClick={onClick}
      className={`${w.latar} flex items-center gap-2 rounded-[18px] p-2.5 text-left transition active:scale-[.97] sm:min-h-[122px] sm:flex-col sm:items-start sm:gap-0 sm:p-3 lg:p-3.5`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white ${w.ikon}`}>{ikon}</span>
      <span className="min-w-0 flex-1 sm:mt-2 sm:flex-none">
        <span className="block text-[13px] font-extrabold leading-tight lg:text-[14px]">
          {pendek ? <><span className="sm:hidden">{pendek}</span><span className="hidden sm:inline">{judul}</span></> : judul}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-muted lg:text-[12px]">{sub}</span>
      </span>
      <span className="hidden self-end pt-1 text-[16px] font-bold leading-none text-muted sm:mt-auto sm:block" aria-hidden>›</span>
    </button>
  )
}

function KotakRingkas({ warna, ikon, judul, children, onClick }) {
  const w = WARNA[warna]
  return (
    <button onClick={onClick} className="flex min-h-[118px] min-w-0 flex-col rounded-[18px] bg-kartu p-3 text-left shadow-soft active:scale-[.97] lg:p-3.5">
      <span className={`${w.latar} grid h-8 w-8 place-items-center rounded-[10px] ${warna === 'biru' ? 'text-brand' : warna === 'ungu' ? 'text-grape' : ''}`}>{ikon}</span>
      <span className="mt-2 block text-[12px] font-bold leading-tight lg:text-[12.5px]">{judul}</span>
      <span className="mt-auto block pt-2">{children}</span>
    </button>
  )
}

function StatusMini({ status }) {
  const s = {
    lunas: ['LUNAS', 'bg-ok-soft text-ok-deep', '✓'],
    sebagian: ['SEBAGIAN', 'bg-warn-soft text-warn-deep', '½'],
    nunggak: ['TERLAMBAT', 'bg-danger-soft text-danger', '!'],
    'belum-bayar': ['BELUM BAYAR', 'bg-warn-soft text-warn-deep', '!'],
    menunggu: ['BELUM JATUH TEMPO', 'bg-isi text-muted', '·'],
  }[status]
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-pill px-1.5 py-1 text-[9.5px] font-extrabold leading-none tracking-wide lg:text-[10.5px] ${s[1]}`}>
      <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-current">
        <span className="text-[8px] font-black leading-none" style={{ color: 'rgb(var(--kartu))' }}>{s[2]}</span>
      </span>
      <span className="truncate">{s[0]}</span>
    </span>
  )
}

/** Logo sekolah dari Profil sekolah; kalau belum diunggah, ikon sekolah. */
export function LogoSekolah({ logo, ukuran = 44 }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-soft"
      style={{ width: ukuran, height: ukuran, background: '#fff' }}
    >
      {logo
        ? <img src={logo} alt="Logo sekolah" className="h-[78%] w-[78%] object-contain" />
        : <span style={{ ...FONT_EMOJI, fontSize: ukuran * 0.5 }}>🏫</span>}
    </span>
  )
}

/** Avatar orang tua di pojok kanan atas — membuka halaman Bantuan. */
export function TombolWali({ wali, onClick, className = '' }) {
  const n = (wali?.nama || '').toLowerCase()
  const e = /^(bapak|pak|ayah|abi|bpk)\b/.test(n) ? '👨' : /^(ibu|bu|bunda|umi|ummi|mama)\b/.test(n) ? '👩' : '🙂'
  return (
    <button
      onClick={onClick}
      aria-label="Akun & bantuan"
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-[22px] shadow-soft ring-2 ring-white ${className}`}
      style={FONT_EMOJI}
    >
      {e}
    </button>
  )
}

/**
 * Ilustrasi gedung TK dengan pepohonan — SVG buatan sendiri (tanpa
 * gambar dari internet), jadi tetap tajam di semua ukuran layar dan
 * ringan dimuat. Warnanya sedikit diredupkan di mode gelap (index.css).
 */
export function IlustrasiSekolah({ className = '' }) {
  return (
    <svg className={`ilustrasi-sekolah pointer-events-none select-none ${className}`} viewBox="0 0 240 170" aria-hidden="true">
      {/* awan */}
      <g className="awan" fill="#fff">
        <ellipse cx="46" cy="34" rx="20" ry="8" />
        <ellipse cx="58" cy="28" rx="13" ry="10" />
        <ellipse cx="190" cy="22" rx="16" ry="6.5" />
        <ellipse cx="200" cy="17" rx="10" ry="8" />
      </g>
      {/* tanah (elips — ujungnya membulat, tidak terpotong kotak) */}
      <ellipse cx="120" cy="150" rx="118" ry="17" fill="#CDEBB5" />
      <ellipse cx="124" cy="156" rx="100" ry="12" fill="#B3E09A" />
      {/* pohon belakang */}
      <rect x="27" y="112" width="6" height="32" rx="2" fill="#9A6B45" />
      <circle cx="30" cy="100" r="20" fill="#67BF6B" />
      <circle cx="18" cy="112" r="13" fill="#5AB25E" />
      <circle cx="42" cy="110" r="13" fill="#78CB7B" />
      <rect x="207" y="108" width="6" height="36" rx="2" fill="#9A6B45" />
      <circle cx="210" cy="95" r="21" fill="#67BF6B" />
      <circle cx="223" cy="108" r="13" fill="#5AB25E" />
      <circle cx="197" cy="106" r="12" fill="#78CB7B" />
      {/* gedung sayap */}
      <rect x="58" y="92" width="124" height="54" rx="3" fill="#FFF3DE" />
      <path d="M50 95 L120 66 L190 95 Z" fill="#F2825A" />
      <rect x="50" y="93" width="140" height="5" rx="2" fill="#E0663F" />
      {/* jendela sayap */}
      {[66, 84, 146, 164].map((x) => (
        <g key={x}>
          <rect x={x} y="106" width="12" height="14" rx="2" fill="#7CC4F0" stroke="#fff" strokeWidth="2" />
          <path d={`M${x + 6} 106 v14 M${x} 113 h12`} stroke="#fff" strokeWidth="1.2" />
        </g>
      ))}
      {/* menara tengah */}
      <rect x="102" y="58" width="36" height="88" rx="2" fill="#FFE7C0" />
      <path d="M96 61 L120 38 L144 61 Z" fill="#E8683F" />
      <circle cx="120" cy="74" r="8" fill="#fff" stroke="#E8683F" strokeWidth="2.2" />
      <path d="M120 70 v4.5 l3 2" stroke="#E8683F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* bendera */}
      <line x1="120" y1="38" x2="120" y2="14" stroke="#8D95A5" strokeWidth="1.6" />
      <rect x="120" y="14" width="15" height="5" fill="#E53935" />
      <rect x="120" y="19" width="15" height="5" fill="#fff" stroke="#E6E6E6" strokeWidth=".5" />
      {/* pintu */}
      <path d="M110 146 V122 a10 10 0 0 1 20 0 V146 Z" fill="#4C8FDB" />
      <path d="M120 112 V146" stroke="#3A77BF" strokeWidth="1.4" />
      <rect x="104" y="144" width="32" height="4" rx="1.5" fill="#E9D6B8" />
      {/* semak */}
      <circle cx="66" cy="146" r="8" fill="#6FC572" />
      <circle cx="78" cy="148" r="7" fill="#5AB25E" />
      <circle cx="162" cy="148" r="7" fill="#5AB25E" />
      <circle cx="174" cy="146" r="8" fill="#6FC572" />
      {/* jalan */}
      <path d="M112 148 L128 148 L136 166 Q120 169 104 166 Z" fill="#F1E3C8" />
    </svg>
  )
}