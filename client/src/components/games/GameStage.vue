<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";

import GameToolbar from "./GameToolbar.vue";
import ExternalGameFrame from "./ExternalGameFrame.vue";
import {
  getGameById,
  GAME_TYPES,
  GAME_STATUS,
} from "../../config/gameCatalog.js";

/*
 * GameStage.vue
 *
 * Bertugas:
 * - Menampilkan game yang dipilih
 * - Lazy load native Vue games
 * - Menjalankan external iframe game
 * - Menangani loading dan error
 * - Fullscreen dan restart
 * - Mengirim event ke GameLayout
 *
 * Tidak mengelola koneksi LiveKit secara langsung.
 */

// Vite akan menemukan semua game native.
// File game hanya di-load ketika dipilih.
const nativeModules = import.meta.glob("./native/*.vue");

const props = defineProps({
  game: {
    type: Object,
    default: null,
  },
  
  gameId: {
    type: String,
    default: "",
  },
  
  playerIdentities: {
    type: Array,
    default: () => [],
  },

  playerCount: {
    type: Number,
    default: 2,
  },

  participants: {
    type: Array,
    default: () => [],
  },

  gameState: {
    type: Object,
    default: () => ({}),
  },

  gamePaused: { type: Boolean, default: false },
  clockOffsetMs: { type: Number, default: 0 },

  playerIdentity: {
    type: String,
    default: "",
  },

  isHost: {
    type: Boolean,
    default: false,
  },

  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "back",
  "restart",
  "game-ready",
  "game-error",
  "game-action",
  "open-external",
  "pause",
  "resume",
  "end-game",
]);

// DOM
const stageRef = ref(null);

// Game component
const activeComponent = shallowRef(null);

// Status
const loading = ref(false);
const error = ref("");
const fullscreen = ref(false);
const soundEnabled = ref(true);

const gamePaused = computed(() => props.gamePaused);

// Digunakan agar proses load lama tidak
// menimpa game baru setelah user berpindah.
let loadVersion = 0;

// Remount game ketika restart.
const restartKey = ref(0);

// Resolve game dari object atau ID.
const selectedGame = computed(() => {
  if (props.game?.id) {
    return props.game;
  }

  if (props.gameId) {
    return getGameById(props.gameId);
  }

  return null;
});

function handlePause() {
  if (!props.isHost || props.readonly) return;
  emit("pause");
}

function handleResume() {
  if (!props.isHost || props.readonly) return;
  emit("resume");
}

function handleEndGame() {
  if (!props.isHost || props.readonly) return;
  emit("end-game");
}

const gameType = computed(() => selectedGame.value?.type || "");

const isNative = computed(() => gameType.value === GAME_TYPES.NATIVE);

const isEmbedded = computed(() => gameType.value === GAME_TYPES.EMBEDDED);

const isExternal = computed(() => gameType.value === GAME_TYPES.EXTERNAL);

const gameTitle = computed(() => selectedGame.value?.title || "Game Night");

const canInteract = computed(() => !props.readonly);

// Identifikasi sumber URL game.
const externalUrl = computed(() => {
  const game = selectedGame.value;

  if (!game) return "";

  const value = game.embedUrl || game.url || "";

  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
});

/*
 * Keamanan embed:
 *
 * Game harus diizinkan secara eksplisit
 * dalam gameCatalog.js melalui:
 *
 * embedAllowed: true
 * allowedEmbedHosts: ["game.example.com"]
 *
 * Domain tidak otomatis dianggap aman
 * hanya karena URL-nya HTTPS.
 */
const canEmbed = computed(() => {
  const game = selectedGame.value;

  if (
    !game ||
    !isEmbedded.value ||
    game.embedAllowed !== true ||
    !externalUrl.value
  ) {
    return false;
  }

  try {
    const hostname = new URL(externalUrl.value).hostname;

    const allowedHosts = game.allowedEmbedHosts || [];

    return Array.isArray(allowedHosts) && allowedHosts.includes(hostname);
  } catch {
    return false;
  }
});

const needsPlayers = computed(() => {
  const game = selectedGame.value;

  if (!game) return false;

  return (
    props.playerCount < (game.minPlayers || 1) ||
    props.playerCount > (game.maxPlayers || Infinity)
  );
});

