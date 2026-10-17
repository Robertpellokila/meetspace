# Deploy MeetSpace: Cloudflare Pages + Workers

Panduan ini untuk repository yang sudah di-push ke branch `main` GitHub. Frontend Vue berjalan di **Cloudflare Pages**, API Express di **Cloudflare Workers**, sedangkan Firebase Authentication/Firestore dan LiveKit tetap menjadi layanan eksternal. Tidak perlu mengubah URL di kode lokal setiap kali deploy; konfigurasi production diisi pada dashboard Cloudflare.

> **Status verifikasi (17 Oktober 2026):** build frontend, bundling Worker, health endpoint Worker lokal, dan tes adapter Firestore REST telah diperiksa. Operasi Firestore dengan service account production, login sungguhan, dan koneksi LiveKit harus diuji setelah secret dan domain terpasang. Jangan menganggap `/api/health` saja sebagai bukti semua fitur selesai.

## 1. Sebelum membuka dashboard

Pastikan commit ke `main` memuat `client/`, `server/`, kedua `package-lock.json`, `server/wrangler.jsonc`, dan dokumen ini. Jangan commit `client/.env`, `server/.env`, `.dev.vars`, atau file service account. `.gitignore` sudah mengecualikan path tersebut; periksa lagi dengan `git status --short` dan `git diff --cached --name-only` sebelum push.

Siapkan akses ke project **Firebase** dan **LiveKit** yang sama dengan yang dipakai aplikasi. Di Firebase, aktifkan Authentication Email/Password, buat Firestore `(default)`, dan terapkan [firestore.rules](./firestore.rules) untuk akses client. API Worker memakai service account sehingga Firestore Rules tidak membatasi panggilan API; validasi izin tetap dilakukan oleh routes server. Jika kamu memakai project Firebase baru, UID akun lama tidak otomatis pindah.

Di Firebase Console → **Project settings → Service accounts**, buat/download key JSON service account untuk backend. Simpan file itu di tempat aman, di luar Git. Kamu akan menyalin **seluruh isi JSON** ke secret Worker `FIREBASE_SERVICE_ACCOUNT_JSON`. Worker tidak bisa memakai path lokal `GOOGLE_APPLICATION_CREDENTIALS` milik server Node.

## 2. Buat API Worker dari GitHub

1. Cloudflare Dashboard → **Workers & Pages → Create application → GitHub**. Hubungkan akun GitHub dan pilih repository MeetSpace.
2. Pilih branch production `main`. Isi **Root directory** `server` dan nama Worker **`meetspace-api`**, sesuai `name` pada [`server/wrangler.jsonc`](./server/wrangler.jsonc). Nama berbeda dapat membuat build Git gagal.
3. Isi **Build command** `npm ci && npm run worker:check`. Isi **Deploy command** `npm run worker:deploy`. Hasilnya memakai `wrangler` dari `server/package-lock.json`.
4. Simpan dan deploy. Catat URL yang diberikan, misalnya `https://meetspace-api.<subdomain>.workers.dev`. Buka `https://meetspace-api.<subdomain>.workers.dev/api/health`; respons yang diharapkan adalah JSON `success: true`.

