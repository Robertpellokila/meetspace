<script setup>
import { computed, ref, watch } from "vue";

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
});
const emit = defineEmits(["action", "restart", "back"]);
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const board = computed(() => {
  const raw = props.gameState?.board;
  return Array.isArray(raw) && raw.length === 9
    ? raw.map((v) => (v === "X" || v === "O" ? v : null))
    : Array(9).fill(null);
});
const turn = computed(() =>
  Number.isInteger(props.gameState?.turn) && props.gameState.turn >= 0
    ? props.gameState.turn
    : 0,
);
const winner = computed(() =>
  ["X", "O"].includes(props.gameState?.winner) ? props.gameState.winner : null,
);
const draw = computed(() => Boolean(props.gameState?.draw));
const round = computed(() =>
  Number.isInteger(props.gameState?.round) && props.gameState.round > 0
    ? props.gameState.round
    : 1,
);
const scores = computed(() => ({
  X: Number.isInteger(props.gameState?.scores?.X)
    ? props.gameState.scores.X
    : 0,
  O: Number.isInteger(props.gameState?.scores?.O)
    ? props.gameState.scores.O
    : 0,
  draws: Number.isInteger(props.gameState?.scores?.draws)
    ? props.gameState.scores.draws
    : 0,
}));
// Assignment is determined by the session's ordered players, not by visible tiles.
const xIdentity = computed(() => props.playerIdentities[0] || "");
const oIdentity = computed(() => props.playerIdentities[1] || "");
const myMark = computed(() =>
  props.playerIdentity === xIdentity.value
    ? "X"
    : props.playerIdentity === oIdentity.value
      ? "O"
      : null,
);
const currentMark = computed(() => (turn.value % 2 === 0 ? "X" : "O"));
const finished = computed(() => Boolean(winner.value || draw.value));
const myTurn = computed(() =>
  Boolean(
    myMark.value && myMark.value === currentMark.value && !finished.value,
  ),
);
const blocked = computed(
  () => props.readonly || props.paused || !xIdentity.value || !oIdentity.value,
);
const ready = computed(() => Boolean(xIdentity.value && oIdentity.value));
const winningLine = computed(() =>
  winner.value
    ? WIN_LINES.find((line) =>
        line.every((i) => board.value[i] === winner.value),
      ) || []
    : [],
);
const notice = ref("");
let noticeTimer = null;
function alertMessage(message) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 2300);
}
function participantLabel(identity, fallback) {
  if (!identity) return fallback;
  const item = props.participants.find(
    (p) =>
      p?.identity === identity ||
      p?.participant?.identity === identity ||
      p?.id === identity,
  );
  return (
    item?.name ||
    item?.participant?.name ||
    identity.replace(/^host-|^guest-/, "").slice(0, 15) ||
    fallback
  );
}
const xName = computed(() => participantLabel(xIdentity.value, "Player X"));
const oName = computed(() => participantLabel(oIdentity.value, "Player O"));
const statusTitle = computed(() => {
  if (!ready.value) return "Waiting for two players";
  if (props.paused) return "Game paused by host";
  if (winner.value)
    return `${winner.value === myMark.value ? "You win!" : `${winner.value} wins!`}`;
  if (draw.value) return "It’s a draw!";
  if (blocked.value && props.readonly) return "Waiting for sync…";
  if (!myMark.value) return `${currentMark.value} is playing`;
  return myTurn.value ? "Your turn!" : "Waiting for partner…";
});
const statusDetail = computed(() => {
  if (!ready.value) return "Two admitted players are required to start.";
  if (winner.value)
    return `${winner.value === "X" ? xName.value : oName.value} completed three in a row.`;
  if (draw.value) return "No more empty cells. Ready for another round?";
  return `${currentMark.value} · ${currentMark.value === "X" ? xName.value : oName.value}`;
});
function makeMove(index) {
  if (blocked.value || !myTurn.value || board.value[index] || finished.value)
    return;
  emit("action", { type: "make-move", position: index });
}
function nextRound() {
  if (blocked.value || !finished.value || !myMark.value) return;
  emit("action", { type: "next-round" });
}
function restartMatch() {
  if (!props.isHost || props.readonly) return;
  emit("restart");
}
watch(
  () => props.gameState,
  () => {
    notice.value = "";
  },
);
</script>

