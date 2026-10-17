<script setup>
import { computed, onMounted, ref, toRef, watch } from "vue";
import ScreenShareStage from "../meeting/ScreenShareStage.vue";
import ParticipantGallery from "../meeting/ParticipantGallery.vue";
import GameLibrary from "../games/GameLibrary.vue";
import GameStage from "../games/GameStage.vue";
import GameInteractionDock from "../games/GameInteractionDock.vue";
import { useGameSync } from "../../composables/useGameSync.js";
import { reduceGameAction } from "../../composables/gameReducers.js";
import { applyGameCatalog, getGameById } from "../../config/gameCatalog.js";
import { applyGameContent, gameContentForSession } from "../../config/gameContent.js";
import api from '../../services/api.js';
import { toast } from '../../services/toast.js';

/**
 * Host identity must come from authenticated meeting admission, not the guest's input.
 * The room prop represents MeetSpace room metadata, NOT the LiveKit Room instance.
 */
const props = defineProps({
  view: { type: Object, default: () => ({}) },
  participants: { type: Array, default: () => [] },
  room: { type: Object, default: null },
  livekitRoom: { type: Object, default: null },
  hostIdentity: { type: String, default: "" },
});
const emit = defineEmits(["pin", "view"]);

const hostId = computed(() => props.hostIdentity || "");
const sync = useGameSync({
  room: toRef(props, "livekitRoom"),
  hostIdentity: hostId,
  reduceAction: reduceGameAction,
});

const sharer = computed(() => props.participants.find((p) => p.screenTrack));
const selectedGame = computed(() => getGameById(sync.gameId.value));
const showLibrary = ref(false);
const showShare = ref(true);
const contentReady = ref(false);
const playerCount = computed(
  () => sync.session.value?.players?.length ?? sync.participants.value.length,
);
const roster = computed(() => sync.session.value?.players ?? []);
const isParticipant = computed(() =>
  roster.value.includes(sync.localIdentity.value),
);
const canSendAction = computed(
  () => sync.connected.value && !sync.gamePaused.value && isParticipant.value,
);
// Keep host toolbar usable while paused, so Resume never becomes disabled.
const stageReadonly = computed(
  () => !sync.connected.value || !isParticipant.value,
);
const rosterReady = computed(() => sync.participants.value.length >= 2);
const missingHost = computed(() => !hostId.value);
const waitingForHost = computed(
  () =>
    sync.connected.value &&
    !sync.isHost.value &&
    !selectedGame.value &&
    !showLibrary.value,
);
const syncingNotice = computed(() => {
  if (!props.livekitRoom || !sync.connected.value)
    return "Connecting to Game Night…";
  if (missingHost.value)
    return "Host identity is missing. Game synchronization is unavailable.";
  if (sync.syncing.value) return "Synchronizing game state with the host…";
  if (selectedGame.value && !isParticipant.value)
    return "Spectator mode — ask the host to restart the game to include you.";
  return "";
});

// Switching games is host-controlled. The player roster is captured at start.
async function chooseGame(game) {
  if (
    !contentReady.value ||
    !sync.isHost.value ||
    !game ||
    game.status !== "available"
  )
    return;
  if (
    sync.participants.value.length < game.minPlayers ||
    sync.participants.value.length > game.maxPlayers
  )
    return;
  const ok = await sync.startGame(game.id, sync.participants.value, gameContentForSession(game.id));
  if (ok) showLibrary.value = false;
}
function backToLibrary() {
  showLibrary.value = true;
}
function returnToGame() {
  showLibrary.value = false;
}
async function dispatchGameAction(payload) {
  if (!canSendAction.value || !payload || payload.gameId !== sync.gameId.value)
    return;
  await sync.dispatchAction(payload.action);
}
async function sendGameInteraction(type, id, target) {
  if (!await sync.sendInteraction(type, id, target)) toast.info('Interaksi belum terkirim. Tunggu sebentar lalu coba lagi.');
}
async function respondGameInteraction(eventId, accepted) {
  if (!await sync.respondInteraction(eventId, accepted)) toast.info('Jawaban tantangan belum terkirim. Coba lagi.');
}
async function requestRestart() {
  if (!sync.isHost.value) return;
  await sync.restartGame();
}
async function requestPause() {
  if (sync.isHost.value) await sync.setPaused(true);
}
async function requestResume() {
  if (sync.isHost.value) await sync.setPaused(false);
}
async function requestEnd() {
  if (!sync.isHost.value) return;
  const ok = await sync.endGame();
  if (ok) showLibrary.value = false;
}

