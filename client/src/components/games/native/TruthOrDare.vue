<script setup>
import { computed, ref, watch } from 'vue'
import { TOD_CATEGORIES, getTodCard } from '../../../config/truthOrDareCards.js'

const props = defineProps({
  game:{type:Object,default:null}, participants:{type:Array,default:()=>[]},
  playerIdentities:{type:Array,default:()=>[]}, playerIdentity:{type:String,default:''},
  playerCount:{type:Number,default:0}, isHost:{type:Boolean,default:false},
  readonly:{type:Boolean,default:false}, paused:{type:Boolean,default:false},
  soundEnabled:{type:Boolean,default:true}, gameState:{type:Object,default:()=>({})},
})
const emit = defineEmits(['action','restart','back'])
const s = computed(() => props.gameState || {})
const category = computed(() => s.value.category || 'romantic')
const phase = computed(() => s.value.phase || 'choosing')
const turn = computed(() => Number.isSafeInteger(s.value.turn) ? s.value.turn : 0)
const players = computed(() => [...new Set(props.playerIdentities)].slice(0,8))
const activeIdentity = computed(() => players.value[turn.value % (players.value.length || 1)] || '')
const localIdentity = computed(() => props.playerIdentity)
const isPlayer = computed(() => players.value.includes(localIdentity.value))
const myTurn = computed(() => isPlayer.value && activeIdentity.value === localIdentity.value)
const blocked = computed(() => props.readonly || props.paused || !myTurn.value || players.value.length < 2)
const activeCard = computed(() => getTodCard(category.value, s.value.kind, s.value.cardIndex))
const selectedCategory = computed(() => TOD_CATEGORIES.find(x => x.id === category.value))
const cardVisible = ref(false)
const pending = ref(false)
const notice = ref('')
let unlockTimer = null

function nameOf(id, fallback='Player') {
  const p = props.participants.find(x => x?.identity===id || x?.participant?.identity===id || x?.id===id)
  return p?.name || p?.participant?.name || (id === localIdentity.value ? 'You' : fallback)
}
function send(action) {
  if (pending.value || blocked.value) return
  pending.value = true
  emit('action', action)
  clearTimeout(unlockTimer)
  unlockTimer = setTimeout(() => { pending.value = false }, 900)
}
function choose(kind) { if (phase.value === 'choosing') send({ type:'tod-choose',kind }) }
function complete() { if (phase.value === 'challenge') send({type:'tod-complete'}) }
function skip() { if (phase.value === 'challenge') send({type:'tod-skip'}) }
function next() { if (phase.value === 'result') send({type:'tod-next'}) }
function changeCategory(nextCategory) {
  // Reducer authorizes player[0], not host identity; UI matches that rule.
  if (props.readonly || pending.value || phase.value === 'challenge' || localIdentity.value !== players.value[0]) return
  pending.value = true
  emit('action', {type:'tod-set-category',category:nextCategory})
  clearTimeout(unlockTimer)
  unlockTimer = setTimeout(() => { pending.value = false }, 900)
}
function requestReset() { if (props.isHost && !props.readonly) emit('restart') }
const cardIdentity = computed(() => `${category.value}:${turn.value}:${s.value.kind}:${s.value.cardIndex}:${phase.value}`)
watch(cardIdentity, () => {
  pending.value = false
  clearTimeout(unlockTimer)
  cardVisible.value = false
  notice.value = ''
  if (phase.value === 'challenge') requestAnimationFrame(() => { cardVisible.value = true })
}, {immediate:true})
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => clearTimeout(unlockTimer))
const instruction = computed(() => {
  if (props.paused) return 'Host sedang menjeda permainan.'
  if (!isPlayer.value) return 'Kamu sedang menonton ronde ini.'
  if (!myTurn.value) return `Tunggu giliran ${nameOf(activeIdentity.value)}.`
  if (phase.value === 'choosing') return 'Giliranmu! Pilih Truth atau Dare.'
  if (phase.value === 'challenge') return 'Lakukan tantangan atau lewati tanpa tekanan.'
  return 'Ronde selesai. Lanjutkan ke pemain berikutnya.'
})
</script>

