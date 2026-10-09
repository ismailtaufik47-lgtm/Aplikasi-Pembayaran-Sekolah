/**
 * Isi pop-up rincian dasbor kepala sekolah (BerandaKepsek.jsx).
 * buka = { jenis: 'sehat'|'spp'|'masuk'|'keluar'|'saldo'|'tunggak'|'keg'|'nota', ... }
 * Huruf besar, kalimat sehari-hari, dan tombol menuju menu terkait.
 */
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { EmojiMenu } from '../components/ui.jsx'
import { BULAN, rp, taPendek, targetSpp } from '../lib/format.js'
import { NAMA_BULAN, tglKas } from '../lib/kas.js'
import { LABEL_STATUS, ZONA, desimal } from '../lib/kesehatan.js'

const PERMEN_JENIS = {
  sehat: 'tosca', spp: 'biru', masuk: 'tosca', keluar: 'ungu', saldo: 'kuning', tunggak: 'pink', keg: 'pink', nota: 'biru',
}
const JALUR = {
  sehat: <><path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z" /><path d="M8.8 12.2l2.2 2.2 4.4-4.6" /></>,
  spp: <><path d="M8 3.5h8M7 6.5h10" /><rect x="5" y="6.5" width="14" height="14" rx="4" /><path d="M9 13.5h6" /></>,
  masuk: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4 16v3h16v-3" /></>,
  keluar: <><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4 16v3h16v-3" /></>,
  saldo: <><path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 7.5L15 4v3.5" /><circle cx="16" cy="14" r="1.3" /></>,
  tunggak: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  keg: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  nota: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.6" /></>,
}

