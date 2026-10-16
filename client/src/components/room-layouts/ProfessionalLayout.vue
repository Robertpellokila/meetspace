<script setup>
import { computed } from 'vue'
import ParticipantGallery from '../meeting/ParticipantGallery.vue'
import ScreenShareStage from '../meeting/ScreenShareStage.vue'
const props=defineProps({participants:{type:Array,default:()=>[]},room:{type:Object,default:null},view:{type:Object,default:()=>({})}})
const emit=defineEmits(['pin'])
const sharer=computed(()=>props.participants.find(p=>p.screenTrack)??null)
</script>
<template><div class="ms-layout ms-professional"><div class="ms-layout-head"><strong>{{view.layout==='speaker'?'◉ SPEAKER VIEW':view.layout==='multi'?'◉ MULTI-SPEAKER':view.layout==='dynamic'?'▦ DYNAMIC GALLERY':view.layout==='immersive'?'☕ LOUNGE VIEW':'▦ GALLERY MEETING'}}</strong><span>{{participants.length}} peserta</span></div>
  <ScreenShareStage v-if="sharer && view.content!=='cameras'" :sharer="sharer"/>
  <ParticipantGallery :compact="!!sharer && view.content!=='cameras'" :participants="participants" :view="view" pinnable :pinned-id="view.pinnedId" @pin="emit('pin',$event)" />
</div></template>
<style scoped>
.ms-professional{display:flex;flex-direction:column;gap:8px;overflow:hidden}.ms-layout-head{flex:none;display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:900;color:var(--text-secondary)}
</style>
