import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { BtnKecil, Chip, Chevron, Ikon, Kosong, PageHead, Sheet, Tile, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { useAuth } from '../lib/auth.jsx'
import { GrafikPembayaran, StatusPembayaran } from './GrafikBeranda.jsx'
import { BULAN, bulanBerjalan, labelTunggakan, perluDitagihSekarang, rp, sppPerluSekarang, tanggalJatuhTempoDi } from '../lib/format.js'

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

export default function Beranda({ onCatat }) {
  const { pengaturan, siswa, pembayaran, petugas, peran, segarkan, toast } = useData()
  const kepala = peran === 'kepala'
  const { keluar, modeDemo } = useAuth()
  const [menu, setMenu] = useState(false)
  const nav = useNavigate()
  const kini = bulanBerjalan()

  const lunasBulanIni = siswa.filter((s) => (s.spp[kini] || 0) >= pengaturan.sppNominal).length
  // Uang yang benar-benar MASUK bulan kalender ini (menurut tanggal bayar),
  // bukan total semua pembayaran sejak awal.
  const sekarang = new Date()
  const masuk = pembayaran
    .filter((p) => {
      const d = new Date(p.tanggal)
      return d.getMonth() === sekarang.getMonth() && d.getFullYear() === sekarang.getFullYear()
    })
    .reduce((t, p) => t + p.nominal, 0)
  // Siswa yang SPP-nya jatuh tempo dalam 7 hari ke depan & belum lunas.
  const jt = jatuhTempoBerikut(pengaturan.tanggalJatuhTempo)
  const segeraJt = jt.sisaHari <= 7
    ? siswa.filter((s) => (s.spp[jt.indeks] || 0) < pengaturan.sppNominal).length
    : 0
  const kakiJt = jt.sisaHari === 0
    ? `Hari ini, ${jt.tanggal} ${BULAN[jt.indeks]}`
    : jt.sisaHari <= 7
      ? `${jt.sisaHari} hari lagi · ${jt.tanggal} ${BULAN[jt.indeks]}`
      : `Berikutnya ${jt.tanggal} ${BULAN[jt.indeks]}`
  const salam = salamWaktu()
  const menunggak = siswa.filter((s) => perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini))
  const nilaiTunggakan = menunggak.reduce((t, s) => t + sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini), 0)
  const persen = siswa.length ? Math.round((lunasBulanIni / siswa.length) * 100) : 0

  return (
    <>
      <header className="flex items-center gap-2.5 pb-1 pt-2.5 lg:hidden">
        <button className="tile bg-white shadow-soft" onClick={() => setMenu(true)}>
          <Ikon.menu size={20} />
        </button>
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-lg shadow-soft">🏫</span>
          {pengaturan.namaSekolah}
        </div>
        <button className="tile relative ml-auto bg-white shadow-soft" onClick={() => toast(`${menunggak.length} siswa perlu ditagih`)}>
          <Ikon.lonceng size={20} />
          <span className="absolute -right-1 -top-1 grid h-[19px] min-w-[19px] place-items-center rounded-[10px] border-2 border-canvas bg-danger px-1 text-[10px] font-bold text-white">
            {menunggak.length}
          </span>
        </button>
      </header>

      <div className="relative pb-1.5 pt-3.5 lg:hidden">
        <div className="absolute -right-1.5 top-1 text-[64px] leading-none drop-shadow">🧕</div>
        <h1 className="max-w-[66%] text-[23px] font-extrabold tracking-tight">
          {salam}{petugas ? `, ${petugas}` : ''} 👋
        </h1>
        <p className="mt-1 max-w-[64%] text-sm text-muted">Kelola pembayaran siswa dengan mudah</p>
      </div>

      <PageHead
        judul={`${salam}${petugas ? `, ${petugas}` : ''} 👋`}
        sub={kepala ? `Ringkasan sekolah ${pengaturan.namaSekolah}` : `Ringkasan pembayaran ${pengaturan.namaSekolah}`}
        aksi={
          <>
            <BtnKecil onClick={() => { segarkan(); toast('Data disegarkan') }}>Muat ulang</BtnKecil>
            {!kepala && (
              <BtnKecil utama onClick={() => onCatat(null)}>
                <Ikon.plus size={16} />
                Catat pembayaran
              </BtnKecil>
            )}
          </>
        }
      />

      <div className="noscroll -mx-[18px] mt-2 flex snap-x gap-3 overflow-x-auto px-[18px] pb-1.5 pt-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0">
        <Stat warna="blue" ikon={<Ikon.siswa size={21} />} label="Total siswa" nilai={siswa.length} kaki="Siswa aktif" titik="#3B6EF6" />
        <Stat warna="green" ikon={<Ikon.dompet size={21} />} label="Pembayaran bulan ini" nilai={rp(masuk)} kaki={`${lunasBulanIni} dari ${siswa.length} siswa lunas SPP ${BULAN[kini]}`} bar={persen} />
        <Stat warna="amber" ikon={<Ikon.jam size={21} />} label="Tunggakan" nilai={rp(nilaiTunggakan)} kaki={`${menunggak.length} siswa`} titik="#F5A524" />
        <Stat warna="grape" ikon={<Ikon.kalender size={21} />} label="Jatuh tempo ≤ 7 hari" nilai={`${segeraJt} siswa`} kaki={kakiJt} titik="#8B5CF6" />
      </div>

      <div className="seghead"><h2>Aksi cepat</h2></div>
      <div className="card p-3.5">
        <div className="noscroll -mx-1 flex gap-2.5 overflow-x-auto px-1 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {kepala ? (
            <>
              <Aksi warna="bg-ok" latar="bg-[#F5FCF8]" ikon={<Ikon.orang size={20} />} label="Data siswa" onClick={() => nav('/guru/siswa')} />
              <Aksi warna="bg-grape" latar="bg-[#FAF7FF]" ikon={<Ikon.grafik size={20} />} label="Laporan" onClick={() => nav('/guru/laporan')} />
              <Aksi warna="bg-grape" latar="bg-[#FAF5FF]" ikon={<Ikon.info size={20} />} label="Kode aktivasi" onClick={() => nav('/guru/kode-aktivasi')} />
              <Aksi warna="bg-brand" latar="bg-[#F7F9FF]" ikon={<Ikon.rumah size={20} />} label="Profil sekolah" onClick={() => nav('/guru/profil-sekolah')} />
            </>
          ) : (
            <>
              <Aksi warna="bg-brand" latar="bg-[#F7F9FF]" ikon={<Ikon.plus size={20} />} label="Catat pembayaran" onClick={() => onCatat(null)} />
              <Aksi warna="bg-ok" latar="bg-[#F5FCF8]" ikon={<Ikon.orang size={20} />} label="Pilih siswa" onClick={() => nav('/guru/siswa')} />
              <Aksi warna="bg-warn" latar="bg-[#FFFBF3]" ikon={<Ikon.dokumen size={20} />} label="Jenis biaya" onClick={() => nav('/guru/biaya')} />
              <Aksi warna="bg-rose" latar="bg-[#FFF7FA]" ikon={<Ikon.kalender size={20} />} label="Jadwal tagihan" onClick={() => toast('Atur jadwal & pengingat tagihan')} />
              <Aksi warna="bg-grape" latar="bg-[#FAF7FF]" ikon={<Ikon.grafik size={20} />} label="Laporan" onClick={() => nav('/guru/laporan')} />
            </>
          )}
        </div>
      </div>

      <div className="seghead"><h2>Ringkasan pembayaran</h2></div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <GrafikPembayaran pembayaran={pembayaran} siswa={siswa} pengaturan={pengaturan} />
        <StatusPembayaran siswa={siswa} pengaturan={pengaturan} />
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
       <div>
      <div className="seghead">
        <h2>Perlu ditagih</h2>
        <button className="text-[13px] font-bold text-brand" onClick={() => nav('/guru/siswa')}>Lihat semua</button>
      </div>
      <div className="card">
        {menunggak.length === 0 ? (
          <Kosong>Tidak ada SPP yang lewat jatuh tempo. 🎉</Kosong>
        ) : (
          menunggak.slice(0, 3).map((s) => {
            const label = labelTunggakan(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
            const rupiah = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
            return (
              <button key={s.id} className="row w-full text-left" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{s.nama}</span>
                  <span className="block truncate text-[12.5px] text-muted">Kelas {s.kelas} · NIS {s.nis}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                  {label && <Chip warna={label.warna}>{label.teks}</Chip>}
                  <span className="text-sm font-extrabold text-danger">{rp(rupiah)}</span>
                </span>
                <Chevron />
              </button>
            )
          })
        )}
      </div>

      <Sheet buka={menu} tutup={() => setMenu(false)} judul={pengaturan.namaSekolah} lead={pengaturan.alamat || `Tahun ajaran ${pengaturan.tahunAjaran}`}>
        <button
          className="bigbtn-ghost mb-2.5"
          onClick={() => { setMenu(false); nav(kepala ? '/guru/profil-sekolah' : '/guru/biaya') }}
        >
          {kepala ? 'Profil sekolah' : 'Pengaturan jenis biaya'}
        </button>
        <button className="bigbtn-ghost mb-2.5" onClick={() => { setMenu(false); segarkan(); toast('Data disegarkan') }}>
          Muat ulang data
        </button>
        {!modeDemo && (
          <button className="w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger" onClick={keluar}>
            Keluar
          </button>
        )}
        {modeDemo && (
          <p className="pt-1 text-center text-[12px] text-muted">
            Mode demo — belum tersambung ke Supabase.
          </p>
        )}
      </Sheet>

       </div>
       <div>
      <div className="seghead">
        <h2>Pembayaran terbaru</h2>
        {!kepala && (
          <button className="text-[13px] font-bold text-brand" onClick={() => nav('/guru/pembayaran')}>Lihat semua</button>
        )}
      </div>
      <div className="card">
        {pembayaran.length === 0 ? (
          <Kosong>Belum ada pembayaran tercatat.</Kosong>
        ) : (
          pembayaran.slice(0, 3).map((p) => {
            const s = siswa.find((x) => x.id === p.siswaId)
            if (!s) return null
            return (
              <button key={p.id} className="row w-full text-left" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{s.nama}</span>
                  <span className="block truncate text-[12.5px] text-muted">Kelas {s.kelas} · {p.ket}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                  <span className="text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                  <Chip warna={p.metode === 'Tunai' ? 'green' : 'blue'}>{p.metode}</Chip>
                </span>
              </button>
            )
          })
        )}
      </div>
       </div>
      </div>
    </>
  )
}

function Stat({ warna, ikon, label, nilai, kaki, titik, bar }) {
  return (
    <div className="card min-w-[158px] snap-start p-[15px] lg:min-w-0 lg:p-[18px]">
      <Tile warna={warna}>{ikon}</Tile>
      <div className="mt-3 text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-[21px] font-extrabold tracking-tight lg:text-2xl">{nilai}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
        {titik && <i className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: titik }} />}
        {kaki}
      </div>
      {bar !== undefined && <div className="mt-2"><Track persen={bar} /></div>}
    </div>
  )
}

function Aksi({ warna, latar, ikon, label, onClick }) {
  return (
    <button onClick={onClick} className={`grid min-w-[88px] flex-1 lg:min-w-0 justify-items-center gap-2 rounded-2xl border border-line px-2 py-3.5 text-center text-xs font-bold leading-tight active:scale-95 ${latar}`}>
      <span className={`grid h-[42px] w-[42px] place-items-center rounded-[13px] text-white ${warna}`}>{ikon}</span>
      {label}
    </button>
  )
}