# ISS Hunter — Spesifikasi, Alur Kerja, dan Rencana Pembuatan

> **Project Akhir Coaching UKM Programming** · Jalur **JavaScript (Web-Based Interactive)**
> Status dokumen: **v0.4 (rancangan sebelum Build)** · Diperbarui: 13 November 2026
> Target aplikasi selesai: **17 November 2026** · Deadline: **20 November 2026** · Presentasi: **21 November 2026**
>
> Perubahan v0.4: hosting **Vercel** (bukan Render), nama kunci Supabase yang baru (**publishable** dan **secret**), anti spam ronde dipindah ke **database**, skema SQL diperbarui, dan struktur kode memakai folder `src/`. Jika ada pertentangan dengan prompt kerja, prompt kerja yang menang.

---

## 1. Ringkasan

**ISS Hunter** adalah game web multipemain tempat pemain **menebak posisi Stasiun Luar Angkasa Internasional (ISS)** beberapa menit ke depan. Pemain melihat posisi ISS dan jejak lintasannya di peta, mengklik titik tebakan, lalu mendapat skor berdasarkan jarak tebakannya ke posisi sebenarnya. Skor terkumpul menjadi **level**, **lencana**, dan peringkat di **leaderboard** global.

Cara mainnya mirip GeoGuessr (klik peta, skor dari jarak), tetapi objeknya bergerak: pemain menebak **ke mana ISS bergerak**, bukan di mana mereka berada.

**Tujuan:**

1. Membuat game yang unik, menarik, dan bisa dimainkan online oleh banyak orang.
2. Memenuhi semua syarat jalur JavaScript pada pedoman.
3. Menghasilkan **kode berkualitas tinggi** (modular, teruji, aman) dan **proyek yang siap dipakai**: berjalan online, stabil, dan mudah dipahami seluruh anggota kelompok.

---

## 2. Kesesuaian dengan Pedoman

| Syarat pedoman | Cara ISS Hunter memenuhinya |
|---|---|
| Jalur bahasa dan tema | **JavaScript** (frontend dan server Node.js), tema game pelacak ISS |
| DOM Manipulation dan Event Interactivity | Peta, penanda, kartu hasil, leaderboard, dan bar level digambar dinamis. Event: `click` (peta dan tombol), `submit` (login), `keydown`, `input`, `change` |
| Data Persistence: kombinasi `localStorage` dan integrasi database | `localStorage` untuk tema, draft tebakan, dan cache. **Supabase (Postgres/SQL)** untuk data utama |
| Data Fetching dari API publik secara async | `fetch` + `async/await` ke **wheretheiss.at** (posisi ISS) |

---

## 3. Konsep Game

### 3.1 Mode inti: Prediksi Posisi

1. Pemain menekan **Mulai Ronde**. Server membuat ronde dengan **waktu target** (10 menit dari sekarang).
2. Peta menampilkan posisi ISS sekarang dan **jejak 10 menit terakhir**.
3. Pemain **mengklik peta** di titik yang diperkirakan akan dilewati ISS pada waktu target, lalu menekan **Kunci Tebakan** (atau `Enter`).
4. Server mengambil **posisi ISS pada waktu target** dari API, menghitung **jarak** dengan rumus Haversine, lalu menghitung **skor**.
5. Layar menampilkan garis dari tebakan ke jawaban, jarak (km), skor, dan lencana baru (jika ada).

> Posisi masa depan adalah hasil **perhitungan orbit**, bukan pengamatan langsung. Pemain tidak perlu menunggu 10 menit untuk melihat hasil.

### 3.2 Aturan skor, level, dan lencana (angka awal, disetel saat Build)

| Aturan | Rumus / ketentuan |
|---|---|
| Jarak | Haversine, radius bumi 6371 km |
| Skor ronde | `round(1000 × e^(−jarak_km / 1500))`. Contoh: 0 km = 1000, 500 km ≈ 717, 1500 km ≈ 368 |
| Level | `floor(total_skor / 2000) + 1` |
| Progress bar | `total_skor % 2000` dari 2000 |
| Lencana **Pemula** | Menyelesaikan 1 ronde |
| Lencana **Navigator** | Tebakan dengan jarak < 500 km |
| Lencana **Sniper** | Tebakan dengan jarak < 100 km |

### 3.3 Aturan ronde

