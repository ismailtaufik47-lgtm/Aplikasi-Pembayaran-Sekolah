/**
 * Lonceng panel sekolah: "siswa yang perlu ditagih".
 *
 * Angka merah di lonceng = siswa yang BARU masuk daftar tagih sejak lonceng
 * terakhir diketuk. Setelah diketuk angkanya hilang, dan baru muncul lagi
 * kalau ada tunggakan baru (siswa lain mulai menunggak, atau bulan
 * tunggakan seorang siswa bertambah).
 *
 * Tanda "sudah dilihat" disimpan di perangkat ini saja (localStorage),
 * per sekolah — tidak mengubah database.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { useData } from './store.jsx'
import { bulanBerjalan, perluDitagihSekarang, statusSpp } from './format.js'
import { paketTerlambat, tahapPaket, dibayarPaket } from './paket.js'

const KUNCI = 'kasceria-lonceng-dilihat'
const pendengar = new Set()
let cache = null

function bacaSemua() {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KUNCI)) || {}
  } catch {
    cache = {}
  }
  return cache
}

function simpan(sekolahId, daftar) {
  cache = { ...bacaSemua(), [sekolahId]: daftar }
  try {
    localStorage.setItem(KUNCI, JSON.stringify(cache))
  } catch {
    /* mode privat — tetap berlaku sampai halaman ditutup */
  }
  pendengar.forEach((f) => f())
}

const langganan = (f) => {
  pendengar.add(f)
  return () => pendengar.delete(f)
}

/** Tanda satu siswa di daftar tagih: id + bulan SPP yang belum beres + tahap PMB/DU yang terlambat. */
function tandaSiswa(s, pengaturan, kini, telat = []) {
  const bulan = []
  for (let i = 0; i <= kini; i++) {
    const st = statusSpp(s.spp[i] || 0, pengaturan.sppNominal, i, kini, pengaturan.tanggalJatuhTempo)
    if (st === 'nunggak' || st === 'belum-bayar' || st === 'sebagian') bulan.push(i)
  }
  const pk = telat.map(({ p }) => `${p.id}:${tahapPaket(p, dibayarPaket(s, p.id)).filter((t) => t.lewat && !t.lunas).length}`)
  return `${s.id}:${bulan.join(',')}${pk.length ? '|' + pk.join(',') : ''}`
}

/**
 * { jumlah, baru, tandai }
 *   jumlah : semua siswa yang perlu ditagih sekarang
 *   baru   : yang belum pernah dilihat (angka di lonceng)
 *   tandai : panggil saat lonceng diketuk → baru jadi 0
 */
export function useLoncengTagih() {
  const { siswa, paket, pengaturan, boleh } = useData()
  const semua = useSyncExternalStore(langganan, bacaSemua, bacaSemua)
  const lihat = boleh('pembayaran', 'lihat') || boleh('siswa', 'lihat')
  const kini = bulanBerjalan()
  const tanda = useMemo(
    () => (lihat && pengaturan
      ? siswa
          .map((s) => ({ s, telat: paketTerlambat(paket, s) }))
          .filter(({ s, telat }) => telat.length || perluDitagihSekarang(s, pengaturan.sppNominal, pengaturan.tanggalJatuhTempo, kini))
          .map(({ s, telat }) => tandaSiswa(s, pengaturan, kini, telat))
      : []),
    [lihat, siswa, paket, pengaturan, kini],
  )
  const id = pengaturan?.id || 'demo'
  const sudah = new Set(semua[id] || [])
  const baru = tanda.filter((t) => !sudah.has(t)).length
  return { lihat, jumlah: tanda.length, baru, tandai: () => simpan(id, tanda) }
}
