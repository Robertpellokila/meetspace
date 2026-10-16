<script setup>
import { copyRoomInvite } from "../services/roomInvite.js";
import { useCameraBackground } from '../composables/useCameraBackground.js';
import { useConnectionHealth } from '../composables/useConnectionHealth.js';
import ParticipantAudio from "../components/meeting/ParticipantAudio.vue";
import RetroSplash from "../components/common/RetroSplash.vue";
import { useErrorToast } from "../composables/useErrorToast.js";
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { RoomEvent, DisconnectReason } from "livekit-client";
import api from "../services/api";
import { useLiveKitRoom } from "../composables/useLiveKitRoom";
import { useParticipants } from "../composables/useParticipants";
import { useScreenShare } from "../composables/useScreenShare";
import { useMeetingTimer } from "../composables/useMeetingTimer.js";
import { useMeetingTools } from "../composables/useMeetingTools.js";
import { useLocalRecording } from "../composables/useLocalRecording.js";
import { toast } from "../services/toast.js";
import { useMeetingStore } from "../stores/meeting";
import { roomModes } from "../config/roomModes";
import { meetingLayouts } from "../config/meetingLayouts";
import MeetingShell from "../components/meeting/MeetingShell.vue";

const route = useRoute();
const router = useRouter();
const roomId = String(route.params.roomId);
const meeting = useMeetingStore();
const live = useLiveKitRoom();
const participantState = useParticipants();
const { participants, sync } = participantState;
const screen = useScreenShare(participants, () => live.connection.value, sync);
const background=useCameraBackground(()=>live.connection.value);
const network=useConnectionHealth();
const tools = useMeetingTools(() => live.connection.value);
const recorder = useLocalRecording(() => live.connection.value);
const recording = recorder.recording,
  recordBusy = recorder.busy;
const view = ref({
  layout: "gallery",
  content: "activity",
  hideSelf: false,
  hideNoVideo: false,
  showTimer: true,
  background: "default",
  pinnedId: "",
});
const options = computed(() => ({
  view: view.value,
  devices: tools.devices.value,
  selectedDevices: tools.selectedDevices.value,
  deviceBusy: tools.deviceBusy.value,
  background:{mode:background.mode.value,busy:background.busy.value,supported:background.supported.value,imageName:background.imageName.value},
  network:{quality:network.quality.value,state:network.state.value,lowData:network.lowData.value,busy:network.busy.value,...network.metrics.value},
}));
const roomTimer = useMeetingTimer(roomId);
const elapsed = roomTimer.elapsed, reactions = ref([]);
const reactionTimers = new Set(),
  reactionTimes = new Map();
const allowedReactions = ["👏", "❤️", "😂", "🎉", "👍", "☕"];
let moving = false;
const info = ref(null);
const connected = ref(false);
const initializing = ref(true);
const error = ref("");
const micEnabled = ref(false);
const cameraEnabled = ref(false);
const messages = ref([]);
const isHost = ref(false);
const handBusy = ref(false);
const hostBusy = ref("");
const hostError = ref("");
const micBusy = ref(false);
const cameraBusy = ref(false);
let disposed = false;
let currentRoom = null;
let offDisconnected = null;
const livekitRoom = shallowRef(null);
const livekitToken = live.token;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const mode = computed(() => info.value?.mode || "professional");
const activeLayout = computed(
  () => meetingLayouts[mode.value] || meetingLayouts.professional,
);
const features = computed(
  () => roomModes[mode.value]?.features || roomModes.professional.features,
);
const sharing = screen.isSharing;
const shareBusy = screen.busy;
const handRaised = computed(() =>
  participants.value.some((p) => p.isLocal && p.handRaised),
);
const canShare = computed(() => sharing.value || !screen.sharer.value);
const deviceEvents = [
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
];