- Ronde hanya bisa dikunci **maksimal 5 menit** setelah dimulai. Lewat itu, ronde kedaluwarsa.
- Satu ronde hanya bisa dikunci **sekali**.
- Skor dan jawaban dihitung **di server**, bukan di browser, agar leaderboard tidak mudah dicurangi.

---

## 4. Daftar Fitur

### 4.1 Fitur inti (wajib, target selesai 17 Nov)

- [ ] Daftar, masuk, dan keluar (login)
- [ ] Peta dengan posisi ISS live dan jejak lintasan
- [ ] Mulai ronde, klik peta untuk menebak, kunci tebakan
- [ ] Skor, jarak, dan hasil ronde (server menghitung)
- [ ] Level, bar progres, dan 3 lencana
- [ ] Leaderboard top 20
- [ ] `localStorage`: tema, draft tebakan, cache
- [ ] Mode terang/gelap
- [ ] **Deploy online** dengan URL publik
- [ ] **Kualitas kode:** lint, tes otomatis, validasi input, dan penanganan error seragam (bagian 14)

### 4.2 Fitur bonus (hanya jika waktu sisa)

- [ ] Mode **Tebak Negara** (pilih negara di bawah ISS)
- [ ] Streak bermain harian
- [ ] Animasi garis tebakan, efek, dan suara
- [ ] Riwayat ronde pemain
- [ ] Ubah nama tampilan

---

## 5. Arsitektur

```
Browser (HTML/CSS/JS + Leaflet)
   │  ├──► Supabase Auth      (daftar/masuk, hasilnya token JWT)
   │  ├──► API ISS            (posisi live + jejak)
   │  └──► Server Express     (kirim token di header)
   │                │
   │                ├──► Supabase Auth  (verifikasi token)
   │                ├──► Supabase DB    (Postgres: profil, ronde, leaderboard)
   │                └──► API ISS        (posisi jawaban)
localStorage: tema, draft tebakan, cache profil/leaderboard
```

### 5.1 Teknologi

| Bagian | Teknologi |
|---|---|
| Tampilan | HTML, CSS, JavaScript murni (ES modules) |
| Peta | Leaflet + tile CARTO (CDN, versi dipin, atribusi dicantumkan) |
| Login | Supabase Auth (email + password) |
| Server | Node.js 22 + Express, berjalan sebagai satu Vercel Function |
| Database | Supabase (Postgres) lewat `@supabase/supabase-js` |
| API eksternal | wheretheiss.at (`/v1/satellites/25544`) |
| Kualitas kode | ESLint, Prettier, tes bawaan Node (`node --test`) |
| Hosting | Vercel (Hobby) + Supabase |
| Kode | GitHub |

### 5.2 Struktur folder

```
iss-hunter/
├── package.json
├── vercel.json              # header keamanan untuk berkas statis (termasuk CSP)
├── .env                     # RAHASIA, jangan di-commit
├── .env.example
├── .gitignore
├── eslint.config.js
├── .prettierrc
├── docs/
│   └── ISS_Hunter_Spesifikasi.md
├── supabase/
│   └── schema.sql
├── scripts/
│   └── seed.js              # akun dan ronde contoh (dijalankan lokal)
├── src/
│   ├── app.js               # menyusun Express, TANPA listen, default export (titik masuk Vercel)
│   ├── index.js             # menyalakan server lokal (listen)
│   ├── config.js            # membaca dan memvalidasi environment variable
│   ├── validators.js        # validasi semua input
│   ├── middleware/          # auth, errorHandler, requestLogger
│   ├── routes/              # rute tipis (health, clientConfig, profile, me, rounds, leaderboard, iss)
│   ├── services/            # alur logika (profileService, roundService, leaderboardService)
│   ├── domain/
│   │   └── gameLogic.js     # fungsi murni: Haversine, skor, level, lencana
│   └── lib/                 # supabase, issApi, errors
├── tests/                   # tes otomatis (node --test)
└── public/                  # dilayani CDN Vercel
    ├── index.html
    ├── css/                 # sistem desain (token warna, jarak, tipografi) + komponen
    └── js/                  # main, auth, api, map, store, ui
```

### 5.3 Pembagian tanggung jawab

