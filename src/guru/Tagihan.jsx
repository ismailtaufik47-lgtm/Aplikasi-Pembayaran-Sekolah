/**
 * Daftar Tagihan — worklist gabungan semua "tagihan" (SPP per bulan +
 * biaya kegiatan) dari semua siswa, dalam satu tabel yang bisa
 * difilter/dicari. Beda dari kartu pembayaran per-siswa (DetailSiswa):
 * di sini guru bekerja per-baris tagihan lintas siswa, cocok buat
 * "hari ini saya mau tagih siapa saja yang jatuh tempo".
 *
 * Catatan penting: tidak ada tabel "tagihan" tersendiri di database —
 * tiap baris di sini disusun on-the-fly dari (siswa × bulan SPP) dan
 * (siswa × jenis kegiatan), pakai helper status yang sama dengan
 * halaman lain supaya angkanya selalu konsisten. Nomor tagihan
 * (TK-INV-xxxx) juga dibuat otomatis, bukan disimpan di database.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Ikon, IkonWhatsapp, IkonWhatsappPolos, Kosong, PageHead, Sheet } from '../components/ui.jsx'
import SheetPeriode from './SheetPeriode.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { BULAN, bulanBerjalan, dibayarKegiatan, dibayarSpp, labelJatuhTempoPeriode, rp, statusSpp, tanggalPanjang } from '../lib/format.js'

/** Status kegiatan sederhana: lunas / sebagian / belum (tidak ada konsep jatuh tempo). */
function statusKegiatanItem(dibayar, target) {
  if (dibayar >= target) return 'lunas'
  if (dibayar > 0) return 'sebagian'
  return 'belum'
}

/**
 * Susun pesan WA pengingat tagihan — hangat, jelas, sertakan cara bayar
 * (rekening sekolah kalau sudah diisi di Profil Sekolah) dan permintaan
 * konfirmasi. Dipakai baik dari tombol per-baris maupun Tagihan Massal
 * supaya pesannya selalu konsisten.
 */
function pesanTagihan(t, pengaturan) {
  // Nama wali di data sekolah biasanya SUDAH mengandung sebutan sendiri
  // ("Ibu Wulan", "Bapak Hendra") — jangan tambah "Bapak/Ibu" lagi di
  // depannya supaya tidak jadi "Bapak/Ibu Ibu Wulan".
  const sapaan = t.wali || 'Bapak/Ibu Wali Murid'
  let pesan = `Assalamu'alaikum ${sapaan} 🙏\n\n`
  pesan += `Mohon izin mengingatkan, tagihan *${t.labelJenis}* untuk ananda *${t.nama}* (${t.kelas}) sebesar *${rp(t.sisa)}* masih perlu dilunasi`
  pesan += t.jatuhTempo ? ` (jatuh tempo ${t.jatuhTempo}).\n\n` : '.\n\n'

  const rekening = pengaturan.rekening || []
  if (rekening.length > 0) {
    pesan += `Pembayaran bisa dilakukan via transfer ke:\n`
    rekening.forEach((r) => {
      pesan += `🏦 ${r.bank} ${r.nomor} a.n. ${r.atasNama}\n`
    })
    pesan += `\n`
  }

  pesan += `Mohon konfirmasi ke sekolah setelah transfer ya, Bapak/Ibu 🙏 agar segera kami catat. Terima kasih banyak atas perhatiannya 😊`
  return pesan
}


const BADGE = {
  lunas: { teks: 'Lunas', warna: 'green' },
  sebagian: { teks: 'Sebagian', warna: 'amber' },
  belum: { teks: 'Belum bayar', warna: 'amber' },
  'belum-bayar': { teks: 'Belum bayar', warna: 'amber' },
  nunggak: { teks: 'Nunggak', warna: 'red' },
}