Deploy pertama boleh dilakukan sebelum secret ditambahkan karena `/api/health` tidak membaca Firestore. Endpoint room/account baru dapat berfungsi setelah langkah 4. Git integration akan deploy ulang ketika ada push berikutnya ke `main`. [Panduan Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [pengaturan build monorepo](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 3. Buat frontend Pages dari repository yang sama

1. Cloudflare Dashboard → **Workers & Pages → Create application → Pages → Import an existing Git repository**. Pilih repository yang sama.
2. Pilih production branch `main`, **Root directory** `client`, **Build command** `npm ci && npm run build`, dan **Build output directory** `dist`.
3. Sebelum deploy pertama, isi environment **Production** berikut pada Pages:

   | Variabel | Isi |
   | --- | --- |
   | `NODE_VERSION` | `24` |
   | `VITE_API_BASE_URL` | URL Worker dari langkah 2 **ditambah `/api`**, contoh `https://meetspace-api.<subdomain>.workers.dev/api` |
   | `VITE_FIREBASE_API_KEY` | `apiKey` dari Firebase Web app |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` dari Firebase Web app, biasanya `PROJECT_ID.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` yang sama dengan service account |
   | `VITE_FIREBASE_APP_ID` | `appId` dari Firebase Web app |

4. Deploy dan catat domain `https://<nama-project>.pages.dev`. Variabel `VITE_*` masuk ke bundle browser saat build; **jangan** masukkan private key, service account, atau LiveKit API secret ke sini. Bila nilai berubah, jalankan deploy Pages baru. [Panduan Vue di Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/).

Pages menangani route Vue seperti `/login`, `/lobby/...`, dan `/meeting/...` sebagai SPA selama hasil build tidak berisi `404.html` di root. Uji buka langsung lalu refresh salah satu route tersebut. [Perilaku SPA Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## 4. Isi konfigurasi runtime Worker

Di **Workers & Pages → meetspace-api → Settings → Variables & Secrets**, tambahkan nilai untuk **runtime Worker** (bukan *Build Variables and Secrets*). Secret pilih tipe **Secret** dan tekan **Deploy** setelah menyimpan. [`keep_vars: true`](./server/wrangler.jsonc) menjaga variabel dashboard saat push berikutnya; secrets juga dipertahankan Wrangler. [Variabel runtime dan build](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

| Nama | Tipe | Isi |
| --- | --- | --- |
| `CLIENT_ORIGIN` | Variable | Origin Pages yang tepat, contoh `https://<nama-project>.pages.dev` **tanpa `/` terakhir** |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Isi lengkap JSON service account Firebase, termasuk `private_key` |
| `ADMIN_UIDS` | Variable | UID akun admin Firebase, dipisahkan koma bila lebih dari satu; untuk project saat ini: `sOmHt2pt9ygataiZL1RKyC1UKjm2` |
| `LIVEKIT_URL` | Variable | URL LiveKit, contoh `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | Secret | API key LiveKit |
| `LIVEKIT_API_SECRET` | Secret | API secret LiveKit |

`FIRESTORE_PREFER_REST=true` sudah ada di `wrangler.jsonc`. Worker menggunakan transport REST agar operasi Firestore yang dipakai routes tidak membutuhkan gRPC atau pembuatan kode protobuf saat runtime Workers. Sumber Node lokal tetap memakai Firebase Admin biasa. Tidak perlu membuat D1/KV karena data aplikasi tetap di Firestore.

Di Firebase Console → **Authentication → Settings → Authorized domains**, tambahkan hostname Pages tanpa `https://`, misalnya `<nama-project>.pages.dev`. Tambahkan juga domain custom jika nanti dipakai. Firebase Web config di Pages harus berasal dari project yang sama dengan service account Worker.

## 5. Hubungkan LiveKit

Di dashboard project LiveKit, tambahkan webhook URL `https://meetspace-api.<subdomain>.workers.dev/api/webhooks/livekit` (atau domain API custom). Gunakan project yang API key/secret-nya dipasang pada Worker. Event yang dipakai statistik adalah `room_started`, `room_finished`, `participant_joined`, dan `participant_left`. Endpoint webhook memverifikasi tanda tangan LiveKit; jangan uji dengan `curl` tanpa signature dan menganggap `401` sebagai kegagalan konfigurasi. [Webhook LiveKit](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/).

## 6. Uji sebelum dipakai tim

Lakukan dari dua browser/profil berbeda:

1. Buka Pages, daftar/login, kemudian buka **Account**. Jika API `/api/account` mengembalikan `401`, periksa token Firebase dan kesamaan project Firebase Web dengan service account.
2. Dengan UID admin di atas, buka dashboard admin. Berikan izin penuh kepada akun uji, lalu buat room. Akun yang belum diberi izin tetap boleh bergabung sebagai peserta sesuai aturan aplikasi.
3. Salin link dan Meeting ID angka. Buka sebagai peserta; uji password room, waiting room, approval, serta notifikasi host. ID yang tidak ada harus memberi `404` dari `/api/rooms/by-code/<10-digit-ID>` setelah Firestore berfungsi.
4. Masuk ke meeting dari kedua browser: uji audio/video, chat, share screen, whiteboard, mood, game, watch party, serta Professional host controls. Cek webhook dan statistik admin setelah sesi selesai.
5. Refresh URL `/meeting/...` di Pages. Cek **Worker Logs** jika route API `500/503` dan **Pages build logs** jika frontend gagal build.

Tes CORS opsional, ganti alamat dengan domain milikmu:

```bash
curl -i -X OPTIONS 'https://meetspace-api.<subdomain>.workers.dev/api/account' \
  -H 'Origin: https://<nama-project>.pages.dev' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Header `Access-Control-Allow-Origin` harus sama dengan origin Pages. Jika masih `localhost:5173`, nilai `CLIENT_ORIGIN` belum tersimpan pada **runtime** Worker. Jika browser masih meminta `localhost:3000`, `VITE_API_BASE_URL` di Pages salah atau frontend belum di-build ulang.

## 7. Domain sendiri dan pembaruan berikutnya

Domain custom opsional. Untuk frontend, gunakan **Pages → Custom domains**; untuk API, gunakan **Worker → Settings → Domains & Routes**. Setelah domain aktif, ubah `VITE_API_BASE_URL` di Pages menjadi `https://api.domainmu.com/api`, ubah `CLIENT_ORIGIN` Worker menjadi `https://meet.domainmu.com`, tambahkan hostname frontend ke Firebase Authorized domains, dan ganti webhook LiveKit jika URL API berubah. Deploy ulang Pages setelah mengubah `VITE_*`. [Custom domain Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/), [custom domain Worker](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Untuk perubahan kode selanjutnya, push ke `main`; Git integration akan membangun Pages dan Worker dari folder masing-masing. Konfigurasi `.env` lokal tetap untuk development dan tidak perlu diganti. Preview branch Pages bisa memiliki URL acak, sedangkan CORS server saat ini mengizinkan satu `CLIENT_ORIGIN`; gunakan origin staging tetap jika ingin menguji preview lintas domain.

**Batas operasional:** Workers Free memiliki batas CPU per request yang kecil. Karena API ini memverifikasi Firebase token dan melakukan transaksi Firestore, pantau CPU, error, dan latency pada dashboard setelah uji nyata; pilih plan yang sesuai sebelum digunakan tim secara intensif. [Batas Workers](https://developers.cloudflare.com/workers/platform/limits/).