| Lapisan | Tanggung jawab |
|---|---|
| UI (`ui.js`, `map.js`) | Menampilkan data dan menangkap aksi pemain |
| State (`store.js`) | Menyimpan status aplikasi dan `localStorage` |
| Rute (`routes/`) | Menerima permintaan lalu memanggil service; tipis, tanpa logika |
| Service (`services/`) | Alur logika aplikasi (mulai ronde, kunci tebakan) |
| Domain (`gameLogic.js`) | Fungsi murni: jarak, skor, level, lencana (mudah diuji) |
| Data (`lib/supabase.js`) | Membaca dan menulis database |
| Integrasi (`lib/issApi.js`) | Berbicara dengan API ISS |
| Keamanan (`middleware/auth.js`) | Memastikan hanya pemain sah yang mengakses datanya |

---

## 6. Alur Kerja Aplikasi

### 6.1 Daftar dan masuk

```
1. Pemain isi form daftar              (event submit)
2. auth.js → Supabase Auth: signUp/signIn
3. Supabase mengembalikan token (JWT)
4. Browser → POST /api/profile (token + nama tampilan)
5. Server verifikasi token, buat baris profil
6. Browser tampilkan halaman game
```

Token disimpan dan diperbarui otomatis oleh pustaka Supabase. Semua permintaan ke server membawa token di header `Authorization: Bearer <token>`. Jika akun sudah ada tetapi profil belum (mis. pembuatan profil gagal di tengah jalan), `GET /api/me` menjawab `404 PROFILE_REQUIRED` dan UI menampilkan form nama tampilan lagi.

### 6.2 Satu ronde permainan

```
1. Klik "Mulai Ronde"                       (click)
2. POST /api/rounds
   └─ server buat ronde: target = sekarang + 10 menit
3. Browser ambil posisi ISS + jejak (API)   (async fetch)
4. Peta tampil; pemain klik peta            (click pada peta)
   └─ draft tebakan disimpan ke localStorage
5. Pemain tekan "Kunci" / Enter             (click / keydown)
6. POST /api/rounds/:id/guess {lat, lng}
7. Server:
   a. cek token dan kepemilikan ronde
   b. cek ronde masih 'open' dan belum lewat 5 menit
   c. ambil posisi ISS pada waktu target (API)
   d. hitung jarak (Haversine) dan skor
   e. simpan hasil ke tabel rounds
   f. hitung total skor, level, lencana baru
8. Browser tampilkan hasil + perbarui bar level
9. Browser hapus draft, simpan cache profil
```

### 6.3 Leaderboard

```
1. Browser → GET /api/leaderboard
2. Server baca view 'leaderboard' (top 20)
3. Browser gambar tabel (DOM), simpan cache
```

### 6.4 Saat terjadi masalah

| Kejadian | Perilaku aplikasi |
|---|---|
| API ISS gagal atau kena batas permintaan | Tampilkan pesan, tombol coba lagi, jangan menutup ronde |
| Server tidak terjangkau | Tampilkan cache terakhir dengan peringatan, nonaktifkan aksi tulis |
| Token kedaluwarsa | Pustaka Supabase memperbarui; jika gagal, arahkan ke halaman masuk |
| Ronde kedaluwarsa | Server menolak (410); pemain diminta memulai ronde baru |

---

## 7. Desain Database (Supabase / Postgres)

Berkas: `supabase/schema.sql`. Jalankan sekali di **SQL Editor** Supabase.

```sql
/* Profil pemain, id sama dengan id akun Supabase Auth */
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  created_at timestamptz not null default now()
);

/* Nama tampilan unik tanpa membedakan huruf besar/kecil (mencegah peniruan, memudahkan penandaan baris sendiri) */
create unique index if not exists profiles_display_name_unique
  on profiles (lower(display_name));

/* Satu baris per ronde. Status expired untuk ronde yang lewat 5 menit */
create table if not exists rounds (
  id bigint generated always as identity primary key,
  player_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'done', 'expired')),
  target_ts bigint not null,
  guess_lat double precision,
  guess_lng double precision,
  answer_lat double precision,
  answer_lng double precision,
  distance_km double precision,
  score integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

/* Maksimal satu ronde terbuka per pemain */
create unique index if not exists rounds_one_open_per_player
  on rounds (player_id) where status = 'open';
create index if not exists rounds_player_status_idx
  on rounds (player_id, status);

/* View memakai hak akses pemanggil agar tunduk pada RLS */
create or replace view player_stats with (security_invoker = true) as
select player_id,
       coalesce(sum(score), 0) as total_score,
       count(*) as rounds_done,
       min(distance_km) as best_distance_km
from rounds
where status = 'done'
group by player_id;

create or replace view leaderboard with (security_invoker = true) as
select p.display_name, s.total_score, s.rounds_done, s.best_distance_km
from player_stats s
join profiles p on p.id = s.player_id
order by s.total_score desc
limit 20;

/* RLS aktif tanpa policy: semua akses lewat server (secret key melewati RLS) */
alter table profiles enable row level security;
alter table rounds enable row level security;
revoke all on profiles, rounds, player_stats, leaderboard from anon, authenticated;
```

