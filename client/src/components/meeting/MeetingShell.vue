<script setup>
import { ref, computed, onMounted, onBeforeUnmount, toRef, watch, nextTick } from 'vue'
import api from '../../services/api.js'
import { useRouter } from 'vue-router'
import { useHostApprovals } from '../../composables/useHostApprovals.js'
import { notify, dismissToast, toast } from '../../services/toast.js'
import MeetingToolbar from './MeetingToolbar.vue'
import MeetingSidebar from './MeetingSidebar.vue'
import AccountControls from '../common/AccountControls.vue'
import MeetingSettings from './MeetingSettings.vue'
import MoodSoundPlayer from './MoodSoundPlayer.vue'
import BreakoutPanel from './BreakoutPanel.vue'
import ProfessionalSecurityPanel from './ProfessionalSecurityPanel.vue'
import PollPanel from './PollPanel.vue'
import RoomSoundboard from './RoomSoundboard.vue'
import { useRoomSoundEffects } from '../../composables/useRoomSoundEffects.js'
import { moods, resolveMood } from '../../config/moods.js'
import { useAppearanceStore } from '../../stores/appearance'
import { meetingLayoutOrder, meetingShortcutKey } from '../../config/meetingShortcuts.js'
const props = defineProps({ room:{type:Object,required:true}, livekitRoom:{type:Object,default:null}, participants:{type:Array,default:()=>[]}, messages:{type:Array,default:()=>[]}, chatAllowed:{type:Boolean,default:true}, micEnabled:Boolean, cameraEnabled:Boolean, micBusy:Boolean, cameraBusy:Boolean, sharing:Boolean, shareBusy:Boolean, canShare:Boolean, handRaised:Boolean, handBusy:Boolean, isHost:Boolean, isOwner:Boolean, hostBusy:String, hostError:String, features:{type:Object,default:()=>({})}, options:{type:Object,default:()=>({view:{}})},elapsed:String,recording:Boolean,recordBusy:Boolean,reactions:{type:Array,default:()=>[]} })
const emit = defineEmits(['mic','camera','share','hand','moderate','leave','audio','send','view','device','refresh-devices','fullscreen','invite','copy-room-id','move','record','end','reaction','background','background-image','low-data'])
const appearance = useAppearanceStore()
const router = useRouter()
const panel = ref('')
const panelOpen = computed(() => Boolean(panel.value && panel.value !== 'breakouts'))
const headerEl = ref(null), headerHeight = ref(60)
let headerObserver
const chromeVisible = ref(true)
const autoHideControls = computed(() => props.options.view?.autoHideControls !== false)
let chromeTimer, chromeHovered = false
function scheduleChromeHide() {
  clearTimeout(chromeTimer)
  if (!autoHideControls.value || chromeHovered || panelOpen.value) return
  chromeTimer = setTimeout(() => { if (!chromeHovered) chromeVisible.value = false }, 2800)
}
function revealChrome() { chromeVisible.value = true; scheduleChromeHide() }
function onChromePointerMove(event) {
  if (panelOpen.value) return
  if (event.clientY < 76 || event.clientY > window.innerHeight - 86) revealChrome()
}
function onChromeEnter() { chromeHovered = true; clearTimeout(chromeTimer); chromeVisible.value = true }
function onChromeLeave() { chromeHovered = false; scheduleChromeHide() }
watch(autoHideControls, (enabled) => { chromeVisible.value = true; if (enabled) scheduleChromeHide(); else clearTimeout(chromeTimer) })
watch(panelOpen, (open) => { chromeVisible.value = true; if (open) clearTimeout(chromeTimer); else scheduleChromeHide() })
function onShellShortcut(event) {
  const key = meetingShortcutKey(event)
  const panels = { p:'participants', c:'chat', e:'reactions', x:'sounds', b:'breakouts', o:'polls', k:'security', t:'tools' }
  if (panels[key]) {
    if (key === 'c' && !props.features.chat || key === 'e' && !props.features.reactions || ['b','o'].includes(key) && props.room.mode !== 'professional' || key === 'k' && !(props.room.mode === 'professional' && props.isHost)) return
    event.preventDefault(); togglePanel(panels[key]); revealChrome(); return
  }
  if (key === 'g' && props.room.mode === 'professional') {
    event.preventDefault()
    const current = meetingLayoutOrder.indexOf(props.options.view?.layout)
    emit('view', { layout: meetingLayoutOrder[(current + 1) % meetingLayoutOrder.length] })
  } else if (key === 'd') { event.preventDefault(); emit('view', { autoHideControls: props.options.view?.autoHideControls === false }); revealChrome() }
  else if (key === 'f') { event.preventDefault(); emit('fullscreen') }
  else if (key === 'i') { event.preventDefault(); emit('invite') }
  else if (key === 'u') { event.preventDefault(); enableMeetingAudio() }
}
const endDialog=ref(null)
const breakoutDialog = ref(null), assignmentDialog = ref(null), pendingAssignment = ref(null), assignmentBusy = ref(false)
let arrivalToast
let breakoutTimer, breakoutClock
const breakoutDeadline = ref(null), clockNow = ref(Date.now())
let lastNoticeAt = 0, lastAssignment = '', lastHelpId = '', returningFromBreakout = false
const breakoutRemaining = computed(() => breakoutDeadline.value ? Math.max(0, Math.ceil((breakoutDeadline.value - clockNow.value) / 1000)) : null)
async function enterAssignedBreakout(parentId, childId, approval) {
  try {
    const response = await api.post(`/rooms/${parentId}/breakouts/${childId}/join`, approval)
    emit('move', response.data.data)
    return true
  } catch (error) { toast.error(error); return false }
}
function closeAssignment() { assignmentDialog.value?.close(); pendingAssignment.value = null }
async function acceptAssignment() {
  if (!pendingAssignment.value || assignmentBusy.value) return
  assignmentBusy.value = true
  try {
    const { parentId, childId, approval } = pendingAssignment.value
    if (await enterAssignedBreakout(parentId, childId, approval)) closeAssignment()
  } finally { assignmentBusy.value = false }
}
async function checkBreakoutUpdates() {
  if (props.room.mode !== 'professional') return
  const parentId = props.room.parentRoomId || props.room.id
  const sourceId = props.room.parentRoomId ? props.room.id : parentId
  let approval = {}
  try { approval = JSON.parse(sessionStorage.getItem(`meetspace:approval:${sourceId}`) || '{}') || {} } catch { /* ignore */ }
  try {
    const response = await api.get(`/rooms/${sourceId}/breakouts${props.room.parentRoomId ? '/context' : ''}`, { headers: { 'x-meetspace-request-id': approval.requestId, 'x-meetspace-guest-secret': approval.guestSecret } })
    const meta = props.room.parentRoomId ? response.data.data : response.data.meta || {}
    breakoutDeadline.value = meta.deadlineAt || null
    if (props.room.parentRoomId && meta.deadlineAt && meta.deadlineAt <= Date.now() && !returningFromBreakout) {
      returningFromBreakout = true
      let parentApproval = {}
      try { parentApproval = JSON.parse(sessionStorage.getItem(`meetspace:approval:${parentId}`) || '{}') || {} } catch { /* ignore */ }
      notify('Waktu breakout selesai. Kembali ke room utama.', { title: '▦ Breakout selesai', duration: 6000 })
      if (props.isOwner || parentApproval.guestSecret) emit('move', { roomId: parentId })
      else void router.push({ name: 'lobby', params: { roomId: parentId } })
      return
    }
    if (props.room.parentRoomId && meta.notice?.at && meta.notice.at !== lastNoticeAt) {
      lastNoticeAt = meta.notice.at
      notify(meta.notice.text, { title: '▦ Pesan fasilitator', duration: 12000, actions: [{ label: 'Lihat breakout', run: () => { panel.value = 'breakouts' } }] })
    }
    const assignmentKey = meta.assignmentKey || meta.assignedRoomId
    const seenKey = `meetspace:seen-breakout-assignment:${parentId}`
    let alreadySeen = false
    try { alreadySeen = sessionStorage.getItem(seenKey) === assignmentKey } catch { /* storage unavailable */ }
    if (meta.assignedRoomId && meta.assignedRoomId !== props.room.id && assignmentKey !== lastAssignment && !alreadySeen) {
      lastAssignment = assignmentKey
      try { sessionStorage.setItem(seenKey, assignmentKey) } catch { /* storage unavailable */ }
      const child = props.room.parentRoomId ? null : response.data.data.find((room) => room.id === meta.assignedRoomId)
      let parentApproval = approval
      if (props.room.parentRoomId) { try { parentApproval = JSON.parse(sessionStorage.getItem(`meetspace:approval:${parentId}`) || '{}') || {} } catch { parentApproval = {} } }
      pendingAssignment.value = { parentId, childId: meta.assignedRoomId, name: child?.name || meta.assignedRoomName || 'ruang kelompok', approval: parentApproval }
      await nextTick()
      if (pendingAssignment.value?.childId === meta.assignedRoomId && assignmentDialog.value && !assignmentDialog.value.open) assignmentDialog.value.showModal()
    }
    if (props.isHost && !props.room.parentRoomId) {
      const help = (await api.get(`/rooms/${parentId}/breakouts/help`)).data.data || []
      const latest = help.at(-1)
      if (latest && latest.id !== lastHelpId) {
        lastHelpId = latest.id
        notify(`${latest.participantName} meminta bantuan di ${latest.roomName}.`, { title: '✋ Bantuan breakout', duration: 12000, actions: [{ label: 'Lihat permintaan', run: () => { panel.value = 'breakouts' } }] })
      }
    }
  } catch { /* participant may still be joining or approval may have expired */ }
}
const admission=useHostApprovals(()=>props.room.id,()=>props.isHost,(arrivals)=>{
  if(arrivalToast)dismissToast(arrivalToast)
  arrivalToast=notify(arrivals.length===1 ? `${arrivals[0].participantName} meminta bergabung.` : `${arrivals.length} peserta baru meminta bergabung.`, {
    title:'♧ Ada tamu di waiting room', duration:12000,
    actions:[{label:'Lihat permintaan',run:()=>{panel.value='participants'}}],
  })
})
const approvals=computed(()=>({requests:admission.requests.value,busy:admission.busy.value,decide:admission.decide}))
onMounted(() => { void checkBreakoutUpdates(); breakoutTimer = setInterval(checkBreakoutUpdates, 6000); breakoutClock = setInterval(() => { clockNow.value = Date.now() }, 1000); window.addEventListener('keydown', onShellShortcut); if (headerEl.value) { headerHeight.value = headerEl.value.getBoundingClientRect().height; if (typeof ResizeObserver !== 'undefined') { headerObserver = new ResizeObserver(([entry]) => { headerHeight.value = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height }); headerObserver.observe(headerEl.value) } } scheduleChromeHide() })
onBeforeUnmount(()=>{if(arrivalToast)dismissToast(arrivalToast);clearInterval(breakoutTimer);clearInterval(breakoutClock);clearTimeout(chromeTimer);headerObserver?.disconnect();window.removeEventListener('keydown',onShellShortcut);if(breakoutDialog.value?.open)breakoutDialog.value.close();if(assignmentDialog.value?.open)assignmentDialog.value.close()})
const speakers=computed(()=>props.participants.filter(p=>p.isSpeaking).map(p=>p.name).join(', '))
const activeMood=computed(()=>resolveMood(props.room.theme,props.options.view.background))
const soundboard=useRoomSoundEffects(toRef(props,'livekitRoom'),computed(()=>props.room.mode))
function togglePanel(next) { panel.value = panel.value === next ? '' : next;if(panel.value==='tools')emit('refresh-devices');if(panel.value==='sounds')void soundboard.enable() }
watch(panel, async (value) => {
  await nextTick()
  if (panel.value !== value) return
  if (value === 'breakouts') { if (breakoutDialog.value && !breakoutDialog.value.open) breakoutDialog.value.showModal() }
  else if (breakoutDialog.value?.open) breakoutDialog.value.close()
})
function enableMeetingAudio() { emit('audio'); void soundboard.enable() }
</script>
<template>
  <div class="ms-meeting-root" :class="{'chrome-hidden':autoHideControls && !panelOpen && !chromeVisible,'panel-open':panelOpen}" :data-background="activeMood" :style="{'--mood-accent':moods[activeMood].accent,'--mood-tile-radius':moods[activeMood].tileRadius,'--mood-avatar-radius':moods[activeMood].avatarRadius,'--mood-frame-style':moods[activeMood].frameStyle,'--meeting-header-height':`${headerHeight}px`}" @pointermove="onChromePointerMove">
    <header ref="headerEl" class="ms-meeting-header" @pointerenter="onChromeEnter" @pointerleave="onChromeLeave"><RouterLink class="ms-logo" to="/">✦ MeetSpace</RouterLink><div class="ms-room-name"><small>ON THE AIR · {{ room.mode }} <span v-if="options.view.showTimer">· ◷ {{elapsed}}</span></small><strong>{{ room.name }}</strong><small class="connection-status" role="status">{{['reconnecting','signalReconnecting'].includes(options.network?.state)?'Menghubungkan ulang…':options.network?.quality==='poor'?'● Jaringan lemah':options.network?.quality==='lost'?'● Koneksi terputus':options.network?.quality==='excellent'?'● Koneksi baik':options.network?.quality==='good'?'● Koneksi cukup':'◌ Memeriksa koneksi'}}</small><small v-if="breakoutRemaining!==null" role="timer">▦ Breakout {{String(Math.floor(breakoutRemaining/60)).padStart(2,'0')}}:{{String(breakoutRemaining%60).padStart(2,'0')}}</small><small class="room-mood">{{moods[activeMood].icon}} {{moods[activeMood].name}}</small><small class="active-speakers" :title="speakers">{{speakers ? "♫ " + speakers : "\u00a0"}}</small><small v-if="participants.some(p=>p.recording)" class="recording-indicator" role="status">● Host sedang merekam lokal</small></div><div class="meeting-header-actions"><MoodSoundPlayer :mood="activeMood" /><button class="ms-mode-toggle" @click="appearance.toggleTheme()">{{appearance.isDark?'☀':'☾'}}</button><AccountControls /></div></header>
    <div class="ms-meeting-body" :class="{ 'has-panel': panelOpen }">
      <main class="ms-meeting-stage"><slot /></main>
      <MeetingSidebar v-if="['participants','chat'].includes(panel)" :panel="panel" :participants="participants" :messages="messages" :can-chat="chatAllowed" :room-id="room.id" :approvals="approvals"
        :is-host="isHost" :can-moderate="isHost && room.mode==='professional'" :host-busy="hostBusy" :host-error="hostError"
        @close="panel=''" @send="emit('send',$event)" @moderate="emit('moderate',$event)" />
      <aside v-else-if="panel && panel !== 'breakouts'" class="ms-tools-sidebar"><header><strong>{{panel==='tools'?'⚙ Room tools':panel==='polls'?'▤ Polling':panel==='security'?'♙ Security':panel==='sounds'?'♫ Sound effects':'♡ Reactions'}}</strong><button aria-label="Tutup panel" @click="panel=''">×</button></header><div class="tools-content">
        <MeetingSettings v-if="panel==='tools'" :background="options.background" :network="options.network" @background="emit('background',$event)" @background-image="emit('background-image',$event)" @low-data="emit('low-data',$event)" :view="options.view" :room-mood="room.theme" :professional="room.mode==='professional'" :devices="options.devices" :selected-devices="options.selectedDevices" :device-busy="options.deviceBusy" @view="emit('view',$event)" @device="emit('device',$event)" @refresh-devices="emit('refresh-devices')" @fullscreen="emit('fullscreen')" @invite="emit('invite')" @copy-room-id="emit('copy-room-id')" />
        <PollPanel v-else-if="panel==='polls'" :room-id="room.id" :is-host="isHost" />
        <ProfessionalSecurityPanel v-else-if="panel==='security'" :room-id="room.id" :participants="participants" :is-owner="isOwner" />
        <RoomSoundboard v-else-if="panel==='sounds'" :effects="soundboard.effects.value" :muted="soundboard.muted.value" @send="soundboard.send" @mute="soundboard.muted.value=!soundboard.muted.value" @enable="soundboard.enable" />
        <div v-else class="reaction-picker"><p>Kirim sedikit semangat ke ruangan.</p><div><button v-for="emoji in ['👏','❤️','😂','🎉','👍','☕']" :key="emoji" :aria-label="`Kirim reaksi ${emoji}`" @click="emit('reaction',emoji)">{{emoji}}</button></div></div>
      </div></aside>
    </div>
    <dialog ref="breakoutDialog" class="breakout-dialog" aria-labelledby="breakout-dialog-title" @close="panel = panel === 'breakouts' ? '' : panel">
      <header class="breakout-dialog-header"><div><small>✦ PROFESSIONAL ROOM · GROUP MAP</small><h2 id="breakout-dialog-title">Ruang kelompok</h2><p>Atur kelompok sambil melihat siapa yang sudah masuk.</p></div><button aria-label="Tutup ruang kelompok" @click="panel=''">×</button></header>
      <div class="breakout-dialog-content"><BreakoutPanel v-if="panel==='breakouts'" :room="room" :participants="participants" :is-host="isHost" @move="emit('move',$event)" /></div>
    </dialog>
    <dialog ref="assignmentDialog" class="assignment-dialog" aria-labelledby="assignment-dialog-title" @close="pendingAssignment=null" @cancel="assignmentBusy && $event.preventDefault()">
      <div class="assignment-dialog-content"><small>▦ UNDANGAN BREAKOUT</small><h2 id="assignment-dialog-title">Masuk ke {{pendingAssignment?.name || 'ruang kelompok'}}?</h2><p>Fasilitator menugaskanmu ke kelompok ini. Kamu bisa masuk sekarang atau tetap di room ini dan membukanya nanti dari menu Breakout.</p><div class="assignment-dialog-actions"><button class="ms-button ms-button-outline" :disabled="assignmentBusy" @click="closeAssignment">Batal</button><button class="ms-button ms-button-primary" :disabled="assignmentBusy" @click="acceptAssignment">{{assignmentBusy?'Menghubungkan…':'Masuk kelompok ↗'}}</button></div></div>
    </dialog>
    <MeetingToolbar :class="{'share-floating':sharing && room.mode==='professional'}" :features="features" :view="options.view" :mic-enabled="micEnabled" :camera-enabled="cameraEnabled"
      :mic-busy="micBusy" :camera-busy="cameraBusy" :sharing="sharing" :share-busy="shareBusy" :can-share="canShare"
      :hand-raised="handRaised" :hand-busy="handBusy" :panel="panel" :waiting-count="admission.requests.value.length"
      :is-host="isHost" :is-owner="isOwner" :recurring="room.schedule?.repeat==='weekly'" :professional="room.mode==='professional'" :recording="recording" :record-busy="recordBusy"
      @mic="emit('mic')" @camera="emit('camera')" @share="emit('share')" @hand="emit('hand')"
      @leave="emit('leave')" @audio="enableMeetingAudio" @panel="togglePanel" @record="emit('record')" @end="endDialog.showModal()" @view="emit('view',$event)" @fullscreen="emit('fullscreen')" @invite="emit('invite')" @pointerenter="onChromeEnter" @pointerleave="onChromeLeave" />
    <div class="meeting-reactions" aria-live="polite"><div v-for="reaction in reactions" :key="reaction.id"><span>{{reaction.emoji}}</span><small>{{reaction.name}}</small></div></div>
    <dialog ref="endDialog" class="ms-card end-dialog" aria-labelledby="end-title"><h2 id="end-title">Akhiri pertemuan ini?</h2><p>Semua peserta di room ini{{room.parentRoomId?'':' dan breakout rooms'}} akan dikeluarkan. {{room.schedule?.repeat==='weekly'?'Akhiri sesi agar link tetap tersedia minggu depan, atau tutup room permanen.':'Undangan room tidak bisa digunakan lagi.'}}</p><div><button class="ms-button ms-button-outline" @click="endDialog.close()">Batal</button><button v-if="room.schedule?.repeat==='weekly'" class="ms-button ms-button-outline" @click="endDialog.close();emit('end',true)">Tutup room permanen</button><button class="ms-button ms-button-pink" @click="endDialog.close();emit('end',false)">{{room.schedule?.repeat==='weekly'?'Akhiri sesi':'Akhiri untuk semua'}}</button></div></dialog>
  </div>
