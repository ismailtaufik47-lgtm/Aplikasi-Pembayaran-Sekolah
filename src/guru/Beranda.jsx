/**
 * Beranda panel sekolah (desain v14): ringkasan pembayaran SPP & kegiatan
 * DAN kas sekolah (pemasukan, pengeluaran, saldo) dalam satu halaman.
 *
 * Susunan:
 *   sapaan · 4 kartu angka · arus kas 6 bulan · rekap kas bulan ini
 *   (pengeluaran per kategori) · status SPP · perlu ditagih · aksi cepat ·
 *   transaksi terbaru · Tanya SAKU
 *
 * Mengikuti hak akses: kartu kas hanya untuk akun yang boleh melihat kas
 * (atau laporan keuangan). Akun tanpa akses kas tetap mendapat beranda
 * pembayaran seperti sebelumnya (pembayaran bulan ini, tunggakan, jatuh
 * tempo, grafik SPP).
 *
 * Angka kas dihitung DATABASE (fungsi kas_* dari 0030) — sama persis
 * dengan menu Kas & Laporan keuangan. Kartu di layar lebar disusun rapat
 * (tanpa lubang kosong), lihat susunLebar().
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/store.jsx'
import { Bintang, Bulan, GedungTK, Pelangi } from '../components/IlustrasiMasuk.jsx'
import { AnakUtuhLaki, AnakUtuhPerempuan } from '../components/Gambar.jsx'
import * as api from '../lib/api.js'
import { GrafikArusKas, GrafikPembayaran, StatusPembayaran } from './GrafikBeranda.jsx'
import {
  AksiCepat, AksiCepatHp, ChipBanding, Garis, KartuAngka, KartuSaku, PerluDitagih, RekapKas, Sparkline,
  TransaksiTerbaru, rpTanda,
} from './KartuBeranda.jsx'
import { rpRingkas } from './GrafikLaporan.jsx'
import {
  BULAN, bulanBerjalan, labelTunggakan, perluDitagihSekarang, rp, sppPerluSekarang, tanggalISO, tanggalJatuhTempoDi,
} from '../lib/format.js'
import { NAMA_BULAN, geserBulan, hariLalu, kunciBulan } from '../lib/kas.js'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu']

/** Salam sesuai jam perangkat. */
function salamWaktu(jam = new Date().getHours()) {
  if (jam < 11) return 'Selamat pagi'
  if (jam < 15) return 'Selamat siang'
  if (jam < 18) return 'Selamat sore'
  return 'Selamat malam'
}

/**
 * Tanggal jatuh tempo SPP berikutnya (hari ini atau sesudahnya):
 * kalau tanggal bulan ini sudah lewat, ambil tanggal yang sama bulan depan.
 */
function jatuhTempoBerikut(tgl, now = new Date()) {
  const hariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const padaBulan = (y, m) => new Date(y, m, tanggalJatuhTempoDi(tgl, y, m))
  let jt = padaBulan(now.getFullYear(), now.getMonth())
  if (jt < hariIni) {
    const depan = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    jt = padaBulan(depan.getFullYear(), depan.getMonth())
  }
  return { sisaHari: Math.round((jt - hariIni) / 864e5), indeks: bulanBerjalan(jt), tanggal: jt.getDate() }
}

