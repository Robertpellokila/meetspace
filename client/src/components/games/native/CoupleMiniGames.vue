<script setup>
import { computed, ref, watch } from 'vue'
import { DATE_BINGO, EMOJI_RIDDLES, STORY_STARTERS } from '../../../config/coupleMiniGames.js'

const props = defineProps({
  game: { type: Object, required: true },
  gameState: { type: Object, default: () => ({}) },
  playerIdentities: { type: Array, default: () => [] },
  playerIdentity: { type: String, default: '' },
  participants: { type: Array, default: () => [] },
  isHost: Boolean, readonly: Boolean, paused: Boolean,
})
const emit = defineEmits(['action'])
const sentence = ref('')
const players = computed(() => props.playerIdentities.slice(0, 8))
const blocked = computed(() => props.readonly || props.paused || !players.value.includes(props.playerIdentity))
const state = computed(() => props.gameState || {})
const round = computed(() => Number.isInteger(state.value.round) ? state.value.round : 0)
const marked = computed(() => state.value.marked || {})
const bingoCells = computed(() => DATE_BINGO.map((_, index) => DATE_BINGO[(index + round.value * 4) % DATE_BINGO.length]))
const bingoLines = computed(() => {
  const lines = []
  for (let row = 0; row < 4; row++) lines.push([0, 1, 2, 3].map(col => row * 4 + col))
  for (let col = 0; col < 4; col++) lines.push([0, 1, 2, 3].map(row => row * 4 + col))
  lines.push([0, 5, 10, 15], [3, 6, 9, 12])
  return lines.filter(line => line.every(index => marked.value[index])).length
})
const riddleIndex = computed(() => Number.isInteger(state.value.index) ? state.value.index : 0)
const riddle = computed(() => EMOJI_RIDDLES[riddleIndex.value % EMOJI_RIDDLES.length])
const guesses = computed(() => state.value.guesses || {})
const myGuess = computed(() => guesses.value[props.playerIdentity])
const storyLines = computed(() => Array.isArray(state.value.lines) ? state.value.lines : [])
const storyStarter = computed(() => STORY_STARTERS[(state.value.starter || 0) % STORY_STARTERS.length])
const myStoryTurn = computed(() => players.value.length > 0 && players.value[storyLines.value.length % players.value.length] === props.playerIdentity)

function name(id) {
  const participant = props.participants.find(item => item?.identity === id || item?.participant?.identity === id || item?.id === id)
  return participant?.name || participant?.participant?.name || (id === props.playerIdentity ? 'Kamu' : `Pemain ${players.value.indexOf(id) + 1}`)
}
function send(action) { if (!blocked.value) emit('action', action) }
function addSentence() {
  const text = sentence.value.trim()
  if (!text || text.length > 120 || !myStoryTurn.value) return
  send({ type: 'story-add', text })
  sentence.value = ''
}
watch(() => storyLines.value.length, () => { sentence.value = '' })
</script>

