<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RoomEvent } from 'livekit-client'
import { toast } from '../../services/toast.js'

const props = defineProps({ room: { type: Object, required: true }, sharerId: { type: String, required: true } })
const strokes = ref([]), active = ref(null), drawing = ref(false), color = ref('#ffc94d')
const overlay = ref(null), frame = ref({ left: '0px', top: '0px', width: '100%', height: '100%' })
let observer, video
let lastSnapshotAt = 0
const canDraw = computed(() => props.room.localParticipant.identity === props.sharerId)
const encoder = new TextEncoder(), decoder = new TextDecoder()
const path = (points) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ')
const validStroke = (stroke) => stroke && ['#ffc94d','#fa6781','#59b292'].includes(stroke.color) && Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= 100 && stroke.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isInteger(value) && value >= 0 && value <= 1000))
function point(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  return [Math.round((event.clientX - rect.left) / rect.width * 1000), Math.round((event.clientY - rect.top) / rect.height * 1000)].map((value) => Math.max(0, Math.min(1000, value)))
}
async function send(action, payload = {}) {
  try { await props.room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'meetspace.annotation', action, sharerId: props.sharerId, ...payload })), { reliable: true }) }
  catch (error) { toast.error(error) }
}
function onData(raw, sender) {
  try {
    if (raw.byteLength > 16000) return
    const message = JSON.parse(decoder.decode(raw))
    if (message.type !== 'meetspace.annotation' || message.sharerId !== props.sharerId) return
    if (message.action === 'request' && canDraw.value && Date.now() - lastSnapshotAt > 1000) {
      lastSnapshotAt = Date.now()
      void send('snapshot', { strokes: strokes.value.slice(-12) })
      return
    }
    if (sender?.identity !== props.sharerId) return
    if (message.action === 'clear') strokes.value = []
    if (message.action === 'snapshot' && Array.isArray(message.strokes) && !canDraw.value) strokes.value = message.strokes.slice(-12).filter(validStroke)
    if (message.action === 'stroke' && validStroke(message.stroke)) strokes.value = [...strokes.value.slice(-19), message.stroke]
  } catch { /* unrelated or malformed data */ }
}
function begin(event) {
  if (!canDraw.value || !drawing.value) return
  event.currentTarget.setPointerCapture(event.pointerId)
  active.value = { color: color.value, points: [point(event)] }
}
function move(event) {
  if (!active.value) return
  const points = active.value.points
  if (points.length < 100) active.value = { ...active.value, points: [...points, point(event)] }
}
function finish() {
  if (!active.value) return
  const stroke = active.value
  active.value = null
  strokes.value = [...strokes.value.slice(-19), stroke]
  void send('stroke', { stroke })
}
function clear() { strokes.value = []; void send('clear') }
function fitVideo() {
  const container = overlay.value?.parentElement
  if (!container || !video?.videoWidth || !video?.videoHeight) return
  const width = container.clientWidth, height = container.clientHeight
  const aspect = video.videoWidth / video.videoHeight
  const contentWidth = Math.min(width, height * aspect)
  const contentHeight = Math.min(height, width / aspect)
  frame.value = { left: `${(width - contentWidth) / 2}px`, top: `${(height - contentHeight) / 2}px`, width: `${contentWidth}px`, height: `${contentHeight}px` }
}
onMounted(() => {
  props.room.on(RoomEvent.DataReceived, onData)
  video = overlay.value?.parentElement?.querySelector('video')
  video?.addEventListener('loadedmetadata', fitVideo)
  video?.addEventListener('resize', fitVideo)
  if (typeof ResizeObserver !== 'undefined' && overlay.value?.parentElement) {
    observer = new ResizeObserver(fitVideo)
    observer.observe(overlay.value.parentElement)
  }
  fitVideo()
  if (!canDraw.value) void send('request')
})
onUnmounted(() => { props.room.off(RoomEvent.DataReceived, onData); observer?.disconnect(); video?.removeEventListener('loadedmetadata', fitVideo); video?.removeEventListener('resize', fitVideo) })
</script>
<template>
  <div ref="overlay" class="annotation-wrap" :style="frame">
    <svg class="annotation-layer" :class="{ editable: canDraw && drawing }" viewBox="0 0 1000 1000" preserveAspectRatio="none" @pointerdown="begin" @pointermove="move" @pointerup="finish" @pointercancel="finish">
      <path v-for="(stroke,index) in strokes" :key="index" :d="path(stroke.points)" :stroke="stroke.color" />
      <path v-if="active" :d="path(active.points)" :stroke="active.color" />
    </svg>
    <div v-if="canDraw" class="annotation-tools">
      <button :aria-pressed="drawing" @click="drawing=!drawing">{{drawing?'✓ Selesai anotasi':'✎ Anotasi'}}</button>
      <template v-if="drawing"><button v-for="swatch in ['#ffc94d','#fa6781','#59b292']" :key="swatch" :style="{background:swatch}" :aria-label="`Warna ${swatch}`" :aria-pressed="color===swatch" @click="color=swatch">●</button><button @click="clear">Bersihkan</button></template>
    </div>
  </div>
</template>
<style scoped>
.annotation-wrap{position:absolute;pointer-events:none}.annotation-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none}.annotation-layer.editable{pointer-events:auto;cursor:crosshair}.annotation-layer path{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.annotation-tools{position:absolute;top:12px;right:12px;z-index:2;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto}.annotation-tools button{border:2px solid #303826;border-radius:7px;padding:5px 7px;background:#f5efe3;color:#303826;font-weight:900;font-size:11px;cursor:pointer}.annotation-tools button[aria-pressed=true]{outline:2px dashed #ffc94d}
</style>
