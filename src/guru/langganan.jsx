/**
 * Halaman Langganan.
 *
 * Dua peran:
 *  1. Halaman biasa (dari menu) — menampilkan status, sisa hari, kalkulator
 *     tagihan per siswa, dan cara berlangganan lewat WhatsApp (konfirmasi
 *     manual).
 *  2. Layar terkunci (prop `terkunci`) — dipakai GuruApp saat masa aktif
 *     habis. Isinya sama, tapi tampil penuh dengan pesan bahwa fitur
 *     dikunci sampai langganan diperpanjang, plus tombol keluar.
 *
 * Harga dihitung PER SISWA AKTIF per bulan (bukan paket flat), memakai
 * tarif default aplikasi atau tarif khusus sekolah (diatur admin).
 * Pembayaran TIDAK otomatis: sekolah menekan tombol WhatsApp, transfer,
 * lalu pengembang mengaktifkan langganannya secara manual.
 */
import { useEffect, useState } from 'react'
import { PageHead, Ikon } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import * as api from '../lib/api.js'
import {
  hitungLangganan,
  tagihanPerBulan,
  jumlahSiswaAktif,
  tarifPerSiswa,
  pesanWaLangganan,
  tanggalPanjangLokal,
  REKENING_BANK,
  TENGGANG_PORTAL_HARI,
  TRIAL_HARI,
} from '../lib/langganan.js'

const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

export default function Langganan({ terkunci = false }) {
  const { pengaturan, siswa } = useData()
  const { keluar } = useAuth()
  const l = hitungLangganan(pengaturan)

  // Identitas penerbit (rekening, WA, TTD) diatur di panel admin aplikasi.
  // Kalau belum diisi, halaman memakai konstanta di lib/langganan.js.
  const [penerbit, setPenerbit] = useState(null)
  useEffect(() => {
    api.dataPenerbit().then(setPenerbit).catch(() => {})
  }, [])

  const isi = (
    <>
      <KartuStatus l={l} pengaturan={pengaturan} terkunci={terkunci} />
      <PembayaranLangganan pengaturan={pengaturan} siswa={siswa} penerbit={penerbit} />
      <DokumenSewa pengaturan={pengaturan} siswa={siswa} penerbit={penerbit} l={l} />
      <CatatanPortal />

      {terkunci && (
        <button
          onClick={keluar}
          className="mx-auto mt-6 block rounded-2xl px-5 py-2.5 text-[13px] font-extrabold text-danger"
        >
          Keluar dari akun
        </button>
      )}
    </>
  )

  // Layar terkunci: penuh, tanpa nav — dipasang langsung oleh GuruApp.
  if (terkunci) {
    return (
      <div className="min-h-dvh overflow-y-auto bg-canvas px-[18px] pb-16 pt-8">
        <div className="mx-auto w-full max-w-[560px]">
          <div className="mb-5 text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-white text-3xl shadow-soft">
              🔒
            </span>
            <h1 className="text-[22px] font-extrabold tracking-tight">Langganan berakhir</h1>
            <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">
              Data Anda tetap aman. Perpanjang langganan untuk membuka kembali
              semua fitur pencatatan.
            </p>
          </div>
          {isi}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-lg shadow-soft">💳</span>
        <h2 className="text-[17px] font-extrabold">Langganan</h2>
      </div>
      <PageHead judul="Langganan" sub="Status masa aktif aplikasi & cara berlangganan" />
      <div className="mx-auto mt-2 w-full max-w-[620px] lg:mt-4">{isi}</div>
    </>
  )
}

/* ---------- kartu status utama ---------- */
function KartuStatus({ l, pengaturan, terkunci }) {
  const meta = {
    trial: {
      label: 'Masa uji coba',
      warna: 'from-brand to-brand-deep',
      chip: 'Uji coba',
      ikon: <Ikon.jam size={20} />,
    },
    aktif: {
      label: 'Langganan aktif',
      warna: 'from-ok to-ok-deep',
      chip: 'Aktif',
      ikon: <Ikon.cek size={20} />,
    },
    kadaluarsa: {
      label: 'Langganan berakhir',
      warna: 'from-danger to-rose',
      chip: 'Nonaktif',
      ikon: <Ikon.peringatan size={20} />,
    },
  }[l.status]

  const sisa = l.sisaHari
  const angka = l.nonaktifAdmin
    ? 'Nonaktif'
    : l.status === 'kadaluarsa'
      ? `${Math.abs(sisa)} hari lalu`
      : sisa === 0
        ? 'Hari ini'
        : `${sisa} hari lagi`
  if (l.nonaktifAdmin) meta.label = 'Dinonaktifkan admin'

  return (
    <div className={`mb-4 rounded-card bg-gradient-to-br ${meta.warna} p-5 text-white shadow-hero`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13.5px] font-bold opacity-95">
          {meta.ikon}
          {meta.label}
        </span>
        <span className="rounded-pill bg-white/20 px-3 py-1 text-[11px] font-extrabold">{meta.chip}</span>
      </div>

      <div className="mt-4">
        <div className="text-[30px] font-extrabold leading-none">{angka}</div>
        <div className="mt-1.5 text-[12.5px] font-semibold opacity-90">
          {l.status === 'trial' &&
            `Uji coba ${TRIAL_HARI} hari berakhir ${tanggalPanjangLokal(l.trialSampai)}`}
          {l.status === 'aktif' && `Aktif sampai ${tanggalPanjangLokal(l.aktifSampai)}`}
          {l.status === 'kadaluarsa' &&
            (l.nonaktifAdmin
              ? 'Dinonaktifkan sementara oleh admin aplikasi — hubungi admin untuk info lebih lanjut.'
              : `Berakhir ${tanggalPanjangLokal(l.aktifSampai)}`)}
        </div>
      </div>

      {!terkunci && l.status !== 'kadaluarsa' && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-[11.5px] font-semibold">
          <Ikon.info size={15} />
          <span>
            Portal orang tua tetap bisa diakses sampai {TENGGANG_PORTAL_HARI} hari setelah masa aktif habis.
          </span>
        </div>
      )}
    </div>
  )
}

