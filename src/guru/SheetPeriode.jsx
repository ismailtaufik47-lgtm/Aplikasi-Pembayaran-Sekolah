/**
 * Dibuka dari satu kartu bulan/kegiatan di kartu pembayaran siswa.
 * Menunjukkan progres pembayaran periode itu, daftar transaksinya
 * (karena satu periode boleh dicicil lewat beberapa transaksi), dan
 * form untuk menambah pembayaran baru — bisa penuh atau sebagian.
 *
 * Tombol "Catat pembayaran" & "Batalkan" mengikuti hak akses akun
 * (fitur pembayaran & batal). `readOnly` memaksa hanya-lihat.
 */
import { useEffect, useState } from 'react'
import { Ikon, Kosong, Sheet, Track } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import FormBatal from './FormBatal.jsx'
import { useData } from '../lib/store.jsx'
import { BULAN, bulanBerjalan, dibayarKegiatan, dibayarSpp, persenBayar, rp, statusSpp, tanggalISO } from '../lib/format.js'
import { alokasiCicilan, dibayarPaket, keteranganPaket, statusPaket, tahapPaket, tglPendek } from '../lib/paket.js'

/**
 * jenis 'spp' (indeks = bulan), 'kegiatan' (indeks = urutan biaya), atau
 * 'paket' (PMB / daftar ulang; indeks = id paket — tampil jadwal cicilan & rincian).
 */
