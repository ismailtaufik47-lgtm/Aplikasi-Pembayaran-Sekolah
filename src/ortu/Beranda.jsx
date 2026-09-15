import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { Chip, Chevron, Ikon, Kosong, Tile, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, kegiatanBelum, lunasSpp, perluDitagihSekarang, rp, sisaTagihan, sppPerluSekarang, statusSpp } from '../lib/format.js'

export default function Beranda({ akar, anak, aktif, pilihAnak, bukaStruk, bukaCaraBayar, bukaPengumuman }) {
  const { pengaturan, biaya, pembayaran, wali, toast } = useData()
  const nav = useNavigate()
  const kini = bulanBerjalan()
  const a = aktif
  const adaPerlu = perluDitagihSekarang(a, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
  const belumSpp = BULAN.map((b, i) => ({ b, i, dibayar: a.spp[i] || 0, status: statusSpp(a.spp[i] || 0, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo) }))
    .filter((x) => x.status === 'nunggak' || x.status === 'belum-bayar' || x.status === 'sebagian')
  const belumKeg = biaya.map((b, i) => ({ ...b, i, dibayar: a.kegiatan[i] || 0 }))
    .filter((x) => x.dibayar < x.nominal)
  const kegLunas = biaya.length - belumKeg.length
  const riwayatAnak = pembayaran.filter((p) => p.siswaId === a.id)
  // Headline kartu sengaja BUKAN total 12 bulan — kalau baru Agustus, bulan
  // Oktober-Juni belum jatuh tempo dan tidak seharusnya terasa seperti utang.
  // Ini cuma tunggakan bulan lalu, plus bulan ini kalau sudah lewat jatuh
  // tempo, plus kegiatan yang terbuka.
  const perluSekarang = sppPerluSekarang(a, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(a, biaya)
  const sisaTahun = sisaTagihan(a, biaya, pengaturan.sppNominal)

  return (
    <>
      <header className="flex items-center gap-2.5 pb-1 pt-2.5 lg:hidden">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-lg shadow-soft">🏫</span>
        <div className="leading-tight">
          <div className="text-[15px] font-bold">{pengaturan.namaSekolah}</div>
          <div className="text-[11.5px] font-semibold text-muted">Portal orang tua</div>
        </div>
        <button className="tile relative ml-auto bg-white shadow-soft" onClick={bukaPengumuman}>
          <Ikon.lonceng size={20} />
          <span className="absolute -right-1 -top-1 grid h-[19px] min-w-[19px] place-items-center rounded-[10px] border-2 border-canvas bg-danger px-1 text-[10px] font-bold text-white">2</span>
        </button>
      </header>

      <div className="px-0.5 pt-3 lg:pt-7">
        <div className="text-[22px] font-extrabold tracking-tight lg:text-[26px]">Assalamu'alaikum, {wali.nama} 👋</div>
        <p className="mt-1 text-sm text-muted">Berikut status pembayaran ananda</p>
      </div>

      {anak.length > 1 && (
        <div className="noscroll -mx-[18px] mb-0.5 mt-3.5 flex gap-2.5 overflow-x-auto px-[18px] pb-1.5 pt-0.5 lg:mx-0 lg:flex-wrap lg:px-0">
          {anak.map((k) => (
            <button
              key={k.id}
              onClick={() => pilihAnak(k.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2 shadow-soft ${
                k.id === a.id ? 'border-brand bg-brand-soft' : 'border-line bg-white'
              }`}
            >
              <Avatar nama={k.nama} jenis={k.jenis} avatar={k.avatar} foto={k.foto} size={34} />
              <span className="text-left">
                <span className="block text-[13.5px] font-bold">{k.panggilan}</span>
                <span className="block text-[11.5px] font-semibold text-muted">Kelas {k.kelas}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
       <div>
      <div className="relative mt-3 overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-[#7B95FF] p-5 text-white shadow-hero lg:p-6">
        <div className="absolute -right-8 -top-10 h-[150px] w-[150px] rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <Avatar nama={a.nama} jenis={a.jenis} avatar={a.avatar} foto={a.foto} size={46} ring />
          <div>
            <div className="text-[13px] font-semibold opacity-90">Tagihan yang belum terlunasi</div>
            <div className="text-[26px] font-extrabold tracking-tight">
              {perluSekarang > 0 ? rp(perluSekarang) : 'Lunas ✅'}
            </div>
          </div>
        </div>
        <div className="relative mt-1.5 text-[12.5px] font-semibold opacity-90">{a.nama} · Kelas {a.kelas} · NIS {a.nis}</div>
        <div className="relative mt-4 flex gap-2.5">
          <button className="flex-1 rounded-2xl bg-white py-3 text-[13.5px] font-extrabold text-brand" onClick={bukaCaraBayar}>Cara bayar</button>
          <button className="flex-1 rounded-2xl bg-white/20 py-3 text-[13.5px] font-extrabold" onClick={() => nav(akar + '/tagihan')}>Lihat rincian</button>
        </div>
        {sisaTahun > perluSekarang && (
          <div className="relative mt-2.5 text-[11.5px] leading-snug opacity-80">
            Sisa total pembayaran SPP (termasuk bulan yang belum jatuh tempo): {rp(sisaTahun)}
          </div>
        )}
      </div>

      <div className={`mt-3.5 flex items-start gap-3 rounded-2xl p-3.5 ${adaPerlu ? 'bg-warn-soft' : 'bg-ok-soft'}`}>
        <Tile warna={adaPerlu ? 'amber' : 'green'} className="h-[34px] w-[34px] rounded-[11px]">
          {adaPerlu ? <Ikon.peringatan size={18} /> : <Ikon.cek size={18} />}
        </Tile>
        <div className={`text-[13px] font-semibold leading-snug ${adaPerlu ? 'text-warn-deep' : 'text-ok-deep'}`}>
          {adaPerlu
            ? `SPP ${belumSpp.filter((x) => x.status !== 'sebagian').map((x) => x.b).join(' dan ') || BULAN[kini]} belum dibayar. Jatuh tempo setiap tanggal ${pengaturan.tanggalJatuhTempo}.`
            : 'SPP ananda lunas sampai bulan ini. Terima kasih atas kedisiplinannya.'}
        </div>
      </div>

      <div className="mt-3.5 flex gap-3">
        <div className="card flex-1 p-3.5">
          <Tile warna="blue"><Ikon.kalender size={20} /></Tile>
          <div className="mt-2.5 text-[12.5px] font-semibold text-muted">SPP lunas</div>
          <div className="mt-0.5 text-[17px] font-extrabold tracking-tight">{lunasSpp(a, pengaturan.sppNominal)}/12 bulan</div>
          <div className="mt-2"><Track persen={(lunasSpp(a, pengaturan.sppNominal) / 12) * 100} tinggi={5} /></div>
        </div>
        <div className="card flex-1 p-3.5">
          <Tile warna="grape"><Ikon.dokumen size={20} /></Tile>
          <div className="mt-2.5 text-[12.5px] font-semibold text-muted">Kegiatan lunas</div>
          <div className="mt-0.5 text-[17px] font-extrabold tracking-tight">{kegLunas}/{biaya.length} item</div>
          <div className="mt-2"><Track persen={(kegLunas / Math.max(biaya.length, 1)) * 100} warna="#8B5CF6" tinggi={5} /></div>
        </div>
      </div>

      <div className="seghead">
        <h2>Rincian tagihan</h2>
        <button className="text-[13px] font-bold text-brand" onClick={() => nav(akar + '/tagihan')}>Lihat semua</button>
      </div>
      <div className="card">
        {belumSpp.length + belumKeg.length === 0 ? (
          <Kosong>Semua tagihan sudah lunas. 🎉</Kosong>
        ) : (
          [
            ...belumSpp.map((x) => ({
              n: `SPP ${x.b}`,
              m: x.dibayar > 0 ? `Sudah ${rp(x.dibayar)} · sisa berikut` : x.status === 'nunggak' ? 'Sudah lewat bulan ini' : `Jatuh tempo tgl ${pengaturan.tanggalJatuhTempo}`,
              v: pengaturan.sppNominal - x.dibayar,
              status: x.status,
            })),
            ...belumKeg.map((x) => ({
              n: x.nama,
              m: x.dibayar > 0 ? `Sudah ${rp(x.dibayar)} · sisa berikut` : 'Biaya kegiatan',
              v: x.nominal - x.dibayar,
              status: x.dibayar > 0 ? 'sebagian' : 'belum-bayar',
            })),
          ]
            .slice(0, 4)
            .map((x, i) => (
              <div key={x.n} className="row">
                <span className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-xs font-extrabold ${x.status === 'sebagian' ? 'bg-warn-soft text-warn' : x.status === 'nunggak' ? 'bg-danger-soft text-danger' : x.status === 'belum-bayar' ? 'bg-warn-soft text-warn' : 'bg-[#F2F4F9] text-muted'}`}>
                  {x.status === 'sebagian' ? '½' : x.status === 'nunggak' ? '!' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold">{x.n}</div>
                  <div className="text-[12.5px] text-muted">{x.m}</div>
                </div>
                <div className="grid shrink-0 justify-items-end gap-1.5 text-right">
                  <span className="text-sm font-extrabold">{rp(x.v)}</span>
                  {x.status === 'sebagian' ? <Chip warna="amber">Sebagian</Chip>
                    : x.status === 'nunggak' ? <Chip warna="red">Terlambat</Chip>
                    : x.status === 'belum-bayar' ? <Chip warna="amber">Belum bayar</Chip>
                    : <Chip>Belum bayar</Chip>}
                </div>
              </div>
            ))
        )}
      </div>

       </div>

       <div className="lg:sticky lg:top-6 lg:mt-3">
      <div className="seghead lg:mt-0">
        <h2>Pembayaran terakhir</h2>
        <button className="text-[13px] font-bold text-brand" onClick={() => nav(akar + '/riwayat')}>Lihat semua</button>
      </div>
      <div className="card">
        {riwayatAnak.length === 0 ? (
          <Kosong>Belum ada pembayaran tercatat.</Kosong>
        ) : (
          riwayatAnak.slice(0, 2).map((p) => (
            <button key={p.id} className="row w-full text-left" onClick={() => bukaStruk(p.id)}>
              <Tile warna="green" className="h-10 w-10 rounded-[13px]"><Ikon.cek size={19} /></Tile>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold">{p.ket}</span>
                <span className="block truncate text-[12.5px] text-muted">{p.waktu}</span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-1.5 text-right">
                <span className="text-sm font-extrabold text-ok-deep">{rp(p.nominal)}</span>
                <Chip warna={p.metode === 'Tunai' ? 'green' : 'blue'}>{p.metode}</Chip>
              </span>
              <Chevron />
            </button>
          ))
        )}
      </div>

      <p className="px-1 pt-4 text-center text-[11.5px] leading-relaxed text-muted">
        Status berubah setelah guru mencatat pembayaran, biasanya di hari yang sama.
      </p>
       </div>
      </div>
    </>
  )
}