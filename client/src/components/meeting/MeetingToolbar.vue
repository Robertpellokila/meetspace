<script setup>
import { computed } from 'vue'
const props = defineProps({ waitingCount:{type:Number,default:0}, micEnabled:Boolean, cameraEnabled:Boolean, micBusy:Boolean, cameraBusy:Boolean, sharing:Boolean, shareBusy:Boolean, handRaised:Boolean, handBusy:Boolean, isHost:Boolean, isOwner:Boolean, recurring:Boolean, professional:Boolean, recording:Boolean, recordBusy:Boolean, features:{type:Object,default:()=>({})}, panel:{type:String,default:''}, canShare:{type:Boolean,default:true} })
const emit = defineEmits(['mic','camera','share','hand','panel','leave','audio','record','end'])
const btns = computed(() => [
  {id:'mic',label:props.micEnabled?'Mute':'Unmute',icon:props.micEnabled?'🎙':'🔇'},
  {id:'camera',label:props.cameraEnabled?'Camera off':'Camera on',icon:props.cameraEnabled?'▣':'⊘'},
])
</script>
<template>
  <footer class="ms-toolbar">
    <div class="ms-toolbar-inner">
      <button v-for="b in btns" :key="b.id" class="ms-tool" :class="{ off: b.id==='mic' ? !micEnabled : !cameraEnabled }" :disabled="b.id==='mic' ? micBusy : cameraBusy" :aria-pressed="b.id==='mic' ? micEnabled : cameraEnabled" @click="emit(b.id)"><span>{{ b.icon }}</span><small>{{ b.label }}</small></button>
      <button v-if="features.screenShare" class="ms-tool" :class="{ chosen: sharing }" :disabled="shareBusy || !canShare" :aria-pressed="sharing" :title="canShare ? '' : 'Another participant is sharing'" @click="emit('share')"><span>▣</span><small>{{ sharing?'Stop share':'Share screen' }}</small></button>
      <button v-if="features.raiseHand" class="ms-tool" :class="{ chosen: handRaised }" :disabled="handBusy" :aria-pressed="handRaised" @click="emit('hand')"><span>✋</span><small>{{ handRaised?'Lower hand':'Raise hand' }}</small></button>
      <button class="ms-tool" :class="{ chosen: panel==='participants' }" @click="emit('panel','participants')"><span>♧</span><small>People <b v-if="waitingCount" class="waiting-count">{{waitingCount}}</b></small></button>
      <button v-if="features.chat" class="ms-tool" :class="{ chosen: panel==='chat' }" @click="emit('panel','chat')"><span>✉</span><small>Chat</small></button>
      <button v-if="features.reactions" class="ms-tool" :class="{chosen:panel==='reactions'}" @click="emit('panel','reactions')"><span>♡</span><small>React</small></button>
      <button class="ms-tool" :class="{chosen:panel==='sounds'}" @click="emit('panel','sounds')"><span>♫</span><small>Sound FX</small></button>
      <button v-if="professional" class="ms-tool" :class="{chosen:panel==='breakouts'}" @click="emit('panel','breakouts')"><span>▦</span><small>Breakout</small></button>
      <button v-if="professional" class="ms-tool" :class="{chosen:panel==='polls'}" @click="emit('panel','polls')"><span>▤</span><small>Polling</small></button>
      <button v-if="professional && isHost" class="ms-tool" :class="{chosen:panel==='security'}" @click="emit('panel','security')"><span>♙</span><small>Security</small></button>
      <button v-if="isHost" class="ms-tool" :class="{chosen:recording}" :disabled="recordBusy" :aria-pressed="recording" title="Rekam tab atau layar yang kamu pilih; file disimpan lokal" @click="emit('record')"><span>{{recording?'■':'◉'}}</span><small>{{recording?'Stop record':'Record'}}</small></button>
      <button class="ms-tool" :class="{chosen:panel==='tools'}" @click="emit('panel','tools')"><span>⚙</span><small>Tools</small></button>
      <button class="ms-tool" @click="emit('audio')"><span>♫</span><small>Enable audio</small></button>
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
.ms-tool.chosen { background:#D8C9A8; color:#303826; } .ms-tool.off { opacity:.68; }
.ms-tool.danger { background:#B64D4D; color:#fff; } .ms-tool:disabled { opacity:.45; cursor:wait; }
@media(max-width:600px){.ms-toolbar-inner{ flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; padding-bottom:3px }.ms-tool{min-width:73px} }
</style>

<style scoped>
.ms-toolbar{padding:7px 10px}.ms-toolbar-inner{flex-wrap:nowrap;overflow-x:auto;justify-content:safe center;gap:6px;padding-bottom:4px}.ms-tool{flex:none;min-width:65px;padding:6px 8px;gap:2px}.ms-tool span{font-size:17px}.ms-tool small{font-size:10px}
</style>

<style scoped>.waiting-count{background:var(--color-danger,#b64d4d);color:#fff;border-radius:12px;padding:1px 5px;font-size:10px}</style>
