/**
 * Pembuat file ZIP sederhana (tanpa kompresi, metode "store") untuk
 * "Unduh semua nota". Foto JPG/PNG sudah terkompresi, jadi zip tanpa
 * kompresi ukurannya hampir sama — dan tidak perlu menambah pustaka baru.
 *
 * buatZip([{ nama: 'a.jpg', isi: Blob|Uint8Array }]) → Blob (application/zip)
 */

let TABEL_CRC = null
function crc32(buf) {
  if (!TABEL_CRC) {
    TABEL_CRC = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABEL_CRC[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = TABEL_CRC[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Tanggal & jam format DOS (dipakai ZIP). */
function waktuDos(d = new Date()) {
  const waktu = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const tanggal = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { waktu, tanggal }
}

export async function buatZip(berkas) {
  const enc = new TextEncoder()
  const bagian = []
  const pusat = []
  let posisi = 0
  const { waktu, tanggal } = waktuDos()
  const dipakai = new Set()

  for (const f of berkas) {
    const isi = f.isi instanceof Uint8Array ? f.isi : new Uint8Array(await f.isi.arrayBuffer())
    // nama kembar → tambahkan (2), (3), …
    let nama = f.nama
    for (let n = 2; dipakai.has(nama); n++) nama = f.nama.replace(/(\.[a-z0-9]+)?$/i, ` (${n})$1`)
    dipakai.add(nama)
    const namaB = enc.encode(nama)
    const crc = crc32(isi)

    const lokal = new DataView(new ArrayBuffer(30))
    lokal.setUint32(0, 0x04034b50, true)
    lokal.setUint16(4, 20, true)
    lokal.setUint16(6, 0x0800, true) // nama file UTF-8
    lokal.setUint16(8, 0, true) // store
    lokal.setUint16(10, waktu, true)
    lokal.setUint16(12, tanggal, true)
    lokal.setUint32(14, crc, true)
    lokal.setUint32(18, isi.length, true)
    lokal.setUint32(22, isi.length, true)
    lokal.setUint16(26, namaB.length, true)
    lokal.setUint16(28, 0, true)
    bagian.push(new Uint8Array(lokal.buffer), namaB, isi)

    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, waktu, true)
    c.setUint16(14, tanggal, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, isi.length, true)
    c.setUint32(24, isi.length, true)
    c.setUint16(28, namaB.length, true)
    c.setUint32(42, posisi, true)
    pusat.push(new Uint8Array(c.buffer), namaB)

    posisi += 30 + namaB.length + isi.length
  }

  const ukuranPusat = pusat.reduce((t, b) => t + b.length, 0)
  const akhir = new DataView(new ArrayBuffer(22))
  akhir.setUint32(0, 0x06054b50, true)
  akhir.setUint16(8, berkas.length, true)
  akhir.setUint16(10, berkas.length, true)
  akhir.setUint32(12, ukuranPusat, true)
  akhir.setUint32(16, posisi, true)
  return new Blob([...bagian, ...pusat, new Uint8Array(akhir.buffer)], { type: 'application/zip' })
}
