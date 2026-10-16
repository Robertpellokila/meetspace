<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { currentUser, logout } from '../../services/auth.js'
import { account } from '../../services/account.js'
import { useMeetingStore } from '../../stores/meeting.js'
import { toast } from '../../services/toast.js'
const router=useRouter(),meeting=useMeetingStore(),busy=ref(false),menu=ref(null)
async function signOut(){
  if(busy.value)return
  busy.value=true
  try{
    const {disconnectFromMeeting}=await import('../../services/livekit.js')
    await disconnectFromMeeting()
    await logout()
    meeting.reset()
    Object.keys(sessionStorage).filter(key=>key.startsWith('meetspace:approval:')||key.startsWith('meetspace:join:')).forEach(key=>sessionStorage.removeItem(key))
    await router.replace('/')
    toast.success('Kamu sudah keluar. Sampai jumpa di ruang berikutnya!')
  }catch(error){toast.error(error)}finally{busy.value=false}
}
function close(){if(menu.value)menu.value.open=false}
</script>
<template>
  <details v-if="currentUser" ref="menu" class="account-menu" @keydown.esc="close">
    <summary aria-label="Menu akun"><span>{{(currentUser.displayName || currentUser.email || 'M')[0].toUpperCase()}}</span><b>Akun</b><small>⌄</small></summary>
    <div class="account-dropdown"><strong>{{currentUser.displayName || 'Anggota MeetSpace'}}</strong><small>{{currentUser.email}}</small>
      <RouterLink to="/account" @click="close">♧ Akun & akses</RouterLink>
      <RouterLink v-if="account?.role==='admin'" to="/admin" @click="close">▦ Dashboard admin</RouterLink>
      <button :disabled="busy" @click="signOut">↗ {{busy?'Keluar…':'Logout'}}</button>
    </div>
  </details>
  <RouterLink v-else to="/login" class="ms-button ms-button-outline">Masuk ↗</RouterLink>
</template>
<style scoped>
.account-menu{position:relative;color:var(--text-primary);font:14px var(--font-body)}summary{display:flex;align-items:center;gap:9px;cursor:pointer;border:2px solid var(--border-color);border-radius:12px;padding:6px 11px;background:var(--bg-surface);list-style:none}summary::-webkit-details-marker{display:none}summary span{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:var(--color-primary);color:#182a25;font-weight:900}.account-dropdown{position:absolute;right:0;top:calc(100% + 10px);z-index:200;width:min(280px,85vw);display:grid;gap:8px;padding:18px;background:var(--bg-surface);border:2px solid var(--border-color);border-radius:15px;box-shadow:var(--shadow-card);text-align:left}.account-dropdown small{color:var(--text-secondary);overflow-wrap:anywhere;margin-bottom:9px}.account-dropdown a,.account-dropdown button{padding:10px;border:0;border-radius:8px;text-align:left;background:var(--bg-elevated);color:var(--text-primary);font-weight:800}.account-dropdown button{color:var(--color-danger)}@media(max-width:480px){summary b{display:none}}
</style>