export default function SheetPeriode({ buka, tutup, siswaId, jenis, indeks, readOnly = false }) {
  const { siswa, biaya, paket, pengaturan, pembayaran, catatPembayaran, batalkanPembayaran, toast, boleh, cegahKunci } = useData()
  const bisaCatat = !readOnly && boleh('pembayaran')
  const bisaBatal = boleh('batal')
  const [mode, setMode] = useState('lihat') // 'lihat' | 'bayar' | 'sukses'
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState('Tunai')
  const [tanggal, setTanggal] = useState(tanggalISO())
  const [hapusId, setHapusId] = useState(null)
  const [sibuk, setSibuk] = useState(false)
  const [sibukBatal, setSibukBatal] = useState(false)
  const [sukses, setSukses] = useState(null) // { nominal, lunasSetelah } | null

  useEffect(() => {
    if (!buka) return
    setMode('lihat')
    setMetode('Tunai')
    setTanggal(tanggalISO())
    setHapusId(null)
    setSukses(null)
  }, [buka, siswaId, jenis, indeks])

  const s = siswa.find((x) => x.id === siswaId)
  if (!buka || !s || jenis == null || indeks == null) return null

  const pk = jenis === 'paket' ? paket.find((p) => p.id === indeks) : null
  if (jenis === 'paket' && !pk) return null
  const judul = jenis === 'spp' ? BULAN[indeks] : pk ? pk.nama : biaya[indeks]?.nama || ''
  const target = jenis === 'spp' ? pengaturan.sppNominal : pk ? pk.total : biaya[indeks]?.nominal || 0
  const dibayar = jenis === 'spp' ? dibayarSpp(s, indeks) : pk ? dibayarPaket(s, pk.id) : dibayarKegiatan(s, indeks)
  const sisa = Math.max(0, target - dibayar)
  const lunas = dibayar >= target
  const status = jenis === 'spp'
    ? statusSpp(dibayar, target, indeks, bulanBerjalan(), pengaturan.tanggalJatuhTempo)
    : pk ? { lunas: 'lunas', terlambat: 'nunggak', mencicil: 'sebagian', belum: 'belum-bayar' }[statusPaket(pk, dibayar)]
    : (lunas ? 'lunas' : dibayar > 0 ? 'sebagian' : 'belum-bayar')
  const warnaStatus = { lunas: '#22C55E', sebagian: '#F5A524', nunggak: '#EF4444', 'belum-bayar': '#F5A524', menunggu: '#C9D0DC' }[status]
  const tahap = pk ? tahapPaket(pk, dibayar) : []
  const alokasi = pk && mode === 'bayar' ? alokasiCicilan(pk, dibayar, nominal) : []
  const transaksi = pembayaran.filter((p) => p.siswaId === siswaId && p.jenis === jenis && p.indeks === indeks)
  const nominalAngka = Number(nominal) || 0
  const lebihBayar = nominalAngka > sisa && sisa > 0

  const bukaFormBayar = () => {
    if (cegahKunci('bayar')) return
    // paket: usulkan kekurangan tahap terdekat (bayar bebas, boleh diubah)
    const t = pk ? tahap.find((x) => !x.lunas) : null
    setNominal(t ? t.kurang : sisa || target)
    setMode('bayar')
  }

  const simpanBayar = async () => {
    const n = Number(nominal) || 0
    if (n <= 0) return toast('Isi nominal dulu')
    setSibuk(true)
    try {
      await catatPembayaran({ siswaId, jenis, indeks, nominal: n, metode, tanggal })
      setSukses({ nominal: n, lunasSetelah: n >= sisa })
      setMode('sukses')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibuk(false)
    }
  }

  const mintaBatal = (id) => {
    if (cegahKunci('batal')) return
    setHapusId(id)
  }

  const batalkanTransaksi = async (id, alasan) => {
    setSibukBatal(true)
    try {
      await batalkanPembayaran(id, alasan)
      setHapusId(null)
      toast('Pembayaran dibatalkan')
    } catch {
      /* pesan galat sudah ditangani store */
    } finally {
      setSibukBatal(false)
    }
  }

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul={mode === 'bayar' ? 'Catat pembayaran' : mode === 'sukses' ? undefined : jenis === 'spp' ? 'SPP ' + judul : judul}
      lead={mode === 'bayar' ? `${s.nama} · sisa ${rp(sisa)}` : mode === 'sukses' ? undefined : s.nama}
    >
      {mode === 'sukses' ? (
        <div className="pb-1 pt-3.5 text-center">
          <div className="mx-auto mb-3.5 grid h-[76px] w-[76px] animate-pop place-items-center rounded-full bg-ok text-white" style={{ colorScheme: 'light' }}>
            <Ikon.cek size={34} />
          </div>
          <h3 className="text-[18px] font-extrabold">
            {sukses?.lunasSetelah ? (jenis === 'spp' ? `SPP ${judul}` : judul) + ' lunas' : pk ? 'Cicilan tersimpan' : 'Pembayaran sebagian tersimpan'}
          </h3>
          <p className="mb-5 mt-1 text-[13.5px] text-muted">
            {s.nama}
            <br />
            <b className="text-[16px] text-ink">{rp(sukses?.nominal || 0)}</b> · {metode}
            {!sukses?.lunasSetelah && (
              <>
                <br />
                Sisa {rp(Math.max(0, sisa - (sukses?.nominal || 0)))}
              </>
            )}
          </p>
          <button className="bigbtn" onClick={tutup}>Selesai</button>
        </div>
      ) : mode === 'lihat' ? (
        <>
          <div className="mb-5 rounded-2xl bg-canvas p-4">
            <div className="flex items-center justify-between text-[13px] font-bold">
              <span>{rp(dibayar)} dibayar</span>
              <span className="text-muted">dari {rp(target)}</span>
            </div>
            <div className="mt-2.5">
              <Track
                persen={persenBayar(dibayar, target)}
                warna={warnaStatus}
                tinggi={8}
              />
            </div>
            {!lunas && (
              <div className="mt-2.5 text-[13px] font-bold" style={{ color: status === 'menunggu' ? '#8A93A6' : warnaStatus }}>
                Sisa {rp(sisa)}{pk ? ` · ${keteranganPaket(pk, dibayar)}` : ''}
              </div>
            )}
          </div>

          {pk && tahap.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[13px] font-bold text-muted">Jadwal cicilan</div>
              <div className="card !py-1.5">
                {tahap.map((t, i) => (
                  <div key={i} className="row items-center">
                    <span className={`permen permen-kecil grid h-9 w-9 shrink-0 place-items-center rounded-[12px] font-display text-[15px] font-bold ${
                      t.lunas ? 'permen-tosca' : t.lewat ? 'permen-pink' : t.terisi > 0 ? 'permen-kuning' : 'permen-abu'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px] font-extrabold">{t.nama} · {tglPendek(t.jatuhTempo, true)}</b>
                      <span className="block text-[12px] font-semibold text-muted">
                        {t.lunas ? `${rp(t.nominal)} · lunas` : t.terisi > 0 ? `Kurang ${rp(t.kurang)} dari ${rp(t.nominal)}` : rp(t.nominal)}
                      </span>
                    </span>
                    <span className={`chip ${t.lunas ? 'bg-ok-soft text-ok-deep' : t.lewat ? 'bg-danger-soft text-danger' : 'bg-[#F1F2F6] text-muted dark:bg-white/10'}`}>
                      {t.lunas ? 'Lunas' : t.lewat ? 'Terlambat' : 'Akan datang'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bisaCatat && !lunas && (
            <button className="bigbtn mb-5" onClick={bukaFormBayar}>
              {pk ? 'Catat cicilan' : dibayar > 0 ? 'Lanjutkan bayar sisa' : 'Catat pembayaran'}
            </button>
          )}

          <div className="mb-2 text-[13px] font-bold text-muted">Riwayat transaksi</div>
          {transaksi.length === 0 ? (
            <Kosong>Belum ada pembayaran tercatat untuk ini.</Kosong>
          ) : (
            <div className="card">
              {transaksi.map((t) => (
                <div key={t.id}>
                  {hapusId === t.id ? (
                    <div className="py-2">
                      <FormBatal
                        nominal={t.nominal}
                        sibuk={sibukBatal}
                        onKirim={(alasan) => batalkanTransaksi(t.id, alasan)}
                        onBatal={() => setHapusId(null)}
                      />
                    </div>
                  ) : (
                    <div className="row">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok text-white" style={{ colorScheme: 'light' }}>
                        <Ikon.cek size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold">{rp(t.nominal)}</span>
                        <span className="block text-xs text-muted">{t.waktu} · {t.metode}</span>
                      </span>
                      {bisaBatal && (
                        <button
                          className="shrink-0 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-bold text-danger"
                          onClick={() => mintaBatal(t.id)}
                        >
                          Batalkan
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {pk && (
            <details className="mt-5 rounded-2xl bg-canvas px-4 py-1">
              <summary className="cursor-pointer py-2.5 text-[13px] font-extrabold">Rincian biaya ({pk.rincian.length})</summary>
              {pk.rincian.map((r, i) => (
                <div key={i} className="flex justify-between gap-3 border-t border-dashed border-line py-2 text-[13px] font-semibold">
                  <span className="text-muted">{r.nama}</span>
                  <b>{rp(r.nominal)}</b>
                </div>
              ))}
              <div className="flex justify-between border-t border-line py-2.5 text-[13.5px] font-extrabold">
                <span>Total</span>
                <span>{rp(pk.total)}</span>
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          <label className="mb-1.5 block text-[13px] font-bold">Jumlah dibayar</label>
          <InputNominal className="mb-1.5" value={nominal} onChange={setNominal} placeholder={String(sisa || target)} />
          {pk && <PilihanCepat pk={pk} dibayar={dibayar} atur={setNominal} />}
          {alokasi.length > 0 && (
            <div className="mb-3 rounded-2xl bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-brand">
              <b className="mb-0.5 block font-extrabold">Masuk ke</b>
              {alokasi.map((a, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span>{a.nama}{a.nama !== 'Kelebihan' && (a.lunasSetelah ? ' → lunas' : ` · sisa ${rp(a.kurangSetelah)}`)}</span>
                  <b>{rp(a.isi)}</b>
                </div>
              ))}
            </div>
          )}
          {lebihBayar ? (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-xs font-semibold text-warn-deep">
              <Ikon.peringatan size={15} />
              <span>
                Nominal ini {rp(nominalAngka - sisa)} lebih besar dari sisa tagihan ({rp(sisa)}).
                Tetap bisa disimpan sebagai kelebihan bayar — periksa lagi sebelum lanjut.
              </span>
            </p>
          ) : (
            <p className="mb-4 text-xs font-semibold text-muted">
              Sisa tagihan {rp(sisa)}. Boleh diisi kurang dari itu untuk bayar sebagian.
            </p>
          )}

          <label className="mb-1.5 block text-[13px] font-bold">Metode pembayaran</label>
          <div className="mb-4 flex gap-2.5">
            <Pilih on={metode === 'Tunai'} onClick={() => setMetode('Tunai')}>Tunai</Pilih>
            <Pilih on={metode === 'Transfer'} onClick={() => setMetode('Transfer')}>Transfer</Pilih>
            <Pilih on={metode === 'Tabungan'} onClick={() => setMetode('Tabungan')} sub="dari tabungan">Tabungan</Pilih>
          </div>

          <label className="mb-1.5 block text-[13px] font-bold">Tanggal pembayaran</label>
          <input
            type="date"
            className="field-input mb-1.5"
            value={tanggal}
            max={tanggalISO()}
            onChange={(e) => setTanggal(e.target.value)}
          />
          {tanggal !== tanggalISO() ? (
            <p className="mb-4 text-xs font-semibold text-muted">
              Dicatat mundur — tanggal transaksi disimpan sesuai tanggal ini, bukan hari ini.
            </p>
          ) : (
            <div className="mb-4" />
          )}

          <button className="bigbtn disabled:opacity-60" onClick={simpanBayar} disabled={sibuk}>
            {sibuk ? 'Menyimpan…' : lebihBayar ? 'Simpan meski lebih besar dari sisa' : 'Simpan pembayaran'}
          </button>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={() => setMode('lihat')}>Batal</button>
        </>
      )}
    </Sheet>
  )
}

/** Tombol nominal cepat untuk cicilan paket: kurang tahap terdekat & lunasi semua. */
function PilihanCepat({ pk, dibayar, atur }) {
  const sisa = pk.total - dibayar
  if (sisa <= 0) return null
  const tahap = tahapPaket(pk, dibayar)
  const t = tahap.find((x) => !x.lunas)
  const opsi = []
  if (t && t.kurang < sisa) opsi.push([`${t.nama} · ${rp(t.kurang)}`, t.kurang])
  opsi.push([`Lunasi · ${rp(sisa)}`, sisa])
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {opsi.map(([label, n]) => (
        <button key={label} type="button" onClick={() => atur(n)} className="tombol-putih rounded-pill px-3 py-1.5 text-[12px] font-extrabold">
          {label}
        </button>
      ))}
    </div>
  )
}

/** Pilihan metode bayar (Tunai · Transfer · Tabungan). */
const Pilih = ({ on, sub, children, ...p }) => (
  <button
    type="button"
    {...p}
    aria-pressed={on}
    className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[14px] px-1 py-2.5 text-[13.5px] font-extrabold leading-tight ${
      on ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-muted dark:border-line'
    }`}
  >
    {children}
    {sub && <span className="mt-0.5 text-[10.5px] font-bold opacity-80">{sub}</span>}
  </button>
)