<template>
  <section class="mini-game" :aria-label="game.title">
    <header class="mini-head"><div><small>✦ MEETSPACE · COUPLE ARCADE</small><h2>{{ game.icon }} {{ game.title }}</h2><p>{{ game.description }}</p></div><span class="round">{{ game.id === 'date-bingo' ? `KARTU ${round + 1}` : game.id === 'emoji-decode' ? `TEBAKAN ${riddleIndex + 1}` : `CERITA ${(gameState.starter || 0) + 1}` }}</span></header>

    <template v-if="game.id === 'date-bingo'">
      <div class="score-strip"><strong>{{ bingoLines }} Bingo selesai</strong><span>{{ Object.keys(marked).length }} / 16 kotak</span><button v-if="isHost" type="button" :disabled="blocked" @click="send({ type: 'bingo-new' })">Kartu baru ↻</button></div>
      <div class="bingo-grid"><button v-for="(prompt, index) in bingoCells" :key="`${round}-${index}`" type="button" :class="{done:marked[index]}" :disabled="blocked || (marked[index] && marked[index] !== playerIdentity)" :aria-pressed="Boolean(marked[index])" @click="send({ type: 'bingo-toggle', index })"><span>{{ marked[index] ? '✓' : '✦' }}</span><strong>{{ prompt }}</strong><small v-if="marked[index]">{{ name(marked[index]) }}</small></button></div>
      <p class="game-note">Selesaikan aktivitas bersama, lalu tandai kotaknya. Kamu bisa membatalkan kotak milikmu.</p>
    </template>

    <template v-else-if="game.id === 'emoji-decode'">
      <div class="score-strip"><span v-for="id in players.slice(0, 2)" :key="id"><strong>{{ name(id) }}</strong> · {{ gameState.scores?.[id] || 0 }} poin</span></div>
      <div class="riddle"><span class="riddle-emoji" aria-hidden="true">{{ riddle.emoji }}</span><small>PETUNJUK</small><h3>{{ riddle.hint }}</h3><p v-if="gameState.phase === 'results'">Jawaban: <strong>{{ riddle.options[riddle.answer] }}</strong>{{ gameState.winner ? ` · ${name(gameState.winner)} mendapat poin!` : ' · Belum ada yang tepat.' }}</p><p v-else-if="myGuess !== undefined">Tebakanmu sudah terkirim. Menunggu pasanganmu…</p><p v-else>Pilih satu jawaban. Kesempatanmu hanya sekali di ronde ini.</p></div>
      <div class="emoji-options"><button v-for="(option, index) in riddle.options" :key="index" type="button" :class="{correct:gameState.phase === 'results' && index === riddle.answer, selected:myGuess === index}" :disabled="blocked || gameState.phase === 'results' || myGuess !== undefined" @click="send({ type: 'emoji-guess', choice: index })"><span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}</button></div>
      <div v-if="gameState.phase === 'results' && isHost" class="next-row"><button type="button" :disabled="blocked" @click="send({ type: 'emoji-next' })">Tebakan berikutnya →</button></div>
    </template>

    <template v-else-if="game.id === 'story-chain'">
      <div class="score-strip"><strong>{{ storyLines.length }} / 8 kalimat</strong><span>{{ storyLines.length >= 8 ? 'Cerita selesai!' : `Giliran ${name(players[storyLines.length % players.length])}` }}</span><button v-if="isHost" type="button" :disabled="blocked" @click="send({ type: 'story-new' })">Cerita baru ↻</button></div>
      <div class="story-paper"><p class="story-starter">{{ storyStarter }}</p><ol><li v-for="(line, index) in storyLines" :key="index"><small>{{ name(line.actor) }}</small><span>{{ line.text }}</span></li></ol><p v-if="!storyLines.length" class="empty-line">Kalimat pertama menunggu pemain pertama…</p></div>
      <form v-if="storyLines.length < 8" class="story-form" @submit.prevent="addSentence"><label for="story-sentence">Lanjutkan ceritanya</label><div><input id="story-sentence" v-model="sentence" maxlength="120" autocomplete="off" :disabled="blocked || !myStoryTurn" :placeholder="myStoryTurn ? 'Tulis satu kalimat…' : 'Menunggu giliran pasanganmu…'" /><button type="submit" :disabled="blocked || !myStoryTurn || !sentence.trim()">Kirim →</button><button type="button" class="skip" :disabled="blocked || !myStoryTurn" @click="send({ type: 'story-skip' })">Lewati</button></div></form>
    </template>
    <p v-if="paused" class="pause-note">⏸ Game dijeda oleh host</p>
  </section>
</template>

