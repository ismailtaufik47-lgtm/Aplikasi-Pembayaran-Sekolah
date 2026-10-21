// Skala nilai perkembangan (0052). Nilai di database selalu 1–4;
// tampilannya menurut pengaturan sekolah: BB/MB/BSH/BSB, bintang, atau tanpa skala.

const BMBSH = [
  { kode: 'BB', label: 'Belum Berkembang' },
  { kode: 'MB', label: 'Mulai Berkembang' },
  { kode: 'BSH', label: 'Berkembang Sesuai Harapan' },
  { kode: 'BSB', label: 'Berkembang Sangat Baik' },
]
const BINTANG = [1, 2, 3, 4].map((n) => ({ kode: '★'.repeat(n), label: `${n} bintang dari 4` }))

/** Nama kelas tampilan, sama dengan aplikasi kas: "A" → "Kelas A". */
export const namaKelas = (k) => (!k ? '—' : /^kelas\b/i.test(k) ? k : `Kelas ${k}`)

export const pakaiSkala = (skala) => skala !== 'tanpa'
export const daftarSkala = (skala) => (skala === 'bintang' ? BINTANG : BMBSH)
export const infoNilai = (skala, n) => daftarSkala(skala)[Math.min(4, Math.max(1, Math.round(n))) - 1]

export const PILIHAN_DASAR = [
  { id: 'merdeka', judul: 'Kurikulum Merdeka', sub: '3 elemen: Agama & budi pekerti · Jati diri · Literasi, numerasi & seni' },
  { id: 'stppa', judul: '6 aspek perkembangan (STPPA)', sub: 'Agama-moral · Fisik-motorik · Kognitif · Bahasa · Sosial-emosional · Seni' },
  { id: 'sendiri', judul: 'Buat sendiri', sub: 'Mulai dari kosong, isi aspek & indikator sesuai sekolah' },
]
export const PILIHAN_SKALA = [
  { id: 'bmbsh', judul: '4 tingkat (BB · MB · BSH · BSB)' },
  { id: 'bintang', judul: 'Bintang 1–4' },
  { id: 'tanpa', judul: 'Tanpa skala — catatan saja' },
]
export const PILIHAN_PERIODE = [
  { id: 'minggu', label: 'Minggu' },
  { id: '2minggu', label: '2 minggu' },
  { id: 'bulan', label: 'Bulan' },
  { id: 'tema', label: 'Tema' },
]

/** Teks waktu singkat: "Hari ini, 10.15" / "Kemarin" / "12 Okt". */
export function waktuSingkat(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const kini = new Date()
  const hari = (a) => new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const selisih = Math.round((hari(kini) - hari(d)) / 86400000)
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  if (selisih === 0) return `Hari ini, ${jam}`
  if (selisih === 1) return 'Kemarin'
  if (selisih < 7) return `${selisih} hari lalu`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() === kini.getFullYear() ? undefined : 'numeric' })
}