**Catatan:**

- **Anti spam dijaga database, bukan memori server.** Server serverless tidak punya memori bersama antar-permintaan, jadi batas "satu ronde terbuka per pemain" ditegakkan oleh indeks unik parsial. Jika dua permintaan membuat ronde bersamaan, yang kedua gagal dengan kode Postgres `23505`; server menangkapnya dan membaca ulang ronde yang sudah terbuka.
- **Total skor dihitung dari `rounds`** (lewat view), bukan kolom terpisah, sehingga tidak bisa tidak sinkron. Lencana juga dihitung dari data ronde, tidak disimpan.
- **Keamanan:** RLS aktif pada `profiles` dan `rounds`. Kunci publishable ada di browser dan bersifat publik, jadi tabel tidak boleh bisa diakses langsung dengan kunci itu. Server memakai kunci **secret** yang melewati RLS; kunci itu hanya ada di environment variable server, tidak pernah di frontend, repo, atau log.
- Semua query dibatasi `player_id` dari token yang diverifikasi, bukan dari input pengguna.

---

## 8. Spesifikasi API Server

Semua endpoint berformat JSON. Endpoint yang butuh login membawa header `Authorization: Bearer <token>`; `middleware/auth.js` memverifikasi token dengan `getUser(token)` memakai klien kunci secret.

| Method | Endpoint | Login | Fungsi | Respons sukses |
|---|---|---|---|---|
| GET | `/api/health` | tidak | Cek server hidup | `200` `{ status: 'ok' }` |
| GET | `/api/config` | tidak | URL dan kunci publishable Supabase untuk browser | `200` |
| POST | `/api/profile` | ya | Buat profil. Body: `{ display_name }` | `201` |
| GET | `/api/me` | ya | Profil, total skor, level, progres, lencana | `200` |
| POST | `/api/rounds` | ya | Mulai ronde, atau kembalikan ronde terbuka yang masih valid | `201` / `200` `{ roundId, targetTs, startedAt }` |
| POST | `/api/rounds/:id/guess` | ya | Kunci tebakan. Body: `{ lat, lng }` | `200` `{ answer, distanceKm, score, totalScore, level, newBadges }` |
| GET | `/api/leaderboard` | tidak | Top 20 pemain, di-cache singkat di CDN | `200` |
| GET | `/api/iss/now` | tidak | Cadangan: posisi ISS lewat server | `200` |
| GET | `/api/iss/trail` | tidak | Cadangan: jejak 10 menit lewat server | `200` |

**Kode error:**

| Kode | Arti |
|---|---|
| `400` | Input tidak valid (koordinat di luar −90..90 / −180..180, nama tampilan tidak sesuai, id ronde bukan angka) |
| `401` | Token hilang atau tidak sah |
| `404` | Ronde tidak ditemukan atau bukan milik pemain; `PROFILE_REQUIRED` jika profil belum dibuat |
| `409` | Ronde sudah dikunci; atau nama tampilan sudah dipakai (`NAME_TAKEN`) |
| `410` | Ronde kedaluwarsa (lewat 5 menit) |
| `502` | API ISS gagal dijangkau |