<template>
  <section class="tod-root" aria-label="Truth or Dare multiplayer">
    <header class="hero">
      <div><div class="eyebrow">✦ MEETSPACE GAME CLUB / COUPLE EDITION</div><h2>Truth <em>or</em> Dare<span>?</span></h2><p>Ask something sweet, laugh together, and always respect boundaries.</p></div>
      <div class="round">ROUND <b>{{ turn + 1 }}</b></div>
    </header>

    <nav class="categories" aria-label="Card categories">
      <button v-for="item in TOD_CATEGORIES" :key="item.id" type="button"
        :class="['category',{active:category===item.id}]"
        :disabled="readonly || pending || phase==='challenge' || localIdentity!==players[0]"
        :aria-pressed="category===item.id" :title="item.description" @click="changeCategory(item.id)">
        {{ item.icon }} {{ item.title }}
      </button>
      <span class="phase-pill">{{ phase==='choosing'?'✦ CHOOSE':phase==='challenge'?'★ YOUR CARD':'✓ ROUND COMPLETE' }}</span>
    </nav>

    <div class="workspace">
      <aside class="players-panel">
        <h3>★ PLAYERS</h3>
        <div v-for="(id,i) in players" :key="id" class="player" :class="{current:id===activeIdentity}">
          <div class="avatar">{{ i%2===0?'♥':'✦' }}</div>
          <div class="person"><strong>{{ nameOf(id,`Player ${i+1}`) }}</strong><small>{{ id===activeIdentity?'● CURRENT TURN':id===localIdentity?'YOU':'READY' }}</small></div>
          <b>{{ s.scores?.[id] ?? 0 }}</b>
        </div>
        <p v-if="players.length<2" class="hint">Menunggu minimal 2 pemain…</p>
        <div class="rulebox"><strong>HOW TO PLAY</strong><p>Giliran bergantian. Selesaikan kartu untuk +1 poin, atau Skip tanpa penalti. Setiap tantangan boleh ditolak.</p></div>
      </aside>

      <main class="arena">
        <div class="turn-banner">
          <div><span class="mini-label">IT'S THEIR MOMENT</span><h3>{{ nameOf(activeIdentity,'Waiting for players') }}'s turn</h3></div>
          <span class="category-pill">{{ selectedCategory?.icon }} {{ selectedCategory?.title }}</span>
        </div>
        <p class="instruction" aria-live="polite">{{ instruction }}</p>

        <div v-if="phase==='choosing'" class="choice-pair">
          <button class="choice truth" type="button" :disabled="blocked || pending" @click="choose('truth')"><span class="choice-emoji">💗</span><strong>TRUTH</strong><small>Tell us something real</small><span class="choice-arrow">PICK CARD ↗</span></button>
          <button class="choice dare" type="button" :disabled="blocked || pending" @click="choose('dare')"><span class="choice-emoji">⚡</span><strong>DARE</strong><small>Try a little challenge</small><span class="choice-arrow">PICK CARD ↗</span></button>
        </div>

        <div v-else-if="phase==='challenge' && activeCard" class="flip-scene">
          <div class="challenge-card" :class="[{flipped:cardVisible},s.kind]">
            <div class="card-front"><span class="card-mark">✦ MEETSPACE ✦</span><div class="card-emblem">{{ s.kind==='truth'?'💗':'⚡' }}</div><strong>{{ s.kind?.toUpperCase() }}</strong><small>TAP INTO THE MOMENT</small></div>
            <div class="card-back"><span class="card-category">{{ selectedCategory?.icon }} {{ selectedCategory?.title }} · {{ s.kind?.toUpperCase() }}</span><p>{{ activeCard.text }}</p><span class="card-id">{{ activeCard.id }}</span></div>
          </div>
          <div class="challenge-actions"><button class="action primary" type="button" :disabled="blocked || pending || !cardVisible" @click="complete">✓ Complete Challenge · +1</button><button class="action secondary" type="button" :disabled="blocked || pending || !cardVisible" @click="skip">↷ Skip (No penalty)</button></div>
        </div>

        <div v-else-if="phase==='result'" class="result-view"><div class="result-stamp">{{ s.lastResult?.completed?'🌟':'💛' }}</div><h3>{{ s.lastResult?.completed?'Challenge completed!':'Challenge skipped' }}</h3><p>{{ s.lastResult?.completed?`${nameOf(s.lastResult?.player)} earned a point!`:'No worries. You can always skip a card.' }}</p><button class="action primary" type="button" :disabled="blocked || pending" @click="next">Next Player →</button></div>
        <div v-else class="result-view"><p>Waiting for game state…</p></div>
        <div class="fineprint">💌 Consent first. Anyone can skip a question or dare without explaining.</div>
      </main>

      <aside class="stats-panel"><h3>✦ SESSION STATS</h3><div class="stat"><span>Cards completed</span><b>{{ s.completed ?? 0 }}</b></div><div class="stat"><span>Round</span><b>{{ turn+1 }}</b></div><div class="stat"><span>Skipped by players</span><b>{{ Object.values(s.skips || {}).reduce((a,b)=>a+(Number(b)||0),0) }}</b></div><div class="message">♥ Every moment is better when you're together.</div><button v-if="isHost" type="button" class="reset" :disabled="readonly" @click="requestReset">↻ Restart game</button></aside>
    </div>
    <footer class="tod-footer"><span>♥ PLAY KINDLY • LAUGH OFTEN</span><span>{{ players.length }} players · {{ category }} · round {{ turn+1 }}</span></footer>
  </section>
