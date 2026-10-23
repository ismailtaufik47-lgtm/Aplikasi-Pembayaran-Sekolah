/**
 * Layar "Gabung ke kelas": guru yang baru masuk dengan Google memasukkan kode
 * undangan 6 huruf dari admin/kepala sekolah (Penilaian anak › Guru kelas › Undang).
 * Tampilannya komponen bersama LayarKode, dengan tema hijau Tumbuh Ceria.
 */
import LayarKode from '../components/LayarKode.jsx'

export default function GabungKelas({ onSelesai }) {
  return (
    <LayarKode
      judul="Gabung ke kelas"
      sub="Masukkan kode undangan dari sekolah Anda"
      warna="tosca"
      label="Kode undangan"
      tombol="Masuk ke kelas"
      ikonTombol="sekolah"
      onSelesai={onSelesai}
      info={<>Belum punya kode? Minta ke admin atau kepala sekolah — dibuat di menu <b>Penilaian anak › Guru kelas</b>. Kode berlaku 7 hari.</>}
    />
  )
}
