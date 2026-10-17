# MeetSpace

Vue + Pinia di `client/`, Express + Firebase Admin + LiveKit di `server/`.
Perubahan tahap Professional mempertahankan views, layout, komponen meeting,
assets, warna, dan appearance store yang sudah ada.

Panduan khusus **Cloudflare Pages + Workers** tersedia di
[CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md). Pilihan Vercel dan
Pages + backend Vercel tetap dijelaskan di [DEPLOYMENT.md](./DEPLOYMENT.md).

## Status tahap pengembangan

1. Login/register Firebase, proteksi Create Room, dan host approval sudah disambungkan.
2. Professional menyediakan share screen dengan opsi audio browser, anotasi saat
   presentasi, whiteboard kolaboratif, raise hand, co-host, Security, breakout,
   polling, dan jadwal berulang dengan undangan kalender.
3. Mode lain memakai layout dan tools masing-masing. Study memiliki whiteboard
   kolaboratif: goresan, bentuk, teks, sticky note, dan halaman bersama.

## Menjalankan lokal

Gunakan Node.js 22.23+ atau versi lebih baru yang kompatibel. Isi `client/.env`
berdasarkan `client/.env.example`, termasuk URL API dan konfigurasi Firebase Web.
Aktifkan provider Email/Password di Firebase Authentication dan buat database
Firestore pada project yang sama.

Isi `server/.env` berdasarkan `server/.env.example`. Firebase Admin membutuhkan
`GOOGLE_APPLICATION_CREDENTIALS` yang menunjuk ke file service account lokal,
atau `FIREBASE_SERVICE_ACCOUNT_JSON` di environment server. Jangan memasukkan
kredensial Admin ke variabel `VITE_*`. Konfigurasi LiveKit menggunakan URL,
API key, dan API secret dari project LiveKit yang sama.

Pendaftaran lokal memerlukan `RATE_LIMIT_SECRET` acak minimal 32 karakter di
`server/.env`. Link verifikasi email dikirim langsung oleh Firebase Authentication;
tidak ada API key layanan email tambahan. Pastikan template **Email address
verification** tersedia di Firebase Authentication. Setelah mengubah `.env`, mulai ulang server. Langkahnya
dijelaskan di [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md).

Jalankan perintah berikut dari folder masing-masing, pada dua terminal:

```sh
# server/
npm install
npm run dev
```

```sh
# client/
npm install
npm run dev
```

Default frontend `http://localhost:5173`, backend `http://localhost:3000`.
Jika menggunakan hostname/port berbeda, sesuaikan `CLIENT_ORIGIN` di server
dan `VITE_API_BASE_URL` di client. Health endpoint: `GET /api/health`.
Firestore rules di root menolak akses client langsung; aplikasi mengakses data
melalui Admin SDK di backend.

Route room aktif berada di `server/src/routes/room.js` dan menggunakan service
room persisten Firestore. Controller lama tidak dipasang ke API.

## Perilaku Professional

- Host masuk setelah login; tamu mengirim permintaan dan belum terhubung ke media
  sebelum disetujui. Kredensial approval disimpan per-tab di session storage.
- Waiting room dapat dibuka host dari lobby maupun panel People di meeting.
  Refresh lobby melanjutkan permintaan yang masih pending, tanpa membuat duplikat.
  Setelah Leave, approval yang masih berlaku menampilkan tombol Join.
- Raise hand menggunakan participant attributes LiveKit, sehingga peserta yang
  baru bergabung juga melihat tangan yang sudah terangkat. People menampilkan
  peserta dengan tangan terangkat lebih dahulu.
- Screen share memakai `useScreenShare`, `ProfessionalLayout`, dan
  `ScreenShareStage` yang ada. Native Stop sharing memperbarui toolbar dan gallery.
  Audio tab/sistem diminta dari browser, tetapi hanya tersedia jika sumber dan
  browser mendukungnya. Pemilik share dapat menggambar anotasi di atas presentasi;
  goresan terbaru disiarkan lewat LiveKit.