/* ---------- pembayaran: rincian tagihan + rekening bank + konfirmasi WA ---------- */
function PembayaranLangganan({ pengaturan, siswa, penerbit }) {
  const rekening = penerbit?.rekening?.filter((r) => r.nomor)?.length ? penerbit.rekening.filter((r) => r.nomor) : REKENING_BANK
  const n = jumlahSiswaAktif(siswa)
  const tarif = tarifPerSiswa(pengaturan)
  const total = tagihanPerBulan(pengaturan, siswa)

  return (
    <div className="mb-4">
      <h3 className="mb-2.5 ml-0.5 text-[15px] font-extrabold">Sewa aplikasi</h3>

      {/* rincian tagihan */}
      <div className="mb-3 rounded-card bg-gradient-to-br from-ok to-ok-deep p-5 text-white shadow-hero">
        <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-90">Rincian tagihan</span>
        <div className="mt-3 flex items-center justify-between text-[13.5px] font-semibold">
          <span className="opacity-90">Siswa aktif</span>
          <span className="font-extrabold">{n} siswa</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[13.5px] font-semibold">
          <span className="opacity-90">Tarif per siswa</span>
          <span className="font-extrabold">{rp(tarif)} / bln</span>
        </div>
        <div className="my-3 border-t border-white/25" />
        <div className="flex items-end justify-between">
          <span className="text-[13.5px] font-bold opacity-90">Total / bulan</span>
          <b className="text-[24px] font-extrabold leading-none">{rp(total)}</b>
        </div>
      </div>

      {/* rekening bank */}
      <h4 className="mb-2 ml-0.5 flex items-center gap-1.5 text-[13.5px] font-extrabold text-ink">
        <span aria-hidden="true">🏦</span>
        Transfer Bank
      </h4>
      <div className="mb-3 grid gap-2.5">
        {rekening.map((r) => (
          <KartuRekening key={r.bank + r.nomor} rekening={r} />
        ))}
      </div>

      <p className="mb-3 px-1 text-[12px] font-semibold text-muted">
        Nominal transfer: <b className="text-ink">{rp(total)}</b>
      </p>

      {/* catatan cara konfirmasi */}
      <div className="mb-3 rounded-2xl border border-ok/25 bg-ok-soft px-3.5 py-3 text-[12.5px] font-semibold text-ok-deep">
        Setelah transfer, kirim bukti pembayaran lewat WhatsApp. Akun akan diaktifkan
        segera setelah pembayaran diterima. 😊
      </div>

      <a
        href={pesanWaLangganan(pengaturan, siswa, penerbit?.wa)}
        target="_blank"
        rel="noreferrer"
        className="bigbtn-wa flex items-center justify-center gap-2"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
          <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" />
        </svg>
        Konfirmasi via WhatsApp
      </a>

      <p className="mt-2 px-1 text-center text-[11px] font-semibold text-muted">
        WhatsApp hanya dipakai untuk kirim bukti transfer & konfirmasi aktivasi —
        cara bayar dan rekening sudah ada di halaman ini.
      </p>
    </div>
  )
}

