<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { directVideoUrl, sharedVideoTime } from '../../config/watchPartyMedia.js'
import { toast } from '../../services/toast.js'

const props = defineProps({
  state: { type: Object, default: () => ({}) },
  isHost: Boolean,
  connected: Boolean,
  clockOffsetMs: { type: Number, default: 0 },
  suspended: Boolean,
})
const emit = defineEmits(['update'])
const source = ref('')
const video = ref(null)
const error = ref('')
const needsGesture = ref(false)
const mediaUrl = computed(() => directVideoUrl(props.state?.url))
let lastBroadcast = 0
let syncTimer

function targetTime() { return sharedVideoTime(props.state, Date.now() + props.clockOffsetMs) }
async function followHost() {
  if (props.isHost || !video.value || !mediaUrl.value) return
  const player = video.value
  const target = targetTime()
  if (player.readyState > 0 && Math.abs(player.currentTime - target) > 1.2) {
    player.currentTime = Number.isFinite(player.duration) ? Math.min(target, Math.max(0, player.duration - 0.1)) : target
  }
  if (props.state?.playing && !props.suspended && player.paused) {
    try { await player.play(); needsGesture.value = false }
    catch { needsGesture.value = true }
  } else if ((!props.state?.playing || props.suspended) && !player.paused) player.pause()
}
function updateHost(force = false) {
  if (!props.isHost || !video.value || !props.connected) return
  if (!force && Date.now() - lastBroadcast < 8000) return
  lastBroadcast = Date.now()
  emit('update', { position: video.value.currentTime || 0, playing: !video.value.paused })
}
function load() {
  const url = directVideoUrl(source.value)
  if (!url) { error.value = 'Gunakan tautan HTTPS langsung ke file .mp4, .webm, atau .ogv.'; toast.error(error.value); return }
  error.value = ''
  emit('update', { url, position: 0, playing: false })
}
async function enablePlayback() {
  if (!video.value) return
  try { await video.value.play(); needsGesture.value = false }
  catch { error.value = 'Browser tidak dapat memutar video ini. Periksa format dan izin sumber video.'; toast.error(error.value) }
}
function mediaError() { error.value = 'Video tidak dapat dimuat. Periksa tautan, izin sumber, dan format file.'; toast.error(error.value) }

watch(mediaUrl, async (url) => {
  error.value = ''
  if (props.isHost) source.value = url
  await nextTick()
  if (!props.isHost && url) void followHost()
})
watch(() => [props.state?.position, props.state?.playing, props.state?.updatedAt, props.suspended], () => { void followHost() })
watch(() => props.isHost, (isHost) => { if (isHost) source.value = mediaUrl.value })
syncTimer = setInterval(() => { if (!props.isHost && props.state?.playing) void followHost() }, 3000)
onBeforeUnmount(() => clearInterval(syncTimer))
</script>

<template>
  <section class="ms-movie-player" aria-label="Pemutar Watch Party">
    <div class="ms-player-screen">
      <video v-if="mediaUrl" ref="video" :key="mediaUrl" :src="mediaUrl" :controls="isHost" playsinline preload="metadata"
        @loadedmetadata="followHost" @play="updateHost(true)" @pause="updateHost(true)" @seeked="updateHost(true)" @timeupdate="updateHost(false)" @error="mediaError" />
      <div v-else class="ms-movie-placeholder"><span>▶</span><h3>Movie Night</h3><p>{{ isHost ? 'Tempel tautan langsung ke video milikmu untuk ditonton bersama.' : 'Host belum memilih video. Kamera dan obrolan tetap aktif.' }}</p></div>
      <button v-if="needsGesture && !isHost && !suspended" class="enable-play" @click="enablePlayback">▶ Mulai pemutaran</button>
    </div>
    <form v-if="isHost" class="ms-player-form" @submit.prevent="load"><input v-model="source" type="url" placeholder="https://example.com/video.mp4" aria-label="Tautan langsung video" /><button :disabled="!connected || !source.trim()">Muat video</button></form>
    <p v-if="error" class="ms-player-error" role="alert">{{ error }}</p>
    <small v-else>{{ isHost ? 'Kontrol play, pause, dan seek dibagikan ke peserta.' : 'Pemutaran mengikuti host. Klik Mulai jika browser memblokir autoplay.' }}</small>
  </section>
</template>

<style scoped>
.ms-movie-player{display:flex;flex-direction:column;gap:5px;flex:1;min-height:0;min-width:0;overflow:hidden}
.ms-player-screen{position:relative;display:grid;place-items:center;flex:1;min-height:0;min-width:0;border:3px solid var(--ms-line);border-radius:17px;overflow:hidden;background:#202721;color:#f5efe3}
.ms-player-screen video{width:100%;height:100%;min-height:0;object-fit:contain}
.ms-movie-placeholder{text-align:center;padding:12px}.ms-movie-placeholder span{font-size:38px;color:#b8892d}.ms-movie-placeholder h3{margin:5px}.ms-movie-placeholder p{font-size:12px;max-width:350px}
.ms-player-form{display:flex;gap:8px;flex:none}.ms-player-form input{flex:1;min-width:0;border:2px solid var(--ms-line);border-radius:9px;padding:6px 9px;background:var(--bg-surface);color:var(--text-primary)}.ms-player-form button,.enable-play{background:#d8c9a8;color:#303826;border:2px solid var(--ms-line);border-radius:9px;padding:6px 10px;cursor:pointer;font-weight:900}.enable-play{position:absolute;inset:auto auto 20px;box-shadow:3px 3px 0 var(--ms-line)}.ms-movie-player small,.ms-player-error{font-size:11px;color:var(--text-secondary);margin:0}.ms-player-error{color:var(--color-danger)}
</style>