<template>
  <section class="ttt" aria-label="Tic Tac Toe game">
    <div class="ttt-head">
      <div>
        <span class="eyebrow">✦ MEETSPACE ARCADE</span>
        <h2>Tic <em>Tac</em> Toe</h2>
        <p>Get three in a row. Play together!</p>
      </div>
      <span class="round-chip">ROUND {{ round }}</span>
    </div>
    <div class="ttt-body">
      <div
        class="player-card x-player"
        :class="{ active: !finished && currentMark === 'X' }"
      >
        <div class="symbol">X</div>
        <span class="player-name" :title="xName">{{ xName }}</span>
        <span class="you" v-if="myMark === 'X'">YOU</span
        ><strong>{{ scores.X }}</strong
        ><small>WINS</small>
      </div>
      <div class="center-area">
        <div class="status" role="status" aria-live="polite">
          <strong>{{ statusTitle }}</strong
          ><span>{{ statusDetail }}</span>
        </div>
        <div class="board" role="group" aria-label="Nine-cell game board">
          <button
            v-for="(cell, index) in board"
            :key="index"
            type="button"
            class="cell"
            :class="[
              cell === 'X' ? 'cell-x' : cell === 'O' ? 'cell-o' : '',
              {
                win: winningLine.includes(index),
                playable: !cell && myTurn && !blocked,
              },
            ]"
            :disabled="Boolean(cell) || !myTurn || blocked || finished"
            :aria-label="`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}: ${cell || 'empty'}`"
            @click="makeMove(index)"
          >
            <span v-if="cell" class="cell-mark">{{ cell }}</span
            ><span v-else class="cell-hint">+</span>
          </button>
        </div>
        <div class="game-actions">
          <button
            v-if="finished"
            class="main-action"
            type="button"
            :disabled="blocked || !myMark"
            @click="nextRound"
          >
            ↻ Next round
          </button>
          <span v-else class="tip">{{
            myMark ? `You're playing ${myMark}` : "Spectating this match"
          }}</span>
          <button
            v-if="isHost"
            class="secondary-action"
            type="button"
            :disabled="readonly"
            @click="restartMatch"
          >
            Reset match
          </button>
        </div>
        <p v-if="notice" class="notice">{{ notice }}</p>
      </div>
      <div
        class="player-card o-player"
        :class="{ active: !finished && currentMark === 'O' }"
      >
        <div class="symbol">O</div>
        <span class="player-name" :title="oName">{{ oName }}</span>
        <span class="you" v-if="myMark === 'O'">YOU</span
        ><strong>{{ scores.O }}</strong
        ><small>WINS</small>
      </div>
    </div>
    <div class="ttt-foot">
      <span>♥ PLAY FAIR, HAVE FUN</span
      ><span
        >Draws {{ scores.draws }} ·
        {{ ready ? "2 players ready" : "Waiting for player" }}</span
      >
    </div>
  </section>
</template>

