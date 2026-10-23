// Halaman "Video panduan" aplikasi kas (/guru/panduan). Data video: src/lib/panduan.js
import { KepalaHalaman } from '../components/ui.jsx'
import { DaftarVideo } from '../components/Panduan.jsx'
import { videoUntuk } from '../lib/panduan.js'

export default function HalamanPanduan() {
  const ada = videoUntuk('kas').length > 0
  return (
    <>
      <KepalaHalaman judul="Video panduan" gambar="maskot" sub="Cara memakai Kasceria, langkah demi langkah. Ketuk untuk memutar." />
      <div className="w-full max-w-[880px]">
        {ada
          ? <DaftarVideo untuk="kas" judul="" className="mb-6" />
          : <p className="card mb-6 text-center text-[13.5px] font-semibold text-muted">Video panduan sedang disiapkan.</p>}
      </div>
    </>
  )
}
