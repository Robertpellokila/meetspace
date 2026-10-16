<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  MEMORY_DIFFICULTIES,
  MEMORY_SYMBOLS,
  memoryDifficulty,
} from "../../../config/memoryMatchDeck.js";

const props = defineProps({
  game: { type: Object, default: null },
  participants: { type: Array, default: () => [] },
  playerIdentities: { type: Array, default: () => [] },
  playerIdentity: { type: String, default: "" },
  playerCount: { type: Number, default: 0 },
  isHost: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  soundEnabled: { type: Boolean, default: true },
  gameState: { type: Object, default: () => ({}) },
  clockOffsetMs: { type: Number, default: 0 },
});
const emit = defineEmits(["action", "restart", "back"]);
const now = ref(Date.now());
const busy = ref(false);
let timer = setInterval(() => {
  now.value = Date.now() + props.clockOffsetMs;
}, 250);
let resolveTimer = null;
let busyTimer = null;
const players = computed(() => props.playerIdentities.slice(0, 2));
const state = computed(() => props.gameState || {});
const difficulty = computed(
  () =>
    memoryDifficulty(state.value.difficulty || "easy") ||
    MEMORY_DIFFICULTIES[0],
);
const deck = computed(() =>
  Array.isArray(state.value.deck) ? state.value.deck : [],
);
const matched = computed(() =>
  Array.isArray(state.value.matched) ? state.value.matched : [],
);
const revealed = computed(() =>
  Array.isArray(state.value.revealed) ? state.value.revealed : [],
);
const phase = computed(() => state.value.phase || "playing");
const turn = computed(() =>
  Number.isInteger(state.value.turn) ? state.value.turn : 0,
);
const current = computed(() => players.value[turn.value % 2] || "");
const ready = computed(
  () => players.value.length === 2 && deck.value.length > 0,
);
const myTurn = computed(
  () => ready.value && current.value === props.playerIdentity,
);
const locked = computed(
  () =>
    props.readonly ||
    props.paused ||
    !ready.value ||
    phase.value !== "playing" ||
    busy.value,
);
const pairsFound = computed(() => matched.value.length / 2);
const scores = computed(() => state.value.scores || {});
const scoreA = computed(() => scores.value[players.value[0]] || 0);
const scoreB = computed(() => scores.value[players.value[1]] || 0);
const elapsed = computed(() => {
  if (!state.value.startedAt) return 0;
  const end = state.value.finishedAt || now.value;
  return Math.max(0, Math.floor((end - state.value.startedAt) / 1000));
});
const clock = computed(
  () =>
    `${String(Math.floor(elapsed.value / 60)).padStart(2, "0")}:${String(elapsed.value % 60).padStart(2, "0")}`,
);
const resultTitle = computed(() => {
  if (phase.value !== "finished") return "";
  if (scoreA.value === scoreB.value) return "It's a tie!";
  const champion =
    scoreA.value > scoreB.value ? players.value[0] : players.value[1];
  return champion === props.playerIdentity
    ? "You win!"
    : `${playerName(champion)} wins!`;
});
const turnTitle = computed(() => {
  if (!ready.value) return "Waiting for two players";
  if (phase.value === "finished") return resultTitle.value;
  if (props.paused) return "Game paused";
  if (phase.value === "mismatch") return "Not a match — flipping back…";
  return myTurn.value ? "Your turn!" : `${playerName(current.value)}'s turn`;
});
const cells = computed(() =>
  deck.value.map((symbol, i) => ({
    index: i,
    symbol,
    matched: matched.value.includes(i),
    flipped: revealed.value.includes(i) || matched.value.includes(i),
  })),
);
function playerName(identity) {
  if (!identity) return "Player";
  const person = props.participants.find(
    (p) =>
      p?.identity === identity ||
      p?.participant?.identity === identity ||
      p?.id === identity,
  );
  return (
    person?.name ||
    person?.participant?.name ||
    (identity === props.playerIdentity
      ? "You"
      : `Player ${players.value.indexOf(identity) + 1}`)
  );
}
function flipCard(i) {
  if (
    locked.value ||
    !myTurn.value ||
    revealed.value.includes(i) ||
    matched.value.includes(i)
  )
    return;
  busy.value = true;
  emit("action", { type: "mm-flip", index: i });
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    busy.value = false;
  }, 650);
}
function newDifficulty(id) {
  if (!props.isHost || props.readonly) return;
  // A fresh seed yields a new, deterministic order on every client.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  emit("action", {
    type: "mm-set-difficulty",
    difficulty: id,
    seed: arr[0] || 1,
  });
}
function scheduleResolve() {
  clearTimeout(resolveTimer);
  if (phase.value !== "mismatch" || !Number.isFinite(state.value.resolveAt))
    return;
  const delay = Math.max(0, state.value.resolveAt - Date.now() + 45);
  resolveTimer = setTimeout(() => {
    if (
      phase.value === "mismatch" &&
      props.isHost &&
      !props.readonly &&
      !props.paused
    )
      emit("action", { type: "mm-resolve" });
  }, delay);
}
// If client was readonly during resolve, try again on reconnection/resume.
watch(
  () => [
    phase.value,
    state.value.resolveAt,
    props.readonly,
    props.paused,
    props.isHost,
  ],
  scheduleResolve,
  { immediate: true },
);
// Initialize the shared deck through the reducer, never with random local state.
watch(
  () => [
    props.isHost,
    props.readonly,
    ready.value,
    players.value.join(","),
    deck.value.length,
  ],
  () => {
    if (
      props.isHost &&
      !props.readonly &&
      players.value.length === 2 &&
      !deck.value.length
    )
      newDifficulty("easy");
  },
  { immediate: true },
);
watch(
  () => [phase.value, matched.value.length, revealed.value.length, turn.value],
  () => {
    busy.value = false;
  },
);
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(resolveTimer);
  clearTimeout(busyTimer);
});
</script>