/**
 * Label status satu baris tagihan SPP, dibuat sejelas mungkin untuk guru:
 *  - 'Lunas'          : sudah dibayar penuh
 *  - 'Sebagian'       : dicicil separuh
 *  - 'Belum bayar'    : bulan tagihan itu sendiri, sudah lewat tanggal
 *                       tagih tapi bulannya belum berakhir
 *  - 'Nunggak N bulan': bulan tagihan itu SUDAH BERLALU (i < kini) dan
 *                       belum lunas. N = jumlah bulan yang sudah LEWAT
 *                       PENUH sejak bulan tagihan itu, TANPA menghitung
 *                       bulan berjalan (bulan berjalan belum selesai).
 *                       Contoh sekarang September: SPP Agustus → 1 bulan,
 *                       SPP Juli → 2 bulan. Sama dengan hitungan Beranda.
 */
function labelStatusSpp(status, indeksBulan, kini) {
  if (status === 'lunas') return { teks: 'Lunas', warna: 'green' }
  if (status === 'sebagian') return { teks: 'Sebagian', warna: 'amber' }
  if (status === 'nunggak') {
    // bulan tagihan ini s/d bulan terakhir yang sudah lewat (bulan berjalan tidak dihitung)
    const nBulan = Math.max(1, kini - indeksBulan)
    return { teks: `Nunggak ${nBulan} bulan`, warna: 'red' }
  }
  // belum-bayar / menunggu
  return { teks: 'Belum bayar', warna: 'amber' }
}


