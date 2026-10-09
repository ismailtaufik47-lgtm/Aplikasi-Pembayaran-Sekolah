/**
 * Data untuk indikator kesehatan keuangan — dipakai dasbor kepala sekolah
 * dan layar Atur indikator supaya angkanya selalu sama.
 *   d          : { siap, galat, info, lap, arus, keg, riwayat }
 *   indikator  : pengaturan tersimpan { isi, diubahNama, diubahPada, belumAktif }
 *   hitung(isi): hasil hitungKesehatan() untuk aturan `isi` (bisa draf yang belum disimpan)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../lib/store.jsx'
import * as api from '../lib/api.js'
import { bulanBerjalan, tanggalISO } from '../lib/format.js'
import { kunciBulan } from '../lib/kas.js'
import { hitungRekapKegiatan } from '../lib/kegiatanKas.js'
import { statusSiswa } from '../lib/statusSiswa.js'
import { hitungKesehatan } from '../lib/kesehatan.js'

export function useKesehatan() {
  const { pengaturan, siswa, biaya, paket, pembayaran } = useData()
  const kini = bulanBerjalan()
  const bulanIni = kunciBulan(tanggalISO())
  const demo = useRef({})
  demo.current = { pembayaran, biaya, paket }
  const [versi, setVersi] = useState(0)
  const [d, setD] = useState({ siap: false })
  const [indikator, setIndikator] = useState({ isi: null })

  useEffect(() => {
    let aktif = true
    const aman = (p, cadangan) => p.catch(() => cadangan)
    Promise.all([
      api.kasRingkasan(demo.current),
      api.kasLaporanBulan(bulanIni, demo.current),
      api.kasArus(bulanIni, 7, demo.current),
      aman(api.kasPengeluaranKegiatan(), []),
      aman(api.kasRiwayat({ dari: `${bulanIni}-01`, sampai: tanggalISO(), batas: 300 }, demo.current), { item: [] }),
      aman(api.muatIndikator(), { isi: null }),
    ])
      .then(([info, lap, arus, keg, riwayat, ind]) => {
        if (!aktif) return
        setD({ siap: true, info, lap, arus, keg, riwayat: riwayat.item || [], galat: '' })
        setIndikator(ind)
      })
      .catch((e) => aktif && setD({ siap: true, galat: e.message }))
    return () => { aktif = false }
  }, [bulanIni, versi, pembayaran])

  const statusList = useMemo(() => {
    const ctx = { biaya, paket, sppNominal: pengaturan.sppNominal, kini }
    return siswa.map((s) => ({ siswa: s, ...statusSiswa(s, ctx) }))
  }, [siswa, biaya, paket, pengaturan.sppNominal, kini])

  const rekap = useMemo(
    () => (d.siap && !d.galat ? hitungRekapKegiatan({ biaya, paket, siswa, pengeluaran: d.keg || [] }) : []),
    [d, biaya, paket, siswa],
  )

  const nota = useMemo(() => {
    const keluar = (d.riwayat || []).filter((k) => k.sumber === 'kas' && k.jenis === 'keluar' && !k.dibatalkanPada && !k.sebelumMulai)
    return { total: keluar.length, ada: keluar.filter((k) => k.adaNota).length, tanpa: keluar.filter((k) => !k.adaNota) }
  }, [d.riwayat])

  const hitung = useCallback((isi) => {
    if (!d.siap || d.galat) return null
    const keluarKegiatan = {}
    ;(d.keg || []).forEach((k) => {
      const b = String(k.tanggal).slice(0, 7)
      keluarKegiatan[b] = (keluarKegiatan[b] || 0) + Number(k.nominal || 0)
    })
    return hitungKesehatan({
      hariIni: new Date(), adaSaldoAwal: !!d.info?.pengaturan, saldoKini: d.info?.saldoKini || 0,
      arus: d.arus || [], keluarKegiatan, kegiatan: rekap, siswa, sppNominal: pengaturan.sppNominal, kini,
      status: statusList, nota,
    }, isi)
  }, [d, rekap, siswa, pengaturan.sppNominal, kini, statusList, nota])

  const kes = useMemo(() => hitung(indikator.isi), [hitung, indikator.isi])

  return { d, kes, hitung, indikator, setIndikator, statusList, rekap, nota, kini, bulanIni, muatUlang: () => setVersi((v) => v + 1), versi }
}
