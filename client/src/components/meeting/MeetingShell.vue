<script setup>
import { ref, computed, onBeforeUnmount, toRef } from 'vue'
import { useHostApprovals } from '../../composables/useHostApprovals.js'
import { notify, dismissToast } from '../../services/toast.js'
import MeetingToolbar from './MeetingToolbar.vue'
import MeetingSidebar from './MeetingSidebar.vue'
import AccountControls from '../common/AccountControls.vue'
import MeetingSettings from './MeetingSettings.vue'
import MoodSoundPlayer from './MoodSoundPlayer.vue'
import BreakoutPanel from './BreakoutPanel.vue'
import RoomSoundboard from './RoomSoundboard.vue'
import { useRoomSoundEffects } from '../../composables/useRoomSoundEffects.js'
import { moods, resolveMood } from '../../config/moods.js'
import { useAppearanceStore } from '../../stores/appearance'
const props = defineProps({ room:{type:Object,required:true}, livekitRoom:{type:Object,default:null}, participants:{type:Array,default:()=>[]}, messages:{type:Array,default:()=>[]}, micEnabled:Boolean, cameraEnabled:Boolean, micBusy:Boolean, cameraBusy:Boolean, sharing:Boolean, shareBusy:Boolean, canShare:Boolean, handRaised:Boolean, handBusy:Boolean, isHost:Boolean, hostBusy:String, hostError:String, features:{type:Object,default:()=>({})}, options:{type:Object,default:()=>({view:{}})},elapsed:String,recording:Boolean,recordBusy:Boolean,reactions:{type:Array,default:()=>[]} })
const emit = defineEmits(['mic','camera','share','hand','moderate','leave','audio','send','view','device','refresh-devices','fullscreen','invite','copy-room-id','move','record','end','reaction','background','background-image','low-data'])
const appearance = useAppearanceStore()
const panel = ref('')
const endDialog=ref(null)
let arrivalToast
const admission=useHostApprovals(()=>props.room.id,()=>props.isHost,(arrivals)=>{
  if(arrivalToast)dismissToast(arrivalToast)
  arrivalToast=notify(arrivals.length===1 ? `${arrivals[0].participantName} meminta bergabung.` : `${arrivals.length} peserta baru meminta bergabung.`, {
    title:'♧ Ada tamu di waiting room', duration:12000,
    actions:[{label:'Lihat permintaan',run:()=>{panel.value='participants'}}],
  })
})
const approvals=computed(()=>({requests:admission.requests.value,busy:admission.busy.value,decide:admission.decide}))
onBeforeUnmount(()=>{if(arrivalToast)dismissToast(arrivalToast)})
const speakers=computed(()=>props.participants.filter(p=>p.isSpeaking).map(p=>p.name).join(', '))
const activeMood=computed(()=>resolveMood(props.room.theme,props.options.view.background))
const soundboard=useRoomSoundEffects(toRef(props,'livekitRoom'),computed(()=>props.room.mode))
function togglePanel(next) { panel.value = panel.value === next ? '' : next;if(panel.value==='tools')emit('refresh-devices');if(panel.value==='sounds')void soundboard.enable() }
function enableMeetingAudio() { emit('audio'); void soundboard.enable() }
</script>
<template>
  <div class="ms-meeting-root" :data-background="activeMood" :style="{'--mood-accent':moods[activeMood].accent,'--mood-tile-radius':moods[activeMood].tileRadius,'--mood-avatar-radius':moods[activeMood].avatarRadius,'--mood-frame-style':moods[activeMood].frameStyle}">
    <header class="ms-meeting-header"><RouterLink class="ms-logo" to="/">✦ MeetSpace</RouterLink><div class="ms-room-name"><small>ON THE AIR · {{ room.mode }} <span v-if="options.view.showTimer">· ◷ {{elapsed}}</span></small><strong>{{ room.name }}</strong><small class="connection-status" role="status">{{['reconnecting','signalReconnecting'].includes(options.network?.state)?'Menghubungkan ulang…':options.network?.quality==='poor'?'● Jaringan lemah':options.network?.quality==='lost'?'● Koneksi terputus':options.network?.quality==='excellent'?'● Koneksi baik':options.network?.quality==='good'?'● Koneksi cukup':'◌ Memeriksa koneksi'}}</small><small class="room-mood">{{moods[activeMood].icon}} {{moods[activeMood].name}}</small><small class="active-speakers" :title="speakers">{{speakers ? "♫ " + speakers : "\u00a0"}}</small><small v-if="participants.some(p=>p.recording)" class="recording-indicator" role="status">● Host sedang merekam lokal</small></div><div class="meeting-header-actions"><MoodSoundPlayer :mood="activeMood" /><button class="ms-mode-toggle" @click="appearance.toggleTheme()">{{appearance.isDark?'☀':'☾'}}</button><AccountControls /></div></header>
    <div class="ms-meeting-body" :class="{ 'has-panel': panel }">
      <main class="ms-meeting-stage"><slot /></main>
      <MeetingSidebar v-if="['participants','chat'].includes(panel)" :panel="panel" :participants="participants" :messages="messages" :room-id="room.id" :approvals="approvals"
        :is-host="isHost" :can-moderate="isHost && room.mode==='professional'" :host-busy="hostBusy" :host-error="hostError"
        @close="panel=''" @send="emit('send',$event)" @moderate="emit('moderate',$event)" />
      <aside v-else-if="panel" class="ms-tools-sidebar"><header><strong>{{panel==='tools'?'⚙ Room tools':panel==='breakouts'?'▦ Ruang kelompok':panel==='sounds'?'♫ Sound effects':'♡ Reactions'}}</strong><button aria-label="Tutup panel" @click="panel=''">×</button></header><div class="tools-content">
        <MeetingSettings v-if="panel==='tools'" :background="options.background" :network="options.network" @background="emit('background',$event)" @background-image="emit('background-image',$event)" @low-data="emit('low-data',$event)" :view="options.view" :room-mood="room.theme" :professional="room.mode==='professional'" :devices="options.devices" :selected-devices="options.selectedDevices" :device-busy="options.deviceBusy" @view="emit('view',$event)" @device="emit('device',$event)" @refresh-devices="emit('refresh-devices')" @fullscreen="emit('fullscreen')" @invite="emit('invite')" @copy-room-id="emit('copy-room-id')" />
        <BreakoutPanel v-else-if="panel==='breakouts'" :room="room" :is-host="isHost" @move="emit('move',$event)" />
        <RoomSoundboard v-else-if="panel==='sounds'" :effects="soundboard.effects.value" :muted="soundboard.muted.value" @send="soundboard.send" @mute="soundboard.muted.value=!soundboard.muted.value" @enable="soundboard.enable" />
        <div v-else class="reaction-picker"><p>Kirim sedikit semangat ke ruangan.</p><div><button v-for="emoji in ['👏','❤️','😂','🎉','👍','☕']" :key="emoji" :aria-label="`Kirim reaksi ${emoji}`" @click="emit('reaction',emoji)">{{emoji}}</button></div></div>
      </div></aside>
    </div>
    <MeetingToolbar :features="features" :mic-enabled="micEnabled" :camera-enabled="cameraEnabled"
      :mic-busy="micBusy" :camera-busy="cameraBusy" :sharing="sharing" :share-busy="shareBusy" :can-share="canShare"
      :hand-raised="handRaised" :hand-busy="handBusy" :panel="panel" :waiting-count="admission.requests.value.length"
      :is-host="isHost" :professional="room.mode==='professional'" :recording="recording" :record-busy="recordBusy"
      @mic="emit('mic')" @camera="emit('camera')" @share="emit('share')" @hand="emit('hand')"
      @leave="emit('leave')" @audio="enableMeetingAudio" @panel="togglePanel" @record="emit('record')" @end="endDialog.showModal()" />
    <div class="meeting-reactions" aria-live="polite"><div v-for="reaction in reactions" :key="reaction.id"><span>{{reaction.emoji}}</span><small>{{reaction.name}}</small></div></div>
    <dialog ref="endDialog" class="ms-card end-dialog" aria-labelledby="end-title"><h2 id="end-title">Akhiri pertemuan ini?</h2><p>Semua peserta di room ini{{room.parentRoomId?'':' dan breakout rooms'}} akan dikeluarkan. Undangan room tidak bisa digunakan lagi.</p><div><button class="ms-button ms-button-outline" @click="endDialog.close()">Batal</button><button class="ms-button ms-button-pink" @click="endDialog.close();emit('end')">Akhiri untuk semua</button></div></dialog>
  </div>
