<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import {
  COUPLE_QUIZ_CATEGORIES,
  getCoupleQuestion,
} from "../../../config/coupleQuizQuestions.js";
import { quizCommit } from "../../../composables/quizCommit.js";

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
const categories = COUPLE_QUIZ_CATEGORIES;
const state = computed(() => props.gameState || {});
const category = computed(() => state.value.category || "romantic");
const index = computed(() =>
  Number.isInteger(state.value.index) ? state.value.index : 0,
);
const phase = computed(() => state.value.phase || "answering");
const question = computed(() => getCoupleQuestion(category.value, index.value));
const players = computed(() => props.playerIdentities.slice(0, 2));
const me = computed(() => props.playerIdentity);
const inGame = computed(
  () => players.value.includes(me.value) && players.value.length === 2,
);
const subject = computed(() => players.value[index.value % 2] || "");
const guesser = computed(() => players.value[(index.value + 1) % 2] || "");
const role = computed(() =>
  !inGame.value
    ? "spectator"
    : me.value === subject.value
      ? "subject"
      : "guesser",
);
const commits = computed(() => state.value.commits || {});
const reveals = computed(() => state.value.reveals || {});
const scores = computed(() => state.value.scores || {});
const blocked = computed(() => props.readonly || props.paused || !inGame.value);
const answered = computed(() => Boolean(commits.value[me.value]));
const hasRevealed = computed(() =>
  Object.prototype.hasOwnProperty.call(reveals.value, me.value),
);
const resultReady = computed(() => phase.value === "results");
const correct = computed(
  () =>
    resultReady.value &&
    reveals.value[subject.value] === reveals.value[guesser.value],
);
const selected = ref(null);
const secret = ref(null); // Lives only in this browser, never in gameState until reveal.
const busy = ref(false);
const notice = ref("");
const lastAutoReveal = ref("");
const key = computed(
  () => `${category.value}:${index.value}:${question.value?.id || ""}`,
);
const gameNames = computed(() => ({
  [players.value[0]]: nameOf(players.value[0], "Player 1"),
  [players.value[1]]: nameOf(players.value[1], "Player 2"),
}));
function nameOf(id, fallback) {
  if (!id) return fallback;
  const p = props.participants.find(
    (x) =>
      x?.identity === id || x?.participant?.identity === id || x?.id === id,
  );
  return (
    p?.name || p?.participant?.name || (id === me.value ? "You" : fallback)
  );
}
function issue(action) {
  if (!blocked.value) emit("action", action);
}
function chooseCategory(id) {
  if (
    !props.isHost ||
    props.readonly ||
    !(phase.value === "results" || Object.keys(commits.value).length === 0)
  )
    return;
  if (id !== category.value)
    emit("action", { type: "set-category", category: id });
}
function commitAnswer() {
  if (
    blocked.value ||
    phase.value !== "answering" ||
    answered.value ||
    busy.value ||
    selected.value === null ||
    !question.value
  )
    return;
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}-${Math.random()}`;
  secret.value = { key: key.value, answer: selected.value, nonce };
  busy.value = true;
  emit("action", {
    type: "commit-answer",
    questionId: question.value.id,
    commit: quizCommit(question.value.id, selected.value, nonce),
  });
  // DataChannel does not acknowledge end-to-end application of an action.
  // Re-enable after a short interval so the user can inspect synchronization.
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    busy.value = false;
  }, 1500);
}
let busyTimer = null;
function revealMine() {
  if (
    blocked.value ||
    phase.value !== "revealing" ||
    hasRevealed.value ||
    !question.value
  )
    return;
  if (!secret.value || secret.value.key !== key.value) {
    notice.value =
      "Jawaban rahasia tidak tersedia di browser ini. Jangan refresh saat ronde berlangsung; minta host restart jika hilang.";
    return;
  }
  emit("action", {
    type: "reveal-answer",
    questionId: question.value.id,
    answer: secret.value.answer,
    nonce: secret.value.nonce,
  });
  lastAutoReveal.value = key.value;
}
function nextQuestion() {
  if (!blocked.value && resultReady.value) issue({ type: "next-question" });
}
function requestRestart() {
  if (props.isHost && !props.readonly) emit("restart");
}
watch(key, () => {
  selected.value = null;
  secret.value = null;
  busy.value = false;
  notice.value = "";
  lastAutoReveal.value = "";
  clearTimeout(busyTimer);
});
watch(
  [phase, key, hasRevealed, () => props.readonly],
  ([p]) => {
    if (
      p === "revealing" &&
      !props.readonly &&
      !hasRevealed.value &&
      secret.value?.key === key.value &&
      lastAutoReveal.value !== key.value
    )
      revealMine();
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(busyTimer));
const headline = computed(() => {
  if (props.paused) return "Game paused by host";
  if (!inGame.value) return "Spectating this question";
  if (resultReady.value)
    return correct.value ? "You know each other! 💖" : "A lovely surprise! ✨";
  if (phase.value === "revealing") return "Time to reveal!";
  if (answered.value) return "Answer locked — waiting for partner";
  return role.value === "subject"
    ? "What would YOU choose?"
    : "What would your partner choose?";
});
const promptHint = computed(() =>
  role.value === "subject"
    ? "Pick your own honest answer. Your partner is guessing it."
    : "Guess the answer your partner would choose.",
);
const scoredPlayer = computed(() => guesser.value);
const categoryInfo = computed(() =>
  categories.find((c) => c.id === category.value),
);
</script>

<template>
  <section class="couple-quiz" aria-label="Couple Quiz multiplayer">
    <header class="quiz-heading">
      <div>
        <span class="eyebrow">✦ MEETSPACE · COUPLE CLUB</span>
        <h2>How well do you <em>know me?</em></h2>
        <p>
          Answer secretly, reveal together, and earn points for knowing your
          partner.
        </p>
      </div>
      <span class="round-chip">QUESTION {{ index + 1 }}</span>
    </header>

    <div class="quiz-topline">
      <div class="categories" role="group" aria-label="Quiz category">
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          :class="['category', { active: category === c.id }]"
          :disabled="
            !isHost ||
            readonly ||
            (Object.keys(commits).length > 0 && phase !== 'results')
          "
          :aria-pressed="category === c.id"
          :title="c.description"
          @click="chooseCategory(c.id)"
        >
          {{ c.icon }} {{ c.title }}
        </button>
      </div>
      <span class="phase-pill">{{
        phase === "answering"
          ? "🔒 Secret answers"
          : phase === "revealing"
            ? "🔓 Revealing"
            : "🏆 Results"
      }}</span>
    </div>

    <div class="quiz-body">
      <aside class="scoreboard">
        <div class="score-title">★ SCOREBOARD</div>
        <div
          v-for="(id, i) in players"
          :key="id"
          class="score-row"
          :class="{ subject: id === subject }"
        >
          <div class="avatar">{{ i === 0 ? "♥" : "✦" }}</div>
          <div class="score-person">
            <strong :title="id">{{ gameNames[id] }}</strong
            ><small
              >{{ id === subject ? "ANSWERING SELF" : "GUESSING"
              }}<span v-if="id === me"> · YOU</span></small
            >
          </div>
          <b>{{ scores[id] ?? 0 }}</b>
        </div>
        <div v-if="players.length !== 2" class="waiting">
          Waiting for two game players…
        </div>
        <div class="score-tip">
          💡 Each question alternates who answers about themselves. A correct
          guess earns 1 point.
        </div>
      </aside>

      <main class="question-panel">
        <div class="question-meta">
          <span>{{ categoryInfo?.icon }} {{ categoryInfo?.title }}</span
          ><span
            >{{ index % 2 === 0 ? "PLAYER 1" : "PLAYER 2" }} IS THE
            SUBJECT</span
          >
        </div>
        <div class="question-text">
          {{ question?.text || "Preparing question…" }}
        </div>
        <div class="status">
          <strong>{{ headline }}</strong
          ><small>{{ promptHint }}</small>
        </div>

        <div
          class="options"
          role="group"
          aria-label="Choose your secret answer"
        >
          <button
            v-for="(option, i) in question?.options || []"
            :key="`${key}-${i}`"
            type="button"
            :class="[
              'option',
              {
                picked: selected === i,
                chosen: resultReady && reveals[me] === i,
                match: resultReady && reveals[subject] === i,
              },
            ]"
            :disabled="blocked || phase !== 'answering' || answered"
            :aria-pressed="selected === i"
            @click="selected = i"
          >
            <span class="option-letter">{{ "ABCD"[i] }}</span
            ><span>{{ option }}</span
            ><span v-if="selected === i && !answered" class="option-check"
              >✓</span
            >
          </button>
        </div>

        <div class="actions">
          <button
            v-if="phase === 'answering'"
            type="button"
            class="action primary"
            :disabled="blocked || answered || selected === null || busy"
            @click="commitAnswer"
          >
            {{
              answered
                ? "✓ Answer locked"
                : busy
                  ? "Sending…"
                  : "🔒 Lock my answer"
            }}
          </button>
          <button
            v-else-if="phase === 'revealing'"
            type="button"
            class="action primary"
            :disabled="blocked || hasRevealed"
            @click="revealMine"
          >
            {{ hasRevealed ? "✓ Revealed" : "🔓 Reveal my answer" }}
          </button>
          <button
            v-else
            type="button"
            class="action primary"
            :disabled="blocked"
            @click="nextQuestion"
          >
            Next Question →
          </button>
          <button
            v-if="isHost"
            type="button"
            class="action secondary"
            :disabled="readonly"
            @click="requestRestart"
          >
            ↻ Reset quiz
          </button>
        </div>

        <div class="readiness" aria-live="polite">
          <span v-for="id in players" :key="id"
            ><b
              :class="{
                done:
                  phase === 'answering'
                    ? Boolean(commits[id])
                    : Object.prototype.hasOwnProperty.call(reveals, id),
              }"
              >{{
                (
                  phase === "answering"
                    ? commits[id]
                    : Object.prototype.hasOwnProperty.call(reveals, id)
                )
                  ? "●"
                  : "○"
              }}</b
            >
            {{ gameNames[id] }}</span
          >
        </div>
        <p v-if="notice" class="notice" role="alert">{{ notice }}</p>
      </main>

      <aside class="result-panel">
        <div class="result-title">💌 THE BIG REVEAL</div>
        <template v-if="resultReady">
          <div class="result-answer">
            <small>{{ gameNames[subject] }} chose</small
            ><strong>{{ question?.options?.[reveals[subject]] }}</strong>
          </div>
          <div class="result-answer">
            <small>{{ gameNames[guesser] }} guessed</small
            ><strong>{{ question?.options?.[reveals[guesser]] }}</strong>
          </div>
          <div :class="['result-message', { correct }]">
            {{
              correct
                ? `+1 point for ${gameNames[scoredPlayer]}! 🎉`
                : "Not a match — ask each other why! 💬"
            }}
          </div>
        </template>
        <template v-else>
          <div class="secret-art">
            {{ phase === "revealing" ? "💌" : "🔐" }}
          </div>
          <p>Answers stay hidden until both players have locked them.</p>
          <p class="fine-print">
            Only commitments are sent before reveal; the selected option stays
            on each player’s device.
          </p>
        </template>
      </aside>
    </div>
    <footer class="quiz-footer">
      <span>♥ PLAY KINDLY, LEARN TOGETHER</span
      ><span>Round {{ index + 1 }} · {{ phase }} · 2 players</span>
    </footer>
  </section>
</template>

<style scoped>
.couple-quiz {
  --ink: var(--text-primary, #303826);
  --line: var(--border-color, #4f5b2a);
  --paper: var(--bg-surface, #fffdf7);
  --soft: var(--bg-elevated, #eee6d7);
  --olive: var(--color-secondary, #4f5b2a);
  --muted: var(--text-secondary, #77756d);
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  min-height: 100%;
  padding: clamp(12px, 2vw, 24px);
  color: var(--ink);
  background: var(--paper);
  overflow: auto;
  container-type: inline-size;
}
.quiz-heading,
.quiz-topline,
.quiz-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 1.6px;
  font-weight: 900;
  color: var(--olive);
}
h2 {
  margin: 4px 0;
  font: 900 clamp(23px, 3.5vw, 36px)/1.15 var(--font-display, Georgia, serif);
}
h2 em {
  font-style: normal;
  color: #c75e84;
}
.quiz-heading p {
  margin: 6px 0;
  color: var(--muted);
  font-size: 11px;
}
.round-chip {
  border: 2px solid var(--line);
  border-radius: 9px;
  padding: 10px;
  background: var(--soft);
  box-shadow: 3px 3px 0 var(--line);
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}
.categories {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.category,
.phase-pill {
  border: 2px solid var(--line);
  border-radius: 30px;
  padding: 9px 12px;
  font: 800 11px inherit;
  background: var(--paper);
  color: var(--ink);
}
.category {
  cursor: pointer;
}
.category.active {
  background: var(--olive);
  color: #fff;
}
.category:disabled {
  cursor: default;
}
.phase-pill {
  white-space: nowrap;
  background: var(--soft);
}
.quiz-body {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(0, 2.3fr) minmax(150px, 1fr);
  align-items: start;
  gap: 14px;
  flex: 1;
}
.scoreboard,
.question-panel,
.result-panel {
  border: 2px solid var(--line);
  border-radius: 17px;
  background: var(--paper);
  box-shadow: 3px 3px 0 var(--line);
  padding: clamp(12px, 2vw, 18px);
  min-width: 0;
}
.scoreboard,
.result-panel {
  background: var(--soft);
}
.score-title,
.result-title {
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 1px;
  margin-bottom: 13px;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  padding: 10px;
  margin-bottom: 9px;
}
.score-row.subject {
  outline: 2px solid #d8a342;
  outline-offset: 1px;
}
.avatar {
  display: grid;
  place-items: center;
  background: #ffe5ec;
  border-radius: 8px;
  width: 31px;
  height: 31px;
  flex: none;
  color: #b64c70;
}
.score-person {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 3px;
}
.score-person strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.score-person small {
  font-size: 8px;
  color: var(--muted);
  font-weight: 900;
}
.score-row b {
  font-size: 24px;
}
.score-tip,
.waiting {
  font-size: 10px;
  line-height: 1.6;
  color: var(--muted);
  margin-top: 12px;
}
.question-panel {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.question-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.4px;
  color: var(--olive);
}
.question-text {
  font: 900 clamp(18px, 2.6vw, 27px)/1.25 var(--font-display, Georgia, serif);
  margin: 4px 0;
}
.status {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.status strong {
  font-size: 13px;
}
.status small {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}
.options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.option {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  border: 2px solid var(--line);
  border-radius: 11px;
  background: var(--soft);
  color: var(--ink);
  cursor: pointer;
  min-height: 65px;
  text-align: left;
  font: 800 11px/1.4 inherit;
  transition:
    transform 0.15s,
    background 0.15s;
}
.option:not(:disabled):hover {
  transform: translateY(-2px);
  background: #f4e6c9;
}
.option.picked {
  background: #ffe2eb;
  border-color: #ad5273;
}
.option.match {
  box-shadow: inset 0 0 0 2px #57a16e;
}
.option:disabled {
  cursor: default;
  opacity: 0.82;
}
.option-letter {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 7px;
  font-weight: 950;
  background: var(--paper);
}
.option-check {
  margin-left: auto;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.action {
  border: 2px solid var(--line);
  border-radius: 10px;
  padding: 11px 15px;
  box-shadow: 2px 2px 0 var(--line);
  font: 900 12px inherit;
  cursor: pointer;
}
.action.primary {
  background: var(--olive);
  color: white;
}
.action.secondary {
  background: var(--paper);
  color: var(--ink);
}
.action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.readiness {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: var(--muted);
  font-size: 10px;
}
.readiness b {
  font-size: 15px;
}
.readiness b.done {
  color: #318053;
}
.notice {
  color: #a34737;
  font-size: 11px;
  line-height: 1.5;
}
.result-answer {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  margin: 9px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.result-answer small {
  color: var(--muted);
  font-size: 10px;
}
.result-answer strong {
  font-size: 13px;
}
.result-message {
  margin-top: 12px;
  padding: 11px;
  border-radius: 10px;
  background: #ffe2eb;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.5;
}
.result-message.correct {
  background: #d9f3d9;
}
.secret-art {
  font-size: 56px;
  text-align: center;
  margin: 22px 0;
}
.result-panel p {
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
}
.result-panel .fine-print {
  font-size: 9px;
}
.quiz-footer {
  border-top: 1px dashed var(--line);
  padding-top: 10px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.5px;
}
@container (max-width:940px) {
  .quiz-body {
    grid-template-columns: 1fr 1fr;
  }
  .question-panel {
    grid-column: 1/-1;
    grid-row: 1;
  }
  .scoreboard,
  .result-panel {
    grid-row: 2;
  }
}
@container (max-width:520px) {
  .couple-quiz {
    gap: 12px;
  }
  .quiz-topline {
    align-items: start;
    flex-direction: column;
  }
  .quiz-body {
    grid-template-columns: 1fr;
  }
  .scoreboard,
  .result-panel,
  .question-panel {
    grid-column: 1;
    grid-row: auto;
  }
  .question-panel {
    grid-row: 1;
  }
  .scoreboard {
    grid-row: 2;
  }
  .result-panel {
    grid-row: 3;
  }
  .options {
    grid-template-columns: 1fr;
  }
  .option {
    min-height: 50px;
  }
  .quiz-heading p {
    font-size: 10px;
  }
  .round-chip {
    font-size: 9px;
    padding: 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
  }
}
</style>
