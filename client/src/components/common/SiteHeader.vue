<script setup>
import AccountControls from './AccountControls.vue'
import { useAppearanceStore } from '../../stores/appearance.js'
const appearance=useAppearanceStore()
defineProps({home:Boolean})
</script>
<template>
  <header class="site-header"><RouterLink to="/" class="site-brand">✦ MeetSpace<span>®</span></RouterLink>
    <nav v-if="home" aria-label="Navigasi utama"><a href="#experiences">Pilihan ruang</a><a href="#how-it-works">Cara bergabung</a><a href="#questions">Tanya jawab</a></nav>
    <div class="header-actions"><button class="appearance-button" :aria-label="appearance.isDark?'Gunakan tema terang':'Gunakan tema gelap'" @click="appearance.toggleTheme()">{{appearance.isDark?'☀':'☾'}}</button><AccountControls /></div>
  </header>
</template>
<style scoped>
.site-header{width:min(1240px,calc(100% - 48px));margin:auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:25px 0;border-bottom:2px solid var(--border-color)}.site-brand{font-size:26px;font-weight:1000;letter-spacing:-1px;white-space:nowrap}.site-brand span{font-size:11px;vertical-align:top;margin-left:4px}nav{display:flex;gap:28px;font-size:13px;font-weight:900}.header-actions{display:flex;align-items:center;gap:12px}.appearance-button{background:none;border:0;font-size:25px;color:var(--text-primary);padding:4px}@media(max-width:950px){nav{display:none}}@media(max-width:500px){.site-header{width:calc(100% - 32px);padding:18px 0;gap:10px}.site-brand{font-size:23px}.header-actions{gap:7px}}
</style>
