/**
 * Pemilih avatar untuk form tambah / ubah siswa.
 * Pilihannya ikut berubah begitu jenis kelamin diganti.
 */
import Avatar from './Avatar.jsx'

export default function PilihAvatar({ jenis, nilai, ubah, nama = '' }) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const dipilih = nilai === i
        return (
          <button
            key={i}
            type="button"
            onClick={() => ubah(i)}
            aria-pressed={dipilih}
            className={`grid place-items-center rounded-2xl p-1.5 transition ${
              dipilih ? 'bg-warn-soft ring-2 ring-warn' : 'hover:bg-line'
            }`}
          >
            <Avatar nama={nama} jenis={jenis} avatar={i} size={56} />
          </button>
        )
      })}
    </div>
  )
}
