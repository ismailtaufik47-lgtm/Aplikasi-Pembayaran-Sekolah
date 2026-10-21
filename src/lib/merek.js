/**
 * Merek per aplikasi. Layar masuk, layar memuat, dan popup pasang dipakai
 * bersama oleh aplikasi kas (/guru) dan aplikasi guru kelas (/kelas).
 * Aplikasi guru kelas membungkus dirinya dengan <MerekCtx.Provider> supaya
 * komponen bersama itu menampilkan identitas "Tumbuh Ceria" — tanpa tulisan
 * keuangan/SPP. Tanpa Provider (null) → tampilan Kasceria seperti biasa.
 */
import { createContext, useContext } from 'react'

export const MerekCtx = createContext(null)
export const useMerek = () => useContext(MerekCtx)