<style scoped>
.mini-game{--line:var(--ms-line,var(--border-color,#4f5b2a));--paper:var(--bg-surface,#fff9ec);--ink:var(--text-primary,#293127);display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;overflow:auto;padding:18px;color:var(--ink);background:var(--paper)}.mini-head{display:flex;justify-content:space-between;align-items:start;gap:12px;border:2px solid var(--line);border-radius:14px;padding:12px 16px;background:var(--bg-elevated);box-shadow:3px 3px 0 var(--line)}.mini-head small{font-size:10px;font-weight:900;letter-spacing:1.2px}.mini-head h2{font:900 clamp(21px,3vw,30px)/1.1 var(--font-display,Georgia,serif);margin:5px 0}.mini-head p,.game-note{font-size:11px;margin:0;color:var(--text-secondary)}.round{font-size:10px;font-weight:900;white-space:nowrap;padding:7px 9px;border:2px solid var(--line);border-radius:20px}.score-strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px}.score-strip>span{padding:6px 10px;border-radius:8px;background:var(--bg-elevated)}button{cursor:pointer;font:inherit;color:inherit}.score-strip button,.next-row button,.story-form button{border:2px solid var(--line);border-radius:9px;background:var(--color-accent,#ffcc59);padding:7px 11px;font-size:11px;font-weight:900}.score-strip button:disabled,.next-row button:disabled,.story-form button:disabled,.bingo-grid button:disabled,.emoji-options button:disabled{opacity:.6;cursor:default}.bingo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;max-width:820px;width:100%;margin:auto}.bingo-grid button{min-height:clamp(62px,10vh,105px);border:2px solid var(--line);border-radius:10px;background:var(--bg-elevated);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;text-align:center;box-shadow:2px 2px 0 var(--line)}.bingo-grid button.done{background:#d7efcf}.bingo-grid button span{font-size:15px}.bingo-grid button strong{font-size:clamp(9px,1.1vw,12px);line-height:1.15}.bingo-grid button small{font-size:9px}.riddle{max-width:620px;width:100%;margin:4px auto;text-align:center;border:2px solid var(--line);border-radius:16px;padding:15px;background:var(--bg-elevated)}.riddle-emoji{display:block;font-size:clamp(40px,7vw,70px);letter-spacing:9px}.riddle small{font-size:10px;font-weight:900}.riddle h3{font:900 clamp(19px,3vw,27px) var(--font-display,Georgia,serif);margin:5px 0}.riddle p{font-size:12px;margin:4px 0}.emoji-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:720px;width:100%;margin:0 auto}.emoji-options button{min-height:80px;display:flex;align-items:center;justify-content:center;gap:9px;border:2px solid var(--line);border-radius:12px;background:var(--bg-elevated);font-weight:900;font-size:12px}.emoji-options button span{border-radius:50%;background:var(--color-accent,#ffcc59);width:23px;height:23px;display:grid;place-items:center}.emoji-options button.correct{background:#d7efcf}.emoji-options button.selected{outline:3px dashed var(--color-accent,#b8892d);outline-offset:2px}.next-row{text-align:center}.story-paper{max-width:750px;width:100%;margin:0 auto;border:2px solid var(--line);border-radius:13px;padding:16px;background:var(--bg-elevated);min-height:140px;overflow:auto}.story-starter{font:800 18px/1.35 var(--font-display,Georgia,serif);margin:0 0 12px}.story-paper ol{margin:0;padding-left:22px}.story-paper li{padding:4px 0;font-size:12px}.story-paper li small{font-size:10px;font-weight:900;margin-right:8px;color:var(--text-secondary)}.empty-line{font-size:11px;color:var(--text-secondary)}.story-form{max-width:750px;width:100%;margin:0 auto;display:grid;gap:5px}.story-form label{font-size:11px;font-weight:900}.story-form>div{display:flex;gap:6px}.story-form input{flex:1;min-width:0;border:2px solid var(--line);border-radius:9px;background:var(--bg-elevated);padding:9px;color:var(--ink)}.story-form .skip{background:var(--bg-elevated)}.pause-note{font-size:11px;font-weight:900;text-align:center;margin:0}@media(max-width:650px){.mini-game{padding:10px}.mini-head{flex-wrap:wrap}.bingo-grid{gap:4px}.bingo-grid button{min-height:72px}.emoji-options{grid-template-columns:1fr}.emoji-options button{min-height:47px}.story-form>div{flex-wrap:wrap}.story-form input{flex-basis:100%}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
