<script setup>
import { useErrorToast } from '../../composables/useErrorToast.js'
import { ref,onMounted,onUnmounted } from 'vue'
import api from '../../services/api'
const props=defineProps({roomId:{type:String,required:true},participantName:{type:String,required:true},disabled:Boolean,passwordProtected:Boolean})
const emit=defineEmits(['approved'])
const status=ref('idle'),error=ref('')
const password=ref(''),showPassword=ref(false)
let timer=null
let disposed=false
let approvedCredentials=null
const controller=new AbortController()
const storageKey=`meetspace:approval:${props.roomId}`
async function checkStatus(credentials,autoJoin=true){
  try {
    const {requestId,guestSecret}=credentials
    const result=await api.get(`/rooms/${encodeURIComponent(props.roomId)}/join-requests/${encodeURIComponent(requestId)}/status`,{
      headers:{'x-meetspace-guest-secret':guestSecret},signal:controller.signal,
    })
    if(disposed) return
    status.value=result.data.data.status
    if(status.value==='approved') {
      approvedCredentials=credentials
      if(autoJoin) emit('approved',credentials)
    }
    else if(status.value==='pending') timer=setTimeout(()=>checkStatus(credentials),3000)
    else sessionStorage.removeItem(storageKey)
  }catch(e){
    if(disposed) return
    status.value='error'
    error.value=e
    if([403,404,410].includes(e.response?.status)) sessionStorage.removeItem(storageKey)
  }
}
async function requestAdmission(){
  if(props.disabled || ['requesting','pending'].includes(status.value)) return
  if(status.value==='approved') { emit('approved',approvedCredentials); return }
  error.value=''
  status.value='requesting'
  try{
    const saved=sessionStorage.getItem(storageKey)
    if(saved){
      try {
        const credentials=JSON.parse(saved)
        if(credentials?.requestId && credentials?.guestSecret){await checkStatus(credentials);return}
      } catch { /* Discard malformed local preferences. */ }
      sessionStorage.removeItem(storageKey)
    }
    const result=await api.post(`/rooms/${encodeURIComponent(props.roomId)}/join-requests`,{participantName:props.participantName,...(props.passwordProtected?{password:password.value}:{})},{signal:controller.signal})
    if(disposed) return
    password.value=''
    const {requestId,guestSecret}=result.data.data
    const credentials={requestId,guestSecret,participantName:props.participantName.trim()}
    sessionStorage.setItem(storageKey,JSON.stringify(credentials))
    status.value='pending'
    await checkStatus(credentials)
  }catch(e){if(!disposed){status.value='error';error.value=e}}
}
onMounted(async()=>{
  try {
    const credentials=JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    if(credentials?.requestId && credentials?.guestSecret){status.value='pending';await checkStatus(credentials,false)}
  } catch { sessionStorage.removeItem(storageKey) }
})
onUnmounted(()=>{disposed=true;clearTimeout(timer);controller.abort()})
useErrorToast(error)
</script>
<template><section class="waiting"><h3>✦ Host approval required</h3>
<div v-if="passwordProtected && !['pending','approved','requesting'].includes(status)" class="room-password"><label for="join-room-password">Password room</label><div class="password-field"><input id="join-room-password" v-model="password" class="ms-input" :type="showPassword?'text':'password'" autocomplete="off" maxlength="128" @keydown.enter.prevent="requestAdmission" /><button type="button" :aria-pressed="showPassword" @click="showPassword=!showPassword">{{showPassword?'Sembunyikan':'Tampilkan'}}</button></div><small>Masukkan password dari host untuk meminta bergabung.</small></div>
<p v-if="status==='pending'">Waiting for the host to admit you…</p><p v-else-if="status==='rejected'">The host declined your request.</p><p v-else-if="status==='revoked'">The host removed your access. Request approval again to rejoin.</p><p v-else-if="status==='approved'">Approved! Your space is ready.</p><p v-else>You're not connected yet. Ask to join the room.</p>
<button v-if="status!=='pending'" type="button" :disabled="disabled || status==='requesting'" @click="requestAdmission">{{status==='approved'?'Join the Space':status==='requesting'?'Sending request…':status==='error'?'Retry':'Request to Join'}}</button></section></template>
<style scoped>.waiting{padding:22px;border:3px solid #4F5B2A;border-radius:18px;background:var(--bg-surface,#FFFCF7);color:var(--text-primary,#303826);box-shadow:4px 5px 0 #B8892D}button{padding:12px 20px;border:2px solid #4F5B2A;border-radius:12px;background:#4F5B2A;color:#F5EFE3;font-weight:900;cursor:pointer}</style>
