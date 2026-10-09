import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BtnKecil, Ikon, KepalaHalaman, Kosong, Sheet, Tile } from '../components/ui.jsx'
import InputTanggal from '../components/InputTanggal.jsx'
import { GambarKegiatan } from '../components/Gambar.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { AKHIR_BULAN, adaInfoKegiatan, daftarTaSekolah, jatuhTempoAkhirBulan, rp, taPendek, tahunAjaranBerjalan, tanggalKegiatan } from '../lib/format.js'
import PilihTa from '../components/PilihTa.jsx'
import { geserTa } from '../lib/bentukData.js'
import { PILIHAN_EMOJI, emojiKegiatan, tebakEmoji } from '../lib/emojiKegiatan.js'
import { EMOJI_JENIS, LABEL_JENIS, WARNA_JENIS, urutPaket } from '../lib/paket.js'
import SheetPaket from './SheetPaket.jsx'

/** Nama kegiatan yang sebenarnya biaya PMB / daftar ulang (cara lama) → usulkan dipindah. */
const POLA_PAKET = /^\s*(pmb|ppdb|spmb|du)\b|pendaftaran|daftar\s*ulang|uang\s+pangkal|registrasi\s*ulang|her[- ]?registrasi/i
const tebakJenisPaket = (nama = '') => (/daftar\s*ulang|^\s*du\b|registrasi\s*ulang|her[- ]?registrasi/i.test(nama) ? 'du' : 'pmb')

