<script setup>
import { ref, watch } from "vue";
const props = defineProps({
    name: { type: String, default: "Guest" },
    videoTrack: { default: null },
    audioTrack: { default: null },
    isLocal: { type: Boolean, default: false },
    contain: { type: Boolean, default: false },
    handRaised: Boolean,
    isSpeaking: Boolean,
    micMuted: { type: Boolean, default: null },
    pinnable: Boolean,
    pinned: Boolean,
});
const emit = defineEmits(["pin"]);
const videoEl = ref(null),
    audioEl = ref(null);
watch(
    () => [props.videoTrack, videoEl.value],
    ([track, element], _, onCleanup) => {
        if (!track || !element) return;
        track.attach(element);
        onCleanup(() => track.detach(element));
    },
    { immediate: true, flush: "post" },
);
watch(
    () => [props.audioTrack, audioEl.value, props.isLocal],
    ([track, element, local], _, onCleanup) => {
        if (!track || !element || local) return;
        track.attach(element);
        onCleanup(() => track.detach(element));
    },
    { immediate: true, flush: "post" },
);
</script>
<template>
    <article class="ms-tile" :class="{ speaking: isSpeaking, pinned }">
        <video
            ref="videoEl"
            v-show="videoTrack"
            autoplay
            playsinline
            muted
            :class="{ mirror: isLocal, contain }"
        />
        <div v-if="!videoTrack" class="ms-avatar">
            {{ name?.charAt(0)?.toUpperCase() || "?" }}
        </div>
        <audio ref="audioEl" autoplay />
        <span
            v-if="handRaised"
            class="ms-raised-hand"
            role="status"
            :aria-label="`${name} raised their hand`"
            >✋</span
        >
        <button
            v-if="pinnable"
            class="ms-pin"
            :aria-pressed="pinned"
            :aria-label="`${pinned ? 'Lepas pin' : 'Pin'} ${name}`"
            @click="emit('pin')"
        >
            {{ pinned ? "◆" : "◇" }}
        </button>
        <div class="ms-tile-label">
            <span v-if="isSpeaking" class="speaking-bars" role="img" :aria-label="`${name} sedang berbicara`"><i></i><i></i><i></i></span>
            <span class="participant-name">{{ name }} <small v-if="isLocal">(You)</small></span>
            <span v-if="micMuted !== null" class="mic-indicator" :class="{ muted: micMuted }" role="img" :aria-label="micMuted ? 'Mikrofon mati' : 'Mikrofon hidup'" :title="micMuted ? 'Mikrofon mati' : 'Mikrofon hidup'">{{ micMuted ? '🔇' : '🎙' }}</span>
            <span v-if="isSpeaking" class="speaking-label">Bicara</span>
        </div>
    </article>
</template>
<style scoped>
.ms-tile {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    aspect-ratio: 16/10;
    background: #29332a;
    border: 2px solid #526441;
    border-radius: var(--mood-tile-radius, 12px);
    border-style: var(--mood-frame-style, solid);
    overflow: hidden;
}
video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
video.contain {
    object-fit: contain;
}
video.mirror {
    transform: scaleX(-1);
}
.ms-avatar {
    display: grid;
    place-items: center;
    width: clamp(35px, 24%, 68px);
    aspect-ratio: 1;
    border-radius: var(--mood-avatar-radius, 50%);
    background: #d8c9a8;
    color: #303826;
    font-size: clamp(16px, 3vw, 28px);
    font-weight: 900;
    border: 2px solid #4f5b2a;
}
.ms-tile-label {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 4px;
    bottom: 6px;
    left: 7px;
    max-width: calc(100% - 14px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 3px 7px;
    color: #fff;
    background: #121c18b8;
    border-radius: var(--mood-label-radius, 7px);
    font-size: 11px;
    font-weight: 700;
}
.ms-tile-label small {
    font-weight: 400;
}
.participant-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mic-indicator { display:inline-flex; align-items:center; flex:none; font-size:12px; line-height:1; }
.speaking-label { flex:none; }
.ms-raised-hand {
    position: absolute;
    right: 7px;
    top: 7px;
    font-size: 20px;
}
.ms-pin {
    position: absolute;
    left: 6px;
    top: 6px;
    border: 1px solid #4f5b2a;
    background: #f5efe3;
    color: #303826;
    border-radius: 7px;
    padding: 1px 6px;
    font-size: 16px;
    cursor: pointer;
}
.ms-tile.speaking {
    border-color: #59b292;
    box-shadow: inset 0 0 0 2px #59b292;
}
.ms-tile.pinned {
    border-color: #d5a532;
}
.ms-tile.speaking .ms-tile-label{background:#183e2f;color:#e5ffef}
.speaking-bars{display:inline-flex;align-items:center;gap:2px;height:12px;margin-right:4px;vertical-align:middle}
.speaking-bars i{width:3px;height:10px;background:#91e3b3;border-radius:2px;animation:speech-level .7s ease-in-out infinite alternate}
.speaking-bars i:nth-child(2){animation-delay:-.3s;height:6px}.speaking-bars i:nth-child(3){animation-delay:-.5s;height:8px}
@keyframes speech-level{to{transform:scaleY(.35)}}
@media(prefers-reduced-motion:reduce){.speaking-bars i{animation:none}}
</style>
