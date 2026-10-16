<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  game: {
    type: Object,
    default: null,
  },

  playerCount: {
    type: Number,
    default: 0,
  },

  isHost: {
    type: Boolean,
    default: false,
  },

  isFullscreen: {
    type: Boolean,
    default: false,
  },

  soundEnabled: {
    type: Boolean,
    default: true,
  },

  readonly: {
    type: Boolean,
    default: false,
  },

  loading: {
    type: Boolean,
    default: false,
  },

  gamePaused: {
    type: Boolean,
    default: false,
  },

  canRestart: {
    type: Boolean,
    default: true,
  },

  showHostControls: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  "back",
  "restart",
  "fullscreen",
  "update:soundEnabled",
  "pause",
  "resume",
  "end-game",
]);

const showRestartConfirm = ref(false);
const showEndConfirm = ref(false);

const gameTitle = computed(() => props.game?.title || "Game Night");

const gameIcon = computed(() => props.game?.icon || "🎮");

const isMultiplayer = computed(() =>
  Boolean(props.game?.features?.multiplayer),
);

const canControl = computed(() => !props.readonly && !props.loading);

const restartAllowed = computed(() => props.isHost && canControl.value && props.canRestart);

const hostControlsAvailable = computed(
  () => props.isHost && props.showHostControls && canControl.value,
);

function goBack() {
  closeDialogs();
  emit("back");
}

function requestRestart() {
  if (!restartAllowed.value) return;
  showRestartConfirm.value = true;
}

function confirmRestart() {
  if (!restartAllowed.value) return;

  showRestartConfirm.value = false;
  emit("restart");
}

function toggleFullscreen() {
  emit("fullscreen");
}

function toggleSound() {
  emit("update:soundEnabled", !props.soundEnabled);
}

function togglePause() {
  if (!hostControlsAvailable.value) return;

  emit(props.gamePaused ? "resume" : "pause");
}

function requestEndGame() {
  if (!hostControlsAvailable.value) return;
  showEndConfirm.value = true;
}

function confirmEndGame() {
  if (!hostControlsAvailable.value) return;

  showEndConfirm.value = false;
  emit("end-game");
}

function closeDialogs() {
  showRestartConfirm.value = false;
  showEndConfirm.value = false;
}

watch(() => props.game?.id, closeDialogs);

watch(
  () => props.isHost,
  (value) => {
    if (!value) showEndConfirm.value = false;
  },
);
</script>

