/**
 * SAKU — Sahabat Keuangan Sekolah (asisten AI sekolah, siap membantu 24 jam).
 * Bisa membaca pembayaran SPP & kegiatan serta buku kas (saldo, pemasukan,
 * pengeluaran) — kas hanya untuk akun yang punya hak akses kas.
 *
 * Pengguna bisa MENGETIK BEBAS, atau mengetuk contoh pertanyaan
 * (chip) yang langsung terkirim sebagai pesan biasa. Chip hanya jalan
 * pintas, bukan batasan: AI memilih sendiri fungsi data mana yang
 * dipakai (lihat supabase/functions/tanya-ai), jadi pertanyaan dengan
 * kalimat apa pun tetap bisa dijawab selama datanya ada.
 *
 * Percakapan disimpan di memori halaman saja (hilang kalau aplikasi
 * dimuat ulang) — tidak disimpan ke database.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BtnKecil } from '../components/ui.jsx'
import { KoinSaku } from '../components/Gambar.jsx'
import { Pelangi, Bintang, Bulan } from '../components/IlustrasiMasuk.jsx'
import TeksAI from '../components/TeksAI.jsx'
import SpandukLangganan from '../components/Spanduklangganan.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { BULAN, bulanBerjalan, rp } from '../lib/format.js'
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
    return ['perbandingan_kelas', 'rekap_bulan', 'kas', 'kas_per_bulan'].includes(d.alat)
  })

// Percakapan tetap ada saat pindah menu (selama aplikasi tidak dimuat ulang).
let simpanan = { pemilik: null, pesan: [], kuota: null }

function daftarSaran(bolehKas) {
  const kini = bulanBerjalan()
  return [
    ...(bolehKas ? [
      { e: '💰', label: 'Berapa pemasukan bulan ini?', tanya: 'Berapa pemasukan bulan ini?' },
      { e: '📉', label: 'Berapa pengeluaran bulan ini?', tanya: 'Berapa pengeluaran bulan ini dan untuk apa saja?' },
    ] : []),
    { e: '👨‍👩‍👧', label: 'Siapa yang belum bayar SPP?', tanya: 'Siapa saja yang belum bayar SPP?' },
    ...(bolehKas ? [{ e: '📊', label: 'Ringkasan keuangan minggu ini', tanya: 'Buatkan ringkasan keuangan minggu ini' }] : []),
    { e: '📅', label: `Rekap SPP ${BULAN[kini]}`, tanya: `Buatkan rekap pembayaran bulan ${BULAN[kini]}` },
    { e: '🏫', label: 'Kelas mana paling banyak nunggak?', tanya: 'Kelas mana yang tunggakannya paling banyak?' },
    { e: '💵', label: 'Siapa yang bayar hari ini?', tanya: 'Siapa saja yang bayar hari ini?' },
    { e: '🔎', label: 'Cek status satu siswa…', isi: 'Bagaimana status pembayaran ' },
  ]
}

/** Avatar asisten. `tampil` = kelas tampilan (mis. 'hidden sm:grid' untuk sembunyi di HP). */
const Robot = ({ size = 32, tampil = 'grid' }) => (
  <span
    aria-hidden="true"
    className={`${tampil} shrink-0 place-items-center rounded-[12px] bg-[#EAF0FE] dark:bg-white/10`}
    style={{ width: size + 4, height: size + 4 }}
  >
    <KoinSaku style={{ width: size, height: size }} />
  </span>
)

