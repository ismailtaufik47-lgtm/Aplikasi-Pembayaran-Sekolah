/**
 * UJI ANGKA DASBOR KEPALA SEKOLAH — kode dasbor ASLI vs laporan dari database (SQL).
 *
 *   npm run uji:dasbor        (atau: node uji/js/uji-dasbor.mjs)
 *
 * Dasbor kepala sekolah dihitung di HP/PC (src/lib/kesehatan.js, statusSiswa.js,
 * kegiatanKas.js …), bukan di database. Skrip ini menjalankan kode yang SAMA PERSIS:
 *   1. masuk sebagai Admin/TU sekolah uji, memuat data lewat muatDataGuru() asli
 *      (src/lib/api.js) — sama dengan saat aplikasi dibuka;
 *   2. menghitung dasbor seperti useKesehatan() (src/guru/useKesehatan.js);
 *   3. mencocokkan setiap angka dengan laporan dari database: laporan_tahunan(),
 *      tunggakan_nonaktif(), ai_tunggakan_lalu(), kas_daftar().
 * Hanya MEMBACA. Tidak ada data yang diubah.
 *
 * Akun: sekolah simulasi dari uji/sql/11_isi_50_sekolah.sql
 *   uji-beban-admin-01@contoh.test … -50 · PIN 123456 (jalankan SEBELUM 13_hapus_50_sekolah.sql)
 *
 * Pengaturan: .env.uji di folder proyek (sama dengan uji:api):
 *   SUPABASE_URL=https://xxxx.supabase.co        (= VITE_SUPABASE_URL di .env)
 *   SUPABASE_ANON_KEY=eyJhbGciOi...              (= VITE_SUPABASE_ANON_KEY di .env)
 *   UJI_SEKOLAH=50          (opsional) berapa sekolah UJI B, mulai dari B01 (0 = tidak ada)
 *   UJI_DASBOR_EMAIL=...    (opsional) ikut uji akun sekolah Anda sendiri (Admin/TU atau kepala)
 *   UJI_DASBOR_PIN=...      (opsional) PIN akun itu
 *
 * Hasil: tabel di layar (baris pertama = KESIMPULAN) + uji/hasil/uji-dasbor-<waktu>.csv
 */
