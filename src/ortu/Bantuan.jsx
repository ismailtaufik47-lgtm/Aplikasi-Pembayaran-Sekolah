import { AvatarStaf } from '../components/Avatar.jsx'
import { Ikon, IkonWhatsappPolos, KartuTema, KepalaHalaman } from '../components/ui.jsx'
import { waSekolah } from '../lib/format.js'
import { useData } from '../lib/store.jsx'

const TANYA = [
  [
    'Bagaimana cara membayar SPP?',
    'Transfer ke rekening sekolah atau bayar tunai ke petugas TU. Kalau ananda punya tabungan di sekolah, pembayaran juga bisa diambil dari tabungan — sampaikan saja ke petugas TU. Setelah dicatat, kuitansinya muncul di menu Riwayat.',
  ],
  [
    'Kenapa pembayaran saya belum tercatat?',
    'Pencatatan dilakukan petugas TU sekolah pada jam kerja. Kalau lebih dari satu hari kerja statusnya belum berubah, kirim bukti bayar ke TU lewat tombol WhatsApp di bawah.',
  ],
  [
    'Bisakah membayar beberapa bulan sekaligus?',
    'Bisa. Sampaikan saat membayar bulan apa saja yang dilunasi, nanti petugas sekolah mencatat bulan-bulan tersebut sekaligus.',
  ],
  [
    'Bagaimana kalau ada biaya yang terasa keliru?',
    'Buka rincian tagihan, catat nama biaya dan nominalnya, lalu konfirmasi ke TU sekolah. Perubahan hanya bisa dilakukan pihak sekolah.',
  ],
  [
    'Kenapa portal meminta NIS ananda?',
    'Supaya data ananda hanya bisa dilihat keluarga yang mengetahui NIS-nya, walaupun tautan portal sempat tersebar. NIS tertera di kuitansi pembayaran atau kartu siswa.',
  ],
]
const WARNA_TANYA = ['biru', 'kuning', 'tosca', 'pink', 'ungu']

/** Avatar ilustrasi guru dari sapaannya (Bu → berhijab, Pak → laki-laki). */
const avatarGuru = (nama = '') => {
  const n = nama.toLowerCase()
  return /^(bu|ibu|bunda|ustadzah)\b/.test(n) ? 0 : /^(pak|bapak|ustadz|ustad)\b/.test(n) ? 3 : 4
}

const IkonGembok = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <path d="M12 14.5v2.5" />
  </svg>
)

/**
 * Bantuan portal orang tua: tanya-jawab singkat, kontak sekolah, tombol
 * WhatsApp ke TU, kunci portal (lupakan NIS di HP ini), dan pilihan tema.
 */
export default function Bantuan({ aktif, kunciPortal }) {
  const { pengaturan, toast } = useData()
  const nomorWa = waSekolah(pengaturan)
  const teksWa = encodeURIComponent(
    `Assalamu'alaikum, saya orang tua ${aktif.nama} (Kelas ${aktif.kelas}). Saya ingin bertanya tentang pembayaran.`,
  )
  const isiTombolWa = (
    <>
      <IkonWhatsappPolos size={19} />
      Hubungi petugas TU lewat WhatsApp
    </>
  )

  return (
    <>
      <KepalaHalaman judul="Bantuan" sub="Pertanyaan yang sering ditanyakan orang tua" gambar="anak" className="lg:!mt-3" />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <section className="card !py-1.5" aria-label="Pertanyaan umum">
          {TANYA.map(([q, a], i) => (
            <details key={q} open={i === 0} className="group border-b-[1.5px] border-dashed border-line last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className={`permen permen-kecil permen-${WARNA_TANYA[i]} grid h-9 w-9 shrink-0 place-items-center rounded-[12px]`}>
                  <Ikon.tanya size={18} />
                </span>
                <b className="min-w-0 flex-1 text-[14px] font-extrabold leading-snug">{q}</b>
                <span className="grid h-7 w-7 shrink-0 place-items-center text-brand transition-transform group-open:rotate-45">
                  <Ikon.plus size={18} />
                </span>
              </summary>
              <p className="pb-3.5 pl-12 pr-2 text-[13px] font-semibold leading-relaxed text-[#34405C] dark:text-[#B8C3DC]">{a}</p>
            </details>
          ))}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:gap-5">
          <section className="card !pb-1.5">
            <h2 className="judul-kartu mb-0.5 text-[18px]">Kontak sekolah</h2>
            <div className="row items-center">
              <AvatarStaf nama={aktif.guru} avatar={avatarGuru(aktif.guru)} size={44} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-extrabold">{aktif.guru} — guru kelas {aktif.kelas}</b>
                <span className="block text-[12px] font-semibold text-muted">Konfirmasi pembayaran</span>
              </span>
            </div>
            <div className="row items-center">
              <span className="permen permen-kecil permen-tosca grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"><Ikon.rumah size={21} /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-extrabold">Kantor {pengaturan.namaSekolah}</b>
                <span className="block text-[12px] font-semibold text-muted">Senin–Jumat · 07.30–14.00</span>
              </span>
            </div>
          </section>

          {nomorWa ? (
            <a className="bigbtn-wa flex items-center justify-center gap-2" href={`https://wa.me/${nomorWa}?text=${teksWa}`} target="_blank" rel="noreferrer">
              {isiTombolWa}
            </a>
          ) : (
            <button className="bigbtn-wa flex items-center justify-center gap-2 opacity-60" onClick={() => toast('Nomor WhatsApp sekolah belum diisi. Silakan hubungi sekolah langsung.')}>
              {isiTombolWa}
            </button>
          )}

          {kunciPortal && (
            <section className="card">
              <div className="flex items-start gap-3">
                <span className="permen permen-kecil permen-ungu grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"><IkonGembok /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="judul-kartu text-[17px] leading-tight">Keamanan portal</h2>
                  <p className="mt-0.5 text-[12.5px] font-semibold leading-relaxed text-muted">
                    Memakai HP bersama atau HP pinjaman? Kunci portal supaya NIS ananda tidak tersimpan dan portal meminta NIS lagi.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={kunciPortal}
                className="tombol-putih mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[15px] text-[13.5px] font-extrabold text-[#1B2559] dark:text-ink"
              >
                <IkonGembok size={17} />
                Kunci portal di HP ini
              </button>
            </section>
          )}

          <KartuTema />
        </div>
      </div>
    </>
  )
}
