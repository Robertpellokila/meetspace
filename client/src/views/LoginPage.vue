<script setup>
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { login,register } from '../services/auth'
import { toast } from '../services/toast.js'
const router=useRouter(), route=useRoute()
const email=ref(''), password=ref(''), loading=ref(false), registering=ref(route.query.register==='1')
const passwordVisible=ref(false)
watch(registering,()=>{passwordVisible.value=false})
async function submit(){
  if(loading.value)return
  loading.value=true
  try {
    if(registering.value) await register(email.value,password.value)
    else await login(email.value,password.value)
    const next=typeof route.query.redirect==='string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//') ? route.query.redirect : '/account'
    await router.replace(next)
  }catch(e){toast.error(e)}
  finally{loading.value=false}
}
</script>
<template>
  <main class="auth-wrap"><form class="auth-card" @submit.prevent="submit">
    <RouterLink to="/" class="brand">✦ MeetSpace</RouterLink>
    <span class="label">THE RETRO CLUB</span>
    <h1>{{registering?'Join the club!':'Welcome back!'}}</h1>
    <p>Semua orang bisa daftar. Akses membuat room diberikan oleh admin.</p>
    <label>Email<input v-model.trim="email" type="email" required autocomplete="email" /></label>
    <div class="password-field"><label for="account-password">Password</label><div class="password-control"><input id="account-password" v-model="password" :type="passwordVisible?'text':'password'" minlength="6" required :autocomplete="registering?'new-password':'current-password'" /><button class="password-toggle" type="button" :aria-label="passwordVisible?'Sembunyikan password':'Tampilkan password'" :aria-pressed="passwordVisible" aria-controls="account-password" @click="passwordVisible=!passwordVisible">{{passwordVisible?'Sembunyikan':'Lihat'}}</button></div></div>
    
    <button class="action" :disabled="loading">{{loading?'Please wait...':registering?'Create account':'Log in'}}</button>
    <button class="switch" type="button" :disabled="loading" @click="registering=!registering">{{registering?'Already have an account? Log in':'New here? Create an account'}}</button>
  </form></main>
</template>
<style scoped>
.auth-wrap{min-height:100dvh;display:grid;place-items:center;padding:20px;background:var(--bg-app,#F5EFE3);background-image:radial-gradient(var(--border-color,#D8C9A8) 1px,transparent 1px);background-size:24px 24px;color:var(--text-primary,#303826)}
.auth-card{width:min(100%,450px);display:grid;gap:15px;padding:34px;background:var(--bg-surface,#FFFCF7);border:3px solid #4F5B2A;border-radius:22px;box-shadow:8px 9px 0 #B8892D}.brand{font-size:23px;font-weight:900;color:inherit;text-decoration:none}.label{font-size:11px;color:#B8892D;font-weight:900;letter-spacing:2px}h1{font-size:35px;margin:0}p{margin:0 0 9px;color:var(--text-secondary)}label{display:grid;gap:8px;font-size:13px;font-weight:800}input{padding:14px;border:2px solid #4F5B2A;border-radius:11px;background:var(--bg-app);color:var(--text-primary)}button{cursor:pointer;padding:13px;border-radius:11px;font-weight:900}.action{border:2px solid #4F5B2A;color:#F5EFE3;background:#4F5B2A}.switch{background:transparent;border:none;color:var(--text-primary)}.error{color:var(--color-danger,#B64D4D)}
.password-field{display:grid;gap:8px}.password-control{position:relative}.password-control input{width:100%;padding-right:112px}.password-toggle{position:absolute;right:7px;top:50%;transform:translateY(-50%);padding:8px;border:1px solid #4f5b2a;background:var(--bg-elevated);color:var(--text-primary);font-size:11px}
</style>
