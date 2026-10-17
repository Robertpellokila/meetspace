<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { COUPLE_STICKERS, COUPLE_CHALLENGES } from '../../config/coupleInteractions.js'

const props = defineProps({
  interactions: { type: Array, default: () => [] },
  identities: { type: Array, default: () => [] },
  participants: { type: Array, default: () => [] },
  localIdentity: { type: String, default: '' },
  connected: Boolean,
})
const emit = defineEmits(['send', 'respond'])
const open = ref(false)
const target = ref('')
const now = ref(Date.now())
const ticker = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(ticker))
const others = computed(() => props.identities.filter(id => id !== props.localIdentity))
watch(others, ids => { if (!ids.includes(target.value)) target.value = ids[0] || '' }, { immediate: true })
const latest = computed(() => props.interactions.findLast(item => item.type === 'challenge' && item.target === props.localIdentity && item.status === 'pending') || props.interactions.reduce((current, item) => !current || (item.respondedAt || item.at) > (current.respondedAt || current.at) ? item : current, null))
const recentChallenges = computed(() => props.interactions.filter(item => item.type === 'challenge').slice(-3).reverse())
const visible = computed(() => latest.value && (now.value - (latest.value.respondedAt || latest.value.at) < 6500 || (latest.value.type === 'challenge' && latest.value.target === props.localIdentity && latest.value.status === 'pending')))
const sticker = computed(() => COUPLE_STICKERS.find(item => item.id === latest.value?.itemId))
const challenge = computed(() => COUPLE_CHALLENGES.find(item => item.id === latest.value?.itemId))
function name(id) {
  const person = props.participants.find(item => item?.identity === id || item?.participant?.identity === id || item?.id === id)
  return person?.name || person?.participant?.name || (id === props.localIdentity ? 'Kamu' : 'Pasanganmu')
}
function sendSticker(id) { if (props.connected) emit('send', 'sticker', id, '') }
function drawChallenge() {
  if (!props.connected || !target.value) return
  const index = Math.floor(Math.random() * COUPLE_CHALLENGES.length)
  emit('send', 'challenge', COUPLE_CHALLENGES[index].id, target.value)
  open.value = false
}
</script>

<template>
  <div class="interaction-dock">
    <div v-if="visible" :key="latest.eventId" class="interaction-card" :class="{sticker:latest.type === 'sticker'}" role="status" aria-live="polite">
      <template v-if="latest.type === 'sticker' && sticker"><span class="sticker-icon" :class="latest.itemId" aria-hidden="true">{{ sticker.icon }}</span><strong>{{ name(latest.from) }} mengirim {{ sticker.label }}</strong></template>
      <template v-else-if="latest.type === 'challenge' && challenge"><span class="challenge-icon" aria-hidden="true">{{ challenge.icon }}</span><div><small>{{ name(latest.from) }} menantang {{ name(latest.target) }}</small><strong>{{ challenge.title }}</strong><p>{{ challenge.text }}</p><span v-if="latest.status !== 'pending'" class="response">{{ latest.status === 'accepted' ? '✓ Tantangan diterima' : '↷ Dilewati tanpa hukuman' }}</span><div v-else-if="latest.target === localIdentity" class="response-actions"><button type="button" @click="emit('respond',latest.eventId,true)">Terima</button><button type="button" @click="emit('respond',latest.eventId,false)">Lewati</button></div></div></template>
    </div>
    <div v-if="open" class="interaction-panel"><div class="panel-title"><strong>✦ Interaksi pasangan</strong><button type="button" aria-label="Tutup interaksi" @click="open=false">×</button></div><small>Kirim stiker animasi ke seluruh room</small><div class="sticker-grid"><button v-for="item in COUPLE_STICKERS" :key="item.id" type="button" :disabled="!connected" :title="item.label" @click="sendSticker(item.id)"><span>{{ item.icon }}</span>{{ item.label }}</button></div><label>Teman yang ditantang<select v-model="target" :disabled="!others.length"><option v-for="id in others" :key="id" :value="id">{{ name(id) }}</option></select></label><button class="challenge-button" type="button" :disabled="!connected || !target" @click="drawChallenge">🎟️ Ambil tantangan lucu</button><small>Tantangan selalu opsional. Pasanganmu boleh melewatinya.</small><div v-if="recentChallenges.length" class="challenge-history"><strong>Tantangan terbaru</strong><div v-for="item in recentChallenges" :key="item.eventId"><span>{{ COUPLE_CHALLENGES.find(card => card.id === item.itemId)?.title }} · {{ name(item.target) }}</span><small>{{ item.status === 'accepted' ? 'Diterima' : item.status === 'skipped' ? 'Dilewati' : 'Menunggu jawaban' }}</small><div v-if="item.status === 'pending' && item.target === localIdentity" class="response-actions"><button type="button" @click="emit('respond',item.eventId,true)">Terima</button><button type="button" @click="emit('respond',item.eventId,false)">Lewati</button></div></div></div></div>
    <button class="dock-toggle" type="button" :aria-expanded="open" :disabled="!connected" @click="open=!open">{{ open ? '× Tutup' : '💌 Stiker & tantangan' }}</button>
  </div>
