<script setup>
import { computed } from 'vue'
import ParticipantGallery from '../meeting/ParticipantGallery.vue'
import ScreenShareStage from '../meeting/ScreenShareStage.vue'
import Whiteboard from '../study/Whiteboard.vue'
const props=defineProps({participants:{type:Array,default:()=>[]},room:{type:Object,default:null},view:{type:Object,default:()=>({})},livekitRoom:{type:Object,default:null},roomToken:{type:String,default:''},refreshRoomToken:{type:Function,default:null}})
const emit=defineEmits(['pin'])
const sharer=computed(()=>props.participants.find(p=>p.screenTrack)??null)
const showShare=computed(()=>Boolean(sharer.value && props.view.content!=='cameras' && props.view.content!=='whiteboard'))
const shareLayout=computed(()=>['gallery','speaker','dynamic','multi','immersive'].includes(props.view.layout)?props.view.layout:'gallery')
const galleryVariant=computed(()=>showShare.value && ['dynamic','immersive'].includes(shareLayout.value)?'filmstrip':shareLayout.value)
</script>
<template><div class="ms-layout ms-professional"><div class="ms-layout-head"><strong>{{view.layout==='speaker'?'◉ SPEAKER VIEW':view.layout==='multi'?'◉ MULTI-SPEAKER':view.layout==='dynamic'?'▦ DYNAMIC GALLERY':view.layout==='immersive'?'☕ LOUNGE VIEW':'▦ GALLERY MEETING'}}</strong><span>{{participants.length}} peserta</span></div>
  <div v-if="view.content==='whiteboard'" class="professional-content board-content">
    <div class="professional-board"><Whiteboard v-if="livekitRoom" :room="livekitRoom" :room-token="roomToken" :room-id="room?.id" :refresh-token="refreshRoomToken" /></div>
    <ParticipantGallery compact variant="filmstrip" :participants="participants" :view="view" pinnable :pinned-id="view.pinnedId" @pin="emit('pin',$event)" />
  </div>
  <div v-else class="professional-content" :class="showShare ? `share-layout-${shareLayout}` : 'cameras-only'">
    <ScreenShareStage v-if="showShare" :sharer="sharer" :livekit-room="livekitRoom" allow-annotation />
    <ParticipantGallery :compact="showShare && ['dynamic','immersive'].includes(shareLayout)" :variant="galleryVariant" :participants="participants" :view="view" pinnable :pinned-id="view.pinnedId" @pin="emit('pin',$event)" />
  </div>
</div></template>
<style scoped>
.ms-professional{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}.ms-layout-head{flex:none;display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:900;color:var(--text-secondary)}
.professional-content{display:flex;flex:1;min-height:0;min-width:0;gap:8px;overflow:hidden}.professional-content.cameras-only,.professional-content.board-content{flex-direction:column}
.professional-board{flex:1;min-height:0;overflow:hidden}.professional-board :deep(.ms-board){height:100%}
.professional-content :deep(.ms-share-stage),.professional-content :deep(.ms-gallery){min-width:0;min-height:0}
.share-layout-gallery{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.share-layout-speaker{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(195px,.8fr)}
.share-layout-multi{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,1fr)}
.share-layout-dynamic,.share-layout-immersive{flex-direction:column}
.share-layout-dynamic :deep(.ms-gallery){flex:0 0 clamp(105px,22%,200px)!important;max-height:none!important}
.share-layout-immersive{position:relative;padding:8px;border:2px solid var(--ms-line);border-radius:24px;background:color-mix(in srgb,var(--mood-accent,#4f5b2a) 20%,var(--bg-surface))}
.share-layout-immersive :deep(.ms-share-stage){flex:1}
.share-layout-immersive :deep(.ms-gallery){flex:0 0 clamp(95px,19%,165px)!important;max-height:none!important}
.share-layout-immersive :deep(.ms-tile){border-radius:22px}
@media(max-width:900px){.share-layout-gallery,.share-layout-speaker,.share-layout-multi{display:flex;flex-direction:column}.share-layout-gallery :deep(.ms-share-stage),.share-layout-speaker :deep(.ms-share-stage),.share-layout-multi :deep(.ms-share-stage){flex:1.3}.share-layout-gallery :deep(.ms-gallery),.share-layout-speaker :deep(.ms-gallery),.share-layout-multi :deep(.ms-gallery){flex:1}}
</style>
