<script setup>
import { computed } from 'vue'
import ParticipantGallery from '../meeting/ParticipantGallery.vue'
import ScreenShareStage from '../meeting/ScreenShareStage.vue'
import Whiteboard from '../study/Whiteboard.vue'
const props=defineProps({participants:{type:Array,default:()=>[]},room:{type:Object,default:null},view:{type:Object,default:()=>({})},livekitRoom:{type:Object,default:null},roomToken:{type:String,default:''},refreshRoomToken:{type:Function,default:null}})
const emit=defineEmits(['pin'])
const sharer=computed(()=>props.participants.find(p=>p.screenTrack)??null)
</script>
<template><div class="ms-layout ms-professional"><div class="ms-layout-head"><strong>{{view.layout==='speaker'?'◉ SPEAKER VIEW':view.layout==='multi'?'◉ MULTI-SPEAKER':view.layout==='dynamic'?'▦ DYNAMIC GALLERY':view.layout==='immersive'?'☕ LOUNGE VIEW':'▦ GALLERY MEETING'}}</strong><span>{{participants.length}} peserta</span></div>
  <div v-if="view.content==='whiteboard'" class="professional-board"><Whiteboard v-if="livekitRoom" :room="livekitRoom" :room-token="roomToken" :room-id="room?.id" :refresh-token="refreshRoomToken" /></div>
  <ScreenShareStage v-else-if="sharer && view.content!=='cameras'" :sharer="sharer" :livekit-room="livekitRoom" allow-annotation />
  <ParticipantGallery :compact="view.content==='whiteboard' || (!!sharer && view.content!=='cameras')" :participants="participants" :view="view" pinnable :pinned-id="view.pinnedId" @pin="emit('pin',$event)" />
</div></template>
<style scoped>
.ms-professional{display:flex;flex-direction:column;gap:8px;overflow:hidden}.ms-layout-head{flex:none;display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:900;color:var(--text-secondary)}
.professional-board{flex:1;min-height:0;overflow:hidden}.professional-board :deep(.ms-board){height:100%}
</style>