</template>

<style scoped>
.interaction-dock{position:absolute;z-index:12;left:12px;bottom:12px;pointer-events:none;color:var(--text-primary,#293127)}.interaction-dock>*{pointer-events:auto}.dock-toggle,.interaction-panel,.interaction-card{border:2px solid var(--ms-line,var(--border-color,#4f5b2a));border-radius:12px;background:var(--bg-surface,#fff9ec);box-shadow:4px 4px 0 var(--ms-line,var(--border-color,#4f5b2a))}.dock-toggle{padding:9px 13px;font-size:11px;font-weight:900;cursor:pointer}.dock-toggle:disabled{opacity:.6;cursor:default}.interaction-panel{width:min(310px,calc(100vw - 46px));max-height:min(360px,65vh);overflow:auto;padding:13px;margin-bottom:10px;display:grid;gap:10px}.panel-title{display:flex;justify-content:space-between;align-items:center}.panel-title strong{font:900 16px var(--font-display,Georgia,serif)}.panel-title button{border:0;background:transparent;font-size:23px;cursor:pointer;color:inherit}.interaction-panel small{font-size:10px;color:var(--text-secondary)}.sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.sticker-grid button{border:1.5px solid var(--ms-line,var(--border-color,#4f5b2a));border-radius:9px;background:var(--bg-elevated);font-size:9px;font-weight:800;cursor:pointer;padding:5px 2px}.sticker-grid span{display:block;font-size:24px}.interaction-panel label{display:grid;gap:5px;font-size:11px;font-weight:900}.interaction-panel select{min-width:0;width:100%;padding:8px;border:1.5px solid var(--ms-line,var(--border-color,#4f5b2a));border-radius:7px;background:var(--bg-elevated);color:inherit}.challenge-button{border:2px solid var(--ms-line,var(--border-color,#4f5b2a));border-radius:9px;padding:10px;background:var(--color-accent,#ffca5a);font-size:11px;font-weight:900;cursor:pointer}.challenge-history{border-top:1px dashed var(--ms-line,var(--border-color,#4f5b2a));padding-top:8px;display:grid;gap:6px}.challenge-history>strong{font-size:11px}.challenge-history>div{display:grid;gap:2px;border-radius:7px;background:var(--bg-elevated);padding:6px;font-size:10px}.interaction-card{display:flex;align-items:center;gap:12px;width:min(310px,calc(100vw - 46px));padding:10px 12px;margin-bottom:10px;animation:enter .4s ease-out}.interaction-card.sticker{min-height:95px}.interaction-card strong{display:block;font-size:13px}.interaction-card small{font-size:10px}.interaction-card p{font-size:11px;line-height:1.3;margin:4px 0}.sticker-icon{font-size:48px;animation:bounce 1.2s ease-in-out infinite}.challenge-icon{font-size:32px}.response{font-size:10px;font-weight:900}.response-actions{display:flex;gap:5px;margin-top:8px}.response-actions button{border:1.5px solid var(--ms-line,var(--border-color,#4f5b2a));border-radius:7px;background:var(--color-accent,#ffca5a);padding:5px 9px;font-size:10px;font-weight:900;cursor:pointer}.response-actions button:last-child{background:var(--bg-elevated)}button:focus-visible,select:focus-visible{outline:3px dashed var(--color-accent,#b8892d);outline-offset:2px}@keyframes enter{from{opacity:0;transform:translateY(14px) scale(.92)}to{opacity:1;transform:none}}@keyframes bounce{50%{transform:translateY(-11px) rotate(-9deg)}}@media(prefers-reduced-motion:reduce){.interaction-card,.sticker-icon{animation:none}}
.sticker-icon.heart{animation:heartbeat 1s ease-in-out infinite}.sticker-icon.confetti{animation:celebrate 1.1s ease-in-out infinite}.sticker-icon.rose{animation:float 1.6s ease-in-out infinite}.sticker-icon.applause{animation:clap .55s ease-in-out infinite}@keyframes heartbeat{50%{transform:scale(1.28)}}@keyframes celebrate{50%{transform:translateY(-12px) rotate(16deg)}}@keyframes float{50%{transform:translateY(-11px) rotate(-7deg)}}@keyframes clap{50%{transform:rotate(24deg) scale(1.16)}}@media(prefers-reduced-motion:reduce){.sticker-icon.heart,.sticker-icon.confetti,.sticker-icon.rose,.sticker-icon.applause{animation:none}}
</style>
