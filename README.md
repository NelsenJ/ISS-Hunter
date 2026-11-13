# ISS Hunter

Game web multipemain: tebak posisi Stasiun Luar Angkasa Internasional (ISS) beberapa menit ke depan berdasarkan pergerakan dan jejak orbitnya.

Dibuat dengan JavaScript murni (ES modules), Node.js 22 + Express (Vercel Serverless Function), dan Supabase (Auth & Postgres).

---

## Persyaratan Sistem

- Node.js 22 (`engines: 22.x`)
- npm 10+

---

## Menjalankan di Komputer Lokal

1. Salin berkas lingkungan:
   ```bash
   cp .env.example .env
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```
   Buka peramban di `http://localhost:3000`.

---

## Perintah Pengembangan

| Perintah | Deskripsi |
| --- | --- |
| `npm start` | Menjalankan server lokal (`src/index.js`) |
| `npm run dev` | Menjalankan server lokal dengan mode auto-reload |
| `npm test` | Menjalankan rangkaian unit test otomatis (`node --test`) |
| `npm run lint` | Memeriksa kepatuhan kode dengan ESLint |
| `npm run format` | Memformat kode dengan Prettier |
| `npm run format:check` | Memverifikasi kepatuhan format Prettier |

---

## Arsitektur Proyek

```
iss-hunter/
├── public/                 # Disajikan langsung oleh CDN Vercel
│   ├── css/                # Sistem desain (tokens, base, components, layout)
│   ├── js/                 # ES Modules frontend (main, api, theme)
│   └── index.html          # Halaman awal aplikasi
├── src/                    # Backend Express
│   ├── app.js              # Express app (titik masuk Vercel Serverless Function)
│   ├── index.js            # Runner lokal (listen port)
│   ├── config.js           # Validasi variabel lingkungan
│   ├── lib/
│   │   ├── csp.js          # Definisi tunggal Content Security Policy
│   │   └── errors.js       # AppError seragam
│   ├── middleware/         # errorHandler, requestLogger
│   └── routes/             # health, config
├── supabase/
│   └── schema.sql          # Skema database (tabel, indeks unik, view, RLS)
├── tests/                  # Rangkaian pengujian otomatis
├── vercel.json             # Header keamanan CDN (CSP, nosniff, frame DENY)
└── .env.example            # Templat variabel lingkungan
```

---

## Deploy ke Vercel & Supabase

### 1. Supabase
1. Buat proyek baru di [supabase.com](https://supabase.com) (pilih region terdekat, misal Singapura).
2. Buka menu **SQL Editor**, salin seluruh isi `supabase/schema.sql`, lalu jalankan.
3. Ambil kredensial di **Project Settings > API**:
   - `Project URL` (untuk `SUPABASE_URL`)
   - `Publishable API Key` (untuk `SUPABASE_PUBLISHABLE_KEY`)
   - `Secret Key` (untuk `SUPABASE_SECRET_KEY` — hanya untuk server, jangan berikan ke browser)

### 2. Vercel
1. Hubungkan repositori GitHub ke Vercel (`Add New Project`).
2. Titik masuk otomatis mendeteksi `src/app.js` sebagai Express Serverless Function.
3. Tambahkan Environment Variables di dashboard Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
4. Tekan **Deploy**, lalu uji endpoint `https://<domain-kamu>.vercel.app/api/health`.
