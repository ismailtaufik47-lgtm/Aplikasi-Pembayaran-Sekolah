/**
 * Satu sumber kebenaran untuk data sekolah, dipakai bersama panel guru dan
 * portal orang tua.
 *
 * Pola yang dipakai: perubahan langsung ditampilkan di layar (optimistis),
 * lalu dikirim ke Supabase. Kalau server menolak, perubahan dibatalkan dan
 * guru diberi tahu — bukan dibiarkan seolah tersimpan.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import * as api from './api.js'
import { BULAN, namaBulanTa, rp, tahunAjaranBerjalan, targetSpp, waktuTampil } from './format.js'
import { tarifKelas, targetDari, wajibKegiatan } from './bentukData.js'
import { cekAkses, lengkapiAkses } from './akses.js'
import { hitungLangganan, pesanKunci } from './langganan.js'

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

export function DataProvider({ children }) {
  const [siap, setSiap] = useState(false)
  const [galat, setGalat] = useState('')
  // Portal orang tua: alasan gerbang NIS menolak ({ galat, sisa, menit }), null kalau tidak.
  const [gerbang, setGerbang] = useState(null)
  const [pengaturan, setPengaturan] = useState(null)
  const [biaya, setBiaya] = useState([])
  const [biayaLain, setBiayaLain] = useState([]) // kegiatan tahun ajaran lain (0042)
  const [siswa, setSiswa] = useState([])
  const [siswaLain, setSiswaLain] = useState([]) // siswa lulus / keluar yang pembayarannya ikut termuat (0044)
  const [pembayaran, setPembayaran] = useState([])
  const [paket, setPaket] = useState([]) // PMB & daftar ulang (lib/paket.js)
  const [wali, setWali] = useState(null)
  const [petugas, setPetugas] = useState('')
  const [peran, setPeran] = useState('')
  const [akses, setAkses] = useState({})
  const [pinAktif, setPinAktif] = useState(false)
  const [avatarSaya, setAvatarSaya] = useState(null)
  const [pesan, setPesan] = useState('')
  const sedang = useRef('')
  const terakhir = useRef('') // sumber muat terakhir — dipakai "Coba lagi" walau muat sebelumnya gagal

  function toast(teks) {
    setPesan(teks)
    clearTimeout(toast._t)
    // Pesan panjang (mis. alasan penolakan saldo kas) diberi waktu baca lebih lama.
    toast._t = setTimeout(() => setPesan(''), Math.min(9000, 2600 + String(teks).length * 35))
  }

  const terapkan = (d) => {
    setPengaturan(d.pengaturan)
    setBiaya(d.biaya)
    setBiayaLain(d.biayaLain || [])
    setSiswa(d.siswa)
    setSiswaLain(d.siswaLain || [])
    setPembayaran(d.pembayaran)
    setPaket(d.paket || [])
    setWali(d.wali)
    setPetugas(d.petugas || '')
    setPeran(d.peran || '')
    setAkses(d.akses || (d.peran ? lengkapiAkses(d.peran, null) : {}))
    setPinAktif(!!d.pinAktif)
    setAvatarSaya(Number.isInteger(d.avatarSaya) ? d.avatarSaya : null)
    setSiap(true)
    setGalat('')
  }

  /** Dipanggil sekali oleh GuruApp / OrtuApp sesuai perannya. */
  const muat = useCallback(async (sumber) => {
    const kunci = JSON.stringify(sumber)
    if (sedang.current === kunci) return
    sedang.current = kunci
    terakhir.current = kunci
    setSiap(false)
    setGalat('')
    try {
      terapkan(
        sumber.mode === 'ortu' ? await api.muatDataPortal(sumber.token, sumber.nis) : await api.muatDataGuru()
      )
      setGerbang(null)
    } catch (e) {
      sedang.current = ''
      setGerbang(e.gerbang || null)
      setGalat(e.message)
    }
  }, [])

  const segarkan = useCallback(async () => {
    const kunci = sedang.current || terakhir.current
    sedang.current = ''
    if (kunci) await muat(JSON.parse(kunci))
  }, [muat])

  /* ---------- aksi guru ---------- */

  /**
   * Menambah (atau mengurangi, kalau delta negatif) rupiah yang tercatat
   * untuk satu bulan/kegiatan siswa. Dipakai catatPembayaran (delta positif,
   * bisa dipanggil berkali-kali untuk cicilan) dan batalkanPembayaran
   * (delta negatif, mengembalikan angka setelah satu transaksi dihapus).
   */
  const tambahJumlah = (siswaId, jenis, indeks, delta, ta, biayaId) =>
    setSiswa((lama) =>
      lama.map((x) => {
        if (x.id !== siswaId) return x
        const salin = { ...x, spp: [...x.spp], sppLalu: { ...(x.sppLalu || {}) }, kegiatan: [...x.kegiatan], paket: { ...(x.paket || {}) } }
        // kegiatan tahun ajaran lain (0042): dicatat per id kegiatan
        if (jenis === 'kegiatan' && (indeks == null || indeks < 0) && biayaId) {
          salin.kegiatanLalu = (x.kegiatanLalu || []).map((k) => (k.biayaId === biayaId ? { ...k, dibayar: k.dibayar + delta } : k))
          return salin
        }
        if (jenis === 'spp' && ta && ta !== tahunAjaranBerjalan()) {
          const b = [...(salin.sppLalu[ta] || Array(12).fill(0))]
          b[indeks] = (b[indeks] || 0) + delta
          salin.sppLalu[ta] = b
        } else if (jenis === 'spp') salin.spp[indeks] = (salin.spp[indeks] || 0) + delta
        else if (jenis === 'paket') salin.paket[indeks] = (salin.paket[indeks] || 0) + delta
        else salin.kegiatan[indeks] = (salin.kegiatan[indeks] || 0) + delta
        return salin
      })
    )

  /**
   * jenis 'spp' → indeks = bulan (0–11) · 'kegiatan' → indeks = urutan biaya ·
   * 'paket' (PMB / daftar ulang) → indeks = id paket.
   * tahunAjaran (SPP saja): kosong = tahun ajaran berjalan; isi untuk membayar
   * tunggakan tahun ajaran yang sudah lewat (0041).
   */
  async function catatPembayaran({ siswaId, jenis, indeks, nominal, metode, tanggal, tahunAjaran, biayaLaluId }) {
    const ta = jenis === 'spp' ? tahunAjaran || tahunAjaranBerjalan() : null
    const lalu = ta && ta !== tahunAjaranBerjalan()
    const s = siswa.find((x) => x.id === siswaId)
    // kegiatan tahun ajaran lalu (0042): dicatat ke id kegiatannya
    const kl = jenis === 'kegiatan' && biayaLaluId ? (s?.kegiatanLalu || []).find((k) => k.biayaId === biayaLaluId) : null
    if (jenis === 'kegiatan' && biayaLaluId && !kl) {
      toast('Kegiatan tahun lalu tidak ditemukan. Muat ulang halaman.')
      throw new Error('kegiatan tidak ditemukan')
    }
    if (kl) indeks = -1
    const pk = jenis === 'paket' ? paket.find((p) => p.id === indeks) : null
    if (jenis === 'paket' && !pk) {
      toast('Paket PMB/daftar ulang tidak ditemukan. Muat ulang halaman.')
      throw new Error('paket tidak ditemukan')
    }
    const keterangan =
      jenis === 'spp' ? `SPP bulanan — ${namaBulanTa(ta, indeks)}` : jenis === 'paket' ? pk.nama : kl ? `Biaya kegiatan — ${kl.nama} ${kl.ta}` : `Biaya kegiatan — ${biaya[indeks].nama}`

    // Sudah lunas → tidak bisa dicatat lagi; nominal tidak boleh melebihi sisa.
    // (Database juga menolak — 0036 — ini supaya pesannya langsung muncul.)
    const target = jenis === 'spp' ? targetSpp(s, indeks, pengaturan.sppNominal, lalu ? ta : undefined) : jenis === 'paket' ? pk.total : kl ? kl.nominal : biaya[indeks]?.nominal || 0
    const sudah = !s ? 0 : jenis === 'spp' ? (lalu ? s.sppLalu?.[ta]?.[indeks] || 0 : s.spp[indeks] || 0) : jenis === 'paket' ? s.paket?.[pk.id] || 0 : kl ? kl.dibayar : s.kegiatan[indeks] || 0
    if (jenis === 'spp' && s && target <= 0) {
      toast(`SPP ${namaBulanTa(ta, indeks)} tidak ditagihkan untuk ${s.panggilan || s.nama} (belum masuk / sudah keluar)`)
      throw new Error('tidak ditagih')
    }
    if (target > 0 && sudah >= target) {
      toast(`${jenis === 'spp' ? 'SPP ' + (lalu ? namaBulanTa(ta, indeks) : BULAN[indeks]) : jenis === 'paket' ? pk.nama : kl ? kl.nama : biaya[indeks].nama} sudah lunas`)
      throw new Error('sudah lunas')
    }
    if (target > 0 && nominal > target - sudah) {
      toast(`Nominal melebihi sisa tagihan — maksimal ${rp(target - sudah)}`)
      throw new Error('melebihi sisa')
    }

    try {
      const baris = await api.catatPembayaran({
        sekolahId: pengaturan.id,
        siswaId,
        jenis,
        periode: indeks,
        tahunAjaran: ta,
        biayaId: jenis === 'kegiatan' ? (kl ? kl.biayaId : biaya[indeks].id) : null,
        paketId: pk?.id || null,
        keterangan,
        nominal,
        metode,
        petugas: petugas || s.guru,
        tanggal,
      })

      const tampil = {
        id: baris.id,
        siswaId,
        jenis,
        indeks,
        biayaId: jenis === 'kegiatan' ? (kl ? kl.biayaId : biaya[indeks].id) : null,
        paketId: pk?.id || null,
        tahunAjaran: ta,
        ket: keterangan,
        nominal,
        metode,
        petugas: petugas || s.guru,
        // Pakai tanggal asli yang tersimpan di server (bisa backdate), bukan
        // selalu "Baru saja" — supaya pembayaran yang di-backdate langsung
        // tampil dengan tanggal yang benar tanpa perlu muat ulang halaman.
        tanggal: baris.dibayar_pada,
        waktu: waktuTampil(baris.dibayar_pada),
      }
      tambahJumlah(siswaId, jenis, indeks, nominal, ta, kl?.biayaId)
      setPembayaran((lama) => [tampil, ...lama])
      return tampil
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  /**
   * Membatalkan SATU transaksi tertentu (bukan seluruh bulan/kegiatan —
   * dengan cicilan, satu periode bisa punya beberapa transaksi). Jumlah
   * yang tercatat pada siswa dikurangi sebesar transaksi itu saja.
   */
  async function batalkanPembayaran(pembayaranId, alasan, luar = null) {
    // luar: transaksi yang tidak ada di HP (tahun lama, dibuka dari Transaksi / Kartu siswa › tahun lalu)
    const baris = pembayaran.find((p) => p.id === pembayaranId) || luar
    if (!baris) return
    setPembayaran((lama) => lama.filter((p) => p.id !== pembayaranId))
    tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, -baris.nominal, baris.tahunAjaran, baris.biayaId)
    try {
      const s = siswa.find((x) => x.id === baris.siswaId) || siswaLain.find((x) => x.id === baris.siswaId)
      await api.batalkanPembayaran(pembayaranId, alasan, {
        id: baris.id, sumber: 'pembayaran', jenis: 'masuk',
        uraian: baris.ket + (s ? ' · ' + s.nama : ''), nominal: baris.nominal,
        tanggal: baris.tanggal, petugas: baris.petugas, dibatalkanNama: petugas,
      })
    } catch (e) {
      if (!luar || pembayaran.some((p) => p.id === pembayaranId)) setPembayaran((lama) => [baris, ...lama])
      tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, baris.nominal, baris.tahunAjaran, baris.biayaId)
      toast('Gagal membatalkan: ' + e.message)
      throw e
    }
  }

  /**
   * Pembayaran tunggakan siswa yang sudah lulus / keluar (menu Tagihan, 0044).
   * item = { jenis: 'spp' | 'kegiatan', ta, i, biayaId, nama, target, dibayar } dari tunggakan_nonaktif().
   * Siswa ini tidak ada di daftar aktif, jadi sisa tagihannya dicek ulang di database (0036).
   */
  async function catatTunggakanLain(sl, item, { nominal, metode, tanggal }) {
    const keterangan = item.jenis === 'spp' ? `SPP bulanan — ${namaBulanTa(item.ta, item.i)}` : `Biaya kegiatan — ${item.nama} ${item.ta}`
    try {
      const baris = await api.catatPembayaran({
        sekolahId: pengaturan.id, siswaId: sl.id, jenis: item.jenis, periode: item.jenis === 'spp' ? item.i : null,
        tahunAjaran: item.jenis === 'spp' ? item.ta : null, biayaId: item.jenis === 'kegiatan' ? item.biayaId : null,
        keterangan, nominal, metode, petugas, tanggal,
      })
      const tampil = {
        id: baris.id, siswaId: sl.id, jenis: item.jenis, indeks: item.jenis === 'spp' ? item.i : -1,
        biayaId: item.jenis === 'kegiatan' ? item.biayaId : null, paketId: null, tahunAjaran: item.jenis === 'spp' ? item.ta : null,
        ket: keterangan, nominal, metode, petugas, tanggal: baris.dibayar_pada, waktu: waktuTampil(baris.dibayar_pada),
      }
      setPembayaran((lama) => [tampil, ...lama])
      setSiswaLain((lama) => (lama.some((x) => x.id === sl.id) ? lama : [...lama, sl]))
      return tampil
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  /* ---------- data siswa ---------- */

  /** Bagian keanggotaan (0042) untuk siswa di layar: target SPP, kegiatan yang ditagih, dst. */
  function anggotaLokal(s, k, { depan = null, b = biaya } = {}) {
    const ta = tahunAjaranBerjalan()
    const kini = k ? { ta, selesai: null, akhir: null, ...k } : null
    const tarif = pengaturan.tarifSpp || { [ta]: { standar: pengaturan.sppNominal, kelas: {} } }
    const lain = (s.keanggotaan || []).filter((x) => x.ta !== ta && (!depan || x.ta !== depan.ta))
    return {
      terdaftar: kini,
      daftarDepan: !kini && depan ? depan : null,
      keanggotaan: [...lain, ...(kini ? [kini] : []), ...(depan ? [depan] : [])].sort((x, y) => (x.ta < y.ta ? -1 : 1)),
      sppTarget: targetDari(tarif, kini),
      tarifSpp: tarifKelas(tarif, ta, kini?.kelas || s.kelas),
      kegiatanWajib: b.map((x) => wajibKegiatan(kini, x)),
    }
  }

  /**
   * form.paketIds (opsional): paket PMB/DU yang langsung ditagihkan ke siswa baru ini.
   * form.mulai (0042): bulan pertama ditagih SPP (0 = Juli), atau 'depan' = siswa tahun ajaran depan.
   */
  async function tambahSiswa({ paketIds = [], mulai = 0, ...form }) {
    const baris = await api.tambahSiswa({ sekolahId: pengaturan.id, ...form })
    const depan = mulai === 'depan'
    try {
      if (depan) await api.daftarkanTahunDepan(baris.id, form.kelas)
      else if (mulai > 0) await api.aturKeanggotaan(baris.id, tahunAjaranBerjalan(), form.kelas, mulai)
    } catch (e) {
      toast('Siswa tersimpan, tapi bulan mulai gagal disimpan: ' + e.message)
    }
    const gagalPaket = []
    for (const id of paketIds) {
      try {
        await api.aturSiswaPaket(id, baris.id, true)
        setPaket((lama) => lama.map((p) => (p.id === id ? { ...p, siswaIds: [...p.siswaIds, baris.id] } : p)))
      } catch (e) {
        gagalPaket.push(e.message)
      }
    }
    if (gagalPaket.length) toast('Siswa tersimpan, tapi tagihan PMB/DU gagal ditambahkan: ' + gagalPaket[0])
    setSiswa((lama) =>
      [
        ...lama,
        {
          id: baris.id,
          nama: form.nama,
          panggilan: form.panggilan || form.nama.split(' ')[0],
          jenis: form.jenis_kelamin,
          kelas: form.kelas,
          nis: form.nis,
          wali: form.wali || '',
          hp: form.hp || '',
          guru: form.guru || '',
          avatar: form.avatar,
          foto: '',
          spp: Array(12).fill(0),
          sppLalu: {},
          kegiatan: biaya.map(() => 0),
          paket: {},
          sppTargetLalu: {},
          kegiatanLalu: [],
          ...anggotaLokal({ kelas: form.kelas }, depan ? null : { kelas: form.kelas, mulai: Number(mulai) || 0 },
            { depan: depan ? { ta: pengaturan.taDepan, kelas: form.kelas, mulai: 0, selesai: null, akhir: null } : null }),
        },
      ].sort((a, b) => a.nama.localeCompare(b.nama))
    )
    return baris
  }

  /** Ubah kelas / bulan mulai / bulan terakhir siswa di tahun ajaran berjalan (Kartu siswa). */
  async function aturKeanggotaan(siswaId, { kelas, mulai = 0, selesai = null }) {
    const s = siswa.find((x) => x.id === siswaId)
    try {
      await api.aturKeanggotaan(siswaId, tahunAjaranBerjalan(), kelas, mulai, selesai)
    } catch (e) {
      toast(e.message)
      throw e
    }
    const k = { ...(s.terdaftar || {}), kelas, mulai, selesai }
    setSiswa((lama) => lama.map((x) => (x.id === siswaId ? { ...x, kelas, ...anggotaLokal(x, k) } : x)))
  }

  /** Keluar / pindah sekolah — siswa hilang dari daftar aktif, riwayat & pembayaran tetap. */
  async function keluarkanSiswa(siswaId, { bulanTerakhir, alasan, catatan }) {
    try {
      await api.keluarkanSiswa(siswaId, bulanTerakhir, alasan, catatan)
    } catch (e) {
      toast(e.message)
      throw e
    }
    setSiswa((lama) => lama.filter((x) => x.id !== siswaId))
  }

  /** Kenaikan kelas (wizard). Data dimuat ulang sesudahnya. */
  async function prosesKenaikan(dari, rencana) {
    try {
      const hasil = await api.prosesKenaikan(dari, rencana)
      if (!api.modeDemo) await segarkan()
      else {
        // mode demo: catat rencana di riwayat kelas (kelas sekarang baru berubah 1 Juli)
        const urut = (a, b) => (a.ta < b.ta ? -1 : 1)
        setSiswa((lama) => lama.map((x) => {
          const r = rencana.find((y) => y.siswa === x.id)
          if (!r) return x
          const lain = (x.keanggotaan || []).filter((k) => k.ta !== hasil.ke).map((k) => (k.ta === dari ? { ...k, akhir: r.aksi } : k))
          const ke = ['naik', 'tinggal'].includes(r.aksi) ? [{ ta: hasil.ke, kelas: r.kelas || x.kelas, mulai: 0, selesai: null, akhir: null }] : []
          return { ...x, keanggotaan: [...lain, ...ke].sort(urut), terdaftar: x.terdaftar ? { ...x.terdaftar, akhir: r.aksi } : x.terdaftar }
        }))
        setPengaturan((p) => ({ ...p, infoTa: { ...(p.infoTa || {}), kenaikanDepanSudah: true } }))
      }
      return hasil
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  /** Tarif SPP satu tahun ajaran (standar + per kelas). */
  async function aturTarifSpp(ta, standar, kelas) {
    try {
      await api.aturTarifSpp(ta, standar, kelas)
    } catch (e) {
      toast(e.message)
      throw e
    }
    const tarif = { ...(pengaturan.tarifSpp || {}), [ta]: { standar, kelas: { ...kelas } } }
    const baru = { ...pengaturan, tarifSpp: tarif, ...(ta === tahunAjaranBerjalan() ? { sppNominal: standar } : {}) }
    setPengaturan(baru)
    if (ta === tahunAjaranBerjalan()) {
      setSiswa((lama) => lama.map((x) => ({ ...x, sppTarget: targetDari(tarif, x.terdaftar), tarifSpp: tarifKelas(tarif, ta, x.terdaftar?.kelas || x.kelas) })))
    } else if (ta < tahunAjaranBerjalan()) {
      // tarif tahun lalu berubah → tunggakan tahun itu ikut berubah; muat ulang dari server
      if (api.modeDemo) setSiswa((lama) => lama.map((x) => {
        const k = (x.keanggotaan || []).find((y) => y.ta === ta)
        return k && x.sppTargetLalu ? { ...x, sppTargetLalu: { ...x.sppTargetLalu, [ta]: targetDari(tarif, k) } } : x
      }))
      else await segarkan()
    }
  }

  /** Salin kegiatan tahun ajaran lain ke tahun berjalan / depan. */
  async function salinKegiatan(dari, ke, ids) {
    try {
      const n = await api.salinKegiatan(dari, ke, ids)
      if (!api.modeDemo) await segarkan()
      else if (ke === tahunAjaranBerjalan()) {
        const baru = biayaLain.filter((b) => ids.includes(b.id)).map((b, i) => ({ ...b, id: `demo-salin-${Date.now()}-${i}`, tahunAjaran: ke, tanggal: null, tanggalSelesai: null }))
        setBiaya((lama) => [...lama, ...baru])
        setSiswa((lama) => lama.map((x) => ({ ...x, kegiatan: [...x.kegiatan, ...baru.map(() => 0)], kegiatanWajib: [...(x.kegiatanWajib || []), ...baru.map((b) => wajibKegiatan(x.terdaftar, b))] })))
      } else {
        setBiayaLain((lama) => [...lama, ...biayaLain.filter((b) => ids.includes(b.id)).map((b, i) => ({ ...b, id: `demo-salin-${Date.now()}-${i}`, tahunAjaran: ke, tanggal: null, tanggalSelesai: null }))])
      }
      return n
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  async function ubahSiswa(id, form) {
    await api.ubahSiswa(id, form)
    setSiswa((lama) =>
      lama
        .map((s) =>
          s.id === id
            ? {
                ...s,
                nama: form.nama,
                panggilan: form.panggilan || form.nama.split(' ')[0],
                jenis: form.jenis_kelamin,
                kelas: form.kelas,
                nis: form.nis,
                wali: form.wali || '',
                hp: form.hp || '',
                guru: form.guru || '',
                avatar: form.avatar,
                // kelas berubah → kelas tahun berjalan & tarif SPP-nya ikut (0042)
                ...(form.kelas !== s.kelas && s.terdaftar ? anggotaLokal(s, { ...s.terdaftar, kelas: form.kelas }) : {}),
              }
            : s
        )
        .sort((a, b) => a.nama.localeCompare(b.nama))
    )
  }

  async function hapusSiswa(id) {
    const salinan = siswa
    setSiswa((lama) => lama.filter((s) => s.id !== id))
    try {
      await api.nonaktifkanSiswa(id)
    } catch (e) {
      setSiswa(salinan)
      toast('Gagal menghapus siswa: ' + e.message)
      throw e
    }
  }

  async function tambahBiaya({ nama, nominal, emoji = null, info = {} }) {
    try {
      const baris = await api.tambahBiaya({
        sekolahId: pengaturan.id,
        nama,
        nominal,
        emoji,
        info,
        urutan: biaya.length + 1,
      })
      setBiaya((lama) => [...lama, {
        id: baris.id, nama, nominal, emoji,
        tanggal: baris.tanggal || null, tanggalSelesai: baris.tanggal_selesai || null,
        waktu: baris.waktu || '', lokasi: baris.lokasi || '', deskripsi: baris.deskripsi || '', perlengkapan: baris.perlengkapan || '',
      }])
      const bBaru = { tanggal: baris.tanggal || null }
      setSiswa((lama) => lama.map((s) => ({ ...s, kegiatan: [...s.kegiatan, 0], kegiatanWajib: [...(s.kegiatanWajib || []), wajibKegiatan(s.terdaftar, bBaru)] })))
    } catch (e) {
      toast('Gagal menambah biaya: ' + e.message)
      throw e
    }
  }

  /** Ganti emoji jenis kegiatan ke-i. null = otomatis dari nama. */
  async function ubahEmojiBiaya(i, emoji) {
    const target = biaya[i]
    setBiaya((lama) => lama.map((b, idx) => (idx === i ? { ...b, emoji } : b)))
    try {
      await api.ubahEmojiBiaya(target.id, emoji)
    } catch (e) {
      setBiaya((lama) => lama.map((b, idx) => (idx === i ? target : b)))
      toast('Gagal menyimpan emoji: ' + e.message)
      throw e
    }
  }

  /** Simpan info kegiatan ke-i (dibaca orang tua di portal). */
  async function ubahInfoBiaya(i, info) {
    const target = biaya[i]
    const hasil = await api.simpanInfoBiaya(target.id, info)
    setBiaya((lama) => lama.map((b) => (b.id === target.id ? { ...b, ...hasil } : b)))
    // tanggal kegiatan berubah → siswa yang masuk / keluar di tengah tahun bisa ikut / tidak ikut ditagih
    setSiswa((lama) => lama.map((s) => (s.kegiatanWajib ? { ...s, kegiatanWajib: s.kegiatanWajib.map((w, idx) => (idx === i ? wajibKegiatan(s.terdaftar, { tanggal: hasil.tanggal || null }) : w)) } : s)))
    return hasil
  }

  /** Ganti avatar akun yang sedang login. */
  async function ubahAvatarSaya(avatar) {
    const lama = avatarSaya
    setAvatarSaya(avatar)
    try {
      await api.ubahAvatarSaya(avatar)
    } catch (e) {
      setAvatarSaya(lama)
      toast('Gagal menyimpan avatar: ' + e.message)
      throw e
    }
  }

  async function hapusBiaya(i) {
    const target = biaya[i]
    setBiaya((lama) => lama.filter((_, idx) => idx !== i))
    setSiswa((lama) =>
      lama.map((s) => ({ ...s, kegiatan: s.kegiatan.filter((_, idx) => idx !== i), kegiatanWajib: (s.kegiatanWajib || []).filter((_, idx) => idx !== i) }))
    )
    // indeks pembayaran kegiatan ikut bergeser supaya riwayat tetap menunjuk kegiatan yang benar
    setPembayaran((lama) =>
      lama.map((p) => (p.jenis !== 'kegiatan' || p.indeks < i ? p : { ...p, indeks: p.indeks === i ? -1 : p.indeks - 1 }))
    )
    try {
      await api.nonaktifkanBiaya(target.id)
    } catch (e) {
      toast('Gagal menghapus: ' + e.message)
      segarkan()
    }
  }

  /* ---------- paket PMB & daftar ulang ---------- */

  /** Simpan paket baru/perubahan (+ siswa yang ditagih). Mengembalikan paket tersimpan. */
  async function simpanPaket(data) {
    try {
      const hasil = await api.simpanPaket(data)
      setPaket((lama) => (lama.some((p) => p.id === hasil.id) ? lama.map((p) => (p.id === hasil.id ? hasil : p)) : [...lama, hasil]))
      return hasil
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  async function hapusPaket(id) {
    const adaBayar = pembayaran.some((p) => p.jenis === 'paket' && p.paketId === id)
    try {
      const hasil = await api.hapusPaket(id, adaBayar)
      setPaket((lama) => lama.filter((p) => p.id !== id))
      return hasil
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  /** Pindahkan biaya kegiatan lama (mis. "PMB") ke paket, lalu muat ulang data. */
  async function pindahkanBiayaKePaket(i, jenis) {
    try {
      await api.pindahkanBiayaKePaket(biaya[i].id, jenis)
      await segarkan()
    } catch (e) {
      toast(e.message)
      throw e
    }
  }

  async function ubahPengaturan(patch) {
    const lama = pengaturan
    const baru = { ...pengaturan, ...patch }
    setPengaturan(baru)
    try {
      await api.simpanPengaturan(baru)
    } catch (e) {
      setPengaturan(lama)
      toast('Gagal menyimpan: ' + e.message)
    }
  }

  /** Logo sekolah baru saja diganti di Profil sekolah → langsung tampil di menu. */
  function aturLogoLokal(logo) {
    setPengaturan((p) => (p ? { ...p, logo: logo || null } : p))
  }

  /** Ubah nama tampilan akun yang sedang login (bukan nama sekolah). */
  async function ubahNamaSaya(nama) {
    const lama = petugas
    setPetugas(nama)
    try {
      await api.ubahNamaSaya(nama)
    } catch (e) {
      setPetugas(lama)
      toast('Gagal menyimpan: ' + e.message)
      throw e
    }
  }

  /** Aktifkan/ubah PIN — PIN tersimpan sebagai password akun di Supabase
   *  Auth (server), bukan di perangkat. Lihat lib/api.js. */
  async function aturPinAkun(pin) {
    try {
      await api.aturPin(pin)
      setPinAktif(true)
    } catch (e) {
      toast('Gagal mengaktifkan PIN: ' + e.message)
      throw e
    }
  }

  async function matikanPinAkun() {
    try {
      await api.matikanPin()
      setPinAktif(false)
    } catch (e) {
      toast('Gagal mematikan PIN: ' + e.message)
      throw e
    }
  }

  // Masa sewa habis → transaksi dikunci (ditegakkan juga di database, 0029).
  const terkunci = !!pengaturan && hitungLangganan(pengaturan).status === 'kadaluarsa'

  const nilai = useMemo(
    () => ({
      siap,
      galat,
      gerbang,
      modeDemo: api.modeDemo,
      pengaturan,
      biaya,
      biayaLain,
      siswa,
      siswaLain,
      /** siswa aktif atau (kalau tidak ada) siswa lulus/keluar yang termuat — untuk nama di riwayat */
      cariSiswa: (id) => siswa.find((x) => x.id === id) || siswaLain.find((x) => x.id === id) || null,
      pembayaran,
      paket,
      wali,
      petugas,
      peran,
      akses,
      /** boleh('kas') = bisa kelola · boleh('kas', 'lihat') = minimal bisa lihat */
      boleh: (fitur, tingkat = 'kelola') => cekAkses(akses, fitur, tingkat),
      terkunci,
      /** true (dan tampilkan pesan) kalau aksi transaksi sedang terkunci. */
      cegahKunci: (aksi) => {
        if (!terkunci) return false
        toast(pesanKunci(pengaturan, aksi))
        return true
      },
      pinAktif,
      pesan,
      muat,
      segarkan,
      toast,
      catatPembayaran,
      catatTunggakanLain,
      batalkanPembayaran,
      tambahSiswa,
      ubahSiswa,
      hapusSiswa,
      tambahBiaya,
      hapusBiaya,
      ubahEmojiBiaya,
      ubahInfoBiaya,
      simpanPaket,
      hapusPaket,
      pindahkanBiayaKePaket,
      avatarSaya,
      ubahAvatarSaya,
      ubahPengaturan,
      aturLogoLokal,
      ubahNamaSaya,
      aturPinAkun,
      matikanPinAkun,
      aturKeanggotaan,
      keluarkanSiswa,
      prosesKenaikan,
      aturTarifSpp,
      salinKegiatan,
    }),
    [siap, galat, gerbang, pengaturan, biaya, biayaLain, siswa, siswaLain, pembayaran, paket, wali, petugas, peran, akses, pinAktif, avatarSaya, pesan, muat, segarkan]
  )

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>
}