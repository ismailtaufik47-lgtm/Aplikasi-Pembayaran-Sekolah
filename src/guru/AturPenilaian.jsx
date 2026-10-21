// Menu "Penilaian anak" (admin/kepala, 0052): dasar penilaian, skala, periode ceklis,
// foto, aspek & indikator, dan undangan guru kelas.
import { useCallback, useEffect, useState } from 'react'
import { KepalaHalaman, Segment, Sheet, Muat } from '../components/ui.jsx'
import { AvatarStaf } from '../components/Avatar.jsx'
import { useData } from '../lib/store.jsx'
import * as t from '../tumbuh/api.js'
import { IkonT, PilSkala, Sakelar } from '../tumbuh/bagian.jsx'
import { PILIHAN_DASAR, PILIHAN_SKALA, PILIHAN_PERIODE, namaKelas } from '../tumbuh/skala.js'

const WARNA = ['ungu', 'pink', 'biru', 'oranye', 'tosca', 'kuning']

export default function AturPenilaian() {
  const { toast } = useData()
  const [d, setD] = useState(null)
  const [galat, setGalat] = useState('')
  const [ganti, setGanti] = useState(null) // dasar yang mau dipakai
  const [edit, setEdit] = useState(null)   // { jenis: 'aspek'|'indikator', ... }
  const [undang, setUndang] = useState(null) // { kelas, kode }
  const [sibuk, setSibuk] = useState('')

  const muat = useCallback(() => t.aturAmbil().then(setD).catch((e) => setGalat(e.message)), [])
  useEffect(() => { muat() }, [muat])

  if (galat) return <><KepalaHalaman judul="Penilaian anak" /><p className="card mb-5 text-center text-[13.5px] font-semibold text-danger">{galat}</p></>
  if (!d) return <Muat>Memuat pengaturan…</Muat>
  const boleh = d.bolehUbah

  const simpanAtur = async (u) => {
    const lama = d.atur
    setD({ ...d, atur: { ...d.atur, ...u } })
    try { await t.aturSimpan(u); toast('Tersimpan') } catch (e) { setD((x) => ({ ...x, atur: lama })); toast(e.message) }
  }
  const pakaiDasar = async () => {
    setSibuk('dasar')
    try { await t.pakaiDasar(ganti); await muat(); toast('Dasar penilaian diganti'); setGanti(null) } catch (e) { toast(e.message) } finally { setSibuk('') }
  }
  const bukaUndang = async (kelas, kodeAda) => {
    if (kodeAda) return setUndang({ kelas, kode: kodeAda })
    setSibuk('undang:' + kelas)
    try { const r = await t.kodeGuru(kelas); setUndang({ kelas, kode: r.kode }); muat() } catch (e) { toast(e.message) } finally { setSibuk('') }
  }
  const bersihkanFoto = async () => {
    setSibuk('foto')
    try { const n = await t.fotoLamaBersihkan(); toast(`${n} foto tahun ajaran lalu dihapus`); muat() } catch (e) { toast(e.message) } finally { setSibuk('') }
  }
  const mb = (d.foto?.byte || 0) / 1048576

  return (
    <>
      <KepalaHalaman judul="Penilaian anak" sub="Atur apa yang dinilai guru kelas & seberapa sering. Orang tua melihat hasilnya di portal (menu Tumbuh)." />
      {!boleh && <p className="mb-3 rounded-[16px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn-deep">Akun ini hanya bisa melihat. Pengaturan diubah oleh kepala sekolah atau Admin/TU.</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div>
          <Bagian judul="Dasar penilaian" catatan="Bisa diganti kapan saja. Nilai yang sudah pernah diisi tetap tersimpan di riwayat.">
            <div className="grid gap-2.5">
              {PILIHAN_DASAR.map((x) => (
                <PilihanBulat key={x.id} dipilih={d.atur.dasar === x.id} judul={x.judul} sub={x.sub} kartu
                  onClick={() => boleh && d.atur.dasar !== x.id && setGanti(x.id)} />
              ))}
            </div>
          </Bagian>

          <Bagian judul="Skala nilai">
            <div className="card !p-3.5">
              <div className="grid gap-2">
                {PILIHAN_SKALA.map((x) => (
                  <PilihanBulat key={x.id} dipilih={d.atur.skala === x.id} judul={x.judul} onClick={() => boleh && simpanAtur({ skala: x.id })}>
                    {x.id !== 'tanpa' && <span className="mt-2 flex flex-wrap gap-1.5">{[1, 2, 3, 4].map((n) => <PilSkala key={n} n={n} skala={x.id} />)}</span>}
                  </PilihanBulat>
                ))}
              </div>
            </div>
          </Bagian>

          {d.atur.skala !== 'tanpa' && (
            <Bagian judul="Ceklis diisi setiap" catatan="Guru mengisi sekali per periode untuk sekelas. Isian awal diambil dari periode sebelumnya, jadi cukup mengubah yang berbeda.">
              <Segment nilai={d.atur.periode} ubah={(v) => boleh && simpanAtur({ periode: v })} opsi={PILIHAN_PERIODE.map((p) => ({ nilai: p.id, label: p.label }))} />
            </Bagian>
          )}

          <Bagian judul="Foto di kabar & catatan" catatan="Kalau dimatikan, guru hanya menulis teks dan portal orang tua menyesuaikan sendiri — tidak ada kotak foto kosong.">
            <div className="card !p-0">
              <div className="flex items-center gap-3 px-3.5 py-3">
                <span className="permen permen-kecil permen-kuning grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"><IkonT.kamera size={20} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14px] font-extrabold">Guru boleh menambah foto</b>
                  <span className="block text-[12px] font-semibold leading-snug text-muted">Opsional · kabar maks. 3 foto, catatan maks. 1</span>
                </span>
                <Sakelar hidup={d.atur.foto} ubah={(v) => simpanAtur({ foto: v })} label="Guru boleh menambah foto" disabled={!boleh} />
              </div>
              <div className="border-t border-line px-3.5 py-3">
                <div className="flex items-center justify-between text-[12.5px] font-extrabold">
                  <span>Pemakaian foto</span><span>{mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`} · {d.foto?.jumlah || 0} foto</span>
                </div>
                <p className="mt-2 text-[11.5px] font-semibold leading-snug text-muted">Foto dikecilkan otomatis (±150–250 KB). Foto tahun ajaran lalu sebaiknya dihapus supaya ruang tetap lega — teks, nilai & grafik tetap tersimpan.</p>
                {d.fotoLama > 0 && boleh && (
                  <button className="mt-2.5 w-full rounded-[14px] bg-danger-soft py-2.5 text-[13px] font-extrabold text-danger disabled:opacity-60" disabled={sibuk === 'foto'} onClick={bersihkanFoto}>
                    {sibuk === 'foto' ? 'Menghapus…' : `Hapus ${d.fotoLama} foto tahun ajaran lalu`}
                  </button>
                )}
              </div>
            </div>
          </Bagian>

          <Bagian judul="Guru kelas" catatan="Guru kelas masuk lewat aplikasi khusus (alamat /kelas) dan hanya melihat anak di kelasnya — tidak bisa melihat tagihan & keuangan.">
            {d.kelas.length === 0 ? (
              <p className="card text-center text-[13px] font-semibold text-muted">Belum ada siswa aktif. Tambahkan siswa dulu di menu Siswa.</p>
            ) : (
              <div className="card !p-0">
                {d.kelas.map((k) => (
                  <div key={k.kelas} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
                    {k.guru.length
                      ? <AvatarStaf nama={k.guru[0].nama} avatar={k.guru[0].avatar} size={40} />
                      : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-[#C9D3E6] text-muted"><IkonT.plus size={18} /></span>}
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14px] font-extrabold">{namaKelas(k.kelas)} · {k.jumlah} anak</b>
                      <span className="block truncate text-[12px] font-semibold text-muted">
                        {k.guru.length ? k.guru.map((g) => g.nama + (g.aktif ? '' : ' (nonaktif)')).join(', ') : k.kode ? `Kode undangan: ${k.kode.kode}` : 'Belum ada guru kelas'}
                      </span>
                    </span>
                    {boleh && (
                      k.guru.length && !k.kode
                        ? <button className="shrink-0 text-[12.5px] font-extrabold text-brand disabled:opacity-60" disabled={!!sibuk} onClick={() => bukaUndang(k.kelas)}>+ Guru</button>
                        : <button className="shrink-0 rounded-[12px] bg-brand px-3 py-2 text-[12px] font-extrabold text-white shadow-[inset_0_-3px_0_#2A55CC] disabled:opacity-60" disabled={!!sibuk}
                            onClick={() => bukaUndang(k.kelas, k.kode?.kode)}>{sibuk === 'undang:' + k.kelas ? '…' : k.kode ? 'Kode' : 'Undang'}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Bagian>
        </div>

        <div>
          {d.atur.skala !== 'tanpa' && (
            <Bagian judul="Aspek & indikator" aksi={boleh && d.aspek.length < 6 && <button className="text-[13px] font-extrabold text-brand" onClick={() => setEdit({ jenis: 'aspek' })}>+ Aspek</button>}>
              {d.aspek.length === 0 ? (
                <div className="card text-center">
                  <p className="text-[13px] font-semibold text-muted">Belum ada aspek penilaian.</p>
                  {boleh && <button className="bigbtn mt-3" onClick={() => setEdit({ jenis: 'aspek' })}>Tambah aspek pertama</button>}
                </div>
              ) : (
                <div className="grid gap-3">
                  {d.aspek.map((a, i) => (
                    <section key={a.id} className="card !p-0">
                      <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
                        <span className={`permen permen-kecil permen-${WARNA[i % 6]} grid h-9 w-9 shrink-0 place-items-center rounded-[12px]`}><IkonT.tunas size={19} /></span>
                        <b className="min-w-0 flex-1 text-[14px] font-extrabold leading-snug">{a.nama}</b>
                        {boleh && <button aria-label={`Ubah aspek ${a.nama}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-muted hover:bg-isi" onClick={() => setEdit({ jenis: 'aspek', ...a })}><IkonT.pensil size={17} /></button>}
                      </header>
                      {a.indikator.map((x) => (
                        <button key={x.id} disabled={!boleh} onClick={() => setEdit({ jenis: 'indikator', aspekId: a.id, ...x })}
                          className="flex w-full items-center gap-2 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 disabled:cursor-default">
                          <span className="min-w-0 flex-1 text-[13.5px] font-bold leading-snug">{x.nama}</span>
                          {x.khas && <span className="chip bg-warn-soft text-warn-deep">Khas sekolah</span>}
                        </button>
                      ))}
                      {boleh && (
                        <button className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-[13px] font-extrabold text-brand" onClick={() => setEdit({ jenis: 'indikator', aspekId: a.id })}>
                          <IkonT.plus size={16} sw={2.6} /> Tambah indikator
                        </button>
                      )}
                    </section>
                  ))}
                </div>
              )}
              <p className="mb-5 mt-3 px-1 text-[12px] font-semibold leading-relaxed text-muted">
                Contoh indikator khas sekolah: hafalan doa harian, iqro, kemandirian makan, toilet training. Maksimal 6 aspek supaya grafik untuk orang tua tetap mudah dibaca.
              </p>
            </Bagian>
          )}
        </div>
      </div>

      <Sheet buka={!!ganti} tutup={() => setGanti(null)} judul="Ganti dasar penilaian?"
        lead={`Aspek & indikator diganti dengan "${PILIHAN_DASAR.find((x) => x.id === ganti)?.judul}". Nilai yang sudah pernah diisi tetap tersimpan, dan guru memilih ulang indikator untuk periode berjalan.`}>
        <div className="grid grid-cols-2 gap-2.5 pb-1">
          <button className="bigbtn-ghost" onClick={() => setGanti(null)}>Batal</button>
          <button className="bigbtn disabled:opacity-60" disabled={sibuk === 'dasar'} onClick={pakaiDasar}>{sibuk === 'dasar' ? 'Mengganti…' : 'Ganti'}</button>
        </div>
      </Sheet>
      <SheetEdit edit={edit} tutup={() => setEdit(null)} selesai={(m) => { setEdit(null); toast(m); muat() }} />
      <SheetUndang undang={undang} tutup={() => setUndang(null)} toast={toast} />
    </>
  )
}