<template>
  <section class="memory" aria-label="Memory Match multiplayer game">
    <header class="head">
      <div>
        <span class="eyebrow">✦ MEETSPACE GAME CLUB</span>
        <h2>Memory <em>Match</em></h2>
        <p>Flip cards, find pairs, and earn points together.</p>
      </div>
      <div class="time" aria-label="Elapsed play time">
        <small>TIME</small><strong>{{ clock }}</strong>
      </div>
    </header>
    <div class="settings">
      <div class="levels" aria-label="Difficulty">
        <button
          v-for="d in MEMORY_DIFFICULTIES"
          :key="d.id"
          type="button"
          :class="{ active: difficulty.id === d.id }"
          :disabled="!isHost || readonly || paused"
          @click="newDifficulty(d.id)"
        >
          {{ d.title }} <span>{{ d.pairs }} pairs</span>
        </button>
      </div>
      <span class="progress"
        >{{ pairsFound }} / {{ difficulty.pairs }} pairs</span
      >
    </div>
    <div class="scores">
      <div
        class="player"
        :class="{ playing: current === players[0] && phase !== 'finished' }"
      >
        <div class="symbol">🌷</div>
        <div class="player-meta">
          <span>{{ playerName(players[0]) }}</span
          ><small>Player 1</small>
        </div>
        <strong>{{ scoreA }}</strong>
      </div>
      <div class="message" role="status" aria-live="polite">
        <strong>{{ turnTitle }}</strong
        ><small>{{
          phase === "finished"
            ? `${state.moves || 0} attempts completed`
            : myTurn
              ? "Find a matching pair!"
              : "Watch the cards together"
        }}</small>
      </div>
      <div
        class="player"
        :class="{ playing: current === players[1] && phase !== 'finished' }"
      >
        <div class="symbol">🧸</div>
        <div class="player-meta">
          <span>{{ playerName(players[1]) }}</span
          ><small>Player 2</small>
        </div>
        <strong>{{ scoreB }}</strong>
      </div>
    </div>
    <div class="board-wrap">
      <div v-if="!ready" class="wait-msg">
        Waiting for your partner and the shared game deck…
      </div>
      <div
        v-else
        class="board"
        :class="`board-${difficulty.id}`"
        :style="{
          '--columns': difficulty.columns,
          '--rows': Math.ceil(cells.length / difficulty.columns),
        }"
        role="group"
        aria-label="Memory cards"
      >
        <button
          v-for="card in cells"
          :key="card.index"
          type="button"
          class="tile"
          :class="{
            flipped: card.flipped,
            matched: card.matched,
            clickable: myTurn && !locked && !card.flipped,
          }"
          :disabled="locked || !myTurn || card.flipped || phase === 'finished'"
          :aria-label="`Card ${card.index + 1}: ${card.flipped ? (card.matched ? 'matched' : 'revealed') : 'hidden'}`"
          @click="flipCard(card.index)"
        >
          <span class="tile-inner"
            ><span class="tile-front" aria-hidden="true"
              ><span class="tile-glyph">✦</span
              ><span class="tile-logo">MS</span></span
            ><span class="tile-back" aria-hidden="true">{{
              MEMORY_SYMBOLS[card.symbol] || "♥"
            }}</span></span
          >
        </button>
      </div>
    </div>
    <div v-if="phase === 'finished'" class="result" role="status">
      <span class="result-emoji">🏆</span><strong>{{ resultTitle }}</strong
      ><span
        >{{ scoreA }}–{{ scoreB }} · {{ clock }} ·
        {{ state.moves || 0 }} turns</span
      >
      <button
        type="button"
        :disabled="!isHost || readonly"
        @click="newDifficulty(difficulty.id)"
      >
        ↻ Play another round
      </button>
    </div>
    <footer class="foot">
      <span>♥ PLAY TOGETHER, STAY TOGETHER</span
      ><span>Match = +1 point · Match again, keep your turn</span>
    </footer>
  </section>
