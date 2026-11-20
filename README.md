# ISS Hunter

Game web multipemain untuk memprediksi posisi Stasiun Luar Angkasa Internasional (*International Space Station* / ISS) secara *real-time* berdasarkan proyeksi arah dan jejak orbit lintasannya.

Aplikasi Live: [https://iss-hunter.vercel.app](https://iss-hunter.vercel.app)

---

## Daftar Isi

- [Ringkasan](#ringkasan)
- [Fitur Utama](#fitur-utama)
- [Teknologi yang Digunakan](#teknologi-yang-digunakan)
- [Cara Kerja Sistem](#cara-kerja-sistem)
  - [Alur Permainan](#alur-permainan)
  - [Rumus Jarak dan Skor](#rumus-jarak-dan-skor)
  - [Sistem Level dan Lencana](#sistem-level-dan-lencana)
  - [Papan Peringkat (Leaderboard)](#papan-peringkat-leaderboard)
  - [Mekanisme Keamanan](#mekanisme-keamanan)
- [Spesifikasi Teknis](#spesifikasi-teknis)
- [Dokumentasi API](#dokumentasi-api)
  - [Internal API](#internal-api)
  - [External API & Sumber Data](#external-api--sumber-data)
- [Struktur Direktori](#struktur-direktori)
- [Kredit](#kredit)

---

## Ringkasan

ISS Hunter menggabungkan konsep eksplorasi peta interaktif dengan astrodinamika satelit Bumi rendah (*Low Earth Orbit* / LEO). ISS mengitari Bumi pada ketinggian sekitar 400–420 km dengan kecepatan rata-rata 27.600 km/jam dan inklinasi 51,6°. 

Pemain ditugaskan memprediksi posisi koordinat ISS pada rentang waktu 10 hingga 30 menit ke depan. Akurasi tebakan dievaluasi secara otomatis menggunakan perhitungan jarak geodesik (*Haversine*) terhadap posisi acuan sebenarnya (*ground truth*) yang dihasilkan oleh algoritma propagasi orbit satelit SGP4 (*Simplified General Perturbations-4*).

---

## Fitur Utama

- **Pelacakan ISS Real-Time:** Visualisasi koordinat live, sudut rotasi arah hadap (*bearing*), dan jejak orbit historis menggunakan akselerasi Canvas.
- **Mode Ronde Berperingkat (Ranked):** Ronde kompetitif dengan batas waktu submit 5 menit dan horizon acak (10–30 menit).
- **Mode Latihan (Practice):** Mode eksplorasi bebas untuk menguji prediksi tanpa memengaruhi skor akun atau peringkat.
- **Penilaian Berbasis Jarak Eksponensial:** Skor dihitung matematis berdasarkan jarak kilometer (skor maksimal 1.000 poin per ronde).
- **Level & Lencana Pencapaian:** Sistem progres XP kelipatan 2.000 poin dan 5 lencana pencapaian (Pemula, Hunter, Navigator, Sniper, Skill Issue).
- **Papan Peringkat Multi-Periode:** Peringkat 20 teratas yang dapat difilter berdasarkan periode Bulanan, Mingguan, dan Harian.
- **Tutorial Interaktif:** Panduan visual bertahap (*coach-marks*) yang memandu pemain baru memahami peta dan cara bermain.
- **Antarmuka Responsif & Tema:** Tampilan adaptif untuk desktop dan mobile (dilengkapi *smart bottom sheet*), serta dukungan tema Terang dan Gelap.

---

## Teknologi yang Digunakan

### Frontend
- **Vanilla JavaScript (ES Modules):** Arsitektur modular murni tanpa *bundler* atau *build step*.
- **HTML & CSS:** Sistem token desain variabel CSS, flexbox, grid, dan komponen responsif dengan dukungan area aman perangkat seluler.
- **Leaflet.js (v1.9.4):** Library pemetaan interaktif berbasis Canvas (`preferCanvas: true`).
- **CARTO Basemaps:** Penyedia ubin peta vektor (*Positron* untuk mode terang, *Dark Matter* untuk mode gelap).
- **Supabase Auth:** Klien browser untuk pengelolaan sesi autentikasi berbasis JWT.

### Backend
- **Node.js 22 & Express.js 5:** REST API backend yang berjalan sebagai Serverless Function di Vercel.
- **satellite.js (v7.2.0):** Komputasi propagasi orbit SGP4/SDP4 dari data Two-Line Elements (TLE).
- **Helmet (v8.1.0):** Pengamanan HTTP header dengan Content Security Policy (CSP) ketat.
- **Dotenv (v16.4.7):** Pengelolaan konfigurasi variabel lingkungan.

### Database & Autentikasi
- **Supabase (PostgreSQL):** Database relasional untuk penyimpanan profil, riwayat ronde, dan agregasi data melalui *Database Views*.
- **Supabase Admin Auth:** Pendaftaran akun instan tanpa memerlukan verifikasi email manual.

---

## Cara Kerja Sistem

### Alur Permainan

```
Pemain Mulai Ronde ──► Server Generate Target Time (Now + 10-30 Min) 
                            │
                            ▼
Peta Menampilkan Posisi Live & Jejak Orbit ──► Pemain Meletakkan Pin Tebakan
                                                      │
                                                      ▼
Server Evaluasi Ground Truth SGP4 ◄── Pemain Kunci Tebakan (Maks 5 Menit)
         │
         ├── Hitung Jarak Geodesik (Haversine)
         ├── Hitung Skor Ronde (Exponential Decay)
         └── Update Total Skor, Level, & Lencana
```

1. **Inisiasi Ronde:** Pemain menekan tombol mulai. Server membuat sesi ronde terbuka berdurasi 5 menit dengan horizon target acak antara 10 hingga 30 menit ke depan.
2. **Penentuan Titik Tebakan:** Peta otomatis memusatkan tampilan ke posisi ISS terkini. Pemain mengklik titik di peta untuk memprediksi koordinat ISS pada waktu target.
3. **Penguncian & Evaluasi:** Pemain mengunci tebakan. Server menghitung posisi orbit ISS pada waktu target menggunakan algoritma SGP4, menghitung jarak selisih, dan menetapkan skor.
4. **Tinjauan Hasil:** Peta menampilkan garis penghubung antara titik tebakan dan posisi sebenarnya, disertai informasi jarak (km), perolehan poin, lencana baru, dan fakta edukasi terkait.

---

### Rumus Jarak dan Skor

#### 1. Rumus Haversine (Jarak Geodesik)
Menghitung jarak terpendek antara titik tebakan pemain (lat1, lng1) dan posisi ISS (lat2, lng2) di atas permukaan bola Bumi (Radius Bumi R = 6.371 km):

```text
Δlat = lat2 - lat1
Δlng = lng2 - lng1

a = sin²(Δlat / 2) + cos(lat1) * cos(lat2) * sin²(Δlng / 2)
c = 2 * atan2(√a, √(1 - a))
jarak_km = R * c
```

#### 2. Rumus Skor Ronde
Skor dihitung menggunakan model peluruhan eksponensial berdasarkan selisih jarak:

```text
skor = Math.round(1000 * Math.exp(-jarak_km / 1500))
```

| Jarak Selisih | Skor | Evaluasi Prediksi |
|---|---|---|
| 0 km | 1.000 | Tepat sasaran (*Bullseye*) |
| 100 km | 935 | Sangat presisi (*Sniper*) |
| 500 km | 717 | Akurat (*Navigator*) |
| 1.000 km | 513 | Mendekati (*Hunter*) |
| 1.500 km | 368 | Cukup baik |
| > 2.000 km | < 263 | Meleset jauh (*Skill Issue*) |

---

### Sistem Level dan Lencana

- **Formula Level:** `Math.floor(total_skor / 2000) + 1`
- **Formula Progres XP:** `(total_skor % 2000) / 2000 * 100%`

| Lencana | Syarat Perolehan |
|---|---|
| **Pemula** | Menyelesaikan ronde pertama |
| **Hunter** | Tebakan dengan selisih jarak < 1.000 km |
| **Navigator** | Tebakan dengan selisih jarak < 500 km |
| **Sniper** | Tebakan dengan selisih jarak < 100 km |
| **Skill Issue** | Tebakan dengan selisih jarak > 2.000 km |

---

### Papan Peringkat (Leaderboard)

Papan peringkat menampilkan 20 pemain terbaik yang dihitung langsung melalui view database PostgreSQL:
- **Bulanan (`monthly`):** Berdasarkan total skor dalam 30 hari terakhir.
- **Mingguan (`weekly`):** Berdasarkan total skor dalam 7 hari terakhir.
- **Harian (`daily`):** Berdasarkan total skor dalam 24 jam terakhir.

---

### Mekanisme Keamanan

- **Evaluasi Sisi Server (Anti-Cheat):** Koordinat target dan evaluasi skor diproses sepenuhnya di server. Klien tidak menerima data koordinat target sebelum tebakan dikunci.
- **Batas Kedaluwarsa 5 Menit:** Ronde kedaluwarsa otomatis jika tidak diselesaikan dalam 5 menit sejak dibuka.
- **Batas Jeda Antar Ronde:** Cooldown wajib 10 detik sebelum memulai ronde berikutnya untuk mencegah spam request.
- **Content Security Policy (CSP):** Pembatasan sumber skrip, koneksi, dan tile peta untuk mencegah eksploitasi XSS.

---

## Spesifikasi Teknis

| Komponen | Spesifikasi |
|---|---|
| Runtime Backend | Node.js 22.x |
| Arsitektur Server | Express 5 di atas Vercel Serverless Function |
| Database | PostgreSQL 15+ (Supabase) |
| Horizon Tebakan | 10 – 30 Menit (600, 900, 1.200, 1.800 detik) |
| Batas Waktu Ronde | 5 Menit (300 detik) |
| Jeda Antar Ronde | 10 Detik |
| Format Username | 3 – 20 karakter alfanumerik & garis bawah (unik, *case-insensitive*) |
| Batasan Password | Minimal 6 karakter |
| Kapasitas Leaderboard | 20 pemain per kategori periode |
| Proyeksi Peta | EPSG:3857 (Web Mercator) |

---

## Dokumentasi API

### Internal API

Seluruh endpoint internal berada di bawah jalur `/api`. Endpoint terproteksi mewajibkan header `Authorization: Bearer <token>`.

| Method | Endpoint | Akses | Deskripsi |
|---|---|:---:|---|
| `GET` | `/api/health` | Publik | Status kesehatan server dan koneksi database |
| `GET` | `/api/config` | Publik | Pengambilan konfigurasi publik klien (URL & Key Supabase) |
| `POST` | `/api/profile/register` | Publik | Registrasi akun baru (username & password) |
| `POST` | `/api/profile` | Auth | Inisialisasi profil pemain baru |
| `GET` | `/api/me` | Auth | Mengambil profil, level, progres, statistik, dan lencana pemain |
| `GET` | `/api/iss/now` | Publik | Koordinat, kecepatan, ketinggian, dan heading ISS saat ini |
| `GET` | `/api/iss/trail` | Publik | Array titik jejak lintasan orbit historis ISS |
| `GET` | `/api/rounds/active` | Auth | Mengambil status ronde aktif yang belum diselesaikan |
| `POST` | `/api/rounds` | Auth | Memulai ronde baru atau mengembalikan ronde terbuka |
| `POST` | `/api/rounds/:id/guess` | Auth | Mengunci tebakan `{ lat, lng }` dan menghitung skor |
| `POST` | `/api/practice` | Auth | Menghitung jarak tebakan latihan tanpa menulis ke database |
| `GET` | `/api/leaderboard` | Publik | Mengambil 20 pemain teratas (`?type=monthly\|weekly\|daily`) |

### External API & Sumber Data

1. **CelesTrak (NORAD GP Elements):**
   - Mengambil data Two-Line Elements (TLE) ISS (NORAD ID: `25544`) via HTTPS.
   - Menggunakan mekanisme cache *Stale-While-Revalidate* in-memory dan persistensi berkas lokal pada direktori sementara.
2. **WhereTheISS API:**
   - Cadangan data posisi satelit real-time.
3. **CARTO CDN:**
   - Penyedia ubin peta vektor Web Mercator.

---

## Struktur Direktori

```
iss-hunter/
├── public/                       # Aset statis frontend (dilayani langsung oleh CDN)
│   ├── css/
│   │   ├── tokens.css            # Variabel desain (warna, tipografi, radius, elevasi)
│   │   └── style.css             # Penataan tata letak, komponen, dan responsivitas
│   ├── js/
│   │   ├── api.js                # Abstraksi panggilan fetch ke internal API
│   │   ├── auth.js               # Integrasi autentikasi Supabase
│   │   ├── icons.js              # Template SVG ikon
│   │   ├── iss.js                # Polling dan komputasi arah pergerakan ISS
│   │   ├── main.js               # Titik masuk frontend dan controller utama
│   │   ├── map.js                # Konfigurasi peta Leaflet, canvas layer, dan penanda
│   │   ├── store.js              # State management dan sinkronisasi localStorage
│   │   ├── theme.js              # Pengelola tema gelap/terang
│   │   ├── theme-boot.js         # Skrip inline inisialisasi tema instan
│   │   ├── tutorial.js           # Sistem onboarding interaktif pemain baru
│   │   └── ui.js                 # Handler manipulasi DOM antarmuka
│   └── index.html                # Dokumen HTML utama
├── src/                          # Kode sumber backend Node.js
│   ├── app.js                    # Inisialisasi Express, middleware, dan rute
│   ├── index.js                  # Entry point server lokal
│   ├── config.js                 # Validasi dan pemuatan variabel lingkungan
│   ├── validators.js             # Skema validasi input permintaan API
│   ├── domain/
│   │   └── gameLogic.js          # Fungsi murni: Haversine, skor, level, dan badges
│   ├── lib/
│   │   ├── csp.js                # Aturan Content Security Policy
│   │   ├── errors.js             # Kelas AppError terpusat
│   │   ├── issApi.js             # Integrasi SGP4, satellite.js, dan cache TLE
│   │   ├── satelliteApi.js       # Adapter kalkulasi satelit
│   │   └── supabase.js           # Inisialisasi klien Supabase Admin
│   ├── middleware/
│   │   ├── auth.js               # Verifikasi token JWT
│   │   ├── errorHandler.js       # Penanganan error global
│   │   └── requestLogger.js      # Pencatatan log permintaan
│   └── routes/                   # Definisi rute Express modular
├── supabase/                     # Skrip DDL database dan migrasi PostgreSQL
│   ├── schema.sql                # Skema dasar (tabel, indeks, view, RLS)
│   ├── migration_leaderboard_period.sql
│   ├── migration_update_player_stats_view.sql
│   └── migration_fix_horizon_constraint.sql
├── tests/                        # Pengujian unit otomatis (node:test)
├── eslint.config.js              # Konfigurasi linting ESLint
├── vercel.json                   # Konfigurasi serverless dan header Vercel
└── package.json                  # Konfigurasi proyek dan dependensi
```

---

## Kredit

Proyek ini dikembangkan untuk **Project Akhir Coaching UKM Programming (Jalur Web-Based Interactive JavaScript)**.

- **Data Posisi Satelit:** NORAD / CelesTrak & WhereTheISS API.
- **Penyedia Peta:** © OpenStreetMap contributors, © CARTO.
- **Model Propagasi Orbit:** SGP4 via `satellite.js`.
