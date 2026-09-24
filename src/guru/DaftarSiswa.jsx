import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { BtnKecil, Chevron, Chip, Ikon, Kosong, PageHead, Sheet, Track } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import SheetImportSiswa from './SheetImportSiswa.jsx'
import SheetKenaikanKelas from './SheetKenaikanKelas.jsx'
import * as api from '../lib/api.js'
import { pesanKunci } from '../lib/langganan.js'
import {
  bulanBerjalan,
  kegiatanBelum,
  labelTunggakan,
  lunasSpp,
  perluDitagihSekarang,
  rp,
  sppPerluSekarang,
  statusRingkasSiswa,
  totalKegiatan,
} from '../lib/format.js'

const STATUS_LABEL = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Menunggak' }
const STATUS_WARNA = { lunas: 'green', sebagian: 'amber', belum: 'red' }

export default function DaftarSiswa({ onTambah, onUbah, terkunci = false }) {
  const { siswa, biaya, pengaturan, peran, hapusSiswa, segarkan, toast } = useData()
  const readOnly = peran === 'kepala'
  const nav = useNavigate()
  const [showImport, setShowImport] = useState(false)

  // Import massal juga menambah siswa baru → ikut dikunci saat langganan habis.
  const bukaImport = () => {
    if (terkunci) return toast(pesanKunci(pengaturan, 'siswa'))
    setShowImport(true)
  }
  const gayaKunci = terkunci ? 'opacity-60' : ''
  const [showKenaikanKelas, setShowKenaikanKelas] = useState(false)
  const [tabAktif, setTabAktif] = useState('aktif') // 'aktif' | 'alumni'
  const [alumni, setAlumni] = useState([])
  const [memuatAlumni, setMemuatAlumni] = useState(false)
  const [cari, setCari] = useState('')
  const [filter, setFilter] = useState('')
  const [menuAksi, setMenuAksi] = useState(null) // siswa yang lagi dibuka menu "..."-nya
  const [konfirmHapus, setKonfirmHapus] = useState(false)
  const kini = bulanBerjalan()

  const bukaTabAlumni = async () => {
    setTabAktif('alumni')
    setFilter(''); setCari('')
    if (alumni.length > 0) return
    setMemuatAlumni(true)
    try {
      const data = await api.muatAlumni(pengaturan.id)
      setAlumni(data.map((s) => ({
        id: s.id, nama: s.nama, kelas: s.kelas, nis: s.nis,
        jenis: s.jenis_kelamin, avatar: s.avatar, foto: s.foto,
        tahunLulus: s.tahun_lulus,
        spp: [], kegiatan: [], hp: s.hp, wali: s.wali,
      })))
    } catch { toast('Gagal memuat data alumni') }
    finally { setMemuatAlumni(false) }
  }

  const kelas = useMemo(() => [...new Set(siswa.map((s) => s.kelas))].sort(), [siswa])
  const hasil = siswa.filter((s) => {
    const q = cari.toLowerCase()
    if (q && !(s.nama.toLowerCase().includes(q) || s.nis.includes(q))) return false
    if (filter === '#n') return perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
    if (filter && s.kelas !== filter) return false
    return true
  })

  /** Ringkasan untuk header tabel — dari SELURUH siswa, tidak ikut terpengaruh pencarian/filter. */
  const ringkasan = useMemo(() => {
    let lunas = 0, sebagian = 0, belum = 0
    siswa.forEach((s) => {
      const st = statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
      if (st === 'lunas') lunas++
      else if (st === 'sebagian') sebagian++
      else belum++
    })
    return { lunas, sebagian, belum }
  }, [siswa, pengaturan, kini])

  const tagihanTotal = 12 * pengaturan.sppNominal + totalKegiatan(biaya)

  const bukaMenu = (s) => { setMenuAksi(s); setKonfirmHapus(false) }
  const tutupMenu = () => { setMenuAksi(null); setKonfirmHapus(false) }
  const konfirmasiHapus = async () => {
    const s = menuAksi
    tutupMenu()
    try {
      await hapusSiswa(s.id)
      toast(`${s.nama} dihapus dari daftar siswa`)
    } catch {
      /* pesan galat sudah ditangani store */
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 pb-1.5 pt-3.5 lg:hidden">
        <h1 className="text-xl font-extrabold">Siswa</h1>
        <div className="flex items-center gap-2">
          <button
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-2xl border border-line bg-white active:scale-95"
            onClick={() => setShowKenaikanKelas(true)}
            title="Kenaikan Kelas"
          >
            🎓
          </button>
          {!readOnly && (
            <>
              <button
                className={`flex items-center gap-1.5 rounded-2xl border border-brand bg-white px-3 py-2.5 text-[13px] font-extrabold text-brand active:scale-95 ${gayaKunci}`}
                onClick={bukaImport}
                title={terkunci ? 'Terkunci sampai langganan diperpanjang' : 'Import dari Excel'}
              >
                <Ikon.dokumen size={15} />
                Import
              </button>
              <button
                className={`flex items-center gap-1.5 rounded-2xl bg-brand px-3.5 py-2.5 text-[13px] font-extrabold text-white active:scale-95 ${gayaKunci}`}
                onClick={onTambah}
                title={terkunci ? 'Terkunci sampai langganan diperpanjang' : undefined}
              >
                <Ikon.plus size={16} />
                Siswa
              </button>
            </>
          )}
        </div>
      </div>

      <PageHead
        judul="Siswa"
        sub={readOnly ? 'Klik siswa untuk melihat status pembayarannya' : 'Klik siswa untuk membuka kartu pembayarannya'}
        aksi={
          !readOnly && (
            <BtnKecil utama onClick={onTambah} title={terkunci ? 'Terkunci sampai langganan diperpanjang' : undefined}>
              {terkunci ? <Ikon.jam size={16} /> : <Ikon.plus size={16} />}Siswa
            </BtnKecil>
          )
        }
      />

      {/* Search + tombol utilitas kompak (Kenaikan Kelas, Import) sejajar
          di kanan pada desktop — supaya tidak makan tempat lebar seperti
          sebelumnya. Di mobile, tombol-tombol ini pindah ke header atas. */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-soft lg:max-w-md">
          <span className="text-muted"><Ikon.cari size={18} /></span>
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama atau NIS…"
            className="flex-1 bg-transparent font-medium outline-none"
          />
        </div>
        <button
          onClick={() => setShowKenaikanKelas(true)}
          className="hidden shrink-0 items-center gap-1.5 rounded-2xl border border-line bg-white px-3.5 py-3 text-[13px] font-bold text-ink lg:flex"
          title="Kenaikan Kelas"
        >
          🎓 <span className="whitespace-nowrap">Kenaikan Kelas</span>
        </button>
        {!readOnly && (
          <button
            onClick={bukaImport}
            className={`hidden shrink-0 items-center gap-1.5 rounded-2xl border border-line bg-white px-3.5 py-3 text-[13px] font-bold text-ink lg:flex ${gayaKunci}`}
            title={terkunci ? 'Terkunci sampai langganan diperpanjang' : 'Import dari Excel'}
          >
            <Ikon.dokumen size={15} /> <span className="whitespace-nowrap">Import</span>
          </button>
        )}
      </div>

      {/* Tab Aktif / Alumni */}
      {/* Sakelar ringkas selebar isinya (bukan membentang penuh) */}
      <div className="mb-3 inline-flex rounded-2xl border border-line bg-white p-1 shadow-soft" role="tablist">
        <button
          role="tab"
          aria-selected={tabAktif === 'aktif'}
          onClick={() => { setTabAktif('aktif'); setFilter(''); setCari('') }}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-[13px] font-extrabold transition ${tabAktif === 'aktif' ? 'bg-brand text-white shadow-[0_4px_12px_rgba(59,110,246,.28)]' : 'text-muted hover:text-ink'}`}
        >
          🧒 Siswa aktif
        </button>
        <button
          role="tab"
          aria-selected={tabAktif === 'alumni'}
          onClick={bukaTabAlumni}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-[13px] font-extrabold transition ${tabAktif === 'alumni' ? 'bg-grape text-white shadow-[0_4px_12px_rgba(139,92,246,.28)]' : 'text-muted hover:text-ink'}`}
        >
          🎓 Alumni
        </button>
      </div>

      {tabAktif === 'aktif' && (
      <div className="noscroll mb-1.5 flex gap-2 overflow-x-auto pb-1">
        <FChip on={filter === ''} onClick={() => setFilter('')}>Semua</FChip>
        {kelas.map((k) => (
          <FChip key={k} on={filter === k} onClick={() => setFilter(k)}>Kelas {k}</FChip>
        ))}
        <FChip on={filter === '#n'} onClick={() => setFilter('#n')}>Menunggak</FChip>
      </div>
      )}

      {tabAktif === 'aktif' && siswa.length > 0 && (
        <p className="mb-2.5 px-0.5 text-[12.5px] font-bold text-muted lg:hidden">
          {siswa.length} siswa aktif · {ringkasan.lunas} Lunas · {ringkasan.belum} Menunggak · {ringkasan.sebagian} Sebagian
        </p>
      )}

      {tabAktif === 'aktif' && (
      <>
      {/* ---------- mobile: daftar kartu ---------- */}
      <div className="card lg:hidden">
        {hasil.length === 0 ? (
          <Kosong>
            {siswa.length === 0 ? (
              readOnly ? 'Belum ada siswa terdaftar.' : (
                <>
                  Belum ada siswa terdaftar.
                  <button className="mt-3 block w-full rounded-2xl bg-brand py-3 font-extrabold text-white" onClick={onTambah}>
                    Tambah siswa pertama
                  </button>
                </>
              )
            ) : (
              'Tidak ada siswa yang cocok dengan pencarian.'
            )}
          </Kosong>
        ) : (
          hasil.map((s) => {
            const label = labelTunggakan(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
            const lunas = lunasSpp(s, pengaturan.sppNominal)
            return (
              <button key={s.id} className="row w-full text-left" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{s.nama}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    Kelas {s.kelas} · {s.wali || 'Data orang tua belum diisi'} · NIS {s.nis}
                  </span>
                  <span className="mt-1.5 block">
                    <Track persen={(lunas / 12) * 100} warna={label ? '#F5A524' : '#22C55E'} tinggi={5} />
                  </span>
                </span>
                <Chip warna={label ? label.warna : 'green'}>{label ? label.teks : 'Lancar'}</Chip>
                <Chevron />
              </button>
            )
          })
        )}
      </div>

      {/* ---------- desktop: tabel data ---------- */}
      <div className="hidden overflow-hidden rounded-card bg-white shadow-soft lg:block">
        {siswa.length > 0 && (
          <div className="border-b border-line px-5 py-3 text-[13px] font-bold text-muted">
            {siswa.length} siswa terdaftar · {ringkasan.lunas} Lunas · {ringkasan.belum} Menunggak · {ringkasan.sebagian} Sebagian
          </div>
        )}
        {hasil.length === 0 ? (
          <div className="p-5">
            <Kosong>
              {siswa.length === 0
                ? (readOnly ? 'Belum ada siswa terdaftar.' : 'Belum ada siswa terdaftar.')
                : 'Tidak ada siswa yang cocok dengan pencarian.'}
            </Kosong>
            {siswa.length === 0 && !readOnly && (
              <button className="mt-3 block w-full rounded-2xl bg-brand py-3 font-extrabold text-white" onClick={onTambah}>
                Tambah siswa pertama
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-bold">Nama</th>
                <th className="px-3 py-3 font-bold">Kelas</th>
                <th className="px-3 py-3 font-bold">NIS</th>
                <th className="px-3 py-3 font-bold">Tagihan total</th>
                <th className="px-3 py-3 font-bold">Tunggakan</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {hasil.map((s) => {
                const status = statusRingkasSiswa(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini)
                const tunggakan = sppPerluSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini) + kegiatanBelum(s, biaya)
                return (
                  <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-[#FAFBFF]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={38} />
                        <div className="min-w-0">
                          <div className="truncate font-bold text-ink">{s.nama}</div>
                          <div className="truncate text-xs font-semibold text-brand">{s.nis}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">{s.kelas}</td>
                    <td className="px-3 py-3 text-muted">{s.nis}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{rp(tagihanTotal)}</td>
                    <td className={`px-3 py-3 font-semibold ${tunggakan > 0 ? 'text-danger' : 'text-muted'}`}>{rp(tunggakan)}</td>
                    <td className="px-3 py-3">
                      <Chip warna={STATUS_WARNA[status]}>{STATUS_LABEL[status]}</Chip>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3.5">
                        <button className="font-bold text-brand hover:underline" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                          Lihat
                        </button>
                        {!readOnly && (
                          <>
                            <button className="font-bold text-brand hover:underline" onClick={() => onUbah(s.id)}>
                              Edit
                            </button>
                            <button
                              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#F1F4F9]"
                              onClick={() => bukaMenu(s)}
                              aria-label="Aksi lainnya"
                            >
                              <Ikon.titikTiga size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      <Sheet buka={!!menuAksi} tutup={tutupMenu} judul={menuAksi?.nama} lead="Kelas siswa ini">
        {konfirmHapus ? (
          <>
            <p className="mb-5 text-[13.5px] text-muted">
              Yakin ingin menghapus <b className="text-ink">{menuAksi?.nama}</b>? Seluruh riwayat pembayaran siswa ini akan ikut terhapus dan tidak bisa dikembalikan.
            </p>
            <button className="w-full rounded-2xl bg-danger py-3.5 text-[15px] font-extrabold text-white" onClick={konfirmasiHapus}>
              Ya, hapus siswa
            </button>
            <div className="h-2.5" />
            <button className="bigbtn-ghost" onClick={() => setKonfirmHapus(false)}>Batal</button>
          </>
        ) : (
          <>
            <button className="bigbtn-ghost mb-2.5" onClick={() => { onUbah(menuAksi.id); tutupMenu() }}>
              Ubah data siswa
            </button>
            <button
              className="w-full rounded-2xl bg-danger-soft py-3.5 text-[15px] font-extrabold text-danger"
              onClick={() => setKonfirmHapus(true)}
            >
              Hapus siswa
            </button>
          </>
        )}
      </Sheet>
      {/* ── TAB ALUMNI ─────────────────────────────────── */}
      {tabAktif === 'alumni' && (
        <div className="card">
          {memuatAlumni ? (
            <p className="py-4 text-center text-[13px] text-muted">Memuat data alumni…</p>
          ) : alumni.length === 0 ? (
            <div className="py-6 text-center">
              <p className="mb-1 text-3xl">🎓</p>
              <p className="font-bold">Belum ada alumni</p>
              <p className="mt-1 text-[13px] text-muted">Alumni akan muncul di sini setelah proses Kenaikan Kelas / Kelulusan dijalankan.</p>
            </div>
          ) : (
            <div>
              <p className="mb-3 px-0.5 text-[12.5px] font-bold text-muted">{alumni.length} alumni</p>
              {alumni.map((s) => (
                <div key={s.id} className="row items-center border-t border-line first:border-t-0">
                  <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-bold">{s.nama}</div>
                    <div className="text-[12px] text-muted">
                      Kelas {s.kelas} · {s.nis}
                      {s.tahunLulus && <> · Lulus {s.tahunLulus}</>}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-bold text-brand"
                    onClick={() => nav("/guru/siswa/" + s.id)}
                  >
                    Lihat
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SheetImportSiswa buka={showImport} tutup={() => setShowImport(false)} />
      <SheetKenaikanKelas buka={showKenaikanKelas} tutup={() => setShowKenaikanKelas(false)} />
    </>
  )
}

const FChip = ({ on, children, ...p }) => (
  <button
    {...p}
    className={`whitespace-nowrap rounded-pill px-3.5 py-2 text-[13px] font-bold ${on ? 'bg-brand text-white' : 'bg-white text-muted'}`}
  >
    {children}
  </button>
)