- Security dapat mengunci permintaan bergabung baru dan membatasi izin publikasi
  screen share peserta melalui LiveKit, termasuk yang sudah terhubung. Mute on
  entry diterapkan saat client masuk. Chat dikirim melalui API; toggle chat
  menolak pengiriman peserta di server. Pesan LiveKit langsung dari peserta
  diabaikan aplikasi, sementara kanal data whiteboard, reactions, dan soundboard
  tetap aktif. Riwayat chat tersimpan di Firestore selama 24 jam; aktifkan TTL
  collection group `chatMessages`, field `expiresAt`, untuk membersihkan dokumen lama.
- Host controls memeriksa Firebase UID pemilik atau co-host yang diberi izin di backend. Client tidak
  mendapat grant `roomAdmin`. Mute hanya menonaktifkan track mikrofon yang sedang
  aktif; peserta boleh menyalakannya kembali sendiri. Kamera dan audio screen
  share tidak ikut dimatikan.
- Remove mencabut approval, lalu memanggil LiveKit untuk memutus peserta.
  Jika LiveKit gagal, API menyatakan kegagalan dan host dapat mencoba Remove lagi;
  approval tetap dicabut. Permintaan baru tetap memerlukan approval baru.
- Co-host harus peserta berakun yang sudah disetujui masuk ke room; akses penuh
  admin tidak diperlukan. Pemilik room dapat memberi/mencabut peran dari panel
  Security. Izin moderasi berakhir saat persetujuan peserta berakhir atau dicabut.
  Hanya pemilik room yang dapat mengakhiri room atau sesi mingguan.
- Room Professional dapat dijadwalkan sekali atau setiap minggu. File kalender
  `.ics` memuat pengingat 15 menit; link dan Meeting ID tetap sama. Akhiri sesi
  mingguan untuk memutus peserta dan mereset timer tanpa menutup room. Reminder
  toast halaman akun hanya muncul selama halaman tersebut terbuka; impor `.ics`
  ke kalender untuk pengingat di luar situs.

## Verifikasi

Jalankan `npm test` dari `client/` dan `server/`, serta `npm run build` dari `client/`.
Tes memakai Node test runner dengan module mocks, tanpa layanan eksternal:

- client: state peserta, screen sharing/native stop, token approval, cleanup,
  polling waiting room, pencegahan double-click, dan Leave tanpa auto-rejoin;
- server: autentikasi, kepemilikan room, approval/expiry, token grants, batas
  kontrol host, mute/lower hand, dan pencabutan approval saat Remove gagal/retry.

Pemeriksaan browser juga dilakukan dengan Firebase/LiveKit API tiruan untuk
interaksi host/tamu dan layout sempit. Ini belum menggantikan tes dua browser
dengan kamera, mikrofon, screen capture, Firebase, dan LiveKit sungguhan.
Pada pemeriksaan lokal, kredensial Firebase Admin belum dikonfigurasi.

## Sebelum versi publik

Rate limiting, pembatasan/anti-spam waiting room, retensi data, dan kontrol privasi
lanjutan masih perlu dikerjakan. Daftar waiting room saat ini memfilter permintaan
expired di aplikasi; kueri dan pembersihan data perlu disiapkan untuk volume publik.
Mengubah status approval langsung di database tidak memutus sesi yang sudah aktif;
gunakan endpoint Remove untuk mencabut approval sekaligus memutus sesi.

