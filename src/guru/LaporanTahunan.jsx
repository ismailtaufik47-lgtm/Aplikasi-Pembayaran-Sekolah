/**
 * Laporan › Tahunan (0043) — rekap & tutup buku satu tahun ajaran, tahun mana saja.
 * Angka dihitung database (laporan_tahunan) → data tahun lama tidak ditarik ke HP.
 * Kelas yang dipakai = kelas siswa SAAT tahun itu (siswa_tahun), bukan kelas sekarang.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Kosong } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { BULAN, rp, taPendek, tahunAjaranBerjalan } from '../lib/format.js'
import { FONT_EMOJI, emojiKegiatan } from '../lib/emojiKegiatan.js'
import { EMOJI_JENIS } from '../lib/paket.js'
import { LABEL_AKHIR } from './RiwayatKelas.jsx'
import {
  Banner, GrafikBatang, KartuJudul, KartuKpi, KepalaLaporan, Pilihan, SERI, TombolAksi, rpRingkas,
} from './GrafikLaporan.jsx'

const persen = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const tglPanjang = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export default function LaporanTahunan() {
  const { siswa, biaya, biayaLain, paket, pembayaran, pengaturan, toast, boleh } = useData()
  const nav = useNavigate()
  const demo = useRef({})
  demo.current = { siswa, biaya, biayaLain, paket, pembayaran, pengaturan } // hanya untuk mode demo
  const [daftar, setDaftar] = useState(null)
  const [ta, setTa] = useState(tahunAjaranBerjalan())
  const [lap, setLap] = useState(null)
  const [galat, setGalat] = useState('')
  const [unduh, setUnduh] = useState('')
  const [ttd, setTtd] = useState(true)

  useEffect(() => {
    let aktif = true
    api.daftarTahunAjaran(demo.current).then((d) => aktif && setDaftar(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [])
  useEffect(() => {
    let aktif = true
    setLap(null)
    setGalat('')
    api.laporanTahunan(ta, demo.current).then((d) => aktif && setLap(d)).catch((e) => aktif && setGalat(e.message))
    return () => { aktif = false }
  }, [ta])

  const sebelumnya = useMemo(() => (daftar || []).find((x) => x.kode < ta) || null, [daftar, ta])
  const banding = useMemo(() => [...(daftar || [])].reverse().slice(-5), [daftar])

  const ekspor = async (jenis) => {
    if (unduh || !lap) return
    setUnduh(jenis)
    try {
      const m = await import('../lib/exportTahunan.js')
      if (jenis === 'pdf') await m.unduhPdfTahunan({ lap, pengaturan, ttd, daftar })
      else await m.unduhExcelTahunan({ lap, pengaturan, daftar })
      toast(`Rekap ${lap.ta} diunduh`)
    } catch (e) {
      toast('Gagal membuat file: ' + e.message)
    } finally {
      setUnduh('')
    }
  }

  if (galat) return <div className="mt-4"><Banner nada="warn" e="⚠️">{galat}</Banner></div>

  const pilihan = (
    <Pilihan e="🎓" value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">
      {(daftar || [{ kode: ta }]).map((x) => <option key={x.kode} value={x.kode}>Tahun ajaran {x.kode}{x.berjalan ? ' (berjalan)' : ''}</option>)}
    </Pilihan>
  )

  return (
    <>
      <KepalaLaporan
        e="🎓"
        judul={`Rekap tahun ajaran ${ta}`}
        sub={lap ? `${tglPanjang(lap.mulai)} – ${tglPanjang(lap.berjalan ? lap.sampai : lap.selesai)}${lap.berjalan ? ' (berjalan)' : ''} · ${pengaturan.namaSekolah}` : 'Memuat…'}
        aksi={
          <>
            <TombolAksi utama ikon="📄" pendek="PDF" onClick={() => ekspor('pdf')} disabled={!lap || !!unduh}>{unduh === 'pdf' ? 'Membuat…' : 'Unduh PDF'}</TombolAksi>
            <TombolAksi ikon="📊" pendek="Excel" onClick={() => ekspor('excel')} disabled={!lap || !!unduh}>{unduh === 'excel' ? 'Membuat…' : 'Unduh Excel'}</TombolAksi>
          </>
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pilihan}
        <label className="flex cursor-pointer items-center gap-2 rounded-pill border-[1.5px] border-[#DCE6F4] bg-kartu px-3.5 py-2.5 text-[13px] font-bold dark:border-line">
          <input type="checkbox" className="h-4 w-4 accent-[#3B6EF6]" checked={ttd} onChange={(e) => setTtd(e.target.checked)} />
          Tanda tangan kepala sekolah di PDF
        </label>
      </div>

      {!lap ? (
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[132px] animate-pulse" />)}</div>
      ) : (
        <Isi lap={lap} sebelumnya={sebelumnya} banding={banding} nav={nav} boleh={boleh} />
      )}
    </>
  )
}

function Isi({ lap, sebelumnya, banding, nav, boleh }) {
  const s = lap.spp
  const tunggak = lap.tunggakan.spp + lap.tunggakan.kegiatan
  const naikSiswa = sebelumnya && sebelumnya.siswa ? lap.siswa.jumlah - sebelumnya.siswa : null
  const sppPersen = persen(s.masuk, s.target)
  const tarifKhusus = Object.entries(lap.tarif?.kelas || {})
  const akhir = Object.entries(lap.siswa.akhir || {}).filter(([k]) => k !== 'belum')
  const belumDiproses = lap.siswa.akhir?.belum || 0
  // buku kas baru mulai dicatat sesudah tahun ajaran ini selesai → bagian kas tidak berarti
  const kasAda = lap.kas && !(lap.kas.mulaiDicatat && lap.kas.mulaiDicatat > lap.selesai)

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KartuKpi warna="blue" e="🧒" label="Siswa terdaftar" nilai={`${lap.siswa.jumlah} siswa`}
          tren={naikSiswa === null ? null : { teks: `${Math.abs(naikSiswa)} dari ${sebelumnya.kode}`, arah: naikSiswa > 0 ? 'naik' : naikSiswa < 0 ? 'turun' : 'datar', baik: null }}
          kaki={[lap.siswa.masukTengah && `${lap.siswa.masukTengah} masuk tengah tahun`, lap.siswa.keluar && `${lap.siswa.keluar} keluar/pindah`].filter(Boolean).join(' · ') || `${lap.siswa.perKelas.length} kelas`} />
        <KartuKpi warna="green" e="📅" label="SPP terkumpul" nilai={rp(s.masuk)}
          tren={{ teks: `${sppPersen}% dari target setahun`, arah: 'datar', baik: sppPersen >= 100 ? true : null }}
          kaki={`Target ${rp(s.target)}`} />
        <KartuKpi warna={tunggak ? 'red' : 'green'} e="⏰" label={lap.berjalan ? 'Tunggakan tahun ini' : 'Sisa tunggakan'} nilai={rp(tunggak)}
          tren={{ teks: tunggak ? `${lap.tunggakan.siswa} siswa belum lunas` : 'Semua lunas', arah: 'datar', baik: tunggak ? false : true }}
          kaki={`SPP ${rp(lap.tunggakan.spp)} · kegiatan ${rp(lap.tunggakan.kegiatan)}`} />
        {kasAda ? (
          <KartuKpi warna="amber" e="🏦" label={lap.berjalan ? 'Saldo kas sekarang' : 'Saldo kas akhir tahun'} nilai={rp(lap.kas.saldoAkhir)}
            tren={{ teks: `${lap.kas.saldoAkhir >= lap.kas.saldoAwal ? '+' : '−'}${rp(Math.abs(lap.kas.saldoAkhir - lap.kas.saldoAwal))} sejak 1 Juli`, arah: lap.kas.saldoAkhir >= lap.kas.saldoAwal ? 'naik' : 'turun', baik: lap.kas.saldoAkhir >= lap.kas.saldoAwal }}
            kaki={`Saldo awal ${rp(lap.kas.saldoAwal)}`} />
        ) : (
          <KartuKpi warna="grey" e="🏦" label="Saldo kas" nilai="—"
            kaki={lap.kas ? `Buku kas baru dicatat mulai ${tglPanjang(lap.kas.mulaiDicatat)}` : 'Butuh hak akses laporan keuangan'} />
        )}
      </div>

      {lap.berjalan && <Banner e="ℹ️">Tahun ajaran masih berjalan — angka dihitung sampai hari ini. Tunggakan = bulan & kegiatan yang sudah jatuh tempo.</Banner>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <KartuJudul e="📊" judul="SPP per bulan" sub={`Target vs terkumpul · tarif standar ${rp(lap.tarif?.standar || 0)}${tarifKhusus.length ? ` · ${tarifKhusus.length} kelas tarif khusus` : ''}`}>
          <GrafikBatang
            data={s.perBulan.map((b) => ({ label: BULAN[b.i].slice(0, 3), judul: `${BULAN[b.i]} · ${b.lunas}/${b.ditagih} lunas`, nilai: [b.target, b.masuk] }))}
            seri={[{ nama: 'Target', warna: '#C7D4F0' }, { nama: 'Terkumpul', warna: SERI.spp }]}
          />
        </KartuJudul>

        <KartuJudul e="🏫" judul="Per kelas" sub="Kelas siswa pada tahun itu">
          <div className="-mx-1 divide-y divide-line">
            {s.perKelas.length === 0 && <p className="py-4 text-center text-[13px] text-muted">Belum ada siswa terdaftar.</p>}
            {s.perKelas.map((k) => (
              <div key={k.kelas} className="px-1 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="text-[14px] font-extrabold">Kelas {k.kelas}</b>
                  <span className="text-[12.5px] font-bold text-muted">{k.siswa} siswa · {rp(k.tarif)}/bln</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-isi">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${persen(k.masuk, k.target)}%` }} />
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[12px] font-semibold">
                  <span className="whitespace-nowrap text-muted">{rp(k.masuk)} dari {rp(k.target)}</span>
                  {k.tunggakan > 0 ? <span className="whitespace-nowrap text-danger">nunggak {rp(k.tunggakan)}</span> : <span className="whitespace-nowrap text-ok-deep">tidak ada tunggakan</span>}
                </div>
              </div>
            ))}
          </div>
        </KartuJudul>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <KartuJudul e="🎒" judul="Biaya kegiatan" sub={`${lap.kegiatan.length} kegiatan tahun ini`}>
          {lap.kegiatan.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">Tidak ada kegiatan.</p> : (
            <div className="space-y-3">
              {lap.kegiatan.map((k) => {
                const sisa = k.terpakai == null ? null : k.masuk - k.terpakai
                return (
                  <div key={k.id} className="flex items-center gap-2.5">
                    <GambarKegiatan emoji={emojiKegiatan(k)} size={36} className="rounded-[12px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <b className="truncate font-extrabold">{k.nama}</b>
                        <span className="shrink-0 font-bold">{rp(k.masuk)}</span>
                      </div>
                      <div className="text-[11.5px] font-semibold leading-snug text-muted">
                        {k.lunas}/{k.siswa} siswa lunas
                        {sisa != null && k.terpakai > 0 && <> · terpakai {rp(k.terpakai)} · <span className={sisa < 0 ? 'font-bold text-danger' : 'font-bold text-ok-deep'}>{sisa < 0 ? `nombok ${rp(-sisa)}` : `sisa ${rp(sisa)}`}</span></>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </KartuJudul>

        <KartuJudul e="🔁" judul="Akhir tahun" sub={lap.berjalan ? 'Rencana kenaikan kelas' : 'Hasil kenaikan kelas'}>
          <div className="grid grid-cols-2 gap-2">
            {[['naik', 'bg-brand-soft text-brand'], ['tinggal', 'bg-warn-soft text-warn-deep'], ['lulus', 'bg-ok-soft text-ok-deep'], ['keluar_pindah', 'bg-[#F1F2F6] text-muted dark:bg-white/10']].map(([k, w]) => {
              const n = k === 'keluar_pindah' ? (lap.siswa.akhir?.keluar || 0) + (lap.siswa.akhir?.pindah || 0) + (lap.siswa.akhir?.tidak_lanjut || 0) : lap.siswa.akhir?.[k] || 0
              return (
                <div key={k} className={`rounded-2xl px-3.5 py-2.5 ${w}`}>
                  <b className="block font-display text-[22px] font-bold leading-none">{n}</b>
                  <span className="text-[12px] font-extrabold">{k === 'keluar_pindah' ? 'Keluar / tidak lanjut' : LABEL_AKHIR[k]}</span>
                </div>
              )
            })}
          </div>
          {belumDiproses > 0 && (
            <p className="mt-3 text-[12px] font-semibold leading-snug text-muted">
              {belumDiproses} siswa {lap.berjalan ? 'belum diproses kenaikan kelasnya' : 'dibawa otomatis ke tahun berikutnya'}{akhir.length ? '' : '.'}
            </p>
          )}
          {lap.paket.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              {lap.paket.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 text-[13px]">
                  <span className="text-[18px]" style={FONT_EMOJI}>{EMOJI_JENIS[p.jenis]}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{p.nama}</span>
                  <span className="shrink-0 font-bold">{persen(p.masuk, p.target)}%</span>
                </div>
              ))}
            </div>
          )}
        </KartuJudul>

        <KartuJudul e="📈" judul="Antar tahun ajaran" sub="SPP terkumpul vs target" className="lg:col-span-2 xl:col-span-1">
          {banding.length < 2 ? (
            <p className="py-6 text-center text-[13px] font-semibold leading-snug text-muted">Perbandingan muncul setelah ada data lebih dari satu tahun ajaran.</p>
          ) : (
            <GrafikBatang
              tinggi={150}
              data={banding.map((x) => ({ label: taPendek(x.kode), judul: `${x.kode} · ${x.siswa} siswa`, nilai: [x.sppTarget, x.sppMasuk] }))}
              seri={[{ nama: 'Target', warna: '#C7D4F0' }, { nama: 'Terkumpul', warna: SERI.spp }]}
            />
          )}
        </KartuJudul>
      </div>

      {kasAda && (
        <KartuJudul e="🏦" judul="Buku kas Juli – Juni" sub={`Saldo awal ${rp(lap.kas.saldoAwal)} → ${lap.berjalan ? 'sekarang' : 'akhir'} ${rp(lap.kas.saldoAkhir)}`} className="mt-4"
          kanan={<span className="text-[12.5px] font-bold"><span className="text-ok-deep">+{rpRingkas(lap.kas.masuk)}</span> · <span className="text-danger">−{rpRingkas(lap.kas.keluar)}</span></span>}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <GrafikBatang
              tinggi={150}
              data={lap.kas.perBulan.map((b) => ({ label: BULAN[(Number(b.bulan.slice(5)) + 5) % 12].slice(0, 3), judul: b.bulan, nilai: [b.masuk, b.keluar] }))}
              seri={[{ nama: 'Masuk', warna: SERI.masuk }, { nama: 'Keluar', warna: '#F97362' }]}
            />
            <div>
              <div className="mb-1.5 text-[12px] font-extrabold uppercase tracking-wide text-muted">Pengeluaran terbesar</div>
              {lap.kas.keluarPerKategori.slice(0, 5).map((k) => (
                <div key={k.kategori} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-b-0">
                  <span className="truncate font-semibold">{k.kategori}</span>
                  <b className="shrink-0">{rp(k.nominal)}</b>
                </div>
              ))}
              {lap.kas.keluarPerKategori.length === 0 && <p className="text-[13px] text-muted">Belum ada pengeluaran.</p>}
            </div>
          </div>
        </KartuJudul>
      )}

      <div className="seghead"><h2>Masih menunggak</h2><span className="text-[12px] font-bold text-muted">{lap.tunggakan.siswa} siswa · {rp(tunggak)}</span></div>
      {lap.tunggakan.daftar.length === 0 ? (
        <Kosong>Tidak ada tunggakan di tahun ajaran {lap.ta}. 🎉</Kosong>
      ) : (
        <div className="card !px-3 !py-1 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:!px-5">
          {lap.tunggakan.daftar.map((x) => {
            const nonaktif = x.status !== 'aktif'
            return (
              <button key={x.id} type="button" disabled={nonaktif || !boleh('siswa', 'lihat')} onClick={() => nav(`/guru/siswa/${x.id}`)}
                className="flex w-full items-center gap-3 border-b border-dashed border-line py-2.5 text-left last:border-b-0 disabled:cursor-default lg:[&:nth-last-child(2)]:border-b-0">
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-extrabold">{x.nama}</b>
                  <span className="block truncate text-[12px] font-semibold text-muted">
                    Kelas {x.kelas}{x.spp ? ` · SPP ${rp(x.spp)}` : ''}{x.kegiatan ? ` · kegiatan ${rp(x.kegiatan)}` : ''}
                  </span>
                </span>
                {nonaktif && <Chip warna="grey">{x.status === 'alumni' ? 'Alumni' : 'Keluar'}</Chip>}
                <b className="shrink-0 text-[14px] text-danger">{rp(x.spp + x.kegiatan)}</b>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