export default function JenisBiaya() {
  const { biaya, biayaLain, siswa, paket, pengaturan, tambahBiaya, hapusBiaya, ubahEmojiBiaya, ubahInfoBiaya, ubahPengaturan, aturTarifSpp, salinKegiatan, pindahkanBiayaKePaket, toast, boleh } = useData()
  const ro = !boleh('biaya') // hak akses "lihat" saja
  const nav = useNavigate()
  const [buka, setBuka] = useState(false)
  const [nama, setNama] = useState('')
  const [nominal, setNominal] = useState('')
  const [tempo, setTempo] = useState(pengaturan.tanggalJatuhTempo)
  // 0042: tarif SPP per tahun ajaran (standar + kelas khusus), kegiatan per tahun ajaran
  const taKini = tahunAjaranBerjalan()
  const taDepan = geserTa(taKini, 1)
  const taLalu = geserTa(taKini, -1)
  const [taTarif, setTaTarif] = useState(taKini)
  // semua tahun ajaran yang sudah lewat & ada datanya (terbaru dulu)
  const taLewat = useMemo(() => daftarTaSekolah({ pengaturan, siswa, biayaLain }).filter((t) => t < taKini), [pengaturan, siswa, biayaLain, taKini])
  const [lihatTa, setLihatTa] = useState(taKini)
  const [salin, setSalin] = useState(null) // { dari, ke }
  const [emojiBaru, setEmojiBaru] = useState(null) // null = otomatis dari nama
  const [pilihEmoji, setPilihEmoji] = useState(null) // { untuk: 'baru' } | { untuk: indeks biaya }
  const [infoBaru, setInfoBaru] = useState(INFO_KOSONG)
  const [bukaInfoBaru, setBukaInfoBaru] = useState(false)
  const [edit, setEdit] = useState(null) // { i, info } — sedang mengedit info kegiatan ke-i
  const [sibuk, setSibuk] = useState(false)
  const [bukaPaket, setBukaPaket] = useState(null) // { id } ubah · { jenis } baru
  const [hapusI, setHapusI] = useState(null) // konfirmasi hapus kegiatan ke-i
  const [pindahI, setPindahI] = useState(null) // konfirmasi pindah kegiatan ke-i ke paket

  const terapkanEmoji = async (e) => {
    const untuk = pilihEmoji?.untuk
    setPilihEmoji(null)
    if (untuk === 'baru') return setEmojiBaru(e)
    try {
      await ubahEmojiBiaya(untuk, e)
      toast(e ? 'Gambar disimpan' : 'Gambar kembali otomatis sesuai nama')
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  const simpan = async () => {
    const n = Number(nominal)
    if (!nama.trim() || !n) return toast('Isi nama kegiatan dan nominalnya')
    const salah = cekInfo(infoBaru)
    if (salah) return toast(salah)
    await tambahBiaya({ nama: nama.trim(), nominal: n, emoji: emojiBaru, info: infoBaru })
    setNama(''); setNominal(''); setEmojiBaru(null); setInfoBaru(INFO_KOSONG); setBukaInfoBaru(false); setBuka(false)
    toast(`${nama.trim()} ditambahkan ke semua kartu siswa`)
  }

  const simpanInfo = async () => {
    const salah = cekInfo(edit.info)
    if (salah) return toast(salah)
    setSibuk(true)
    try {
      await ubahInfoBiaya(edit.i, edit.info)
      toast('Info kegiatan disimpan — orang tua bisa melihatnya di portal')
      setEdit(null)
    } catch (e) {
      toast('Gagal menyimpan: ' + e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <>
      <KepalaHalaman
        judul="Jenis biaya"
        gambar="koin"
        kembali={() => nav('/guru/lainnya')}
        sub={ro ? 'Hanya bisa dilihat — perubahan dilakukan petugas yang berwenang' : 'SPP, biaya kegiatan, PMB & daftar ulang — semua biaya sekolah diatur di sini'}
        aksiHp={null}
        aksi={!ro && <BtnKecil utama onClick={() => setBuka(true)}><Ikon.plus size={16} />Tambah kegiatan</BtnKecil>}
      />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
       <div>
       <div className="card mb-4">
        <div className="mb-3.5 flex items-center gap-3">
          <Tile warna="blue"><Ikon.kalender size={20} /></Tile>
          <div>
            <div className="judul-kartu text-[17px]">Iuran SPP bulanan</div>
            <div className="text-[12.5px] text-muted">Siklus Juli–Juni</div>
          </div>
        </div>
        <TarifSpp ta={taTarif} setTa={setTaTarif} taKini={taKini} taDepan={taDepan} taLewat={taLewat} ro={ro} siswa={siswa} pengaturan={pengaturan} aturTarifSpp={aturTarifSpp} toast={toast} />
        <fieldset disabled={ro} className={ro ? 'opacity-80' : ''}>
        <label className="mb-1.5 block text-[13px] font-bold">Jatuh tempo setiap bulan</label>
        <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-[18px] bg-isi p-1" role="radiogroup">
          {[
            { akhir: false, label: '📅 Tanggal tertentu' },
            { akhir: true, label: '🗓️ Akhir bulan' },
          ].map((o) => {
            const on = jatuhTempoAkhirBulan(tempo) === o.akhir
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => setTempo(o.akhir ? AKHIR_BULAN : 10)}
                className={`rounded-[14px] py-2.5 text-[13px] font-extrabold transition ${on ? 'permen permen-kecil permen-biru' : 'text-muted'}`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {jatuhTempoAkhirBulan(tempo) ? (
          <p className="mb-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-brand">
            Otomatis mengikuti hari terakhir tiap bulan — 30 September, 31 Oktober, 28/29 Februari, dan seterusnya.
          </p>
        ) : (
          <>
            <select className="field-input mb-1.5" value={tempo} onChange={(e) => setTempo(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((t) => (
                <option key={t} value={t}>Tanggal {t}</option>
              ))}
            </select>
            <p className="mb-4 text-xs text-muted">Maksimal tanggal 28 supaya berlaku di semua bulan. Untuk tanggal 30/31 pilih "Akhir bulan".</p>
          </>
        )}
        </fieldset>
        {!ro && <button
          className="bigbtn"
          onClick={async () => {
            await ubahPengaturan({ tanggalJatuhTempo: jatuhTempoAkhirBulan(tempo) ? AKHIR_BULAN : Math.min(28, Math.max(1, Number(tempo) || 10)) })
            toast('Jatuh tempo SPP disimpan')
          }}
        >
          Simpan jatuh tempo
        </button>}
       </div>

       {/* ---------- PMB & daftar ulang (0033) ---------- */}
       <div className="card mb-4">
        <div className="judul-kartu text-[17px]">PMB &amp; Daftar ulang</div>
        <p className="mb-1.5 text-[12.5px] text-muted">Biaya masuk siswa baru &amp; daftar ulang siswa lama — dirinci dan bisa dicicil.</p>
        {[...paket].sort(urutPaket).map((p) => (
          <button key={p.id} className="row w-full items-center text-left" onClick={() => setBukaPaket({ id: p.id })}>
            <GambarKegiatan emoji={EMOJI_JENIS[p.jenis]} size={44} className="rounded-[14px]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`permen permen-kecil permen-${WARNA_JENIS[p.jenis]} rounded-[8px] px-2 py-0.5 text-[10.5px] font-extrabold`}>{LABEL_JENIS[p.jenis]}</span>
                <b className="truncate text-[14px] font-extrabold">{p.tahunAjaran}</b>
              </span>
              <span className="mt-0.5 block truncate text-[12px] font-semibold text-muted">
                {rp(p.total)} · {p.tahap.length ? `${p.tahap.length} tahap` : 'tanpa jadwal'} · {p.siswaIds.length} siswa
              </span>
            </span>
            {!ro && <Ikon.kembali size={16} className="shrink-0 rotate-180 text-muted" />}
          </button>
        ))}
        {paket.length === 0 && (
          <p className="my-2 rounded-xl bg-canvas px-3.5 py-3 text-[12.5px] font-semibold text-muted">
            Belum ada paket. Buat paket untuk mencatat biaya pendaftaran / daftar ulang lengkap dengan rinciannya — termasuk yang dulu dicatat manual.
          </p>
        )}
        {!ro && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#B9CBEF] py-2.5 text-[12.5px] font-extrabold text-brand dark:border-line" onClick={() => setBukaPaket({ jenis: 'pmb' })}>
              <Ikon.plus size={15} /> Paket PMB
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#B9CBEF] py-2.5 text-[12.5px] font-extrabold text-brand dark:border-line" onClick={() => setBukaPaket({ jenis: 'du' })}>
              <Ikon.plus size={15} /> Daftar ulang
            </button>
          </div>
        )}
        <p className="mt-2.5 text-[11.5px] font-semibold text-muted">
          Siapa yang belum lunas? Lihat di menu <button className="font-extrabold text-brand" onClick={() => nav('/guru/tagihan')}>Tagihan › PMB / Daftar ulang</button>.
        </p>
       </div>
       </div>

       <div>
      <div className="seghead lg:mt-0">
        <h2>Biaya kegiatan</h2>
        {!ro && lihatTa === taKini && <button className="text-[13px] font-bold text-brand lg:hidden" onClick={() => setBuka(true)}>+ Tambah</button>}
      </div>
      <div className="noscroll -mx-0.5 mb-3 flex gap-1.5 overflow-x-auto px-0.5" role="group" aria-label="Tahun ajaran kegiatan">
        {/* semua tahun yang sudah lewat lewat satu pilihan, supaya tetap rapi walau sudah bertahun-tahun */}
        <PilihTa on={lihatTa < taKini} nilai={lihatTa < taKini ? lihatTa : ''} ubah={setLihatTa} daftar={taLewat} label="Tahun lalu" className="!py-[7px] !text-[12.5px]" />
        {[[taKini, 'Tahun ini'], [taDepan, 'Tahun depan']].map(([t, l]) => (
          <button key={t} type="button" aria-pressed={lihatTa === t} onClick={() => setLihatTa(t)}
            className={`shrink-0 rounded-pill px-3.5 py-2 text-[12.5px] font-extrabold ${lihatTa === t ? 'permen permen-kecil permen-biru' : 'border-[1.5px] border-[#DCE6F4] bg-kartu text-muted dark:border-line'}`}>
            {l} <span className="font-bold opacity-75">{taPendek(t)}</span>
          </button>
        ))}
      </div>
      {lihatTa !== taKini ? (
        <KegiatanTahunLain ta={lihatTa} lalu={lihatTa < taKini} daftar={biayaLain.filter((b) => b.tahunAjaran === lihatTa)} ro={ro}
          bisaSalin={lihatTa > taKini && biaya.length > 0} salinDariKini={() => setSalin({ dari: taKini, ke: taDepan })} />
      ) : (
      <>
      {!ro && biayaLain.some((b) => b.tahunAjaran === taLalu && !biaya.some((x) => x.nama.trim().toLowerCase() === b.nama.trim().toLowerCase())) && (
        <button type="button" onClick={() => setSalin({ dari: taLalu, ke: taKini })}
          className="mb-3 flex w-full items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-[#B9CBEF] bg-kartu px-3.5 py-3 text-left dark:border-line">
          <span className="tile h-[38px] w-[38px] shrink-0 rounded-[12px] bg-brand-soft text-brand"><Ikon.dokumen size={19} /></span>
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-muted">
            <b className="block text-[13.5px] font-extrabold text-brand">Salin kegiatan tahun lalu</b>
            Nama, nominal & keterangan dari {taLalu} — tinggal isi tanggalnya.
          </span>
        </button>
      )}
      <div className="card">
        {biaya.length === 0 ? (
          <Kosong>Belum ada biaya kegiatan.</Kosong>
        ) : (
          biaya.map((b, i) => (
            <div key={b.id} className="row">
              <button
                className="relative shrink-0 active:scale-95"
                onClick={() => !ro && setPilihEmoji({ untuk: i })}
                disabled={ro}
                title="Ganti gambar"
                aria-label={`Ganti gambar ${b.nama}`}
              >
                <GambarKegiatan emoji={emojiKegiatan(b)} size={46} className="rounded-[15px]" />
                {!ro && (
                  <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-kartu text-muted shadow-[0_1px_4px_rgba(0,0,0,.18)]">
                    <Ikon.pensil size={11} />
                  </span>
                )}
              </button>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => !ro && setEdit({ i, info: ambilInfo(b) })}
                disabled={ro}
                title="Info kegiatan untuk orang tua"
              >
                <div className="truncate text-[14.5px] font-extrabold">{b.nama}</div>
                <div className="truncate text-[12.5px] text-muted">
                  {rp(b.nominal)} ·{' '}
                  {adaInfoKegiatan(b)
                    ? <span className="font-bold text-brand">{b.tanggal ? `📅 ${tanggalKegiatan(b, true)}` : 'ℹ️ Info terisi'}{ro ? '' : ' ›'}</span>
                    : ro ? <span className="text-muted">belum ada info</span> : <span className="font-bold text-warn-deep">+ Isi info kegiatan</span>}
                </div>
                {!ro && POLA_PAKET.test(b.nama) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setPindahI(i) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setPindahI(i) } }}
                    className="mt-1 inline-flex items-center gap-1 rounded-pill bg-rose-soft px-2.5 py-1 text-[11.5px] font-extrabold text-rose"
                  >
                    Pindahkan ke PMB &amp; Daftar ulang ›
                  </span>
                )}
              </button>
              {!ro && (
                <button
                  className="shrink-0 rounded-[12px] bg-danger-soft px-3 py-2 text-xs font-extrabold text-danger"
                  onClick={() => setHapusI(i)}
                >
                  Hapus
                </button>
              )}
            </div>
          ))
        )}
      </div>
      </>
      )}
       </div>
      </div>

      <SheetSalinKegiatan buka={!!salin} tutup={() => setSalin(null)} dari={salin?.dari} ke={salin?.ke}
        sumber={salin?.dari === taKini ? biaya : biayaLain.filter((b) => b.tahunAjaran === salin?.dari)}
        sudahAda={salin?.ke === taKini ? biaya : biayaLain.filter((b) => b.tahunAjaran === salin?.ke)}
        salinKegiatan={salinKegiatan} toast={toast} />

      <Sheet buka={buka} tutup={() => setBuka(false)} judul="Tambah biaya kegiatan" lead="Biaya ini otomatis muncul di kartu semua siswa.">
        <label className="mb-1.5 block text-[13px] font-bold">Nama kegiatan</label>
        <div className="mb-3.5 flex items-center gap-2.5">
          <button
            type="button"
            className="shrink-0 active:scale-95"
            onClick={() => setPilihEmoji({ untuk: 'baru' })}
            title="Pilih gambar"
            aria-label="Pilih gambar kegiatan"
          >
            <GambarKegiatan emoji={emojiBaru || tebakEmoji(nama)} size={52} className="rounded-[16px]" />
          </button>
          <input className="field-input flex-1" placeholder="mis. Manasik haji" value={nama} onChange={(e) => setNama(e.target.value)} />
        </div>
        <p className="-mt-2 mb-3.5 text-xs text-muted">
          {emojiBaru ? 'Gambar dipilih manual.' : 'Gambar dipilih otomatis dari nama kegiatan.'} Ketuk gambar untuk menggantinya.
        </p>
        <label className="mb-1.5 block text-[13px] font-bold">Nominal</label>
        <InputNominal className="mb-4" value={nominal} onChange={setNominal} placeholder="150.000" />
        {bukaInfoBaru ? (
          <div className="mb-4 rounded-2xl border border-line bg-kartu p-3.5">
            <div className="mb-3 text-[13.5px] font-extrabold">Info untuk orang tua</div>
            <FormInfoKegiatan info={infoBaru} ubah={(u) => setInfoBaru((x) => ({ ...x, ...u }))} />
          </div>
        ) : (
          <button className="mb-4 w-full rounded-2xl border border-dashed border-line py-3 text-[13.5px] font-bold text-brand" onClick={() => setBukaInfoBaru(true)}>
            + Tambah info kegiatan untuk orang tua (opsional)
          </button>
        )}
        <button className="bigbtn" onClick={simpan}>Tambahkan</button>
      </Sheet>

      <Sheet
        buka={!!edit}
        tutup={() => !sibuk && setEdit(null)}
        judul={edit ? `Info ${biaya[edit.i]?.nama || 'kegiatan'}` : ''}
        lead="Tampil di portal orang tua saat kegiatan ini diketuk (menu Tagihan → Biaya kegiatan)."
      >
        {edit && (
          <>
            <FormInfoKegiatan info={edit.info} ubah={(u) => setEdit((x) => ({ ...x, info: { ...x.info, ...u } }))} />
            <div className="h-1" />
            <button className="bigbtn disabled:opacity-60" onClick={simpanInfo} disabled={sibuk}>
              {sibuk ? 'Menyimpan…' : 'Simpan info kegiatan'}
            </button>
            <div className="h-2.5" />
            <button className="bigbtn-ghost" onClick={() => setEdit(null)} disabled={sibuk}>Batal</button>
          </>
        )}
      </Sheet>

      <SheetPaket buka={!!bukaPaket} tutup={() => setBukaPaket(null)} paketId={bukaPaket?.id || null} jenisAwal={bukaPaket?.jenis || 'pmb'} />

      <Sheet buka={hapusI !== null} tutup={() => setHapusI(null)} judul={`Hapus ${biaya[hapusI]?.nama || 'kegiatan'}?`}
        lead="Kegiatan ini hilang dari kartu semua siswa. Pembayaran yang sudah tercatat tetap tersimpan di riwayat.">
        <button className="bigbtn-tutup mb-2.5" onClick={async () => { const b = biaya[hapusI]; setHapusI(null); await hapusBiaya(hapusI); toast(`${b.nama} dihapus`) }}>
          Ya, hapus
        </button>
        <button className="bigbtn-ghost" onClick={() => setHapusI(null)}>Batal</button>
      </Sheet>

      <Sheet buka={pindahI !== null} tutup={() => !sibuk && setPindahI(null)} judul={`Pindahkan "${biaya[pindahI]?.nama || ''}"?`}
        lead={`Menjadi paket ${LABEL_JENIS[tebakJenisPaket(biaya[pindahI]?.nama)]} ${pengaturan.tahunAjaran}. Semua pembayarannya ikut pindah, dan setelah itu rincian & jadwal cicilan bisa diatur.`}>
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          {['pmb', 'du'].map((j) => (
            <button key={j} disabled={sibuk} className="bigbtn-ghost !py-3 !text-[13.5px] disabled:opacity-60" onClick={async () => {
              setSibuk(true)
              try {
                await pindahkanBiayaKePaket(pindahI, j)
                toast(`Dipindahkan ke ${LABEL_JENIS[j]} ${pengaturan.tahunAjaran}`)
                setPindahI(null)
              } catch {
                /* pesan ditampilkan store */
              } finally {
                setSibuk(false)
              }
            }}>
              Jadikan {LABEL_JENIS[j]}
            </button>
          ))}
        </div>
        <button className="bigbtn-ghost" onClick={() => setPindahI(null)} disabled={sibuk}>Nanti saja</button>
      </Sheet>

      <Sheet
        buka={!!pilihEmoji}
        tutup={() => setPilihEmoji(null)}
        judul="Pilih gambar kegiatan"
        lead={pilihEmoji?.untuk === 'baru' ? (nama.trim() || 'Kegiatan baru') : biaya[pilihEmoji?.untuk]?.nama}
      >
        <div className="grid grid-cols-4 gap-2.5 min-[380px]:grid-cols-5 sm:grid-cols-8">
          {PILIHAN_EMOJI.map((e) => {
            const kini = pilihEmoji?.untuk === 'baru' ? emojiBaru : biaya[pilihEmoji?.untuk]?.emoji
            const dipilih = kini === e
            return (
              <button
                key={e}
                className={`grid aspect-square place-items-center rounded-[18px] transition hover:scale-105 active:scale-90 ${dipilih ? 'ring-[3px] ring-brand ring-offset-2 ring-offset-canvas' : ''}`}
                onClick={() => terapkanEmoji(e)}
                aria-label={`Pilih gambar ${e}`}
                aria-pressed={dipilih}
              >
                <GambarKegiatan emoji={e} size={54} className="rounded-[18px]" />
              </button>
            )
          })}
        </div>
        <div className="h-4" />
        <button className="bigbtn-ghost mb-2.5 flex items-center justify-center gap-2.5" onClick={() => terapkanEmoji(null)}>
          <GambarKegiatan emoji={tebakEmoji(pilihEmoji?.untuk === 'baru' ? nama : biaya[pilihEmoji?.untuk]?.nama)} size={28} className="rounded-[9px]" />
          Otomatis sesuai nama kegiatan
        </button>
      </Sheet>
    </>
  )
}

/* ---------- info kegiatan untuk orang tua ---------- */

const INFO_KOSONG = { tanggal: '', tanggalSelesai: '', waktu: '', lokasi: '', deskripsi: '', perlengkapan: '' }

const ambilInfo = (b) => ({
  tanggal: b.tanggal || '',
  tanggalSelesai: b.tanggalSelesai || '',
  waktu: b.waktu || '',
  lokasi: b.lokasi || '',
  deskripsi: b.deskripsi || '',
  perlengkapan: b.perlengkapan || '',
})

/** Pesan salah isian, atau null kalau aman disimpan. */
function cekInfo(i) {
  if (i.tanggalSelesai && !i.tanggal) return 'Isi tanggal mulai dulu sebelum tanggal selesai'
  if (i.tanggal && i.tanggalSelesai && i.tanggalSelesai < i.tanggal) return 'Tanggal selesai tidak boleh sebelum tanggal mulai'
  return null
}

function FormInfoKegiatan({ info, ubah }) {
  const label = 'mb-1.5 block text-[13px] font-bold'
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Tanggal</label>
          <InputTanggal kecil bisaKosong value={info.tanggal} onChange={(v) => ubah(v ? { tanggal: v } : { tanggal: '', tanggalSelesai: '' })} placeholder="Pilih" aria-label="Tanggal kegiatan" />
        </div>
        <div>
          <label className={label}>Sampai <span className="font-semibold text-muted">(opsional)</span></label>
          <InputTanggal
            kecil
            bisaKosong
            value={info.tanggalSelesai}
            min={info.tanggal || undefined}
            disabled={!info.tanggal}
            onChange={(v) => ubah({ tanggalSelesai: v })}
            placeholder="—"
            aria-label="Tanggal selesai"
          />
        </div>
      </div>
      <label className={label}>Waktu</label>
      <input className="field-input mb-3" maxLength={60} value={info.waktu} onChange={(e) => ubah({ waktu: e.target.value })} placeholder="mis. 07.30 – 11.00 WIB" />
      <label className={label}>Lokasi</label>
      <input className="field-input mb-3" maxLength={150} value={info.lokasi} onChange={(e) => ubah({ lokasi: e.target.value })} placeholder="mis. Lapangan Pusdai, Bandung" />
      <label className={label}>Keterangan kegiatan</label>
      <textarea
        className="field-input mb-1 min-h-[96px] resize-y"
        rows={4}
        maxLength={3000}
        value={info.deskripsi}
        onChange={(e) => ubah({ deskripsi: e.target.value })}
        placeholder="Jelaskan kegiatannya untuk orang tua: tujuan, susunan acara, apa saja yang sudah termasuk biaya, dll."
      />
      <p className="mb-3 text-right text-[11px] font-semibold text-muted">{info.deskripsi.length}/3000</p>
      <label className={label}>Yang perlu dibawa / dipakai anak</label>
      <textarea
        className="field-input mb-1 min-h-[80px] resize-y"
        rows={3}
        maxLength={1000}
        value={info.perlengkapan}
        onChange={(e) => ubah({ perlengkapan: e.target.value })}
        placeholder={'Satu baris satu barang, mis.\nBaju putih\nBotol minum'}
      />
      <p className="mb-3 text-xs text-muted">Semua isian boleh dikosongkan. Yang kosong tidak ditampilkan ke orang tua.</p>
    </>
  )
}

/* ---------- tarif SPP per tahun ajaran & per kelas (0042) ---------- */

function TarifSpp({ ta, setTa, taKini, taDepan, taLewat = [], ro, siswa, pengaturan, aturTarifSpp, toast }) {
  const tarif = pengaturan.tarifSpp?.[ta] || pengaturan.tarifSpp?.[taKini] || { standar: pengaturan.sppNominal, kelas: {} }
  // kelas yang ada di tahun itu (tahun depan: hasil kenaikan kelas + siswa baru)
  const kelas = useMemo(() => {
    const n = new Map()
    siswa.forEach((s) => {
      const k = ta === taKini ? s.terdaftar?.kelas : (s.keanggotaan || []).find((x) => x.ta === ta)?.kelas
      if (k) n.set(k, (n.get(k) || 0) + 1)
    })
    Object.keys(tarif.kelas || {}).forEach((k) => { if (!n.has(k)) n.set(k, 0) })
    return [...n.entries()].sort(([a], [b]) => a.localeCompare(b, 'id'))
  }, [siswa, ta, taKini, tarif])
  const [standar, setStandar] = useState(tarif.standar)
  const [khusus, setKhusus] = useState({ ...(tarif.kelas || {}) })
  const [sibuk, setSibuk] = useState(false)
  const kunciTarif = JSON.stringify(tarif)
  useEffect(() => {
    const t = JSON.parse(kunciTarif)
    setStandar(t.standar)
    setKhusus({ ...(t.kelas || {}) })
  }, [ta, kunciTarif])
  const nKhusus = Object.values(khusus).filter((v) => v !== '' && v != null && Number(v) !== Number(standar)).length

  const simpan = async () => {
    const n = Number(standar) || 0
    if (n <= 0) return toast('Isi nominal SPP standar dulu')
    const kls = {}
    Object.entries(khusus).forEach(([k, v]) => { if (v !== '' && v != null && Number(v) >= 0 && Number(v) !== n) kls[k] = Number(v) })
    setSibuk(true)
    try {
      await aturTarifSpp(ta, n, kls)
      toast(`Tarif SPP ${ta} disimpan${Object.keys(kls).length ? ` · ${Object.keys(kls).length} kelas tarif khusus` : ''}`)
    } catch {
      /* pesan ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div className="mb-4">
      <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-[18px] bg-isi p-1" role="group" aria-label="Tahun ajaran tarif SPP">
        <label className={`relative grid min-w-0 cursor-pointer place-items-center rounded-[14px] py-2 text-[12.5px] font-extrabold ${ta < taKini ? 'permen permen-kecil permen-biru' : 'text-muted'}`}>
          <span className="truncate px-1">{ta < taKini ? taPendek(ta) : 'Tahun lalu'} ▾</span>
          <select className="absolute inset-0 cursor-pointer opacity-0" value={ta < taKini ? ta : ''} onChange={(e) => e.target.value && setTa(e.target.value)} aria-label="Tarif SPP tahun ajaran lalu">
            {ta >= taKini && <option value="">Tahun lalu</option>}
            {taLewat.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {[[taKini, 'Tahun ini'], [taDepan, 'Tahun depan']].map(([t, l]) => (
          <button key={t} type="button" aria-pressed={ta === t} onClick={() => setTa(t)}
            className={`min-w-0 truncate rounded-[14px] px-1 py-2 text-[12.5px] font-extrabold ${ta === t ? 'permen permen-kecil permen-biru' : 'text-muted'}`}>
            {l} <span className="hidden sm:inline">· {taPendek(t)}</span>
          </button>
        ))}
      </div>
      <fieldset disabled={ro} className={ro ? 'opacity-80' : ''}>
        <label className="mb-1.5 block text-[13px] font-bold">Nominal standar per bulan</label>
        <InputNominal className="mb-1.5" value={standar} onChange={setStandar} placeholder="150.000" />
        <p className="mb-3 text-xs font-semibold text-muted">
          {ta === taKini ? 'Berlaku untuk semua kelas, kecuali kelas yang diberi tarif khusus di bawah.'
            : ta < taKini ? `Tarif tahun ajaran ${ta} yang sudah lewat — dipakai menghitung tunggakan tahun itu. Ubah hanya kalau dulu salah catat.`
            : `Disiapkan untuk tahun ajaran ${ta} — mulai berlaku 1 Juli.`}
        </p>
        <details className="mb-3 rounded-2xl bg-canvas px-3.5" open={nKhusus > 0}>
          <summary className="cursor-pointer py-2.5 text-[13px] font-extrabold">
            Tarif khusus per kelas {nKhusus > 0 && <span className="ml-1 rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] text-brand">{nKhusus} kelas</span>}
          </summary>
          {kelas.length === 0 ? (
            <p className="pb-3 text-[12.5px] font-semibold text-muted">Belum ada siswa di tahun ajaran ini.</p>
          ) : (
            <div className="pb-3">
              {kelas.map(([k, n]) => (
                <div key={k} className="flex items-center gap-3 border-t border-dashed border-line py-2 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-extrabold">Kelas {k}</b>
                    <span className="text-[11.5px] font-semibold text-muted">{n} siswa</span>
                  </span>
                  <InputNominal className="!w-[150px] shrink-0" value={khusus[k] ?? ''} onChange={(v) => setKhusus((x) => ({ ...x, [k]: v }))}
                    placeholder={Number(standar || 0).toLocaleString('id-ID')} aria-label={`Tarif SPP kelas ${k}`} />
                </div>
              ))}
              <p className="mt-1 text-[11.5px] font-semibold text-muted">Kosongkan = ikut nominal standar.</p>
            </div>
          )}
        </details>
      </fieldset>
      {!ro && <button className="bigbtn-ghost !py-3 disabled:opacity-60" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan…' : `Simpan tarif SPP ${taPendek(ta)}`}</button>}
    </div>
  )
}

/* ---------- kegiatan tahun ajaran lain (0042) ---------- */

function KegiatanTahunLain({ ta, lalu, daftar, ro, bisaSalin, salinDariKini }) {
  return (
    <>
      <div className="card">
        {daftar.length === 0 ? (
          <Kosong>{lalu ? `Tidak ada kegiatan tercatat di tahun ajaran ${ta}.` : `Belum ada kegiatan untuk tahun ajaran ${ta}.`}</Kosong>
        ) : (
          daftar.map((b) => (
            <div key={b.id} className="row">
              <GambarKegiatan emoji={emojiKegiatan(b)} size={46} className="rounded-[15px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-extrabold">{b.nama}</span>
                <span className="block truncate text-[12.5px] text-muted">{rp(b.nominal)}{b.tanggal ? ` · ${tanggalKegiatan(b, true)}` : ''}</span>
              </span>
            </div>
          ))
        )}
      </div>
      <p className="mt-2.5 px-1 text-[12px] font-semibold leading-snug text-muted">
        {lalu
          ? 'Kegiatan tahun lalu yang belum lunas tetap ditagih sebagai tunggakan di Kartu siswa & Tagihan.'
          : 'Kegiatan tahun depan mulai ditagih 1 Juli, ke siswa yang terdaftar di tahun itu.'}
      </p>
      {!ro && bisaSalin && (
        <button className="bigbtn-ghost mt-3" onClick={salinDariKini}>Salin kegiatan tahun ini ke {ta}</button>
      )}
    </>
  )
}

function SheetSalinKegiatan({ buka, tutup, dari, ke, sumber = [], sudahAda = [], salinKegiatan, toast }) {
  const ada = useMemo(() => new Set(sudahAda.map((b) => b.nama.trim().toLowerCase())), [sudahAda])
  const bisa = sumber.filter((b) => !ada.has(b.nama.trim().toLowerCase()))
  const [pilih, setPilih] = useState([])
  const [sibuk, setSibuk] = useState(false)
  useEffect(() => { if (buka) setPilih(bisa.map((b) => b.id)) }, [buka]) // eslint-disable-line react-hooks/exhaustive-deps
  const ganti = (id) => setPilih((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  const kirim = async () => {
    if (!pilih.length) return toast('Pilih minimal satu kegiatan')
    setSibuk(true)
    try {
      const n = await salinKegiatan(dari, ke, pilih)
      toast(`${n} kegiatan disalin ke ${ke} — jangan lupa isi tanggalnya`)
      tutup()
    } catch {
      /* pesan ditampilkan store */
    } finally {
      setSibuk(false)
    }
  }
  return (
    <Sheet buka={buka} tutup={() => !sibuk && tutup()} judul={`Salin kegiatan ke ${ke || ''}`} lead={`Dari tahun ajaran ${dari || ''}. Nama, nominal, gambar & keterangan ikut; tanggal dikosongkan.`}>
      {bisa.length === 0 ? (
        <Kosong>Semua kegiatan {dari} sudah ada di {ke}.</Kosong>
      ) : (
        <div className="card mb-4 !py-1">
          {bisa.map((b) => (
            <label key={b.id} className="row cursor-pointer items-center">
              <input type="checkbox" className="h-[18px] w-[18px] shrink-0 accent-[#3B6EF6]" checked={pilih.includes(b.id)} onChange={() => ganti(b.id)} />
              <GambarKegiatan emoji={emojiKegiatan(b)} size={38} className="rounded-[12px]" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-extrabold">{b.nama}</b>
                <span className="text-[12px] font-semibold text-muted">{rp(b.nominal)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {bisa.length > 0 && (
        <button className="bigbtn disabled:opacity-60" onClick={kirim} disabled={sibuk || !pilih.length}>
          {sibuk ? 'Menyalin…' : `Salin ${pilih.length} kegiatan`}
        </button>
      )}
    </Sheet>
  )
}