// When host changes the active game, guest returns to its stage automatically.
watch(
  () => sync.session.value?.sessionId,
  (newId, oldId) => {
    if (newId && Array.isArray(sync.session.value?.content))
      applyGameContent(sync.session.value.content, sync.session.value.gameId);
    if (newId && newId !== oldId) showLibrary.value = false;
  },
  { flush: 'sync' },
);
onMounted(async () => {
  const results = await Promise.allSettled([api.get('/game-content'), api.get('/game-catalog')]);
  if (results[0].status === 'fulfilled') applyGameContent(results[0].value.data.data);
  else toast.error(results[0].reason);
  if (results[1].status === 'fulfilled') applyGameCatalog(results[1].value.data.data);
  else toast.error(results[1].reason);
  if (sync.session.value?.gameId && Array.isArray(sync.session.value.content))
    applyGameContent(sync.session.value.content, sync.session.value.gameId);
  contentReady.value = true;
});
watch(
  () => sync.gameId.value,
  (id) => {
    if (!id) showLibrary.value = false;
  },
);
</script>

<template>
  <section class="ms-layout ms-game" aria-label="MeetSpace Game Night">
    <div class="game-workspace">
      <div class="game-topline">
        <div class="game-label">
          <span class="game-icon">✦</span> GAME NIGHT
          <span class="room-name" v-if="room?.name">· {{ room.name }}</span>
        </div>
        <div class="top-actions">
          <span v-if="sync.isHost.value" class="host-pill">HOST</span>
          <span v-else-if="sync.connected.value" class="guest-pill">GUEST</span>
          <button
            v-if="sharer"
            type="button"
            class="small-btn"
            @click="showShare = !showShare"
          >
            {{ showShare ? "Game view" : "Shared screen" }}
          </button>
          <button
            v-if="selectedGame && showLibrary"
            type="button"
            class="small-btn primary"
            @click="returnToGame"
          >
            Return to game
          </button>
          <button
            v-if="selectedGame && !showLibrary && sync.isHost.value"
            type="button"
            class="small-btn"
            @click="backToLibrary"
          >
            Change game
          </button>
        </div>
      </div>

      <div v-if="sync.lastError.value" class="notice error" role="alert">
        {{ sync.lastError.value }}
      </div>
      <div v-if="syncingNotice" class="notice" role="status">
        {{ syncingNotice }}
      </div>

      <div class="game-canvas">
        <div v-if="sharer && showShare" class="share-stage">
          <ScreenShareStage :sharer="sharer" />
          <button
            type="button"
            class="share-overlay-button"
            @click="showShare = false"
          >
            Switch to Game Night →
          </button>
        </div>
        <div
          v-else-if="!sync.connected.value || missingHost"
          class="empty-state"
        >
          <div class="empty-art">🎮</div>
          <h2>
            {{
              missingHost && sync.connected.value
                ? "Game host unavailable"
                : "Connecting to Game Night"
            }}
          </h2>
          <p>
            {{
              missingHost && sync.connected.value
                ? "The meeting must provide a trusted LiveKit host identity."
                : "Waiting for the LiveKit connection to become ready."
            }}
          </p>
        </div>
        <GameLibrary
          v-else-if="showLibrary || (sync.isHost.value && !selectedGame)"
          :player-count="sync.participants.value.length"
          :disabled="!contentReady || !sync.isHost.value"
          :active-game-id="sync.gameId.value"
          @select-game="chooseGame"
        />
        <div v-else-if="waitingForHost" class="empty-state">
          <div class="empty-art">💌</div>
          <h2>Waiting for the host</h2>
          <p>
            The host will choose a game for everyone. Your video call stays
            active.
          </p>
          <button class="small-btn" type="button" @click="showLibrary = true">
            Explore the game library
          </button>
        </div>
        <GameStage
          v-else-if="selectedGame"
          :game="selectedGame"
          :participants="participants"
          :player-count="playerCount"
          :player-identities="roster"
          :player-identity="sync.localIdentity.value"
          :is-host="sync.isHost.value"
          :game-state="sync.gameState.value"
          :game-paused="sync.gamePaused.value"
          :clock-offset-ms="sync.clockOffsetMs.value"
          :readonly="stageReadonly"
          @game-action="dispatchGameAction"
          @back="backToLibrary"
          @restart="requestRestart"
          @pause="requestPause"
          @resume="requestResume"
          @end-game="requestEnd"
        />
        <div v-else class="empty-state">
          <div class="empty-art">🎲</div>
          <h2>Game unavailable</h2>
          <p>Ask the host to select an available game.</p>
        </div>
        <GameInteractionDock
          :interactions="sync.interactions.value"
          :identities="sync.participants.value"
          :participants="participants"
          :local-identity="sync.localIdentity.value"
          :connected="sync.connected.value"
          @send="sendGameInteraction"
          @respond="respondGameInteraction"
        />
      </div>

      <div
        v-if="sync.isHost.value && sync.connected.value && !rosterReady"
        class="notice subtle"
      >
        Invite at least one more participant to begin a multiplayer game.
      </div>
    </div>

    <aside class="game-participants" aria-label="Meeting participants">
      <div class="panel-heading">
        <span>● LIVE VIDEO</span>
        <span>{{ sync.participants.value.length }} connected</span>
      </div>
      <label class="video-layout">
        <span>View</span>
        <select
          :value="view?.layout || 'gallery'"
          aria-label="Tampilan kamera Game Night"
          @change="emit('view', { layout: $event.target.value })"
        >
          <option value="gallery">Gallery</option>
          <option value="speaker">Speaker</option>
          <option value="dynamic">Dynamic gallery</option>
          <option value="multi">Multi-speaker</option>
          <option value="immersive">Retro lounge</option>
        </select>
      </label>
      <div class="participant-scroll">
        <ParticipantGallery
          :participants="participants"
          :view="view"
          :pinned-id="view?.pinnedId"
          pinnable
          @pin="emit('pin', $event)"
        />
      </div>
    </aside>
  </section>