export default function TanyaAI() {
  const { siswa, biaya, pembayaran, pengaturan, petugas, modeDemo, toast, boleh } = useData()
  const bolehKas = boleh('kas', 'lihat') || boleh('lap_keuangan', 'lihat')
  const [kas, setKas] = useState(null) // ringkasan kas untuk kartu sapaan
  const [pesan, setPesan] = useState(() => (simpanan.pemilik === petugas ? simpanan.pesan : []))
  const [kuota, setKuota] = useState(() => (simpanan.pemilik === petugas ? simpanan.kuota : null))
  const [teks, setTeks] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [unduh, setUnduh] = useState(null)
  const ujung = useRef(null)
  const input = useRef(null)

  const terkunci = hitungLangganan(pengaturan).status === 'kadaluarsa'
  const kuotaHabis = kuota && kuota.terpakai >= kuota.batas
  const saran = daftarSaran(bolehKas)

  // Saldo kas untuk kartu sapaan (hanya akun yang boleh melihat kas).
  useEffect(() => {
    if (!bolehKas) return
    let aktif = true
    api.kasRingkasan({ pembayaran }).then((d) => aktif && setKas(d)).catch(() => aktif && setKas(false))
    return () => { aktif = false }
  }, [bolehKas]) // eslint-disable-line react-hooks/exhaustive-deps

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
        ? await (await import('../lib/TanyaDemo.js')).jawabDemo(q, { siswa, biaya, pembayaran, pengaturan })
        : await api.tanyaAI(q, riwayat)
      setPesan((p) => [...p, { id: Date.now() + 1, peran: 'assistant', teks: h.jawaban, data: h.data || [] }])
      if (h.kuota) setKuota(h.kuota)
    } catch (e) {
      setPesan((p) => [...p, { id: Date.now() + 1, peran: 'assistant', galat: true, teks: e.message, ulang: q }])
    } finally {
      setSibuk(false)
    }
  }

  // Pertanyaan yang diketik/dipilih di kartu SAKU beranda → langsung dikirim sekali.
  const lokasi = useLocation()
  const navigasi = useNavigate()
  const titipan = useRef(lokasi.state?.tanya || null)
  useEffect(() => {
    const q = titipan.current
    if (!q) return
    titipan.current = null
    navigasi(lokasi.pathname, { replace: true, state: null })
    kirim(q)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    // jangan hapus percakapan saat jawaban masih diproses (jawabannya
    // nanti masuk ke percakapan kosong yang tidak nyambung)
    if (sibuk) return
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
      <div className="langit-gulir noscroll flex-1 overflow-y-auto overscroll-contain px-[18px] lg:px-8">
        <div className="relative mx-auto w-full lg:max-w-[860px]">
          <SpandukLangganan pengaturan={pengaturan} />

          <div className="relative z-[1] flex items-center gap-2.5 pb-1 pt-3.5 lg:pt-7">
            {/* hiasan langit */}
            <div aria-hidden="true" className="pointer-events-none absolute -right-[18px] -top-1 -z-[1] h-[130px] w-[200px] lg:-right-4 lg:top-2">
              <div className="dark:hidden">
                <Pelangi className="absolute -right-6 top-3 w-[168px] lg:w-[196px]" />
              </div>
              <div className="hidden dark:block">
                <Bintang className="absolute inset-0 h-full w-full" />
                <Bulan className="absolute right-5 top-4 w-[42px]" />
              </div>
            </div>
            <Robot size={36} />
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="judul-halaman font-display text-[22px] font-bold lg:text-[26px]">Tanya SAKU</h1>
              <span className="sub-halaman block text-[12px] font-bold">Sahabat Keuangan Sekolah · siap 24 jam</span>
            </div>
            {!kosong && (
              <BtnKecil onClick={baru} className="!px-3.5 !py-2 text-[13px]">+ <span className="hidden sm:inline">Percakapan </span>baru</BtnKecil>
            )}
          </div>

          {kosong ? (
            <div className="relative z-[1] animate-fade pb-4">
              <div className="flex flex-col items-center pt-2 text-center">
                <KoinSaku className="h-[112px] w-[112px] lg:h-[132px] lg:w-[132px]" />
                <h2 className="judul-halaman mt-2 font-display text-[28px] font-bold leading-tight lg:text-[32px]">Halo, saya SAKU!</h2>
                <p className="sub-halaman mt-1.5 max-w-[440px] text-[13.5px] font-bold leading-relaxed">
                  Sahabat Keuangan Sekolah. Tanya apa saja soal {bolehKas ? 'kas, SPP, dan tunggakan' : 'SPP dan tunggakan'} {pengaturan.namaSekolah} — ketik bebas atau ketuk contoh di bawah.
                </p>
              </div>
              {bolehKas && kas !== false && (
                <div className="kartu-saldo mx-auto mt-4 max-w-[440px] rounded-[20px] px-4 py-3.5">
                  <div className="text-[12.5px] font-extrabold opacity-85">Saldo kas saat ini</div>
                  <div className="mt-0.5 break-all font-display text-[26px] font-bold leading-tight">
                    {kas ? (kas.saldoKini < 0 ? '−' + rp(-kas.saldoKini) : rp(kas.saldoKini)) : '…'}
                  </div>
                  {kas && !kas.pengaturan && <div className="mt-1 text-[11.5px] font-bold opacity-85">Saldo awal kas belum diisi — dihitung dari nol</div>}
                </div>
              )}
              <div className="mb-2 mt-5 text-[12.5px] font-extrabold uppercase tracking-[.06em] text-muted">Coba tanyakan</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {saran.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => pilihSaran(s)}
                    disabled={terkunci}
                    className="flex items-center gap-3 rounded-[16px] border-[1.5px] border-[#CFE0FF] bg-kartu px-3.5 py-3 text-left text-[13.5px] font-extrabold transition hover:border-brand active:scale-[.99] disabled:opacity-50 dark:border-line"
                  >
                    <span style={{ fontSize: 20, ...FONT_EMOJI }} aria-hidden="true">{s.e}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-[18px] bg-kartu/70 px-4 py-3 text-[12.5px] leading-relaxed text-muted dark:bg-white/5">
                <b className="text-ink">Contoh pertanyaan bebas:</b> “Yang nunggak lebih dari 2 bulan siapa saja?”,
                {bolehKas && ' “Uang keluar bulan ini paling banyak untuk apa?”, “Bandingkan pengeluaran 3 bulan terakhir”,'}
                {' '}“Siapa di kelas B yang belum bayar manasik?”
                <span className="mt-1.5 block">🔒 SAKU hanya bisa membaca data, tidak bisa mengubah apa pun. Nomor HP & alamat tidak pernah dikirim ke AI.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4 pt-3 lg:pt-5">
              {pesan.map((m) =>
                m.peran === 'user' ? (
                  <div key={m.id} className="flex animate-fade justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-[6px] bg-brand px-4 py-2.5 text-[14px] font-bold text-white shadow-[inset_0_-3px_0_#2A55CC]">
                      {m.teks}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex animate-fade items-start gap-2.5">
                    <Robot tampil="hidden sm:grid" />
                    <div
                      className={`min-w-0 max-w-full rounded-[20px] sm:max-w-[calc(100%-42px)] rounded-tl-[6px] px-3.5 py-3 sm:px-4 shadow-[0_8px_24px_rgba(30,64,140,.08)] ${
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
                    SAKU sedang mengecek data sekolah…
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={ujung} className="h-2" />
        </div>
      </div>

      {/* ---------- kolom ketik (menempel di bawah) ---------- */}
      <div className="shrink-0 bg-canvas px-[18px] pb-2.5 pt-2 lg:px-8 lg:pb-4">
        <div className="mx-auto w-full lg:max-w-[860px]">
          {!kosong && !terkunci && (
            <div className="noscroll -mx-[18px] mb-2 flex gap-2 overflow-x-auto px-[18px] lg:mx-0 lg:px-0">
              {saran.map((s) => (
                <button
                  key={s.label}
                  onClick={() => pilihSaran(s)}
                  disabled={sibuk}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[#CFE0FF] bg-white px-3 py-1.5 text-[12.5px] font-extrabold transition hover:border-brand disabled:opacity-50 dark:border-line"
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
            className="flex items-end gap-2 rounded-[22px] border-[1.5px] border-[#DCE6F4] bg-white p-1.5 pl-4 shadow-[0_8px_24px_rgba(30,64,140,.08)] focus-within:border-brand dark:border-line"
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
                terkunci ? 'SAKU aktif lagi setelah langganan diperpanjang'
                  : kuotaHabis ? 'Batas pertanyaan hari ini sudah habis'
                  : 'Tanya SAKU di sini…'
              }
              className="min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[14.5px] font-semibold outline-none placeholder:font-medium placeholder:text-muted disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              aria-label="Kirim"
              disabled={!teks.trim() || sibuk || terkunci}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-brand text-white transition active:translate-y-px disabled:bg-[#C9D3EA] disabled:!shadow-none"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] font-semibold text-muted">
            {kuota && `Sisa ${Math.max(0, kuota.batas - kuota.terpakai)}/${kuota.batas} pertanyaan hari ini`}
            <span className={kuota ? 'hidden sm:inline' : ''}>
              {kuota && ' · '}SAKU bisa salah paham pertanyaan — cek ulang di Laporan untuk keputusan penting
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
