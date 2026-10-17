<script setup>
import { copyRoomInvite } from "../services/roomInvite.js";
import AccountControls from "../components/common/AccountControls.vue";
import { toast } from "../services/toast.js";
import { useErrorToast } from "../composables/useErrorToast.js";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAppearanceStore } from "../stores/appearance";
import { roomModes } from "../config/roomModes";
import { themes } from "../config/themes";
import api from "../services/api";
import { currentUser } from "../services/auth";
import GuestWaitingRoom from "../components/meeting/GuestWaitingRoom.vue";
import HostApprovalsPanel from "../components/meeting/HostApprovalsPanel.vue";

const route = useRoute();
const router = useRouter();
const appearance = useAppearanceStore();
const { isDark } = storeToRefs(appearance);

const room = ref(null);

const meetingCode = computed(() => {
  return String(room.value?.meetingId || "");
});

const formattedMeetingCode = computed(() => {
  return meetingCode.value.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
});

async function copyMeetingId() {
  await copyRoomInvite(room.value?.id, 'id', meetingCode.value);
}

const loading = ref(true);
const error = ref("");
const hostAccessBlocked = computed(() =>
  error.value?.response?.data?.code === 'EMAIL_NOT_VERIFIED',
);
const displayName = ref("");
const isHost = ref(false);
const cameraEnabled = ref(false);
const micEnabled = ref(false);
const cameraLoading = ref(false);
const micLoading = ref(false);
const mediaError = ref("");
const micLevel = ref(0);
let audioContext = null;
let meterTimer = null;

const videoEl = ref(null);
let cameraStream = null;
let micStream = null;
let disposed = false;

const roomMode = computed(
  () => roomModes[room.value?.mode]?.name ?? room.value?.mode ?? "Unknown mode",
);
const roomTheme = computed(
  () => themes[room.value?.theme]?.name ?? room.value?.theme ?? "Unknown theme",
);
const isWatchParty = computed(() => room.value?.mode === "watchParty");
const roomFeatures = computed(() => {
  const entries = Object.entries(roomModes[room.value?.mode]?.features ?? {});
  return entries
    .filter(([, enabled]) => enabled)
    .map(([key]) =>
      key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
    );
});

async function fetchRoom(id) {
  loading.value = true;
  error.value = "";
  room.value = null;
  try {
    const path = `/rooms/${encodeURIComponent(String(id))}`;
    const [response, role] = await Promise.all([
      api.get(path),
      api.get(`${path}/my-role`),
    ]);
    if (disposed) return;
    room.value = response.data.data;
    // Co-hosts still enter through their approved guest identity.
    isHost.value = role.data.data.isOwner === true;
    let saved = {};
    try {
      saved =
        JSON.parse(
          sessionStorage.getItem(`meetspace:join:${id}`) ||
            sessionStorage.getItem(`meetspace:approval:${id}`) ||
            "{}",
        ) || {};
    } catch {
      /* ignore */
    }
    displayName.value =
      typeof saved.participantName === "string"
        ? saved.participantName
        : currentUser.value?.displayName || (isHost.value ? "Host" : "");
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.roomId,
  (id) => {
    if (id) fetchRoom(id);
    else {
      room.value = null;
      error.value = "Room ID is missing.";
      loading.value = false;
    }
  },
  { immediate: true },
);

async function enableCamera() {
  mediaError.value = "";
  if (cameraEnabled.value) {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    if (videoEl.value) videoEl.value.srcObject = null;
    cameraEnabled.value = false;
    return;
  }
  cameraLoading.value = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Camera access requires localhost or HTTPS.");
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    if (disposed) {
      stopPreview();
      return;
    }
    cameraEnabled.value = true;
    if (videoEl.value) {
      videoEl.value.srcObject = cameraStream;
      await videoEl.value.play().catch(() => {});
    }
  } catch (err) {
    mediaError.value = err;
  } finally {
    cameraLoading.value = false;
  }
}

async function enableMicrophone() {
  mediaError.value = "";
  if (micEnabled.value) {
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    micEnabled.value = false;
    stopMeter();
    return;
  }
  micLoading.value = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Microphone access requires localhost or HTTPS.");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    if (disposed) {
      stopPreview();
      return;
    }
    micEnabled.value = true;
    startMeter();
  } catch (err) {
    mediaError.value = err;
  } finally {
    micLoading.value = false;
  }
}