import { register } from 'node:module'
import { createHmac, createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.TZ = 'Asia/Jakarta' // "hari ini" & bulan dihitung seperti HP di Indonesia
register('./_kait.mjs', import.meta.url) // src/lib/supabase.js → klien uji (lihat _kait.mjs)

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = (f) => pathToFileURL(join(AKAR, 'src', f)).href
const { createClient } = await import('@supabase/supabase-js')
const { pasangKlien } = await import('./_supabase_uji.mjs')
const api = await import(src('lib/api.js'))
const { bulanBerjalan, tanggalISO, tahunAjaranBerjalan } = await import(src('lib/format.js'))
const { kunciBulan } = await import(src('lib/kas.js'))
const { hitungRekapKegiatan } = await import(src('lib/kegiatanKas.js'))
const { statusSiswa } = await import(src('lib/statusSiswa.js'))
const { hitungKesehatan } = await import(src('lib/kesehatan.js'))

// ---------- pengaturan ----------
function bacaEnv() {
  const f = join(AKAR, '.env.uji')
  if (!existsSync(f)) {
    console.error('File .env.uji belum ada. Buat di folder proyek, isi SUPABASE_URL dan SUPABASE_ANON_KEY (salin dari .env).')
    process.exit(1)
  }
  const env = {}
  for (const baris of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = baris.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) if (!env[k]) { console.error(`${k} belum diisi di .env.uji`); process.exit(1) }
  return env
}
const env = bacaEnv()
const JUMLAH = Math.min(50, Math.max(0, Number(env.UJI_SEKOLAH ?? 50)))

// ---------- bantu ----------
const rp = (n) => (n == null ? '—' : 'Rp' + Math.round(Number(n)).toLocaleString('id-ID'))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function tokenJwt(sub, email, secret) {
  const kepala = b64({ alg: 'HS256', typ: 'JWT' })
  const isi = b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${kepala}.${isi}.${createHmac('sha256', secret).update(`${kepala}.${isi}`).digest('base64url')}`
}
const uuidMd5 = (t) => {
  const h = createHash('md5').update(t).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
async function rpc(sb, nama, arg) {
  const { data, error } = await sb.rpc(nama, arg)
  if (error) throw new Error(`${nama}: ${error.message}`)
  return data
}
const geserBulan = (kunci, n) => {
  const [y, m] = kunci.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const taDariBulan = (kunci) => { const [y, m] = kunci.split('-').map(Number); const a = m >= 7 ? y : y - 1; return `${a}/${a + 1}` }

async function masuk(email, pin, uidLokal) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  if (env.UJI_JWT_SECRET && uidLokal) {
    // khusus database tiruan lokal (tanpa server login)
    const t = tokenJwt(uidLokal, email, env.UJI_JWT_SECRET)
    const r = await sb.auth.setSession({ access_token: t, refresh_token: 'lokal' })
    if (r.error) throw new Error('masuk: ' + r.error.message)
  } else {
    const r = await sb.auth.signInWithPassword({ email, password: pin })
    if (r.error) throw new Error('masuk: ' + r.error.message)
  }
  return sb
}

// ---------- dasbor: PERSIS seperti src/guru/useKesehatan.js ----------
async function hitungDasbor(data) {
  const { pengaturan, siswa, biaya, paket, pembayaran } = data
  const siswaTahunIni = data.siswaKeluar?.length ? [...siswa, ...data.siswaKeluar] : siswa
  const kini = bulanBerjalan()
  const bulanIni = kunciBulan(tanggalISO())
  const demo = { pembayaran, biaya, paket }
  const aman = (p, cadangan) => p.catch(() => cadangan)
  const [info, lap, arus, keg, riwayat, ind] = await Promise.all([
    api.kasRingkasan(demo),
    api.kasLaporanBulan(bulanIni, demo),
    api.kasArus(bulanIni, 7, demo),
    aman(api.kasPengeluaranKegiatan(), []),
    aman(api.kasRiwayat({ dari: `${bulanIni}-01`, sampai: tanggalISO(), batas: 300 }, demo), { item: [] }),
    aman(api.muatIndikator(), { isi: null }),
  ])
  const d = { siap: true, info, lap, arus, keg, riwayat: riwayat.item || [] }
  const ctx = { biaya, paket, sppNominal: pengaturan.sppNominal, kini }
  const statusList = siswa.map((s) => ({ siswa: s, ...statusSiswa(s, ctx) }))
  const rekap = hitungRekapKegiatan({ biaya, paket, siswa: siswaTahunIni, pengeluaran: d.keg || [], pembayaran })
  const keluar = (d.riwayat || []).filter((k) => k.sumber === 'kas' && k.jenis === 'keluar' && !k.dibatalkanPada && !k.sebelumMulai)
  const nota = { total: keluar.length, ada: keluar.filter((k) => k.adaNota).length }
  const keluarKegiatan = {}
  ;(d.keg || []).forEach((k) => {
    const b = String(k.tanggal).slice(0, 7)
    keluarKegiatan[b] = (keluarKegiatan[b] || 0) + Number(k.nominal || 0)
  })
  const kes = hitungKesehatan({
    hariIni: new Date(), adaSaldoAwal: !!d.info?.pengaturan, saldoKini: d.info?.saldoKini || 0,
    arus: d.arus || [], keluarKegiatan, kegiatan: rekap, siswa, sppNominal: pengaturan.sppNominal, kini,
    status: statusList, nota,
  }, ind.isi)
  return { kes, d, statusList, rekap, nota, kini, bulanIni, siswaTahunIni, ctx, riwayatPenuh: (riwayat.item || []).length >= 300 }
}

// ---------- satu sekolah ----------
async function ujiSatu({ email, pin, uidLokal }) {
  const baris = []
  let nama = email
  const cek = (kelompok, apa, dasbor, sql, sama, ket = '') =>
    baris.push({ sekolah: nama, kelompok, cek: apa, dasbor, sql, hasil: sama ? 'LULUS' : 'GAGAL', ket })
  try {
    const sb = await masuk(email, pin, uidLokal)
    pasangKlien(sb)
    const data = await api.muatDataGuru()
    nama = data.pengaturan?.namaSekolah || data.pengaturan?.nama || email
    const D = await hitungDasbor(data)
    const { kes, kini, bulanIni } = D
    const taKini = tahunAjaranBerjalan()
    const L = await rpc(sb, 'laporan_tahunan', { p_ta: taKini })
    const pb = (i) => (L.spp?.perBulan || []).find((x) => x.i === i) || { target: 0, masuk: 0 }

    // ===== A & B. SPP bulan ini + tingkat bayar 3 bulan =====
    // Dasbor sengaja memakai siswa AKTIF saja. Laporan memakai semua siswa yang terdaftar
    // bulan itu (termasuk yang keluar sesudahnya). Jadi: mesin hitung dicek dengan siswa yang
    // sama (harus sama persis), lalu selisih angka dasbor harus = bagian siswa yang sudah keluar.
    const { targetSpp } = await import(src('lib/format.js'))
    const nominal = Number(data.pengaturan.sppNominal) || 0
    const jumlah = (daftar, bulan, isi) => bulan.reduce((s, i) => s + daftar.reduce((a, x) => a + isi(x, i), 0), 0)
    const tg = (x, i) => targetSpp(x, i, nominal)
    const ms = (x, i) => Math.min(targetSpp(x, i, nominal), x.spp?.[i] || 0)
    const keluar = data.siswaKeluar || []
    const bandingSpp = (kelompok, label, bulan) => {
      const tSql = bulan.reduce((s, i) => s + Number(pb(i).target), 0)
      const mSql = bulan.reduce((s, i) => s + Number(pb(i).masuk), 0)
      const tSemua = jumlah(D.siswaTahunIni, bulan, tg), mSemua = jumlah(D.siswaTahunIni, bulan, ms)
      cek(kelompok, `${label}: target / masuk (semua siswa terdaftar)`, `${rp(tSemua)} / ${rp(mSemua)}`, `${rp(tSql)} / ${rp(mSql)}`,
        tSemua === tSql && mSemua === mSql)
      const tAktif = jumlah(data.siswa, bulan, tg), mAktif = jumlah(data.siswa, bulan, ms)
      const tKel = jumlah(keluar, bulan, tg), mKel = jumlah(keluar, bulan, ms)
      cek(kelompok, `${label}: angka dasbor (siswa aktif)`, `${rp(tAktif)} / ${rp(mAktif)}`, `${rp(tSql - tKel)} / ${rp(mSql - mKel)}`,
        tAktif === tSql - tKel && mAktif === mSql - mKel, tKel ? `selisih dari laporan = ${keluar.length} siswa keluar tahun ini (${rp(tKel)} / ${rp(mKel)})` : '')
      return { tAktif, mAktif }
    }
    const a = bandingSpp('A SPP bulan ini', 'SPP bulan ini', [kini])
    cek('A SPP bulan ini', 'Dasbor memakai angka yang sama', `${rp(kes.sppTarget)} / ${rp(kes.sppMasuk)}`, `${rp(a.tAktif)} / ${rp(a.mAktif)}`,
      kes.sppTarget === a.tAktif && kes.sppMasuk === a.mAktif)
    const bln3 = [1, 2, 3].map((x) => kini - x).filter((i) => i >= 0)
    if (bln3.length) bandingSpp('B Perkiraan 3 bulan', 'SPP 3 bulan terakhir', bln3)

    // ===== C. tunggakan tahun ini (mesin status tagihan, semua siswa terdaftar tahun ini) =====
    let cSpp = 0, cKeg = 0, cSiswa = 0
    D.siswaTahunIni.forEach((s) => {
      const it = statusSiswa(s, D.ctx).items.filter((x) => x.status === 'nunggak' && !x.ta && x.jenis !== 'paket')
      const a = it.filter((x) => x.jenis === 'spp').reduce((t, x) => t + x.kurang, 0)
      const b = it.filter((x) => x.jenis === 'kegiatan').reduce((t, x) => t + x.kurang, 0)
      cSpp += a; cKeg += b; if (a + b > 0) cSiswa++
    })
    cek('C Tunggakan tahun ini', 'Tunggakan SPP (bulan yang sudah lewat)', rp(cSpp), rp(L.tunggakan?.spp), cSpp === Number(L.tunggakan?.spp))
    cek('C Tunggakan tahun ini', 'Tunggakan kegiatan (tanggal sudah lewat)', rp(cKeg), rp(L.tunggakan?.kegiatan), cKeg === Number(L.tunggakan?.kegiatan))
    cek('C Tunggakan tahun ini', 'Jumlah siswa menunggak', String(cSiswa), String(L.tunggakan?.siswa), cSiswa === Number(L.tunggakan?.siswa))

    // ===== D. tunggakan tahun lalu: siswa aktif (dasbor) + lulus/keluar (Tagihan) = semua laporan tahun lalu =====
    const daftarTa = (await rpc(sb, 'daftar_tahun_ajaran')).map((x) => x.kode).filter((k) => k < taKini)
    let sqlLalu = 0
    for (const ta of daftarTa) {
      const l = await rpc(sb, 'laporan_tahunan', { p_ta: ta })
      sqlLalu += Number(l.tunggakan?.spp || 0) + Number(l.tunggakan?.kegiatan || 0)
    }
    const aktifLalu = D.statusList.reduce((t, x) => t + x.items.filter((i) => i.status === 'nunggak' && i.ta).reduce((a, i) => a + i.kurang, 0), 0)
    const non = await rpc(sb, 'tunggakan_nonaktif')
    const nonLalu = (non || []).reduce((t, s) => t + (s.item || []).filter((i) => i.ta < taKini).reduce((a, i) => a + Number(i.target) - Number(i.dibayar), 0), 0)
    const ai = await rpc(sb, 'ai_tunggakan_lalu', {})
    cek('D Tunggakan tahun lalu', 'Siswa aktif (dasbor) + lulus/keluar (Tagihan)', rp(aktifLalu + nonLalu), rp(sqlLalu), aktifLalu + nonLalu === sqlLalu,
      `aktif ${rp(aktifLalu)} + lulus/keluar ${rp(nonLalu)}`)
    cek('D Tunggakan tahun lalu', 'Sama dengan Tanya SAKU (ai_tunggakan_lalu)', rp(sqlLalu), rp(ai.total_kurang_rupiah), sqlLalu === Number(ai.total_kurang_rupiah))

    // ===== E. kas =====
    if (D.d.info?.pengaturan && L.kas) {
      cek('E Kas', 'Saldo kas hari ini', rp(kes.kasBebas + kes.totalTerikat), rp(L.kas.saldoAkhir), kes.kasBebas + kes.totalTerikat === Number(L.kas.saldoAkhir))
      const lapPer = {}
      const ambilBulan = async (b) => {
        const ta = taDariBulan(b)
        if (!lapPer[ta]) lapPer[ta] = ta === taKini ? L : await rpc(sb, 'laporan_tahunan', { p_ta: ta }).catch(() => null)
        return (lapPer[ta]?.kas?.perBulan || []).find((x) => x.bulan === b)
      }
      for (const n of [0, 1, 2, 3]) {
        const b = geserBulan(bulanIni, -n)
        const a = (D.d.arus || []).find((x) => x.bulan === b) || { masuk: 0, keluar: 0 }
        const s = await ambilBulan(b)
        if (!s) continue
        const ok = a.masuk === Number(s.masuk) && a.keluar === Number(s.keluar)
        cek('E Kas', `Arus kas ${b} (masuk / keluar)`, `${rp(a.masuk)} / ${rp(a.keluar)}`, `${rp(s.masuk)} / ${rp(s.keluar)}`, ok)
      }
      // kerapian nota bulan ini
      const kd = await api.kasDaftar({ jenis: 'keluar', dari: `${bulanIni}-01`, sampai: tanggalISO(), batas: 1 })
      cek('E Kas', 'Pengeluaran bulan ini (jumlah / ada nota)', `${kes.nota.total} / ${kes.nota.ada}`, `${kd.ringkas.jumlah} / ${kd.ringkas.adaNota}`,
        kes.nota.total === kd.ringkas.jumlah && kes.nota.ada === kd.ringkas.adaNota, D.riwayatPenuh ? 'riwayat bulan ini ≥ 300 baris — dasbor hanya membaca 300' : '')
    } else {
      cek('E Kas', 'Saldo kas', '—', '—', true, 'buku kas belum diisi — dilewati')
    }

    // ===== F. kegiatan & paket (dana terikat, kegiatan nombok) =====
    const lk = new Map((L.kegiatan || []).map((k) => [k.id, k]))
    let fBeda = []
    let nombokSql = 0
    D.rekap.filter((x) => x.jenis === 'kegiatan').forEach((x) => {
      const s = lk.get(x.id)
      if (!s) { fBeda.push(`${x.nama}: tidak ada di laporan`); return }
      if (x.masuk !== Number(s.masuk)) fBeda.push(`${x.nama} masuk ${rp(x.masuk)} ≠ ${rp(s.masuk)}`)
      if (s.terpakai != null && x.terpakai !== Number(s.terpakai)) fBeda.push(`${x.nama} terpakai ${rp(x.terpakai)} ≠ ${rp(s.terpakai)}`)
    })
    ;(L.kegiatan || []).forEach((s) => { if (Number(s.terpakai) > 0 && Number(s.masuk) - Number(s.terpakai) < 0) nombokSql++ })
    cek('F Kegiatan', `Uang masuk & terpakai per kegiatan (${(L.kegiatan || []).length} kegiatan)`, fBeda.length ? `${fBeda.length} beda` : 'sama', 'laporan_tahunan', !fBeda.length, fBeda.slice(0, 3).join('; '))
    const nombokJs = kes.nombok.filter((x) => x.jenis === 'kegiatan').length
    cek('F Kegiatan', 'Kegiatan nombok', String(nombokJs), String(nombokSql), nombokJs === nombokSql)
    const lp = new Map((L.paket || []).map((p) => [p.id, p]))
    const pBeda = D.rekap.filter((x) => x.jenis !== 'kegiatan' && lp.has(x.id) && x.masuk !== Number(lp.get(x.id).masuk))
    cek('F Kegiatan', `Uang masuk paket PMB / daftar ulang (${lp.size} paket)`, pBeda.length ? `${pBeda.length} beda` : 'sama', 'laporan_tahunan', !pBeda.length,
      pBeda.slice(0, 3).map((x) => `${x.nama} ${rp(x.masuk)} ≠ ${rp(lp.get(x.id).masuk)}`).join('; '))

    // ===== G. skor =====
    const angkaOk = [kes.sppTarget, kes.sppMasuk, kes.tunggakan, kes.kasBebas].every((v) => Number.isFinite(v))
    const skorOk = kes.skor == null || (kes.skor >= 0 && kes.skor <= 100)
    cek('G Skor', 'Skor & zona dasbor', `${kes.skor ?? '—'} · ${kes.zona}`, '0–100', angkaOk && skorOk,
      `tunggakan dasbor ${rp(kes.tunggakan)} · ${kes.anakNunggak} anak · kas bebas ${rp(kes.kasBebas)}`)
  } catch (e) {
    baris.push({ sekolah: nama, kelompok: '-', cek: 'jalan', dasbor: '', sql: '', hasil: 'GALAT', ket: e.message })
  }
  return baris
}

// ---------- utama ----------
const akun = []
for (let no = 1; no <= JUMLAH; no++) {
  const k = String(no).padStart(2, '0')
  akun.push({ email: `uji-beban-admin-${k}@contoh.test`, pin: '123456', uidLokal: uuidMd5(`kasceria-beban-akun-admin-${no}`) })
}
if (env.UJI_DASBOR_EMAIL) akun.push({ email: env.UJI_DASBOR_EMAIL, pin: env.UJI_DASBOR_PIN, uidLokal: env.UJI_DASBOR_UID })
if (!akun.length) { console.error('Tidak ada akun yang diuji (UJI_SEKOLAH=0 dan UJI_DASBOR_EMAIL kosong).'); process.exit(1) }

console.log(`Uji angka dasbor kepala sekolah: ${akun.length} sekolah → ${env.SUPABASE_URL}\n`)
const t0 = Date.now()
const semua = []
for (const a of akun) {
  const b = await ujiSatu(a)
  semua.push(...b)
  const g = b.filter((x) => x.hasil !== 'LULUS').length
  console.log(`  ${g ? '✗' : '✓'} ${(b[0]?.sekolah || a.email).padEnd(36)} ${b.length - g}/${b.length} cocok`)
}
const gagal = semua.filter((x) => x.hasil !== 'LULUS')
const sekolahN = new Set(semua.map((x) => x.sekolah)).size
console.log(`\n================ KESIMPULAN ================`)
console.log(gagal.length
  ? `GAGAL — ${gagal.length} dari ${semua.length} pemeriksaan tidak cocok (${sekolahN} sekolah, ${Math.round((Date.now() - t0) / 1000)} detik)`
  : `LULUS — ${semua.length} pemeriksaan, ${sekolahN} sekolah: angka dasbor sama dengan laporan database (${Math.round((Date.now() - t0) / 1000)} detik)`)
if (gagal.length) console.table(gagal.slice(0, 40).map(({ sekolah, kelompok, cek, dasbor, sql, ket }) => ({ sekolah, kelompok, cek, dasbor, sql, ket })))
else console.table(semua.filter((x) => x.sekolah === semua[semua.length - 1].sekolah).map(({ kelompok, cek, dasbor, sql, hasil }) => ({ kelompok, cek, dasbor, sql, hasil })))

mkdirSync(join(AKAR, 'uji', 'hasil'), { recursive: true })
const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const csv = join(AKAR, 'uji', 'hasil', `uji-dasbor-${stempel}.csv`)
const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
writeFileSync(csv, ['sekolah,kelompok,cek,dasbor,sql,hasil,keterangan', ...semua.map((x) => [x.sekolah, x.kelompok, x.cek, x.dasbor, x.sql, x.hasil, x.ket].map(sel).join(','))].join('\n'))
console.log(`\nCSV: ${csv}`)
process.exit(gagal.length ? 1 : 0)
