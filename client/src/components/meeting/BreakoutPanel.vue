<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'
const props=defineProps({room:{type:Object,required:true},isHost:Boolean})
const emit=defineEmits(['move'])
const rooms=ref([]),count=ref(2),busy=ref(false),loading=ref(false)
let disposed=false,timer=null
function credentials(){try{return JSON.parse(sessionStorage.getItem(`meetspace:approval:${props.room.id}`)||'{}')||{}}catch{return {}}}
async function refresh(){
  clearTimeout(timer);loading.value=true
  try{const c=credentials();const response=await api.get(`/rooms/${props.room.id}/breakouts`,{headers:{'x-meetspace-request-id':c.requestId,'x-meetspace-guest-secret':c.guestSecret}});if(!disposed)rooms.value=response.data.data}
  catch(error){if(!disposed)toast.error(error)}finally{loading.value=false;if(!disposed)timer=setTimeout(refresh,10000)}
}
async function create(){if(busy.value)return;busy.value=true;try{await api.post(`/rooms/${props.room.id}/breakouts`,{count:count.value});await refresh();toast.success('Breakout rooms siap dimasuki peserta.')}catch(error){toast.error(error)}finally{busy.value=false}}
async function join(room){if(busy.value)return;busy.value=true;try{const result=await api.post(`/rooms/${props.room.id}/breakouts/${room.id}/join`,credentials());emit('move',result.data.data)}catch(error){toast.error(error)}finally{busy.value=false}}
onMounted(()=>{if(!props.room.parentRoomId)refresh()})
onUnmounted(()=>{disposed=true;clearTimeout(timer)})
</script>
<template><section class="breakout-panel"><h3>▦ Breakout rooms</h3><template v-if="room.parentRoomId"><p>Kamu berada di ruang kelompok.</p><button class="ms-button ms-button-primary" @click="emit('move',{roomId:room.parentRoomId})">← Kembali ke room utama</button></template><template v-else><p>Diskusi dalam kelompok kecil. Peserta memilih ruang sendiri; audio dan chat tiap ruang terpisah.</p><form v-if="isHost && rooms.length<6" @submit.prevent="create"><label for="breakout-count">Jumlah ruang baru</label><div><input id="breakout-count" v-model.number="count" class="ms-input" type="number" min="1" :max="6-rooms.length" required /><button class="ms-button ms-button-accent" :disabled="busy">Buat</button></div></form><div v-for="child in rooms" :key="child.id" class="breakout-room"><strong>{{child.name}}</strong><button :disabled="busy" @click="join(child)">Masuk ↗</button></div><p v-if="!rooms.length">{{loading?'Memuat…':'Host belum membuat ruang kelompok.'}}</p><button class="refresh-link" :disabled="loading" @click="refresh">Refresh daftar ↻</button></template></section></template>
<style scoped>
.breakout-panel{padding:18px}h3{margin-top:0}p{font-size:13px;color:var(--text-secondary);line-height:1.7}form label{font-size:12px;font-weight:900}form>div{display:flex;gap:9px;margin-top:8px}input{min-width:0}.breakout-room{display:grid;gap:10px;padding:16px 0;border-bottom:1px dashed var(--border-color);font-size:13px}.breakout-room button{justify-self:start;background:var(--color-secondary);color:#292e29;border:2px solid var(--border-color);border-radius:9px;padding:7px 12px;font-weight:900}.refresh-link{margin-top:18px;background:none;border:0;color:var(--text-primary);font-size:12px;text-decoration:underline}
</style>