**Format respons seragam:**

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "ROUND_EXPIRED", "message": "Ronde sudah kedaluwarsa." } }
```

**Aturan penguncian tebakan** (urutan): cek token dan kepemilikan (404) → cek status (409) → cek kedaluwarsa 5 menit (410, tandai `expired`) → ambil jawaban dari API ISS (502 jika gagal, ronde tetap terbuka) → hitung jarak dan skor → *update bersyarat* (hanya jika status masih `open` dan milik pemain; 0 baris berubah berarti 409) → hitung total, level, dan lencana baru.

---

## 9. Spesifikasi Frontend

### 9.1 Bagian halaman

1. **Layar masuk/daftar:** form email, password, dan nama tampilan.
2. **Header:** nama, level, bar progres, lencana, tombol tema, tombol keluar.
3. **Peta:** posisi ISS, jejak, penanda tebakan, dan garis hasil.
4. **Panel ronde:** tombol Mulai Ronde, hitung mundur kunci, tombol Kunci Tebakan.
5. **Kartu hasil:** jarak, skor, lencana baru.
6. **Leaderboard:** tabel top 20.

### 9.2 Event listener

| Event | Elemen | Fungsi |
|---|---|---|
| `DOMContentLoaded` | `document` | Muat cache dan cek sesi login |
| `submit` | Form masuk/daftar | Login atau registrasi |
| `click` | Peta (Leaflet `map.on('click')`) | Menaruh penanda tebakan |
| `click` | Tombol Mulai / Kunci / Tema / Keluar | Aksi permainan |
| `keydown` | `document` | `Enter` mengunci tebakan, `Esc` menghapus penanda |
| `input` | Kolom nama tampilan | Validasi panjang 3–20 karakter |
| `visibilitychange` (opsional) | `document` | Jeda pembaruan posisi saat tab disembunyikan |

### 9.3 Pembagian `localStorage` dan database

| `localStorage` (cepat, di browser, bisa hilang) | Database Supabase (permanen) |
|---|---|
| `iss_theme`: mode terang/gelap | Profil, ronde, skor |
| `iss_draft_guess`: tebakan yang belum dikunci | Leaderboard |
| `iss_cache_profile`, `iss_cache_leaderboard`: salinan untuk tampil cepat | |

**Aturan sinkronisasi:** tampilkan cache dulu, lalu ambil data terbaru dari server dan perbarui tampilan serta cache. Saat **keluar**, hapus cache profil agar data pemain lain tidak tersisa di browser yang sama.

### 9.4 Catatan teknis frontend

- Teks pengguna (nama tampilan) ditampilkan dengan `textContent`, **bukan** `innerHTML`, untuk mencegah XSS.
- Peta Leaflet bisa menghasilkan longitude di luar −180..180 saat peta digulir berulang. **Normalisasi** sebelum dikirim: `((lng + 540) % 360) − 180`.
- Pembaruan posisi live: jeda minimal 2–5 detik (API dibatasi sekitar 1 permintaan per detik).

---

## 10. Integrasi API ISS (wheretheiss.at)

| Kebutuhan | Endpoint |
|---|---|
| Posisi ISS sekarang | `GET https://api.wheretheiss.at/v1/satellites/25544` |
| Posisi pada waktu tertentu (maks. 10 timestamp per permintaan) | `GET https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=<ts1>,<ts2>` |

- Respons berisi antara lain `latitude`, `longitude`, `altitude`, `velocity`, dan `timestamp`.
- **Browser** memanggil langsung untuk posisi live dan jejak 10 menit (satu permintaan `positions` dengan 10 timestamp, tiap 60 detik ke belakang). Jeda polling minimal 5 detik, dan berhenti saat tab tersembunyi.
- **Cadangan:** jika panggilan langsung gagal (CORS atau kena batas permintaan), browser otomatis memakai `GET /api/iss/now` dan `GET /api/iss/trail`. Keduanya mengirim `Cache-Control: public, s-maxage=5, stale-while-revalidate=10` agar banyak pemain berbagi satu panggilan ke API ISS.
- **Jawaban ronde** dihitung server lewat `lib/issApi.js` dengan `positions?timestamps=<target_ts>`. Anggaran waktu total harus di bawah sekitar 8 detik karena durasi fungsi di paket gratis terbatas: timeout 3 detik per percobaan, satu percobaan ulang dengan jeda 1 detik. Jika tetap gagal, lempar `502` dan jangan menutup ronde.
- Berdasarkan dokumentasinya, API ini tanpa autentikasi dan dibatasi sekitar 1 permintaan per detik (dicek 12 Nov 2026; cek ulang saat Build).
- **Keterbatasan yang diketahui:** karena API menyediakan posisi masa depan, pemain yang sengaja bisa memanggilnya sendiri. Skor dihitung di server, tetapi itu tidak menjamin leaderboard bebas curang.

---

## 11. Deployment Online (Vercel)

### 11.1 Cara kerja di Vercel