</template>
<style scoped>
.ms-meeting-root { --ms-line:var(--mood-accent,var(--color-secondary,#4F5B2A)); min-height:100dvh; height:100dvh; display:flex;flex-direction:column;overflow:hidden;background:var(--bg-app);color:var(--text-primary); background-image:radial-gradient(color-mix(in srgb,var(--ms-line) 13%,transparent) 1px,transparent 1px);background-size:22px 22px; }
.ms-meeting-header {flex:none;min-height:75px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;border-bottom:3px solid var(--ms-line);background:var(--bg-surface);}
.ms-logo{color:var(--text-primary);font-weight:1000;font-size:22px;text-decoration:none;white-space:nowrap}.ms-room-name{display:flex;flex-direction:column;text-align:center;min-width:0}.ms-room-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-room-name small{letter-spacing:1px;color:var(--text-secondary);font-size:10px}.ms-mode-toggle{border:2px solid var(--ms-line);border-radius:20px;background:#D8C9A8;color:#303826;padding:9px 13px;cursor:pointer;font-weight:900;white-space:nowrap;box-shadow:2px 3px 0 var(--ms-line)}
.meeting-header-actions{display:flex;gap:10px;align-items:center}.ms-room-name .recording-indicator{color:var(--color-danger);margin-top:4px}.ms-tools-sidebar{border:3px solid var(--ms-line);border-radius:17px;background:var(--bg-surface);box-shadow:4px 5px 0 var(--ms-line);display:flex;flex-direction:column;min-height:0;overflow:hidden}.ms-tools-sidebar>header{display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:2px solid var(--ms-line);background:var(--bg-elevated)}.ms-tools-sidebar>header button{border:0;background:none;color:var(--text-primary);font-size:22px}.tools-content{overflow:auto;flex:1;min-height:0}.reaction-picker{padding:20px}.reaction-picker p{font-size:13px;color:var(--text-secondary)}.reaction-picker>div{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.reaction-picker button{font-size:30px;padding:9px;border:2px solid var(--ms-line);border-radius:12px;background:var(--bg-elevated)}.meeting-reactions{position:fixed;bottom:130px;left:25px;z-index:20;pointer-events:none;display:flex;gap:14px;flex-wrap:wrap;max-width:70vw}.meeting-reactions>div{display:grid;place-items:center;gap:4px;animation:reaction-in .3s ease-out}.meeting-reactions span{font-size:38px}.meeting-reactions small{background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-color);padding:2px 7px;border-radius:10px;max-width:100px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-size:10px}.end-dialog::backdrop{background:#182a2580}.end-dialog{padding:30px;width:calc(100% - 40px);max-width:480px;color:var(--text-primary)}.end-dialog h2{margin:0 0 15px}.end-dialog>div{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-top:25px}@keyframes reaction-in{from{transform:translateY(25px);opacity:0}to{transform:translateY(0);opacity:1}}
.ms-meeting-root[data-background='midnight']{background-image:repeating-linear-gradient(135deg,transparent 0 25px,#4f5b2a20 25px 27px)}.ms-meeting-root[data-background='romantic']{background-size:cover;background-image:radial-gradient(ellipse at 20% 20%,#fa678125,transparent 65%)}.ms-meeting-root[data-background='cozyCinema']{background-size:cover;background-image:linear-gradient(90deg,#b8892d20,transparent,#b8892d20)}.ms-meeting-root[data-background='vintageCafe']{background-image:repeating-linear-gradient(0deg,transparent 0 28px,#b8892d20 28px 30px)}.ms-meeting-root[data-background='goldenHour']{background-size:cover;background-image:radial-gradient(ellipse at bottom,#ffc94d35,transparent 70%)}.ms-meeting-root[data-background='forestRetreat']{background-size:cover;background-image:radial-gradient(ellipse at top left,#59b29240,transparent 75%)}.ms-meeting-root[data-background='arcade']{background-image:linear-gradient(#fa678115 1px,transparent 1px),linear-gradient(90deg,#59b29220 1px,transparent 1px);background-size:30px 30px}.ms-meeting-root[data-background='focus']{background-image:radial-gradient(#59b29250 1px,transparent 1px);background-size:18px 18px}
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
