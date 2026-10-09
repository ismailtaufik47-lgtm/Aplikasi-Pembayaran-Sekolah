import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import { BtnKecil, Chevron, Chip, Ikon, KepalaHalaman, KolomCari, Kosong, KosongCeria, Pil, Sheet } from '../components/ui.jsx'
import { useData } from '../lib/store.jsx'
import SheetImportSiswa from './SheetImportSiswa.jsx'
import SheetKenaikanKelas from './SheetKenaikanKelas.jsx'
import * as api from '../lib/api.js'
import { paketSiswa } from '../lib/paket.js'
import { pesanKunci } from '../lib/langganan.js'
import { bulanBerjalan, rp, taPendek, tahunAjaranBerjalan, targetSppTahun, totalKegiatanSiswa } from '../lib/format.js'
import { geserTa } from '../lib/bentukData.js'
import { STATUS_TAGIHAN, statusSiswa } from '../lib/statusSiswa.js'
import UbinStatus from '../components/UbinStatus.jsx'

/** Warna teks alasan di bawah chip status. */
const WARNA_ALASAN = { nunggak: 'text-danger', mencicil: 'text-warn-deep', belum: 'text-[#3A4256] dark:text-[#B8C3DC]', lunas: 'text-ok-deep' }

export default function DaftarSiswa({ onTambah, onUbah, terkunci = false }) {
  const { siswa, biaya, paket = [], pengaturan, hapusSiswa, segarkan, toast, boleh } = useData()
  const readOnly = !boleh('siswa')
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
  const [filter, setFilter] = useState('') // kelas
  const [filterStatus, setFilterStatus] = useState('semua') // semua | nunggak | mencicil | belum | lunas
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

  // Status tiap siswa — aturan yang sama dengan menu Tagihan (lib/statusSiswa.js)
  const statusPer = useMemo(() => {
    const ctx = { biaya, paket, sppNominal: pengaturan.sppNominal, kini }
    return new Map(siswa.map((s) => [s.id, statusSiswa(s, ctx)]))
  }, [siswa, biaya, paket, pengaturan.sppNominal, kini])
  const st = (s) => statusPer.get(s.id) || { status: 'lunas', tunggakan: 0, alasan: '' }

  const hasil = siswa.filter((s) => {
    const q = cari.toLowerCase()
    if (q && !(s.nama.toLowerCase().includes(q) || s.nis.includes(q))) return false
    if (filter && s.kelas !== filter) return false
    if (filterStatus !== 'semua' && st(s).status !== filterStatus) return false
    return true
  })

  /** Ringkasan (ubin & header tabel) — dari siswa kelas terpilih, tidak terpengaruh pencarian. */
  const ringkasan = useMemo(() => {
    const r = { nunggak: 0, mencicil: 0, belum: 0, lunas: 0 }
    siswa.forEach((s) => { if (!filter || s.kelas === filter) r[statusPer.get(s.id)?.status || 'lunas']++ })
    return r
  }, [siswa, statusPer, filter])

  // total setahun per siswa: bulan saat terdaftar × tarif kelasnya + kegiatan yang ditagihkan (0042)
  const tagihanTotal = (s) => targetSppTahun(s, pengaturan.sppNominal) + totalKegiatanSiswa(s, biaya)

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
      <KepalaHalaman
        judul="Siswa"
        gambar="anak"
        sub={
          siswa.length
            ? `${siswa.length} siswa aktif · ${kelas.length} kelas`
            : 'Belum ada siswa terdaftar'
        }
        aksiHp={
          !readOnly && (
            <>
              <button
                className="tombol-putih grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] text-ink"
                onClick={() => setShowKenaikanKelas(true)}
                title="Kenaikan kelas"
                aria-label="Kenaikan kelas"
              >
                <Ikon.toga size={20} />
              </button>
              <BtnKecil onClick={bukaImport} className={`h-[42px] ${gayaKunci}`} title={terkunci ? 'Terkunci sampai langganan diperpanjang' : 'Import dari Excel'}>
                <Ikon.unggah size={17} />
                Import
              </BtnKecil>
              <BtnKecil utama onClick={onTambah} className={`h-[42px] ${gayaKunci}`} title={terkunci ? 'Terkunci sampai langganan diperpanjang' : undefined}>
                {terkunci ? <Ikon.jam size={17} /> : <Ikon.plus size={17} />}
                Siswa
              </BtnKecil>
            </>
          )
        }
        aksi={
          !readOnly && (
            <>
              <BtnKecil onClick={() => setShowKenaikanKelas(true)}>
                <Ikon.toga size={17} />
                Kenaikan kelas
              </BtnKecil>
              <BtnKecil onClick={bukaImport} className={gayaKunci} title={terkunci ? 'Terkunci sampai langganan diperpanjang' : 'Import dari Excel'}>
                <Ikon.unggah size={17} />
                Import Excel
              </BtnKecil>
              <BtnKecil utama onClick={onTambah} className={gayaKunci} title={terkunci ? 'Terkunci sampai langganan diperpanjang' : undefined}>
                {terkunci ? <Ikon.jam size={17} /> : <Ikon.plus size={17} />}
                Tambah siswa
              </BtnKecil>
            </>
          )
        }
      />

      <KolomCari nilai={cari} ubah={setCari} placeholder="Cari nama atau NIS…" className="mb-3 lg:max-w-md" />

      {/* Tab Aktif / Alumni */}
      {/* Sakelar ringkas selebar isinya (bukan membentang penuh) */}
      <div className="mb-3 inline-flex gap-1 rounded-[18px] bg-kartu/70 p-1 shadow-[0_4px_14px_rgba(30,64,140,.06)] dark:bg-white/5" role="tablist">
        <button
          role="tab"
          aria-selected={tabAktif === 'aktif'}
          onClick={() => { setTabAktif('aktif'); setFilter(''); setCari('') }}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[14px] px-4 py-2 text-[13px] font-extrabold transition ${tabAktif === 'aktif' ? 'permen permen-kecil permen-biru' : 'text-muted hover:text-ink'}`}
        >
          <Ikon.siswa size={16} /> Siswa aktif
        </button>
        <button
          role="tab"
          aria-selected={tabAktif === 'alumni'}
          onClick={bukaTabAlumni}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[14px] px-4 py-2 text-[13px] font-extrabold transition ${tabAktif === 'alumni' ? 'permen permen-kecil permen-ungu' : 'text-muted hover:text-ink'}`}
        >
          <Ikon.toga size={16} /> Alumni
        </button>
      </div>

      {tabAktif === 'aktif' && !readOnly && <PengingatKenaikan siswa={siswa} info={pengaturan.infoTa} buka={() => setShowKenaikanKelas(true)} />}

      {tabAktif === 'aktif' && siswa.length > 0 && (
        <>
          <UbinStatus hitung={ringkasan} aktif={filterStatus} pilih={setFilterStatus} />
          <p className="mb-3 mt-2 flex items-start gap-1.5 px-0.5 text-[12px] font-semibold leading-snug text-muted">
            <Ikon.info size={15} className="mt-px shrink-0" />
            <span>Status = tagihan siswa yang paling mendesak (SPP, kegiatan, PMB/daftar ulang) — sama dengan menu Tagihan.</span>
          </p>
        </>
      )}

      {tabAktif === 'aktif' && (
      <div className="noscroll -mx-[18px] mb-2 flex gap-2 overflow-x-auto px-[18px] pb-1 lg:mx-0 lg:px-0">
        <Pil on={filter === ''} onClick={() => setFilter('')}>Semua kelas</Pil>
        {kelas.map((k) => (
          <Pil key={k} on={filter === k} onClick={() => setFilter(k)}>Kelas {k}</Pil>
        ))}
      </div>
      )}

      {tabAktif === 'aktif' && (
      <>
      {/* ---------- mobile: daftar kartu ---------- */}
      <div className="card lg:hidden">
        {hasil.length === 0 ? (
          siswa.length === 0 ? (
            <KosongSiswa readOnly={readOnly} onTambah={onTambah} onImport={bukaImport} />
          ) : (
            <Kosong>Tidak ada siswa yang cocok dengan pencarian / saringan.</Kosong>
          )
        ) : (
          hasil.map((s) => {
            const x = st(s)
            return (
              <button key={s.id} className="row w-full items-start text-left" onClick={() => nav(`/guru/siswa/${s.id}`)}>
                <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14.5px] font-bold">{s.nama}</span>
                    <Chip warna={STATUS_TAGIHAN[x.status].chip}>{STATUS_TAGIHAN[x.status].label}</Chip>
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">Kelas {s.kelas} · NIS {s.nis}{s.daftarDepan ? ` · mulai ${taPendek(s.daftarDepan.ta)}` : ''}</span>
                  <span className="mt-1 flex items-baseline justify-between gap-2 text-[12.5px] font-bold">
                    <span className={`min-w-0 break-words ${WARNA_ALASAN[x.status]}`}>{x.alasan}</span>
                    {x.tunggakan > 0 && <span className="shrink-0 text-danger">{rp(x.tunggakan)}</span>}
                  </span>
                </span>
                <Chevron />
              </button>
            )
          })
        )}
      </div>

      {/* ---------- desktop: tabel data ---------- */}
      <div className="card hidden overflow-hidden !p-0 lg:block">
        {siswa.length > 0 && (
          <div className="border-b border-line px-5 py-3 text-[13px] font-bold text-muted">
            {hasil.length} siswa ditampilkan · {ringkasan.nunggak} Nunggak · {ringkasan.mencicil} Mencicil · {ringkasan.belum} Belum bayar · {ringkasan.lunas} Lunas
          </div>
        )}
        {hasil.length === 0 ? (
          <div className="p-5">
            {siswa.length === 0
              ? <KosongSiswa readOnly={readOnly} onTambah={onTambah} onImport={bukaImport} />
              : <Kosong>Tidak ada siswa yang cocok dengan pencarian / saringan.</Kosong>}
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
                // Tunggakan = tagihan yang SUDAH LEWAT jatuh tempo (SPP bulan lalu,
                // kegiatan yang tanggalnya lewat, tahap PMB/DU yang lewat)
                const x = st(s)
                const tunggakan = x.tunggakan
                const pkSiswa = paketSiswa(paket, s.id)
                const totalSiswa = tagihanTotal(s) + pkSiswa.reduce((t, p) => t + p.total, 0)
                return (
                  <tr key={s.id} className={`border-b border-line last:border-b-0 hover:bg-[#FAFBFF] dark:hover:bg-white/5 ${x.status === 'nunggak' ? 'shadow-[inset_4px_0_0_#EF4444]' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nama={s.nama} jenis={s.jenis} avatar={s.avatar} foto={s.foto} size={38} />
                        <div className="min-w-0">
                          <div className="truncate font-bold text-ink">{s.nama}</div>
                          <div className="truncate text-xs font-semibold text-brand">{s.nis}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {s.kelas}
                      {s.daftarDepan && <span className="ml-1.5 whitespace-nowrap rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-extrabold text-brand">mulai {taPendek(s.daftarDepan.ta)}</span>}
                    </td>
                    <td className="px-3 py-3 text-muted">{s.nis}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{rp(totalSiswa)}</td>
                    <td className={`px-3 py-3 font-semibold ${tunggakan > 0 ? 'text-danger' : 'text-muted'}`}>{rp(tunggakan)}</td>
                    <td className="max-w-[260px] px-3 py-3">
                      <Chip warna={STATUS_TAGIHAN[x.status].chip}>{STATUS_TAGIHAN[x.status].label}</Chip>
                      <div className="mt-1 text-[12px] font-semibold leading-snug text-muted">{x.alasan}</div>
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
              <span className="permen permen-ungu mx-auto mb-2.5 grid h-14 w-14 place-items-center rounded-[18px]"><Ikon.toga size={28} /></span>
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
                    className="shrink-0 rounded-xl border border-line bg-kartu px-3 py-1.5 text-[12px] font-bold text-brand"
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

/** Belum ada siswa sama sekali → ajakan bergambar. */
const KosongSiswa = ({ readOnly, onTambah, onImport }) => (
  <KosongCeria
    judul="Kelasnya masih sepi"
    aksi={!readOnly && (
      <>
        <button className="bigbtn flex items-center justify-center gap-2" onClick={onTambah}><Ikon.plus size={19} /> Tambah siswa</button>
        <button className="bigbtn-ghost flex items-center justify-center gap-2" onClick={onImport}><Ikon.unggah size={18} /> Import dari Excel</button>
      </>
    )}
  >
    {readOnly ? 'Belum ada siswa terdaftar di sekolah ini.' : 'Tambahkan siswa satu per satu, atau langsung import dari file Excel data sekolah.'}
  </KosongCeria>
)

/**
 * Pengingat kenaikan kelas (0042):
 *   April–Juni  : tahun ajaran depan belum disiapkan
 *   Juli–Maret  : tahun ini dibuka otomatis (siswa dibawa ke kelas yang sama) & wizard belum dijalankan
 */
function PengingatKenaikan({ siswa, info, buka }) {
  if (!info || !siswa.length) return null
  const ta = tahunAjaranBerjalan()
  const bln = bulanBerjalan()
  const siapkan = bln >= 9 && !info.kenaikanDepanSudah
  const telat = bln < 9 && info.kenaikanSudah === false && siswa.some((s) => (s.keanggotaan || []).some((k) => k.ta === geserTa(ta, -1)))
  if (!siapkan && !telat) return null
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[20px] bg-warn-soft px-4 py-3 lg:max-w-3xl">
      <span className="text-[26px] leading-none" aria-hidden="true">🎓</span>
      <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-warn-deep">
        <b className="block font-extrabold">{siapkan ? `Tahun ajaran ${geserTa(ta, 1)} mulai 1 Juli` : `Kenaikan kelas ${ta} belum diproses`}</b>
        {siapkan
          ? 'Siapkan kenaikan kelas & kelulusan sekarang — kelas siswa berubah otomatis saat tahun ajaran baru dimulai.'
          : 'Siswa sementara dibawa ke kelas yang sama seperti tahun lalu. Proses kenaikan supaya kelas & tarif SPP-nya benar.'}
      </p>
      <button type="button" onClick={buka} className="shrink-0 rounded-pill bg-warn px-3.5 py-2 text-[12.5px] font-extrabold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,.12)]">
        {siapkan ? 'Siapkan' : 'Proses sekarang'}
      </button>
    </div>
  )
}