const playerMessage = computed(() => {
  const game = selectedGame.value;

  if (!game) return "";

  if (props.playerCount < game.minPlayers) {
    return `Menunggu minimal ${game.minPlayers} pemain.`;
  }

  if (props.playerCount > game.maxPlayers) {
    return `Game ini maksimal untuk ${game.maxPlayers} pemain.`;
  }

  return "";
});

// Apakah game dapat dijalankan
const isAvailable = computed(() => {
  return selectedGame.value?.status === GAME_STATUS.AVAILABLE;
});

/*
 * Lazy load native games.
 *
 * Contoh:
 * CoupleQuiz -> ./native/CoupleQuiz.vue
 *
 * Jika file belum memiliki implementasi Vue
 * yang valid, error akan ditampilkan di Stage.
 */
async function loadGame() {
  const version = ++loadVersion;

  activeComponent.value = null;
  loading.value = false;
  error.value = "";

  const game = selectedGame.value;

  if (!game) return;

  if (!isAvailable.value) {
    error.value = "Game ini belum tersedia.";
    return;
  }

  if (needsPlayers.value) {
    // Jangan load game sebelum jumlah
    // pemain memenuhi ketentuan.
    return;
  }

  if (isNative.value) {
    const componentName = game.component;

    // Batasi nama komponen agar tidak dapat
    // membentuk path dinamis sembarangan.
    if (
      typeof componentName !== "string" ||
      !/^[A-Za-z][A-Za-z0-9]*$/.test(componentName)
    ) {
      error.value = "Konfigurasi game tidak valid.";
      return;
    }

    const filePath = `./native/${componentName}.vue`;

    const importer = nativeModules[filePath];

    if (!importer) {
      error.value = `Komponen ${componentName}.vue belum tersedia.`;
      return;
    }

    loading.value = true;

    try {
      const module = await importer();

      if (version !== loadVersion) return;

      if (!module?.default) {
        throw new Error("File game belum memiliki komponen Vue.");
      }

      activeComponent.value = module.default;
      error.value = "";

      emit("game-ready", game);
    } catch (err) {
      if (version !== loadVersion) return;

      error.value = err?.message || "Gagal memuat komponen game.";

      emit("game-error", {
        game,
        error: err,
      });
    } finally {
      if (version === loadVersion) {
        loading.value = false;
      }
    }

    return;
  }

  if (isEmbedded.value) {
    // Validasi dan loading iframe sekarang
    // ditangani ExternalGameFrame.vue.
    return;
  }

  if (isExternal.value) {
    if (!externalUrl.value) {
      error.value = "Alamat website game tidak valid.";
    }
    return;
  }

  error.value = "Tipe permainan tidak dikenali.";
}

function handleExternalLoad(payload) {
  // Artinya iframe selesai memuat dokumen.
  // Belum menjamin game dapat dimainkan.
  console.log("[MeetSpace] External iframe loaded:", payload);
}

function handleExternalError(payload) {
  console.warn("[MeetSpace] External game issue:", payload);

  emit("game-error", {
    game: selectedGame.value,
    error: new Error(payload.message),
  });
}

function retryLoading() {
  restartKey.value++;
  void loadGame();
}

// Restart
function restartGame() {
  if (!selectedGame.value || props.readonly || !props.isHost) return;

  restartKey.value++;

  emit("restart", selectedGame.value);
}

// Kembali ke Game Library
function backToLibrary() {
  emit("back");
}

// Native game mengirim aksi ke parent.
// Parent/useGameSync nantinya memvalidasi
// dan menyinkronkan ke pemain lain.
function handleGameAction(action) {
  if (!canInteract.value) return;

  emit("game-action", {
    gameId: selectedGame.value?.id,
    action,
  });
}

// Native game meminta restart.
function handleGameRestart() {
  restartGame();
}

// Open external website
function openExternal() {
  if (!externalUrl.value) return;

  // URL harus berasal dari gameCatalog
  // tepercaya, bukan input URL pengguna.
  const newWindow = window.open(
    externalUrl.value,
    "_blank",
    "noopener,noreferrer",
  );

  emit("open-external", selectedGame.value);

  return newWindow;
}