function Kepala({ jenis, judul, sub }) {
  return (
    <div className="mb-4 flex items-center gap-3 pr-9">
      <span className={`permen permen-${PERMEN_JENIS[jenis]} grid h-12 w-12 shrink-0 place-items-center rounded-[16px]`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{JALUR[jenis]}</svg>
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-[22px] font-semibold leading-tight text-[#1B2559] dark:text-ink">{judul}</h3>
        {sub && <p className="mt-0.5 text-[14px] font-semibold text-muted">{sub}</p>}
      </div>
    </div>
  )
}

const Judul = ({ children }) => <h4 className="mb-1 mt-5 text-[13.5px] font-extrabold uppercase tracking-[.04em] text-muted">{children}</h4>
const Angka = ({ children, merah }) => <b className={`block font-display text-[32px] font-semibold leading-tight ${merah ? 'text-danger' : 'text-[#1B2559] dark:text-ink'}`}>{children}</b>

function Tombol({ onClick, children, utama }) {
  return (
    <button type="button" onClick={onClick} className={`mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] px-4 text-[15.5px] font-extrabold ${utama ? 'bg-ok text-white shadow-[inset_0_-4px_0_#169A48]' : 'border-2 border-[#C4DAFF] bg-brand-soft text-brand dark:border-white/10'}`}>
      {children}
    </button>
  )
}

function Batang({ label, nilai, total, warna = 'bg-brand shadow-[inset_0_-3px_0_#2A55CC]' }) {
  const p = total ? Math.round((nilai / total) * 100) : 0
  return (
    <div className="mb-3.5">
      <div className="flex justify-between gap-3 text-[15.5px] font-bold"><span className="min-w-0 break-words">{label}</span><span className="shrink-0">{rp(nilai)}</span></div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-isi"><div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.max(p, nilai > 0 ? 2 : 0)}%` }} /></div>
        <span className="w-10 text-right text-[14px] font-bold text-muted">{p}%</span>
      </div>
    </div>
  )
}

function BarisSiswa({ s, kanan, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="row w-full items-center text-left">
      <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={42} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15.5px] font-extrabold">{s.nama}</b>
        <span className="block break-words text-[13.5px] font-semibold text-muted">{sub}</span>
      </span>
      <b className="shrink-0 text-[15px] text-danger">{kanan}</b>
    </button>
  )
}

const CHIP = {
  aman: 'bg-ok-soft text-ok-deep', pantau: 'bg-warn-soft text-warn-deep', tindakan: 'bg-danger-soft text-danger',
  belum: 'bg-isi text-muted', kosong: 'bg-isi text-muted', mati: 'bg-isi text-muted',
}
const BULAT = {
  aman: ['bg-ok-soft text-ok-deep', <path key="a" d="M5 12.5l4.5 4.5L19 7.5" />],
  pantau: ['bg-warn-soft text-warn-deep', <path key="p" d="M12 6v8M12 18v.01" />],
  tindakan: ['bg-danger-soft text-danger', <path key="t" d="M7 7l10 10M17 7L7 17" />],
}

export default function RincianKepsek({ buka, d, tutup, ganti }) {
  const nav = useNavigate()
  const pergi = (ke) => { tutup(); nav(ke) }
  const { kes, lap, info, statusList, rekap, nota, siswa, pengaturan, kini, namaBulan } = d
  const j = buka.jenis

  /* ============ kenapa sehat ============ */
  if (j === 'sehat') {
    if (!kes) return <p className="py-6 text-center text-muted">Memuat…</p>
    const z = ZONA[kes.zona]
    return (
      <div>
        <Kepala jenis="sehat" judul={`Kenapa ${z.label}?`} sub="Dihitung otomatis dari data kas & pembayaran" />
        {kes.skor != null ? (
          <div className="flex items-center gap-3.5 rounded-[20px] bg-isi px-4 py-3.5">
            <b className="font-display text-[46px] font-bold leading-none text-[#1B2559] dark:text-ink">{kes.skor}</b>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-extrabold">Skor dari 100 · {z.pendek}</b>
              <span className="relative mt-2.5 block h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#FF7A6B 0 40%,#FFC94D 40% 70%,#3DD07F 70% 100%)' }}>
                <span className="absolute -top-[5px] h-[22px] w-1.5 -translate-x-1/2 rounded-full bg-[#1B2559] ring-2 ring-white dark:bg-white dark:ring-[#1B2559]" style={{ left: `${kes.skor}%` }} />
              </span>
              <span className="relative mt-1 block h-4 text-[12px] font-bold text-muted">
                <span className="absolute left-0">0</span><span className="absolute left-[40%] -translate-x-1/2">40</span><span className="absolute left-[70%] -translate-x-1/2">70</span><span className="absolute right-0">100</span>
              </span>
            </span>
          </div>
        ) : (
          <p className="rounded-[18px] bg-isi px-4 py-3.5 text-[15px] font-semibold">Belum ada indikator yang bisa dinilai. Isi saldo awal kas di menu Kas sekolah dulu.</p>
        )}
        <p className="mt-3 text-[14.5px] font-semibold leading-relaxed">
          Skor gabungan dari 7 hal di bawah. <b>Cadangan kas</b> dan <b>perkiraan 3 bulan</b> pengaruhnya paling besar. 70 ke atas = Sehat, 40–69 = Waspada, di bawah 40 = Perlu perhatian.
        </p>
        <p className="mt-3 flex gap-2.5 rounded-[16px] bg-danger-soft px-3.5 py-3 text-[14px] font-bold leading-relaxed text-danger">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0"><path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z" /><path d="M12 8.5v4M12 15.5v.01" /></svg>
          <span>Rem darurat{kes.rem ? ' AKTIF' : ''}: kalau kas bebas kurang dari 1 bulan biaya rutin, status langsung Perlu perhatian berapa pun skornya.</span>
        </p>

        <Judul>7 hal yang dicek</Judul>
        {kes.kriteria.map((x) => (
          <div key={x.k} className={`mt-2.5 rounded-[20px] border-[1.5px] p-3.5 ${x.status === 'pantau' ? 'border-[#F4DDA8] bg-[#FFFCF3] dark:border-warn/30 dark:bg-white/5' : x.status === 'tindakan' ? 'border-[#F5C2BC] bg-[#FFF7F6] dark:border-danger/30 dark:bg-white/5' : 'border-line bg-kartu'}`}>
            <div className="flex items-start gap-3">
              {BULAT[x.status] ? (
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${BULAT[x.status][0]}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{BULAT[x.status][1]}</svg>
                </span>
              ) : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-isi text-[18px] font-extrabold text-muted">–</span>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[15.5px] font-extrabold">{x.nama}</b>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold ${CHIP[x.status]}`}>{LABEL_STATUS[x.status]}</span>
                </div>
                {x.status !== 'mati' && (
                  <b className="mt-0.5 block font-display text-[20px] font-semibold text-[#1B2559] dark:text-ink">
                    {x.k === 'tungg' ? rp(x.nilai || 0) : x.k === 'arus' ? (x.selisih == null ? '—' : x.selisih >= 0 ? `Lebih ${rp(x.selisih)}` : `Kurang ${rp(-x.selisih)}`) : x.nilai}
                  </b>
                )}
                <span className="block text-[13.5px] font-semibold leading-relaxed text-muted">{x.status === 'mati' ? 'Dimatikan di Atur indikator.' : x.ket}</span>
              </div>
            </div>
            {x.k === 'cad' && info?.pengaturan && kes.rutin && x.status !== 'mati' && (
              <div className="mt-2.5 rounded-[14px] bg-isi px-3 py-1 text-[14px] font-semibold">
                <div className="flex justify-between gap-2 border-b-[1.5px] border-dashed border-line py-1.5"><span>Saldo kas</span><b>{rp(info.saldoKini)}</b></div>
                <div className="flex justify-between gap-2 border-b-2 border-line py-1.5">
                  <span>− Dana kegiatan belum dipakai{kes.danaTerikat.length > 0 && <span className="block text-[12.5px] text-muted">{kes.danaTerikat.map((t) => t.nama).join(', ')}</span>}</span>
                  <b className="text-danger">{rp(kes.totalTerikat)}</b>
                </div>
                <div className="flex justify-between gap-2 py-1.5 font-extrabold"><span>Kas bebas</span><span>{rp(kes.kasBebas)}</span></div>
                <div className="flex justify-between gap-2 pb-1.5 text-[13px] text-muted"><span>Biaya rutin per bulan{kes.rutinSumber === 'manual' ? ' (diisi sendiri)' : ' (rata-rata 3 bulan)'}</span><span>{rp(kes.rutin)}</span></div>
                {kes.rutinSumber === 'manual' && kes.aturan.rutinRincian && (
                  <ul className="mb-1.5 grid gap-0.5 border-l-[3px] border-line pl-2.5 text-[13px] text-muted">
                    {kes.aturan.rutinRincian.map((r, i) => (
                      <li key={i} className="flex justify-between gap-2"><span className="min-w-0 break-words">{r.nama}</span><span className="shrink-0">{rp(r.nominal)}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {x.k === 'proy' && kes.proyeksi.length > 0 && x.status !== 'mati' && (
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {kes.proyeksi.map((p) => (
                  <div key={p.bulan} className="rounded-[14px] bg-isi px-2 py-2 text-center">
                    <span className="block text-[12.5px] font-bold text-muted">{NAMA_BULAN[Number(p.bulan.slice(5)) - 1].slice(0, 3)}</span>
                    <b className={`block text-[14.5px] font-extrabold ${p.saldo < 0 ? 'text-danger' : ''}`}>{rpRingkas(p.saldo)}</b>
                    {p.besar.length > 0 && <span className="block text-[11.5px] font-bold text-warn-deep">{p.besar.map((b) => b.nama).join(', ')}</span>}
                  </div>
                ))}
              </div>
            )}
            {x.k === 'spp' && ['pantau', 'tindakan'].includes(x.status) && (
              <Tombol onClick={() => ganti({ jenis: 'spp' })}>Lihat siapa yang belum bayar</Tombol>
            )}
            {x.k === 'keg' && kes.nombok.length > 0 && x.status !== 'mati' && (
              <Tombol onClick={() => ganti({ jenis: 'keg', kunci: kes.nombok[0].kunci })}>Lihat {kes.nombok[0].nama}</Tombol>
            )}
          </div>
        ))}
        {d.bisaAtur && d.adaMenu('atur-indikator') && (
          <>
            <Tombol onClick={() => pergi('/guru/atur-indikator')}>
              <EmojiMenu id="indikator" size={26} latar={false} /> Atur indikator
            </Tombol>
            <p className="mt-1.5 text-center text-[13px] font-semibold text-muted">Target & indikator bisa disesuaikan dengan kondisi sekolah</p>
          </>
        )}
      </div>
    )
  }

  /* ============ SPP bulan ini ============ */
  if (j === 'spp') {
    const nominal = pengaturan.sppNominal
    const tgt = (s) => targetSpp(s, kini, nominal)
    const ditagih = siswa.filter((s) => tgt(s) > 0)
    const khusus = Object.keys(pengaturan.tarifSpp?.[pengaturan.tahunAjaran]?.kelas || {}).length > 0
    const belum = ditagih
      .map((s) => ({ s, d: s.spp?.[kini] || 0, t: tgt(s), st: statusList.find((x) => x.siswa.id === s.id) }))
      .filter((x) => x.d < x.t)
      .sort((a, b) => a.s.kelas.localeCompare(b.s.kelas) || a.s.nama.localeCompare(b.s.nama))
    const kelas = [...new Set(ditagih.map((s) => s.kelas))].sort()
    return (
      <div>
        <Kepala jenis="spp" judul={`SPP ${BULAN[kini]}`} sub={`${rp(nominal)} per siswa${khusus ? ' (ada tarif khusus kelas)' : ''} · ${ditagih.length} siswa`} />
        <span className="text-[14.5px] font-bold text-muted">Sudah masuk</span>
        <div className="flex flex-wrap items-baseline gap-x-2.5"><Angka>{rp(kes?.sppMasuk || 0)}</Angka><span className="text-[15px] font-semibold text-muted">dari {rp(kes?.sppTarget || 0)}</span></div>
        <div className="mt-2 h-[18px] overflow-hidden rounded-full bg-isi"><div className="h-full rounded-full bg-brand shadow-[inset_0_-4px_0_#2A55CC]" style={{ width: `${kes?.sppPersen || 0}%` }} /></div>
        <div className="mt-1.5 flex justify-between text-[14.5px] font-bold"><span className="text-brand">{kes?.sppPersen || 0}% masuk</span><span className="text-danger">Kurang {rp((kes?.sppTarget || 0) - (kes?.sppMasuk || 0))}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {kelas.map((k) => {
            const di = ditagih.filter((s) => s.kelas === k)
            const lunas = di.filter((s) => (s.spp?.[kini] || 0) >= tgt(s)).length
            return (
              <div key={k} className="rounded-[18px] bg-isi px-3.5 py-3">
                <b className="block text-[15px] font-extrabold">Kelas {k}</b>
                <span className="text-[14px] font-semibold text-muted">{lunas} dari {di.length} lunas</span>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-ok" style={{ width: `${di.length ? (lunas / di.length) * 100 : 0}%` }} /></div>
              </div>
            )
          })}
        </div>
        <Judul>Belum lunas · {belum.length} siswa</Judul>
        {belum.length === 0 && <p className="py-3 text-[15px] font-bold text-ok-deep">Semua siswa sudah lunas SPP {BULAN[kini]}.</p>}
        {belum.map(({ s, d: dibayar, t: target, st }) => {
          const lalu = st?.items.filter((i) => i.jenis === 'spp' && i.status === 'nunggak').map((i) => BULAN[i.indeks].slice(0, 3) + (i.ta ? ` ${taPendek(i.ta)}` : '')) || []
          return (
            <BarisSiswa key={s.id} s={s} kanan={rp(target - dibayar)}
              sub={[`Kelas ${s.kelas}`, dibayar > 0 && 'mencicil', lalu.length && `juga SPP ${lalu.join(', ')}`].filter(Boolean).join(' · ')}
              onClick={d.adaMenu('siswa') ? () => pergi(`/guru/siswa/${s.id}`) : undefined} />
          )
        })}
        {d.adaMenu('tagihan') && belum.length > 0 && (
          <Tombol utama onClick={() => pergi('/guru/tagihan?jenis=spp&status=belum-lunas')}>Buka Tagihan untuk mengingatkan orang tua</Tombol>
        )}
      </div>
    )
  }

  /* ============ uang masuk / keluar ============ */
  if (j === 'masuk' || j === 'keluar') {
    const masuk = j === 'masuk'
    const total = masuk ? lap.totalMasuk || 0 : lap.totalKeluar || 0
    const lalu = masuk ? d.arusLalu?.masuk : d.arusLalu?.keluar
    const per = [...((masuk ? lap.masukPerKategori : lap.keluarPerKategori) || [])].filter((k) => k.nominal > 0).sort((a, b) => b.nominal - a.nominal)
    const beda = lalu == null ? null : total - lalu
    return (
      <div>
        <Kepala jenis={j} judul={`Uang ${masuk ? 'masuk' : 'keluar'} ${namaBulan}`} sub={`1 – ${new Date().getDate()} ${namaBulan} ${new Date().getFullYear()}`} />
        <Angka>{rp(total)}</Angka>
        {beda != null && beda !== 0 && (
          <span className={`mt-1.5 inline-flex rounded-full px-3 py-1 text-[14px] font-extrabold ${(beda > 0) === masuk ? 'bg-ok-soft text-ok-deep' : 'bg-warn-soft text-warn-deep'}`}>
            {beda > 0 ? 'Naik' : 'Turun'} {rp(Math.abs(beda))} dari bulan lalu
          </span>
        )}
        <Judul>{masuk ? 'Dari mana saja' : 'Dipakai untuk apa'}</Judul>
        {per.length === 0 && <p className="py-3 text-[15px] font-semibold text-muted">Belum ada {masuk ? 'pemasukan' : 'pengeluaran'} bulan ini.</p>}
        <div className="mt-2">
          {per.map((k) => (
            <Batang key={k.kategori} label={k.kategori} nilai={k.nominal} total={total} warna={masuk ? undefined : 'bg-[#F27A2E] shadow-[inset_0_-3px_0_#CF5C14]'} />
          ))}
        </div>
        {d.adaMenu('laporan') && <Tombol onClick={() => pergi('/guru/laporan')}>Buka laporan lengkap</Tombol>}
      </div>
    )
  }

  /* ============ saldo & kas bebas ============ */
  if (j === 'saldo') {
    const ada = !!info?.pengaturan
    return (
      <div>
        <Kepala jenis="saldo" judul="Saldo kas sekolah" sub={`Per ${new Date().getDate()} ${namaBulan} ${new Date().getFullYear()}`} />
        <Angka>{rp(info?.saldoKini || 0)}</Angka>
        {!ada && <p className="mt-2 rounded-[16px] bg-warn-soft px-3.5 py-3 text-[14.5px] font-bold text-warn-deep">Saldo awal kas belum diisi, jadi angka ini belum lengkap. Isi di menu Kas sekolah.</p>}
        {ada && kes && (
          <>
            <p className="mt-1.5 text-[15.5px] font-semibold leading-relaxed">
              Yang benar-benar bebas dipakai: <b className="text-ok-deep">{rp(kes.kasBebas)}</b>
              {kes.rutin ? <> — cukup ±{desimal(Math.max(0, kes.bulanCukup))} bulan biaya rutin.</> : '.'}
            </p>
            <div className="mt-3 rounded-[18px] border-[1.5px] border-[#B9E8CB] bg-ok-soft px-4 py-1 text-[15px] font-semibold dark:border-ok/30">
              <div className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-[#B9E8CB] py-2.5 dark:border-ok/30"><span>Saldo kas</span><b>{rp(info.saldoKini)}</b></div>
              <div className="flex justify-between gap-3 border-b-2 border-[#8FD5AA] py-2.5 dark:border-ok/40">
                <span>− Dana kegiatan belum dipakai
                  {kes.danaTerikat.map((t) => <span key={t.nama} className="block text-[13px] text-muted">{t.nama} {rp(t.sisa)}</span>)}
                </span>
                <b className="text-danger">{rp(kes.totalTerikat)}</b>
              </div>
              <div className="flex justify-between gap-3 py-2.5 font-extrabold text-ok-deep"><span>Kas bebas</span><span>{rp(kes.kasBebas)}</span></div>
            </div>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-muted">Uang kegiatan yang sudah dipungut untuk acara yang belum berlangsung "sudah ada pemiliknya", jadi tidak dihitung untuk gaji atau biaya rutin.</p>
          </>
        )}
        {lap.saldoAwal != null && (
          <>
            <Judul>Perjalanan saldo {namaBulan}</Judul>
            <div className="rounded-[18px] border-[1.5px] border-[#F4E3A6] bg-[#FFFBEA] px-4 py-1 text-[15px] font-semibold dark:border-warn/30 dark:bg-white/5">
              <div className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-[#EADBA5] py-2.5 dark:border-white/10"><span>Saldo awal {namaBulan}</span><b>{rp(lap.saldoAwal)}</b></div>
              <div className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-[#EADBA5] py-2.5 dark:border-white/10"><span>+ Uang masuk</span><b className="text-ok-deep">{rp(lap.totalMasuk)}</b></div>
              <div className="flex justify-between gap-3 border-b-2 border-[#E0C979] py-2.5 dark:border-white/20"><span>− Uang keluar</span><b className="text-danger">{rp(lap.totalKeluar)}</b></div>
              <div className="flex justify-between gap-3 py-2.5 font-extrabold"><span>Saldo sekarang</span><span>{rp(lap.saldoAkhir)}</span></div>
            </div>
          </>
        )}
        {d.adaMenu('kas') && <Tombol onClick={() => pergi('/guru/kas')}>Buka Kas sekolah</Tombol>}
      </div>
    )
  }

  /* ============ tunggakan ============ */
  if (j === 'tunggak') {
    const saring = buka.saring
    const baris = statusList
      .map((x) => {
        const it = x.items.filter((i) => i.status === 'nunggak' && (!saring || i.jenis === saring))
        return { ...x, it, jml: it.reduce((t, i) => t + i.kurang, 0) }
      })
      .filter((x) => x.jml > 0)
      .sort((a, b) => b.jml - a.jml)
    const per = { spp: 0, kegiatan: 0, paket: 0 }
    baris.forEach((x) => x.it.forEach((i) => { per[i.jenis] += i.kurang }))
    const total = baris.reduce((t, x) => t + x.jml, 0)
    return (
      <div>
        <Kepala jenis="tunggak" judul={saring === 'paket' ? 'PMB / daftar ulang terlambat' : 'Tunggakan'} sub="Tagihan yang sudah lewat jatuh tempo" />
        <div className="flex flex-wrap items-baseline gap-x-2.5"><Angka merah={total > 0}>{rp(total)}</Angka><span className="text-[15px] font-semibold text-muted">dari {baris.length} anak</span></div>
        {!saring && (
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {[['SPP', per.spp], ['Kegiatan', per.kegiatan], ['PMB / DU', per.paket]].map(([l, n]) => (
              <div key={l} className="rounded-[16px] bg-isi px-2 py-2.5 text-center">
                <span className="block text-[13px] font-bold text-muted">{l}</span>
                <b className="text-[15px] font-extrabold">{rpRingkas(n)}</b>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 rounded-[16px] bg-brand-soft px-3.5 py-3 text-[14px] font-semibold leading-relaxed text-brand dark:text-ink">
          SPP {BULAN[kini]} belum dihitung tunggakan karena bulannya belum lewat. Kegiatan dihitung nunggak setelah tanggal kegiatannya lewat.
        </p>
        <Judul>{baris.length ? `Semua · ${baris.length} anak` : 'Tidak ada tunggakan'}</Judul>
        {baris.slice(0, 40).map((x) => (
          <BarisSiswa key={x.siswa.id} s={x.siswa} kanan={rp(x.jml)} sub={`Kelas ${x.siswa.kelas} · ${x.alasan}`}
            onClick={d.adaMenu('siswa') ? () => pergi(`/guru/siswa/${x.siswa.id}`) : undefined} />
        ))}
        {d.adaMenu('tagihan') && baris.length > 0 && <Tombol onClick={() => pergi('/guru/tagihan?status=nunggak')}>Buka Tagihan › Nunggak</Tombol>}
      </div>
    )
  }

  /* ============ satu kegiatan (nombok) ============ */
  if (j === 'keg') {
    const k = rekap.find((x) => x.kunci === buka.kunci)
    if (!k) return <p className="py-6 text-center text-muted">Kegiatan tidak ditemukan.</p>
    const kurang = k.belumBayar.reduce((t, s) => t + s.kurang, 0)
    return (
      <div>
        <Kepala jenis="keg" judul={k.sisa < 0 ? `${k.nama} nombok` : k.nama} sub={`${k.siswa} siswa · ${rp(k.nominal)} per siswa`} />
        <div className="rounded-[18px] bg-isi px-4 py-1 text-[15.5px] font-semibold">
          <div className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-line py-2.5"><span>Uang masuk ({k.lunas} dari {k.siswa} lunas)</span><b className="text-ok-deep">{rp(k.masuk)}</b></div>
          <div className="flex justify-between gap-3 border-b-2 border-line py-2.5"><span>Terpakai</span><b className="text-danger">{rp(k.terpakai)}</b></div>
          <div className={`flex justify-between gap-3 py-2.5 font-extrabold ${k.sisa < 0 ? 'text-danger' : 'text-ok-deep'}`}><span>{k.sisa < 0 ? 'Nombok' : 'Sisa'}</span><span>{rp(Math.abs(k.sisa))}</span></div>
        </div>
        {k.sisa < 0 && (
          <p className="mt-3 rounded-[16px] bg-brand-soft px-3.5 py-3 text-[14.5px] font-semibold leading-relaxed text-brand dark:text-ink">
            Kekurangan sementara ditutup kas sekolah.{kurang > 0 && <> <b>{k.belumBayar.length} siswa belum bayar ({rp(kurang)})</b> — kalau sudah lunas, kegiatan ini {k.sisa + kurang >= 0 ? <>jadi <b>sisa {rp(k.sisa + kurang)}</b></> : <>tinggal nombok {rp(-(k.sisa + kurang))}</>}.</>}
          </p>
        )}
        {k.perKategori.length > 0 && (
          <>
            <Judul>Pengeluaran per kategori</Judul>
            {k.perKategori.slice(0, 5).map((x) => (
              <div key={x.kategori} className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-line py-2.5 text-[15px] font-semibold last:border-b-0"><span>{x.kategori}</span><b>{rp(x.nominal)}</b></div>
            ))}
          </>
        )}
        {k.belumBayar.length > 0 && (
          <>
            <Judul>Belum lunas · {k.belumBayar.length} siswa</Judul>
            {k.belumBayar.slice(0, 20).map((b) => {
              const s = siswa.find((x) => x.nama === b.nama && x.kelas === b.kelas) || { nama: b.nama }
              return <BarisSiswa key={b.nama + b.kelas} s={s} kanan={rp(b.kurang)} sub={`Kelas ${b.kelas}${b.dibayar ? ' · mencicil' : ''}`} />
            })}
          </>
        )}
        {d.adaMenu('laporan') && <Tombol onClick={() => pergi('/guru/laporan?tab=kegiatan')}>Buka laporan kegiatan</Tombol>}
      </div>
    )
  }

  /* ============ pengeluaran tanpa nota ============ */
  if (j === 'nota') {
    return (
      <div>
        <Kepala jenis="nota" judul="Belum ada foto nota" sub={`${nota.tanpa.length} dari ${nota.total} pengeluaran ${namaBulan}`} />
        {nota.tanpa.length === 0 && <p className="py-3 text-[15px] font-bold text-ok-deep">Semua pengeluaran bulan ini sudah ada notanya.</p>}
        {nota.tanpa.map((k) => (
          <div key={k.id} className="flex justify-between gap-3 border-b-[1.5px] border-dashed border-line py-3 last:border-b-0">
            <span className="min-w-0">
              <b className="block break-words text-[15.5px] font-extrabold">{k.keterangan || k.kategori}</b>
              <span className="block text-[13.5px] font-semibold text-muted">{tglKas(k.tanggal)} · {k.kategori}{k.dicatatNama ? ` · dicatat ${k.dicatatNama}` : ''}</span>
            </span>
            <b className="shrink-0 text-[15px]">{rp(k.nominal)}</b>
          </div>
        ))}
        <p className="mt-3 rounded-[16px] bg-isi px-3.5 py-3 text-[14.5px] font-semibold leading-relaxed">Foto nota memudahkan laporan ke yayasan. Petugas TU bisa menambahkannya di menu Kas sekolah (ketuk transaksinya).</p>
        {d.adaMenu('kas') && <Tombol onClick={() => pergi('/guru/kas')}>Buka Kas sekolah</Tombol>}
      </div>
    )
  }
  return null
}

const rpRingkas = (n) => {
  const a = Math.abs(n)
  const t = a >= 1e6 ? `${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : a >= 1e3 ? `${Math.round(a / 1e3)} rb` : String(a)
  return `${n < 0 ? '−' : ''}Rp ${t}`
}
