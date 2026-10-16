# Panduan deployment MeetSpace — Vercel dan Cloudflare

Panduan untuk struktur project saat ini, diperiksa pada **15 Oktober 2026**. Nama menu hosting dapat berubah; tautan dokumentasi resmi dicantumkan dekat langkah terkait.

**Kode fitur, komponen, assets, dan UI tetap digunakan.** Yang disiapkan adalah repository, environment production, konfigurasi routing hosting, Firebase, dan LiveKit. File `.env` lokal tidak perlu diganti dengan konfigurasi production.

Dokumen ini merupakan petunjuk, bukan bukti aplikasi sudah dipublikasikan. Contoh file konfigurasi di bawah belum otomatis dibuat. Pengujian deployment dengan layanan asli tetap dilakukan setelah setup selesai.

## Daftar isi

1. [Pilih jalur deployment](#1-pilih-jalur-deployment)
2. [Persiapan project dan repository](#2-persiapan-project-dan-repository)
3. [Setup Firebase](#3-setup-firebase)
4. [Setup LiveKit](#4-setup-livekit)
5. [Environment lokal dan production](#5-environment-lokal-dan-production)
6. [Deploy backend ke Vercel](#6-deploy-backend-ke-vercel)
7. [Jalur A — deploy frontend ke Vercel](#7-jalur-a--deploy-frontend-ke-vercel)
8. [Jalur B — deploy frontend ke Cloudflare Pages](#8-jalur-b--deploy-frontend-ke-cloudflare-pages)
9. [Hubungkan domain dan webhook](#9-hubungkan-domain-dan-webhook)
10. [Pengujian setelah deploy](#10-pengujian-setelah-deploy)
11. [Preview, pembaruan, dan rollback](#11-preview-pembaruan-dan-rollback)
12. [Pemecahan masalah](#12-pemecahan-masalah)
13. [Persiapan pembukaan untuk publik](#13-persiapan-pembukaan-untuk-publik)
14. [Jika ingin backend juga di Cloudflare](#14-jika-ingin-backend-juga-di-cloudflare)
15. [Checklist singkat](#15-checklist-singkat)

## 1. Pilih jalur deployment

| Jalur | Frontend | Backend API | Kesesuaian dengan project |
| --- | --- | --- | --- |
| A — langkah awal yang disarankan | Vercel, root `client` | Vercel, root `server` | Dua project dari satu repository; perubahan konfigurasi kecil |
| B — menggunakan Cloudflare untuk website | Cloudflare Pages, root `client` | Vercel, root `server` | Frontend tetap Vue/Vite, backend tetap Node.js |
| C — website dan API di Cloudflare | Pages/Workers Static Assets | Workers atau Containers | Memerlukan pekerjaan tambahan; lihat bagian 14 |

Pilihan A dan B tetap menggunakan **Firebase Authentication + Firestore + LiveKit**. Hosting frontend tidak menggantikan database atau server media.

```text
Browser
  ├── Frontend Vue               → Vercel / Cloudflare Pages
  ├── Login/register             → Firebase Authentication
  ├── Akun, admin, room, board    → Express API di Vercel → Firestore
  └── Audio, video, data meeting  → LiveKit
                                      └── webhook → Express API → statistik
```

Ini merupakan pemetaan dari kode project: video dan audio terhubung langsung ke LiveKit; Express menerbitkan token, mengatur akses, menyimpan whiteboard, dan menerima webhook.

Contoh alamat dalam panduan — **ganti dengan alamat milikmu**:

| Kegunaan | Tanpa domain sendiri | Dengan domain sendiri |
| --- | --- | --- |
| Frontend Vercel | `https://meetspace-web.vercel.app` | `https://meet.example.com` |
| Frontend Cloudflare | `https://meetspace-web.pages.dev` | `https://meet.example.com` |
| Backend | `https://meetspace-api.vercel.app` | `https://api.example.com` |
| Base URL API | `https://meetspace-api.vercel.app/api` | `https://api.example.com/api` |

Domain sendiri bersifat opsional. Mulai dari domain bawaan hosting juga bisa.

## 2. Persiapan project dan repository

### 2.1 Struktur yang digunakan

```text
meetspace/
├── client/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── server/
│   ├── src/index.js
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── firestore.rules
├── .gitignore
├── README.md
└── DEPLOYMENT.md
```

Root repository tidak memiliki script build bersama. Pada hosting, pilih `client` atau `server` sebagai **Root Directory**, sesuai project yang dibuat.

Gunakan **Node.js 24.x** untuk kedua deployment. Dependency Firebase Admin yang terpasang membutuhkan Node.js 22+, sementara Vite membutuhkan versi Node yang kompatibel. Node 24 tersedia di Vercel; pilih eksplisit agar kedua project konsisten. [Versi Node Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

### 2.2 Periksa secara lokal

Jalankan dari root repository:

```bash
node --version
npm --prefix client ci
npm --prefix server ci
npm --prefix client test
npm --prefix server test
npm --prefix client run build
```

`npm ci` menggunakan lockfile dan mengganti instalasi dependency lokal. Commit kedua `package-lock.json`. Build frontend harus menghasilkan `client/dist/index.html`.

Tes otomatis memakai mock/fixture; lulus tes belum membuktikan kredensial Firebase, koneksi LiveKit, CORS, atau webhook production benar.

### 2.3 Simpan project ke GitHub

Jika folder belum menjadi repository Git, jalankan sekali:

```bash
git init -b main
```

Buat repository GitHub kosong, lalu hubungkan remote sesuai alamat repository milikmu. Repository private dapat digunakan. Sebelum commit pertama, periksa aturan pengecualian:

```bash
git check-ignore client/.env server/.env server/credentials/firebase-service-account.json
git status --short
```

Ketiga path sensitif di atas harus diabaikan. `.gitignore` yang ada sudah mengecualikan `.env`, dependency, hasil build, dan folder kredensial server. File rahasia dengan nama/path lain harus ikut dikecualikan.

Setelah memastikan tidak ada rahasia yang ikut:

```bash
git add .
git diff --cached --stat
git diff --cached --name-only
```

Periksa daftar file tersebut **sebelum** menjalankan:

```bash
git commit -m "Prepare MeetSpace for deployment"
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Ganti `USERNAME/REPOSITORY`. Jika remote `origin` sudah ada, gunakan remote itu; jangan menambahkannya lagi. `.gitignore` tidak menghapus file yang telanjur tracked. Jika key pernah terpublikasi, cabut/ganti key tersebut, bukan hanya menghapus filenya dari commit berikutnya.

## 3. Setup Firebase

### 3.1 Tentukan project production

Boleh menggunakan project Firebase yang sama dengan lokal. Konsekuensinya: akun, room, whiteboard, dan statistik menggunakan data yang sama.

Untuk memisahkan data percobaan, gunakan project Firebase production tersendiri. Jika membuat project baru, pengguna dan UID dari project lama tidak otomatis tersedia di project baru.

1. Buka Firebase Console dan pilih project.
2. Di pengaturan project, daftarkan aplikasi Web jika belum ada.
3. Catat `apiKey`, `authDomain`, `projectId`, dan `appId` dari konfigurasi Web.
4. Aktifkan **Authentication → Sign-in method → Email/Password**.
5. Buat database **Cloud Firestore `(default)`**, karena kode menggunakan `getFirestore()` tanpa nama database khusus.
6. Pastikan konfigurasi Web dan kredensial Admin berasal dari project yang sama.

Saat domain frontend tersedia, tambahkan hostname-nya di **Authentication → Settings → Authorized domains**, misalnya `meetspace-web.vercel.app` atau `meet.example.com`, tanpa `https://` dan tanpa path. Ini adalah pengaturan domain autentikasi, bukan pengganti `CLIENT_ORIGIN` backend. [Pengaturan domain Firebase Auth](https://firebase.google.com/docs/auth/faq-and-troubleshooting)

### 3.2 Siapkan kredensial Admin untuk backend

Di **Project settings → Service accounts**, gunakan service-account JSON yang sah untuk project ini; jika belum memiliki key dan kebijakan project mengizinkan, buat private key dari console. Simpan sebagai secret hosting backend. [Setup Firebase Admin](https://firebase.google.com/docs/admin/setup)

Implementasi `server/src/config/firebase.js` mendukung:

| Pilihan | Pemakaian |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Isi JSON service account lengkap; jalur yang digunakan dalam panduan Vercel ini |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path file yang benar-benar tersedia pada filesystem server; biasa dipakai lokal atau server Node sendiri |

Untuk Vercel, isi **value** `FIREBASE_SERVICE_ACCOUNT_JSON` dengan JSON lengkap di dashboard environment variables. Jangan memasukkan nama file, jangan menambahkan pembungkus tanda kutip shell, dan jangan mengubah escape `\n` pada `private_key` secara manual. JSON harus tetap valid.

Tidak perlu mengatur `GOOGLE_APPLICATION_CREDENTIALS` ketika menggunakan JSON tersebut. Path seperti `/Users/admin/...` hanya berlaku di laptop dan tidak tersedia di hosting.

Jangan memasukkan service-account JSON, private key, atau LiveKit API secret ke environment bernama `VITE_*`, repository, file Markdown, maupun assets website.

### 3.3 Terapkan Firestore Rules

Project melakukan akses data melalui backend Firebase Admin. Frontend tidak perlu akses langsung ke koleksi Firestore.

1. Buka **Firestore Database → Rules** pada project yang benar.
2. Salin seluruh isi file root [`firestore.rules`](./firestore.rules).
3. Publish rules tersebut.

Rules saat ini menolak akses langsung client. Firebase Admin menggunakan kredensial server/IAM; aksesnya tidak dibuka dengan mengganti rules menjadi public. [Firestore Security Rules dan akses server](https://firebase.google.com/docs/firestore/security/get-started)

Jika database tersebut juga dipakai aplikasi lain dengan akses langsung dari client, evaluasi penggabungan rules lebih dahulu; rules project ini menolak seluruh akses client.

Dokumen room/akun/whiteboard akan dibuat oleh aplikasi saat digunakan. Tidak perlu mengisi data dummy. Jika server melaporkan indeks Firestore yang belum tersedia, gunakan tautan pembuatan indeks pada log server dan tunggu sampai indeks aktif.

### 3.4 Siapkan admin pertama

Masukkan Firebase Authentication UID ke `ADMIN_UIDS` pada backend:

```env
ADMIN_UIDS=sOmHt2pt9ygataiZL1RKyC1UKjm2
```

UID ini adalah akun yang telah kamu tentukan. Gunakan hanya jika akun tersebut ada pada project Firebase production yang dipilih. Untuk project Firebase baru, ambil UID akun admin dari project baru.

Untuk beberapa admin, pisahkan UID dengan koma. Hak admin ditentukan backend; mengubah field role dari browser tidak memberikan hak admin.

Setelah deploy, login menggunakan akun tersebut dan buka `/admin`. Akun baru lain tetap dapat bergabung sebagai peserta; membuat room memerlukan akses penuh dari admin.

## 4. Setup LiveKit

1. Pilih/buat project LiveKit Cloud yang akan digunakan untuk production.
2. Ambil URL project `wss://...`, API key, dan API secret dari dashboard project.
3. Simpan ketiganya hanya di environment backend, sesuai tabel bagian 5.
4. Pastikan URL dan pasangan key/secret berasal dari project LiveKit yang sama.
5. Setelah backend aktif, pasang webhook sesuai bagian 9.

Frontend mendapatkan URL koneksi dan token room dari API. Frontend tidak membutuhkan LiveKit API secret.

Pola room, token, dan koneksi di atas mengikuti implementasi `server/src/services/livekit.service.js` dan `client/src/services/livekit.js`. Panduan ini menggunakan LiveKit Cloud yang sesuai konfigurasi project; self-hosting LiveKit membutuhkan setup jaringan/media tersendiri.

## 5. Environment lokal dan production

### 5.1 Frontend — Vercel atau Cloudflare Pages

Masukkan di dashboard project **frontend**, bukan backend:

| Nama | Contoh nilai | Keterangan |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://meetspace-api.vercel.app/api` | URL backend, wajib menyertakan `/api` |
| `VITE_FIREBASE_API_KEY` | Nilai `apiKey` Firebase Web | Bukan service-account key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `PROJECT_ID.firebaseapp.com` | Gunakan nilai dari Firebase Web config |
| `VITE_FIREBASE_PROJECT_ID` | `PROJECT_ID` | Harus sama dengan project Admin |
| `VITE_FIREBASE_APP_ID` | Nilai `appId` Firebase Web | Gunakan nilai konfigurasi aplikasi Web |

`VITE_FIREBASE_AUTH_DOMAIN` tidak otomatis diganti menjadi domain website. Tetap gunakan konfigurasi Firebase Web kecuali kamu memang menyiapkan custom auth domain.

Nilai `VITE_*` dimasukkan ke bundle saat build dan dapat dibaca pengguna. Setelah mengubahnya, **build/deploy ulang frontend**. Menyamarkan value di dashboard tidak membuat nilai yang tertanam di bundle menjadi rahasia. [Environment Vite](https://vite.dev/guide/env-and-mode.html)

### 5.2 Backend — Vercel

| Nama | Isi | Keterangan |
| --- | --- | --- |
| `CLIENT_ORIGIN` | `https://meetspace-web.vercel.app` atau `https://meetspace-web.pages.dev` | Satu origin frontend yang aktif |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON service account lengkap | Secret backend |
| `ADMIN_UIDS` | UID admin production | Dapat berupa daftar dipisahkan koma |
| `LIVEKIT_URL` | `wss://PROJECT.livekit.cloud` | URL project media |
| `LIVEKIT_API_KEY` | API key project LiveKit | Simpan di backend |
| `LIVEKIT_API_SECRET` | API secret project LiveKit | Secret backend |

`PORT` tidak perlu diatur untuk integrasi Express Vercel. Pada server Node biasa, `PORT` dapat disuplai hosting; lokal memakai default 3000.

`CLIENT_ORIGIN` harus cocok persis dengan origin browser: protokol + hostname + port jika ada, **tanpa path dan tanpa trailing slash**.

```env
CLIENT_ORIGIN=https://meet.example.com
```

Kode sekarang menerima satu origin. Jangan mengisi beberapa domain dipisahkan koma dan jangan memakai `*` untuk menyelesaikan error konfigurasi. Pilih satu domain frontend utama dan arahkan pengguna ke sana.

### 5.3 Lokal tetap lokal

Tetap gunakan:

```env
# client/.env
VITE_API_BASE_URL=http://localhost:3000/api
```

```env
# server/.env
CLIENT_ORIGIN=http://localhost:5173
```

Isi Firebase/LiveKit lokal tetap mengikuti environment yang memang ingin digunakan. Konfigurasi hosting disimpan melalui dashboard; `.env` lokal tidak perlu ikut Git.

## 6. Deploy backend ke Vercel

Bagian ini dipakai oleh jalur A maupun B.

### 6.1 Buat project backend

1. Login ke Vercel dan hubungkan GitHub.
2. Pilih **Add New → Project**, import repository MeetSpace.
3. Beri nama, misalnya `meetspace-api`.
4. Set **Root Directory = `server`**.
5. Gunakan framework **Express** jika terdeteksi/tersedia.
6. Set Install Command menjadi `npm ci` bila perlu override.
7. Biarkan Build Command dan Output Directory mengikuti default integrasi Express. Project backend ini tidak memiliki script `build` dan tidak menghasilkan `dist`.
8. Pilih Node.js **24.x** pada pengaturan Build and Deployment.
9. Isi seluruh environment backend pada scope **Production**.
10. Deploy project.

Vercel mendukung entrypoint `src/index.js` dan pola `app.listen`. Karena itu struktur backend saat ini sesuai mekanisme deteksinya; tidak perlu menyalin semua route ke folder `api`. Vercel menjalankannya sebagai Function, bukan dengan proses `npm run dev`. Ini kesesuaian berdasarkan kode dan dokumentasi, belum pengujian deployment akunmu. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

Jika frontend belum dibuat, `CLIENT_ORIGIN` dapat diisi dengan alamat rencana, lalu **wajib diperbarui dan redeploy backend** setelah alamat frontend nyata diketahui. Proses server dan health check tetap bisa diuji lebih dahulu.

### 6.2 Periksa backend

Gunakan **domain production stabil** dari project, bukan URL acak milik sebuah preview deployment.

Buka:

```text
https://meetspace-api.vercel.app/api/health
```

Respons yang diharapkan dari kode saat ini:

```json
{"success":true,"message":"MeetSpace API is running"}
```

Health check hanya membuktikan HTTP API hidup. Endpoint ini tidak menguji akses Firestore, verifikasi Firebase token, atau koneksi LiveKit.

Periksa log Functions jika startup gagal. Jangan menambahkan rewrite seluruh route menuju `index.html` di project backend; aturan SPA itu hanya untuk frontend.

### 6.3 Pastikan API dapat dijangkau pengguna dan webhook

Periksa **Deployment Protection** untuk domain production backend. Browser pengguna dan LiveKit webhook harus dapat mengakses API tanpa login akun Vercel. Atur proteksi hosting agar tidak menghalangi endpoint production yang dibutuhkan. Tetap pertahankan autentikasi Firebase/LiveKit dan pemeriksaan akses yang ada dalam API. Jangan menaruh bypass secret hosting di frontend. [Deployment Protection](https://vercel.com/docs/deployment-protection)

## 7. Jalur A — deploy frontend ke Vercel

### 7.1 Tambahkan routing SPA

Buat file **`client/vercel.json`** dengan isi berikut. File ini berada di `client` karena root project frontend di Vercel adalah `client`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Jika file sudah ada, gabungkan aturan yang diperlukan tanpa menghapus konfigurasi lain. Commit dan push. Aturan ini membuat tautan langsung `/login`, `/admin`, `/lobby/ID`, dan `/meeting/ID` dapat dibuka atau direfresh. [Routing SPA Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite)

### 7.2 Buat project frontend

Import repository yang sama sebagai **project Vercel kedua**, misalnya `meetspace-web`. Satu repository dapat dipakai beberapa project dengan root berbeda. [Project monorepo Vercel](https://vercel.com/docs/monorepos)

| Pengaturan | Nilai |
| --- | --- |
| Root Directory | `client` |
| Framework Preset | `Vite` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | `24.x` |
| Environment | Seluruh variabel frontend bagian 5.1, scope Production |

Klik Deploy. Output Directory adalah `dist`, bukan `client/dist`, karena Root Directory sudah `client`.

### 7.3 Sambungkan frontend dan backend

1. Catat domain production frontend yang benar-benar diberikan Vercel.
2. Atur `CLIENT_ORIGIN` backend ke origin frontend tersebut.
3. Redeploy backend agar perubahan environment berlaku.
4. Pastikan `VITE_API_BASE_URL` frontend menunjuk domain backend production, diakhiri `/api`.
5. Jika frontend environment berubah, redeploy frontend juga.
6. Tambahkan hostname frontend ke Authorized domains Firebase.
7. Lanjutkan ke bagian 9 dan 10.

## 8. Jalur B — deploy frontend ke Cloudflare Pages

Jalur ini menggunakan **Cloudflare Pages untuk frontend** dan **backend Vercel pada bagian 6**. Mengupload `client/dist` saja tidak menjalankan Express.

### 8.1 Buat Pages project dari Git

1. Login Cloudflare Dashboard.
2. Buka **Workers & Pages**, buat aplikasi dan pilih alur **Pages → Connect to Git / Import repository**.
3. Hubungkan GitHub lalu pilih repository MeetSpace.
4. Beri nama project, misalnya `meetspace-web`.
5. Pilih production branch, misalnya `main`.
6. Isi pengaturan berikut.

| Pengaturan | Nilai |
| --- | --- |
| Root Directory | `client` |
| Framework preset | Vue, atau konfigurasi manual dengan nilai di bawah |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Build environment `NODE_VERSION` | `24` |
| Frontend environment | Seluruh variabel bagian 5.1 untuk Production |

Pages memasang dependency pada proses build. Pastikan `client/package-lock.json` ikut repository. Pilih alur Pages yang memiliki build output directory; deployment Worker memiliki konfigurasi berbeda. [Panduan Vue di Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/), [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)

`NODE_VERSION` memilih Node untuk build, bukan menambahkan runtime Node pada website statis. [Build image Pages](https://developers.cloudflare.com/pages/configuration/build-image/)

### 8.2 Deploy dan sambungkan API

1. Klik Save and Deploy.
2. Setelah selesai, catat domain production `https://NAMA-PROJECT.pages.dev` yang diberikan.
3. Di backend Vercel, ganti `CLIENT_ORIGIN` dengan origin Pages tersebut, lalu redeploy backend.
4. Pastikan `VITE_API_BASE_URL` di Pages berisi URL backend Vercel dengan `/api`.
5. Jika environment Pages diubah, jalankan deployment baru agar bundle dibangun ulang.
6. Tambahkan hostname Pages ke Authorized domains Firebase.

Jangan memasukkan secret backend pada build frontend Pages. Semua fitur API tetap memakai project Vercel backend yang sudah dibuat.

### 8.3 Pastikan routing SPA

Pages otomatis menyediakan perilaku SPA jika hasil build tidak memiliki `404.html` di tingkat teratas. Pada struktur ini tidak perlu menyalin rewrite Vercel ke Cloudflare. Jangan menambahkan `client/public/404.html` jika ingin mengandalkan fallback otomatis tersebut. Uji langsung `/login` dan refresh halaman meeting. [SPA rendering Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)

## 9. Hubungkan domain dan webhook

### 9.1 Jika menggunakan domain sendiri

Untuk frontend Vercel, tambahkan domain melalui pengaturan Domains project frontend dan ikuti record DNS yang diberikan dashboard. [Custom domain Vercel](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

Untuk Pages, gunakan **Pages project → Custom domains → Set up a custom domain**. Daftarkan domain pada project sebelum mengatur DNS. Apex domain dan subdomain memiliki persyaratan DNS berbeda; ikuti instruksi Cloudflare untuk domain yang dipilih. [Custom domains Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/)

Backend dapat tetap memakai domain `vercel.app`, atau diberi domain seperti `api.example.com` melalui project backend Vercel.

Sesudah HTTPS domain baru aktif:

1. Set `CLIENT_ORIGIN` backend ke domain frontend utama.
2. Set `VITE_API_BASE_URL` frontend ke domain API yang dipilih + `/api`.
3. Redeploy project yang environment-nya berubah.
4. Tambahkan hostname frontend ke Firebase Authorized domains.
5. Gunakan domain utama tersebut untuk tautan undangan.
6. Jika domain API berubah, perbarui webhook LiveKit.

Jangan memasang aturan cache publik untuk respons akun, admin, token, atau whiteboard. Jika memakai proxy/CDN tambahan di depan API, pastikan API dan webhook tidak terkena aturan cache seluruh konten atau challenge browser interaktif.

### 9.2 Aktifkan webhook LiveKit

Di project LiveKit Cloud, buka **Settings → Webhooks**, buat webhook dengan URL backend production:

```text
https://meetspace-api.vercel.app/api/webhooks/livekit
```

Atau, jika memakai domain API sendiri:

```text
https://api.example.com/api/webhooks/livekit
```

Pilih signing API key yang sesuai `LIVEKIT_API_KEY` dan `LIVEKIT_API_SECRET` backend. Jika UI menyediakan filter event, sertakan `room_started`, `room_finished`, `participant_joined`, dan `participant_left`. Bila tidak ada filter, backend sudah memilih event yang diproses. [Konfigurasi webhook LiveKit](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)

Dalam project ini, webhook memverifikasi signature terhadap body asli sebelum menyimpan statistik. Jangan mengubah urutan middleware sehingga body webhook diproses `express.json()` lebih dahulu.

Untuk memeriksa:

1. Mulai meeting dan masuk menggunakan dua peserta.
2. Keluar dari meeting lalu akhiri room.
3. Periksa pengiriman webhook pada dashboard/log LiveKit dan log backend.
4. Buka `/admin`, refresh statistik dan sesi terbaru.

Membuka URL webhook melalui address bar browser mengirim GET; handler project menerima POST bertanda tangan. Respons GET 404 atau POST tanpa signature 401 bukan bukti webhook rusak.

Dashboard menghitung durasi dari event peserta, bukan lama halaman admin terbuka. Total durasi yang tersimpan dapat baru berubah setelah sesi berakhir. Timer meeting di header memakai waktu room dari API; itu terpisah dari statistik penggunaan webhook.

### 9.3 Retensi event deduplikasi

Kode menulis field Timestamp `expiresAt` pada koleksi `usageEvents`, tujuh hari dari penerimaan event. Untuk pembersihan otomatis, buat kebijakan TTL Firestore dengan **collection group `usageEvents`** dan field **`expiresAt`**. Penghapusan TTL berjalan asinkron dan dapat menimbulkan biaya sesuai layanan. [Firestore TTL](https://firebase.google.com/docs/firestore/ttl)

TTL ini tidak otomatis membersihkan akun, whiteboard, sesi penggunaan, atau audit admin. Retensi data tersebut perlu ditentukan terpisah.

## 10. Pengujian setelah deploy

Lakukan memakai domain production HTTPS, dua browser/profil terpisah, dan jika memungkinkan dua perangkat/jaringan. Gunakan akun pengujian dan room khusus pengujian.

| Area | Langkah dan hasil yang diharapkan |
| --- | --- |
| API | `/api/health` menghasilkan JSON sukses |
| Routing | Buka `/login` langsung; refresh `/account` dan `/meeting/ID` tanpa 404 hosting |
| Register | Daftar akun baru; dapat login dan melihat status akses, tetapi belum bisa membuat room |
| Password/toast | Lihat/Sembunyikan bekerja; kesalahan login tampil melalui toast retro |
| Logout | Setelah logout, route yang memerlukan login kembali meminta login |
| Admin | UID yang ditentukan dapat membuka `/admin`; akun biasa ditolak |
| Pemberian akses | Admin memberi akses penuh; akun target memeriksa akses lagi dan dapat membuat room |
| Approval | Peserta menunggu host; tanpa approval belum terhubung ke media |
| Media | Mikrofon/kamera terlihat dan terdengar pada peserta lain; uji izin ditolak juga |
| Professional | Screen share, stop sharing dari browser, raise hand, chat, mute, dan Remove |
| Study | Gambar dan sticky note muncul di peserta lain; peserta yang masuk belakangan melihat board tersimpan |
| Timer | Peserta masuk pada waktu berbeda tetap melihat durasi room yang sama secara praktis, dengan toleransi latensi/tick tampilan |
| Mood | Buat room dengan mood berbeda; meeting mengikuti mood; override lokal dapat dikembalikan ke Mood room |
| Rekaman | Host merekam dengan izin browser, berhenti, lalu file lokal terunduh; bukan rekaman cloud |
| End all | Room ditutup dan peserta terputus; token baru untuk room tertutup ditolak |
| Statistik | Webhook valid masuk, sesi selesai tercatat dan durasi dashboard bertambah |
| Mobile | Tidak ada overflow halaman; toolbar yang dapat digeser tetap dapat diakses |

Kamera/mikrofon dan screen capture memerlukan dukungan serta izin browser. Screen sharing/rekaman dapat berbeda dukungannya pada mobile. Rekaman saat ini disimpan lokal pada perangkat host.

Contoh pemeriksaan tanpa token rahasia:

```bash
curl -i https://meetspace-api.vercel.app/api/health
curl -i -X OPTIONS https://meetspace-api.vercel.app/api/account \
  -H 'Origin: https://meetspace-web.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Ganti domain dengan alamat nyata. Untuk jalur B, header Origin memakai domain Pages. Respons preflight harus mengizinkan origin yang benar. Tes ini tidak menggantikan login dari aplikasi.

## 11. Preview, pembaruan, dan rollback

### 11.1 Preview/staging

Production dan Preview dapat memiliki environment berbeda. Pada Vercel, pilih scope saat memasukkan environment. [Environments Vercel](https://vercel.com/docs/deployments/environments)

Backend saat ini hanya mengizinkan **satu** `CLIENT_ORIGIN`. URL preview acak tidak otomatis diizinkan. Untuk menguji penuh dengan stabil:

1. Gunakan pasangan frontend/backend staging dengan domain tetap.
2. Atur backend staging agar menerima origin frontend staging tersebut.
3. Arahkan `VITE_API_BASE_URL` staging ke API staging.
4. Gunakan Firebase/LiveKit staging tersendiri jika membutuhkan isolasi data.
5. Pasang webhook project LiveKit staging hanya ke API staging yang sesuai.

Jangan menyalin seluruh secret production ke preview dari perubahan yang tidak dipercaya. Preview frontend yang menunjuk API production dapat membaca/mengubah data production sesuai hak akun pengujinya.

### 11.2 Memperbarui aplikasi

1. Ubah kode lokal dengan tetap menggunakan environment lokal.
2. Jalankan tes terkait dan build frontend jika berubah.
3. Commit dan push ke branch yang digunakan deployment.
4. Pantau build/deployment pada masing-masing project yang terdampak.
5. Jalankan smoke test login, create/join room, whiteboard, dan webhook setelah rilis terkait fitur tersebut.

Perubahan environment backend membutuhkan deployment baru pada Vercel. Perubahan `VITE_*` membutuhkan build/deployment baru frontend. Menambahkan admin ke `ADMIN_UIDS` tidak memerlukan perubahan UI.

### 11.3 Rollback

Jika rilis bermasalah, gunakan deployment sebelumnya yang diketahui bekerja melalui dashboard hosting, atau revert commit lalu deploy ulang. Periksa kecocokan frontend, backend, dan environment yang aktif.

Rollback kode tidak mengembalikan perubahan data Firestore, akun Firebase, pemberian akses admin, atau rekaman lokal. Hindari mengubah struktur data secara destruktif tanpa strategi pemulihan.

## 12. Pemecahan masalah

| Gejala | Pemeriksaan dan tindakan |
| --- | --- |
| Build tidak menemukan `package.json` | Root Directory salah; pilih `client` untuk frontend atau `server` untuk API |
| Backend diminta menghasilkan `dist` | Preset/output frontend diterapkan ke project API; gunakan integrasi Express |
| Error versi Node | Pilih Node 24.x di Vercel; `NODE_VERSION=24` untuk build Pages |
| Browser masih request `localhost:3000` | `VITE_API_BASE_URL` belum tersedia saat build; isi pada scope yang benar lalu redeploy frontend |
| Refresh `/meeting/...` menghasilkan 404 hosting | Vercel: periksa `client/vercel.json`; Pages: periksa fallback SPA dan keberadaan top-level `404.html` |
| CORS error | Cocokkan `CLIENT_ORIGIN` dengan origin browser, tanpa slash akhir/path; redeploy backend; periksa juga proteksi hosting |
| API mengembalikan HTML halaman login hosting | Deployment Protection/challenge menghalangi API atau URL yang dipakai adalah URL preview terlindungi |
| `/api/account` 401 JSON dari aplikasi | Periksa login, token Firebase, project Firebase frontend/backend, dan body respons; jangan menonaktifkan middleware auth |
| API 503 terkait autentikasi | Periksa kredensial Admin, IAM, project ID, koneksi ke Firebase, dan log backend |
| Startup gagal parse JSON/private key | Secret Admin bukan JSON valid atau escape private key berubah; tempel ulang JSON asli melalui dashboard backend |
| Login sukses tetapi Firestore gagal | Login Web dan akses Admin adalah dua konfigurasi berbeda; periksa database `(default)`, izin service account, serta status Firestore |
| Admin mendapat 403 | UID login tidak ada dalam `ADMIN_UIDS` deployment aktif, atau berasal dari Firebase project lain |
| Akun baru tidak dapat membuat room | Perilaku yang diharapkan sampai admin memberikan akses penuh |
| Whiteboard 401/403 | Periksa token room/approval, room masih aktif, dan key LiveKit yang digunakan backend; jangan mengganti dengan Firebase token manual |
| Whiteboard 503 | Periksa akses Firestore dan konfigurasi backend; cek log error tanpa membagikan token |
| Token room berhasil tetapi media tidak terhubung | Periksa URL/key LiveKit satu project, izin perangkat, HTTPS, dan jaringan yang memblokir WebRTC |
| Statistik dashboard kosong | Periksa URL webhook, signing key, pengiriman event, serta konektivitas API; lakukan meeting dan akhiri sesi untuk menghasilkan data |
| Webhook 401 | Bedakan 401 dari hosting dengan JSON/status API; periksa signature, signing key, dan urutan raw-body middleware |
| Update environment tidak terlihat | Pastikan scope Production/Preview benar dan deployment baru sudah selesai; build lama tidak membaca environment frontend terbaru |
| Mood berbeda setelah membuka Tools | Pilihan background lokal dapat menimpa mood room; pilih kembali Mood room |

`/api/health` berhasil tidak cukup untuk menyatakan seluruh layanan sehat. Gunakan hasil login, request akun, transaksi room/whiteboard, koneksi media, dan penerimaan webhook sebagai pemeriksaan terpisah.

## 13. Persiapan pembukaan untuk publik

Deployment untuk uji terbatas bisa dilakukan dengan langkah di atas. Sebelum dibuka luas, lanjutkan pekerjaan yang sebelumnya direncanakan:

- Rate limiting pada endpoint yang mudah disalahgunakan, termasuk request bergabung dan penerbitan token. Pada serverless, penghitung lokal dalam memori tidak cukup untuk limit lintas instance.
- Anti-spam waiting room dan batas volume request yang benar-benar ditegakkan server.
- Kebijakan privasi, retensi whiteboard/metadata peserta, dan akses terhadap data admin.
- Perilaku revocation aktif: pencabutan akses akun saja belum otomatis mengeluarkan peserta yang sedang tersambung; gunakan aksi Remove/End yang tersedia ketika ingin memutus sesi.
- Pemantauan error dan penggunaan Firebase, LiveKit, serta hosting. Whiteboard melakukan sinkronisasi cadangan setiap lima detik per peserta sehingga menambah request API dan pembacaan database.
- Pengujian layanan asli dengan beberapa peserta serta kondisi reconnect/izin perangkat ditolak.

Watch Party memerlukan URL HTTPS langsung ke file MP4/WebM/OGV yang dapat diakses
browser semua peserta. Playback mengikuti kontrol host lewat LiveKit DataChannel;
halaman streaming/iframe tidak didukung. Admin dapat menambahkan efek suara per mode
pada tab **Sound FX** dengan URL HTTPS ke MP3/WAV/OGG/M4A. File audio perlu di-host
sendiri pada sumber yang mengizinkan pemutaran browser; data katalog tersimpan di
Firestore `soundEffects` tanpa environment variable tambahan.

Jangan menganggap semua fitur roadmap otomatis selesai setelah deploy. Timer belajar
khusus dan editor Mood Manager masih mengikuti tahapan di README.

Tidak ada jaminan seluruh kombinasi layanan selalu gratis. Periksa paket, kuota, syarat penggunaan, dan pemakaian aktual pada dashboard masing-masing sebelum memperluas pengguna.

## 14. Jika ingin backend juga di Cloudflare

Cloudflare Pages pada jalur B hanya menerbitkan frontend. `npm start` Express bukan build command Pages.

Cloudflare Workers memiliki dukungan API Node dan adaptor HTTP seperti `httpServerHandler`, sehingga bukan berarti Express sama sekali tidak bisa dijalankan di Workers. Namun kompatibilitas adaptor HTTP tidak membuktikan seluruh dependency Firebase Admin/Firestore project ini langsung berjalan. [Node HTTP pada Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)

Project ini belum memiliki entrypoint Workers, konfigurasi Wrangler, atau pengujian deployment Firebase Admin pada runtime Workers. Untuk jalur API Workers, pekerjaan berikut masih diperlukan:

1. Tentukan entrypoint Worker dan cara menghubungkan handler Express tanpa menggandakan route bisnis.
2. Tentukan compatibility date/flags, pengelolaan environment, dan secrets.
3. Uji verifikasi Firebase token, kredensial, akses Firestore, transaksi, agregasi dashboard, dan koneksi yang digunakan SDK.
4. Uji pembuatan token LiveKit, host controls, dan verifikasi webhook dengan body asli.
5. Jika ada dependency yang tidak kompatibel, adaptasi integrasinya atau gunakan runtime Node melalui layanan/container yang sesuai.
6. Ulangi seluruh pengujian bagian 10 sebelum memindahkan trafik.

Cloudflare Containers merupakan jalur lain untuk runtime container, tetapi memerlukan Dockerfile, konfigurasi layanan, dan penilaian biaya/operasional tersendiri. Panduan ini tidak mengklaim migrasi Workers/Containers tersebut sudah selesai. [Cloudflare Containers](https://developers.cloudflare.com/containers/)

Untuk deployment awal dengan penggunaan ulang kode paling langsung, pilih **jalur A** atau **jalur B**. Jalur B tetap memberi hosting frontend di Cloudflare tanpa memaksa migrasi backend bersamaan.

## 15. Checklist singkat

- [ ] Pilih A (Vercel + Vercel) atau B (Pages + Vercel).
- [ ] Repository berisi source dan lockfile; tidak berisi `.env` atau kredensial.
- [ ] Firebase Web dan Admin menggunakan project yang sama.
- [ ] Email/Password aktif dan Firestore `(default)` tersedia.
- [ ] Firestore Rules dari repository sudah diterapkan pada database yang benar.
- [ ] Backend Vercel root `server`, Node 24.x, environment backend lengkap.
- [ ] Health check API berhasil dan domain production API tidak terhalang login hosting.
- [ ] Frontend root `client`, build `npm run build`, output `dist`.
- [ ] Semua `VITE_*` diisi sebelum build frontend.
- [ ] Routing SPA sesuai platform; deep link dapat direfresh.
- [ ] `CLIENT_ORIGIN` cocok dengan domain frontend utama.
- [ ] Domain frontend ditambahkan pada Authorized domains Firebase.
- [ ] UID admin benar dan halaman admin dapat diakses akun yang tepat.
- [ ] Webhook LiveKit bertanda tangan berhasil diterima dan statistik terisi setelah sesi uji.
- [ ] Host dapat menggambar, peserta meminta izin, dan hanya pemegang izin yang dapat menggambar; keduanya melihat hasil yang sama, timer room yang sama, dan mood yang benar.
- [ ] Pengujian media serta host controls dengan layanan asli selesai.
- [ ] Rate limiting, anti-spam, dan ketentuan privasi ditangani sebelum peluncuran publik luas.

Referensi konfigurasi project: [`client/.env.example`](./client/.env.example), [`server/.env.example`](./server/.env.example), [`firestore.rules`](./firestore.rules), dan [`README.md`](./README.md).


## Pembaruan room: password, undangan, dan notifikasi

Perubahan ini tidak membutuhkan environment variable atau migrasi database baru.
Deploy ulang **backend dan frontend** agar form password dan validasi API aktif bersama.
Room lama tetap dapat digunakan tanpa password.

- Pada **Create Room**, isi password opsional 6–128 karakter. Password tidak ikut
  dalam link/ID room dan tidak dapat dilihat kembali; bagikan terpisah kepada tamu.
- Backend menyimpan hash scrypt dengan salt acak. Respons API hanya menyertakan
  `passwordProtected`, tidak mengirim hash atau password. Breakout room mewarisi
  proteksi parent; peserta yang sudah diterima dapat berpindah lewat alur breakout.
- Tamu memasukkan password di lobby sebelum mengirim request. Password yang benar
  tetap membutuhkan persetujuan host. Token akses tetap mengikuti approval yang berlaku.
- **Copy Meeting ID** tersedia di lobby dan **Tools → Salin Meeting ID** di meeting.
  Yang disalin adalah tepat 10 angka, misalnya `3411954496`, tanpa spasi.
  Angka contoh hanya akan membuka room jika benar-benar diterbitkan untuk room itu.
  Form Gabung di homepage maupun halaman akun menerima angka tersebut, juga
  tautan undangan dan UUID lama. Pencarian angka menuju Lobby yang sama; password
  dan persetujuan host tetap wajib seperti sebelumnya.
- Room aktif lama mendapatkan Meeting ID otomatis saat dibuka melalui tautan
  atau UUID. Deploy ulang **backend dan frontend** bersama; tidak diperlukan
  environment variable atau migrasi manual untuk fitur Meeting ID. Endpoint
  pencarian angka publik perlu diberi rate limiting sebelum peluncuran publik luas.
- Host mendapat toast permintaan bergabung walaupun panel People ditutup; polling
  berjalan setiap 4 detik, sehingga notifikasi dapat membutuhkan beberapa detik.
- Whiteboard mempertahankan gambar yang belum tersimpan dalam memori tab dan
  menampilkan tombol **Retry**. Selesaikan penyimpanan sebelum meninggalkan meeting.
  Tombol **⛶ Tampilkan semua gambar** membantu saat gambar berada di luar viewport.

Tambahkan pemeriksaan setelah deploy:

- [ ] Password salah tidak membuat entri waiting room; password benar tetap meminta approval.
- [ ] Host melihat toast permintaan ketika sedang memakai whiteboard/share screen.
- [ ] Salin ID dan link membuka room yang sama; password tidak muncul pada URL.
- [ ] Gambar, pindahkan, undo, redo, refresh, lalu periksa hasil dari tab peserta kedua.
- [ ] Periksa gallery dan aktivitas kelima mode pada desktop serta ponsel.

Password room menambah proteksi masuk, tetapi tidak menggantikan rate limiting dan
anti-spam production yang masih tercantum dalam checklist di atas.

## Game Night dan pengelolaan konten

Deploy ulang **backend dan frontend** bersama. Tidak ada environment variable baru
atau migrasi manual. Backend menggunakan koleksi Firestore `gameContent` dan
`gameCatalogOverrides`; klien tetap tidak mengakses Firestore langsung. Admin yang
ditetapkan melalui `ADMIN_UIDS` mengelola bank soal dan katalog pada dashboard.

Setelah deploy, uji dari dua browser: host memilih game, peserta melihat game dan
skor yang sama, pause/restart bekerja, dan peserta yang masuk belakangan menerima
state terbaru. Uji juga membuat, mengubah, menyembunyikan, dan menghapus satu
pertanyaan dari dashboard admin, lalu mulai **game baru** untuk melihat perubahan.
Sesi yang sedang berjalan mempertahankan bank soal saat game dimulai. Untuk game
web, ganti URL demo terlebih dahulu; memilih iframe memerlukan izin embed dari
situs pemilik game. Game browser eksternal tidak otomatis menjadi multiplayer.
