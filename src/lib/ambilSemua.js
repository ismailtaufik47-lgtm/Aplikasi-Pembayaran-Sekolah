/**
 * Ambil SEMUA baris sebuah tabel, walau lebih dari 1.000.
 *
 * Supabase membatasi satu permintaan maksimal 1.000 baris (Settings › API ›
 * Max rows). Tanpa ini, sekolah dengan > 1.000 catatan pembayaran (±100 siswa
 * × 10 bulan) diam-diam hanya menerima 1.000 baris pertama — tunggakan,
 * status lunas, dan laporan jadi salah TANPA pesan galat apa pun.
 *
 * `buat` = fungsi yang membuat query BARU setiap dipanggil, dan urutannya
 * harus pasti (tambahkan .order('id') sebagai urutan terakhir) supaya tidak
 * ada baris yang terlewat/terulang antar halaman.
 *
 *   const r = await ambilSemua(() => supabase.from('pembayaran').select('*', { count: 'exact' })
 *     .eq('sekolah_id', id).order('dibayar_pada', { ascending: false }).order('id'))
 *
 * Pakai { count: 'exact' }: dengan jumlah dari server, pengambilan tetap lengkap
 * walau batas "Max rows" di Supabase diubah lebih kecil dari 1.000.
 *
 * → { data, error } seperti query Supabase biasa. File ini sengaja tanpa
 *   import lain supaya bisa dipakai juga oleh skrip uji (uji/js).
 */
export async function ambilSemua(buat, ukuran = 1000) {
  const semua = []
  let total = null
  for (let halaman = 0; halaman < 1000; halaman++) {
    const dari = semua.length
    const { data, error, count } = await buat().range(dari, dari + ukuran - 1)
    if (error) return { data: null, error }
    if (count != null) total = count
    semua.push(...(data || []))
    // selesai kalau: jumlah sudah sesuai hitungan server, atau halaman terakhir kosong/tidak penuh
    if (!data?.length) break
    if (total != null ? semua.length >= total : data.length < ukuran) break
  }
  return { data: semua, error: null, count: total ?? semua.length }
}
