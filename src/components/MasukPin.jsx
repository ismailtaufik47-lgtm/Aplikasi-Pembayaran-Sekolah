/**
 * Layar Masuk PIN (tampilan Kasceria):
 *  - HP: satu layar penuh — kepala, kartu, lalu rumput/gedung TK mengisi sisa
 *    bawah (tidak ada ruang kosong). Di HP pendek semuanya mengecil (index.css).
 *  - PC: kalau `sisiKiri` diisi → dua kolom (sambutan kiri, kartu kanan);
 *    kalau tidak (panel admin) → kartu di tengah.
 *  - 6 kotak PIN, keypad warna-warni; di PC PIN juga bisa diketik dari keyboard
 *    (angka, Backspace, Enter) selama kursor tidak sedang di kolom email.
 *  - Deteksi PIN aktif otomatis via cekPinAktif (debounce 800ms)
 *  - Lockout 3x salah tersimpan di server
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api.js'
import LatarMasuk, { Garis, JudulKartu, KartuMasuk, KepalaMerek, TautanTeks, TombolUtama } from './LatarMasuk.jsx'

const TATA_KEYPAD = [
  [['1', 'kuning'], ['2', 'biru'], ['3', 'pink']],
  [['4', 'biru'], ['5', 'ungu'], ['6', 'kuning']],
  [['7', 'pink'], ['8', 'tosca'], ['9', 'ungu']],
  [null, ['0', 'biru'], ['del', 'abu']],
]

export default function MasukPin({ onMasuk, onPakaiGoogle, footer, sisiKiri = null }) {
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

  const tekan = useCallback((angka) => {
    if (sibuk || terkunci) return
    setGalat('')
    setPin((p) => (p.length >= 6 ? p : p + angka))
  }, [sibuk, terkunci])
  const hapus = useCallback(() => { setGalat(''); setPin((p) => p.slice(0, -1)) }, [])

  const masuk = useCallback(async () => {
    if (sibuk) return
    if (!email.trim()) return setGalat('Isi email dulu')
    if (pin.length !== 6) return setGalat('PIN harus 6 digit')
    setSibuk(true); setGalat('')
    try {
      await onMasuk(email.trim(), pin)
    } catch (e) {
      setGalat(e.message); setPin(''); setSibuk(false)
      if (/dikunci/i.test(e.message)) setTerkunci(true)
    }
  }, [sibuk, email, pin, onMasuk])

  // Keyboard fisik (PC/tablet dengan keyboard): angka, Backspace, Enter.
  // Diabaikan kalau kursor sedang di kolom isian atau tombol sedang difokus
  // (Enter pada tombol sudah otomatis "mengklik" tombol itu).
  useEffect(() => {
    if (terkunci) return
    const f = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tekan(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); hapus() }
      else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); masuk() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [tekan, hapus, masuk, terkunci])

  /* ─── layar terkunci ─────────────────────────── */
  if (terkunci) {
    return (
      <LayarTerkunci
        onCobaLagi={() => { setTerkunci(false); setGalat(''); setEmail(''); setPin('') }}
        onPakaiGoogle={onPakaiGoogle}
        sisiKiri={sisiKiri}
      />
    )
  }

  return (
    <LatarMasuk kepala={<KepalaMerek />} sisiKiri={sisiKiri}>
      <KartuMasuk>
        {sisiKiri && (
          <JudulKartu tengah judul="Selamat datang kembali" sub="Masuk untuk mengelola keuangan sekolah" className="judul-kartu-pc hidden lg:flex" />
        )}

        {/* email */}
        <div className="flex items-end gap-3">
          <span className="permen permen-email grid h-11 w-11 shrink-0 place-items-center rounded-[14px] lg:h-12 lg:w-12">
            <Garis nama="surat" size={21} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="email-masuk" className="text-[13px] font-extrabold">Email</label>
            <input
              id="email-masuk"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                // Enter di kolom email → lepas fokus supaya angka berikutnya masuk ke PIN
                if (e.key === 'Enter') { e.preventDefault(); pin.length === 6 ? masuk() : e.currentTarget.blur() }
              }}
              placeholder="nama@email.com"
              autoComplete="username"
              className="h-[46px] w-full rounded-[14px] border-[1.5px] border-[#DCE3EF] bg-[#F7F9FE] px-3.5 text-[14.5px] font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft dark:border-line dark:bg-isi lg:h-[50px] lg:text-[15px]"
            />
          </div>
        </div>

        {/* banner belum punya PIN */}
        {statusPin === 'tidak-ada' && (
          <div className="-mt-1.5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12px] font-semibold leading-snug text-warn-deep">
            <Garis nama="info" size={16} className="mt-px" />
            <span>
              Akun ini belum punya PIN.{' '}
              {onPakaiGoogle && (
                <button type="button" onClick={onPakaiGoogle} className="font-extrabold underline underline-offset-2">
                  Masuk dengan Google
                </button>
              )}{' '}
              dulu, lalu aktifkan PIN lewat Profil Akun.
            </span>
          </div>
        )}

        {/* 6 kotak PIN */}
        <div className="flex items-end gap-3">
          <span className="permen permen-gembok grid h-11 w-11 shrink-0 place-items-center rounded-[14px] lg:h-12 lg:w-12">
            <Garis nama="gembok" size={21} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span id="label-pin" className="text-[13px] font-extrabold">Masukkan PIN</span>
            <div role="group" aria-labelledby="label-pin" aria-describedby="pesan-pin" className="flex justify-between gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <KotakPin key={i} keadaan={galat ? 'salah' : i < pin.length ? 'isi' : i === pin.length ? 'aktif' : 'kosong'} />
              ))}
            </div>
          </div>
        </div>

        <div className="-mt-1 flex flex-col gap-2.5">
          <p
            id="pesan-pin"
            aria-live="polite"
            className={`flex min-h-[17px] items-center justify-center gap-1.5 text-center text-[12px] font-bold ${galat ? 'text-danger' : 'text-[#5B6478] dark:text-muted'}`}
          >
            {galat || (
              <>
                <span className="lg:hidden">Ketuk angka untuk mengisi PIN</span>
                <span className="hidden items-center gap-1.5 lg:inline-flex">
                  <Garis nama="papanketik" size={16} sw={2} />Bisa juga ketik PIN langsung dari keyboard
                </span>
              </>
            )}
          </p>

          {/* keypad */}
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-[9px]">
            {TATA_KEYPAD.flat().map((k, i) => {
              if (!k) return <span key={i} />
              const [n, warna] = k
              if (n === 'del') {
                return (
                  <button
                    key={i} type="button" onClick={hapus} disabled={sibuk || !pin.length}
                    aria-label="Hapus satu angka"
                    className={`tombol-angka permen permen-${warna} grid place-items-center rounded-2xl pb-[3px] disabled:opacity-40`}
                  >
                    <Garis nama="hapus" size={24} />
                  </button>
                )
              }
              return (
                <button
                  key={i} type="button" onClick={() => tekan(n)} disabled={sibuk}
                  className={`tombol-angka permen permen-${warna} grid place-items-center rounded-2xl pb-[3px] font-display font-bold disabled:opacity-50`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        <TombolUtama onClick={masuk} disabled={sibuk}>
          {sibuk ? 'Memeriksa…' : 'Masuk dengan PIN'}
        </TombolUtama>

        {(onPakaiGoogle || footer) && (
          <div className="flex flex-col items-center gap-1.5 text-center text-[12.5px] font-semibold text-[#4A5570] dark:text-muted lg:text-[13px]">
            {onPakaiGoogle && (
              <p>Lupa PIN? <TautanTeks onClick={onPakaiGoogle}>Masuk dengan Google</TautanTeks></p>
            )}
            {footer}
          </div>
        )}
      </KartuMasuk>
    </LatarMasuk>
  )
}

function KotakPin({ keadaan }) {
  const gaya = {
    isi: 'border-brand bg-brand-soft dark:border-[#5B82F8]',
    aktif: 'border-brand bg-white ring-4 ring-[#DCE6FD] dark:border-[#5B82F8] dark:bg-isi dark:ring-brand/25',
    kosong: 'border-[#D6DFF0] bg-white dark:border-line dark:bg-isi',
    salah: 'border-danger bg-danger-soft',
  }[keadaan]
  return (
    <span className={`kotak-pin grid max-w-[52px] flex-1 place-items-center rounded-xl border-2 transition-colors ${gaya}`}>
      {keadaan === 'isi' && <span className="h-3 w-3 rounded-full bg-brand dark:bg-[#8EA9FF]" />}
      {keadaan === 'aktif' && <span className="h-[18px] w-0.5 animate-pulse rounded bg-brand dark:bg-[#8EA9FF]" />}
    </span>
  )
}

/* ─── PIN dikunci ─────────────────────────── */
function LayarTerkunci({ onCobaLagi, onPakaiGoogle, sisiKiri }) {
  return (
    <LatarMasuk kepala={<KepalaMerek />} sisiKiri={sisiKiri}>
      <KartuMasuk>
        <div className="flex items-center gap-3.5">
          <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-[18px] bg-danger-soft text-danger shadow-[inset_0_-4px_0_#F8CDCD] dark:shadow-none">
            <Garis nama="gembok" size={28} />
          </span>
          <JudulKartu judul="PIN dikunci sementara" sub="Salah 3 kali berturut-turut, demi keamanan." />
        </div>
        <div className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-[#FBDADA] bg-[#FFF4F4] p-3.5 dark:border-danger/30 dark:bg-danger-soft">
          <span className="text-[12px] font-extrabold uppercase tracking-[.4px] text-[#C62828] dark:text-[#FF9C9C]">Cara membukanya</span>
          {[
            <>Minta kepala sekolah membuka kunci lewat menu <b>Profil Sekolah</b>.</>,
            'Setelah dibuka, masuk lagi dengan PIN yang benar.',
          ].map((t, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-white text-[12px] font-extrabold text-[#C62828] shadow-[0_1px_0_#F6C9C9] dark:bg-kartu dark:shadow-none">
                {i + 1}
              </span>
              <span className="text-[12.5px] font-semibold leading-relaxed text-[#5A2323] dark:text-[#FFD0D0]">{t}</span>
            </div>
          ))}
        </div>
        <TombolUtama ikon="surat" onClick={onCobaLagi}>Coba email lain</TombolUtama>
        {onPakaiGoogle && (
          <p className="text-center text-[12.5px] font-semibold text-[#4A5570] dark:text-muted">
            Perlu masuk sekarang? <TautanTeks onClick={onPakaiGoogle}>Masuk dengan Google</TautanTeks>
          </p>
        )}
      </KartuMasuk>
    </LatarMasuk>
  )
}