function refreshDevices() {
  if (!currentRoom) return;
  const local = currentRoom.localParticipant;
  micEnabled.value = local.isMicrophoneEnabled;
  cameraEnabled.value = local.isCameraEnabled;
  meeting.micEnabled = micEnabled.value;
  meeting.cameraEnabled = cameraEnabled.value;
  meeting.sharingScreen = Boolean(local.isScreenShareEnabled);
  sync();
}
function addMessage(raw, participant) {
  try {
    if (!participant || raw.byteLength > 8192) return;
    const message = JSON.parse(decoder.decode(raw));
    if (message.type === "reaction" && features.value.reactions) {
      showReaction(
        message.emoji,
        participant.identity,
        participant.name || "Guest",
      );
      return;
    }
    if (message.type !== "chat" || typeof message.text !== "string") return;
    messages.value.push({
      id: crypto.randomUUID(),
      sender: participant?.name || "Guest",
      text: message.text.slice(0, 1000),
    });
    if (messages.value.length > 200) messages.value.shift();
  } catch {
    /* ignore other LiveKit data payloads */
  }
}
function showReaction(emoji, identity, name) {
  if (
    !allowedReactions.includes(emoji) ||
    Date.now() - (reactionTimes.get(identity) || 0) < 1000
  )
    return;
  reactionTimes.set(identity, Date.now());
  const id = crypto.randomUUID();
  reactions.value = [...reactions.value.slice(-7), { id, emoji, name }];
  const timerId = setTimeout(() => {
    reactions.value = reactions.value.filter((r) => r.id !== id);
    reactionTimers.delete(timerId);
  }, 4500);
  reactionTimers.add(timerId);
}
async function sendReaction(emoji) {
  if (
    !currentRoom ||
    !features.value.reactions ||
    !allowedReactions.includes(emoji)
  )
    return;
  const local = currentRoom.localParticipant;
  if (Date.now() - (reactionTimes.get(local.identity) || 0) < 1000) return;
  try {
    await local.publishData(
      encoder.encode(JSON.stringify({ type: "reaction", emoji })),
      { reliable: true },
    );
    showReaction(emoji, local.identity, "Kamu");
  } catch (error) {
    toast.error(error);
  }
}
function updateView(patch) {
  view.value = { ...view.value, ...patch };
}
function pinParticipant(id) {
  updateView({ pinnedId: view.value.pinnedId === id ? "" : id });
}