<style scoped>
.ttt {
  --ink: var(--text-primary, #303826);
  --line: var(--border-color, #4f5b2a);
  --paper: var(--bg-surface, #fffcf7);
  --soft: var(--bg-elevated, #eee6d7);
  --olive: var(--color-secondary, #4f5b2a);
  --muted: var(--text-secondary, #77756d);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  width: 100%;
  padding: clamp(12px, 2.5vw, 24px);
  color: var(--ink);
  background: var(--paper);
  overflow: auto;
  container-type: inline-size;
}
.ttt-head,
.ttt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 1.5px;
  font-weight: 950;
  color: var(--olive);
}
h2 {
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(25px, 4vw, 39px);
  margin: 3px 0 0;
  line-height: 1.1;
}
h2 em {
  font-style: normal;
  color: #ca6276;
}
.ttt-head p {
  font-size: 12px;
  color: var(--muted);
  margin: 7px 0 0;
}
.round-chip {
  border: 2px solid var(--line);
  border-radius: 9px;
  padding: 9px 12px;
  background: var(--soft);
  font-weight: 950;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 3px 3px 0 var(--line);
}
.ttt-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 420px) minmax(100px, 1fr);
  gap: 18px;
  align-items: center;
  justify-content: center;
}
.player-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border: 2px solid var(--line);
  border-radius: 18px;
  padding: 17px 10px;
  background: var(--soft);
  box-shadow: 4px 4px 0 var(--line);
  transition: transform 0.2s;
}
.player-card.active {
  transform: translateY(-4px);
  outline: 3px solid #e6b65e;
  outline-offset: 2px;
}
.player-card .symbol {
  font-family: Arial, sans-serif;
  font-weight: 1000;
  font-size: clamp(35px, 6vw, 66px);
  line-height: 1;
}
.x-player .symbol {
  color: #bf5772;
}
.o-player .symbol {
  color: #5275b8;
}
.player-name {
  font-size: 12px;
  font-weight: 900;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you {
  font-size: 9px;
  font-weight: 950;
  background: var(--olive);
  color: white;
  padding: 4px 8px;
  border-radius: 14px;
}
.player-card strong {
  font-size: 29px;
  line-height: 1.2;
}
.player-card small {
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 1px;
  color: var(--muted);
}
.center-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
  min-width: 0;
  width: 100%;
}
.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  min-height: 50px;
}
.status strong {
  font-size: 16px;
}
.status span {
  font-size: 11px;
  color: var(--muted);
}
.board {
  width: min(100%, 360px);
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
.cell {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  border: 3px solid var(--line);
  border-radius: 14px;
  box-shadow: 3px 3px 0 var(--line);
  background: var(--soft);
  color: var(--ink);
  font:
    900 clamp(30px, 7vw, 68px)/1 Arial,
    sans-serif;
  cursor: default;
  transition:
    transform 0.15s,
    background 0.15s;
}
.cell.playable {
  cursor: pointer;
}
.cell.playable:hover {
  transform: translateY(-3px);
  background: #f1e6c6;
}
.cell:focus-visible {
  outline: 3px solid #d99e40;
  outline-offset: 3px;
}
.cell-x {
  color: #bf5772;
  background: #ffe4ea;
}
.cell-o {
  color: #5275b8;
  background: #dfeaff;
}
.cell.win {
  background: #d8f6d3;
  animation: pop 0.35s ease;
}
.cell-hint {
  font-size: 25px;
  opacity: 0;
}
.cell.playable:hover .cell-hint {
  opacity: 0.25;
}
.cell-mark {
  animation: pop 0.2s ease;
}
@keyframes pop {
  from {
    transform: scale(0.65);
    opacity: 0.1;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.game-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 9px;
  min-height: 42px;
}
.tip {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
}
.main-action,
.secondary-action {
  padding: 10px 14px;
  border: 2px solid var(--line);
  border-radius: 10px;
  font: 900 11px inherit;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--line);
}
.main-action {
  background: var(--olive);
  color: #fff;
}
.secondary-action {
  background: var(--paper);
  color: var(--ink);
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.notice {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.ttt-foot {
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 9px;
  letter-spacing: 0.5px;
  font-weight: 900;
  color: var(--muted);
}
@container (max-width:590px) {
  .ttt-body {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .center-area {
    grid-column: 1/-1;
    grid-row: 1;
  }
  .player-card {
    grid-row: 2;
    padding: 9px;
  }
  .player-card .symbol {
    font-size: 28px;
  }
  .player-card strong {
    font-size: 21px;
  }
  .board {
    width: min(100%, 310px);
  }
  .ttt {
    gap: 12px;
  }
  .ttt-head p {
    font-size: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