function stopMeter() {
  clearInterval(meterTimer); meterTimer = null; micLevel.value = 0;
  if (audioContext) { void audioContext.close(); audioContext = null; }
}
function startMeter() {
  stopMeter();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !micStream) return;
  audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(micStream);
  const analyser = audioContext.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);
  meterTimer = setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
    micLevel.value = Math.min(100, Math.round(rms * 330));
  }, 100);
}
async function testSpeaker() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return toast.error('Browser belum mendukung tes speaker.');
  try {
    const context = new AudioContextClass();
    await context.resume();
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 523.25; gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    oscillator.onended = () => { void context.close() };
  } catch (error) { toast.error(error) }
}

function stopPreview() {
  stopMeter();
  // Stop camera
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  // Stop microphone
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  // Reset video element
  if (videoEl.value) {
    videoEl.value.srcObject = null;
  }

  cameraEnabled.value = false;
  micEnabled.value = false;
}

const joining = ref(false);

async function joinMeeting(approval) {
  if (!room.value || joining.value) return;

  const name = (approval?.participantName || displayName.value).trim();

  if (!name || name.length > 50) {
    mediaError.value = "Please enter your name (1–50 characters)";
    return;
  }

  const roomId = room.value.id;

  joining.value = true;
  mediaError.value = "";

  try {
    // Simpan pilihan perangkat sebelum stream dihentikan
    const joinPreferences = {
      participantName: name,
      cameraEnabled: cameraEnabled.value,
      micEnabled: micEnabled.value,
    };

    sessionStorage.setItem(
      `meetspace:join:${roomId}`,
      JSON.stringify(joinPreferences),
    );

    // Release perangkat dari Lobby
    stopPreview();

    // Buka Meeting Page
    await router.push({
      name: "meeting",
      params: { roomId },
    });
  } catch (err) {
    mediaError.value = err;
  } finally {
    joining.value = false;
  }
}

function goBack() {
  router.push({ name: "create-room" });
}

onBeforeUnmount(() => {
  disposed = true;
  stopPreview();
});
useErrorToast(error, mediaError);
</script>

