import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BtnKecil, Ikon, Kosong, PageHead, Sheet, Tile } from '../components/ui.jsx'
import InputNominal from '../components/InputNominal.jsx'
import { useData } from '../lib/store.jsx'
import { AKHIR_BULAN, jatuhTempoAkhirBulan, rp } from '../lib/format.js'
import { FONT_EMOJI, PILIHAN_EMOJI, emojiKegiatan, tebakEmoji } from '../lib/emojiKegiatan.js'

export default function JenisBiaya() {
  const { biaya, pengaturan, tambahBiaya, hapusBiaya, ubahEmojiBiaya, ubahPengaturan, toast } = useData()
  const nav = useNavigate()
  const [buka, setBuka] = useState(false)
  const [nama, setNama] = useState('')
  const [nominal, setNominal] = useState('')
  const [spp, setSpp] = useState(pengaturan.sppNominal)
  const [tempo, setTempo] = useState(pengaturan.tanggalJatuhTempo)
  const [emojiBaru, setEmojiBaru] = useState(null) // null = otomatis dari nama
  const [pilihEmoji, setPilihEmoji] = useState(null) // { untuk: 'baru' } | { untuk: indeks biaya }
  const LATAR = ['#E4EEFF', '#DFF6E9', '#FFF4CC', '#EEE6FF', '#FFE6EE', '#DDF4F6']

  const terapkanEmoji = async (e) => {
    const untuk = pilihEmoji?.untuk
    setPilihEmoji(null)
    if (untuk === 'baru') return setEmojiBaru(e)
    try {
      await ubahEmojiBiaya(untuk, e)
      toast(e ? 'Emoji disimpan' : 'Emoji kembali otomatis')
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  const simpan = async () => {
    const n = Number(nominal)
    if (!nama.trim() || !n) return toast('Isi nama kegiatan dan nominalnya')
    await tambahBiaya({ nama: nama.trim(), nominal: n, emoji: emojiBaru })
    setNama(''); setNominal(''); setEmojiBaru(null); setBuka(false)
    toast(`${nama.trim()} ditambahkan ke semua kartu siswa`)
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-1.5 pt-2.5 lg:hidden">
        <button className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white border border-line" onClick={() => nav('/guru')}>
          <Ikon.kembali size={18} />
        </button>
        <h2 className="text-[17px] font-extrabold">Jenis biaya</h2>
      </div>
      <PageHead
        judul="Jenis biaya"
        sub="Daftar biaya di sini dipakai untuk semua siswa di sekolah ini"
        aksi={<BtnKecil utama onClick={() => setBuka(true)}><Ikon.plus size={16} />Tambah kegiatan</BtnKecil>}
      />
      <p className="mb-4 text-[13.5px] text-muted lg:hidden">
        Daftar biaya di sini dipakai untuk semua siswa. Setiap sekolah bisa mengaturnya sendiri sesuai kegiatan masing-masing.
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:pt-4">
       <div className="card mb-4">
        <div className="mb-3.5 flex items-center gap-3">
          <Tile warna="blue"><Ikon.kalender size={20} /></Tile>
          <div>
            <div className="font-extrabold">Iuran SPP bulanan</div>
            <div className="text-[12.5px] text-muted">Siklus Juli–Juni</div>
          </div>
        </div>
        <label className="mb-1.5 block text-[13px] font-bold">Nominal per bulan</label>
        <InputNominal className="mb-3.5" value={spp} onChange={setSpp} placeholder="150.000" />
        <label className="mb-1.5 block text-[13px] font-bold">Jatuh tempo setiap bulan</label>
        <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-[#F5F7FB] p-1" role="radiogroup">
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
                className={`rounded-xl py-2.5 text-[13px] font-extrabold transition ${on ? 'bg-white text-brand shadow-soft' : 'text-muted'}`}
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
        <button
          className="bigbtn"
          onClick={async () => {
            await ubahPengaturan({ sppNominal: Number(spp) || 0, tanggalJatuhTempo: jatuhTempoAkhirBulan(tempo) ? AKHIR_BULAN : Math.min(28, Math.max(1, Number(tempo) || 10)) })
            toast('Pengaturan SPP disimpan')
          }}
        >
          Simpan
        </button>
       </div>

       <div>
      <div className="seghead lg:mt-0">
        <h2>Biaya kegiatan</h2>
        <button className="text-[13px] font-bold text-brand lg:hidden" onClick={() => setBuka(true)}>+ Tambah</button>
      </div>
      <div className="card">
        {biaya.length === 0 ? (
          <Kosong>Belum ada biaya kegiatan.</Kosong>
        ) : (
          biaya.map((b, i) => (
            <div key={b.id} className="row">
              <button
                className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-[22px] active:scale-95"
                style={{ background: LATAR[i % LATAR.length], ...FONT_EMOJI }}
                onClick={() => setPilihEmoji({ untuk: i })}
                title="Ganti emoji"
                aria-label={`Ganti emoji ${b.nama}`}
              >
                {emojiKegiatan(b)}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold">{b.nama}</div>
                <div className="text-[12.5px] text-muted">{rp(b.nominal)} · sekali bayar</div>
              </div>
              <button
                className="shrink-0 rounded-xl bg-[#F1F2F6] px-3 py-2 text-xs font-bold text-muted"
                onClick={async () => { await hapusBiaya(i); toast(`${b.nama} dihapus`) }}
              >
                Hapus
              </button>
            </div>
          ))
        )}
      </div>
       </div>
      </div>

      <Sheet buka={buka} tutup={() => setBuka(false)} judul="Tambah biaya kegiatan" lead="Biaya ini otomatis muncul di kartu semua siswa.">
        <label className="mb-1.5 block text-[13px] font-bold">Nama kegiatan</label>
        <div className="mb-3.5 flex items-center gap-2.5">
          <button
            type="button"
            className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[14px] border border-line bg-[#F5F7FB] text-[26px] active:scale-95"
            style={FONT_EMOJI}
            onClick={() => setPilihEmoji({ untuk: 'baru' })}
            title="Pilih emoji"
          >
            {emojiBaru || tebakEmoji(nama)}
          </button>
          <input className="field-input flex-1" placeholder="mis. Manasik haji" value={nama} onChange={(e) => setNama(e.target.value)} />
        </div>
        <p className="-mt-2 mb-3.5 text-xs text-muted">
          {emojiBaru ? 'Emoji dipilih manual.' : 'Emoji dipilih otomatis dari nama kegiatan.'} Ketuk emoji untuk menggantinya.
        </p>
        <label className="mb-1.5 block text-[13px] font-bold">Nominal</label>
        <InputNominal className="mb-4" value={nominal} onChange={setNominal} placeholder="150.000" />
        <button className="bigbtn" onClick={simpan}>Tambahkan</button>
      </Sheet>

      <Sheet
        buka={!!pilihEmoji}
        tutup={() => setPilihEmoji(null)}
        judul="Pilih emoji"
        lead={pilihEmoji?.untuk === 'baru' ? (nama.trim() || 'Kegiatan baru') : biaya[pilihEmoji?.untuk]?.nama}
      >
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {PILIHAN_EMOJI.map((e) => (
            <button
              key={e}
              className="grid aspect-square place-items-center rounded-2xl bg-[#F5F7FB] text-[26px] transition hover:bg-brand-soft active:scale-90"
              style={FONT_EMOJI}
              onClick={() => terapkanEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="h-4" />
        <button className="bigbtn-ghost mb-2.5" onClick={() => terapkanEmoji(null)}>
          Otomatis sesuai nama kegiatan ({tebakEmoji(pilihEmoji?.untuk === 'baru' ? nama : biaya[pilihEmoji?.untuk]?.nama)})
        </button>
      </Sheet>
    </>
  )
}