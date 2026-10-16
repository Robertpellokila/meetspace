<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { WYR_CATEGORIES, getWyrQuestion } from '../../../config/wouldYouRatherQuestions.js'
import { quizCommit } from '../../../composables/quizCommit.js'

const props = defineProps({
  game: { type: Object, default: null },
  participants: { type: Array, default: () => [] },
  playerIdentities: { type: Array, default: () => [] },
  playerIdentity: { type: String, default: '' },
  playerCount: { type: Number, default: 0 },
  isHost: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  soundEnabled: { type: Boolean, default: true },
  gameState: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['action', 'restart', 'back'])
const state = computed(() => props.gameState || {})
const category = computed(() => state.value.category || 'romantic')
const index = computed(() => Number.isSafeInteger(state.value.index) ? state.value.index : 0)
const phase = computed(() => state.value.phase || 'voting')
const question = computed(() => getWyrQuestion(category.value, index.value))
const players = computed(() => props.playerIdentities.slice(0, 8))
const me = computed(() => props.playerIdentity)
const inGame = computed(() => players.value.length >= 2 && players.value.includes(me.value))
const blocked = computed(() => !inGame.value || props.readonly || props.paused)
const commits = computed(() => state.value.commits || {})
const reveals = computed(() => state.value.reveals || {})
const locked = computed(() => Object.prototype.hasOwnProperty.call(commits.value, me.value))
const revealed = computed(() => Object.prototype.hasOwnProperty.call(reveals.value, me.value))
const count = computed(() => players.value.length)
const totals = computed(() => [0,1].map(choice => players.value.filter(id => reveals.value[id] === choice).length))
const percentages = computed(() => totals.value.map(v => count.value ? Math.round(v / count.value * 100) : 0))
const myVote = computed(() => reveals.value[me.value])
const roundKey = computed(() => `${category.value}:${index.value}:${question.value?.id || ''}`)
const selected = ref(null)
const secret = ref(null)
const busy = ref(false)
const notice = ref('')
const revealSent = ref('')
let busyTimer = null

function displayName(id, i) {
  const p = props.participants.find(p => p?.identity === id || p?.participant?.identity === id || p?.id === id)
  return p?.name || p?.participant?.name || (id === me.value ? 'You' : `Player ${i + 1}`)
}
function send(action) {
  if (!blocked.value) emit('action', action)
}
function lockVote() {
  if (blocked.value || phase.value !== 'voting' || locked.value || busy.value || selected.value === null || !question.value) return
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`
  secret.value = { key: roundKey.value, choice: selected.value, nonce }
  busy.value = true
  emit('action', { type: 'wyr-commit', questionId: question.value.id, commit: quizCommit(question.value.id, selected.value, nonce) })
  clearTimeout(busyTimer)
  busyTimer = setTimeout(() => { busy.value = false }, 1500)
}
function revealVote() {
  if (blocked.value || phase.value !== 'revealing' || revealed.value || !question.value || revealSent.value === roundKey.value) return
  if (secret.value?.key !== roundKey.value) {
    notice.value = 'Suara rahasia hilang dari browser ini. Jangan refresh selama voting. Minta host me-restart game jika diperlukan.'
    return
  }
  revealSent.value = roundKey.value
  emit('action', { type: 'wyr-reveal', questionId: question.value.id, choice: secret.value.choice, nonce: secret.value.nonce })
  // No application-layer ACK; permit retry if state has not changed.
  clearTimeout(busyTimer)
  busyTimer = setTimeout(() => { if (!revealed.value) revealSent.value = '' }, 1800)
}
function chooseCategory(value) {
  if (props.readonly || !props.isHost || (phase.value !== 'results' && Object.keys(commits.value).length)) return
  if (category.value !== value) emit('action', { type: 'wyr-set-category', category: value })
}
function nextQuestion() {
  if (blocked.value || phase.value !== 'results') return
  send({ type: 'wyr-next' })
}
watch(roundKey, () => {
  selected.value = null
  secret.value = null
  busy.value = false
  notice.value = ''
  revealSent.value = ''
  clearTimeout(busyTimer)
})
watch([phase, roundKey, revealed, () => props.readonly, () => props.paused], ([p]) => {
  if (p === 'revealing' && !props.readonly && !props.paused && !revealed.value && secret.value?.key === roundKey.value) revealVote()
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(busyTimer))
</script>

<template>
  <section class="wyr" aria-label="Would You Rather multiplayer">
    <header class="hero">
      <div><span class="eyebrow">✦ MEETSPACE · COUPLE ARCADE</span><h2>Would You <em>Rather?</em></h2><p>Two choices. One honest answer. Let's compare!</p></div>
      <span class="round-pill">QUESTION {{ index + 1 }}</span>
    </header>

    <div class="filters">
      <div class="categories" role="group" aria-label="Question category">
        <button v-for="c in WYR_CATEGORIES" :key="c.id" type="button" class="category" :class="{active: category === c.id}" :aria-pressed="category === c.id" :disabled="!isHost || readonly || (phase !== 'results' && Object.keys(commits).length > 0)" @click="chooseCategory(c.id)">{{ c.icon }} {{ c.title }}</button>
      </div>
      <span class="phase">{{ phase === 'voting' ? '🔒 Secret Voting' : phase === 'revealing' ? '🔓 Revealing' : '✨ Results' }}</span>
    </div>

    <div class="main-content">
      <div class="question-head"><span>THIS OR THAT?</span><span>{{ players.length }} PLAYERS</span></div>
      <h3>{{ question?.text || 'Preparing question…' }}</h3>
      <div class="status" role="status">
        <strong v-if="paused">Game paused by host</strong>
        <strong v-else-if="!inGame">Watching the game</strong>
        <strong v-else-if="phase === 'results'">The results are in! ✨</strong>
        <strong v-else-if="phase === 'revealing'">Everyone voted — revealing choices…</strong>
        <strong v-else-if="locked">🔒 Vote locked. Waiting for other players…</strong>
        <strong v-else>Pick the option you'd rather choose!</strong>
      </div>

      <div class="choices">
        <button v-for="(option, i) in question?.options || []" :key="`${roundKey}:${i}`" type="button"
          class="choice" :class="[i === 0 ? 'pink' : 'olive', {picked:selected === i, voted:phase === 'results' && myVote === i, disabled:phase !== 'voting' || locked}]"
          :disabled="blocked || phase !== 'voting' || locked" :aria-pressed="selected === i"
          @click="selected = i">
          <span class="choice-index">{{ i === 0 ? 'OPTION A' : 'OPTION B' }}</span>
          <span class="choice-icon">{{ i === 0 ? '💗' : '✨' }}</span>
          <strong>{{ option }}</strong>
          <span v-if="selected === i && phase === 'voting'" class="chosen">✓ YOUR PICK</span>
          <span v-if="phase === 'results'" class="result-line"><span class="bar" :style="{width:percentages[i] + '%'}"></span><b>{{ percentages[i] }}%</b><small>{{ totals[i] }} vote{{ totals[i] === 1 ? '' : 's' }}</small></span>
        </button>
      </div>

      <div class="actions">
        <button v-if="phase === 'voting'" class="primary" type="button" :disabled="blocked || locked || selected === null || busy" @click="lockVote">{{ locked ? '✓ Locked' : busy ? 'Sending…' : '🔒 Lock My Vote' }}</button>
        <button v-else-if="phase === 'revealing'" class="primary" type="button" :disabled="blocked || revealed" @click="revealVote">{{ revealed ? '✓ Revealed' : '🔓 Reveal My Vote' }}</button>
        <button v-else class="primary" type="button" :disabled="blocked" @click="nextQuestion">Next Question →</button>
        <button v-if="isHost" class="secondary" type="button" :disabled="readonly" @click="emit('restart')">↻ New Game</button>
      </div>

      <div class="player-progress"><span v-for="(id,i) in players" :key="id" class="player-pill"><i :class="{ready:phase === 'voting' ? Boolean(commits[id]) : Object.prototype.hasOwnProperty.call(reveals,id)}"></i>{{ displayName(id,i) }}</span></div>
      <p v-if="notice" role="alert" class="notice">{{ notice }}</p>
      <p v-if="phase === 'results'" class="discussion">💬 Now tell each other why you made that choice.</p>
    </div>
    <footer>✦ MADE FOR CONVERSATIONS THAT MATTER <span>NO RIGHT OR WRONG ANSWERS ♥</span></footer>
  </section>
</template>

<style scoped>
.wyr{--ink:var(--text-primary,#303826);--line:var(--border-color,#4f5b2a);--paper:var(--bg-surface,#fffaf4);--soft:var(--bg-elevated,#eee7d9);--olive:var(--color-secondary,#4f5b2a);--muted:var(--text-secondary,#77756d);display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:auto;gap:16px;padding:18px;color:var(--ink);background:var(--paper);container-type:inline-size}
.hero{border:2px solid var(--line);border-radius:18px;box-shadow:4px 4px 0 var(--line);padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--soft)}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--olive)}.hero h2{font-size:clamp(24px,4vw,35px);letter-spacing:-1px;font-family:var(--font-display,Georgia,serif);margin:5px 0}.hero em{color:#c16b86}.hero p{font-size:12px;margin:0;color:var(--muted)}.round-pill,.phase{padding:8px 11px;border:2px solid var(--line);border-radius:30px;background:var(--paper);font-size:10px;font-weight:900;white-space:nowrap}.filters{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.categories{display:flex;gap:8px;flex-wrap:wrap}.category{padding:9px 12px;border:2px solid var(--line);background:var(--paper);color:var(--ink);border-radius:24px;cursor:pointer;font-weight:850;font-size:11px}.category.active{background:var(--olive);color:white}.category:disabled{cursor:not-allowed;opacity:.75}
.main-content{display:flex;flex-direction:column;gap:15px;flex:1;max-width:980px;width:100%;margin:0 auto}.question-head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:1px}.main-content h3{margin:0;text-align:center;font-size:clamp(18px,3vw,27px);font-family:var(--font-display,Georgia,serif)}.status{font-size:12px;text-align:center;color:var(--olive)}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.choice{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-width:0;min-height:210px;padding:20px;border:3px solid #3a3d2a;border-radius:18px;box-shadow:4px 4px 0 #3a3d2a;cursor:pointer;color:#38352c;transition:transform .2s ease,box-shadow .2s ease;text-align:center;overflow:hidden}.choice.pink{background:#f9d7e1}.choice.olive{background:#dce9c7}.choice:hover:not(:disabled){transform:translateY(-4px);box-shadow:5px 8px 0 #3a3d2a}.choice.picked{outline:4px solid #c07d46;outline-offset:2px}.choice:disabled{cursor:default;opacity:1}.choice-index{font-size:10px;letter-spacing:1.5px;font-weight:950}.choice-icon{font-size:41px}.choice strong{font-size:clamp(15px,2vw,21px);line-height:1.4;max-width:310px}.chosen{padding:5px 8px;border-radius:22px;background:#fffaf4;border:1px solid #3a3d2a;font-size:10px;font-weight:900}.choice.voted{outline:3px solid #c07d46;outline-offset:2px}.result-line{width:100%;max-width:290px;display:flex;align-items:center;gap:8px;position:relative;border-radius:9px;padding:9px;background:#ffffff99;overflow:hidden;font-size:12px}.result-line .bar{position:absolute;inset:0 auto 0 0;background:#d6a4b8a0;transition:width .6s ease}.choice.olive .bar{background:#accd8da0}.result-line b,.result-line small{position:relative;z-index:1}.result-line small{margin-left:auto}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.actions button{padding:12px 18px;border:2px solid var(--line);border-radius:10px;font:inherit;font-weight:900;font-size:12px;cursor:pointer;box-shadow:3px 3px 0 var(--line)}.actions button.primary{background:var(--olive);color:#fff}.actions button.secondary{background:var(--paper);color:var(--ink)}.actions button:disabled{opacity:.45;cursor:not-allowed}.player-progress{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.player-pill{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;border:1px solid var(--line);border-radius:22px;padding:7px 11px;background:var(--soft)}.player-pill i{width:9px;height:9px;border-radius:50%;background:#a5a5a5}.player-pill i.ready{background:#338a5c}.notice{padding:10px 12px;background:#ffdfd8;border:1px solid #af4932;border-radius:8px;font-size:12px}.discussion{margin:0;text-align:center;font-weight:850;color:#a45674;font-size:13px}.wyr footer{padding-top:10px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:9px;font-weight:850;color:var(--muted);letter-spacing:.5px}
@container (max-width:610px){.wyr{padding:12px;gap:12px}.hero{padding:12px}.hero p{display:none}.choices{gap:9px}.choice{min-height:170px;padding:10px;gap:7px}.choice-icon{font-size:27px}.choice strong{font-size:14px}.round-pill{font-size:9px}.main-content h3{font-size:19px}}@container (max-width:370px){.choices{grid-template-columns:1fr}.choice{min-height:122px}.round-pill{display:none}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
</style>
