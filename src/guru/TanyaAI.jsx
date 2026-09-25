/**
 * Tanya AI — khusus kepala sekolah.
 *
 * Kepala sekolah bisa MENGETIK BEBAS, atau mengetuk contoh pertanyaan
 * (chip) yang langsung terkirim sebagai pesan biasa. Chip hanya jalan
 * pintas, bukan batasan: AI memilih sendiri fungsi data mana yang
 * dipakai (lihat supabase/functions/tanya-ai), jadi pertanyaan dengan
 * kalimat apa pun tetap bisa dijawab selama datanya ada.
 *
 * Percakapan disimpan di memori halaman saja (hilang kalau aplikasi
 * dimuat ulang) — tidak disimpan ke database.
 */
import { useEffect, useRef, useState } from 'react'
import { BtnKecil, EmojiMenu, PageHead } from '../components/ui.jsx'
import TeksAI from '../components/TeksAI.jsx'
import SpandukLangganan from '../components/SpandukLangganan.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { BULAN, bulanBerjalan } from '../lib/format.js'
import { hitungLangganan } from '../lib/langganan.js'

const FONT_EMOJI = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }

/** Jawaban ini punya data yang layak diunduh Excel? (file Excel-nya dimuat belakangan) */
const bisaDiunduh = (data = []) =>
  data.some((d) => {
    const h = d.hasil || {}
    if (h.galat) return false
    if (d.alat === 'status_siswa') return h.siswa?.length > 0
    if (d.alat === 'transaksi') return h.jumlah_transaksi > 0
    if (d.alat === 'daftar_tunggakan') return h.jumlah_siswa > 0
    return d.alat === 'perbandingan_kelas' || d.alat === 'rekap_bulan'
  })

// Percakapan tetap ada saat pindah menu (selama aplikasi tidak dimuat ulang).
let simpanan = { pemilik: null, pesan: [], kuota: null }

function daftarSaran() {
  const kini = bulanBerjalan()
  return [
    { e: '🧾', label: 'Siapa yang belum bayar SPP?', tanya: 'Siapa saja yang belum bayar SPP?' },
    { e: '📊', label: `Rekap ${BULAN[kini]}`, tanya: `Buatkan rekap pembayaran bulan ${BULAN[kini]}` },
    ...(kini > 0 ? [{ e: '📅', label: `Rekap ${BULAN[kini - 1]}`, tanya: `Buatkan rekap pembayaran bulan ${BULAN[kini - 1]}` }] : []),
    { e: '🏫', label: 'Kelas mana paling banyak nunggak?', tanya: 'Kelas mana yang tunggakannya paling banyak?' },
    { e: '💵', label: 'Transaksi hari ini', tanya: 'Siapa saja yang bayar hari ini?' },
    { e: '🔎', label: 'Cek status satu siswa…', isi: 'Bagaimana status pembayaran ' },
  ]
}

/** Avatar asisten. `tampil` = kelas tampilan (mis. 'hidden sm:grid' untuk sembunyi di HP). */
const Robot = ({ size = 32, tampil = 'grid' }) => (
  <span
    aria-hidden="true"
    className={`${tampil} shrink-0 place-items-center rounded-full bg-[#E4F1FF]`}
    style={{ width: size, height: size, fontSize: Math.round(size * 0.55), ...FONT_EMOJI }}
  >
    🤖
  </span>
)

