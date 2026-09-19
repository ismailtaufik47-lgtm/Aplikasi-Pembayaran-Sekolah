/** Sesi login staf sekolah. Di mode demo, sesi selalu dianggap aktif. */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, modeDemo } from './supabase.js'
import * as api from './api.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [sesi, setSesi] = useState(modeDemo ? { demo: true } : null)
  const [siap, setSiap] = useState(modeDemo)

  useEffect(() => {
    if (modeDemo) return
    supabase.auth.getSession().then(({ data }) => {
      setSesi(data.session)
      setSiap(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSesi(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const nilai = {
    sesi,
    siap,
    modeDemo,
    masukGoogle: () => api.masukGoogle(),
    // PIN sungguhan — verifikasi terjadi di server Supabase
    // (signInWithPassword), bukan dicocokkan di browser. Lihat lib/api.js.
    masukPin: (email, pin) => api.masukPin(email, pin),
    keluar: async () => {
      await api.keluar()
      setSesi(null)
    },
  }
  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>
}