// Portal orang tua — merapikan aspek & nilai sebelum digambar.
//
// Saat sekolah mengganti dasar penilaian, aspek/indikator lama yang sudah punya
// nilai tetap dikirim (arsip: true) supaya riwayat anak tidak hilang. Akibatnya
// bisa muncul nama ganda (mis. Merdeka → STPPA → Merdeka lagi). Di sini:
//  1. aspek yang namanya sama digabung jadi satu, begitu juga indikator yang
//     namanya sama di dalamnya → nilai lama & baru berada di garis yang sama;
//  2. `utama` = aspek dasar penilaian yang sekarang dipakai (untuk grafik). Kalau
//     aspek itu belum punya nilai sama sekali → semua aspek yang punya nilai.
// Setiap aspek mendapat `warna` (urutan tetap) agar warna grafik & rincian sama.

const kunci = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export function rapikanTumbuh(aspekAsli = [], periodeAsli = []) {
  const grup = new Map() // kunci nama aspek → { aspek, indikator: Map(kunci nama → indikator) }
  const kunciAspek = new Map() // id aspek asli → kunci
  const petaInd = new Map() // id indikator asli → id indikator wakil
  // aspek aktif lebih dulu (urutan server tetap), supaya jadi wakil kelompoknya
  const urut = [...aspekAsli].sort((a, b) => Number(!!a.arsip) - Number(!!b.arsip))
  for (const a of urut) {
    const k = kunci(a.pendek || a.nama)
    let g = grup.get(k)
    if (!g) { g = { aspek: { ...a, arsip: !!a.arsip, indikator: [] }, ind: new Map() }; grup.set(k, g) }
    else if (!a.arsip) g.aspek.arsip = false
    kunciAspek.set(a.id, k)
    for (const x of a.indikator || []) {
      const kx = kunci(x.nama)
      let wakil = g.ind.get(kx)
      if (!wakil) { wakil = { ...x }; g.ind.set(kx, wakil); g.aspek.indikator.push(wakil) }
      else if (!x.arsip && wakil.arsip) Object.assign(wakil, { nama: x.nama, khas: x.khas, arsip: false })
      petaInd.set(x.id, wakil.id)
    }
  }
  const aspek = [...grup.values()].map((g, i) => ({ ...g.aspek, warna: i }))

  // nilai per periode memakai id indikator wakil; kalau bertabrakan, nilai indikator wakil menang
  const periode = periodeAsli.map((p) => {
    const nilai = {}
    for (const [id, n] of Object.entries(p.nilai || {})) {
      const tujuan = petaInd.get(id) || id
      if (nilai[tujuan] == null || id === tujuan) nilai[tujuan] = n
    }
    return { ...p, nilai }
  })

  const punyaNilai = (a) => a.indikator.some((x) => periode.some((p) => p.nilai[x.id] != null))
  const aktif = aspek.filter((a) => !a.arsip && punyaNilai(a))
  const utama = aktif.length ? aktif : aspek.filter(punyaNilai)
  const peta = new Map(aspek.map((a) => [kunci(a.pendek || a.nama), a]))
  return { aspek, utama, periode, cariAspek: (id) => (id ? peta.get(kunciAspek.get(id)) : null) }
}