<template>
  <div class="lobby-page">
    <div class="record-disc disc-one" aria-hidden="true"></div>
    <div class="record-disc disc-two" aria-hidden="true"></div>

    <header class="topbar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">✦</span> MeetSpace</RouterLink
      >
      <div class="topbar-actions">
        <AccountControls />
        <span class="club-label">THE RETRO CLUB</span>
        <button
          class="retro-button theme-switch"
          type="button"
          @click="appearance.toggleTheme()"
        >
          {{ isDark ? "☀ Light mode" : "☾ Dark mode" }}
        </button>
      </div>
    </header>

    <main class="main-content">
      <button class="back-link" type="button" @click="goBack">
        ← Back to spaces
      </button>
      <div class="hero-heading">
        <span class="eyebrow">THE PRE-SHOW CHECK</span>
        <h1>You're almost <em>in!</em></h1>
        <p>Check your setup, settle in, and get ready for a good time.</p>
      </div>

      <section v-if="loading" class="status-card retro-card" role="status">
        <span class="status-icon">⌛</span>
        <h2>Finding your space…</h2>
        <p>Hang tight while we load the room details.</p>
      </section>
      <section v-else-if="error" class="status-card retro-card" role="alert">
        <span class="status-icon">!</span>
        <h2>{{ hostAccessBlocked ? 'Akses host perlu dilengkapi' : 'Oops, no room here!' }}</h2>
        <p>{{ hostAccessBlocked ? error.response.data.message : 'Periksa kembali undanganmu atau coba memuat room lagi.' }}</p>
        <RouterLink v-if="hostAccessBlocked" class="retro-button action" to="/account">Buka Akun →</RouterLink>
        <button v-else class="retro-button action" type="button" @click="goBack">
          Create a new space →
        </button>
      </section>

      <div v-else-if="room" class="workspace">
        <section class="setup-panel retro-card">
          <div class="panel-heading">
            <span class="step-bubble">01</span>
            <div>
              <h2>Make yourself comfy</h2>
              <p>Get your camera and mic ready.</p>
            </div>
          </div>

          <div
            class="camera-frame"
            :class="{ romantic: room.theme === 'romantic' }"
          >
            <div class="camera-top">
              <span class="recording-dot"></span> YOUR CAMERA
              <span>PREVIEW</span>
            </div>
            <div class="camera-stage">
              <video
                ref="videoEl"
                v-show="cameraEnabled"
                autoplay
                playsinline
                muted
              ></video>
              <div v-if="!cameraEnabled" class="camera-placeholder">
                <div class="placeholder-symbol">
                  {{ isWatchParty ? "♥" : "✦" }}
                </div>
                <strong>Your camera is off</strong>
                <span>Click Camera to preview yourself</span>
              </div>
            </div>
            <div class="camera-footer">
              <span>{{ cameraEnabled ? "● CAMERA ON" : "○ CAMERA OFF" }}</span
              ><span>{{ micEnabled ? "● MIC ON" : "○ MIC OFF" }}</span>
            </div>
          </div>

          <div class="device-controls">
            <button
              type="button"
              class="retro-button device-button"
              :aria-pressed="micEnabled"
              :disabled="micLoading"
              @click="enableMicrophone"
            >
              <span class="device-icon">{{ micEnabled ? "🎙" : "♩" }}</span>
              {{
                micLoading ? "Loading…" : micEnabled ? "Mic On" : "Turn Mic On"
              }}
            </button>
            <button
              type="button"
              class="retro-button device-button"
              :aria-pressed="cameraEnabled"
              :disabled="cameraLoading"
              @click="enableCamera"
            >
              <span class="device-icon">▣</span>
              {{
                cameraLoading
                  ? "Loading…"
                  : cameraEnabled
                    ? "Camera On"
                    : "Turn Camera On"
              }}
            </button>
          </div>
          <div class="device-preflight"><button type="button" class="retro-button device-button" @click="testSpeaker">♫ Test speaker</button><div class="mic-meter"><span>Level mikrofon</span><div role="meter" :aria-valuenow="micLevel" aria-valuemin="0" aria-valuemax="100" aria-label="Level mikrofon"><i :style="{width:micLevel+'%'}" /></div><small>{{micEnabled?'Bicara untuk memeriksa mikrofon.':'Aktifkan mikrofon untuk melihat level.'}}</small></div></div>

          <div class="rule"></div>
          <label class="field-label" for="guest-name"
            >WHAT SHOULD WE CALL YOU?</label
          >
          <input
            id="guest-name"
            v-model="displayName"
            maxlength="50"
            class="retro-input"
            placeholder="Your awesome name"
            autocomplete="name"
          />
          <p class="field-note">
            Your name will be used when joining this room.
          </p>

          <button
            v-if="isHost"
            class="retro-button join-button"
            type="button"
            :disabled="
              joining ||
              loading ||
              cameraLoading ||
              micLoading ||
              !displayName.trim()
            "
            @click="joinMeeting"
          >
            <span>
              {{ joining ? "Joining your space..." : "Join the Space" }}
            </span>

            <span v-if="!joining">→</span>
          </button>

          <GuestWaitingRoom
            v-else
            :room-id="room.id"
            :participant-name="displayName"
            :password-protected="room.passwordProtected"
            :disabled="
              joining || cameraLoading || micLoading || !displayName.trim()
            "
            @approved="joinMeeting"
          />
          <p class="join-note">
            {{
              isHost
                ? "You are the host. Manage waiting guests here or inside the room."
                : "The host will admit you before you connect."
            }}
          </p>
          <HostApprovalsPanel v-if="isHost" :room-id="room.id" />
        </section>

        <aside class="details-panel retro-card">
          <div class="panel-heading">
            <span class="step-bubble gold">02</span>
            <div>
              <h2>Tonight's lineup</h2>
              <p>Here's what you're joining.</p>
            </div>
          </div>
          <div
            class="room-poster"
            :class="{ romantic: room.theme === 'romantic' }"
          >
            <span class="poster-stamp">{{
              isWatchParty ? "MOVIE CLUB" : "MEETING CLUB"
            }}</span>
            <div class="poster-illustration">
              {{ isWatchParty ? "▶" : "▦" }}
            </div>
            <span class="poster-kicker">YOU'RE INVITED TO</span>
            <h3>{{ room.name }}</h3>
            <span class="poster-tag">{{ roomMode }}</span>
          </div>
          <div class="room-facts">
            <div>
              <span>ROOM MODE</span><strong>{{ roomMode }}</strong>
            </div>
            <div>
              <span>ROOM MOOD</span><strong>{{ roomTheme }}</strong>
            </div>
            <div>
              <span>MEETING ID</span>

              <strong v-if="meetingCode">
                {{ formattedMeetingCode }}
              </strong>

              <code v-else>Belum tersedia</code>
            </div>
          </div>
          <div class="rule"></div>
          <h3 class="subheading">The good stuff</h3>
          <div class="feature-list">
            <span
              v-for="feature in roomFeatures"
              :key="feature"
              class="feature-pill"
              >✓ {{ feature }}</span
            >
          </div>
          <button
            class="retro-button invite-button"
            type="button"
            @click="copyRoomInvite(room.id)"
          >
            ↗ Copy invite link
          </button>

          <button
            class="retro-button invite-button"
            type="button"
            :disabled="!/^\d{10}$/.test(meetingCode)"
            @click="copyMeetingId"
          >
            ▣ Copy Meeting ID
          </button>
          <p v-if="room.passwordProtected" class="join-note">
            🔒 Room dilindungi password. Bagikan password secara terpisah.
          </p>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>.device-preflight{display:flex;gap:12px;align-items:center;margin-top:12px}.mic-meter{display:grid;gap:4px;flex:1;min-width:120px;font-size:11px;font-weight:800}.mic-meter>div{height:12px;border:2px solid var(--retro-line);border-radius:9px;background:var(--retro-card);overflow:hidden}.mic-meter i{display:block;height:100%;background:var(--retro-gold);transition:width .1s}.mic-meter small{font-weight:500;color:var(--text-secondary)}@media(max-width:600px){.device-preflight{align-items:stretch;flex-direction:column}}</style>