</template>

<style scoped>
.ms-game {
  --game-line: var(--ms-line, var(--border-color, #454a32));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 23%);
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  gap: 9px;
  color: var(--text-primary);
}
.game-workspace {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 7px;
}
.game-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  padding: 7px 9px;
  border: 2px solid var(--game-line);
  border-radius: 11px;
  background: var(--bg-elevated);
}
.game-label {
  font-weight: 950;
  font-size: 12px;
  letter-spacing: 0.07em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.game-icon {
  color: var(--color-secondary);
  font-size: 17px;
}
.room-name {
  font-size: 11px;
  letter-spacing: normal;
  opacity: 0.7;
}
.top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.host-pill,
.guest-pill {
  font-size: 9px;
  font-weight: 900;
  padding: 5px 7px;
  border: 1px solid var(--game-line);
  border-radius: 6px;
}
.host-pill {
  background: var(--color-secondary);
  color: var(--color-primary);
}
.small-btn {
  border: 1.5px solid var(--game-line);
  border-radius: 8px;
  padding: 7px 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}
.small-btn:hover {
  background: var(--bg-hover);
}
.small-btn.primary {
  background: var(--color-secondary);
  color: var(--color-primary);
}
.game-canvas {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.game-canvas > :deep(*) {
  min-width: 0;
}
.share-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
}
.share-stage > :deep(*) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.share-overlay-button {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 5;
  border: 2px solid var(--game-line);
  border-radius: 8px;
  padding: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-weight: 800;
  cursor: pointer;
}
.notice {
  flex: none;
  font-size: 11px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--game-line);
}
.notice.error {
  color: #a53535;
  border-color: #b65757;
}
.notice.subtle {
  opacity: 0.8;
}
.empty-state {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  gap: 11px;
  padding: 22px;
  background: var(--bg-surface);
  border: 2px dashed var(--game-line);
  border-radius: 15px;
}
.empty-art {
  font-size: 50px;
}
.empty-state h2 {
  margin: 0;
  font-size: 21px;
}
.empty-state p {
  margin: 0;
  max-width: 350px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.game-participants {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 2px solid var(--game-line);
  border-radius: 12px;
  background: var(--bg-elevated);
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  flex: none;
  padding: 11px 9px;
  border-bottom: 1px solid var(--game-line);
  font-size: 10px;
  font-weight: 850;
}
.panel-heading span:last-child {
  font-weight: 600;
  color: var(--text-secondary);
}
.video-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  flex: none;
  padding: 7px 9px;
  border-bottom: 1px solid var(--game-line);
  font-size: 10px;
  font-weight: 850;
}
.video-layout select {
  min-width: 0;
  max-width: 65%;
  padding: 5px 7px;
  border: 1.5px solid var(--game-line);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.participant-scroll {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 5px;
}
.participant-scroll > :deep(*) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
@media (max-width: 950px) {
  .ms-game {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) clamp(105px, 19vh, 160px);
  }
}
@media (max-width: 580px) {
  .ms-game {
    gap: 6px;
    grid-template-rows: minmax(0, 1fr) clamp(94px, 18vh, 138px);
  }
  .game-topline {
    padding: 6px;
    align-items: flex-start;
  }
  .room-name {
    display: none;
  }
  .game-label {
    font-size: 10px;
  }
  .top-actions {
    gap: 4px;
  }
  .small-btn {
    padding: 5px 7px;
    font-size: 10px;
  }
  .panel-heading {
    padding: 5px 8px;
    font-size: 9px;
  }
}
@media (max-height: 570px) and (min-width: 951px) {
  .ms-game {
    grid-template-columns: minmax(0, 1fr) minmax(150px, 20%);
  }
  .game-topline {
    padding: 4px;
  }
}
</style>
