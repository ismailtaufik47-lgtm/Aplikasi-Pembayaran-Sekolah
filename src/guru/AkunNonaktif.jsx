/**
 * Layar untuk akun Admin/TU yang dinonaktifkan kepala sekolah (0032).
 * Akun ini masih bisa login (Google/PIN), tapi database menolak semua data
 * sekolah — jadi yang tampil hanya penjelasan + tombol keluar/ganti akun.
 */
import LatarMasuk, { AkunMasuk, JudulKartu, KartuMasuk, KepalaLangkah, KotakInfo, TombolHantu } from '../components/LatarMasuk.jsx'

export default function AkunNonaktif({ pesan, onCobaLagi }) {
  return (
    <LatarMasuk kepala={<KepalaLangkah ikon="gembok" warna="pink" judul="Akun nonaktif" sub="Hubungi kepala sekolah" />}>
      <KartuMasuk>
        <JudulKartu judul="Akses Anda ditutup sementara" sub={pesan} />
        <AkunMasuk />
        <KotakInfo ikon="info" nada="info">
          Semua data yang pernah Anda catat tetap aman di sekolah. Kalau Anda masih bertugas, minta kepala sekolah
          mengaktifkan lagi akun ini dari menu <b>Akun staf</b>.
        </KotakInfo>
        <TombolHantu ikon="muat" onClick={onCobaLagi}>Sudah diaktifkan? Muat ulang</TombolHantu>
      </KartuMasuk>
    </LatarMasuk>
  )
}
