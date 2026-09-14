/**
 * Avatar siswa — gaya emoji, disamakan dengan aplikasi tabungan siswa
 * supaya kedua aplikasi terasa satu keluarga.
 *
 * Tiga tingkat prioritas:
 *   1. `foto`  — kalau sekolah mengunggah foto siswa, foto itu yang dipakai
 *   2. `avatar`— nomor 0–5 kalau guru memilih avatar sendiri saat input siswa
 *   3. nama    — kalau keduanya kosong, avatar dipilih otomatis dari nama,
 *                jadi satu anak selalu tampil sama di semua halaman
 */
import { useState } from 'react'

export const AVATAR_L = ['👦🏻', '👦🏼', '👦🏽', '👦🏾', '🧒🏻', '🧒🏽']
export const AVATAR_P = ['🧕🏻', '🧕🏼', '🧕🏽', '🧕🏾', '👧🏻', '👧🏽']

/** Latar pastel; urutannya sengaja diacak agar dua avatar bersebelahan tidak kembar warna. */
const LATAR = ['#DCEEFF', '#E4F7EA', '#FFF3D6', '#F0E9FF', '#FFE6EF', '#DFF5F7']

export const emojiAvatar = (jenis, i) =>
  (String(jenis).toUpperCase().startsWith('P') ? AVATAR_P : AVATAR_L)[i % 6]
export const latarAvatar = (i) => LATAR[i % LATAR.length]

function nomorDariNama(nama = '') {
  let n = 7
  for (let i = 0; i < nama.length; i++) n = (n * 31 + nama.charCodeAt(i)) % 100000
  return n % 6
}

export default function Avatar({
  nama = '',
  jenis = 'P',
  avatar = null,
  foto = '',
  size = 44,
  ring = false,
  className = '',
}) {
  const [gagal, setGagal] = useState(false)

  if (foto && !gagal) {
    return (
      <img
        src={foto}
        alt={nama}
        onError={() => setGagal(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${ring ? 'ring-2 ring-white' : ''} ${className}`}
      />
    )
  }

  const i = Number.isInteger(avatar) ? avatar : nomorDariNama(nama)

  return (
    <span
      role="img"
      aria-label={`Avatar ${nama}`}
      title={nama}
      style={{
        width: size,
        height: size,
        background: latarAvatar(i),
        fontSize: Math.round(size * 0.6),
        lineHeight: 1,
      }}
      className={`grid shrink-0 select-none place-items-center rounded-full ${
        ring ? 'ring-2 ring-white' : ''
      } ${className}`}
    >
      {emojiAvatar(jenis, i)}
    </span>
  )
}