// Fullscreen
async function toggleFullscreen() {
  if (!stageRef.value) return;

  try {
    if (!document.fullscreenElement) {
      await stageRef.value.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    error.value = "Fullscreen tidak tersedia di browser ini.";
  }
}

function updateFullscreen() {
  fullscreen.value = document.fullscreenElement === stageRef.value;
}

// Load ketika game berubah.
// JSON/config memang diperlakukan immutable;
// pergantian game dilacak melalui identitas game.
watch(
  () => [
    selectedGame.value?.id,
    selectedGame.value?.type,
    selectedGame.value?.component,
    selectedGame.value?.status,
    needsPlayers.value,
  ],
  () => {
    restartKey.value = 0;
    void loadGame();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  loadVersion++;

  document.removeEventListener("fullscreenchange", updateFullscreen);
});

// Registration dipasang setelah DOM tersedia.
nextTick(() => {
  document.addEventListener("fullscreenchange", updateFullscreen);
});
</script>

<template>
  <section
    ref="stageRef"
    class="game-stage"
    :class="{
      'is-fullscreen': fullscreen,
    }"
  >
    <!-- HEADER -->
    <GameToolbar
      :game="selectedGame"
      :player-count="playerCount"
      :is-host="isHost"
      :is-fullscreen="fullscreen"
      v-model:sound-enabled="soundEnabled"
      :readonly="readonly"
      :loading="loading"
      :game-paused="gamePaused"
      :can-restart="isAvailable && !needsPlayers"
      @back="backToLibrary"
      @restart="restartGame"
      @fullscreen="toggleFullscreen"
      @pause="handlePause"
      @resume="handleResume"
      @end-game="handleEndGame"
    />

    <!-- MAIN GAME VIEW -->
    <div class="stage-content">
      <!-- NO GAME -->
      <div v-if="!selectedGame" class="stage-state">
        <div class="state-icon">🎲</div>

        <h3>Ready for Game Night?</h3>

        <p>Pilih salah satu game dari Game Library untuk memulai permainan.</p>

        <button class="retro-action" type="button" @click="backToLibrary">
          Browse Games →
        </button>
      </div>

      <!-- WAITING PLAYERS -->
      <div v-else-if="needsPlayers" class="stage-state">
        <div class="state-icon">👥</div>

        <h3>Waiting for players</h3>

        <p>{{ playerMessage }}</p>

        <span class="status-message">
          {{ playerCount }} player(s) connected
        </span>

        <button type="button" class="retro-action" @click="backToLibrary">
          Choose Another Game
        </button>
      </div>

      <!-- ERROR -->
      <div v-else-if="error" class="stage-state error-state" role="alert">
        <div class="state-icon">⚠️</div>

        <h3>Game could not start</h3>

        <p>{{ error }}</p>

        <div class="state-actions">
          <button class="retro-action" type="button" @click="retryLoading">
            ↻ Try Again
          </button>

          <button
            class="retro-action secondary"
            type="button"
            @click="backToLibrary"
          >
            Back to Games
          </button>
        </div>
      </div>

      <!-- LOADING -->
      <div v-else-if="loading && isNative" class="stage-state" role="status">
        <div class="loading-spinner" aria-hidden="true"></div>

        <h3>Loading your game...</h3>

        <p>Preparing {{ gameTitle }} for Game Night.</p>
      </div>

      <!-- NATIVE GAME -->
      <div v-else-if="isNative && activeComponent" class="native-game-wrapper">
        <component
          :is="activeComponent"
          :key="`${selectedGame.id}-${restartKey}`"
          :game="selectedGame"
          :participants="participants"
          :player-count="playerCount"
          :player-identity="playerIdentity"
          :is-host="isHost"
          :readonly="readonly"
          :game-state="gameState"
          @action="handleGameAction"
          @restart="handleGameRestart"
          @back="backToLibrary"
          :sound-enabled="soundEnabled"
          :paused="gamePaused"
          v-bind="selectedGame.id === 'memory-match' ? { clockOffsetMs } : {}"
          :player-identities="playerIdentities"
        />
      </div>

      <div
        v-else-if="isEmbedded && selectedGame.sharedScreenOnly && !isHost"
        class="stage-state"
        role="status"
      >
        <div class="state-icon">📺</div>
        <h3>Menunggu layar host</h3>
        <p>
          Game browser ini dimainkan di satu layar. Minta host membagikan tab
          game agar kalian dapat bermain bersama.
        </p>
      </div>

      <!-- EMBEDDED EXTERNAL GAME -->
      <ExternalGameFrame
        v-else-if="isEmbedded"
        :game="selectedGame"
        :reload-key="restartKey"
        @load="handleExternalLoad"
        @error="handleExternalError"
        @open-external="(game) => emit('open-external', game)"
      />

      <!-- EXTERNAL LINK GAME -->
      <div v-else-if="isExternal" class="stage-state">
        <div class="state-icon">🌐</div>

        <h3>Play on external website</h3>

        <p>
          Game ini akan terbuka di tab baru. Meeting MeetSpace tetap berjalan.
        </p>

        <button class="retro-action" type="button" @click="openExternal">
          Open {{ gameTitle }} ↗
        </button>
      </div>

      <!-- FALLBACK -->
      <div v-else class="stage-state">
        <div class="state-icon">🎮</div>

        <h3>Preparing game...</h3>

        <p>Game sedang dipersiapkan.</p>
      </div>
    </div>

    <!-- FOOTER -->
    <footer class="stage-footer">
      <div class="footer-left">
        <span class="footer-star">✦</span>
        PLAY TOGETHER, STAY TOGETHER
      </div>

      <div class="footer-right">
        <span>
          {{ selectedGame?.duration || "Game Night" }}
        </span>

        <span class="footer-divider">•</span>

        <span>
          {{ selectedGame?.category || "MeetSpace" }}
        </span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.game-stage {
  --stage-ink: var(--text-primary, #303826);
  --stage-line: var(--border-color, #4f5b2a);
  --stage-surface: var(--bg-surface, #fffcf7);
  --stage-soft: var(--bg-elevated, #eee6d7);
  --stage-olive: var(--color-secondary, #4f5b2a);
  --stage-muted: var(--text-secondary, #77756d);
  --stage-gold: var(--color-gold, #b8892d);

  display: flex;
  flex-direction: column;

  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;

  min-height: 0;
  min-width: 0;
  overflow: hidden;

  background: var(--stage-surface);
  color: var(--stage-ink);

  border: 2px solid var(--stage-line);
  border-radius: 16px;

  container-type: size;
}

/* HEADER */
.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  gap: 12px;
  flex: none;

  padding: 11px 15px;

  border-bottom: 2px solid var(--stage-line);
  background: var(--stage-soft);
}

.stage-heading {
  display: flex;
  align-items: center;
  gap: 12px;

  min-width: 0;
}

.game-identity {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.stage-eyebrow {
  font-size: 9px;
  letter-spacing: 1.5px;
  font-weight: 950;
  color: var(--stage-olive);
}

.game-heading-row {
  display: flex;
  align-items: center;
  gap: 7px;

  min-width: 0;
}

.heading-icon {
  font-size: 19px;
  line-height: 1;
}

.game-heading-row h2 {
  margin: 0;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-size: 15px;
  font-weight: 950;
}

.stage-controls {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}

.icon-button {
  display: inline-grid;
  place-items: center;

  width: 34px;
  height: 34px;
  flex: none;

  border: 2px solid var(--stage-line);
  border-radius: 9px;

  background: var(--stage-surface);
  color: var(--stage-ink);

  font-size: 19px;
  font-weight: 900;

  cursor: pointer;
  transition: 150ms ease;
}

.icon-button:hover:not(:disabled) {
  transform: translateY(-2px);
  background: var(--stage-gold);
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.multiplayer-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  font-size: 10px;
  font-weight: 800;

  border: 1px solid var(--stage-line);
  border-radius: 30px;

  padding: 7px 10px;
  background: var(--stage-surface);

  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #46a56a;
  box-shadow: 0 0 0 3px #46a56a20;
}

/* MAIN */
.stage-content {
  position: relative;
  display: flex;
  flex-direction: column;

  flex: 1;

  min-width: 0;
  min-height: 0;

  overflow: hidden;
  background: var(--stage-surface);
}

/* GAME CONTENT */
.native-game-wrapper {
  display: flex;
  flex: 1;

  min-height: 0;
  min-width: 0;

  overflow: auto;
  scrollbar-width: thin;
}

.native-game-wrapper > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* EMPTY / ERROR */
.stage-state {
  display: flex;
  flex-direction: column;

  flex: 1;
  align-items: center;
  justify-content: center;

  text-align: center;
  gap: 13px;

  padding: 28px;
  overflow-y: auto;
}

.state-icon {
  font-size: clamp(48px, 10vw, 75px);
  line-height: 1;
}

.stage-state h3 {
  margin: 0;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(19px, 3vw, 29px);
}

.stage-state p {
  margin: 0;
  max-width: 360px;
  color: var(--stage-muted);
  font-size: 12px;
  line-height: 1.7;
}

.status-message {
  display: inline-flex;
  padding: 7px 12px;

  background: var(--stage-soft);
  border: 1px solid var(--stage-line);
  border-radius: 20px;

  font-size: 11px;
  font-weight: 850;
}

.state-actions {
  display: flex;
  justify-content: center;
  gap: 9px;
  flex-wrap: wrap;
}

.retro-action {
  border: 2px solid var(--stage-line);
  border-radius: 11px;

  padding: 11px 17px;

  background: var(--stage-olive);
  color: #fff;

  font-size: 12px;
  font-weight: 900;

  box-shadow: 3px 3px 0 var(--stage-line);
  cursor: pointer;
}

.retro-action:hover {
  transform: translateY(-2px);
}

.retro-action.secondary {
  background: var(--stage-surface);
  color: var(--stage-ink);
}

/* LOADING */
.loading-spinner {
  width: 34px;
  height: 34px;
  border: 4px solid var(--stage-soft);
  border-top-color: var(--stage-olive);
  border-radius: 50%;

  animation: stage-spin 700ms linear infinite;
}

@keyframes stage-spin {
  to {
    transform: rotate(360deg);
  }
}

/* EMBED */
.external-game-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;

  flex: 1;
  min-width: 0;
  min-height: 0;

  overflow: hidden;
}

.game-iframe {
  display: block;
  flex: 1;

  width: 100%;
  min-height: 0;
  border: 0;

  background: #fff;
}

.iframe-loading {
  position: absolute;
  z-index: 3;
  inset: 0 0 38px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  gap: 15px;

  background: var(--stage-surface);
  pointer-events: none;
}

.iframe-loading p {
  color: var(--stage-muted);
  font-size: 12px;
}

.external-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;

  gap: 10px;
  flex: none;

  padding: 8px 12px;

  border-top: 1px solid var(--stage-line);
  background: var(--stage-soft);

  font-size: 10px;
  color: var(--stage-muted);
}

.external-hint button {
  border: none;
  background: none;
  color: var(--stage-olive);

  font-size: 10px;
  font-weight: 900;
  text-decoration: underline;

  cursor: pointer;
}

/* FOOTER */
.stage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;

  flex: none;
  gap: 12px;

  padding: 8px 14px;

  border-top: 1px dashed var(--stage-line);
  background: var(--stage-soft);

  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.5px;

  color: var(--stage-muted);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-star {
  color: var(--stage-gold);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 6px;

  text-transform: capitalize;
}

.footer-divider {
  opacity: 0.5;
}

/* FULLSCREEN */
.game-stage:fullscreen {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  background: var(--stage-surface);
}

/* RESPONSIVE: WIDTH OF THE GAME AREA */
@container (max-width: 520px) {
  .stage-header {
    padding: 8px;
    gap: 6px;
  }

  .stage-heading {
    gap: 7px;
  }

  .game-heading-row h2 {
    font-size: 12px;
  }

  .stage-eyebrow {
    font-size: 8px;
  }

  .icon-button {
    width: 29px;
    height: 29px;
    font-size: 16px;
  }

  .multiplayer-indicator {
    padding: 5px 7px;
    font-size: 9px;
  }

  .stage-footer {
    font-size: 8px;
    padding: 6px 9px;
  }
}

@container (max-width: 350px) {
  .multiplayer-indicator {
    display: none;
  }

  .stage-footer {
    flex-direction: column;
    gap: 3px;
  }

  .stage-state {
    padding: 13px;
  }
}

@container (max-height: 340px) {
  .stage-footer {
    display: none;
  }

  .stage-header {
    padding: 6px 9px;
  }

  .stage-state {
    gap: 7px;
    padding: 12px;
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
