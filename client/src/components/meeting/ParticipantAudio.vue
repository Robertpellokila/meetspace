<script setup>
import { ref, watch } from 'vue'
const props=defineProps({participant:{type:Object,required:true}})
const mic=ref(null),screen=ref(null)
for(const [source,element] of [['audioTrack',mic],['screenAudioTrack',screen]]){
  watch(()=>[props.participant[source],element.value],([track,el],_,onCleanup)=>{
    if(!track || !el || props.participant.isLocal)return
    track.attach(el);onCleanup(()=>track.detach(el))
  },{immediate:true,flush:'post'})
}
</script>
<template><audio ref="mic" autoplay /><audio ref="screen" autoplay /></template>
