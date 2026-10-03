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
import { BtnKecil, Chip, Ikon, IkonWhatsapp, IkonWhatsappPolos, KepalaHalaman, KolomCari, Kosong, Sheet } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { BintangWajah, Matahari } from '../components/IlustrasiMasuk.jsx'
import SheetPeriode from './SheetPeriode.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { BULAN, bulanBerjalan, dibayarKegiatan, dibayarSpp, labelJatuhTempoPeriode, persenBayar, rp, statusSpp } from '../lib/format.js'
import {
  BADGE_PAKET, EMOJI_JENIS, dibayarPaket, keteranganPaket, kurangSekarangPaket, statusPaket, tahapPaket, tglPendek, urutPaket,
} from '../lib/paket.js'
import SheetPaket from './SheetPaket.jsx'

const JENIS_PAKET = ['pmb', 'du']
const STATUS_DARI_PAKET = { lunas: 'lunas', terlambat: 'nunggak', mencicil: 'sebagian', belum: 'belum' }

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
  if (t.paketId && t.tagihSekarang > 0 && t.tagihSekarang < t.sisa) {
    // PMB / daftar ulang yang dicicil: ingatkan tahap yang sudah jatuh tempo, sebutkan sisa totalnya
    pesan += `Mohon izin mengingatkan, cicilan *${t.labelJenis}* untuk ananda *${t.nama}* (${t.kelas}) sebesar *${rp(t.tagihSekarang)}* sudah jatuh tempo${t.jatuhTempo ? ` (${t.jatuhTempo})` : ''}. `
    pesan += `Sisa seluruh ${t.labelJenis} ${rp(t.sisa)}.\n\n`
  } else {
    pesan += `Mohon izin mengingatkan, tagihan *${t.labelJenis}* untuk ananda *${t.nama}* (${t.kelas}) sebesar *${rp(t.sisa)}* masih perlu dilunasi`
    pesan += t.jatuhTempo ? ` (jatuh tempo ${t.jatuhTempo}).\n\n` : '.\n\n'
  }

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
  const { siswa, biaya, paket, pengaturan, toast, boleh } = useData()
  const bisaCatat = boleh('pembayaran')
  const nav = useNavigate()
  const kini = bulanBerjalan()

  const [cari, setCari] = useState('')
  const [filter, setFilter] = useState('semua') // semua | belum | jatuh-tempo
  const [filterKelas, setFilterKelas] = useState('') // '' = semua kelas, atau nama kelas
  // semua | spp | kegiatan | pmb | du — ?jenis=pmb dari tautan Jenis biaya
  const [jenisFilter, setJenisFilter] = useState(() => new URLSearchParams(window.location.search).get('jenis') || 'semua')
  const [paketPilih, setPaketPilih] = useState(null) // id paket saat filter PMB/DU (kalau ada beberapa tahun ajaran)
  const [aturPaket, setAturPaket] = useState(null) // id paket yang sedang diubah
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
      paket.forEach((p) => {
        if (!p.siswaIds.includes(s.id)) return
        urut++
        const dibayar = dibayarPaket(s, p.id)
        const st = statusPaket(p, dibayar)
        const tahap = tahapPaket(p, dibayar)
        const acuan = tahap.find((t) => t.lewat && !t.lunas) || tahap.find((t) => !t.lunas)
        daftar.push({
          id: `${s.id}-paket-${p.id}`,
          no: `TK-INV-${String(urut).padStart(4, '0')}`,
          siswaId: s.id, nama: s.nama, kelas: s.kelas, jenis: p.jenis, indeks: p.id, paketId: p.id,
          hp: s.hp, wali: s.wali, avatar: s.avatar, jenisKelamin: s.jenis, foto: s.foto,
          labelJenis: p.nama,
          emoji: EMOJI_JENIS[p.jenis],
          jatuhTempo: acuan ? tglPendek(acuan.jatuhTempo, true) : null,
          target: p.total, dibayar, sisa: Math.max(0, p.total - dibayar),
          tagihSekarang: kurangSekarangPaket(p, dibayar),
          ket: keteranganPaket(p, dibayar),
          status: STATUS_DARI_PAKET[st],
          badge: BADGE_PAKET[st],
        })
      })
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
  }, [siswa, biaya, paket, pengaturan, kini])

  // paket yang tampil saat filter PMB / Daftar ulang
  const paketJenis = useMemo(() => paket.filter((p) => p.jenis === jenisFilter).sort(urutPaket), [paket, jenisFilter])
  const paketAktif = JENIS_PAKET.includes(jenisFilter) ? paketJenis.find((p) => p.id === paketPilih) || paketJenis[0] || null : null
  const cocokJenis = (t) =>
    jenisFilter === 'semua' || (t.jenis === jenisFilter && (!paketAktif || t.paketId === paketAktif.id))
  const adaJenis = (j) => paket.some((p) => p.jenis === j)

  const ringkasan = useMemo(() => {
    const baris = semuaTagihan.filter(cocokJenis)
    const r = { total: baris.length, lunas: 0, belum: 0, sebagian: 0 }
    baris.forEach((t) => {
      if (t.status === 'lunas') r.lunas++
      else if (t.status === 'sebagian') r.sebagian++
      else r.belum++
    })
    return r
  }, [semuaTagihan, jenisFilter, paketAktif])

  const hasil = semuaTagihan.filter((t) => {
    if (!cocokJenis(t)) return false
    if (filter === 'belum' && t.status === 'lunas') return false
    if (filter === 'jatuh-tempo' && t.status !== 'nunggak') return false
    if (filterKelas && t.kelas !== filterKelas) return false
    const q = cari.toLowerCase()
    if (q && !(t.nama.toLowerCase().includes(q) || t.no.toLowerCase().includes(q) || t.labelJenis.toLowerCase().includes(q))) return false
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
      <KepalaHalaman
        judul="Tagihan"
        gambar="koin"
        sub={`${paket.length ? 'SPP, kegiatan, PMB & daftar ulang' : 'SPP & biaya kegiatan'} · tahun ajaran ${pengaturan.tahunAjaran || ''}`.trim()}
      />

      {/* ---------- jenis biaya: satu daftar untuk semua jenis ---------- */}
      <div className="noscroll -mx-[18px] mb-3 flex gap-2 overflow-x-auto px-[18px] pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {[
          ['semua', 'Semua', 'biru'],
          ['spp', 'SPP', 'biru'],
          ['kegiatan', 'Kegiatan', 'kuning'],
          ...(adaJenis('pmb') ? [['pmb', 'PMB', 'pink']] : []),
          ...(adaJenis('du') ? [['du', 'Daftar ulang', 'ungu']] : []),
        ].map(([v, l, w]) => (
          <button
            key={v}
            type="button"
            onClick={() => { setJenisFilter(v); setPaketPilih(null) }}
            aria-pressed={jenisFilter === v}
            className={`shrink-0 rounded-pill px-3.5 py-2 text-[13px] font-extrabold ${jenisFilter === v ? `permen permen-kecil permen-${w}` : 'tombol-putih'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {paketAktif && (
        <RingkasPaket
          p={paketAktif}
          pilihan={paketJenis}
          pilih={setPaketPilih}
          siswa={siswa}
          bisaAtur={boleh('biaya')}
          atur={() => setAturPaket(paketAktif.id)}
          filter={filter}
          aturFilter={setFilter}
        />
      )}

      {/* ---------- ringkasan (ubin permen) ---------- */}
      {!paketAktif && <div className="grid grid-cols-4 gap-2 lg:max-w-[640px] lg:gap-3">
        <AngkaPermen warna="biru" nilai={ringkasan.total} label="Semua" />
        <AngkaPermen warna="tosca" nilai={ringkasan.lunas} label="Lunas" />
        <AngkaPermen warna="pink" nilai={ringkasan.belum} label="Belum" />
        <AngkaPermen warna="kuning" nilai={ringkasan.sebagian} label="Sebagian" />
      </div>}

      {/* ---------- pencarian ---------- */}
      <KolomCari nilai={cari} ubah={setCari} placeholder="Cari nama siswa, nama tagihan, atau nomor…" className="mt-3.5 lg:max-w-md" />

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
        </div>

        <div className="noscroll -mx-[18px] flex w-[calc(100%+36px)] gap-2.5 overflow-x-auto px-[18px] pb-1 lg:mx-0 lg:w-auto lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          {boleh('biaya') && (
            <BtnKecil utama onClick={() => setFormBiaya(true)}>
              <Ikon.plus size={16} />
              Tagihan kegiatan
            </BtnKecil>
          )}
          {boleh('biaya') && adaJenis('pmb') === false && adaJenis('du') === false && (
            <BtnKecil onClick={() => nav('/guru/biaya')}>
              <Ikon.plus size={16} />
              PMB / daftar ulang
            </BtnKecil>
          )}
          <BtnKecil onClick={() => setMassal(true)}>
            <IkonWhatsapp size={17} />
            Tagihan massal
          </BtnKecil>
          <BtnKecil onClick={eksporExcel} disabled={mengekspor}>
            <Ikon.excel size={16} className="text-ok-deep" />
            {mengekspor ? 'Membuat…' : 'Export Excel'}
          </BtnKecil>
        </div>
      </div>

      {/* ---------- tabel ---------- */}
      <div className="card mt-3 overflow-hidden !p-0">
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
                  <BarisDesktop key={t.id} t={t} nav={nav} kirimWa={kirimWa} bisaCatat={bisaCatat} onCatat={() => setPeriode({ siswaId: t.siswaId, jenis: t.paketId ? 'paket' : t.jenis, indeks: t.indeks })} />
                ))}
              </tbody>
            </table>
            </div>
            {/* mobile: kartu */}
            <div className="px-3.5 lg:hidden">
              {hasil.slice(0, 150).map((t) => (
                <BarisMobile key={t.id} t={t} nav={nav} kirimWa={kirimWa} bisaCatat={bisaCatat} onCatat={() => setPeriode({ siswaId: t.siswaId, jenis: t.paketId ? 'paket' : t.jenis, indeks: t.indeks })} />
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

      <div className="spanduk-kuning mt-5 flex items-center justify-center gap-3 rounded-[20px] px-4 py-3">
        <Matahari className="h-9 w-9 shrink-0" />
        <p className="text-center text-[12.5px] font-bold">
          Bersama kita wujudkan sekolah yang ceria, sehat dan berprestasi
        </p>
        <BintangWajah className="h-9 w-9 shrink-0" />
      </div>

      <SheetPeriode
        buka={!!periode}
        tutup={() => setPeriode(null)}
        siswaId={periode?.siswaId}
        jenis={periode?.jenis}
        indeks={periode?.indeks}
      />
      <SheetTagihanMassal buka={massal} tutup={() => setMassal(false)} tagihan={semuaTagihan} kirimWa={kirimWa} />
      <SheetBuatTagihan
        buka={formBiaya}
        tutup={() => setFormBiaya(false)}
        jumlahSiswa={siswa.length}
        selesai={(nama) => {
          // langsung tunjukkan hasilnya: filter Kegiatan + cari nama tagihan baru
          setJenisFilter('kegiatan'); setPaketPilih(null); setFilter('semua'); setFilterKelas(''); setCari(nama)
        }}
        keJenisBiaya={() => nav('/guru/biaya')}
      />
      <SheetPaket buka={!!aturPaket} tutup={() => setAturPaket(null)} paketId={aturPaket} />
    </>
  )
}

/* ---------------- baris tabel ---------------- */

function BarisDesktop({ t, nav, kirimWa, onCatat, bisaCatat }) {
  const b = t.badge
  return (
    <tr className={`border-b border-line last:border-b-0 hover:bg-canvas ${t.status === 'nunggak' ? 'border-l-4 border-l-danger' : ''}`}>
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
      <td className="whitespace-nowrap px-2.5 py-3">
        <span className="flex items-center gap-2">
          {t.emoji && <GambarKegiatan emoji={t.emoji} size={26} className="rounded-[9px]" />}
          {t.labelJenis}
        </span>
      </td>
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
          <button className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#F1F4F9]" onClick={onCatat} aria-label={bisaCatat ? 'Catat pembayaran' : 'Lihat rincian'}>
            <Ikon.titikTiga size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function BarisMobile({ t, nav, kirimWa, onCatat, bisaCatat }) {
  const b = t.badge
  return (
    <div className={`row items-start ${t.status === 'nunggak' ? 'border-l-4 border-l-danger pl-2.5' : ''}`}>
      <Avatar nama={t.nama} jenis={t.jenisKelamin} avatar={t.avatar} foto={t.foto} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14.5px] font-bold">{t.nama}</span>
          <Chip warna={b.warna}>{b.teks}</Chip>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          {t.emoji && <GambarKegiatan emoji={t.emoji} size={18} latar={false} />}
          <span className="truncate">{t.labelJenis} · {t.kelas} · {t.no}</span>
        </div>
        {t.ket && t.sisa > 0 && <div className="mt-0.5 truncate text-[12px] font-bold text-[#34405C] dark:text-[#B8C3DC]">{t.ket}</div>}
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
            {t.sisa > 0 && bisaCatat && <button className="text-brand" onClick={onCatat}>Catat</button>}
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

/* ---------------- sheet: tagihan kegiatan baru ----------------
 * Jalan pintas dari halaman Tagihan untuk membuat biaya KEGIATAN sekali bayar
 * (study tour, manasik, baju olahraga…). Sama dengan "Tambah kegiatan" di
 * Jenis biaya, versi ringkas. Setelah dibuat, daftar langsung disaring ke
 * tagihan baru itu supaya hasilnya terlihat (dulu tenggelam di antara SPP).
 */
function SheetBuatTagihan({ buka, tutup, jumlahSiswa, selesai, keJenisBiaya }) {
  const { tambahBiaya, toast } = useData()
  const [nama, setNama] = useState('')
  const [nominal, setNominal] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const n = Number(nominal) || 0

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama kegiatan belum diisi')
    if (n <= 0) return toast('Nominal belum diisi')
    setSibuk(true)
    try {
      const judul = nama.trim()
      await tambahBiaya({ nama: judul, nominal: n, info: tanggal ? { tanggal } : {} })
      toast(`Tagihan "${judul}" dibuat untuk ${jumlahSiswa} siswa`)
      setNama(''); setNominal(''); setTanggal('')
      tutup()
      selesai?.(judul)
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Sheet buka={buka} tutup={tutup} judul="Tagihan kegiatan baru" lead="Biaya sekali bayar di luar SPP, ditagihkan ke semua siswa aktif">
      <div className="mb-4 rounded-[16px] bg-brand-soft px-3.5 py-3 text-[12.5px] font-bold leading-relaxed text-[#2A4A9E] dark:bg-white/5 dark:text-[#B8C9F2]">
        Contoh: study tour, manasik, baju olahraga, foto kelas. Setelah dibuat, tagihan ini langsung muncul
        di daftar Tagihan tiap siswa dan di portal orang tua — tinggal dicatat saat dibayar.
      </div>
      <label className="mb-1.5 block text-[13px] font-bold">Nama kegiatan</label>
      <input
        className="field-input mb-3.5"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        placeholder="Contoh: Study tour Taman Safari"
      />
      <label className="mb-1.5 block text-[13px] font-bold">Nominal per siswa</label>
      <input
        type="number"
        inputMode="numeric"
        className="field-input"
        value={nominal}
        onChange={(e) => setNominal(e.target.value)}
        placeholder="150000"
      />
      <div className="mb-3.5 mt-1 min-h-[18px] text-[12px] font-bold text-muted">
        {n > 0 ? <>{rp(n)} × {jumlahSiswa} siswa = <b className="text-ink">{rp(n * jumlahSiswa)}</b></> : null}
      </div>
      <label className="mb-1.5 block text-[13px] font-bold">Tanggal kegiatan <span className="font-semibold text-muted">(boleh dikosongkan)</span></label>
      <input type="date" className="field-input mb-4" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={sibuk}>
        {sibuk ? 'Membuat…' : `Buat tagihan untuk ${jumlahSiswa} siswa`}
      </button>
      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted">
        SPP bulanan sudah otomatis tiap bulan. PMB & daftar ulang diatur di{' '}
        <button type="button" className="font-extrabold text-brand underline-offset-2 hover:underline" onClick={() => { tutup(); keJenisBiaya?.() }}>Jenis biaya</button>.
      </p>
    </Sheet>
  )
}

/**
 * Kartu ringkas satu paket PMB / daftar ulang di atas daftar tagihan:
 * terkumpul, belum masuk, progres, dan jumlah siswa per status (ketuk untuk
 * menyaring). Tombol "Atur" membuka form paket (rincian, jadwal, siswa).
 */
function RingkasPaket({ p, pilihan, pilih, siswa, bisaAtur, atur, filter, aturFilter }) {
  const ditagih = siswa.filter((s) => p.siswaIds.includes(s.id))
  const target = p.total * ditagih.length
  const masuk = ditagih.reduce((t, s) => t + Math.min(p.total, dibayarPaket(s, p.id)), 0)
  const hitung = { terlambat: 0, mencicil: 0, lunas: 0, belum: 0 }
  ditagih.forEach((s) => hitung[statusPaket(p, dibayarPaket(s, p.id))]++)
  const persen = persenBayar(masuk, target)
  const gaya = p.jenis === 'pmb' ? 'kartu-saldo-minus' : 'kartu-paket-du'
  return (
    <section className="mb-3.5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-stretch lg:gap-3">
      <div className={`${gaya} relative overflow-hidden rounded-[24px] p-4`}>
        {pilihan.length > 1 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {pilihan.map((x) => (
              <button key={x.id} type="button" onClick={() => pilih(x.id)}
                className={`rounded-pill px-2.5 py-1 text-[11.5px] font-extrabold ${x.id === p.id ? 'bg-white text-ink' : 'bg-white/45'}`}>
                {x.tahunAjaran}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <GambarKegiatan emoji={EMOJI_JENIS[p.jenis]} size={48} className="!rounded-[15px] shadow-[inset_0_-3px_0_rgba(0,0,0,.06)]" />
          <span className="min-w-0 flex-1">
            <b className="line-clamp-2 block font-display text-[19px] font-bold leading-tight">{p.nama}</b>
            <span className="block text-[12px] font-extrabold opacity-90">
              {ditagih.length} siswa · {rp(p.total)}/siswa{p.tahap.length ? ` · ${p.tahap.length} tahap` : ''}
            </span>
          </span>
          {bisaAtur && (
            <button type="button" onClick={atur} className="flex shrink-0 items-center gap-1 self-start rounded-[11px] bg-white/60 px-2.5 py-1.5 text-[12px] font-extrabold dark:bg-white/10">
              <Ikon.pensil size={13} /> Atur
            </button>
          )}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <span>
            <span className="block text-[11.5px] font-extrabold">Terkumpul</span>
            <b className="font-display text-[22px] font-bold leading-tight">{rp(masuk)}</b>
          </span>
          <span className="text-right">
            <span className="block text-[11.5px] font-extrabold">Belum masuk</span>
            <b className="font-display text-[16px] font-bold">{rp(target - masuk)}</b>
          </span>
        </div>
        <div className="mt-2 h-[9px] overflow-hidden rounded-full bg-white/65 dark:bg-white/15">
          <i className="block h-full rounded-full bg-ok" style={{ width: `${persen}%` }} />
        </div>
        <div className="mt-1.5 text-[11.5px] font-extrabold">{persen}% dari {rp(target)}</div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 lg:mt-0 lg:grid-cols-1 lg:grid-rows-3">
        {[
          ['jatuh-tempo', 'Terlambat', hitung.terlambat, 'pink'],
          ['belum', 'Belum lunas', hitung.terlambat + hitung.mencicil + hitung.belum, 'kuning'],
          ['semua', 'Semua', ditagih.length, 'tosca'],
        ].map(([v, l, n, w]) => (
          <button key={v} type="button" onClick={() => aturFilter(v)} aria-pressed={filter === v}
            className={`permen permen-${w} flex flex-col items-center justify-center rounded-[18px] px-1 py-2 lg:flex-row lg:justify-between lg:px-4 ${filter === v ? 'ring-[3px] ring-brand/60' : ''}`}>
            <span className="font-display text-[22px] font-bold leading-none lg:order-2">{n}</span>
            <span className="mt-1 text-[11.5px] font-extrabold lg:mt-0">{l}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Ubin angka ringkasan (permen): angka besar + label. */
const AngkaPermen = ({ warna, nilai, label }) => (
  <div className={`permen permen-${warna} flex flex-col items-center justify-center rounded-[18px] px-1 pb-3 pt-2.5 text-center`}>
    <span className="font-display text-[24px] font-bold leading-none">{nilai}</span>
    <span className="mt-1 text-[12px] font-extrabold">{label}</span>
  </div>
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
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2.5 text-[13px] font-extrabold ${
          aktif ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-ink dark:border-line'
        }`}
      >
        {aktif ? `${label}: ${terpilih?.label}` : label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${buka ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {buka && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-[18px] border border-line bg-kartu p-1.5 shadow-[0_12px_30px_rgba(30,64,140,.16)]">
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