<template>
  <div class="ms-game-toolbar">
    <div class="toolbar-main">
      <!-- LEFT -->
      <div class="toolbar-left">
        <button
          class="toolbar-button back-button"
          type="button"
          title="Back to Game Library"
          aria-label="Back to Game Library"
          @click="goBack"
        >
          <span aria-hidden="true">←</span>
          <span class="button-label">Games</span>
        </button>

        <span class="toolbar-divider"></span>

        <div class="game-identity">
          <span class="game-icon" aria-hidden="true">
            {{ gameIcon }}
          </span>

          <div class="game-info">
            <span class="game-eyebrow">NOW PLAYING</span>
            <strong :title="gameTitle">{{ gameTitle }}</strong>
          </div>
        </div>
      </div>

      <!-- RIGHT -->
      <div class="toolbar-right">
        <span
          v-if="isMultiplayer"
          class="players-indicator"
          :title="`${playerCount} connected players`"
        >
          <span class="live-dot"></span>
          <span>{{ playerCount }}</span>
          <span class="players-label">Players</span>
        </span>

        <span v-if="gamePaused" class="paused-indicator"> Paused </span>

        <button
          class="toolbar-button"
          type="button"
          :title="soundEnabled ? 'Mute game sounds' : 'Enable game sounds'"
          :aria-label="soundEnabled ? 'Mute game sounds' : 'Enable game sounds'"
          :aria-pressed="soundEnabled"
          @click="toggleSound"
        >
          <span aria-hidden="true">
            {{ soundEnabled ? "♫" : "♪̸" }}
          </span>
          <span class="button-label">Sound</span>
        </button>

        <button
          class="toolbar-button"
          type="button"
          title="Restart game"
          aria-label="Restart game"
          :disabled="!restartAllowed"
          @click="requestRestart"
        >
          <span aria-hidden="true">↻</span>
          <span class="button-label">Restart</span>
        </button>

        <button
          class="toolbar-button"
          type="button"
          :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          @click="toggleFullscreen"
        >
          <span aria-hidden="true">
            {{ isFullscreen ? "↙" : "⛶" }}
          </span>
          <span class="button-label">Full</span>
        </button>

        <!-- HOST CONTROLS -->
        <div v-if="isHost && showHostControls" class="host-controls">
          <span class="toolbar-divider"></span>

          <span class="host-marker">HOST</span>

          <button
            class="toolbar-button"
            type="button"
            :disabled="!hostControlsAvailable"
            :title="gamePaused ? 'Resume game' : 'Pause game'"
            :aria-label="gamePaused ? 'Resume game' : 'Pause game'"
            @click="togglePause"
          >
            {{ gamePaused ? "▶" : "Ⅱ" }}
          </button>

          <button
            class="toolbar-button danger-button"
            type="button"
            :disabled="!hostControlsAvailable"
            title="End current game for everyone"
            aria-label="End current game for everyone"
            @click="requestEndGame"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- RESTART CONFIRM -->
    <div
      v-if="showRestartConfirm"
      class="dialog-backdrop"
      @click.self="closeDialogs"
    >
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restart-title"
      >
        <div class="dialog-icon">↻</div>

        <h3 id="restart-title">Restart game?</h3>

        <p>
          Mulai ulang permainan
          {{ gameTitle }}? Progres permainan saat ini mungkin akan hilang.
        </p>

        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-button secondary"
            @click="closeDialogs"
          >
            Cancel
          </button>

          <button
            type="button"
            class="dialog-button primary"
            @click="confirmRestart"
          >
            Restart
          </button>
        </div>
      </div>
    </div>

    <!-- END CONFIRM -->
    <div
      v-if="showEndConfirm"
      class="dialog-backdrop"
      @click.self="closeDialogs"
    >
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-title"
      >
        <div class="dialog-icon">✕</div>

        <h3 id="end-game-title">End this game?</h3>

        <p>
          Akhiri game untuk semua peserta? Video call MeetSpace akan tetap
          berjalan.
        </p>

        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-button secondary"
            @click="closeDialogs"
          >
            Cancel
          </button>

          <button
            type="button"
            class="dialog-button danger"
            @click="confirmEndGame"
          >
            End Game
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-game-toolbar {
  --toolbar-line: var(--border-color, #4f5b2a);
  --toolbar-ink: var(--text-primary, #303826);
  --toolbar-olive: var(--color-secondary, #4f5b2a);
  --toolbar-paper: var(--bg-elevated, #eee6d7);
  --toolbar-surface: var(--bg-surface, #fffcf7);
  --toolbar-muted: var(--text-secondary, #77756d);

  position: relative;
  z-index: 10;
  flex: none;
  width: 100%;
  min-width: 0;
  color: var(--toolbar-ink);
  container-type: inline-size;
}

.toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 13px;
  background: var(--toolbar-paper);
  border-bottom: 2px solid var(--toolbar-line);
}

.toolbar-left,
.toolbar-right,
.host-controls {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.toolbar-right {
  justify-content: flex-end;
  flex: none;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: none;
  min-height: 34px;
  padding: 7px 10px;
  border: 2px solid var(--toolbar-line);
  border-radius: 9px;
  background: var(--toolbar-surface);
  color: var(--toolbar-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: 150ms ease;
}

.toolbar-button:hover:not(:disabled) {
  transform: translateY(-2px);
  background: var(--color-sand, #d8c9a8);
}

.toolbar-button:focus-visible {
  outline: 3px solid var(--color-gold, #b8892d);
  outline-offset: 2px;
}

.toolbar-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.back-button {
  background: var(--toolbar-olive);
  color: #fff;
}

.toolbar-divider {
  display: block;
  flex: none;
  width: 1px;
  height: 26px;
  background: var(--toolbar-line);
  opacity: 0.4;
  margin: 0 3px;
}

.game-identity {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.game-icon {
  flex: none;
  font-size: 27px;
  line-height: 1;
}

.game-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.game-eyebrow {
  font-size: 9px;
  letter-spacing: 1px;
  font-weight: 900;
  color: var(--toolbar-muted);
}

.game-info strong {
  font-size: 13px;
  font-weight: 950;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.players-indicator,
.paused-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  border-radius: 20px;
  padding: 7px 9px;
  background: var(--toolbar-surface);
  border: 1px solid var(--toolbar-line);
  font-size: 10px;
  font-weight: 850;
}

.paused-indicator {
  background: #fff0c2;
  color: #805000;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2b9c67;
}

.host-marker {
  padding: 5px 7px;
  background: var(--toolbar-olive);
  color: #fff;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.5px;
}

.danger-button {
  color: #b43b3b;
  border-color: #b43b3b;
}

/* CONFIRM DIALOG */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 18px;
  background: #151b17a9;
}

.confirm-dialog {
  width: min(100%, 390px);
  padding: 25px;
  background: var(--toolbar-surface);
  border: 3px solid var(--toolbar-line);
  border-radius: 20px;
  box-shadow: 7px 7px 0 var(--toolbar-line);
  text-align: center;
}

.dialog-icon {
  font-size: 38px;
  color: var(--toolbar-olive);
}

.confirm-dialog h3 {
  margin: 8px 0;
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
}

.confirm-dialog p {
  margin: 0;
  color: var(--toolbar-muted);
  line-height: 1.6;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.dialog-button {
  flex: 1;
  padding: 11px 14px;
  border: 2px solid var(--toolbar-line);
  border-radius: 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.dialog-button.primary {
  background: var(--toolbar-olive);
  color: #fff;
}

.dialog-button.secondary {
  background: var(--toolbar-surface);
  color: var(--toolbar-ink);
}

.dialog-button.danger {
  background: #b43b3b;
  border-color: #b43b3b;
  color: white;
}

/* RESPONSIVE */
@container (max-width: 780px) {
  .button-label,
  .players-label,
  .game-eyebrow {
    display: none;
  }

  .toolbar-button {
    width: 34px;
    padding: 5px;
    font-size: 17px;
  }

  .game-icon {
    font-size: 23px;
  }

  .toolbar-main {
    padding: 8px;
    gap: 7px;
  }
}

@container (max-width: 490px) {
  .toolbar-main {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .toolbar-left {
    flex: 1;
  }

  .toolbar-right {
    width: 100%;
    justify-content: flex-end;
  }

  .toolbar-divider {
    margin: 0 2px;
  }

  .game-info strong {
    font-size: 12px;
  }
}

@container (max-width: 310px) {
  .host-marker {
    display: none;
  }

  .toolbar-right {
    gap: 4px;
  }

  .toolbar-button {
    width: 30px;
    min-height: 30px;
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