</template>

<style scoped>
.tod-root{--ink:var(--text-primary,#303826);--line:var(--border-color,#4f5b2a);--paper:var(--bg-surface,#fffcf7);--soft:var(--bg-elevated,#eee6d7);--olive:var(--color-secondary,#4f5b2a);--muted:var(--text-secondary,#77756d);color:var(--ink);background:var(--paper);width:100%;min-height:100%;padding:clamp(12px,2vw,22px);display:flex;flex-direction:column;gap:14px;overflow:auto;container-type:inline-size}
.hero,.categories,.tod-footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.eyebrow,.mini-label{font-size:9px;letter-spacing:1.3px;font-weight:900;color:var(--olive)}.hero h2{margin:5px 0;font:900 clamp(26px,4vw,39px)/1.1 var(--font-display,Georgia,serif)}.hero h2 em{font-style:normal;color:#cf6587}.hero h2 span{color:#b58c32}.hero p{margin:0;font-size:11px;line-height:1.5;color:var(--muted)}.round{border:2px solid var(--line);box-shadow:3px 3px 0 var(--line);background:var(--soft);border-radius:11px;padding:9px 14px;font-size:10px;font-weight:950;white-space:nowrap}.round b{display:block;font-size:22px;text-align:center}.categories{justify-content:flex-start;flex-wrap:wrap}.category,.phase-pill{border:2px solid var(--line);border-radius:40px;padding:8px 12px;font:800 11px inherit;color:var(--ink);background:var(--paper)}.category{cursor:pointer}.category.active{background:var(--olive);color:white}.category:disabled{cursor:default;opacity:.7}.phase-pill{margin-left:auto;background:var(--soft);white-space:nowrap}
.workspace{display:grid;grid-template-columns:minmax(175px,1fr) minmax(260px,2.6fr) minmax(165px,.9fr);align-items:start;gap:12px;flex:1}.players-panel,.arena,.stats-panel{border:2px solid var(--line);border-radius:17px;min-width:0;padding:clamp(12px,1.8vw,18px);box-shadow:3px 3px 0 var(--line)}.players-panel,.stats-panel{background:var(--soft)}.arena{background:var(--paper);display:flex;flex-direction:column;gap:13px}.players-panel h3,.stats-panel h3{font-size:10px;letter-spacing:1px;margin:0 0 14px}.player{display:flex;align-items:center;gap:8px;border:1px solid var(--line);padding:9px;margin-bottom:8px;background:var(--paper);border-radius:10px}.player.current{outline:2px solid #c8993f;outline-offset:1px}.avatar{display:grid;place-items:center;background:#ffe1ea;border-radius:8px;flex:none;width:30px;height:30px;color:#c05478}.person{min-width:0;display:flex;flex-direction:column;gap:3px;flex:1}.person strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.person small{font-size:8px;color:var(--muted);font-weight:900}.player b{font-size:22px}.hint,.rulebox p{font-size:10px;line-height:1.6;color:var(--muted)}.rulebox{padding-top:12px;border-top:1px dashed var(--line);margin-top:12px}.rulebox strong{font-size:9px}.rulebox p{margin:7px 0 0}
.turn-banner{display:flex;justify-content:space-between;align-items:center;gap:10px}.turn-banner h3{margin:4px 0 0;font-size:17px}.category-pill{background:#fce3ec;border-radius:20px;padding:6px 9px;font-size:10px;font-weight:850;color:#713848}.instruction{font-size:11px;color:var(--muted);margin:0}.choice-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin:10px 0}.choice{min-height:240px;padding:20px 10px;border:3px solid var(--line);border-radius:18px;box-shadow:4px 4px 0 var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;color:#3f362f;transition:transform .2s,box-shadow .2s}.choice.truth{background:linear-gradient(145deg,#ffe3eb,#f6bcd1)}.choice.dare{background:linear-gradient(145deg,#fff0be,#f5d382)}.choice:not(:disabled):hover{transform:translateY(-5px) rotate(-1deg);box-shadow:5px 9px 0 var(--line)}.choice:disabled{opacity:.65;cursor:default}.choice-emoji{font-size:50px}.choice strong{font-size:26px;letter-spacing:1.5px}.choice small{font-size:11px}.choice-arrow{font-size:10px;font-weight:950;margin-top:12px}
.flip-scene{display:flex;flex-direction:column;align-items:center;gap:18px;margin:6px 0}.challenge-card{width:min(100%,420px);min-height:260px;display:grid;grid-template-areas:'stack';perspective:1000px;transition:transform .55s cubic-bezier(.2,.7,.2,1);transform:rotateY(0)}.challenge-card.flipped{transform:rotateY(180deg)}.card-front,.card-back{grid-area:stack;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;text-align:center;border:3px solid var(--line);border-radius:17px;box-shadow:4px 4px 0 var(--line)}.card-front{background:#f8c5d5}.dare .card-front{background:#f3d283}.card-front strong{font-size:28px;letter-spacing:2px}.card-front small,.card-mark{font-size:9px;letter-spacing:1.4px;font-weight:900}.card-emblem{font-size:65px}.card-back{transform:rotateY(180deg);background:var(--paper)}.card-category,.card-id{font-size:10px;font-weight:900;color:var(--olive)}.card-back p{font:900 clamp(18px,2.8vw,25px)/1.35 var(--font-display,Georgia,serif);margin:15px 0}.card-id{opacity:.55}.challenge-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.action{border:2px solid var(--line);border-radius:10px;padding:11px 14px;box-shadow:3px 3px 0 var(--line);font:900 12px inherit;cursor:pointer}.action.primary{background:var(--olive);color:#fff}.action.secondary{background:var(--paper);color:var(--ink)}.action:disabled{opacity:.55;cursor:default}.result-view{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:13px}.result-stamp{font-size:70px}.result-view h3{font-size:25px;margin:0}.result-view p{font-size:12px;color:var(--muted);margin:0}.fineprint{font-size:10px;line-height:1.5;color:var(--muted);text-align:center}
.stat{display:flex;justify-content:space-between;align-items:center;gap:9px;padding:11px 0;border-bottom:1px dashed var(--line);font-size:11px}.stat b{font-size:24px}.message{margin:20px 0;padding:12px;background:#ffe7eb;border-radius:11px;color:#954567;font-size:11px;line-height:1.6}.reset{padding:9px 11px;border:2px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);font:900 11px inherit;cursor:pointer}.reset:disabled{opacity:.5}.tod-footer{border-top:1px dashed var(--line);padding-top:10px;color:var(--muted);font-size:9px;font-weight:850;letter-spacing:.5px}
@container(max-width:970px){.workspace{grid-template-columns:1fr 1fr}.arena{grid-column:1/-1;grid-row:1}.players-panel,.stats-panel{grid-row:2}}
@container(max-width:560px){.workspace{grid-template-columns:1fr}.arena,.players-panel,.stats-panel{grid-column:1;grid-row:auto}.arena{grid-row:1}.choice{min-height:180px}.choice strong{font-size:20px}.choice-emoji{font-size:38px}.challenge-card{min-height:230px}.hero h2{font-size:27px}.round{padding:7px}.category{font-size:10px}.tod-footer{flex-wrap:wrap}}
@container(max-width:350px){.choice-pair{grid-template-columns:1fr}.choice{min-height:135px}.challenge-actions{flex-direction:column;width:100%}.challenge-actions button{width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}.challenge-card{transform:none!important}.card-front{display:none}.card-back{transform:none}}
</style>
