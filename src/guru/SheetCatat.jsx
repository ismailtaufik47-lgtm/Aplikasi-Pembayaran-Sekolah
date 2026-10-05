import { useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { Chevron, Chip, Ikon, KolomCari, Sheet } from '../components/ui.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { emojiKegiatan } from '../lib/emojiKegiatan.js'
import { BULAN, bulanBerjalan, bulanTertunggak, dibayarKegiatan, dibayarSpp, rp, tanggalISO, tanggalPanjang } from '../lib/format.js'
import { alokasiCicilan, dibayarPaket, keteranganPaket, tahapPaket, urutPaket } from '../lib/paket.js'

/**
 * Catat pembayaran dari tombol "Bayar" (tengah bawah) / Catat pembayaran.
 * Jenis: SPP · Kegiatan · PMB · Daftar ulang. Untuk PMB/DU, `indeks` = id
 * paket dan nominal bebas (cicilan) — pratinjau menunjukkan tahap yang terisi.
 */
export default function SheetCatat({ buka, awal, tutup }) {
  const { siswa, biaya, paket, pengaturan, catatPembayaran, toast, cegahKunci } = useData()
  const kini = bulanBerjalan()
  const [siswaId, setSiswaId] = useState(siswa[0]?.id)
  const [jenis, setJenis] = useState('spp') // spp | kegiatan | pmb | du
  const [indeks, setIndeks] = useState(kini) // bulan · urutan kegiatan · id paket
  const [nominal, setNominal] = useState(pengaturan.sppNominal)
  const [metode, setMetode] = useState('Tunai')
  const [tanggal, setTanggal] = useState(tanggalISO())
  const [sukses, setSukses] = useState(null)
  const [pilihSiswa, setPilihSiswa] = useState(false) // lembar pilih siswa

  /** Sisa tagihan untuk kombinasi siswa+jenis+periode saat ini — dipakai
   *  sebagai nominal default, supaya cicilan yang sudah berjalan tidak
   *  tertagih dobel kalau guru asal isi nominal penuh lagi. */
  const paketUntuk = (idSiswa, j) => paket.filter((p) => p.jenis === j && p.siswaIds.includes(idSiswa)).sort(urutPaket)
  const sisaUntuk = (idSiswa, j, i) => {
    const x = siswa.find((y) => y.id === idSiswa)
    if (j === 'pmb' || j === 'du') {
      const p = paket.find((k) => k.id === i)
      if (!p || !x) return 0
      const t = tahapPaket(p, dibayarPaket(x, p.id)).find((k) => !k.lunas)
      return t ? t.kurang : Math.max(0, p.total - dibayarPaket(x, p.id))
    }
    const target = j === 'spp' ? pengaturan.sppNominal : biaya[i]?.nominal || 0
    if (!x) return target
    const dibayar = j === 'spp' ? dibayarSpp(x, i) : dibayarKegiatan(x, i)
    return Math.max(0, target - dibayar)
  }
  /** Indeks awal tiap jenis: bulan berjalan, kegiatan pertama, atau paket terbaru siswa itu. */
  const indeksAwal = (idSiswa, j) => (j === 'spp' ? kini : j === 'kegiatan' ? 0 : paketUntuk(idSiswa, j)[0]?.id || null)

  useEffect(() => {
    if (!buka) return
    // Tanpa siswa terpilih (dari tombol Transaksi) → langsung buka pilihan siswa,
    // supaya tidak salah mencatat ke siswa pertama di daftar.
    const idAwal = awal?.siswaId || null
    setSiswaId(idAwal)
    setPilihSiswa(!idAwal && siswa.length > 0)
    const jAwal = ['spp', 'kegiatan', 'pmb', 'du'].includes(awal?.jenis) ? awal.jenis : 'spp'
    const iAwal = awal?.indeks ?? indeksAwal(idAwal, jAwal)
    setJenis(jAwal)
    setIndeks(iAwal)
    setNominal(isiAwal(idAwal, jAwal, iAwal))
    setMetode('Tunai')
    setTanggal(tanggalISO())
    setSukses(null)
  }, [buka, awal])

  const isiAwal = (id, j, i) => {
    const sisa = sisaUntuk(id, j, i)
    if (j === 'pmb' || j === 'du') return sisa || ''
    return sisa || (j === 'spp' ? pengaturan.sppNominal : biaya[i]?.nominal || 0)
  }
  const gantiSiswa = (id) => {
    setSiswaId(id)
    const i = jenis === 'pmb' || jenis === 'du' ? indeksAwal(id, jenis) : indeks
    setIndeks(i)
    setNominal(isiAwal(id, jenis, i))
  }
  const gantiJenis = (j) => {
    const i = indeksAwal(siswaId, j)
    setJenis(j)
    setIndeks(i)
    setNominal(isiAwal(siswaId, j, i))
  }
  const gantiIndeks = (i) => {
    setIndeks(i)
    setNominal(isiAwal(siswaId, jenis, i))
  }

  const s = siswa.find((x) => x.id === siswaId)
  const modePaket = jenis === 'pmb' || jenis === 'du'
  const pilihanPaket = modePaket ? paketUntuk(siswaId, jenis) : []
  const pk = modePaket ? pilihanPaket.find((p) => p.id === indeks) || null : null
  const target = jenis === 'spp' ? pengaturan.sppNominal : modePaket ? pk?.total || 0 : biaya[indeks]?.nominal || 0
  const dibayarSaatIni = s ? (jenis === 'spp' ? dibayarSpp(s, indeks) : modePaket ? (pk ? dibayarPaket(s, pk.id) : 0) : dibayarKegiatan(s, indeks)) : 0
  const sisaSaatIni = Math.max(0, target - dibayarSaatIni)
  const alokasi = pk ? alokasiCicilan(pk, dibayarSaatIni, nominal) : []

  const simpan = async () => {
    if (cegahKunci('bayar')) return
    if (!s) {
      setPilihSiswa(true)
      return toast('Pilih siswa dulu')
    }
    const n = Number(nominal) || 0
    if (modePaket && !pk) return toast(`${s?.nama || 'Siswa ini'} tidak ditagih ${jenis === 'pmb' ? 'PMB' : 'daftar ulang'}`)
    if (n <= 0) return toast('Isi nominal dulu')
    try {
      const baris = await catatPembayaran({
        siswaId, jenis: modePaket ? 'paket' : jenis, indeks: modePaket ? pk.id : Number(indeks), nominal: n, metode, tanggal,
      })
      setSukses({ ...baris, lunasSetelah: dibayarSaatIni + n >= target, sisaSetelah: Math.max(0, target - dibayarSaatIni - n) })
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  /** Kirim ringkasan pembayaran ke WhatsApp orang tua (sebelumnya tombol ini hanya menampilkan pesan). */
  const kirimBukti = () => {
    const nomor = (s?.hp || '').replace(/[^0-9]/g, '').replace(/^0/, '62')
    if (!nomor) return toast('Nomor HP orang tua belum diisi di data siswa')
    const teks =
      `Assalamu'alaikum ${s.wali || 'Bapak/Ibu'} 🙏\n\n` +
      `Pembayaran *${sukses.ket}* untuk ananda *${s.nama}* sebesar *${rp(sukses.nominal)}* (${sukses.metode}) ` +
      `sudah kami terima pada ${tanggalPanjang(new Date(sukses.tanggal))}.` +
      (sukses.lunasSetelah ? ' Status: *lunas*.' : ` Sisa ${rp(sukses.sisaSetelah)}.`) +
      `\n\nKuitansi ber-QR bisa dilihat & diunduh di portal orang tua (menu Riwayat). Terima kasih 😊\n— ${pengaturan.namaSekolah}`
    window.open(`https://wa.me/${nomor}?text=${encodeURIComponent(teks)}`, '_blank')
    tutup()
  }

  if (sukses) {
    return (
      <Sheet buka={buka} tutup={tutup}>
        <div className="pb-1 pt-3.5 text-center">
          <div className="mx-auto mb-3.5 grid h-[76px] w-[76px] animate-pop place-items-center rounded-full bg-ok text-white" style={{ colorScheme: 'light' }}>
            <Ikon.cek size={34} />
          </div>
          <h3 className="text-[18px] font-extrabold">
            {sukses.lunasSetelah ? 'Pembayaran tersimpan · lunas' : sukses.jenis === 'paket' ? 'Cicilan tersimpan' : 'Pembayaran sebagian tersimpan'}
          </h3>
          <p className="mb-5 mt-1 text-[13.5px] text-muted">
            {s?.nama} · {sukses.ket}
            <br />
            <b className="text-[16px] text-ink">{rp(sukses.nominal)}</b> · {sukses.metode}
          </p>
          <button className="bigbtn-wa flex items-center justify-center gap-2" onClick={kirimBukti}>
            Kirim bukti ke orang tua (WhatsApp)
          </button>
          <div className="h-2.5" />
          <button className="bigbtn-ghost" onClick={tutup}>Selesai</button>
        </div>
      </Sheet>
    )
  }

  return (
    <>
    <Sheet buka={buka && !pilihSiswa} tutup={tutup} judul="Catat pembayaran" lead="Pilih siswa dan jenis biayanya.">
      <label className="mb-1.5 block text-[13px] font-bold">Siswa</label>
      <button
        type="button"
        onClick={() => setPilihSiswa(true)}
        className={`mb-3.5 flex w-full items-center gap-3 rounded-[16px] border-[1.5px] bg-kartu px-3 py-2.5 text-left transition hover:border-brand/50 ${s ? 'border-[#DCE6F4] dark:border-line' : 'border-dashed border-brand/60'}`}
      >
        {s ? (
          <>
            <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={40} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px] font-extrabold">{s.nama}</b>
              <span className="block truncate text-[12px] font-semibold text-muted">Kelas {s.kelas}{s.nis ? ` · NIS ${s.nis}` : ''}</span>
            </span>
            <span className="shrink-0 text-[12.5px] font-extrabold text-brand">Ganti</span>
          </>
        ) : (
          <>
            <span className="permen permen-kecil permen-biru grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"><Ikon.cari size={19} /></span>
            <span className="min-w-0 flex-1 text-[14px] font-extrabold text-brand">Pilih siswa…</span>
            <Chevron />
          </>
        )}
      </button>

      <label className="mb-1.5 block text-[13px] font-bold">Jenis biaya</label>
      <div className={`mb-3.5 grid gap-2 ${paket.length ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <Pilih on={jenis === 'spp'} onClick={() => gantiJenis('spp')}>SPP</Pilih>
        <Pilih on={jenis === 'kegiatan'} onClick={() => gantiJenis('kegiatan')}>Kegiatan</Pilih>
        {paket.length > 0 && (
          <>
            <Pilih on={jenis === 'pmb'} warna="pink" redup={!paketUntuk(siswaId, 'pmb').length} onClick={() => gantiJenis('pmb')}>PMB</Pilih>
            <Pilih on={jenis === 'du'} warna="ungu" redup={!paketUntuk(siswaId, 'du').length} onClick={() => gantiJenis('du')}>Daftar ulang</Pilih>
          </>
        )}
      </div>

      {modePaket ? (
        pk ? (
          <>
            {pilihanPaket.length > 1 && (
              <select className="field-input mb-2.5" value={pk.id} onChange={(e) => gantiIndeks(e.target.value)}>
                {pilihanPaket.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
            )}
            <div className={`mb-3.5 flex items-center gap-3 rounded-2xl px-3.5 py-3 ${jenis === 'pmb' ? 'bg-rose-soft text-[#86154A] dark:text-[#FFC2DB]' : 'bg-grape-soft text-[#43238F] dark:text-[#D8CAFF]'}`}>
              <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug">
                <b className="block text-[13.5px] font-extrabold">{pk.nama} · sisa {rp(sisaSaatIni)}</b>
                {keteranganPaket(pk, dibayarSaatIni)}
              </span>
            </div>
          </>
        ) : (
          <p className="mb-3.5 rounded-2xl bg-canvas px-3.5 py-3 text-[12.5px] font-semibold text-muted">
            {s?.nama} tidak ditagih {jenis === 'pmb' ? 'PMB' : 'daftar ulang'}. Tambahkan siswa ini di Jenis biaya › PMB &amp; Daftar ulang kalau memang perlu.
          </p>
        )
      ) : (
        <>
          <label className="mb-1.5 block text-[13px] font-bold">{jenis === 'spp' ? 'Bulan' : 'Kegiatan'}</label>
          {jenis === 'spp' ? (
            <div className="mb-3.5 grid grid-cols-4 gap-1.5" role="group" aria-label="Pilih bulan">
              {BULAN.map((b, i) => {
                const d = s ? dibayarSpp(s, i) : 0
                const lunas = d >= pengaturan.sppNominal
                const on = Number(indeks) === i
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => gantiIndeks(i)}
                    className={`relative rounded-[12px] px-1 py-2 text-[12.5px] font-extrabold ${
                      on ? 'permen permen-kecil permen-biru'
                        : lunas ? 'bg-ok-soft text-ok-deep'
                          : d > 0 ? 'bg-warn-soft text-warn-deep'
                            : i < kini ? 'border-[1.5px] border-danger/35 bg-kartu text-danger'
                              : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-ink dark:border-line'
                    }`}
                  >
                    {b.slice(0, 3)}
                    <span className="block text-[9.5px] font-bold opacity-80">{lunas ? 'lunas' : d > 0 ? 'sebagian' : i === kini ? 'bulan ini' : i < kini ? 'belum' : '·'}</span>
                  </button>
                )
              })}
            </div>
          ) : biaya.length === 0 ? (
            <p className="mb-3.5 rounded-2xl bg-canvas px-3.5 py-3 text-[12.5px] font-semibold text-muted">Belum ada biaya kegiatan. Tambahkan di menu Jenis biaya.</p>
          ) : (
            <div className="mb-3.5 grid gap-1.5" role="group" aria-label="Pilih kegiatan">
              {biaya.map((b, i) => {
                const d = s ? dibayarKegiatan(s, i) : 0
                const on = Number(indeks) === i
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => gantiIndeks(i)}
                    className={`flex items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left ${on ? 'border-2 border-brand bg-brand-soft/60 dark:bg-white/5' : 'border-[1.5px] border-[#DCE6F4] bg-kartu dark:border-line'}`}
                  >
                    <GambarKegiatan emoji={emojiKegiatan(b)} size={32} className="rounded-[10px]" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-extrabold">{b.nama}</b>
                      <span className="block text-[11.5px] font-semibold text-muted">{rp(b.nominal)}</span>
                    </span>
                    {d >= b.nominal ? <Chip warna="green">Lunas</Chip> : d > 0 ? <Chip warna="amber">Kurang {rp(b.nominal - d)}</Chip> : null}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      <label className="mb-1.5 block text-[13px] font-bold">Jumlah dibayar</label>
      {dibayarSaatIni > 0 && !modePaket && (
        <p className="mb-1.5 text-xs font-semibold text-warn">
          Sudah dibayar {rp(dibayarSaatIni)} dari {rp(target)} · sisa {rp(sisaSaatIni)}
        </p>
      )}
      <InputNominal className="mb-1.5" value={nominal} onChange={setNominal} placeholder="150.000" />
      {pk && sisaSaatIni > 0 && (
        <div className="mb-2.5 mt-1 flex flex-wrap gap-2">
          {(() => {
            const t = tahapPaket(pk, dibayarSaatIni).find((x) => !x.lunas)
            const opsi = t && t.kurang < sisaSaatIni ? [[`${t.nama} · ${rp(t.kurang)}`, t.kurang]] : []
            return [...opsi, [`Lunasi · ${rp(sisaSaatIni)}`, sisaSaatIni]].map(([l, n]) => (
              <button key={l} type="button" onClick={() => setNominal(n)} className="tombol-putih rounded-pill px-3 py-1.5 text-[12px] font-extrabold">{l}</button>
            ))
          })()}
        </div>
      )}
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
      {Number(nominal) > sisaSaatIni && sisaSaatIni > 0 ? (
        <p className="mb-3.5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-xs font-semibold text-warn-deep">
          <Ikon.peringatan size={15} />
          <span>
            Nominal ini {rp(Number(nominal) - sisaSaatIni)} lebih besar dari sisa tagihan ({rp(sisaSaatIni)}).
            Tetap bisa disimpan sebagai kelebihan bayar.
          </span>
        </p>
      ) : (
        !modePaket && Number(nominal) > 0 && Number(nominal) < sisaSaatIni && (
          <p className="-mt-2.5 mb-3.5 text-xs font-semibold text-muted">
            Ini pembayaran sebagian — sisa setelahnya {rp(sisaSaatIni - Number(nominal))}.
          </p>
        )
      )}

      <label className="mb-1.5 block text-[13px] font-bold">Metode pembayaran</label>
      <div className="mb-3.5 flex gap-2.5">
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
      {tanggal !== tanggalISO() && (
        <p className="mb-4 text-xs font-semibold text-muted">
          Dicatat mundur — tanggal transaksi disimpan sesuai tanggal ini, bukan hari ini.
        </p>
      )}
      {tanggal === tanggalISO() && <div className="mb-4" />}

      <button className="bigbtn disabled:opacity-60" onClick={simpan} disabled={modePaket && !pk}>Simpan pembayaran</button>
    </Sheet>
    <SheetPilihSiswa
      buka={buka && pilihSiswa}
      siswa={siswa}
      terpilih={siswaId}
      sppNominal={pengaturan.sppNominal}
      pilih={(id) => { gantiSiswa(id); setPilihSiswa(false) }}
      tutup={() => (siswaId ? setPilihSiswa(false) : tutup())}
    />
    </>
  )
}

/**
 * Pilih siswa: cari nama / NIS, saring kelas, avatar + kelas + tanda nunggak.
 * Pengganti daftar pilihan bawaan browser yang memenuhi layar HP.
 */
function SheetPilihSiswa({ buka, siswa, terpilih, sppNominal, pilih, tutup }) {
  const [cari, setCari] = useState('')
  const [kelas, setKelas] = useState('')
  useEffect(() => {
    if (buka) { setCari(''); setKelas('') }
  }, [buka])
  const daftarKelas = useMemo(() => [...new Set(siswa.map((x) => x.kelas))].sort(), [siswa])
  const q = cari.trim().toLowerCase()
  const hasil = siswa
    .filter((x) => (!kelas || x.kelas === kelas) && (!q || x.nama.toLowerCase().includes(q) || String(x.nis || '').toLowerCase().includes(q)))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
  return (
    <Sheet buka={buka} tutup={tutup} judul="Pilih siswa" lead={`${siswa.length} siswa aktif`}>
      <div className="sticky -top-2 z-[5] -mx-[18px] bg-canvas px-[18px] pb-2.5 pt-0.5 lg:-mx-6 lg:px-6">
        <KolomCari nilai={cari} ubah={setCari} placeholder="Cari nama atau NIS…" />
        {daftarKelas.length > 1 && (
          <div className="noscroll -mx-[18px] mt-2.5 flex gap-1.5 overflow-x-auto px-[18px] lg:-mx-6 lg:px-6" role="group" aria-label="Saring kelas">
            {['', ...daftarKelas].map((k) => (
              <button
                key={k || 'semua'}
                type="button"
                aria-pressed={kelas === k}
                onClick={() => setKelas(k)}
                className={`shrink-0 rounded-pill px-3 py-1.5 text-[12.5px] font-extrabold ${kelas === k ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-ink dark:border-line'}`}
              >
                {k ? `Kelas ${k}` : 'Semua'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-[52vh] lg:min-h-[380px]">
      {hasil.length === 0 ? (
        <p className="py-8 text-center text-[13.5px] font-semibold text-muted">{q ? `Tidak ada siswa bernama “${cari}”.` : 'Tidak ada siswa di kelas ini.'}</p>
      ) : (
        <div className="card !px-2 !py-1">
          {hasil.map((x, i) => {
            const nunggak = bulanTertunggak(x, sppNominal)
            const on = x.id === terpilih
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => pilih(x.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-left ${on ? 'bg-brand-soft/70 dark:bg-white/5' : 'hover:bg-isi'} ${i ? 'border-t-[1.5px] border-dashed border-line' : ''}`}
              >
                <Avatar nama={x.nama} jenis={x.jenis} avatar={x.avatar} foto={x.foto} size={40} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-extrabold">{x.nama}</b>
                  <span className="block truncate text-[12px] font-semibold text-muted">Kelas {x.kelas}{x.nis ? ` · NIS ${x.nis}` : ''}</span>
                </span>
                {nunggak > 0 && <Chip warna="red">Nunggak {nunggak} bln</Chip>}
                {on && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white"><Ikon.cek size={14} /></span>}
              </button>
            )
          })}
        </div>
      )}
      </div>
    </Sheet>
  )
}

/** Pilihan (jenis biaya · metode bayar). `redup` = siswa ini tidak ditagih jenis tsb. */
const Pilih = ({ on, sub, warna = 'biru', redup = false, children, ...p }) => (
  <button
    type="button"
    {...p}
    aria-pressed={on}
    className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[14px] px-1 py-2.5 text-[13px] font-extrabold leading-tight ${
      on ? `permen permen-kecil permen-${warna}` : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-muted dark:border-line'
    } ${redup && !on ? 'opacity-45' : ''}`}
  >
    {children}
    {sub && <span className="mt-0.5 text-[10.5px] font-bold opacity-80">{sub}</span>}
  </button>
)
