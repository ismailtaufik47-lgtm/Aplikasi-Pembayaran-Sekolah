/**
 * Label kegiatan untuk pengeluaran kas (0035): pilihan kegiatan (biaya
 * kegiatan + paket PMB / daftar ulang) dan rekap "uang masuk vs terpakai".
 * Dipakai halaman Kas, Laporan › Kegiatan, dan Excel-nya.
 */
import { emojiKegiatan } from './emojiKegiatan.js'
import { EMOJI_JENIS } from './paket.js'
import { rekapKegiatan } from './kas.js'
import { tahunAjaranBerjalan } from './format.js'

/** Paket PMB / daftar ulang tahun ajaran ini & tahun depan — paket tahun lalu ada di Laporan › Tahunan (v32). */
export const paketBerjalan = (paket = []) => {
  const kini = tahunAjaranBerjalan()
  return paket.filter((p) => !p.tahunAjaran || p.tahunAjaran >= kini)
}

/** [{ kunci: 'b:<id>'|'p:<id>', biayaId, paketId, nama, emoji }] — paket semua tahun (untuk menampilkan label baris lama). */
export const pilihanKegiatan = (biaya = [], paket = []) => [
  ...biaya.map((b) => ({ kunci: 'b:' + b.id, biayaId: b.id, paketId: null, nama: b.nama, emoji: emojiKegiatan(b) })),
  ...paket.map((p) => ({ kunci: 'p:' + p.id, biayaId: null, paketId: p.id, nama: p.nama, emoji: EMOJI_JENIS[p.jenis] })),
]

/** Kunci label sebuah baris kas ('' = tanpa label / operasional). */
export const kunciLabel = (x) => (x?.biayaId ? 'b:' + x.biayaId : x?.paketId ? 'p:' + x.paketId : '')

/** { biayaId, paketId } dari kunci pilihan. */
export const dariKunci = (kunci) => ({
  biayaId: kunci?.startsWith('b:') ? kunci.slice(2) : null,
  paketId: kunci?.startsWith('p:') ? kunci.slice(2) : null,
})

export const hitungRekapKegiatan = ({ biaya, paket, siswa, pengeluaran, pembayaran = null }) =>
  rekapKegiatan({ biaya, paket: paketBerjalan(paket), siswa, pengeluaran, pembayaran, emojiKegiatan, emojiPaket: EMOJI_JENIS })
