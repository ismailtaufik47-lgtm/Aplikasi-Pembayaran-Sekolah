/**
 * Layar Masuk PIN:
 *  - Mobile: full-screen flex column supaya semua muat tanpa scroll
 *  - PC/tablet: kartu terpusat max-w-[400px], tinggi auto
 *  - Indikator PIN: 6 kotak isian (bukan titik) — kosong bergaris, terisi solid
 *  - Deteksi PIN aktif otomatis via cekPinAktif (debounce 800ms)
 *  - Lockout 3x salah tersimpan di server
 */
import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api.js'

export default function MasukPin({ onMasuk, onPakaiGoogle, footer }) {
  const [email, setEmail]       = useState('')
  const [pin, setPin]           = useState('')
  const [galat, setGalat]       = useState('')
  const [sibuk, setSibuk]       = useState(false)
  const [terkunci, setTerkunci] = useState(false)
  const [statusPin, setStatusPin] = useState('belum-cek')
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    const e = email.trim()
    if (!e || !e.includes('@')) { setStatusPin('belum-cek'); return }
    setStatusPin('cek')
    timerRef.current = setTimeout(async () => {
      try {
        const ada = await api.cekPinAktif(e)
        setStatusPin(ada ? 'ada' : 'tidak-ada')
      } catch { setStatusPin('belum-cek') }
    }, 800)
    return () => clearTimeout(timerRef.current)
  }, [email])

  const tekan = (angka) => {
    if (pin.length >= 6 || sibuk || terkunci) return
    setGalat(''); setPin((p) => p + angka)
  }
  const hapus = () => { setGalat(''); setPin((p) => p.slice(0, -1)) }

  const masuk = async () => {
    if (!email.trim()) return setGalat('Isi email dulu')
    if (pin.length !== 6) return setGalat('PIN harus 6 digit')
    setSibuk(true); setGalat('')
    try {
      await onMasuk(email.trim(), pin)
    } catch (e) {
      setGalat(e.message); setPin(''); setSibuk(false)
      if (/dikunci/i.test(e.message)) setTerkunci(true)
    }
  }

  /* ─── layar terkunci ─────────────────────────── */
  if (terkunci) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-[360px] text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-2xl">🔒</div>
          <p className="mb-1.5 text-[15px] font-extrabold">PIN dikunci</p>
          <p className="mb-6 text-[13px] leading-relaxed text-muted">
            Salah 3 kali berturut-turut. Minta kepala sekolah membuka kembali
            lewat menu <b className="text-ink">Profil Sekolah</b>, lalu coba masuk lagi.
          </p>
          <button
            onClick={() => { setTerkunci(false); setGalat(''); setEmail(''); setPin('') }}
            className="text-[13px] font-bold text-brand underline underline-offset-2"
          >
            Coba email lain
          </button>
        </div>
      </div>
    )
  }

  /* ─── wrapper: full-screen di mobile, kartu terpusat di PC ──── */
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:items-center lg:justify-center">

      {/* ── kartu (di PC ini jadi kotak terpusat, di mobile full column) ── */}
      <div className="flex flex-1 flex-col lg:w-full lg:max-w-[420px] lg:flex-none lg:rounded-3xl lg:bg-white lg:p-8 lg:shadow-soft">

        {/* header */}
        <div className="flex-none px-6 pb-1.5 pt-5 text-center lg:px-0 lg:pt-0">
          <div className="mx-auto mb-2.5 grid h-14 w-14 place-items-center rounded-[16px] bg-brand text-3xl">
            🏫
          </div>
          <h1 className="text-[19px] font-extrabold tracking-tight">Pembayaran TK</h1>
          <p className="mt-0.5 text-[12.5px] font-semibold text-muted">
            Masuk untuk mengelola pembayaran sekolah
          </p>
        </div>

        {/* konten */}
        <div className="flex flex-1 flex-col px-6 lg:flex-none lg:px-0">

          {/* email */}
          <label className="mb-1.5 mt-4 block text-[13px] font-bold">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            autoComplete="username"
            className="field-input"
          />

          {/* banner belum punya PIN */}
          {statusPin === 'tidak-ada' && (
            <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[11.5px] font-semibold leading-snug text-warn-deep">
              <span className="shrink-0 text-base">💡</span>
              <span>
                Akun ini belum punya PIN.{' '}
                <button onClick={onPakaiGoogle} className="font-extrabold underline underline-offset-2">
                  Masuk dengan Google
                </button>
                {' '}dulu, lalu aktifkan PIN lewat Profil Akun.
              </span>
            </div>
          )}

          {/* ── kotak PIN 6 digit ───────────────────────────────── */}
          <div className="my-4 flex justify-center gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => {
              const terisi = i < pin.length
              const aktif  = !galat && !terisi
              return (
                <div
                  key={i}
                  className={`
                    flex h-11 w-11 items-center justify-center rounded-xl text-[18px] font-extrabold transition-all
                    ${galat
                      ? 'border-2 border-danger bg-danger-soft text-danger'
                      : terisi
                        ? 'border-2 border-brand bg-brand text-white'
                        : 'border-2 border-[#D1D9EC] bg-white text-transparent'
                    }
                  `}
                >
                  {terisi ? '•' : ''}
                </div>
              )
            })}
          </div>

          {/* pesan galat */}
          <p className={`mb-1 min-h-[16px] text-center text-[12px] font-bold text-danger transition-opacity ${galat ? 'opacity-100' : 'opacity-0'}`}>
            {galat || '—'}
          </p>

          {/* keypad */}
          <div className="grid flex-1 grid-rows-[repeat(4,1fr)] gap-2 lg:flex-none lg:grid-rows-none lg:gap-3">
            {[[1,2,3],[4,5,6],[7,8,9],['empty',0,'del']].map((baris, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2 lg:gap-3">
                {baris.map((n, ci) => {
                  if (n === 'empty') return <span key={ci} />
                  if (n === 'del') return (
                    <button
                      key={ci} type="button"
                      onClick={hapus}
                      disabled={sibuk || !pin.length}
                      className="flex h-14 items-center justify-center rounded-2xl bg-white text-[18px] font-bold text-muted border border-line active:scale-95 active:bg-[#F4F5F9] disabled:opacity-30 lg:h-14"
                    >⌫</button>
                  )
                  return (
                    <button
                      key={ci} type="button"
                      onClick={() => tekan(String(n))}
                      disabled={sibuk}
                      className="flex h-14 items-center justify-center rounded-2xl bg-white text-[20px] font-extrabold text-ink border border-line active:scale-95 active:bg-[#F4F5F9] disabled:opacity-50 lg:h-14"
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* tombol submit */}
          <button
            className="mt-3 flex-none rounded-2xl bg-brand py-3.5 text-[14.5px] font-extrabold text-white disabled:opacity-60 active:brightness-95 transition"
            onClick={masuk}
            disabled={sibuk}
          >
            {sibuk ? 'Memeriksa…' : 'Masuk dengan PIN'}
          </button>

          {/* tombol Lupa PIN */}
          {onPakaiGoogle && (
            <button
              onClick={onPakaiGoogle}
              className="mt-3 flex-none text-center text-[12.5px] font-semibold text-muted"
            >
              Lupa PIN?{' '}
              <span className="font-bold text-brand underline underline-offset-2">
                Masuk dengan Google
              </span>
              , lalu buat PIN baru di Profil Akun.
            </button>
          )}

          {/* footer */}
          {footer && <div className="mt-3 flex-none pb-4 text-center lg:pb-0">{footer}</div>}
        </div>
      </div>
    </div>
  )
}