</template>
<style scoped>
.ms-meeting-root { --ms-line:var(--mood-accent,var(--color-secondary,#4F5B2A)); min-height:100dvh; height:100dvh; display:flex;flex-direction:column;overflow:hidden;background:var(--bg-app);color:var(--text-primary); background-image:radial-gradient(color-mix(in srgb,var(--ms-line) 13%,transparent) 1px,transparent 1px);background-size:22px 22px; }
.ms-meeting-root{position:relative}
.ms-meeting-header{position:absolute;top:0;left:0;right:0;z-index:35;transition:transform .25s ease,opacity .25s ease}
.ms-meeting-root :deep(.ms-toolbar){position:absolute;bottom:0;left:0;right:0;z-index:35;transition:transform .25s ease,opacity .25s ease}
.ms-meeting-root :deep(.ms-toolbar.dragging){transition:none}
.ms-meeting-root :deep(.ms-toolbar.share-floating){left:50%;right:auto;top:calc(var(--meeting-header-height,60px) + 10px);bottom:auto;width:max-content;max-width:calc(100% - 24px);border:3px solid var(--ms-line);border-radius:17px;box-shadow:7px 8px 0 var(--ms-line);transform:translate(calc(-50% + var(--dock-x,0px)),var(--dock-y,0px))}
.ms-meeting-root.chrome-hidden .ms-meeting-header:not(:focus-within){transform:translateY(calc(-100% + 7px));pointer-events:none}
.ms-meeting-root.chrome-hidden :deep(.ms-toolbar:not(:focus-within)){transform:translateY(calc(100% - 7px));pointer-events:none}
.ms-meeting-root.chrome-hidden :deep(.ms-toolbar.share-floating:not(:focus-within)){transform:translate(-50%,calc(-100% - var(--meeting-header-height,60px) - 20px));opacity:0}
.ms-meeting-root.panel-open .ms-meeting-header{position:relative;top:auto;left:auto;right:auto;transform:none}
.ms-meeting-root.panel-open :deep(.ms-toolbar),.ms-meeting-root.panel-open :deep(.ms-toolbar.share-floating){position:relative;top:auto;bottom:auto;left:auto;right:auto;width:100%;max-width:none;border-radius:0;box-shadow:none;transform:none}
@media(hover:none){.ms-meeting-header{position:relative}.ms-meeting-root :deep(.ms-toolbar),.ms-meeting-root :deep(.ms-toolbar.share-floating){position:relative;top:auto;bottom:auto;left:auto;right:auto;width:100%;max-width:none;border-radius:0;box-shadow:none;transform:none}.ms-meeting-root.chrome-hidden .ms-meeting-header,.ms-meeting-root.chrome-hidden :deep(.ms-toolbar){transform:none!important;opacity:1!important;pointer-events:auto!important}}
@media(prefers-reduced-motion:reduce){.ms-meeting-header,.ms-meeting-root :deep(.ms-toolbar){transition:none}}
.ms-meeting-header {flex:none;min-height:75px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;border-bottom:3px solid var(--ms-line);background:var(--bg-surface);}
.ms-logo{color:var(--text-primary);font-weight:1000;font-size:22px;text-decoration:none;white-space:nowrap}.ms-room-name{display:flex;flex-direction:column;text-align:center;min-width:0}.ms-room-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-room-name small{letter-spacing:1px;color:var(--text-secondary);font-size:10px}.ms-mode-toggle{border:2px solid var(--ms-line);border-radius:20px;background:#D8C9A8;color:#303826;padding:9px 13px;cursor:pointer;font-weight:900;white-space:nowrap;box-shadow:2px 3px 0 var(--ms-line)}
.meeting-header-actions{display:flex;gap:10px;align-items:center}.ms-room-name .recording-indicator{color:var(--color-danger);margin-top:4px}.ms-tools-sidebar{border:3px solid var(--ms-line);border-radius:17px;background:var(--bg-surface);box-shadow:4px 5px 0 var(--ms-line);display:flex;flex-direction:column;min-height:0;overflow:hidden}.ms-tools-sidebar>header{display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:2px solid var(--ms-line);background:var(--bg-elevated)}.ms-tools-sidebar>header button{border:0;background:none;color:var(--text-primary);font-size:22px}.tools-content{overflow:auto;flex:1;min-height:0}.reaction-picker{padding:20px}.reaction-picker p{font-size:13px;color:var(--text-secondary)}.reaction-picker>div{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.reaction-picker button{font-size:30px;padding:9px;border:2px solid var(--ms-line);border-radius:12px;background:var(--bg-elevated)}.meeting-reactions{position:fixed;bottom:130px;left:25px;z-index:20;pointer-events:none;display:flex;gap:14px;flex-wrap:wrap;max-width:70vw}.meeting-reactions>div{display:grid;place-items:center;gap:4px;animation:reaction-in .3s ease-out}.meeting-reactions span{font-size:38px}.meeting-reactions small{background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-color);padding:2px 7px;border-radius:10px;max-width:100px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-size:10px}.end-dialog::backdrop{background:#182a2580}.end-dialog{padding:30px;width:calc(100% - 40px);max-width:480px;color:var(--text-primary)}.end-dialog h2{margin:0 0 15px}.end-dialog>div{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-top:25px}@keyframes reaction-in{from{transform:translateY(25px);opacity:0}to{transform:translateY(0);opacity:1}}
.ms-meeting-root[data-background='midnight']{background-image:repeating-linear-gradient(135deg,transparent 0 25px,#4f5b2a20 25px 27px)}.ms-meeting-root[data-background='romantic']{background-size:cover;background-image:radial-gradient(ellipse at 20% 20%,#fa678125,transparent 65%)}.ms-meeting-root[data-background='cozyCinema']{background-size:cover;background-image:linear-gradient(90deg,#b8892d20,transparent,#b8892d20)}.ms-meeting-root[data-background='vintageCafe']{background-image:repeating-linear-gradient(0deg,transparent 0 28px,#b8892d20 28px 30px)}.ms-meeting-root[data-background='goldenHour']{background-size:cover;background-image:radial-gradient(ellipse at bottom,#ffc94d35,transparent 70%)}.ms-meeting-root[data-background='forestRetreat']{background-size:cover;background-image:radial-gradient(ellipse at top left,#59b29240,transparent 75%)}.ms-meeting-root[data-background='arcade']{background-image:linear-gradient(#fa678115 1px,transparent 1px),linear-gradient(90deg,#59b29220 1px,transparent 1px);background-size:30px 30px}.ms-meeting-root[data-background='focus']{background-image:radial-gradient(#59b29250 1px,transparent 1px);background-size:18px 18px}
.breakout-dialog,.assignment-dialog{color:var(--text-primary);background:var(--bg-surface);border:3px solid var(--ms-line);border-radius:18px;box-shadow:9px 10px 0 var(--ms-line);padding:0;max-width:calc(100vw - 24px)}
.breakout-dialog::backdrop,.assignment-dialog::backdrop{background:#17221bba;backdrop-filter:blur(3px)}
.breakout-dialog{width:min(1080px,calc(100vw - 24px));height:min(86dvh,850px);max-height:calc(100dvh - 24px)}
.breakout-dialog[open]{display:flex;flex-direction:column}
.breakout-dialog-header{flex:none;display:flex;justify-content:space-between;align-items:start;gap:20px;padding:20px 24px;background:var(--bg-elevated);border-bottom:3px solid var(--ms-line)}
.breakout-dialog-header small,.assignment-dialog-content>small{font-size:10px;letter-spacing:.15em;font-weight:1000;color:var(--ms-line)}
.breakout-dialog-header h2,.assignment-dialog h2{font-family:var(--font-display);font-size:clamp(25px,3vw,38px);margin:4px 0}
.breakout-dialog-header p,.assignment-dialog p{margin:0;color:var(--text-secondary);font-size:13px;line-height:1.5}
.breakout-dialog-header>button{border:2px solid var(--ms-line);border-radius:9px;background:var(--bg-surface);color:var(--text-primary);font-size:23px;width:37px;height:37px;cursor:pointer}
.breakout-dialog-content{flex:1;min-height:0;overflow:auto}
.assignment-dialog{width:min(480px,calc(100vw - 28px))}.assignment-dialog-content{padding:25px;display:grid;gap:12px}.assignment-dialog h2{font-size:28px;margin:0}.assignment-dialog-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:8px}
.breakout-dialog button:focus-visible,.assignment-dialog button:focus-visible{outline:3px dashed var(--color-accent-pink);outline-offset:3px}
@media(max-width:700px){.breakout-dialog{width:calc(100vw - 12px);max-width:calc(100vw - 12px);height:calc(100dvh - 18px);max-height:calc(100dvh - 18px);border-radius:12px;box-shadow:none}.breakout-dialog-header{padding:14px}.assignment-dialog-content{padding:18px}}
.ms-meeting-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;flex:1;min-height:0;padding:16px 22px;}.ms-meeting-body.has-panel{grid-template-columns:minmax(0,1fr) 310px}.ms-meeting-stage{min-height:0;min-width:0;overflow:hidden;display:flex;flex-direction:column;} .ms-meeting-stage :deep(.ms-layout){flex:1;min-height:0;}
@media(max-width:900px){.ms-meeting-body.has-panel{grid-template-columns:minmax(0,1fr)} .ms-meeting-body.has-panel .ms-meeting-stage{display:none}.ms-meeting-body{padding:10px}.ms-meeting-header{padding:9px 12px}.ms-logo{font-size:16px}}
</style>

<style scoped>
.ms-meeting-header{min-height:58px;padding:7px 16px;gap:8px}.ms-meeting-body{gap:8px;padding:8px 12px;overflow:hidden;position:relative}.ms-meeting-stage{overflow:hidden}.ms-room-name .room-mood{font-size:9px}
@media(max-width:900px){.ms-meeting-body.has-panel .ms-meeting-stage{display:flex}.ms-meeting-body.has-panel>aside{position:absolute;z-index:10;right:8px;top:8px;bottom:8px;width:min(310px,calc(100% - 16px))}.ms-logo{font-size:14px}.ms-meeting-header{padding:6px 9px}.ms-mode-toggle{padding:6px 9px}.meeting-header-actions{gap:5px}}
</style>

<style scoped>
.active-speakers{max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary)!important;font-weight:800}
[data-background='romantic']{--mood-label-radius:18px}.room-mood{font-weight:800}
[data-background='arcade']{--mood-label-radius:0}
[data-background='cozyCinema'] :deep(.ms-tile){border-width:5px}
[data-background='vintageCafe'] :deep(.ms-tile){box-shadow:inset 0 0 0 3px #d8c9a830}
[data-background='midnight'] :deep(.ms-tile-label){border-left:3px solid #d8c9a8}
[data-background='goldenHour'] :deep(.ms-avatar){background:#f1cc83}
[data-background='forestRetreat'] :deep(.ms-avatar){background:#bdd3a8}
[data-background='romantic'] :deep(.ms-avatar){background:#e7b6b0}
</style>
