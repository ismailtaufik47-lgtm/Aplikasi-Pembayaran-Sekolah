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

## Struktur tabel

| Tabel | Isi |
|---|---|
| `sekolah` | identitas sekolah, nominal SPP, tanggal jatuh tempo, rekening |
| `profil` | staf yang boleh login, terhubung ke `auth.users` |
| `siswa` | data siswa; `jenis_kelamin` menentukan bentuk avatar |
| `biaya` | jenis biaya kegiatan, berbeda-beda tiap sekolah |
| `pembayaran` | satu baris per pembayaran (SPP per bulan atau per kegiatan) |
| `wali` / `wali_siswa` | wali murid dan anak-anaknya, untuk tautan portal |

Status lunas tidak disimpan sebagai kolom. Sebuah bulan dianggap lunas
kalau ada barisnya di `pembayaran` — jadi riwayat dan status tidak akan
pernah berbeda. Indeks unik parsial mencegah satu bulan tercatat dua kali.