</template>

<style scoped>
.memory {
  --ink: var(--text-primary, #303826);
  --line: var(--border-color, #4f5b2a);
  --paper: var(--bg-surface, #fffcf7);
  --soft: var(--bg-elevated, #eee6d7);
  --olive: var(--color-secondary, #4f5b2a);
  --muted: var(--text-secondary, #77756d);
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: clamp(8px, 1.2vw, 14px);
  gap: 6px;
  color: var(--ink);
  background: var(--paper);
  overflow: hidden;
  container-type: inline-size;
}
.head,
.settings,
.scores,
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.eyebrow {
  font-size: 10px;
  color: var(--olive);
  font-weight: 950;
  letter-spacing: 1.1px;
}
h2 {
  font: 900 clamp(23px, 2.4vw, 32px)/1.05 var(--font-display, Georgia, serif);
  margin: 2px 0;
}
h2 em {
  font-style: normal;
  color: #c96983;
}
.head p {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.time {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 86px;
  background: var(--soft);
  border: 2px solid var(--line);
  box-shadow: 3px 3px 0 var(--line);
  border-radius: 12px;
  padding: 5px 8px;
}
.time small {
  font-size: 9px;
  letter-spacing: 1.2px;
  font-weight: 900;
}
.time strong {
  font-variant-numeric: tabular-nums;
  font-size: 18px;
}
.levels {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.levels button {
  border: 2px solid var(--line);
  border-radius: 10px;
  padding: 6px 10px;
  font: 900 11px inherit;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
}
.levels button.active {
  background: var(--olive);
  color: #fff;
}
.levels button:disabled {
  cursor: default;
  opacity: 0.7;
}
.levels span {
  font-size: 9px;
  opacity: 0.8;
  margin-left: 3px;
}
.progress {
  white-space: nowrap;
  font-size: 11px;
  font-weight: 900;
  color: var(--olive);
}
.scores {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 1.2fr) minmax(0, 1fr);
}
.player {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--soft);
  border: 2px solid var(--line);
  border-radius: 12px;
  padding: 8px 10px;
}
.player.playing {
  box-shadow: 3px 3px 0 var(--line);
  border-color: #b18b4b;
}
.symbol {
  font-size: 21px;
}
.player-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.player-meta span {
  font-weight: 900;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-meta small,
.message small {
  font-size: 10px;
  color: var(--muted);
}
.player strong {
  font-size: 19px;
  margin-left: auto;
}
.message {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.message strong {
  font-size: 13px;
}
.board-wrap {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  container-type: size;
}
.board {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: clamp(4px, .7vw, 7px);
  width: min(100%, 560px, calc(100cqh * var(--columns) / var(--rows) - 12px));
  margin: auto;
}
.board-hard {
  width: min(100%, 960px, calc(100cqh * var(--columns) / var(--rows) - 12px));
}
.tile {
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  background: transparent;
  perspective: 700px;
  cursor: default;
  min-width: 0;
  container-type: size;
}
.tile.clickable {
  cursor: pointer;
}
.tile:focus-visible {
  outline: 3px solid #ba7f39;
  outline-offset: 3px;
}
.tile-inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.45s cubic-bezier(0.2, 0.75, 0.25, 1);
}
.tile.flipped .tile-inner {
  transform: rotateY(180deg);
}
.tile-front,
.tile-back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border: 2px solid var(--line);
  border-radius: clamp(5px, 18cqw, 12px);
  display: grid;
  place-items: center;
  box-shadow: 3px 3px 0 var(--line);
}
.tile-front {
  background: linear-gradient(135deg, #667348, #46532f);
  color: #fff;
}
.tile-back {
  transform: rotateY(180deg);
  background: #ffe4eb;
  font-size: clamp(13px, 60cqw, 38px);
}
.tile.matched .tile-back {
  background: #daf5db;
  border-color: #438a58;
}
.tile.clickable:hover .tile-inner {
  transform: translateY(-3px);
}
.tile-glyph {
  position: absolute;
  font-size: clamp(13px, 60cqw, 34px);
}
.tile-logo {
  position: absolute;
  bottom: 5px;
  right: 7px;
  font-size: 8px;
  font-weight: 950;
  opacity: 0.8;
}
.wait-msg {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}
.result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 2px solid #55854c;
  border-radius: 12px;
  background: #ecfae8;
  color: #294c27;
  font-size: 12px;
}
.result strong {
  font-size: 17px;
}
.result button {
  border: 2px solid #294c27;
  border-radius: 9px;
  background: #497344;
  color: white;
  padding: 8px 12px;
  font-weight: 900;
  cursor: pointer;
}
.result button:disabled {
  opacity: 0.5;
}
.foot {
  font-size: 9px;
  letter-spacing: 0.5px;
  color: var(--muted);
  font-weight: 800;
  border-top: 1px dashed var(--line);
  padding-top: 5px;
}
@container (max-width:560px) {
  .scores {
    grid-template-columns: 1fr 1fr;
  }
  .message {
    grid-column: 1/-1;
    grid-row: 1;
  }
  .player {
    padding: 8px;
  }
  .player-meta span {
    font-size: 11px;
  }
  .head p {
    display: none;
  }
  .board {
    gap: 6px;
  }
  .tile-front,
  .tile-back {
    border-radius: 8px;
  }
}
@container (max-width:360px) {
  .levels button {
    padding: 6px;
  }
  .time {
    min-width: 70px;
  }
  .time strong {
    font-size: 15px;
  }
  .board-hard {
    gap: 3px;
  }
  .foot {
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tile-inner {
    transition: none;
  }
}
</style>
