<script setup>
import { computed, toRef, watch } from 'vue'
import ScreenShareStage from '../meeting/ScreenShareStage.vue'
import MoviePlayer from '../watch-party/MoviePlayer.vue'
import ParticipantGallery from '../meeting/ParticipantGallery.vue'
import { useGameSync } from '../../composables/useGameSync.js'
import { toast } from '../../services/toast.js'

const props = defineProps({
  view: { type: Object, default: () => ({}) },
  participants: { type: Array, default: () => [] },
  room: { type: Object, default: null },
  livekitRoom: { type: Object, default: null },
  hostIdentity: { type: String, default: '' },
})
const emit = defineEmits(['pin'])
const sharer = computed(() => props.participants.find((participant) => participant.screenTrack))
const sync = useGameSync({ room: toRef(props, 'livekitRoom'), hostIdentity: toRef(props, 'hostIdentity') })

watch([sync.connected, sync.isHost], () => {
  if (sync.connected.value && sync.isHost.value && !sync.session.value) {
    void sync.startGame('watch-party', sync.participants.value)
  }
}, { immediate: true })
watch(sync.lastError, (message) => { if (message) toast.error(message) })

async function updatePlayback(patch) {
  if (!sync.isHost.value || !sync.connected.value || !sync.session.value) return
  await sync.updateHostState({ ...sync.gameState.value, ...patch, updatedAt: Date.now() })
}
</script>

<template>
  <div class="ms-layout ms-watch">
    <div class="ms-layout-head"><span>♥ THE RETRO CINEMA</span><span>WATCH PARTY · {{ sync.isHost.value ? 'HOST' : 'GUEST' }}</span></div>
    <div v-if="sync.lastError.value" class="watch-notice" role="alert">{{ sync.lastError.value }}</div>
    <div class="watch-stage">
      <ScreenShareStage v-if="sharer" :sharer="sharer" />
      <MoviePlayer
        v-show="!sharer"
        :state="sync.gameState.value"
        :is-host="sync.isHost.value"
        :connected="sync.connected.value"
        :clock-offset-ms="sync.clockOffsetMs.value"
        :suspended="!!sharer"
        @update="updatePlayback"
      />
    </div>
    <ParticipantGallery
      :participants="participants"
      :view="view"
      :variant="view.layout || 'gallery'"
      pinnable
      :pinned-id="view.pinnedId"
      @pin="emit('pin', $event)"
    />
  </div>
</template>

<style scoped>
.ms-watch { display:flex; flex-direction:column; gap:6px; min-height:0; overflow:hidden }
.ms-layout-head { display:flex; justify-content:space-between; gap:10px; flex:none; font-size:11px; font-weight:1000; color:var(--text-secondary) }
.watch-stage { display:flex; flex:1; min-height:0; min-width:0; overflow:hidden }
.watch-stage > * { flex:1; min-height:0; min-width:0 }
.ms-watch :deep(.ms-gallery) { flex:0 0 clamp(85px,17dvh,145px); max-height:24%; min-height:0 }
.watch-notice { flex:none; padding:6px 9px; border:1px solid var(--ms-line); border-radius:8px; background:var(--bg-elevated); font-size:11px }
</style>