/* ---------- satu kartu rekening, dengan tombol salin nomor ---------- */
function KartuRekening({ rekening }) {
  const [disalin, setDisalin] = useState(false)

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(rekening.nomor)
    } catch {
      // clipboard tidak tersedia — abaikan, nomor tetap terlihat untuk disalin manual
    }
    setDisalin(true)
    setTimeout(() => setDisalin(false), 1500)
  }

  return (
    <div className="card flex items-center justify-between gap-3">
      <span className="min-w-0">
        <b className="block text-[14px] font-extrabold text-brand">{rekening.bank}</b>
        <span className="block text-[15px] font-extrabold tracking-wide text-ink">{rekening.nomor}</span>
        <span className="mt-0.5 block text-[11.5px] font-semibold text-muted">a.n. {rekening.atasNama}</span>
      </span>
      <button
        onClick={salin}
        className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-extrabold transition ${
          disalin ? 'bg-ok text-white' : 'bg-[#F5F6FA] text-muted'
        }`}
      >
        {disalin ? 'Tersalin' : 'Salin'}
      </button>
    </div>
  )
}

/* ---------- invoice & kuitansi sewa ---------- */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function DokumenSewa({ pengaturan, siswa, penerbit, l }) {
  const { toast, modeDemo } = useData()
  const [riwayat, setRiwayat] = useState(null)
  const [sibuk, setSibuk] = useState(null) // 'invoice' | id riwayat

  useEffect(() => {
    api.riwayatSewaSaya().then(setRiwayat).catch(() => setRiwayat([]))
  }, [])

  const jalankan = async (kunci, fn) => {
    if (sibuk) return
    setSibuk(kunci)
    try {
      await fn()
    } catch (e) {
      toast('Gagal membuat dokumen: ' + e.message)
    } finally {
      setSibuk(null)
    }
  }

  const invoice = () =>
    jalankan('invoice', async () => {
      const { unduhInvoiceSewa, periodeBerikut } = await import('../lib/dokumen.js')
      const per = periodeBerikut(ymd(l.aktifSampai), 1)
      // rekening di invoice = rekening yang tampil di halaman ini
      const rek = penerbit?.rekening?.filter((r) => r.nomor)
      unduhInvoiceSewa({
        penerbit: { ...(penerbit || {}), rekening: rek?.length ? rek : REKENING_BANK },
        sekolah: { id: pengaturan.id, nama: pengaturan.namaSekolah, alamat: pengaturan.alamat, kepalaSekolah: pengaturan.kepalaSekolah },
        jumlahSiswa: jumlahSiswaAktif(siswa),
        tarif: tarifPerSiswa(pengaturan),
        bulan: 1,
        periodeMulai: per.mulai,
        periodeSampai: per.sampai,
        jatuhTempo: per.jatuhTempo,
      })
    })

  const kuitansi = (r) =>
    jalankan(r.id, async () => {
      const [d, { unduhKuitansiSewa }] = await Promise.all([api.kuitansiSewa(r.id), import('../lib/dokumen.js')])
      await unduhKuitansiSewa(d)
    })

  return (
    <div className="mb-4">
      <h3 className="mb-2.5 ml-0.5 text-[15px] font-extrabold">Dokumen sewa</h3>
      <div className="card mb-3 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-brand-soft text-[20px]" aria-hidden="true">🧾</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-extrabold">Invoice bulan berikutnya</b>
          <span className="block text-[12px] font-semibold text-muted">
            Untuk arsip / pengajuan dana ke yayasan · {rp(tagihanPerBulan(pengaturan, siswa))}
          </span>
        </span>
        <button
          onClick={invoice}
          disabled={!!sibuk}
          className="shrink-0 rounded-xl bg-brand px-3.5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-60"
        >
          {sibuk === 'invoice' ? 'Menyiapkan…' : 'Unduh PDF'}
        </button>
      </div>

      <div className="card">
        <div className="mb-1 text-[13px] font-extrabold">Bukti pembayaran sewa</div>
        {riwayat === null ? (
          <p className="py-3 text-[12.5px] text-muted">Memuat…</p>
        ) : riwayat.length === 0 ? (
          <p className="py-3 text-[12.5px] leading-relaxed text-muted">
            {modeDemo
              ? 'Mode demo — kuitansi sewa muncul di sini setelah terhubung ke database.'
              : 'Belum ada pembayaran sewa. Kuitansi muncul di sini setelah pembayaran dikonfirmasi admin aplikasi.'}
          </p>
        ) : (
          riwayat.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-t border-line py-3 first:border-0">
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px] font-extrabold">{rp(r.nominal)} · {r.bulan} bulan</b>
                <span className="block text-[11.5px] font-semibold text-muted">
                  {r.nomor} · aktif {tanggalPanjangLokal(new Date(r.periodeMulai + 'T00:00:00'))} – {tanggalPanjangLokal(new Date(r.sampaiBaru + 'T00:00:00'))}
                </span>
              </span>
              <button
                onClick={() => kuitansi(r)}
                disabled={!!sibuk}
                className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[12px] font-extrabold disabled:opacity-60"
              >
                {sibuk === r.id ? '…' : '📄 Kuitansi'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function CatatanPortal() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-ok/25 bg-ok-soft px-3.5 py-3">
      <span className="mt-0.5 text-ok-deep">
        <Ikon.info size={17} />
      </span>
      <p className="text-[12.5px] font-semibold text-ok-deep">
        Tenang, orang tua tidak langsung terdampak. Portal pembayaran mereka tetap
        bisa dibuka hingga {TENGGANG_PORTAL_HARI} hari setelah masa aktif berakhir —
        jadi keterlambatan singkat (mis. saat libur) tidak merusak layanan ke wali murid.
      </p>
    </div>
  )
}