export default function TanyaAI() {
  const { siswa, biaya, pembayaran, pengaturan, petugas, modeDemo, toast } = useData()
  const [pesan, setPesan] = useState(() => (simpanan.pemilik === petugas ? simpanan.pesan : []))
  const [kuota, setKuota] = useState(() => (simpanan.pemilik === petugas ? simpanan.kuota : null))
  const [teks, setTeks] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [unduh, setUnduh] = useState(null)
  const ujung = useRef(null)
  const input = useRef(null)

  const terkunci = hitungLangganan(pengaturan).status === 'kadaluarsa'
  const kuotaHabis = kuota && kuota.terpakai >= kuota.batas
  const saran = daftarSaran()

  useEffect(() => {
    simpanan = { pemilik: petugas, pesan, kuota }
  }, [petugas, pesan, kuota])

  useEffect(() => {
    if (pesan.length) ujung.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [pesan, sibuk])

  // Tinggi kolom ketik menyesuaikan isi (maks ±5 baris).
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 132) + 'px'
  }, [teks])

  const kirim = async (isi, dasar = pesan) => {
    const q = String(isi ?? teks).trim()
    if (!q || sibuk || terkunci) return
    const riwayat = dasar.filter((m) => !m.galat).slice(-8).map((m) => ({ peran: m.peran, teks: m.teks }))
    setPesan([...dasar, { id: Date.now(), peran: 'user', teks: q }])
    setTeks('')
    setSibuk(true)
    try {
      const h = modeDemo
        ? await (await import('../lib/tanyaDemo.js')).jawabDemo(q, { siswa, biaya, pembayaran, pengaturan })
        : await api.tanyaAI(q, riwayat)
      setPesan((p) => [...p, { id: Date.now() + 1, peran: 'assistant', teks: h.jawaban, data: h.data || [] }])
      if (h.kuota) setKuota(h.kuota)
    } catch (e) {
      setPesan((p) => [...p, { id: Date.now() + 1, peran: 'assistant', galat: true, teks: e.message, ulang: q }])
    } finally {
      setSibuk(false)
    }
  }

  const pilihSaran = (s) => {
    if (s.tanya) return kirim(s.tanya)
    setTeks(s.isi)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(s.isi.length, s.isi.length)
    })
  }

  const ulangi = (m) => {
    // buang pertanyaan + pesan galatnya, lalu kirim ulang
    kirim(m.ulang, pesan.slice(0, -2))
  }

  const baru = () => {
    setPesan([])
    setTeks('')
    input.current?.focus()
  }

  const unduhExcel = async (m) => {
    if (unduh) return
    setUnduh(m.id)
    try {
      const { unduhExcelTanyaAI } = await import('../lib/exportTanyaAI.js')
      await unduhExcelTanyaAI(m.data, pengaturan.namaSekolah)
      toast('File Excel berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat file Excel: ' + e.message)
    } finally {
      setUnduh(null)
    }
  }

  const kosong = pesan.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------- area percakapan (yang bergulir) ---------- */}
      <div className="noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] lg:px-8">
        <div className="mx-auto w-full lg:max-w-[860px]">
          <SpandukLangganan pengaturan={pengaturan} />

          <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
            <EmojiMenu id="ai" size={38} />
            <h2 className="flex-1 text-[17px] font-extrabold">Tanya AI</h2>
            {!kosong && (
              <button onClick={baru} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold">
                + Baru
              </button>
            )}
          </div>
          <PageHead
            judul="Tanya AI"
            sub="Tanya apa saja soal pembayaran sekolah — angkanya dihitung langsung dari data aplikasi."
            aksi={!kosong && <BtnKecil onClick={baru}>+ Percakapan baru</BtnKecil>}
          />

          {kosong ? (
            <div className="mt-3 animate-fade rounded-card bg-white p-5 shadow-soft lg:mt-5 lg:p-7">
              <div className="flex items-start gap-3.5">
                <Robot size={52} />
                <div className="min-w-0">
                  <b className="block text-[17px] font-extrabold lg:text-[19px]">Halo, {petugas || 'Bapak/Ibu'}!</b>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                    Saya asisten laporan sekolah {pengaturan.namaSekolah}. Ketik pertanyaan dengan bahasa sehari-hari,
                    atau ketuk salah satu contoh di bawah.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {saran.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => pilihSaran(s)}
                    disabled={terkunci}
                    className="flex items-center gap-3 rounded-[14px] border border-line px-3.5 py-3 text-left text-[13.5px] font-bold transition hover:border-brand hover:bg-brand-soft/50 active:scale-[.99] disabled:opacity-50"
                  >
                    <span style={{ fontSize: 20, ...FONT_EMOJI }} aria-hidden="true">{s.e}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-[14px] bg-[#F5F6FA] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
                <b className="text-ink">Contoh pertanyaan bebas:</b> “Yang nunggak lebih dari 2 bulan siapa saja?”,
                “Berapa pemasukan minggu ini?”, “Siapa di kelas B yang belum bayar manasik?”
                <span className="mt-1.5 block">🔒 AI hanya bisa membaca data, tidak bisa mengubah apa pun. Nomor HP & alamat tidak pernah dikirim ke AI.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4 pt-3 lg:pt-5">
              {pesan.map((m) =>
                m.peran === 'user' ? (
                  <div key={m.id} className="flex animate-fade justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-brand px-4 py-2.5 text-[14px] font-semibold text-white">
                      {m.teks}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex animate-fade items-start gap-2.5">
                    <Robot tampil="hidden sm:grid" />
                    <div
                      className={`min-w-0 max-w-full rounded-[18px] sm:max-w-[calc(100%-42px)] rounded-tl-[6px] px-3.5 py-3 sm:px-4 shadow-soft ${
                        m.galat ? 'bg-danger-soft text-danger' : 'bg-white'
                      }`}
                    >
                      {m.galat ? (
                        <>
                          <p className="text-[14px] font-semibold">{m.teks}</p>
                          <button onClick={() => ulangi(m)} className="mt-2 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-bold text-danger">
                            Coba lagi
                          </button>
                        </>
                      ) : (
                        <>
                          <TeksAI teks={m.teks} />
                          {bisaDiunduh(m.data) && (
                            <button
                              onClick={() => unduhExcel(m)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold text-ok-deep hover:bg-ok-soft"
                            >
                              <span style={FONT_EMOJI} aria-hidden="true">📥</span>
                              {unduh === m.id ? 'Menyiapkan…' : 'Unduh Excel'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
              {sibuk && (
                <div className="flex animate-fade items-start gap-2.5">
                  <Robot tampil="hidden sm:grid" />
                  <div className="flex items-center gap-2.5 rounded-[18px] rounded-tl-[6px] bg-white px-4 py-3 text-[13.5px] font-semibold text-muted shadow-soft">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </span>
                    Sedang mengecek data sekolah…
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={ujung} className="h-2" />
        </div>
      </div>

      {/* ---------- kolom ketik (menempel di bawah) ---------- */}
      <div className="shrink-0 border-t border-line bg-canvas px-[18px] pb-2.5 pt-2 lg:px-8 lg:pb-4">
        <div className="mx-auto w-full lg:max-w-[860px]">
          {!kosong && !terkunci && (
            <div className="noscroll -mx-[18px] mb-2 flex gap-2 overflow-x-auto px-[18px] lg:mx-0 lg:px-0">
              {saran.map((s) => (
                <button
                  key={s.label}
                  onClick={() => pilihSaran(s)}
                  disabled={sibuk}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold transition hover:border-brand disabled:opacity-50"
                >
                  <span style={FONT_EMOJI} aria-hidden="true">{s.e}</span>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              kirim()
            }}
            className="flex items-end gap-2 rounded-[20px] border border-line bg-white p-1.5 pl-4 shadow-soft focus-within:border-brand"
          >
            <textarea
              ref={input}
              rows={1}
              value={teks}
              maxLength={500}
              disabled={terkunci || kuotaHabis}
              onChange={(e) => setTeks(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  kirim()
                }
              }}
              placeholder={
                terkunci ? 'Tanya AI aktif lagi setelah langganan diperpanjang'
                  : kuotaHabis ? 'Batas pertanyaan hari ini sudah habis'
                  : 'Ketik pertanyaan di sini…'
              }
              className="min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[14.5px] font-semibold outline-none placeholder:font-medium placeholder:text-muted disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              aria-label="Kirim"
              disabled={!teks.trim() || sibuk || terkunci}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition active:scale-95 disabled:bg-[#C9D3EA]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] font-semibold text-muted">
            {kuota && `Sisa ${Math.max(0, kuota.batas - kuota.terpakai)}/${kuota.batas} pertanyaan hari ini`}
            <span className={kuota ? 'hidden sm:inline' : ''}>
              {kuota && ' · '}AI bisa salah paham pertanyaan — cek ulang di Laporan untuk keputusan penting
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
