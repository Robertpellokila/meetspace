<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ waitingCount:{type:Number,default:0}, micEnabled:Boolean, cameraEnabled:Boolean, micBusy:Boolean, cameraBusy:Boolean, sharing:Boolean, shareBusy:Boolean, handRaised:Boolean, handBusy:Boolean, isHost:Boolean, isOwner:Boolean, recurring:Boolean, professional:Boolean, recording:Boolean, recordBusy:Boolean, features:{type:Object,default:()=>({})}, panel:{type:String,default:''}, canShare:{type:Boolean,default:true}, view:{type:Object,default:()=>({})} })
const emit = defineEmits(['mic','camera','share','hand','panel','leave','audio','record','end','view','fullscreen','invite'])
const dock = ref(null), dockOffset = ref({ x:0, y:0 }), dragging = ref(false)
let dragStart = null
function resetDock() { dockOffset.value = { x:0, y:0 } }
function startDockDrag(event) {
  if (event.button !== 0 || !dock.value) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  dragging.value = true
  dragStart = { x:event.clientX, y:event.clientY, rect:dock.value.getBoundingClientRect(), offset:{ ...dockOffset.value } }
}
function moveDock(event) {
  if (!dragStart) return
  const { rect, offset } = dragStart
  const minTop = Math.min(Number.parseFloat(getComputedStyle(dock.value).getPropertyValue('--meeting-header-height')) + 8 || 8, Math.max(8, window.innerHeight - rect.height - 8))
  const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, rect.left + event.clientX - dragStart.x))
  const top = Math.max(minTop, Math.min(window.innerHeight - rect.height - 8, rect.top + event.clientY - dragStart.y))
  dockOffset.value = { x:offset.x + left - rect.left, y:offset.y + top - rect.top }
}
function stopDockDrag(event) { if (dragStart && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); dragStart = null; dragging.value = false }
watch(() => props.sharing, (active) => { if (!active) resetDock() })
onMounted(() => window.addEventListener('resize', resetDock))
onBeforeUnmount(() => window.removeEventListener('resize', resetDock))
const btns = computed(() => [
  {id:'mic',label:props.micEnabled?'Mute':'Unmute',icon:props.micEnabled?'🎙':'🔇',shortcut:'Alt+M · tahan Space saat mic mati'},
  {id:'camera',label:props.cameraEnabled?'Camera off':'Camera on',icon:props.cameraEnabled?'▣':'⊘',shortcut:'Alt+V'},
])
</script>
<template>
  <footer ref="dock" class="ms-toolbar" :class="{dragging}" :style="{'--dock-x':`${dockOffset.x}px`,'--dock-y':`${dockOffset.y}px`}">
    <div v-if="sharing && professional" class="presentation-dock" aria-label="Kontrol presentasi">
      <button class="presentation-grip" aria-label="Geser toolbar presentasi" title="Geser toolbar presentasi" @pointerdown="startDockDrag" @pointermove="moveDock" @pointerup="stopDockDrag" @pointercancel="stopDockDrag">⋮⋮</button>
      <span class="presentation-live">● PRESENTING</span>
      <span class="presentation-divider" aria-hidden="true"></span>
      <label class="presentation-layout">Tampilan <select :value="view.layout || 'gallery'" title="Ganti layout · Alt+G" @change="emit('view',{layout:$event.target.value})"><option value="gallery">Gallery</option><option value="speaker">Speaker</option><option value="dynamic">Dynamic gallery</option><option value="multi">Multi-speaker</option><option value="immersive">Retro lounge</option></select></label>
      <button title="Lihat peserta · Alt+P" @click="emit('panel','participants')">♧ Peserta</button>
      <button v-if="features.chat" title="Buka chat · Alt+C" @click="emit('panel','chat')">✉ Chat</button>
      <button title="Fullscreen · Alt+F" @click="emit('fullscreen')">⛶</button>
      <button title="Salin undangan · Alt+I" @click="emit('invite')">↗</button>
      <button :title="view.autoHideControls === false ? 'Sembunyikan kontrol otomatis · Alt+D' : 'Biarkan kontrol tampil · Alt+D'" :aria-pressed="view.autoHideControls === false" @click="emit('view',{autoHideControls:view.autoHideControls !== false ? false : true})">{{view.autoHideControls === false ? '◆' : '◇'}}</button>
      <button class="presentation-stop" :disabled="shareBusy" title="Hentikan share · Alt+S" @click="emit('share')">■ Stop share</button>
    </div>
    <div class="ms-toolbar-inner">
      <button v-for="b in btns" :key="b.id" class="ms-tool" :class="{ off: b.id==='mic' ? !micEnabled : !cameraEnabled }" :disabled="b.id==='mic' ? micBusy : cameraBusy" :aria-pressed="b.id==='mic' ? micEnabled : cameraEnabled" :title="b.shortcut" @click="emit(b.id)"><span>{{ b.icon }}</span><small>{{ b.label }}</small></button>
      <button v-if="features.screenShare && !(sharing && professional)" class="ms-tool" :class="{ chosen: sharing }" :disabled="shareBusy || !canShare" :aria-pressed="sharing" :title="canShare ? 'Alt+S' : 'Peserta lain sedang berbagi layar'" @click="emit('share')"><span>▣</span><small>{{ sharing?'Stop share':'Share screen' }}</small></button>
      <button v-if="features.raiseHand" class="ms-tool" :class="{ chosen: handRaised }" :disabled="handBusy" :aria-pressed="handRaised" title="Alt+H" @click="emit('hand')"><span>✋</span><small>{{ handRaised?'Lower hand':'Raise hand' }}</small></button>
      <button class="ms-tool" :class="{ chosen: panel==='participants' }" title="Alt+P" @click="emit('panel','participants')"><span>♧</span><small>People <b v-if="waitingCount" class="waiting-count">{{waitingCount}}</b></small></button>
      <button v-if="features.chat" class="ms-tool" :class="{ chosen: panel==='chat' }" title="Alt+C" @click="emit('panel','chat')"><span>✉</span><small>Chat</small></button>
      <button v-if="features.reactions" class="ms-tool" :class="{chosen:panel==='reactions'}" title="Alt+E" @click="emit('panel','reactions')"><span>♡</span><small>React</small></button>
      <button class="ms-tool" :class="{chosen:panel==='sounds'}" title="Alt+X" @click="emit('panel','sounds')"><span>♫</span><small>Sound FX</small></button>
      <button v-if="professional" class="ms-tool" :class="{chosen:panel==='breakouts'}" title="Alt+B" @click="emit('panel','breakouts')"><span>▦</span><small>Breakout</small></button>
      <button v-if="professional" class="ms-tool" :class="{chosen:panel==='polls'}" title="Alt+O" @click="emit('panel','polls')"><span>▤</span><small>Polling</small></button>
      <button v-if="professional && isHost" class="ms-tool" :class="{chosen:panel==='security'}" title="Alt+K" @click="emit('panel','security')"><span>♙</span><small>Security</small></button>
      <button v-if="isHost" class="ms-tool" :class="{chosen:recording}" :disabled="recordBusy" :aria-pressed="recording" title="Rekam lokal · Alt+R" @click="emit('record')"><span>{{recording?'■':'◉'}}</span><small>{{recording?'Stop record':'Record'}}</small></button>
      <button class="ms-tool" :class="{chosen:panel==='tools'}" title="Alt+T" @click="emit('panel','tools')"><span>⚙</span><small>Tools</small></button>
      <button class="ms-tool" title="Alt+U" @click="emit('audio')"><span>♫</span><small>Enable audio</small></button>
      <button class="ms-tool danger" @click="emit('leave')"><span>☎</span><small>Leave</small></button>
      <button v-if="isOwner" class="ms-tool danger" @click="emit('end')"><span>×</span><small>{{recurring?'End session':'End all'}}</small></button>
    </div>
  </footer>
