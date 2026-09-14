# Aplikasi Pembayaran TK — SPP & Biaya Kegiatan

Administrasi pembayaran untuk TK/PAUD: menggantikan kartu pembayaran kertas
dengan panel guru untuk mencatat, dan portal orang tua untuk memantau.

Tampilannya hibrida: di HP seperti aplikasi mobile (bingkai sempit,
navigasi di bawah), mulai lebar 1024px berubah jadi aplikasi web biasa —
panel guru memakai sidebar kiri dan tabel lebar, portal orang tua memakai
navigasi atas dan dua kolom. Titik pindahnya diatur di `components/ui.jsx`
lewat kelas `lg:` Tailwind, jadi tidak ada dua basis kode terpisah.

Satu basis kode, dua aplikasi:

| Bagian | Rute | Untuk siapa | Bisa apa |
|---|---|---|---|
| Panel guru | `/guru` | Guru & admin sekolah | Catat pembayaran, kelola jenis biaya, lihat laporan |
| Portal orang tua | `/ortu/<token>` | Wali murid | Lihat status tagihan dan bukti bayar (hanya lihat) |

## Menjalankan

```bash
npm install
npm run dev
```

Tanpa konfigurasi apa pun aplikasi jalan dalam **mode demo** memakai data
contoh di `src/lib/mock.js` — berguna untuk demo ke calon sekolah tanpa
menyentuh database. Untuk memakai data asli, salin `.env.example` menjadi
`.env` lalu isi kredensial Supabase (lihat `supabase/README.md`).

```bash
npm run build      # hasil siap unggah ada di folder dist/
```

## Arsitektur

```
React (Vite + Tailwind)  →  Supabase (Postgres + Auth + RLS)
        Netlify                     database
```

Satu proyek Supabase menampung banyak sekolah. Pemisahan datanya dijaga
Row Level Security, bukan oleh kode frontend:

- **Guru** login lewat Supabase Auth. Baris `profil` menghubungkan akun ke
  satu sekolah, dan setiap kebijakan RLS menyaring dengan `sekolah_id =
  sekolah_saya()`. Guru sekolah lain melihat nol baris, bukan hanya
  disembunyikan di tampilan.
- **Orang tua** tidak login dan tidak punya hak akses tabel sama sekali.
  Portal hanya bisa memanggil fungsi `portal_wali(token)`, yang
  mengembalikan data anak-anak dari wali pemilik token itu saja.

`src/lib/api.js` adalah satu-satunya file yang tahu soal Supabase.

## Status lunas tidak disimpan

Tidak ada kolom "sudah bayar" di tabel siswa. Sebuah bulan dianggap lunas
kalau ada barisnya di tabel `pembayaran`, dan status di layar diturunkan
dari situ saat data dimuat. Akibatnya riwayat dan status tidak mungkin
saling bertentangan, dan indeks unik parsial di database menolak
pencatatan ganda untuk bulan atau kegiatan yang sama.

## Struktur folder

```
src/
├─ components/
│  ├─ Avatar.jsx      ilustrasi wajah siswa (lihat bagian di bawah)
│  ├─ ui.jsx          kerangka layar HP, kartu, chip, bottom sheet, ikon
│  ├─ Masuk.jsx       layar login guru
│  └─ Pintu.jsx       pemilih peran (hanya untuk demo)
├─ lib/
│  ├─ supabase.js     klien Supabase; mendeteksi mode demo
│  ├─ api.js          semua query dan RPC; jatuh ke mock kalau env kosong
│  ├─ auth.jsx        sesi login staf
│  ├─ store.jsx       state bersama + aksi (catat, batalkan, ubah biaya)
│  ├─ format.js       rupiah, siklus bulan Juli–Juni, hitung tunggakan
│  └─ mock.js         data contoh untuk mode demo
├─ guru/             Beranda, DaftarSiswa, DetailSiswa, RiwayatBayar,
│                    Laporan, JenisBiaya, SheetCatat, SheetSiswa
└─ ortu/             Beranda, Tagihan, Riwayat, Bantuan, sheets

supabase/
├─ migrations/0001_skema.sql      tabel dan indeks
├─ migrations/0002_keamanan.sql   RLS, fungsi portal, hak akses peran
├─ seed.sql                       data contoh satu sekolah
└─ README.md                      langkah setup dari nol

prototipe/          mockup HTML statis yang jadi acuan desain
```

## Avatar siswa

`<Avatar nama jenis avatar foto size />` menampilkan avatar emoji di atas
lingkaran pastel — gayanya sengaja disamakan dengan aplikasi tabungan
siswa supaya kedua aplikasi terasa satu keluarga.

Urutan prioritasnya:

1. `foto` — kalau sekolah mengunggah foto siswa, foto itu yang dipakai
2. `avatar` — nomor 0–5 kalau guru memilih sendiri saat input siswa
3. nama siswa — kalau keduanya kosong, avatar dipilih otomatis dari nama,
   jadi satu anak selalu tampil sama di semua halaman

Pilihan avatarnya mengikuti `jenis_kelamin` (L/P): enam wajah putra dan
enam wajah putri dengan warna kulit berbeda-beda. Komponen
`PilihAvatar` menyediakan pemilihnya untuk form tambah / ubah siswa,
dan pilihannya disimpan di kolom `siswa.avatar`.

## Menambah sekolah baru

1. Jalankan `insert into sekolah (...)` untuk sekolah tersebut.
2. Buat akun guru di `Authentication > Users`, lalu tambahkan barisnya di
   tabel `profil` dengan `sekolah_id` sekolah itu.
3. Isi tabel `siswa` dan `biaya` sesuai data sekolah.
4. Buat baris `wali` + `wali_siswa` untuk tiap orang tua, lalu bagikan
   tautan `/ortu/<token>`.

Deployment frontend-nya cukup satu untuk semua sekolah, karena pemisahan
data terjadi di database. Kalau sekolah minta domain sendiri, deploy ulang
repo yang sama dengan domain berbeda — env-nya tetap sama.

## Kelola siswa

Guru menambah dan mengubah siswa langsung dari aplikasi (`SheetSiswa`):
jenis kelamin, avatar, nama, panggilan, NIS, kelas, data orang tua, dan
guru kelas. NIS diusulkan otomatis dari nomor terakhir yang dipakai, dan
kelas yang sudah ada muncul sebagai pilihan cepat.

Siswa yang keluar **dinonaktifkan**, bukan dihapus (`siswa.aktif = false`),
supaya riwayat pembayaran dan bukti bayar orang tua tetap utuh.

## Yang belum dikerjakan

- Kelola wali murid dan tautan portalnya dari aplikasi (saat ini lewat SQL).
- Impor data siswa dari Excel — berguna saat sekolah pertama kali pindah
  dari pencatatan kertas.
- Pembayaran online (QRIS / virtual account). Sekarang alurnya tunai atau
  transfer manual, lalu guru yang mencatat.
- Notifikasi otomatis ke orang tua saat tagihan dicatat atau jatuh tempo
  mendekat — cocok dikerjakan sebagai Edge Function + WhatsApp/Telegram.
- Cetak PDF laporan dan simpan bukti sebagai gambar (tombolnya sudah ada,
  fungsinya belum).
