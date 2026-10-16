<script setup>
import { onMounted } from 'vue'
import SiteHeader from '../components/common/SiteHeader.vue'
import JoinSpaceForm from '../components/common/JoinSpaceForm.vue'
import { account, accountLoading, loadAccount } from '../services/account.js'
import { currentUser } from '../services/auth.js'
import { toast } from '../services/toast.js'
async function refresh(){try{await loadAccount(true)}catch(error){toast.error(error)}}
onMounted(refresh)
</script>
<template><SiteHeader /><main class="account-page"><span class="ms-badge">KARTU ANGGOTA</span><h1>Selamat datang di klub.</h1><p class="ms-muted">{{currentUser?.email}}</p>
  <section class="membership ms-card"><div class="membership-mark" aria-hidden="true">✦</div><div><span class="status-label">{{accountLoading?'Memeriksa akses…':!account?'Status belum tersedia':account.access==='full'?'AKSES PENUH AKTIF':'AKSES PESERTA AKTIF'}}</span><h2>{{!account?'Aksesmu belum dapat diperiksa.':account.access==='full'?'Ruang berikutnya, milikmu.':'Kamu sudah bisa bergabung.'}}</h2><p>{{!account?'Coba periksa akses lagi. Jika tetap gagal, hubungi admin.':account.access==='full'?'Buat room, undang teman, dan gunakan tools host yang tersedia.':'Gunakan undangan untuk mengikuti meeting. Untuk membuat room sendiri, admin perlu mengaktifkan akses penuh akunmu.'}}</p><div class="account-actions"><RouterLink v-if="account?.access==='full'" to="/create-room" class="ms-button ms-button-accent">Buat room ↗</RouterLink><button v-else class="ms-button ms-button-primary" :disabled="accountLoading" @click="refresh">{{accountLoading?'Memeriksa…':'Periksa akses lagi ↻'}}</button><RouterLink v-if="account?.role==='admin'" to="/admin" class="ms-button ms-button-outline">Dashboard admin ▦</RouterLink></div></div></section>
  <section class="account-bottom"><div class="ms-card join-card"><JoinSpaceForm /></div><div class="access-note"><h3>Aksesmu, jelas dari awal.</h3><p>Pendaftaran terbuka untuk semua orang. Admin melihat akun yang baru terdaftar dan dapat memberikan akses penuh.</p><p>Jika akses host dicabut, pembuatan room dan sesi host baru akan ditolak. Sesi yang sedang berjalan tidak otomatis terputus.</p></div></section>
</main></template>
<style scoped>
.account-page{width:min(1040px,calc(100% - 40px));margin:55px auto 80px}h1{font-size:clamp(36px,5vw,55px);margin:20px 0 10px}.membership{display:grid;grid-template-columns:130px 1fr;gap:35px;padding:42px;margin-top:30px}.membership-mark{width:120px;height:120px;border:2px solid var(--border-color);border-radius:50%;background:var(--color-secondary);color:#292e29;display:grid;place-items:center;font-size:75px;box-shadow:5px 5px 0 var(--shadow-color)}.status-label{font-size:11px;font-weight:1000;letter-spacing:2px;color:var(--text-secondary)}h2{font-size:31px;margin:12px 0}.membership p,.access-note p{color:var(--text-secondary);font-size:15px;line-height:1.8}.account-actions{display:flex;gap:15px;flex-wrap:wrap;margin-top:25px}.account-bottom{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}.join-card{padding:30px;align-self:start}.access-note h3{margin-top:0;font-size:25px}@media(max-width:700px){.membership,.account-bottom{grid-template-columns:1fr}.membership{padding:28px;gap:25px}.membership-mark{width:75px;height:75px;font-size:45px}.account-page{margin-top:35px}}
</style>