export default function Tagihan() {
  const { siswa, biaya, pengaturan, catatPembayaran, toast } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()

  const [cari, setCari] = useState('')
  const [filter, setFilter] = useState('semua') // semua | belum | jatuh-tempo
  const [filterKelas, setFilterKelas] = useState('') // '' = semua kelas, atau nama kelas
  const [jenisFilter, setJenisFilter] = useState('semua') // semua | spp | kegiatan
  const [periode, setPeriode] = useState(null) // { siswaId, jenis, indeks } — buka SheetPeriode
  const [massal, setMassal] = useState(false)
  const [formBiaya, setFormBiaya] = useState(false)
  const [mengekspor, setMengekspor] = useState(false)

  const kelasTersedia = useMemo(() => [...new Set(siswa.map((s) => s.kelas))].sort(), [siswa])

  /** Susun semua baris tagihan dari data siswa + biaya. */
  const semuaTagihan = useMemo(() => {
    const daftar = []
    let urut = 0
    siswa.forEach((s) => {
      for (let i = 0; i <= kini; i++) {
        urut++
        const dibayar = dibayarSpp(s, i)
        const status = statusSpp(dibayar, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
        daftar.push({
          id: `${s.id}-spp-${i}`,
          no: `TK-INV-${String(urut).padStart(4, '0')}`,
          siswaId: s.id, nama: s.nama, kelas: s.kelas, jenis: 'spp', indeks: i,
          hp: s.hp, wali: s.wali, avatar: s.avatar, jenisKelamin: s.jenis, foto: s.foto,
          labelJenis: `SPP ${BULAN[i]}`,
          jatuhTempo: labelJatuhTempoPeriode(pengaturan.tanggalJatuhTempo, i),
          target: pengaturan.sppNominal, dibayar, sisa: Math.max(0, pengaturan.sppNominal - dibayar),
          status,
          badge: labelStatusSpp(status, i, kini),
        })
      }
      biaya.forEach((b, i) => {
        urut++
        const dibayar = dibayarKegiatan(s, i)
        daftar.push({
          id: `${s.id}-keg-${i}`,
          no: `TK-INV-${String(urut).padStart(4, '0')}`,
          siswaId: s.id, nama: s.nama, kelas: s.kelas, jenis: 'kegiatan', indeks: i,
          hp: s.hp, wali: s.wali, avatar: s.avatar, jenisKelamin: s.jenis, foto: s.foto,
          labelJenis: b.nama,
          emoji: emojiKegiatan(b),
          jatuhTempo: null,
          target: b.nominal, dibayar, sisa: Math.max(0, b.nominal - dibayar),
          status: statusKegiatanItem(dibayar, b.nominal),
          badge: BADGE[statusKegiatanItem(dibayar, b.nominal)],
        })
      })
    })
    return daftar
  }, [siswa, biaya, pengaturan, kini])

  const ringkasan = useMemo(() => {
    const r = { total: semuaTagihan.length, lunas: 0, belum: 0, sebagian: 0 }
    semuaTagihan.forEach((t) => {
      if (t.status === 'lunas') r.lunas++
      else if (t.status === 'sebagian') r.sebagian++
      else r.belum++
    })
    return r
  }, [semuaTagihan])

  const hasil = semuaTagihan.filter((t) => {
    if (jenisFilter !== 'semua' && t.jenis !== jenisFilter) return false
    if (filter === 'belum' && t.status === 'lunas') return false
    if (filter === 'jatuh-tempo' && t.status !== 'nunggak') return false
    if (filterKelas && t.kelas !== filterKelas) return false
    const q = cari.toLowerCase()
    if (q && !(t.nama.toLowerCase().includes(q) || t.no.toLowerCase().includes(q))) return false
    return true
  })

  /**
   * Pesan WA dibuat hangat & sopan, bukan template kaku — sertakan cara
   * bayar (rekening sekolah) supaya orang tua tidak perlu tanya balik,
   * dan minta konfirmasi setelah transfer supaya guru tahu kapan harus
   * cek & catat pembayarannya.
   */
  const kirimWa = (t) => {
    const nomor = (t.hp || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
    if (!nomor) return toast('Nomor HP orang tua belum diisi')
    const teks = encodeURIComponent(pesanTagihan(t, pengaturan))
    window.open(`https://wa.me/${nomor}?text=${teks}`, '_blank')
  }

  // exceljs lumayan berat — dimuat baru saat tombol Export benar-benar
  // diklik (dynamic import), bukan ikut ter-bundle di halaman Tagihan
  // yang dibuka semua orang.
  const eksporExcel = async () => {
    if (mengekspor) return
    setMengekspor(true)
    try {
      const { unduhExcelTagihan } = await import('../lib/exportTagihan.js')
      await unduhExcelTagihan({ tagihan: semuaTagihan, siswa, pengaturan, kini })
      toast('Rekap tagihan berhasil diunduh')
    } catch (e) {
      toast('Gagal membuat file Excel: ' + e.message)
    } finally {
      setMengekspor(false)
    }
  }

  return (
    <>
      <h1 className="pb-1.5 pt-3.5 text-xl font-extrabold lg:hidden">Tagihan</h1>
      <PageHead judul="Tagihan" sub="Semua tagihan SPP dan kegiatan dalam satu daftar" />

      {/* ---------- ringkasan ---------- */}
      <div className="mt-1 flex flex-wrap gap-2.5 pb-1.5 pt-1">
        <Pil ikon={<Ikon.nota size={15} />} warna="bg-brand-soft text-brand">{ringkasan.total} Total</Pil>
        <Pil ikon={<Ikon.cek size={15} />} warna="bg-ok-soft text-ok">{ringkasan.lunas} Lunas</Pil>
        <Pil ikon={<Ikon.jam size={15} />} warna="bg-warn-soft text-warn">{ringkasan.belum} Belum</Pil>
        <Pil ikon={<Ikon.jam size={15} />} warna="bg-brand-soft text-brand">{ringkasan.sebagian} Sebagian</Pil>
      </div>

      {/* ---------- pencarian ---------- */}
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-soft">
        <span className="text-muted"><Ikon.cari size={18} /></span>
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nomor tagihan atau nama siswa…"
          className="flex-1 bg-transparent font-medium outline-none"
        />
      </div>

      {/* ---------- filter dropdown (kiri) + aksi utama (kanan), sejajar
          satu baris — ini yang tadinya jadi ruang kosong menganga ---------- */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-2">
          <FilterDropdown
            label="Status"
            value={filter}
            options={[
              { value: 'semua', label: 'Semua' },
              { value: 'belum', label: 'Belum Lunas' },
              { value: 'jatuh-tempo', label: 'Nunggak' },
            ]}
            onChange={setFilter}
          />
          <FilterDropdown
            label="Kelas"
            value={filterKelas}
            options={[{ value: '', label: 'Semua kelas' }, ...kelasTersedia.map((k) => ({ value: k, label: `Kelas ${k}` }))]}
            onChange={setFilterKelas}
          />
          <FilterDropdown
            label="Jenis biaya"
            value={jenisFilter}
            options={[
              { value: 'semua', label: 'Semua jenis' },
              { value: 'spp', label: 'Tagihan SPP' },
              { value: 'kegiatan', label: 'Tagihan Kegiatan' },
            ]}
            onChange={setJenisFilter}
          />
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            className="whitespace-nowrap rounded-2xl bg-brand px-4 py-2.5 text-[13px] font-extrabold text-white"
            onClick={() => setFormBiaya(true)}
          >
            + Buat Tagihan
          </button>
          <button
            className="whitespace-nowrap rounded-2xl border border-line bg-white px-4 py-2.5 text-[13px] font-extrabold text-brand"
            onClick={() => setMassal(true)}
          >
            Tagihan Massal
          </button>
          <button
            className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-line bg-white px-4 py-2.5 text-[13px] font-extrabold text-ok-deep disabled:opacity-60"
            onClick={eksporExcel}
            disabled={mengekspor}
          >
            <Ikon.dokumen size={15} />
            {mengekspor ? 'Membuat…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* ---------- tabel ---------- */}
      <div className="mt-3 overflow-hidden rounded-card bg-white shadow-soft">
        {hasil.length === 0 ? (
          <div className="p-5"><Kosong>Tidak ada tagihan yang cocok dengan filter ini.</Kosong></div>
        ) : (
          <>
            {/* desktop: tabel */}
            {/* overflow-x-auto supaya kolom Aksi tidak terpotong di layar
                sempit — sengaja dipisah dari wrapper luar (yang overflow-hidden
                untuk sudut rounded) supaya cuma tabelnya yang discroll, bukan
                seluruh kartu. */}
            <div className="overflow-x-auto">
              <table className="hidden w-full min-w-[980px] border-collapse text-left text-sm lg:table">
              <thead>
                <tr className="whitespace-nowrap border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                  <th className="px-3.5 py-3">No. Tagihan</th>
                  <th className="px-2.5 py-3">Nama Siswa</th>
                  <th className="px-2.5 py-3">Jenis Biaya</th>
                  <th className="px-2.5 py-3">Jatuh Tempo</th>
                  <th className="px-2.5 py-3">Total</th>
                  <th className="px-2.5 py-3">Sisa</th>
                  <th className="px-2.5 py-3">Status</th>
                  <th className="px-3.5 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {hasil.slice(0, 150).map((t) => (
                  <BarisDesktop key={t.id} t={t} nav={nav} kirimWa={kirimWa} onCatat={() => setPeriode({ siswaId: t.siswaId, jenis: t.jenis, indeks: t.indeks })} />
                ))}
              </tbody>
            </table>
            </div>
            {/* mobile: kartu */}
            <div className="lg:hidden">
              {hasil.slice(0, 150).map((t) => (
                <BarisMobile key={t.id} t={t} nav={nav} kirimWa={kirimWa} onCatat={() => setPeriode({ siswaId: t.siswaId, jenis: t.jenis, indeks: t.indeks })} />
              ))}
            </div>
            {hasil.length > 150 && (
              <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">
                Menampilkan 150 dari {hasil.length} tagihan — persempit pencarian/filter untuk melihat yang lain.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 rounded-card bg-warn-soft px-5 py-4">
        <span className="text-xl">☀️</span>
        <p className="text-center text-[12.5px] font-semibold text-warn-deep">
          ❤️ Bersama kita wujudkan sekolah yang ceria, sehat dan berprestasi ❤️
        </p>
        <span className="text-xl">☀️</span>
      </div>

      <SheetPeriode
        buka={!!periode}
        tutup={() => setPeriode(null)}
        siswaId={periode?.siswaId}
        jenis={periode?.jenis}
        indeks={periode?.indeks}
      />
      <SheetTagihanMassal buka={massal} tutup={() => setMassal(false)} tagihan={semuaTagihan} kirimWa={kirimWa} />
      <SheetBuatTagihan buka={formBiaya} tutup={() => setFormBiaya(false)} />
    </>
  )
}

/* ---------------- baris tabel ---------------- */

function BarisDesktop({ t, nav, kirimWa, onCatat }) {
  const b = t.badge
  return (
    <tr className={`border-b border-line last:border-b-0 hover:bg-[#FAFBFF] ${t.status === 'nunggak' ? 'border-l-4 border-l-danger' : ''}`}>
      <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs text-muted">{t.no}</td>
      <td className="px-2.5 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar nama={t.nama} jenis={t.jenisKelamin} avatar={t.avatar} foto={t.foto} size={32} />
          <span className="min-w-0">
            <span className="block font-bold leading-tight text-ink">{t.nama}</span>
            <span className="block text-xs text-muted">Kelas {t.kelas}</span>
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-2.5 py-3">{t.emoji && <span className="mr-1">{t.emoji}</span>}{t.labelJenis}</td>
      <td className="whitespace-nowrap px-2.5 py-3 text-muted">{t.jatuhTempo || '—'}</td>
      <td className="whitespace-nowrap px-2.5 py-3 font-semibold">{rp(t.target)}</td>
      <td className={`whitespace-nowrap px-2.5 py-3 font-semibold ${t.sisa > 0 ? 'text-danger' : 'text-muted'}`}>{rp(t.sisa)}</td>
      <td className="whitespace-nowrap px-2.5 py-3"><Chip warna={b.warna}>{b.teks}</Chip></td>
      <td className="px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <button className="font-bold text-brand hover:underline" onClick={() => nav(`/guru/siswa/${t.siswaId}`)}>Lihat</button>
          {t.sisa > 0 && (
            <button className="flex items-center gap-1.5 whitespace-nowrap font-bold text-ok-deep hover:underline" onClick={() => kirimWa(t)} title="Kirim pengingat via WhatsApp">
              <IkonWhatsapp size={17} /> <span className="hidden 2xl:inline">WhatsApp</span><span className="2xl:hidden">WA</span>
            </button>
          )}
          <button className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#F1F4F9]" onClick={onCatat} aria-label="Catat pembayaran">
            <Ikon.titikTiga size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function BarisMobile({ t, nav, kirimWa, onCatat }) {
  const b = t.badge
  return (
    <div className={`row items-start ${t.status === 'nunggak' ? 'border-l-4 border-l-danger pl-2.5' : ''}`}>
      <Avatar nama={t.nama} jenis={t.jenisKelamin} avatar={t.avatar} foto={t.foto} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14.5px] font-bold">{t.nama}</span>
          <Chip warna={b.warna}>{b.teks}</Chip>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">{t.emoji ? `${t.emoji} ` : ''}{t.labelJenis} · {t.kelas} · {t.no}</div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className={`text-[13.5px] font-extrabold ${t.sisa > 0 ? 'text-danger' : 'text-ok-deep'}`}>
            {t.sisa > 0 ? `Sisa ${rp(t.sisa)}` : `Dibayar ${rp(t.dibayar)}`}
          </span>
          <div className="flex items-center gap-3 text-[12.5px] font-bold">
            <button className="text-brand" onClick={() => nav(`/guru/siswa/${t.siswaId}`)}>Lihat</button>
            {t.sisa > 0 && (
              <button className="flex items-center gap-1 text-ok-deep" onClick={() => kirimWa(t)}>
                <IkonWhatsapp size={16} />
              </button>
            )}
            {t.sisa > 0 && <button className="text-brand" onClick={onCatat}>Catat</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- sheet: Tagihan Massal ---------------- */

function SheetTagihanMassal({ buka, tutup, tagihan, kirimWa }) {
  const prioritas = useMemo(
    () => tagihan.filter((t) => t.status === 'nunggak' || (t.status !== 'lunas' && t.jenis === 'spp'))
      .sort((a, b) => b.sisa - a.sisa)
      .slice(0, 30),
    [tagihan]
  )
  return (
    <Sheet buka={buka} tutup={tutup} judul="Tagihan massal" lead="Daftar prioritas untuk ditindaklanjuti sekarang">
      <p className="mb-4 text-xs text-muted">
        WhatsApp tidak mendukung kirim pesan ke banyak nomor sekaligus dari satu tombol — jadi ini daftar siap-tindak-lanjut,
        tinggal klik WA satu-satu dari urutan yang paling perlu diprioritaskan (nominal terbesar dulu).
      </p>
      {prioritas.length === 0 ? (
        <Kosong>Tidak ada tagihan yang perlu ditindaklanjuti. Semua aman 🎉</Kosong>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {prioritas.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 rounded-xl bg-canvas p-2.5">
              <Avatar nama={t.nama} jenis={t.jenisKelamin} avatar={t.avatar} foto={t.foto} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{t.nama}</div>
                <div className="truncate text-[11.5px] text-muted">{t.labelJenis} · {rp(t.sisa)}</div>
              </div>
              <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ok px-2.5 py-1.5 text-xs font-bold text-white" onClick={() => kirimWa(t)}>
                <IkonWhatsappPolos size={14} />
                Kirim
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- sheet: Buat Tagihan (jenis biaya kegiatan baru) ---------------- */

function SheetBuatTagihan({ buka, tutup }) {
  const { tambahBiaya, toast } = useData()
  const [nama, setNama] = useState('')
  const [nominal, setNominal] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama tagihan belum diisi')
    const n = Number(nominal) || 0
    if (n <= 0) return toast('Nominal belum diisi')
    setSibuk(true)
    try {
      await tambahBiaya({ nama: nama.trim(), nominal: n })
      toast(`Tagihan "${nama.trim()}" dibuat untuk semua siswa`)
      setNama(''); setNominal('')
      tutup()
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Buat tagihan baru" lead="Tagihan jenis kegiatan berlaku untuk semua siswa yang aktif">
      <label className="mb-1.5 block text-[13px] font-bold">Nama tagihan</label>
      <input
        className="field-input mb-3.5"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        placeholder="Contoh: Study tour, Baju olahraga…"
      />
      <label className="mb-1.5 block text-[13px] font-bold">Nominal per siswa</label>
      <input
        type="number"
        className="field-input mb-4"
        value={nominal}
        onChange={(e) => setNominal(e.target.value)}
        placeholder="150000"
      />
      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={sibuk}>
        {sibuk ? 'Membuat…' : 'Buat tagihan untuk semua siswa'}
      </button>
      <p className="mt-3 text-center text-[11.5px] text-muted">
        Ingin tagihan SPP bulanan? Itu sudah otomatis dibuat tiap bulan — tidak perlu dibuat manual.
      </p>
    </Sheet>
  )
}

const Pil = ({ ikon, warna, children }) => (
  <span className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-2 text-[12.5px] font-bold ${warna}`}>
    {ikon}{children}
  </span>
)

/**
 * Tombol filter bergaya dropdown — klik untuk buka daftar pilihan ke
 * bawah, klik di luar untuk menutup. Menggantikan baris chip panjang
 * (Semua/Belum Lunas/Nunggak/dst berjejer) yang makan tempat — sekarang
 * cuma satu tombol ringkas per kategori filter.
 */
function FilterDropdown({ label, value, options, onChange }) {
  const [buka, setBuka] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!buka) return
    const tutupKalauDiluar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setBuka(false)
    }
    document.addEventListener('mousedown', tutupKalauDiluar)
    return () => document.removeEventListener('mousedown', tutupKalauDiluar)
  }, [buka])

  const terpilih = options.find((o) => o.value === value)
  const aktif = value && value !== options[0].value

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setBuka((b) => !b)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-2xl border px-3.5 py-2.5 text-[13px] font-bold ${
          aktif ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'
        }`}
      >
        {aktif ? `${label}: ${terpilih?.label}` : label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${buka ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {buka && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-2xl border border-line bg-white p-1.5 shadow-[0_10px_30px_rgba(21,26,38,.14)]">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setBuka(false) }}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ${
                value === o.value ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-canvas'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}