function Bagian({ judul, catatan, aksi, children }) {
  return (
    <section>
      <div className="seghead lg:mt-0 lg:pt-1"><h2>{judul}</h2>{aksi}</div>
      {children}
      {catatan && <p className="mt-2 px-1 text-[12px] font-semibold leading-relaxed text-muted">{catatan}</p>}
      <div className="h-1 lg:h-5" />
    </section>
  )
}

function PilihanBulat({ dipilih, judul, sub, kartu = false, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={dipilih}
      className={`flex items-start gap-3 text-left ${kartu
        ? `rounded-[20px] border-[1.5px] bg-kartu p-3.5 ${dipilih ? 'border-brand shadow-[0_0_0_4px_rgba(59,110,246,.12)]' : 'border-[#DCE6F4] dark:border-line'}`
        : `rounded-[16px] p-2.5 ${dipilih ? 'bg-brand-soft' : ''}`}`}>
      <span className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 ${dipilih ? 'border-brand bg-brand text-white' : 'border-[#CBD3E2] bg-kartu'}`}>
        {dipilih && <IkonT.centang size={13} sw={3.2} />}
      </span>
      <span className="min-w-0">
        <b className={`block font-extrabold ${kartu ? 'text-[14.5px]' : 'text-[13.5px]'}`}>{judul}</b>
        {sub && <span className="mt-0.5 block text-[12px] font-semibold leading-snug text-muted">{sub}</span>}
        {children}
      </span>
    </button>
  )
}

/* ---------------- ubah aspek / indikator ---------------- */
function SheetEdit({ edit, tutup, selesai }) {
  const [nama, setNama] = useState('')
  const [pendek, setPendek] = useState('')
  const [khas, setKhas] = useState(false)
  const [ket, setKet] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    if (!edit) return
    setNama(edit.nama || ''); setPendek(edit.pendek || ''); setKhas(!!edit.khas); setKet(edit.keterangan || ''); setGalat('')
  }, [edit])
  if (!edit) return null
  const aspek = edit.jenis === 'aspek'
  const simpan = async () => {
    setSibuk(true); setGalat('')
    try {
      if (aspek) await t.aspekSimpan({ id: edit.id || null, nama, pendek })
      else await t.indikatorSimpan({ id: edit.id || null, aspekId: edit.aspekId, nama, khas, keterangan: ket })
      selesai('Tersimpan')
    } catch (e) { setGalat(e.message) } finally { setSibuk(false) }
  }
  const hapus = async () => {
    setSibuk(true)
    try { aspek ? await t.aspekHapus(edit.id) : await t.indikatorHapus(edit.id); selesai('Dihapus') } catch (e) { setGalat(e.message); setSibuk(false) }
  }
  return (
    <Sheet buka tutup={tutup} judul={edit.id ? (aspek ? 'Ubah aspek' : 'Ubah indikator') : aspek ? 'Aspek baru' : 'Indikator baru'}
      lead={aspek ? 'Aspek = kelompok besar kemampuan, mis. "Jati Diri".' : 'Indikator = kemampuan yang diamati guru, mis. "Mau berbagi & bergantian".'}>
      <div className="grid gap-3 pb-1">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-extrabold">Nama {aspek ? 'aspek' : 'indikator'}</span>
          <input value={nama} onChange={(e) => setNama(e.target.value)} maxLength={aspek ? 120 : 160} className="field-input w-full text-[14.5px] font-semibold" autoFocus />
        </label>
        {aspek ? (
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-extrabold">Nama singkat <span className="font-semibold text-muted">(untuk grafik orang tua)</span></span>
            <input value={pendek} onChange={(e) => setPendek(e.target.value)} maxLength={40} placeholder="Mis. Jati diri" className="field-input w-full text-[14.5px] font-semibold" />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-extrabold">Keterangan <span className="font-semibold text-muted">(opsional, tampil di layar ceklis guru)</span></span>
              <textarea value={ket} onChange={(e) => setKet(e.target.value)} rows={2} maxLength={400} className="field-input w-full resize-none text-[14px] font-semibold" />
            </label>
            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-isi px-3.5 py-3">
              <span><b className="block text-[13.5px] font-extrabold">Khas sekolah</b><span className="block text-[12px] font-semibold text-muted">Mis. hafalan doa, iqro</span></span>
              <Sakelar hidup={khas} ubah={setKhas} label="Khas sekolah" />
            </div>
          </>
        )}
        {galat && <p className="text-center text-[13px] font-semibold text-danger">{galat}</p>}
        <button className="bigbtn disabled:opacity-60" disabled={sibuk || !nama.trim()} onClick={simpan}>{sibuk ? 'Menyimpan…' : 'Simpan'}</button>
        {edit.id && (
          <button className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-extrabold text-danger disabled:opacity-60" disabled={sibuk} onClick={hapus}>
            <IkonT.tempat size={16} />Hapus {aspek ? 'aspek ini' : 'indikator ini'}
          </button>
        )}
        {edit.id && <p className="text-center text-[11.5px] font-semibold text-muted">Kalau sudah pernah dinilai, hanya disembunyikan — nilai lama tetap tersimpan.</p>}
      </div>
    </Sheet>
  )
}

/* ---------------- kode undangan guru ---------------- */
function SheetUndang({ undang, tutup, toast }) {
  if (!undang) return null
  const alamat = `${window.location.origin}/kelas`
  const teks = `Assalamu'alaikum, berikut kode undangan guru ${namaKelas(undang.kelas)} di Kasceria: ${undang.kode}\n\n1. Buka ${alamat}\n2. Masuk dengan Google\n3. Masukkan kode ${undang.kode}\n\nKode berlaku 7 hari dan hanya bisa dipakai satu kali.`
  const salin = async () => {
    try { await navigator.clipboard.writeText(teks); toast('Pesan undangan disalin') } catch { toast('Tidak bisa menyalin otomatis') }
  }
  return (
    <Sheet buka tutup={tutup} judul={`Undang guru ${namaKelas(undang.kelas)}`} lead="Kirim kode ini ke guru kelas. Berlaku 7 hari, sekali pakai.">
      <div className="grid gap-3 pb-1">
        <div className="kotak-kode rounded-[20px] bg-isi py-4 text-center font-display text-[34px] font-bold tracking-[.25em]">{undang.kode}</div>
        <ol className="grid gap-1.5 text-[13px] font-semibold text-muted">
          <li>1. Guru membuka <b className="text-ink">{alamat}</b></li>
          <li>2. Masuk dengan akun Google</li>
          <li>3. Memasukkan kode di atas — langsung terhubung ke {namaKelas(undang.kelas)}</li>
        </ol>
        <div className="grid grid-cols-2 gap-2.5">
          <button className="bigbtn-ghost" onClick={salin}>Salin pesan</button>
          <a className="bigbtn-wa text-center" href={`https://wa.me/?text=${encodeURIComponent(teks)}`} target="_blank" rel="noreferrer">Kirim WhatsApp</a>
        </div>
      </div>
    </Sheet>
  )
}