/** "Hari ini" · "Kemarin" · "27 Sep" (pendek) / "27 Sep 2026" (panjang) untuk "YYYY-MM-DD". */
function tglTransaksi(iso, panjang) {
  const hariIni = tanggalISO()
  if (iso === hariIni) return 'Hari ini'
  if (iso === hariLalu(1)) return 'Kemarin'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${NAMA_BULAN[m - 1].slice(0, 3)}${panjang ? ' ' + y : ''}`
}

/* ---------- susunan kartu tanpa lubang ---------- */
const LEBAR_LG = { 1: 'lg:col-span-1', 2: 'lg:col-span-2' }
const LEBAR_XL = { 1: 'xl:col-span-1', 2: 'xl:col-span-2', 3: 'xl:col-span-3' }

/**
 * Hitung lebar (jumlah kolom) tiap kartu supaya setiap baris terisi penuh:
 * kalau kartu berikutnya tidak muat di sisa baris, kartu sebelumnya
 * dilebarkan menutup sisa itu; kartu terakhir juga dilebarkan sampai ujung.
 */
function susunLebar(kartu, kolom, kunci) {
  const hasil = {}
  let sisa = kolom
  let sebelum = null
  kartu.forEach((k) => {
    const lebar = Math.min(k[kunci] || 1, kolom)
    if (lebar > sisa && sebelum) {
      hasil[sebelum] += sisa
      sisa = kolom
    }
    hasil[k.k] = lebar
    sisa -= lebar
    sebelum = k.k
    if (sisa === 0) sisa = kolom
  })
  if (sebelum && sisa !== kolom) hasil[sebelum] += sisa
  return hasil
}

export default function Beranda({ onCatat, onTambahSiswa }) {
  const { pengaturan, siswa, pembayaran, petugas, segarkan, toast, boleh } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()

  // ---------- hak akses ----------
  const bolehKas = boleh('kas', 'lihat') || boleh('lap_keuangan', 'lihat') // data kas (fungsi kas_* di database)
  const halamanKas = boleh('kas', 'lihat') // menu Kas sekolah
  const bisaKas = boleh('kas')
  const bolehBayar = boleh('pembayaran', 'lihat') || boleh('lap_pembayaran', 'lihat')
  const bisaCatat = boleh('pembayaran')
  const bisaRiwayat = boleh('pembayaran', 'lihat') || boleh('batal', 'lihat')
  const lihatSiswa = boleh('siswa', 'lihat')
  const lihatLaporan = boleh('lap_pembayaran', 'lihat') || boleh('lap_keuangan', 'lihat')
  const halamanTagihan = boleh('pembayaran', 'lihat')

  // ---------- data kas (dari database; mode demo dihitung di perangkat) ----------
  const demo = useRef({})
  demo.current = { pembayaran }
  const bulanIni = kunciBulan(tanggalISO())
  const [versi, setVersi] = useState(0)
  const [rentang, setRentang] = useState(6)
  const [kas, setKas] = useState({ info: null, lap: null, riwayat: null, galat: '' })
  const [arus, setArus] = useState([])
  const [galatArus, setGalatArus] = useState('')

  useEffect(() => {
    if (!bolehKas) return
    let aktif = true
    Promise.all([
      api.kasRingkasan(demo.current),
      api.kasLaporanBulan(bulanIni, demo.current),
      api.kasRiwayat({ dari: hariLalu(29), sampai: tanggalISO(), batas: 40 }, demo.current),
    ])
      .then(([info, lap, riwayat]) => aktif && setKas({ info, lap, riwayat, galat: '' }))
      .catch((e) => aktif && setKas({ info: null, lap: null, riwayat: null, galat: e.message }))
    return () => { aktif = false }
  }, [bolehKas, bulanIni, versi, pembayaran])

  useEffect(() => {
    if (!bolehKas) return
    let aktif = true
    api.kasArus(bulanIni, Math.max(rentang, 6), demo.current)
      .then((d) => { if (aktif) { setArus(d); setGalatArus('') } })
      .catch((e) => aktif && setGalatArus(e.message))
    return () => { aktif = false }
  }, [bolehKas, bulanIni, rentang, versi, pembayaran])

  const memuatKas = bolehKas && !kas.info && !kas.galat
  const labelBulan = NAMA_BULAN[Number(bulanIni.slice(5)) - 1]
  const labelLalu = NAMA_BULAN[Number(geserBulan(bulanIni, -1).slice(5)) - 1].slice(0, 3)
  const arusLalu = arus.find((a) => a.bulan === geserBulan(bulanIni, -1))
  const masukBulan = kas.lap?.totalMasuk ?? 0
  const keluarBulan = kas.lap?.totalKeluar ?? 0
  const saldoKini = kas.info?.saldoKini ?? 0

  // Saldo per akhir bulan (6 bulan terakhir), dihitung mundur dari saldo sekarang.
  const saldoBulanan = useMemo(() => {
    if (!kas.info || arus.length < 2) return null
    const a = arus.slice(-6)
    const out = Array(a.length)
    out[a.length - 1] = kas.info.saldoKini
    for (let i = a.length - 2; i >= 0; i--) out[i] = out[i + 1] - (a[i + 1].masuk - a[i + 1].keluar)
    return out
  }, [arus, kas.info])

  // ---------- data pembayaran (dari store) ----------
  const lunasBulanIni = siswa.filter((s) => (s.spp[kini] || 0) >= pengaturan.sppNominal).length
  const sekarang = new Date()
  const masukBayar = pembayaran
    .filter((p) => {
      const d = new Date(p.tanggal)
      return d.getMonth() === sekarang.getMonth() && d.getFullYear() === sekarang.getFullYear()
    })
    .reduce((t, p) => t + p.nominal, 0)
  const jt = jatuhTempoBerikut(pengaturan.tanggalJatuhTempo)
  const segeraJt = jt.sisaHari <= 7 ? siswa.filter((s) => (s.spp[jt.indeks] || 0) < pengaturan.sppNominal).length : 0
  const tglJt = `${jt.tanggal} ${BULAN[jt.indeks].slice(0, 3)}`
  const teksJt = jt.sisaHari === 0
    ? `Jatuh tempo SPP hari ini, ${tglJt}`
    : `Jatuh tempo SPP berikutnya: ${tglJt} · ${jt.sisaHari} hari lagi`
  const kakiJt = jt.sisaHari === 0 ? `Hari ini, ${tglJt}` : jt.sisaHari <= 7 ? `${jt.sisaHari} hari lagi · ${tglJt}` : `Berikutnya ${tglJt}`

  const menunggak = useMemo(
    () =>
      siswa
        .filter((s) => perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini))
        .map((s) => ({
          s,
          nominal: sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini),
          label: labelTunggakan(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini),
        }))
        .sort((a, b) => b.nominal - a.nominal),
    [siswa, pengaturan, kini],
  )
  const nilaiTunggakan = menunggak.reduce((t, m) => t + m.nominal, 0)
  const jumlahKelas = new Set(siswa.map((s) => s.kelas).filter(Boolean)).size

  // ---------- transaksi terbaru: pembayaran siswa + buku kas ----------
  const transaksi = useMemo(() => {
    const dariBayar = bolehBayar || bolehKas
      ? [...pembayaran]
          .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
          .slice(0, 20)
          .map((p) => {
            const s = siswa.find((x) => x.id === p.siswaId)
            return {
              id: 'p-' + p.id,
              jenis: 'masuk',
              judul: s?.nama || 'Pembayaran siswa',
              sub: [p.ket, s && `Kelas ${s.kelas}`, p.metode].filter(Boolean).join(' · '),
              kategori: p.jenis === 'spp' ? 'SPP' : 'Kegiatan',
              tanggal: tanggalISO(new Date(p.tanggal)),
              urut: new Date(p.tanggal).getTime(),
              nominal: p.nominal,
              onClick: s && lihatSiswa ? () => nav(`/guru/siswa/${s.id}`) : undefined,
            }
          })
      : []
    const dariKas = bolehKas
      ? (kas.riwayat?.item || [])
          .filter((k) => k.sumber === 'kas' && !k.dibatalkanPada)
          .map((k) => ({
            id: 'k-' + k.id,
            jenis: k.jenis,
            judul: k.keterangan || k.kategori,
            sub: ['Buku kas', k.dicatatNama && `dicatat ${k.dicatatNama}`].filter(Boolean).join(' · '),
            kategori: k.kategori,
            tanggal: k.tanggal,
            urut: k.dibuatPada ? new Date(k.dibuatPada).getTime() : 0,
            nominal: k.nominal,
            onClick: halamanKas ? () => nav('/guru/kas') : undefined,
          }))
      : []
    return [...dariBayar, ...dariKas]
      .sort((a, b) => (a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1) : b.urut - a.urut))
      .slice(0, 18)
      .map((t) => ({ ...t, tglPendek: tglTransaksi(t.tanggal, false), tglPanjang: tglTransaksi(t.tanggal, true) }))
  }, [pembayaran, siswa, kas.riwayat, bolehKas, bolehBayar, lihatSiswa, halamanKas, nav])

  // ---------- aksi ----------
  const muatUlang = () => {
    segarkan()
    setVersi((v) => v + 1)
    toast('Data disegarkan')
  }
  const catatKas = (jenis) => nav('/guru/kas', { state: { catat: jenis } })
  const tanya = (q) => nav('/guru/tanya-ai', { state: { tanya: q } })

  const aksi = [
    bisaCatat && { k: 'catat', ikon: <Garis.plus size={20} />, warna: 'bg-brand', latar: 'bg-[#F7F9FF]', label: 'Catat pembayaran', pendek: 'Catat bayar', onClick: () => onCatat(null) },
    bisaKas && { k: 'keluar', ikon: <Garis.keluar size={20} />, warna: 'bg-danger', latar: 'bg-[#FFF7FA]', label: 'Catat pengeluaran', pendek: 'Pengeluaran', onClick: () => catatKas('keluar') },
    bisaKas && { k: 'masuk', ikon: <Garis.masuk size={20} />, warna: 'bg-ok', latar: 'bg-[#F5FCF8]', label: 'Pemasukan lain', pendek: 'Pemasukan', onClick: () => catatKas('masuk') },
    boleh('siswa') && onTambahSiswa && { k: 'siswa', ikon: <Garis.orangPlus size={20} />, warna: 'bg-grape', latar: 'bg-[#FAF7FF]', label: 'Tambah siswa', onClick: onTambahSiswa },
    !boleh('siswa') && lihatSiswa && { k: 'data-siswa', ikon: <Garis.siswa size={20} />, warna: 'bg-grape', latar: 'bg-[#FAF7FF]', label: 'Data siswa', onClick: () => nav('/guru/siswa') },
    lihatLaporan && { k: 'laporan', ikon: <Garis.grafik size={20} />, warna: 'bg-[#0E7490]', latar: 'bg-[#F7F9FF]', label: 'Laporan', onClick: () => nav('/guru/laporan') },
    boleh('biaya', 'lihat') && { k: 'biaya', ikon: <Garis.label size={20} />, warna: 'bg-warn', latar: 'bg-[#FFFBF3]', label: 'Jenis biaya', onClick: () => nav('/guru/biaya') },
    bisaRiwayat && { k: 'riwayat', ikon: <Garis.riwayat size={20} />, warna: 'bg-rose', latar: 'bg-[#FFF7FA]', label: 'Riwayat & pembatalan', pendek: 'Riwayat', onClick: () => nav('/guru/pembayaran') },
    !bisaKas && halamanKas && { k: 'kas', ikon: <Garis.dompet size={20} />, warna: 'bg-ok', latar: 'bg-[#F5FCF8]', label: 'Kas sekolah', onClick: () => nav('/guru/kas') },
    boleh('sekolah') && { k: 'sekolah', ikon: <Garis.rumah size={20} />, warna: 'bg-brand', latar: 'bg-[#F7F9FF]', label: 'Profil sekolah', onClick: () => nav('/guru/profil-sekolah') },
  ].filter(Boolean)

  const saran = bolehKas
    ? [
        { ikon: <Garis.masuk size={17} />, label: 'Berapa pemasukan hari ini?' },
        { ikon: <Garis.keluar size={17} />, label: 'Pengeluaran terbesar bulan ini?', tanya: 'Berapa pengeluaran bulan ini dan untuk apa saja?' },
        { ikon: <Garis.dompet size={17} />, label: 'Berapa saldo kas sekarang?' },
        { ikon: <Garis.siswa size={17} />, label: 'Siapa yang belum bayar SPP?', tanya: 'Siapa saja yang belum bayar SPP?' },
        { ikon: <Garis.nota size={17} />, label: `Buat ringkasan keuangan ${labelBulan}`, tanya: `Buatkan ringkasan keuangan bulan ${labelBulan}` },
      ]
    : [
        { ikon: <Garis.masuk size={17} />, label: 'Siapa yang bayar hari ini?', tanya: 'Siapa saja yang bayar hari ini?' },
        { ikon: <Garis.siswa size={17} />, label: 'Siapa yang belum bayar SPP?', tanya: 'Siapa saja yang belum bayar SPP?' },
        { ikon: <Garis.nota size={17} />, label: `Rekap SPP ${BULAN[kini]}`, tanya: `Buatkan rekap pembayaran bulan ${BULAN[kini]}` },
        { ikon: <Garis.grafik size={17} />, label: 'Kelas mana paling banyak nunggak?', tanya: 'Kelas mana yang tunggakannya paling banyak?' },
      ]

  // ---------- kartu angka ----------
  const kasGagal = !!kas.galat
  const angkaKas = (n) => (kasGagal ? '—' : rp(n))
  const kakiMasuk = (() => {
    if (kasGagal) return 'Data kas belum bisa dimuat'
    const nama = (kas.lap?.masukPerKategori || []).filter((k) => k.nominal > 0).slice(0, 3).map((k) => k.kategori)
    if (!nama.length) return 'Belum ada pemasukan bulan ini'
    return nama.length > 1 ? `${nama.slice(0, -1).join(', ')} & ${nama[nama.length - 1]}` : nama[0]
  })()
  const kakiKeluar = (() => {
    if (kasGagal) return 'Data kas belum bisa dimuat'
    const besar = [...(kas.lap?.keluarPerKategori || [])].sort((a, b) => b.nominal - a.nominal)[0]
    return besar ? `Terbesar: ${besar.kategori} ${rpRingkas(besar.nominal)}` : 'Belum ada pengeluaran bulan ini'
  })()
  const kakiSaldo = kasGagal ? 'Data kas belum bisa dimuat' : !kas.info?.pengaturan ? (
    <span className="text-warn-deep">Saldo awal kas belum diisi</span>
  ) : (
    <><span className={masukBulan - keluarBulan >= 0 ? 'font-bold text-ok-deep' : 'font-bold text-danger'}>{rpTanda(masukBulan - keluarBulan)}</span> bulan ini</>
  )

  const kartuAngka = bolehKas
    ? [
        <KartuAngka key="siswa" warna="blue" ikon={<Garis.siswa size={21} />} label="Total siswa" nilai={siswa.length} kaki={`Siswa aktif${jumlahKelas ? ` · ${jumlahKelas} kelas` : ''}`} />,
        <KartuAngka
          key="masuk"
          warna="green"
          ikon={<Garis.masuk size={21} />}
          label="Pemasukan bulan ini"
          nilai={angkaKas(masukBulan)}
          memuat={memuatKas}
          kanan={!memuatKas && <ChipBanding kini={masukBulan} lalu={arusLalu?.masuk} labelLalu={labelLalu} />}
          kaki={kakiMasuk}
        />,
        <KartuAngka
          key="keluar"
          warna="red"
          ikon={<Garis.keluar size={21} />}
          label="Pengeluaran bulan ini"
          nilai={angkaKas(keluarBulan)}
          memuat={memuatKas}
          kanan={!memuatKas && <ChipBanding kini={keluarBulan} lalu={arusLalu?.keluar} labelLalu={labelLalu} naikBaik={false} />}
          kaki={kakiKeluar}
        />,
        <KartuAngka
          key="saldo"
          warna="grape"
          ikon={<Garis.dompet size={21} />}
          label="Saldo kas sekolah"
          nilai={kasGagal ? '—' : <span className={saldoKini < 0 ? 'text-danger' : ''}>{rpTanda(saldoKini, false)}</span>}
          memuat={memuatKas}
          kanan={!memuatKas && <Sparkline nilai={saldoBulanan} />}
          kaki={kakiSaldo}
        />,
      ]
    : [
        <KartuAngka key="siswa" warna="blue" ikon={<Garis.siswa size={21} />} label="Total siswa" nilai={siswa.length} kaki={`Siswa aktif${jumlahKelas ? ` · ${jumlahKelas} kelas` : ''}`} />,
        <KartuAngka key="bayar" warna="green" ikon={<Garis.masuk size={21} />} label="Pembayaran bulan ini" nilai={rp(masukBayar)} kaki={`${lunasBulanIni} dari ${siswa.length} siswa lunas SPP ${BULAN[kini]}`} />,
        <KartuAngka key="tunggak" warna="amber" ikon={<Garis.jam size={21} />} label="Tunggakan SPP" nilai={rp(nilaiTunggakan)} kaki={`${menunggak.length} siswa perlu ditagih`} />,
        <KartuAngka key="jt" warna="grape" ikon={<Garis.kalender size={21} />} label="Jatuh tempo ≤ 7 hari" nilai={`${segeraJt} siswa`} kaki={kakiJt} />,
      ]

  // ---------- kartu besar (urutan = urutan di HP) ----------
  const kartuStatus = bolehBayar && {
    k: 'status', lg: 1, xl: 1, judulHp: bolehKas ? 'Ringkasan pembayaran' : null,
    isi: <StatusPembayaran siswa={siswa} pengaturan={pengaturan} onBuka={halamanTagihan ? () => nav('/guru/tagihan') : undefined} />,
  }
  const kartuTagih = bolehBayar && {
    k: 'tagih', lg: 1, xl: 1,
    isi: (
      <PerluDitagih
        daftar={menunggak}
        total={nilaiTunggakan}
        onBuka={lihatSiswa ? (id) => nav(`/guru/siswa/${id}`) : undefined}
        onSemua={halamanTagihan ? () => nav('/guru/tagihan') : lihatSiswa ? () => nav('/guru/siswa') : undefined}
      />
    ),
  }
  const kartuAksi = aksi.length > 0 && { k: 'aksi', lg: 1, xl: 1, hanyaLebar: true, isi: <AksiCepat aksi={aksi} /> }
  const kartuSaku = boleh('ai') && { k: 'saku', lg: 1, xl: 1, isi: <KartuSaku saran={saran} onTanya={tanya} /> }
  const kartuTransaksi = (bolehBayar || bolehKas) && {
    k: 'transaksi', lg: 2, xl: 2,
    isi: (
      <TransaksiTerbaru
        item={transaksi}
        memuat={memuatKas}
        bolehKas={bolehKas}
        onSemua={halamanKas ? () => nav('/guru/kas') : bisaRiwayat ? () => nav('/guru/pembayaran') : undefined}
      />
    ),
  }

  const kartu = (bolehKas
    ? [
        {
          k: 'arus', lg: 2, xl: 2, judulHp: 'Ringkasan kas',
          isi: <GrafikArusKas data={arus.slice(-rentang)} rentang={rentang} ubahRentang={setRentang} memuat={memuatKas || !arus.length} galat={galatArus} />,
        },
        {
          k: 'rekap', lg: 1, xl: 1,
          isi: (
            <RekapKas
              lap={kas.lap}
              keluarLalu={arusLalu?.keluar}
              labelBulan={labelBulan}
              labelLalu={labelLalu}
              memuat={memuatKas}
              galat={kas.galat}
              onBuka={halamanKas ? () => nav('/guru/kas') : lihatLaporan ? () => nav('/guru/laporan') : undefined}
              onCatatKeluar={bisaKas ? () => catatKas('keluar') : undefined}
            />
          ),
        },
        kartuStatus,
        kartuTagih,
        kartuAksi,
        kartuTransaksi,
        kartuSaku,
      ]
    : [
        bolehBayar && {
          k: 'grafik', lg: 2, xl: 2, judulHp: 'Ringkasan pembayaran',
          isi: <GrafikPembayaran pembayaran={pembayaran} siswa={siswa} pengaturan={pengaturan} />,
        },
        kartuStatus,
        kartuTagih,
        kartuAksi,
        kartuSaku,
        kartuTransaksi && { ...kartuTransaksi, xl: 3 },
      ]
  ).filter(Boolean)
  const lebarLg = susunLebar(kartu, 2, 'lg')
  const lebarXl = susunLebar(kartu, 3, 'xl')

  const salam = salamWaktu()
  const nama = petugas ? `, ${petugas}` : ''
  const hariIni = new Date()
  const tglPanjang = `${HARI[hariIni.getDay()]}, ${hariIni.getDate()} ${NAMA_BULAN[hariIni.getMonth()]} ${hariIni.getFullYear()}`
  const tglPendek = `${HARI[hariIni.getDay()]}, ${hariIni.getDate()} ${NAMA_BULAN[hariIni.getMonth()].slice(0, 3)} ${hariIni.getFullYear()}`
  const lonceng = () => toast(`${menunggak.length} siswa perlu ditagih`)

  return (
    <>
      {/* ---------- HP: sapaan di atas langit (tanpa kartu) ---------- */}
      <div className="relative mb-4 mt-1 min-h-[178px] lg:hidden">
        <AdeganBeranda className="absolute -right-[14px] bottom-0 h-[156px] w-[176px]" />
        <div className="relative z-[1] max-w-[56%]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11.5px] font-extrabold text-[#1B2559] dark:bg-white/10 dark:text-ink">
            <Garis.kalender size={13} />
            {tglPendek}
          </span>
          <h1 className="judul-halaman mt-2.5 font-display text-[26px] font-bold leading-[1.1] tracking-[-.3px]">{salam}{nama}!</h1>
          <p className="sub-halaman mt-1.5 text-[12.5px] font-bold leading-snug">
            {jt.sisaHari === 0 ? `Hari ini jatuh tempo SPP (${tglJt}).` : `Jatuh tempo SPP berikutnya ${tglJt} — ${jt.sisaHari} hari lagi.`}
          </p>
        </div>
      </div>

      {/* ---------- layar lebar: sapaan + tombol utama ---------- */}
      <div className="hero-beranda relative mt-6 hidden min-h-[196px] items-stretch gap-4 overflow-hidden rounded-[28px] lg:flex">
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center gap-2 py-6 pl-7">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#1B2559] dark:bg-white/10 dark:text-ink">
              <Garis.kalender size={15} />
              {tglPanjang}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#1B2559] dark:bg-white/10 dark:text-ink">
              <Garis.jam size={15} />
              {teksJt}
              {jt.sisaHari <= 7 && segeraJt > 0 ? ` · ${segeraJt} siswa belum bayar` : ''}
            </span>
          </div>
          <h1 className="judul-halaman mt-2 font-display text-[34px] font-bold leading-[1.1] tracking-[-.4px] 2xl:text-[38px]">{salam}{nama}!</h1>
          <p className="sub-halaman text-[14px] font-bold">
            Ringkasan {bolehKas ? 'keuangan & pembayaran' : 'pembayaran'} {pengaturan.namaSekolah} hari ini.
          </p>
        </div>
        <AdeganBeranda besar className="relative hidden h-[196px] w-[330px] shrink-0 self-end xl:block" />
        <div className="relative z-[1] flex w-[228px] shrink-0 flex-col justify-center gap-2.5 py-5 pr-6">
          {bisaCatat && (
            <button onClick={() => onCatat(null)} className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] bg-brand text-[13.5px] font-extrabold text-white transition hover:bg-brand-deep active:translate-y-px">
              <Garis.plus size={18} />
              Catat pembayaran
            </button>
          )}
          {bisaKas && (
            <button onClick={() => catatKas('keluar')} className="tombol-putih flex h-[42px] items-center justify-center gap-2 rounded-[14px] text-[13.5px] font-extrabold">
              <Garis.keluar size={18} className="text-danger" />
              Catat pengeluaran
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={muatUlang} className="tombol-putih flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[12.5px] font-extrabold">
              <Garis.muat size={16} />
              Muat ulang
            </button>
            <button onClick={lonceng} aria-label={`${menunggak.length} siswa perlu ditagih`} className="tombol-putih relative grid h-10 w-11 place-items-center rounded-[14px]">
              <Garis.lonceng size={18} />
              {menunggak.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-[10px] border-2 border-white bg-danger px-1 text-[10px] font-bold text-white dark:border-kartu">
                  {menunggak.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- kartu angka ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:mt-5 lg:gap-5 xl:grid-cols-4">{kartuAngka}</div>

      {/* ---------- HP: aksi cepat ---------- */}
      {aksi.length > 0 && (
        <div className="mt-3 lg:hidden">
          <AksiCepatHp aksi={aksi} />
        </div>
      )}

      {/* ---------- kartu besar: tersusun rapat tanpa lubang ---------- */}
      <div className="mt-3 grid gap-3 lg:mt-5 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {kartu.map((c) => [
          c.judulHp && (
            <h2 key={c.k + '-judul'} className="judul-halaman mx-0.5 mt-2 font-display text-[19px] font-semibold tracking-tight lg:hidden">
              {c.judulHp}
            </h2>
          ),
          <div key={c.k} className={`${c.hanyaLebar ? 'hidden lg:grid' : 'grid'} min-w-0 ${LEBAR_LG[lebarLg[c.k]]} ${LEBAR_XL[lebarXl[c.k]]}`}>
            {c.isi}
          </div>,
        ])}
      </div>

    </>
  )
}

/**
 * Gedung TK dengan dua anak berdiri UTUH sampai kaki di depannya (tidak
 * tertutup rumput/semak), di atas gundukan rumput. Pelangi di belakang
 * (siang) atau bulan & bintang (mode gelap).
 *   besar=false → versi HP (±156px), besar=true → kartu sapaan PC.
 */
function AdeganBeranda({ besar = false, className = '' }) {
  const anak = besar ? { width: 60, height: 116 } : { width: 46, height: 88 }
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="dark:hidden">
        <Pelangi className={besar ? 'absolute -right-10 top-2 w-[250px]' : 'absolute -right-5 top-0 w-[170px]'} />
      </div>
      <div className="hidden dark:block">
        <Bintang className="absolute inset-0 h-full w-full" />
        <Bulan className={besar ? 'absolute right-2 top-3 w-[50px]' : 'absolute right-3 top-0 w-[40px]'} />
      </div>
      <GedungTK className={`redup-malam absolute left-1/2 -translate-x-1/2 ${besar ? 'bottom-[2px] w-[250px]' : 'bottom-[2px] w-[150px]'}`} />
      <AnakUtuhLaki className={`absolute bottom-0 ${besar ? 'left-[22px]' : 'left-0'}`} style={anak} />
      <AnakUtuhPerempuan className={`absolute bottom-0 ${besar ? 'right-[22px]' : 'right-0'}`} style={anak} />
    </div>
  )
}