Revocation token lama tersedia pada LiveKit Cloud. Pada self-hosted LiveKit,
Remove tidak otomatis membatalkan JWT yang sudah diterbitkan; endpoint aplikasi
menolak penerbitan token baru dari approval yang dicabut, tetapi token lama
masih perlu dipertimbangkan hingga kedaluwarsa. Lihat
[dokumentasi token revocation LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/#token-revocation).

## Homepage, akun, dan admin

Homepage publik menjelaskan lima mode, langkah bergabung, kemampuan yang sudah
tersedia, dan fitur yang masih dikembangkan. Komponen gallery, token warna, font,
serta tema terang/gelap yang ada tetap digunakan. Splash tampil saat aplikasi
menyiapkan autentikasi dan saat menghubungkan meeting. Error autentikasi/API/media
memakai toast retro; kode Firebase diterjemahkan menjadi pesan yang bisa ditindaklanjuti.
Menu **Akun → Logout** tersedia di homepage, lobby, create room, dan meeting.
Logout memutus koneksi media dan membersihkan kredensial approval di tab tersebut.

- Pendaftaran Firebase terbuka. Setelah link email diverifikasi, akun baru
  memiliki akses `pending`: dapat bergabung sebagai peserta, tetapi belum boleh
  membuat atau memulai sesi host.
- Pendaftaran mengirim link verifikasi Firebase sekali; setelah verifikasi, login berikutnya
  cukup email dan password. Tombol Google memakai Firebase Google Sign-In, dan
  **Lupa password?** tetap mengirim link reset. Email terverifikasi wajib untuk host/admin.
- Halaman `/account` menampilkan status akses dan tombol **Periksa akses lagi**.
- Admin ditetapkan lewat `ADMIN_UIDS` di `server/.env`, berisi Firebase Authentication
  UID, dipisahkan koma jika lebih dari satu. Restart server setelah mengubah `.env`.
  Role dari browser atau field `role` di dokumen akun tidak memberi hak admin.
- `/admin` menyediakan daftar akun (50 per halaman), pencarian email lengkap,
  pemberian/pencabutan akses host, statistik penggunaan, sesi terbaru, serta audit
  perubahan akses. Admin masuk dengan email/password atau Google. Akun
  tercatat setelah aplikasi menyinkronkan profil ke backend.
- `RATE_LIMIT_SECRET` backend wajib diisi untuk limit registrasi melalui situs,
  lookup Meeting ID, dan permintaan waiting room; counter disimpan di Firestore.
- Backend memeriksa akses pada pembuatan room, penerbitan token host, dan moderasi.
  Pencabutan akses tidak otomatis memutus sesi yang sudah terhubung. Host tetap
  dapat mengakhiri room miliknya. Menutup koneksi aktif perlu aksi End/Remove.

### Mengaktifkan dashboard penggunaan

1. Konfigurasikan kredensial Firebase Admin di `server/.env` menggunakan salah satu
   cara dalam `.env.example`. Jangan memasukkan service-account key ke client.
2. Isi `ADMIN_UIDS` dan `RATE_LIMIT_SECRET`. Aktifkan template verifikasi email
   serta provider Google jika tombol Google dipakai. Restart backend, lalu login dengan
   akun admin yang emailnya sudah diverifikasi.
3. Di proyek LiveKit, tambahkan webhook ke
   `https://BACKEND_ANDA/api/webhooks/livekit` untuk event `room_started`,
   `room_finished`, `participant_joined`, dan `participant_left`. Backend harus
   dapat dijangkau LiveKit melalui HTTPS. URL localhost saja tidak dapat digunakan.
4. Endpoint memverifikasi signature terhadap body asli sebelum menulis Firestore.
   Uji meeting dua browser; akhiri sesi lalu Refresh dashboard.

Dashboard menghitung durasi per peserta dari webhook LiveKit, bukan waktu halaman
terbuka. Durasi total adalah akumulasi sesi selesai. Peserta/room aktif mengikuti
event terakhir yang diterima, sehingga dapat tertinggal jika webhook belum lengkap.
Tidak ada data penggunaan rekaan saat webhook belum dikonfigurasi. Event duplikat
serta event datang terlambat ditangani; room selesai menutup sesi yang belum memiliki
event keluar. Sambungan ulang dengan participant SID baru dihitung sebagai sesi baru.

Koleksi server: `accounts`, `adminAudit`, `usageSessions`, `usageEvents`, `liveRooms`,
dan `stats`. Aktifkan Firestore TTL pada `usageEvents.expiresAt` untuk membersihkan
catatan deduplikasi setelah tujuh hari. Tentukan kebijakan retensi untuk metadata
sesi/audit sebelum publik. Dashboard menyimpan nama peserta, identitas sesi, nama
room dan waktu; isi chat, audio, video, dan file rekaman tidak diunggah ke dashboard.

## Tools meeting tambahan

- **Tools**: Gallery, Speaker, Dynamic gallery (pembicara aktif lebih dahulu),
  Multi-speaker (hingga empat), Retro lounge; pin lokal, hide self/no-video,
  timer sesi, background ruang dari katalog mood, pemilihan mic/kamera/speaker,
  salin undangan, fullscreen. Layout/filter khusus Professional; background
  ruang mengubah tampilan aplikasi, sementara blur/gambar kamera diproses lokal
  sebelum track kamera dipublikasikan.
- Audio peserta tetap terpasang saat video disembunyikan, dipin, atau panel dibuka.
- **React**: enam reaksi dikirim lewat LiveKit; tampilan reaksi dibatasi agar tidak
  memenuhi layar. Ini belum menggantikan rate limiting server untuk versi publik.
- **Record** (host): rekaman lokal dari tab/layar yang dipilih lewat izin browser.
  Pilih tab meeting dan aktifkan berbagi audio untuk menangkap suara peserta.
  Mic host yang sudah dipublikasikan saat mulai turut dicampurkan. Jika mic belum
  dipublikasikan, aktifkan dahulu lalu mulai rekaman. Audio bergantung browser/sumber
  capture; bukan cloud recording atau rekaman tiap track. Peserta melihat indikator.
  Stop, native stop sharing, Leave, dan pindah breakout menyelesaikan unduhan
  WebM/MP4. Batas 512 MB per rekaman; jangan reload/tutup tab sebelum menyimpannya.
- **Breakout** (Professional): host dan co-host membuat hingga enam ruang,
  menugaskan peserta termasuk sesama fasilitator, mengatur timer, mengirim
  pengumuman, dan menerima permintaan bantuan dalam modal kelompok yang lebih luas.
  Host dan co-host melihat daftar peserta yang sedang terhubung di tiap ruang.
  Target menerima modal **Masuk kelompok** atau **Batal**; tujuannya tetap bisa
  dibuka nanti dari menu Breakout. Saat timer
  habis, peserta breakout dikembalikan ke room utama atau lobby bila masuk langsung
  ke breakout. Room memakai koneksi media/chat terpisah dan approval asal tetap
  diperiksa saat menerbitkan token breakout.
- **Polling** (Professional): fasilitator membuat draf pertanyaan dengan 2–6
  pilihan, membuka/menutup voting, dan melihat hitungan jawaban. Tiap identitas
  approval hanya dapat memilih sekali. Polling sesi mingguan sebelumnya disembunyikan.
- **Pemeriksaan perangkat** di lobby menyediakan preview kamera, level mikrofon,
  dan tes speaker. Pintasan Alt+M/V/S/H mengontrol mic, kamera, share, dan tangan.
- **End all**: dialog konfirmasi, menutup admission room dan breakout, lalu memutus
  koneksi LiveKit. Kegagalan pemutusan bisa dicoba lagi; room tetap ditutup.

Watch Party menyinkronkan video langsung yang dipilih host (URL HTTPS ke file
MP4/WebM/OGV) melalui LiveKit: play, pause, seek, dan peserta yang masuk belakangan
menerima posisi terbaru. Situs streaming dan halaman web biasa bukan sumber video
langsung. Semua mode menyediakan Sound FX untuk efek sesaat; admin dapat menambah
URL MP3/WAV/OGG/M4A per mode melalui dashboard. Suara ambience mood tetap pilihan
lokal masing-masing peserta. Catatan terpisah/timer belajar khusus dan editor Mood
Manager masih mengikuti roadmap.

### Whiteboard, durasi room, dan mood

- Whiteboard Study menyimpan perubahan di koleksi Firestore `meetingWhiteboards`.
  API memverifikasi token LiveKit room dan approval peserta pada setiap akses;
  perubahan memakai transaksi, nomor versi, serta ID operasi untuk mencegah duplikasi.
  Pratinjau dikirim lewat LiveKit, dengan sinkronisasi cadangan setiap lima detik.
  Token whiteboard diperbarui bila kedaluwarsa tanpa menyambungkan ulang media.
- Durasi room dihitung dari `startedAt` yang ditulis server sekali saat peserta
  pertama mendapat token. Peserta yang masuk belakangan mengikuti waktu yang sama.
  Jam server disinkronkan berkala agar perbedaan jam perangkat tidak mengubah durasi.
  Ini adalah durasi meeting, bukan timer belajar/Pomodoro.
- Background default mengikuti mood room. Pilihan di Tools hanya mengubah tampilan
  peserta itu sendiri; pilih “Mood room” untuk kembali mengikuti mood room.
- Input teks/rename whiteboard memakai form; hapus/clear memakai toast konfirmasi
  retro. Login dan register memiliki tombol tampil/sembunyikan password.
- Pengujian whiteboard dan timer menggunakan API asli dengan database dalam memori,
  token bertanda tangan, dan media LiveKit simulasi. Koneksi ke Firebase/LiveKit
  produksi tetap perlu diuji setelah kredensial server tersedia.

### Hasil pemeriksaan perubahan ini

Tes otomatis mencakup default akses akun, proteksi admin, audit/paginasi, approval,
kontrol host, breakout, penutupan room, signature webhook, durasi/idempotensi/event
terlambat, lifecycle rekaman lokal, toast, waiting room, dan lifecycle media.
Pemeriksaan browser menggunakan fixture lokal terisolasi untuk homepage, akun,
dashboard, tools, reaksi, breakout, dan tampilan sempit. Pengujian Firebase Admin,
webhook publik, dan media dua perangkat sungguhan memerlukan konfigurasi layanan.

## Jika `/api/account` mengembalikan 401

Frontend mengirim Firebase ID token otomatis setelah status login siap. Pengaturan
`VITE_FIREBASE_*` hanya mengonfigurasi frontend; backend memerlukan konfigurasi
Firebase Admin sendiri. UID di `ADMIN_UIDS` menentukan role, bukan kredensial SDK.

- `401 / AUTH_REQUIRED`: tidak ada token login. Masuk ke aplikasi terlebih dahulu.
- `401 / AUTH_TOKEN_INVALID` atau `AUTH_TOKEN_EXPIRED`: sesi tidak valid; keluar
  lalu masuk kembali. Pastikan project Firebase client dan server sama.
- `503 / AUTH_SERVICE_UNAVAILABLE`: server gagal memverifikasi token (misalnya
  project/kredensial Admin belum tersedia atau koneksi ke Firebase terganggu).
  Middleware tetap menolak akses, tetapi tidak lagi menyamarkannya sebagai logout.

Untuk setup lokal, ambil file JSON service account dari **Firebase Console →
Project settings → Service accounts → Generate new private key**, simpan di luar
folder client, lalu set path file tersebut di `server/.env`:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/path/lengkap/firebase-service-account.json
```

Restart backend dari folder `server/` setelah mengubah `.env`; nodemon tidak selalu
memantau file `.env`. Kemudian klik **Periksa akses lagi** di halaman Akun.
Jangan menaruh isi private key di chat, kode frontend, atau version control.
Panduan resmi: [Firebase Admin setup](https://firebase.google.com/docs/admin/setup).


## Pemeriksaan terbaru: whiteboard, undangan, dan mood

Perubahan pengguna pada whiteboard (pan/zoom, select/move, diamond/line, history,
queue penyimpanan) dan layout Study tetap dipakai.

- Clone dokumen whiteboard kini mendukung objek reaktif Vue. Move, eraser,
  undo/redo tidak lagi gagal akibat `DataCloneError`.
- Pembatalan pointer membersihkan pan/drag; kegagalan simpan memakai toast,
  mempertahankan gambar lokal, dan menyediakan retry dengan ID operasi yang sama.
  Sinkronisasi izin tetap berjalan saat ada antrean. Edit belum tersimpan masih
  berada di memori tab, bukan penyimpanan offline permanen.
- Kanvas menggunakan resolusi device pixel. Tombol fit menampilkan kembali gambar
  di luar viewport; gambar yang sudah ada difit saat papan pertama dibuka.
- Password room opsional divalidasi di server sebelum waiting room; copy link dan
  copy Meeting ID memakai satu helper. Tidak diperlukan env tambahan; deploy kedua aplikasi.
- Setiap room baru mendapat Meeting ID unik 10 digit. Form Gabung di homepage
  dan halaman akun menerima angka itu, termasuk yang dipisah spasi atau tanda
  hubung, lalu membuka Lobby UUID yang sudah ada. Tautan dan UUID lama tetap berlaku.
  Room aktif yang dibuat sebelum fitur ini mendapat Meeting ID saat dibuka lagi.
- Pemantauan approval tidak lagi bergantung pada panel People. Toast host menandai
  request baru sekali, dan tombol People menampilkan jumlah yang menunggu.
- Status bicara berasal dari LiveKit, tampil sebagai bar audio/nama pembicara;
  participant yang muted tidak ditandai berbicara.
- Delapan mood memakai ikon, frame kamera dan avatar berbeda. Filmstrip compact
  mempunyai tinggi yang jelas pada semua mode; gallery biasa tidak berpindah urutan
  setiap pembicara berubah, sedangkan speaker/dynamic/multi mengikuti pembicara.

Hasil verifikasi terakhir: **57 tes client dan 45 tes server lulus**, serta build
produksi client berhasil. Build masih mengingatkan ukuran chunk LiveKit di atas 500 kB.

Validasi lokal menggunakan tes otomatis serta browser fixture dengan API route asli,
database dalam memori, dan transport media simulasi. Uji browser mencakup dua tab
whiteboard, move/undo/redo, toast saat People tertutup, dan layout kelima mode dengan
serta tanpa area screen share pada desktop. Pada viewport ponsel 390×844, kelima mode
memuat gallery tanpa scroll halaman. Ini bukan pengukuran ulang kualitas media pada
jaringan internet nyata; uji dua perangkat tetap diperlukan sebelum rilis publik.

Watch Party kini memiliki sinkronisasi playback untuk file video langsung. Pemutaran
tetap bergantung pada akses URL, format yang didukung browser, dan kebijakan autoplay;
peserta mungkin perlu menekan tombol Mulai. Study timer/Pomodoro, catatan terpisah,
dan Mood Manager belum lengkap.

## Game Night

Delapan game native tersedia: Couple Quiz, Truth or Dare, Tic Tac Toe, Would You
Rather, Memory Match, Bingo Kencan, Tebak Emoji, dan Cerita Sambung. Host memilih game dan mengendalikan pause, restart,
serta akhir sesi. Aksi dan skor disinkron lewat LiveKit DataChannel; peserta yang
masuk belakangan meminta snapshot dari host. Kamera peserta tetap terlihat.
Peserta juga dapat mengirim stiker animasi dan tantangan lucu ke peserta lain;
penerima dapat menerima atau melewati tantangan. Interaksi ini hanya tersimpan
selama sesi aktif.
Sesi game berada di memori host; jika host memuat ulang halaman, game aktif perlu
dimulai lagi. Ini adalah permainan santai, bukan sistem anti-cheat untuk hadiah.

Dashboard admin memiliki tab **Katalog game** untuk mengatur status game native
dan mengelola game web, serta tab **Bank soal** untuk membuat, mengedit,
menyembunyikan, dan menghapus konten Couple Quiz, Truth or Dare, dan Would You
Rather. Tombol Generate menyiapkan draf lokal yang harus ditinjau sebelum disimpan.
Perubahan konten tersimpan di Firestore. Bank soal yang aktif ikut dalam snapshot
game agar semua peserta membaca versi yang sama selama sesi itu berlangsung.
Game web hanya menerima URL HTTPS; iframe tetap bergantung pada izin embed dari
situs pemilik game. Entri demo `games.example.com` belum aktif sampai admin
menggantinya dengan URL game sungguhan.