- Aplikasi Express berjalan sebagai **satu Vercel Function**. Titik masuknya `src/app.js`: berkas itu mengimpor `express` dan mengekspor `app` sebagai default export, tanpa `listen`.
- Berkas di `public/` dilayani langsung oleh **CDN Vercel**. `express.static()` diabaikan di sana (tetap dipakai saat lokal), sehingga header keamanan untuk berkas statis diatur di `vercel.json`.
- Cadangan jika titik masuk tidak terdeteksi: `api/index.js` yang mengekspor `app`, ditambah `rewrites` di `vercel.json`.
- `src/index.js` hanya untuk lokal (`listen` di `PORT` atau 3000).

### 11.2 Langkah deploy

1. **GitHub:** push repo; pastikan `.env` tidak ikut.
2. **Supabase:** buat proyek (pilih region terdekat, mis. Singapura), jalankan `supabase/schema.sql`, matikan konfirmasi email selama pengembangan.
3. **Vercel:** Add New > Project > pilih repo. Isi environment variable (Production dan Preview):

   | Nama | Isi |
   |---|---|
   | `SUPABASE_URL` | URL proyek Supabase |
   | `SUPABASE_PUBLISHABLE_KEY` | Kunci publishable (publik) |
   | `SUPABASE_SECRET_KEY` | Kunci secret (**rahasia**, hanya server) |

4. Deploy, lalu buka `/api/health` di URL production.
5. Di pengaturan Auth Supabase, daftarkan URL Vercel sebagai Site URL.
6. Uji dengan dua akun dari dua perangkat.

### 11.3 Hal yang perlu diwaspadai

- **Vercel Hobby** untuk penggunaan non-komersial dan punya batas pemakaian. Cukup untuk proyek kelas; pantau penggunaannya (dicek 13 Nov 2026; cek ulang).
- **Fungsi serverless tidak punya state yang bertahan:** jangan bergantung pada memori server, berkas lokal, atau proses yang hidup lama.
- **Region:** usahakan fungsi Vercel dan proyek Supabase berada di region yang berdekatan agar latensi rendah.
- **Supabase gratis** menjeda proyek yang tidak aktif seminggu. Pastikan aktif sebelum 21 November.
- **Deploy kerangka di Fase 1**, bukan di akhir, agar masalah deploy ketahuan sejak awal.

---

## 12. Alur Pembuatan (5 Fase, Selesai 17 November)

Cakupan dipangkas ke fitur inti (bagian 4.1), tetapi **kualitas kode tidak ditawar**: lint, tes, validasi, dan penanganan error dikerjakan bersama fiturnya. Tiap fase diakhiri checkpoint: lint dan tes bersih, commit, ringkasan, lalu berhenti sampai ada persetujuan melanjutkan.

| Fase | Tanggal | Target | Hasil yang bisa diperiksa |
|---|---|---|---|
| 1 | Kam 13 Nov | **Fondasi, sistem desain, deploy kerangka.** Tooling, struktur `src/`, `config.js`, `AppError`, error handler, `/api/health`, `/api/config`, token desain (terang dan gelap), `supabase/schema.sql`, README | URL production hidup dan `/api/health` menjawab `ok` |
| 2 | Jum 14 Nov | **Login dan keamanan dasar.** Layar masuk/daftar, `middleware/auth.js`, `validators.js`, `POST /api/profile`, `GET /api/me`, tema di `localStorage` | 2 akun bisa daftar dan masuk di production; tanpa token menghasilkan `401` berformat seragam |
| 3 | Sab 15 Nov | **Peta dan ronde.** Leaflet, posisi ISS live dan jejak (langsung + cadangan proxy), `lib/issApi.js`, `POST /api/rounds`, klik peta, draft tebakan, tata letak panel | ISS bergerak di peta, penanda tebakan muncul, ronde dibuat |
| 4 | Min 16 Nov | **Skor dan leaderboard.** `gameLogic.js` bersama tesnya dulu, `POST /api/rounds/:id/guess`, leaderboard | `npm test` hijau; satu ronde penuh di production |
| 5 | Sen 17 Nov | **Penyempurnaan dan pengerasan.** Header, kartu hasil, garis tebakan, aksesibilitas, `scripts/seed.js`, uji manual penuh, tinjauan UI, pemeriksaan rahasia | **Definisi "siap jadi" (bagian 14.2) terpenuhi** |

| Tanggal | Target |
|---|---|
| Sel 18 Nov – Rab 19 Nov | Cadangan waktu, perbaikan bug, uji akhir di URL production, **code freeze** 19 Nov |
| Jum 20 Nov | **Deadline** |
| Sab 21 Nov | **Presentasi** |

