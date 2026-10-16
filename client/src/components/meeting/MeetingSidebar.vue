<script setup>
import { ref, computed } from 'vue'
import HostApprovalsPanel from './HostApprovalsPanel.vue'
const props = defineProps({ panel:{type:String,default:''}, participants:{type:Array,default:()=>[]}, messages:{type:Array,default:()=>[]}, roomId:String, isHost:Boolean, canModerate:Boolean, hostBusy:String, hostError:String, approvals:Object })
const emit = defineEmits(['close','send','moderate'])
const orderedParticipants = computed(() => [...props.participants].sort((a,b) => Number(b.handRaised)-Number(a.handRaised)))
const draft = ref('')
function send() { const value=draft.value.trim(); if (!value) return; emit('send',value); draft.value='' }
</script>
<template>
  <aside class="ms-sidebar" v-if="panel">
    <header><strong>{{ panel === 'chat' ? '✉ Room Chat' : '♧ People' }}</strong><button aria-label="Close sidebar" @click="emit('close')">✕</button></header>
    <div v-if="panel==='participants'" class="ms-side-body">
      <HostApprovalsPanel v-if="isHost" :room-id="roomId" :approvals="approvals" />
      
      <div v-if="canModerate" class="ms-host-tools">
        <button :disabled="Boolean(hostBusy) || !participants.some(p=>!p.isHost && !p.micMuted)" @click="emit('moderate',{action:'mute-all'})">Mute all guests</button>
        <small>Guests can turn their microphones back on.</small>
      </div>
      <div v-for="p in orderedParticipants" :key="p.id" class="ms-person-row">
        <div class="ms-person"><span class="ms-dot" :class="{speaking:p.isSpeaking}"></span><strong>{{ p.name }}</strong><small>{{ [p.isHost?'Host':'',p.isLocal?'You':''].filter(Boolean).join(' · ') }}</small></div>
        <div class="ms-person-status"><span v-if="p.handRaised">✋ Hand raised</span><span v-if="p.isSpeaking">♫ Sedang bicara</span><span>{{p.micMuted?'Mic off':'Mic on'}}</span></div>
        <div v-if="canModerate && !p.isHost && !p.isLocal" class="ms-person-controls">
          <button :disabled="Boolean(hostBusy) || p.micMuted" :aria-label="`Mute ${p.name}`" @click="emit('moderate',{action:'mute',identity:p.id})">Mute</button>
          <button v-if="p.handRaised" :disabled="Boolean(hostBusy)" :aria-label="`Lower ${p.name}'s hand`" @click="emit('moderate',{action:'lower-hand',identity:p.id})">Lower hand</button>
          <button class="ms-remove" :disabled="Boolean(hostBusy)" :aria-label="`Remove ${p.name}`" @click="emit('moderate',{action:'remove',identity:p.id})">Remove</button>
        </div>
      </div>
    </div>
    <template v-else>
      <div class="ms-side-body ms-messages">
        <p v-if="!messages.length" class="muted">Say hello! Your room chat starts here.</p>
        <div v-for="msg in messages" :key="msg.id" class="ms-message"><b>{{ msg.sender }}</b><p>{{ msg.text }}</p></div>
      </div>
      <form class="ms-chat-compose" @submit.prevent="send"><input v-model="draft" maxlength="1000" placeholder="Write a message..." aria-label="Chat message" /><button type="submit" :disabled="!draft.trim()">Send</button></form>
    </template>
  </aside>
</template>
<style scoped>
.ms-sidebar { min-width:0; height:100%; min-height:280px; display:flex; flex-direction:column; border:3px solid var(--ms-line); border-radius:17px; background:var(--bg-surface); box-shadow:4px 5px 0 var(--ms-line); overflow:hidden; }
.ms-sidebar header { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:14px; border-bottom:2px solid var(--ms-line); background:var(--bg-elevated); }
.ms-sidebar button { border:2px solid var(--ms-line); border-radius:9px; padding:7px 9px; background:#D8C9A8; color:#303826; cursor:pointer; font-weight:900; }
.ms-side-body { flex:1; min-height:0; overflow-y:auto; padding:14px; }
.ms-person { display:flex; align-items:center; gap:9px; border-bottom:1px dashed var(--border-color); padding:11px 0; overflow-wrap:anywhere; }.ms-person small {margin-left:auto;color:var(--text-secondary)}.ms-dot { flex:none; width:9px;height:9px;background:#4F5B2A;border-radius:50%; }
.ms-message { background:var(--bg-elevated);border-radius:10px;padding:9px 11px;margin-bottom:10px;overflow-wrap:anywhere; }.ms-message b{font-size:11px}.ms-message p{margin:5px 0 0;font-size:13px}.muted{font-size:13px;color:var(--text-secondary)}
.ms-chat-compose { display:flex; gap:6px; padding:10px; border-top:2px solid var(--ms-line); }.ms-chat-compose input {width:100%;min-width:0;background:var(--bg-app); color:var(--text-primary); border:1px solid var(--border-color);border-radius:9px;padding:10px;}
.ms-host-tools{display:grid;gap:8px;margin:18px 0 8px}.ms-host-tools small,.ms-person-status{font-size:11px;color:var(--text-secondary)}.ms-person-row{border-bottom:1px dashed var(--border-color);padding-bottom:12px}.ms-person-row .ms-person{border:0}.ms-person-status,.ms-person-controls{display:flex;gap:8px;flex-wrap:wrap}.ms-person-controls{margin-top:9px}.ms-person-controls button{font-size:11px}.ms-person-controls .ms-remove{background:var(--color-danger,#B64D4D);color:#fff}.ms-sidebar button:disabled{opacity:.5;cursor:not-allowed}.ms-control-error{color:var(--color-danger,#B64D4D);font-size:13px}
</style>

<style scoped>.ms-dot.speaking{background:#59b292;box-shadow:0 0 0 3px #59b29240}</style>
