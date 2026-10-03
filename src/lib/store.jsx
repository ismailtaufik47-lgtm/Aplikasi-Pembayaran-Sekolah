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
import { BULAN, waktuTampil } from './format.js'
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
  const [siswa, setSiswa] = useState([])
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
    setSiswa(d.siswa)
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
  const tambahJumlah = (siswaId, jenis, indeks, delta) =>
    setSiswa((lama) =>
      lama.map((x) => {
        if (x.id !== siswaId) return x
        const salin = { ...x, spp: [...x.spp], kegiatan: [...x.kegiatan], paket: { ...(x.paket || {}) } }
        if (jenis === 'spp') salin.spp[indeks] = (salin.spp[indeks] || 0) + delta
        else if (jenis === 'paket') salin.paket[indeks] = (salin.paket[indeks] || 0) + delta
        else salin.kegiatan[indeks] = (salin.kegiatan[indeks] || 0) + delta
        return salin
      })
    )

  /**
   * jenis 'spp' → indeks = bulan (0–11) · 'kegiatan' → indeks = urutan biaya ·
   * 'paket' (PMB / daftar ulang) → indeks = id paket.
   */
  async function catatPembayaran({ siswaId, jenis, indeks, nominal, metode, tanggal }) {
    const s = siswa.find((x) => x.id === siswaId)
    const pk = jenis === 'paket' ? paket.find((p) => p.id === indeks) : null
    if (jenis === 'paket' && !pk) {
      toast('Paket PMB/daftar ulang tidak ditemukan. Muat ulang halaman.')
      throw new Error('paket tidak ditemukan')
    }
    const keterangan =
      jenis === 'spp' ? `SPP bulanan — ${BULAN[indeks]}` : jenis === 'paket' ? pk.nama : `Biaya kegiatan — ${biaya[indeks].nama}`

    try {
      const baris = await api.catatPembayaran({
        sekolahId: pengaturan.id,
        siswaId,
        jenis,
        periode: indeks,
        biayaId: jenis === 'kegiatan' ? biaya[indeks].id : null,
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
        paketId: pk?.id || null,
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
      tambahJumlah(siswaId, jenis, indeks, nominal)
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
  async function batalkanPembayaran(pembayaranId, alasan) {
    const baris = pembayaran.find((p) => p.id === pembayaranId)
    if (!baris) return
    setPembayaran((lama) => lama.filter((p) => p.id !== pembayaranId))
    tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, -baris.nominal)
    try {
      const s = siswa.find((x) => x.id === baris.siswaId)
      await api.batalkanPembayaran(pembayaranId, alasan, {
        id: baris.id, sumber: 'pembayaran', jenis: 'masuk',
        uraian: baris.ket + (s ? ' · ' + s.nama : ''), nominal: baris.nominal,
        tanggal: baris.tanggal, petugas: baris.petugas, dibatalkanNama: petugas,
      })
    } catch (e) {
      setPembayaran((lama) => [baris, ...lama])
      tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, baris.nominal)
      toast('Gagal membatalkan: ' + e.message)
      throw e
    }
  }

  /* ---------- data siswa ---------- */

  /** form.paketIds (opsional): paket PMB/DU yang langsung ditagihkan ke siswa baru ini. */
  async function tambahSiswa({ paketIds = [], ...form }) {
    const baris = await api.tambahSiswa({ sekolahId: pengaturan.id, ...form })
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
          kegiatan: biaya.map(() => 0),
          paket: {},
        },
      ].sort((a, b) => a.nama.localeCompare(b.nama))
    )
    return baris
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
      setSiswa((lama) => lama.map((s) => ({ ...s, kegiatan: [...s.kegiatan, 0] })))
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
      lama.map((s) => ({ ...s, kegiatan: s.kegiatan.filter((_, idx) => idx !== i) }))
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
      siswa,
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
    }),
    [siap, galat, gerbang, pengaturan, biaya, siswa, pembayaran, paket, wali, petugas, peran, akses, pinAktif, avatarSaya, pesan, muat, segarkan]
  )

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>
}