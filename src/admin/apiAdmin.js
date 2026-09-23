/**
 * Panggilan Supabase khusus panel admin aplikasi (/admin).
 *
 * Semua fungsi di sini memanggil RPC security definer dari
 * 0018_panel_admin.sql yang sendiri memeriksa saya_admin_aplikasi() —
 * jadi walau seseorang memanggilnya dari akun sekolah biasa, database
 * tetap menolak. Pemeriksaan di layar hanya untuk kenyamanan.
 */
import { supabase, modeDemo } from '../lib/supabase.js'
import { HARGA_PER_SISWA_DEFAULT } from '../lib/langganan.js'

export { modeDemo }

async function rpc(nama, param) {
  const { data, error } = await supabase.rpc(nama, param)
  if (error) throw new Error(error.message)
  return data
}

/** true kalau akun yang sedang login terdaftar di tabel admin_aplikasi. */
export const cekAdmin = () => rpc('saya_admin_aplikasi')

/** Semua sekolah + status langganan, tanggal, kontak, total dibayar. */
export const daftarSekolah = async () => (await rpc('daftar_langganan')) || []

/** Riwayat perpanjangan N bulan terakhir (untuk grafik & halaman riwayat). */
export const riwayat = async (bulanTerakhir = 24) =>
  (await rpc('admin_riwayat_langganan', { p_bulan_terakhir: bulanTerakhir })) || []

/** Perpanjang + otomatis catat ke riwayat. Nominal dihitung di database:
 *  siswa aktif × tarif sekolah (atau tarif default aplikasi) × bulan. */
export const perpanjang = (sekolahId, bulan = 1) =>
  rpc('admin_perpanjang', {
    p_sekolah_id: sekolahId,
    p_bulan: bulan,
    p_tarif_default: HARGA_PER_SISWA_DEFAULT,
  })

/** Batalkan perpanjangan (hanya transaksi terakhir sebuah sekolah). */
export const batalkan = (riwayatId) => rpc('admin_batalkan_perpanjang', { p_riwayat_id: riwayatId })

/** Nonaktifkan (true) / aktifkan kembali (false) sebuah sekolah secara paksa. */
export const setNonaktif = (sekolahId, nonaktif) =>
  rpc('admin_set_nonaktif', { p_sekolah_id: sekolahId, p_nonaktif: nonaktif })

/** Tarif khusus per siswa. null = kembali ke tarif default aplikasi. */
export const ubahTarif = (sekolahId, harga) =>
  rpc('ubah_harga_per_siswa', { p_sekolah_id: sekolahId, p_harga: harga })