**Aturan kerja harian:**

1. Akhir setiap fase, kode harus **jalan, lulus lint dan tes, dan ter-commit** ke GitHub.
2. Satu fitur, satu commit (atau beberapa commit kecil) dengan pesan yang jelas.
3. Jika satu fase terlambat, **pangkas** fase berikutnya, jangan menggeser deadline.
4. Mulai 19 Nov: hanya perbaikan bug.

---

## 13. Pengujian

**Tes otomatis** (`npm test`, memakai `node --test`):

- `gameLogic`: jarak Haversine (titik sama = 0 km; dua titik dengan jarak yang diketahui, dengan toleransi kecil), skor di 0 / 500 / 1500 km dan jarak sangat jauh (tidak pernah negatif), batas level (1999 → 2000 poin), batas lencana (99 / 100 / 499 / 500 km), normalisasi longitude.
- `validators`: koordinat valid dan tidak valid, nama tampilan 2 / 3 / 20 / 21 karakter, ID ronde bukan angka.

**Uji manual end-to-end (di URL online, bukan hanya di laptop):**

- [ ] Daftar dan masuk dengan dua akun berbeda
- [ ] Mulai ronde, tebak, kunci, hasil dan skor muncul
- [ ] Mengunci ronde yang sama dua kali ditolak (409)
- [ ] Mengunci setelah 5 menit ditolak (410)
- [ ] Mengakses ronde milik akun lain ditolak (404)
- [ ] Permintaan tanpa token ditolak (401)
- [ ] Koordinat tidak valid ditolak (400)
- [ ] Klik peta setelah menggulir berulang tetap menghasilkan longitude valid
- [ ] API ISS dimatikan (simulasi) → pesan jelas, ronde tidak rusak
- [ ] Muat ulang halaman → sesi, tema, dan draft tebakan pulih
- [ ] Nama tampilan berisi `<b>x</b>` → tampil sebagai teks biasa
- [ ] Keluar → cache profil terhapus
- [ ] Tampilan nyaman di HP dan laptop, mode terang dan gelap

---

## 14. Standar Kualitas Kode dan Definisi "Siap Jadi"

### 14.1 Standar kualitas kode

| Area | Standar |
|---|---|
| Struktur | Berlapis: rute → service → data. Logika game berupa **fungsi murni** di `gameLogic.js` (tanpa akses database atau jaringan) supaya mudah diuji |
| Konfigurasi | Semua nilai dari environment variable lewat `config.js`. Server **gagal start dengan pesan jelas** jika variabel wajib kosong. `.env.example` disertakan |
| Penanganan error | Satu kelas `AppError` (kode, status, pesan) dan satu `errorHandler`. Tidak ada `catch` yang menelan error diam-diam. Pesan untuk pemain berbahasa Indonesia; detail teknis hanya di log |
| Validasi input | Semua input (body, params) divalidasi di `validators.js` sebelum dipakai. Jangan percaya data dari browser |
| Keamanan | RLS aktif; kunci rahasia hanya di environment variable; `helmet` untuk header keamanan; anti spam ronde dijaga database (indeks unik parsial); token diverifikasi di setiap endpoint terlindungi; query selalu dibatasi `player_id` dari token; `textContent` untuk teks pengguna |
| Frontend | ES modules (`type="module"`), tanpa variabel global, satu sumber state (`store.js`), event delegation, fungsi kecil dengan satu tugas, tidak ada `innerHTML` dengan data pengguna |
| UX dan aksesibilitas | Tata letak responsif (HP dulu); keadaan *loading*, *kosong*, dan *error* selalu ditangani; form berlabel; tombol bisa dioperasikan keyboard; kontras cukup di mode terang dan gelap |
| Penamaan dan gaya | Nama jelas (`calculateDistanceKm`, bukan `calc`), fungsi pendek, konstanta bernama (tidak ada angka ajaib seperti `1500`), komentar menjelaskan *kenapa*, bukan *apa* |
| Tooling | ESLint + Prettier; `npm run lint`, `npm test`, `npm run dev`, `npm start` |
| Pengujian | Tes otomatis untuk `gameLogic` dan `validators`; uji manual end-to-end (bagian 13) |
| Git | Commit kecil dengan pesan jelas (mis. `feat: tambah endpoint kunci tebakan`); `main` selalu dalam keadaan jalan |
| Observabilitas | `/api/health`; log permintaan singkat (metode, path, status, durasi); tidak pernah mencatat password atau kunci |
| Performa | Polling posisi ISS dengan jeda dan dihentikan saat tab tersembunyi; jejak ISS di-cache beberapa detik |

