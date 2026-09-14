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

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

export function DataProvider({ children }) {
  const [siap, setSiap] = useState(false)
  const [galat, setGalat] = useState('')
  const [pengaturan, setPengaturan] = useState(null)
  const [biaya, setBiaya] = useState([])
  const [siswa, setSiswa] = useState([])
  const [pembayaran, setPembayaran] = useState([])
  const [wali, setWali] = useState(null)
  const [petugas, setPetugas] = useState('')
  const [peran, setPeran] = useState('')
  const [pesan, setPesan] = useState('')
  const sedang = useRef('')

  function toast(teks) {
    setPesan(teks)
    clearTimeout(toast._t)
    toast._t = setTimeout(() => setPesan(''), 2600)
  }

  const terapkan = (d) => {
    setPengaturan(d.pengaturan)
    setBiaya(d.biaya)
    setSiswa(d.siswa)
    setPembayaran(d.pembayaran)
    setWali(d.wali)
    setPetugas(d.petugas || '')
    setPeran(d.peran || '')
    setSiap(true)
    setGalat('')
  }

  /** Dipanggil sekali oleh GuruApp / OrtuApp sesuai perannya. */
  const muat = useCallback(async (sumber) => {
    const kunci = JSON.stringify(sumber)
    if (sedang.current === kunci) return
    sedang.current = kunci
    setSiap(false)
    setGalat('')
    try {
      terapkan(
        sumber.mode === 'ortu' ? await api.muatDataPortal(sumber.token) : await api.muatDataGuru()
      )
    } catch (e) {
      sedang.current = ''
      setGalat(e.message)
    }
  }, [])

  const segarkan = useCallback(async () => {
    const kunci = sedang.current
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
        const salin = { ...x, spp: [...x.spp], kegiatan: [...x.kegiatan] }
        if (jenis === 'spp') salin.spp[indeks] = (salin.spp[indeks] || 0) + delta
        else salin.kegiatan[indeks] = (salin.kegiatan[indeks] || 0) + delta
        return salin
      })
    )

  async function catatPembayaran({ siswaId, jenis, indeks, nominal, metode, tanggal }) {
    const s = siswa.find((x) => x.id === siswaId)
    const keterangan =
      jenis === 'spp' ? `SPP bulanan — ${BULAN[indeks]}` : `Biaya kegiatan — ${biaya[indeks].nama}`

    try {
      const baris = await api.catatPembayaran({
        sekolahId: pengaturan.id,
        siswaId,
        jenis,
        periode: indeks,
        biayaId: jenis === 'kegiatan' ? biaya[indeks].id : null,
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
  async function batalkanPembayaran(pembayaranId) {
    const baris = pembayaran.find((p) => p.id === pembayaranId)
    if (!baris) return
    setPembayaran((lama) => lama.filter((p) => p.id !== pembayaranId))
    tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, -baris.nominal)
    try {
      await api.hapusPembayaran(pembayaranId)
    } catch (e) {
      setPembayaran((lama) => [baris, ...lama])
      tambahJumlah(baris.siswaId, baris.jenis, baris.indeks, baris.nominal)
      toast('Gagal membatalkan: ' + e.message)
      throw e
    }
  }

  /* ---------- data siswa ---------- */

  async function tambahSiswa(form) {
    const baris = await api.tambahSiswa({ sekolahId: pengaturan.id, ...form })
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

  async function tambahBiaya({ nama, nominal }) {
    try {
      const baris = await api.tambahBiaya({
        sekolahId: pengaturan.id,
        nama,
        nominal,
        urutan: biaya.length + 1,
      })
      setBiaya((lama) => [...lama, { id: baris.id, nama, nominal }])
      setSiswa((lama) => lama.map((s) => ({ ...s, kegiatan: [...s.kegiatan, 0] })))
    } catch (e) {
      toast('Gagal menambah biaya: ' + e.message)
      throw e
    }
  }

  async function hapusBiaya(i) {
    const target = biaya[i]
    setBiaya((lama) => lama.filter((_, idx) => idx !== i))
    setSiswa((lama) =>
      lama.map((s) => ({ ...s, kegiatan: s.kegiatan.filter((_, idx) => idx !== i) }))
    )
    try {
      await api.nonaktifkanBiaya(target.id)
    } catch (e) {
      toast('Gagal menghapus: ' + e.message)
      segarkan()
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

  const nilai = useMemo(
    () => ({
      siap,
      galat,
      modeDemo: api.modeDemo,
      pengaturan,
      biaya,
      siswa,
      pembayaran,
      wali,
      petugas,
      peran,
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
      ubahPengaturan,
      ubahNamaSaya,
    }),
    [siap, galat, pengaturan, biaya, siswa, pembayaran, wali, petugas, peran, pesan, muat, segarkan]
  )

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>
}