</template>
<style scoped>
.ms-toolbar { flex:none; position:relative; z-index:2; padding:12px 16px; background:var(--bg-surface); border-top:3px solid var(--ms-line); }
.ms-toolbar-inner { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:9px; }
.ms-tool { display:flex; flex-direction:column; gap:5px; align-items:center; min-width:88px; padding:9px 12px; border:2px solid var(--ms-line); border-radius:12px; box-shadow:3px 3px 0 var(--ms-line); background:var(--bg-elevated); color:var(--text-primary); font-weight:800; cursor:pointer; }
.ms-tool span { font-size:20px; } .ms-tool small { font-size:11px; }
.presentation-dock{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;padding:2px 3px 8px;color:var(--text-primary);font-size:11px;font-weight:900}
.presentation-live{color:#ab3131;letter-spacing:.08em;white-space:nowrap}.presentation-divider{height:24px;border-left:2px dashed var(--ms-line)}
.presentation-dock button,.presentation-layout select{border:2px solid var(--ms-line);border-radius:8px;background:var(--bg-elevated);color:var(--text-primary);padding:5px 8px;font:inherit;cursor:pointer}
.presentation-layout{display:flex;align-items:center;gap:5px;white-space:nowrap}.presentation-layout select{max-width:120px}
.presentation-dock .presentation-stop{background:#b64d4d;color:white}.presentation-dock button:focus-visible,.presentation-layout select:focus-visible{outline:3px dashed var(--color-accent-pink);outline-offset:2px}
.presentation-dock .presentation-grip{cursor:grab;touch-action:none;letter-spacing:-.22em;padding:5px 10px 5px 5px}.presentation-dock .presentation-grip:active{cursor:grabbing}
@media(hover:none){.presentation-dock .presentation-grip{display:none}}
.ms-tool.chosen { background:#D8C9A8; color:#303826; } .ms-tool.off { opacity:.68; }
.ms-tool.danger { background:#B64D4D; color:#fff; } .ms-tool:disabled { opacity:.45; cursor:wait; }
@media(max-width:600px){.ms-toolbar-inner{ flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; padding-bottom:3px }.ms-tool{min-width:73px} }
</style>

<style scoped>
.ms-toolbar{padding:7px 10px}.ms-toolbar-inner{flex-wrap:nowrap;overflow-x:auto;justify-content:safe center;gap:6px;padding-bottom:4px}.ms-tool{flex:none;min-width:65px;padding:6px 8px;gap:2px}.ms-tool span{font-size:17px}.ms-tool small{font-size:10px}
</style>

<style scoped>.waiting-count{background:var(--color-danger,#b64d4d);color:#fff;border-radius:12px;padding:1px 5px;font-size:10px}</style>