### 14.2 Definisi "siap jadi" (Definition of Done)

- [ ] Semua fitur inti (bagian 4.1) berjalan di **URL online**
- [ ] `npm run lint` dan `npm test` lulus tanpa peringatan
- [ ] Tidak ada kunci rahasia di repo (periksa riwayat commit juga)
- [ ] Semua kode error di bagian 8 diuji dan memakai format respons seragam
- [ ] Tampil dan berfungsi baik di HP dan laptop, mode terang dan gelap
- [ ] Tidak ada error di console browser pada alur normal
- [ ] Diuji dengan minimal 3 akun berbeda dari perangkat berbeda
- [ ] Keadaan gagal (API ISS mati, server tidur, token habis) menampilkan pesan yang jelas
- [ ] Data contoh (akun dan ronde) tersedia agar leaderboard tidak kosong
- [ ] `.env.example` dan petunjuk menjalankan singkat (`npm install`, isi `.env`, `npm start`) ada di `README` repo
- [ ] Code freeze 19 Nov; sesudahnya hanya perbaikan bug

---

## 15. Risiko dan Hal yang Perlu Dikonfirmasi

| Risiko / hal | Tindakan |
|---|---|
| Waktu 5 hari sangat ketat | Kunci cakupan inti; bonus hanya jika semua target harian tercapai |
| Standar kualitas menambah pekerjaan | Pasang tooling sekali di Hari 1; aturan "lulus lint dan tes sebelum commit" mencegah utang yang menumpuk |
| Pemakaian Supabase + server Node.js sebagai "integrasi database" | Konfirmasi ke coach bahwa ini diterima |
| API ISS lambat, mati, atau kena batas permintaan | Beri jeda antar-permintaan, pesan error jelas; siapkan rekaman layar cadangan untuk presentasi |
| Batas paket gratis Vercel (non-komersial, kuota pemakaian) | Cukup untuk proyek kelas; pantau penggunaan di dashboard |
| Supabase menjeda proyek | Pastikan aktif; pulihkan dari dashboard jika perlu |
| Leaderboard sepi saat demo | Siapkan 3–5 akun contoh dengan beberapa ronde |
| Kunci rahasia bocor ke GitHub | `.env` di `.gitignore`; jika bocor, segera ganti kunci |
| Anggota tidak paham kodenya (minimal 80%) | Berkas kecil dan modular; tiap anggota menjelaskan bagian yang dikerjakannya |

---

## 16. Glosarium Singkat

- **DOM / event listener:** halaman yang bisa diubah JavaScript / kode yang menunggu aksi pengguna.
- **API / endpoint:** pintu layanan untuk meminta data / alamat spesifik untuk satu fungsi.
- **`fetch` / `async-await`:** meminta data tanpa membekukan halaman saat menunggu jawaban.
- **Haversine:** rumus jarak dua titik di permukaan bumi (bumi itu bola, bukan bidang datar).
- **JWT (token):** "tiket" digital yang dibawa browser untuk membuktikan siapa yang login.
- **Hash:** bentuk "sidik jari" data; password tidak pernah disimpan sebagai teks asli.
- **RLS (Row Level Security):** aturan di database tentang baris mana yang boleh dibaca atau ditulis siapa.
- **View (SQL):** query tersimpan yang dipakai seperti tabel (mis. leaderboard).
- **`localStorage`:** penyimpanan kecil di browser; bisa hilang jika browser dibersihkan.
- **Deploy:** menaruh aplikasi di server internet agar bisa diakses semua orang.
- **XSS:** serangan lewat teks yang disisipkan; dicegah dengan `textContent`.
- **Linter / formatter (ESLint, Prettier):** alat yang memeriksa dan merapikan gaya kode secara otomatis.
- **Unit test:** kode kecil yang memeriksa bahwa satu fungsi menghasilkan hasil yang benar.
- **Fungsi murni:** fungsi yang hasilnya hanya bergantung pada inputnya, tanpa efek samping (mudah diuji).
- **Code freeze:** berhenti menambah fitur; hanya memperbaiki bug.