async function moveRoom(destination) {
  if (moving || !destination?.roomId || destination.roomId === roomId) return;
  moving = true;
  try {
    if (destination.guestSecret)
      sessionStorage.setItem(
        `meetspace:approval:${destination.roomId}`,
        JSON.stringify(destination),
      );
    sessionStorage.setItem(
      `meetspace:join:${destination.roomId}`,
      JSON.stringify({
        participantName: currentRoom?.localParticipant.name || "Guest",
        micEnabled: micEnabled.value,
        cameraEnabled: cameraEnabled.value,
      }),
    );
    disposed = true;
    await cleanup();
    await router.push({
      name: "meeting",
      params: { roomId: destination.roomId },
    });
  } catch (error) {
    toast.error(error);
  } finally {
    moving = false;
  }
}
async function endMeeting() {
  if (!isHost.value || hostBusy.value) return;
  hostBusy.value = "end";
  try {
    await api.post(`/rooms/${encodeURIComponent(roomId)}/end`);
    disposed = true;
    await cleanup();
    await router.push("/account");
    toast.success("Room sudah diakhiri untuk semua peserta.");
  } catch (error) {
    toast.error(error);
  } finally {
    hostBusy.value = "";
  }
}
async function toggleRecording() {
  if (isHost.value) await recorder.toggle();
}
async function sendMessage(text) {
  if (!currentRoom || !features.value.chat) return;
  const clean = text.trim().slice(0, 1000);
  if (!clean) return;
  try {
    const payload = encoder.encode(
      JSON.stringify({ type: "chat", text: clean }),
    );
    await currentRoom.localParticipant.publishData(payload, { reliable: true });
    messages.value.push({
      id: crypto.randomUUID(),
      sender: "You",
      text: clean,
    });
    if (messages.value.length > 200) messages.value.shift();
  } catch (e) {
    error.value = e;
  }
}
async function start() {
  initializing.value = true;
  try {
    const saved = sessionStorage.getItem(`meetspace:join:${roomId}`);
    let prefs = {};
    try {
      prefs = saved ? JSON.parse(saved) || {} : {};
    } catch {
      /* ignore */
    }
    const name =
      typeof prefs.participantName === "string" && prefs.participantName.trim()
        ? prefs.participantName.trim()
        : "Guest";
    const result = await live.join(roomId, name);
    if (!result || disposed) return;
    currentRoom = result.livekitRoom;
    livekitRoom.value = currentRoom;
    info.value = result.room;
    roomTimer.startMeetingTimer(result.room?.startedAt, result.clock);
    isHost.value = result.isHost === true;
    meeting.setRoom(result.room);
    connected.value = true;
    meeting.connected = true;
    participantState.attach(currentRoom);
    network.attach(currentRoom);
    currentRoom.on(RoomEvent.LocalTrackPublished,background.sync);
    currentRoom.on(RoomEvent.DataReceived, addMessage);
    deviceEvents.forEach((event) => currentRoom.on(event, refreshDevices));
    offDisconnected = live.onDisconnect((reason) => {
      if (disposed) return;
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        sessionStorage.removeItem(`meetspace:approval:${roomId}`);
        error.value =
          "The host removed you from this room. Return to Lobby to request approval again.";
      } else if (reason === DisconnectReason.ROOM_DELETED) {
        error.value = "Host telah mengakhiri room ini.";
      } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        error.value =
          "This session was opened in another tab. Return to Lobby to reconnect.";
      } else {
        error.value = "Connection lost. Return to Lobby to join again.";
      }
      void cleanup();
    });
    try {
      await currentRoom.localParticipant.setCameraEnabled(
        prefs.cameraEnabled === true,
      );
    } catch (e) {
      error.value = e;
    }
    if (disposed || !currentRoom) return;
    try {
      await currentRoom.localParticipant.setMicrophoneEnabled(
        prefs.micEnabled === true,
      );
    } catch (e) {
      error.value = e;
    }
    if (disposed) return;
    refreshDevices();
  } catch (e) {
    if (!disposed) error.value = e;
  } finally {
    initializing.value = false;
  }
}
async function toggleMic() {
  if (!currentRoom || micBusy.value) return;
  micBusy.value = true;
  try {
    await currentRoom.localParticipant.setMicrophoneEnabled(!micEnabled.value);
    refreshDevices();
  } catch (e) {
    error.value = e;
  } finally {
    micBusy.value = false;
  }
}
async function toggleCamera() {
  if (!currentRoom || cameraBusy.value) return;
  cameraBusy.value = true;
  try {
    await currentRoom.localParticipant.setCameraEnabled(!cameraEnabled.value);
    refreshDevices();
  } catch (e) {
    error.value = e;
  } finally {
    cameraBusy.value = false;
  }
}
async function toggleShare() {
  if (!features.value.screenShare || !canShare.value) return;
  try {
    await screen.toggle();
    refreshDevices();
  } catch (e) {
    error.value = e;
  }
}
async function toggleHand() {
  if (!currentRoom || !features.value.raiseHand || handBusy.value) return;
  handBusy.value = true;
  try {
    await currentRoom.localParticipant.setAttributes({
      "meetspace.handRaised": handRaised.value ? "" : "true",
    });
    sync();
  } catch (e) {
    error.value = e;
  } finally {
    handBusy.value = false;
  }
}
async function moderate({ action, identity }) {
  if (
    !currentRoom ||
    !isHost.value ||
    mode.value !== "professional" ||
    hostBusy.value
  )
    return;
  hostBusy.value = identity || "all";
  hostError.value = "";
  try {
    const path = `/rooms/${encodeURIComponent(roomId)}`;
    if (action === "mute-all") await api.post(`${path}/mute-all`);
    else
      await api.post(
        `${path}/participants/${encodeURIComponent(identity)}/actions`,
        { action },
      );
  } catch (e) {
    hostError.value = e;
  } finally {
    hostBusy.value = "";
  }
}
async function enableAudio() {
  try {
    if (currentRoom) await currentRoom.startAudio();
  } catch (e) {
    error.value = e;
  }
}
async function leave() {
  disposed = true;
  await cleanup();
  await router.push({ name: "lobby", params: { roomId } });
}
async function cleanup() {
  roomTimer.stop();
  reactionTimers.forEach(clearTimeout);
  reactionTimers.clear();
  reactionTimes.clear();
  reactions.value = [];
  network.detach();
  await background.cleanup();
  await recorder.cleanup();
  participantState.detach();
  if (currentRoom) {
    currentRoom.off(RoomEvent.DataReceived, addMessage);
    currentRoom.off(RoomEvent.LocalTrackPublished,background.sync);
    deviceEvents.forEach((event) => currentRoom.off(event, refreshDevices));
  }
  offDisconnected?.();
  offDisconnected = null;
  currentRoom = null;
  connected.value = false;
  livekitRoom.value = null;
  livekitToken.value = "";
  meeting.reset();
  await live.leave();
}
onMounted(start);
onBeforeUnmount(() => {
  disposed = true;
  void cleanup();
});
useErrorToast(error, hostError);
</script>
<template>
  <RetroSplash v-if="initializing" label="Menghubungkanmu ke ruangan…" />
  <div v-else-if="!connected" class="ms-page-status">
    <div class="ms-status-card">
      <h1>Oops! Couldn't join.</h1>
      <p>Kembali ke lobby untuk memeriksa akses dan mencoba lagi.</p>
      <RouterLink :to="{ name: 'lobby', params: { roomId } }"
        >← Back to Lobby</RouterLink
      >
    </div>
  </div>
  <MeetingShell
    v-else
    :room="info"
    :livekit-room="livekitRoom"
    :participants="participants"
    :messages="messages"
    :features="features"
    :is-host="isHost"
    :host-busy="hostBusy"
    :host-error="hostError"
    :hand-raised="handRaised"
    :hand-busy="handBusy"
    :mic-enabled="micEnabled"
    :camera-enabled="cameraEnabled"
    :mic-busy="micBusy"
    :camera-busy="cameraBusy"
    :sharing="sharing"
    :share-busy="shareBusy"
    :can-share="canShare"
    :options="options"
    :elapsed="elapsed"
    :recording="recording"
    :record-busy="recordBusy"
    :reactions="reactions"
    @background="background.setMode"
    @background-image="background.addImage"
    @low-data="network.setLowData"
    @mic="toggleMic"
    @camera="toggleCamera"
    @share="toggleShare"
    @hand="toggleHand"
    @moderate="moderate"
    @audio="enableAudio"
    @send="sendMessage"
    @leave="leave"
    @reaction="sendReaction"
    @view="updateView"
    @device="({ kind, id }) => tools.switchDevice(kind, id)"
    @refresh-devices="tools.refreshDevices"
    @fullscreen="tools.fullscreen"
    @invite="copyRoomInvite(roomId)"
    @copy-room-id="copyRoomInvite(roomId, 'id', info?.meetingId)"
    @move="moveRoom"
    @record="toggleRecording"
    @end="endMeeting"
  >
    <ParticipantAudio
      v-for="participant in participants"
      :key="participant.id"
      :participant="participant"
    />
    <component
      :is="activeLayout"
      v-show="view.content!=='cameras'"
      :room="info"
      :livekit-room="livekitRoom"
      :host-identity="info?.hostIdentity || ''"
      :room-token="livekitToken"
      :refresh-room-token="live.refreshToken"
      :participants="participants"
      :view="view"
      @pin="pinParticipant"
      @view="updateView"
    />
    <component v-if="view.content==='cameras'" :is="meetingLayouts.professional" :room="info" :participants="participants" :view="view" @pin="pinParticipant" />
  </MeetingShell>
</template>
<style scoped>
.ms-page-status {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 20px;
  background: var(--bg-app);
  color: var(--text-primary);
}
.ms-status-card {
  max-width: 540px;
  padding: 35px;
  border: 3px solid #4f5b2a;
  border-radius: 19px;
  box-shadow: 7px 8px 0 #b8892d;
  background: var(--bg-surface);
  text-align: center;
}
.ms-status-card h1 {
  font-size: 25px;
}
.ms-status-card a {
  display: inline-block;
  padding: 10px 14px;
  background: #d8c9a8;
  border-radius: 11px;
  color: #303826;
  font-weight: 800;
}
.ms-inline-error {
  margin: 0 0 8px;
  color: var(--color-danger, #b64d4d);
  font-size: 13px;
}
</style>
