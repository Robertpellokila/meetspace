<script setup>
import ParticipantTile from './ParticipantTile.vue'
import ShareAnnotation from './ShareAnnotation.vue'
defineProps({ sharer: { type: Object, default: null }, livekitRoom: { type: Object, default: null }, allowAnnotation: Boolean })
</script>
<template>
  <section class="ms-share-stage">
    <div class="ms-stage-label">▣ {{ sharer?.name || 'Participant' }} is sharing</div>
    <div class="ms-share-video">
      <ParticipantTile v-if="sharer" :key="sharer.id + '-screen'" :name="sharer.name + ' · Screen'" :video-track="sharer.screenTrack" :contain="true" />
      <ShareAnnotation v-if="allowAnnotation && livekitRoom && sharer" :key="sharer.id" :room="livekitRoom" :sharer-id="sharer.id" />
    </div>
  </section>
</template>
<style scoped>
.ms-share-stage { min-width:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:8px; }
.ms-stage-label { font-size:12px; font-weight:900; color:var(--text-secondary); }
.ms-share-video { position:relative; min-width:0; min-height:0; }
.ms-share-video :deep(.ms-tile) { aspect-ratio:16/9; height:auto; max-height: min(54vh,680px); }
</style>

<style scoped>.ms-share-stage{flex:1;min-height:0;overflow:hidden}.ms-share-video :deep(.ms-tile){aspect-ratio:unset;height:100%;max-height:100%}</style>