<style scoped>
.lobby-page {
  --retro-ink: var(--text-primary, #303826);
  --retro-line: var(--border-color, #4f5b2a);
  --retro-paper: var(--bg-app, #f5efe3);
  --retro-card: var(--bg-surface, #fffcf7);
  --retro-subtle: var(--bg-elevated, #eee6d7);
  --retro-olive: var(--color-secondary, #4f5b2a);
  --retro-gold: var(--color-gold, #b8892d);
  --retro-sand: var(--color-sand, #d8c9a8);
  --retro-cream: var(--color-primary, #f5efe3);
  --retro-shadow: var(--shadow-color, var(--retro-line));
  min-height: 100vh;
  isolation: isolate;
  overflow: clip;
  position: relative;
  background: var(--retro-paper);
  background-image: radial-gradient(
    color-mix(in srgb, var(--retro-ink) 14%, transparent) 1px,
    transparent 1px
  );
  background-size: 22px 22px;
  color: var(--retro-ink);
  font-family: var(--font-body, Inter, system-ui, sans-serif);
}
.lobby-page * {
  box-sizing: border-box;
}
.lobby-page button,
.lobby-page input {
  font: inherit;
}
button {
  cursor: pointer;
}
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 3px dashed var(--retro-gold);
  outline-offset: 4px;
}
.record-disc {
  position: absolute;
  z-index: -1;
  width: 360px;
  height: 360px;
  border: 22px solid var(--retro-ink);
  border-radius: 50%;
  opacity: 0.07;
  pointer-events: none;
}
.record-disc::after {
  content: "";
  position: absolute;
  inset: 50px;
  border: 13px solid currentColor;
  border-radius: 50%;
}
.disc-one {
  top: 160px;
  left: -270px;
}
.disc-two {
  bottom: -210px;
  right: -190px;
}
.topbar {
  max-width: 1240px;
  margin: auto;
  padding: 24px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.brand {
  display: inline-flex;
  gap: 11px;
  align-items: center;
  font-size: clamp(21px, 3vw, 27px);
  font-weight: 1000;
  color: var(--retro-ink);
  text-decoration: none;
  letter-spacing: -1px;
  text-shadow: 2px 2px 0 var(--retro-sand);
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border: 3px solid var(--retro-line);
  border-radius: 50%;
  background: var(--retro-gold);
  color: var(--retro-cream);
  box-shadow: 3px 3px 0 var(--retro-shadow);
  transform: rotate(-12deg);
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}
.club-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--text-secondary);
}
.retro-button {
  border: 2px solid var(--retro-line);
  border-radius: 13px;
  background: var(--retro-card);
  color: var(--retro-ink);
  font-weight: 850;
  box-shadow: 3px 4px 0 var(--retro-shadow);
  transition:
    transform 0.16s,
    box-shadow 0.16s,
    background 0.16s;
}
.retro-button:hover:not(:disabled) {
  transform: translateY(-2px);
}
.retro-button:active:not(:disabled) {
  transform: translate(3px, 4px);
  box-shadow: none;
}
.retro-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.theme-switch {
  padding: 11px 15px;
  border-radius: 30px;
  font-size: 12px;
}
.theme-switch:hover {
  background: var(--retro-sand);
}
.main-content {
  max-width: 1240px;
  padding: 35px 32px 100px;
  margin: auto;
}
.back-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--retro-olive);
  font-size: 13px;
  font-weight: 850;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.hero-heading {
  margin: 30px 0 35px;
  padding-left: 20px;
  border-left: 8px solid var(--retro-gold);
}
.eyebrow {
  display: inline-block;
  background: var(--retro-sand);
  color: #303826;
  padding: 7px 12px;
  border: 2px solid var(--retro-line);
  border-radius: 50px;
  font-size: 10px;
  letter-spacing: 1.4px;
  font-weight: 900;
}
.hero-heading h1 {
  margin: 17px 0 10px;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(39px, 6vw, 68px);
  font-weight: 1000;
  line-height: 1.07;
  letter-spacing: -2px;
}
.hero-heading h1 em {
  color: var(--retro-olive);
  font-style: normal;
  text-decoration: underline;
  text-decoration-color: var(--retro-gold);
  text-decoration-thickness: 6px;
  text-underline-offset: 8px;
}
.hero-heading p {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  align-items: start;
  gap: 28px;
}
.retro-card {
  background: var(--retro-card);
  border: 3px solid var(--retro-line);
  border-radius: 23px;
  padding: 28px;
  box-shadow: 8px 9px 0 var(--retro-shadow);
  min-width: 0;
}
.panel-heading {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  margin-bottom: 24px;
}
.panel-heading h2 {
  font-family: var(--font-display, Georgia, serif);
  margin: 0 0 6px;
  font-size: 21px;
}
.panel-heading p {
  color: var(--text-secondary);
  margin: 0;
  font-size: 12px;
}
.step-bubble {
  display: grid;
  flex: 0 0 43px;
  width: 43px;
  height: 43px;
  place-items: center;
  background: var(--retro-sand);
  border: 2px solid var(--retro-line);
  border-radius: 50%;
  font-weight: 1000;
  box-shadow: 2px 3px 0 var(--retro-shadow);
}
.step-bubble.gold {
  background: var(--retro-gold);
  color: #fff;
}
.camera-frame {
  border: 3px solid var(--retro-line);
  border-radius: 20px;
  overflow: hidden;
  background: var(--retro-subtle);
  box-shadow: 4px 5px 0 var(--retro-shadow);
}
.camera-top,
.camera-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  background: var(--retro-sand);
  color: #303826;
}
.camera-top {
  border-bottom: 3px solid var(--retro-line);
}
.camera-footer {
  border-top: 3px solid var(--retro-line);
  flex-wrap: wrap;
}
.recording-dot {
  width: 9px;
  height: 9px;
  border: 2px solid #303826;
  border-radius: 50%;
  background: var(--retro-gold);
}
.camera-stage {
  position: relative;
  min-height: 245px;
  aspect-ratio: 16/9;
  background: var(--retro-subtle);
  display: grid;
  place-items: center;
}
.camera-stage video {
  display: block;
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  object-fit: cover;
  transform: scaleX(-1);
}
.camera-placeholder {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 30px;
  color: var(--retro-ink);
}
.placeholder-symbol {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border: 3px solid var(--retro-line);
  border-radius: 50%;
  font-size: 42px;
  background: var(--retro-gold);
  color: #fff;
  box-shadow: 4px 4px 0 var(--retro-shadow);
}
.camera-placeholder strong {
  font-size: 18px;
}
.camera-placeholder span {
  font-size: 12px;
  color: var(--text-secondary);
}
.device-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
  margin: 22px 0;
}
.device-button {
  padding: 14px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  font-size: 13px;
}
.device-button[aria-pressed="true"] {
  background: var(--retro-sand);
  color: #303826;
}
.device-icon {
  font-size: 17px;
}
.rule {
  border-top: 3px dashed var(--retro-line);
  opacity: 0.6;
  margin: 25px 0;
}
.field-label {
  display: block;
  font-weight: 950;
  font-size: 11px;
  letter-spacing: 1.5px;
  margin-bottom: 10px;
}
.retro-input {
  width: 100%;
  padding: 16px;
  background: var(--retro-card);
  color: var(--retro-ink);
  border: 2px solid var(--retro-line);
  border-radius: 12px;
  box-shadow: 3px 3px 0 var(--retro-shadow);
  outline: none;
}
.retro-input::placeholder {
  color: var(--text-secondary);
}
.field-note,
.join-note {
  margin: 12px 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.join-button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 17px 20px;
  margin-top: 28px;
  background: var(--retro-olive);
  color: var(--retro-cream);
  font-size: 15px;
}
.media-error {
  color: var(--color-danger, #b64d4d);
  font-size: 12px;
}
.details-panel {
  position: relative;
}
.room-poster {
  min-height: 325px;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: 35px 22px;
  background: var(--retro-sand);
  border: 3px solid var(--retro-line);
  border-radius: 19px;
  box-shadow: 4px 5px 0 var(--retro-shadow);
  color: #303826;
}
.room-poster::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-radial-gradient(
    circle at 50% 45%,
    transparent 0 23px,
    color-mix(in srgb, var(--retro-gold) 25%, transparent) 24px 30px,
    transparent 31px 48px
  );
  pointer-events: none;
}
.room-poster.romantic {
  background: color-mix(in srgb, var(--retro-sand) 65%, var(--retro-cream));
}
.poster-stamp {
  position: relative;
  align-self: flex-start;
  transform: rotate(-6deg);
  padding: 8px 12px;
  border: 2px solid #303826;
  border-radius: 20px;
  background: var(--retro-gold);
  color: #fff;
  font-size: 10px;
  letter-spacing: 1.4px;
  font-weight: 1000;
}
.poster-illustration {
  position: relative;
  margin: 10px 0;
  font-size: 66px;
  line-height: 1;
}
.poster-kicker {
  position: relative;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 1.7px;
}
.room-poster h3 {
  position: relative;
  margin: 12px 0;
  font-size: clamp(25px, 3vw, 36px);
  font-family: var(--font-display, Georgia, serif);
  overflow-wrap: anywhere;
}
.poster-tag {
  position: relative;
  display: inline-block;
  background: var(--retro-cream);
  border: 2px solid #303826;
  border-radius: 50px;
  padding: 7px 14px;
  font-weight: 850;
  font-size: 12px;
}
.room-facts {
  display: grid;
  gap: 14px;
  margin: 25px 0;
}
.room-facts > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.room-facts span {
  color: var(--text-secondary);
  font-size: 10px;
  letter-spacing: 1px;
  font-weight: 900;
}
.room-facts strong {
  font-size: 13px;
  text-align: right;
}
.room-facts code {
  font-size: 11px;
  word-break: break-all;
  max-width: 65%;
  color: var(--retro-ink);
}
.subheading {
  margin: 0 0 16px;
  font-size: 15px;
}
.feature-list {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.feature-pill {
  padding: 9px 12px;
  border-radius: 25px;
  border: 2px solid var(--retro-line);
  background: var(--retro-subtle);
  font-weight: 750;
  font-size: 12px;
}
.invite-button {
  width: 100%;
  margin-top: 30px;
  padding: 14px 16px;
  background: var(--retro-sand);
  color: #303826;
}
.copy-message {
  color: var(--text-secondary);
  font-size: 12px;
}
.status-card {
  max-width: 600px;
  text-align: center;
  margin: 65px auto;
}
.status-icon {
  display: inline-grid;
  place-items: center;
  width: 73px;
  height: 73px;
  border: 3px solid var(--retro-line);
  background: var(--retro-gold);
  color: white;
  border-radius: 50%;
  font-size: 40px;
}
.status-card h2 {
  font-family: var(--font-display, Georgia, serif);
  font-size: 29px;
}
.status-card p {
  color: var(--text-secondary);
}
.status-card .action {
  padding: 14px 20px;
  background: var(--retro-olive);
  color: var(--retro-cream);
  margin-top: 15px;
}
@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .main-content {
    padding: 30px 20px 70px;
  }
  .topbar {
    padding: 20px;
  }
}
@media (max-width: 520px) {
  .retro-card {
    padding: 19px;
    box-shadow: 5px 6px 0 var(--retro-shadow);
  }
  .topbar-actions .club-label {
    display: none;
  }
  .hero-heading h1 {
    letter-spacing: -1px;
  }
  .device-controls {
    grid-template-columns: 1fr 1fr;
  }
  .camera-stage {
    min-height: 200px;
  }
  .room-facts > div {
    align-items: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lobby-page * {
    transition: none !important;
  }
}
</style>
