# Menyiapkan database Supabase

Satu proyek Supabase bisa menampung banyak sekolah. Pemisahan datanya
dijaga Row Level Security: staf hanya melihat baris milik sekolahnya,
dan orang tua tidak punya akses langsung ke tabel sama sekali.

## 1. Buat proyek
Buat proyek baru di [supabase.com](https://supabase.com), pilih region
Singapore (paling dekat ke Indonesia).

## 2. Jalankan SQL
Buka `SQL Editor > New query`, lalu jalankan berurutan:

1. `supabase/migrations/0001_skema.sql` — tabel dan indeks
2. `supabase/migrations/0002_keamanan.sql` — RLS dan fungsi portal
3. `supabase/seed.sql` — data contoh (boleh dilewati untuk sekolah asli)

Kalau memakai Supabase CLI: `supabase db push` lalu `supabase db seed`.

## 3. Aktifkan login Google

Aplikasi ini login pakai Google (bukan email/password), lewat Supabase Auth:

1. **Google Cloud Console** → buat OAuth Client ID (Web application), isi
   Authorized JavaScript origins (`http://localhost:5173` + domain
   produksi) dan Authorized redirect URIs (callback URL dari langkah 2).
2. **Supabase → Authentication → Providers → Google** → aktifkan, tempel
   Client ID & Client Secret dari Google. Halaman ini juga menampilkan
   **Callback URL** yang perlu ditempel balik ke Google.
3. **Supabase → Authentication → URL Configuration** → tambahkan
   `http://localhost:5173/**` dan domain produksi ke Redirect URLs.

## 4. Onboarding otomatis — tidak perlu SQL manual lagi

Jalankan juga `supabase/migrations/0004_peran_dan_aktivasi.sql`. Setelah
itu, siapa pun yang login Google dan belum punya baris `profil` akan
melihat layar pilihan di aplikasi itu sendiri:

- **"Saya kepala sekolah/admin"** → isi nama sekolah, sistem otomatis
  membuat baris `sekolah` + `profil` (peran `kepala`) lewat fungsi
  `daftarkan_sekolah()`.
- **"Saya guru/TU"** → masukkan kode aktivasi 6 karakter yang didapat
  dari kepala sekolah, lewat fungsi `aktivasi_kode()`.

Kepala sekolah membuat kode itu dari menu **Kode aktivasi** di
aplikasi (khusus peran `kepala`/`admin`), yang memanggil
`buat_kode_aktivasi()`. Kode sekali pakai dan otomatis hangus setelah
dipakai.

Jalur manual lewat SQL Editor (insert langsung ke `profil`) masih bisa
dipakai kalau perlu, tapi sejak migrasi ini tidak lagi wajib untuk
pemakaian sehari-hari.

## 4. Ambil kunci API
`Project Settings > API`, salin **Project URL** dan **anon public key** ke
file `.env` di root proyek React:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Anon key memang aman ditaruh di frontend selama RLS aktif. Yang tidak
boleh dipakai di frontend adalah **service_role key**.

## 5. Tautan portal orang tua
Setiap wali punya token sendiri di tabel `wali`. Bagikan tautannya:

```
https://domain-sekolah.netlify.app/ortu/<token>
```

Membuat wali baru beserta anaknya:

```sql
with w as (
  insert into wali (sekolah_id, nama, hp)
  select id, 'Ibu Dewi', '085722119900' from sekolah where nama = 'TK Tunas Ceria'
  returning id, token
)
insert into wali_siswa (wali_id, siswa_id)
select w.id, s.id from w, siswa s where s.nis = '2026-015';

select nama, token from wali;  -- salin tokennya
```

Kalau tautan bocor, hapus dan buat ulang tokennya:

```sql
update wali set token = encode(gen_random_bytes(16), 'hex') where nama = 'Ibu Dewi';
```

## 6. Tanya AI (khusus kepala sekolah)

Menu **🤖 Tanya AI** muncul otomatis untuk akun kepala sekolah. Supaya
bisa menjawab, ada tiga hal yang perlu disiapkan satu kali saja:

**a. Jalankan SQL** `supabase/migrations/0023_tanya_ai.sql` di SQL Editor
(berisi 5 fungsi pengambil data + penghitung kuota harian).

**b. Buat API key Claude** di [console.anthropic.com](https://console.anthropic.com):
Settings → API Keys → Create Key (diawali `sk-ant-…`), lalu isi saldo di
menu Billing. Simpan key ini baik-baik — jangan pernah ditaruh di file
`.env` aplikasi React, karena apa pun di situ bisa dilihat orang di browser.

**c. Pasang Edge Function `tanya-ai`** — pilih salah satu cara:

*Cara 1 — lewat dashboard (tanpa install apa pun):*
1. Dashboard Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Beri nama persis `tanya-ai`, hapus contoh kodenya, tempel seluruh isi
   `supabase/functions/tanya-ai/index.ts`, lalu **Deploy**.
3. Edge Functions → **Secrets** → tambah `ANTHROPIC_API_KEY` = key dari langkah b.

*Cara 2 — lewat Supabase CLI (dari folder proyek):*
```bash
npx supabase login
npx supabase link --project-ref <kode-proyek>   # kode dari URL dashboard: supabase.com/dashboard/project/<kode-proyek>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
npx supabase functions deploy tanya-ai
```

Pengaturan tambahan (opsional, lewat Secrets yang sama):

| Secret | Default | Arti |
|---|---|---|
| `AI_BATAS_HARIAN` | `30` | maksimal pertanyaan per sekolah per hari |
| `AI_MODEL` | `claude-haiku-4-5` | model AI yang dipakai |

Cara kerjanya singkat: AI **tidak pernah menghitung angka sendiri**. AI
hanya memilih fungsi database mana yang dipanggil (`ai_rekap_bulan`,
`ai_daftar_tunggakan`, `ai_status_siswa`, `ai_perbandingan_kelas`,
`ai_transaksi`), fungsi itulah yang menghitung dengan aturan yang sama
dengan aplikasi, lalu AI merangkai jawabannya. Semua fungsi berjalan atas
nama akun kepala sekolah, jadi hanya bisa membaca data sekolahnya sendiri.
Nomor HP dan alamat tidak pernah dikirim ke AI.

Kalau kepala sekolah melihat pesan *"Tanya AI belum aktif: fungsi server
belum dipasang"*, berarti langkah c belum dilakukan. Kalau *"API key belum
diisi"*, berarti secret `ANTHROPIC_API_KEY` belum ada.

## 7. Kuitansi digital, invoice sewa & Tanya AI v2

1. Jalankan `supabase/migrations/0024_kuitansi_invoice_ai_v2.sql` di SQL Editor.
2. Di folder aplikasi jalankan sekali: `npm install qrcode` (untuk kode QR di kuitansi).
3. Deploy ulang Edge Function `tanya-ai` (tempel lagi isi `index.ts` terbaru) —
   sekarang admin sekolah juga bisa memakai Tanya AI.

Setelah itu:

| Siapa | Di mana | Apa |
|---|---|---|
| Kepala sekolah | Profil sekolah → *Tanda tangan kuitansi* | Nama & jabatan penanda tangan (mis. Bendahara), tanda tangan (gambar di layar / foto), stempel |
| Orang tua | Portal → ketuk transaksi → *Unduh kuitansi (PDF)* | Kuitansi resmi ber-TTD + QR verifikasi |
| Guru / admin sekolah | Riwayat pembayaran → ikon 📄 | Kuitansi yang sama, misalnya untuk dikirim lewat WA |
| Kepala / admin sekolah | Langganan → *Dokumen sewa* | Invoice bulan berikutnya & kuitansi setiap pembayaran sewa |
| Admin aplikasi | Panel admin → *Pengaturan* | Nama usaha, alamat, WA, rekening, TTD & stempel penerbit invoice |
| Admin aplikasi | Panel admin → sekolah → ⋯ | Unduh invoice, atur kuota Tanya AI (0 = matikan) |
| Siapa saja | Pindai QR di kuitansi → `/verifikasi/<kode>` | Cek kuitansi asli atau tidak (tanpa login) |

Rekening & WA yang diisi di panel admin → Pengaturan otomatis dipakai halaman
Langganan sekolah. Selama belum diisi, halaman itu memakai `REKENING_BANK` dan
`WA_PENGEMBANG` di `src/lib/langganan.js`.

**Perbaikan keamanan di 0024:** sebelumnya staf sekolah secara teknis bisa
mengubah sendiri kolom `langganan_sampai` (memperpanjang langganan tanpa bayar)
lewat API. Sekarang kolom langganan, tarif, dan kuota AI dikunci — hanya admin
aplikasi atau fungsi resmi yang bisa mengubahnya.

## 8. Logo, WhatsApp sekolah, mode gelap & perbaikan Tanya AI

1. Jalankan `supabase/migrations/0025_logo_perbaikan_ai.sql` di SQL Editor.
2. Deploy ulang Edge Function `tanya-ai` (tempel isi `index.ts` terbaru).
3. Kepala sekolah mengisi di **Profil sekolah**:
   - **No. WhatsApp sekolah / TU** — tujuan tombol WhatsApp di portal orang tua.
     Selama kosong, tombol WhatsApp melayang di portal disembunyikan.
   - **Logo sekolah** — tercetak di kop kuitansi (langsung tersimpan saat dipilih).
4. Admin aplikasi: logo penerbit untuk invoice & kuitansi sewa ada di
   **Panel admin → Pengaturan**.

**Mode terang/gelap** tidak butuh database: pilihannya disimpan di perangkat
masing-masing. Tempatnya: tombol ☀️/🌙 di menu samping (laptop), kartu
*Tampilan* di Lainnya / Profil akun (guru), Bantuan (portal orang tua), dan
Pengaturan (panel admin). Default-nya terang.

## 9. Info kegiatan untuk orang tua & lonceng pemberitahuan

1. Jalankan `supabase/migrations/0026_info_kegiatan.sql` di SQL Editor.
   (Hanya menambah kolom di tabel `biaya` — data lama tidak berubah.)
2. Staf sekolah membuka **Jenis biaya** → ketuk nama kegiatan → isi tanggal,
   waktu, lokasi, keterangan, dan barang bawaan → **Simpan info kegiatan**.
3. Orang tua melihatnya di portal: **Tagihan → Biaya kegiatan → ketuk kegiatannya**.
   Kegiatan yang tinggal 7 hari lagi otomatis muncul di lonceng pemberitahuan.

**Angka di lonceng** sekarang hanya menghitung pemberitahuan yang *belum dibaca*.
Setelah lonceng dibuka angkanya hilang, dan baru muncul lagi kalau ada hal baru
(bulan SPP baru jatuh tempo, kegiatan baru, atau kegiatan yang makin dekat).
Status "sudah dibaca" disimpan di perangkat masing-masing, tanpa database.

## 10. Tampilan baru portal orang tua

1. Jalankan `supabase/migrations/0027_logo_portal.sql` di SQL Editor.
   Isinya satu fungsi kecil untuk mengambil logo sekolah. Selama belum
   dijalankan, portal tetap normal — pojok kiri atas memakai ikon 🏫.
2. Logo diambil dari **Profil sekolah → Logo sekolah** (fitur 0025),
   jadi tidak perlu unggah ulang.

Menu bawah portal: Beranda · Tagihan · Riwayat · Kegiatan · Bantuan.

## 11. Kas sekolah (pengeluaran & laporan kas bulanan)

1. Jalankan `supabase/migrations/0028_kas.sql` di SQL Editor.
2. Kepala sekolah / admin membuka **Kas sekolah** (menu samping, atau Lainnya di HP)
   lalu **Isi saldo awal** sekali: uang kas yang ada saat mulai memakai fitur ini.
3. Catat **pengeluaran** dan **pemasukan lain** (donasi, dana BOP, …). Pemasukan
   SPP & biaya kegiatan tidak perlu dicatat ulang — diambil otomatis dari pembayaran.
4. Laporan per bulan bisa diunduh PDF (kop + tanda tangan dari Profil sekolah) atau Excel.

Hak akses: semua staf bisa melihat; hanya kepala sekolah & admin yang bisa mencatat
dan membatalkan. Transaksi tidak pernah dihapus — yang salah dibatalkan dengan alasan
dan tetap terlihat dicoret.

## 12. Dua peran, hak akses per sekolah, pembatalan & kunci sewa

Jalankan `supabase/migrations/0029_hak_akses_pembatalan.sql` di SQL Editor
(butuh 0024–0028; aman dijalankan berulang).

**Dua peran saja.** Guru kelas tidak memakai aplikasi. Peran sekolah:
**Kepala sekolah** (`kepala`) dan **Admin/TU** (`admin`). Akun & kode aktivasi
lama berperan `guru` otomatis menjadi `admin`.

**Hak akses per sekolah** — panel admin → Sekolah → ⋯ → 🔐 Hak akses. Pilih susunan
siap pakai atau atur per fitur (Tidak · Lihat · Kelola):

| Fitur | Kepala (standar) | Admin/TU (standar) |
|---|---|---|
| Data siswa | Lihat | Kelola |
| Pembayaran | Lihat | Kelola |
| Pembatalan transaksi | Kelola | Kelola |
| Kas sekolah | Lihat | Kelola |
| Laporan pembayaran / keuangan | Lihat | Lihat |
| Tanya AI | Kelola | Kelola |
| Jenis biaya & SPP | Lihat | Kelola |
| Profil sekolah, kode aktivasi, langganan | Kelola (selalu) | Tidak |

Ditegakkan di database (RLS & fungsi), bukan hanya menu. Pengaman: minimal satu
peran harus bisa mencatat pembayaran, mengelola siswa, dan mengatur jenis biaya.

**Pembatalan, bukan hapus.** Pembayaran dibatalkan lewat `batalkan_pembayaran(id, alasan)`:
baris dipindah ke arsip `pembayaran_batal` (siapa, kapan, alasan) sehingga status SPP,
laporan, portal orang tua & Tanya AI otomatis tidak menghitungnya. Kuitansinya tampil
**DIBATALKAN** saat QR dicek. Kas dibatalkan dengan `kas_batalkan` (tetap tampil dicoret).
Semua pembatalan terlihat di **Pembayaran → tab Dibatalkan**.

**Sewa habis → transaksi terkunci:** catat pembayaran, tambah siswa, catat kas, saldo awal
kas, dan pembatalan ditolak database sampai sewa diperpanjang. Data tetap bisa dilihat.

Uji coba mode demo (tanpa Supabase), di konsol browser:
`localStorage.setItem('tk_demo_peran','kepala')` · `localStorage.setItem('tk_demo_habis','1')`
lalu muat ulang halaman.

## 13. Kas: saldo tidak boleh minus & laporan dihitung server

Jalankan `supabase/migrations/0030_kas_saldo.sql` di SQL Editor (butuh 0028 & 0029;
aman dijalankan berulang).

Aturan yang ditegakkan database:

- Saldo awal kas wajib diisi dulu (tidak boleh minus) sebelum mencatat transaksi kas.
- Tanggal transaksi kas tidak boleh sebelum **tanggal mulai** saldo awal. Mau mencatat
  transaksi bulan lalu → ubah dulu tanggal mulai saldo awal ke tanggal yang lebih awal.
- Saldo kas tidak boleh minus di tanggal mana pun: pengeluaran melebihi saldo,
  pengeluaran tanggal mundur yang membuat saldo hari berikutnya minus, membatalkan
  pemasukan/pembayaran yang uangnya sudah terpakai, dan mengubah saldo awal yang
  membuat saldo minus — semuanya ditolak dengan pesan yang menjelaskan cara membetulkannya.
- Dua petugas mencatat bersamaan tidak bisa menembus saldo (diantrekan per sekolah).

Saldo, laporan bulanan, arus kas, dan riwayat sekarang dihitung server
(`kas_ringkasan`, `kas_laporan_bulan`, `kas_arus`, `kas_riwayat`, `kas_saldo_tersedia`),
jadi tetap benar walau transaksi sudah ribuan. Halaman Kas menampilkan riwayat 7 hari
terakhir (bisa pilih 30 hari, bulan ini, atau tanggal sendiri), dimuat 30 baris per halaman.

Data lama yang tanggalnya sebelum tanggal mulai tidak dihitung dan ditandai
"Tidak dihitung" di halaman Kas, lengkap dengan petunjuk membetulkannya.

## 14. SAKU — Sahabat Keuangan Sekolah (Tanya AI bisa membaca kas)

"Tanya AI" sekarang bernama **SAKU** (Sahabat Keuangan Sekolah) dan bisa menjawab soal
buku kas: saldo, pemasukan (SPP, kegiatan, pemasukan lain), pengeluaran per kategori,
ringkasan mingguan/bulanan, dan tren per bulan.

1. Jalankan `supabase/migrations/0031_saku.sql` di SQL Editor (butuh 0030).
2. **Deploy ulang Edge Function `tanya-ai`** — Dashboard Supabase → Edge Functions →
   `tanya-ai` → tempel seluruh isi `supabase/functions/tanya-ai/index.ts` terbaru → Deploy
   (atau `npx supabase functions deploy tanya-ai`). Nama fungsinya tetap `tanya-ai`.
3. Data kas hanya dibacakan untuk akun yang punya hak akses **SAKU** *dan* **kas / laporan
   keuangan** (panel admin → Hak akses). Tanpa akses kas, SAKU menolak menyebut angka kas.

## Struktur tabel

| Tabel | Isi |
|---|---|
| `sekolah` | identitas sekolah, nominal SPP, tanggal jatuh tempo, rekening |
| `profil` | staf yang boleh login, terhubung ke `auth.users` |
| `siswa` | data siswa; `jenis_kelamin` menentukan bentuk avatar |
| `biaya` | jenis biaya kegiatan, berbeda-beda tiap sekolah, plus info kegiatan untuk orang tua |
| `pembayaran` | satu baris per pembayaran (SPP per bulan atau per kegiatan) |
| `wali` / `wali_siswa` | wali murid dan anak-anaknya, untuk tautan portal |

Status lunas tidak disimpan sebagai kolom. Sebuah bulan dianggap lunas
kalau ada barisnya di `pembayaran` — jadi riwayat dan status tidak akan
pernah berbeda. Indeks unik parsial mencegah satu bulan tercatat dua kali.
