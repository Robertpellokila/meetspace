<script setup>
import { computed } from 'vue'
import ScreenShareStage from '../meeting/ScreenShareStage.vue'
import ParticipantGallery from '../meeting/ParticipantGallery.vue';const props=defineProps({view:{type:Object,default:()=>({})},participants:{type:Array,default:()=>[]},room:{type:Object,default:null}});const emit=defineEmits(['pin'])
const sharer=computed(()=>props.participants.find(p=>p.screenTrack))
</script>
<template><div class="ms-layout ms-hangout"><h3>☕ HANGOUT CLUB</h3><p>Relax, talk, and enjoy the moment.</p><ScreenShareStage v-if="sharer" :sharer="sharer"/><ParticipantGallery :compact="!!sharer" :variant="view.layout || 'gallery'" :participants="participants" :view="view" pinnable :pinned-id="view.pinnedId" @pin="emit('pin',$event)" /></div></template>
<style scoped>.ms-hangout{display:flex;flex-direction:column;gap:9px}.ms-hangout h3,.ms-hangout p{margin:0}.ms-hangout p{color:var(--text-secondary)}.ms-hangout :deep(.ms-gallery){flex:1}</style>

<style scoped>.ms-layout{min-height:0;overflow:hidden;gap:6px}.ms-layout-head{flex:none;font-size:11px}h3{font-size:13px}p{font-size:12px}</style>
