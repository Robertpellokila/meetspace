<script setup>
import { computed } from "vue";
import ScreenShareStage from "../meeting/ScreenShareStage.vue";
import Whiteboard from "../study/Whiteboard.vue";
import ParticipantGallery from "../meeting/ParticipantGallery.vue";

const props = defineProps({
    view: {
        type: Object,
        default: () => ({}),
    },

    participants: {
        type: Array,
        default: () => [],
    },

    room: {
        type: Object,
        default: null,
    },

    livekitRoom: {
        type: Object,
        default: null,
    },

    roomToken: {
        type: String,
        default: "",
    },

    refreshRoomToken: {
        type: Function,
        default: null,
    },
});

const emit = defineEmits(["pin", "view"]);

// Peserta yang sedang share screen
const sharer = computed(() => props.participants.find((p) => p.screenTrack));

const showScreen = computed(() => Boolean(sharer.value));

// Pilihan layout khusus Study Room
const validLayouts = [
    "standard",
    "side-speaker",
    "side-gallery",
    "side-dynamic",
    "focus",
];

const layout = computed(() => {
    const selected = props.view?.studyLayout || "standard";

    return validLayouts.includes(selected) ? selected : "standard";
});

// Kirim perubahan ke MeetingPage.vue
function changeLayout(event) {
    emit("view", {
        studyLayout: event.target.value,
    });
}

// Sesuaikan nama variant ParticipantGallery
const galleryVariant = computed(() => {
    switch (layout.value) {
        case "side-speaker":
            return "speaker";

        case "side-gallery":
            return "gallery";

        case "side-dynamic":
            return "dynamic";

        case "standard":
        default:
            return "filmstrip";
    }
});

// Status apakah panel video ditampilkan
const showParticipants = computed(() => layout.value !== "focus");

function pinParticipant(id) {
    emit("pin", id);
}
</script>

<template>
    <section class="ms-layout ms-study">
        <!-- HEADER -->
        <header class="study-heading">
            <div class="study-title">
                <strong>✎ STUDY ROOM</strong>
            </div>

            <label class="layout-picker">
                <span>View</span>

                <select
                    :value="layout"
                    aria-label="Pilih tampilan Study Room"
                    @change="changeLayout"
                >
                    <option value="standard">Standard · Filmstrip bawah</option>

                    <option value="side-speaker">Side-by-side · Speaker</option>

                    <option value="side-gallery">Side-by-side · Gallery</option>

                    <option value="side-dynamic">Side-by-side · Dynamic</option>

                    <option value="focus">Focus Whiteboard</option>
                </select>
            </label>
        </header>

        <!-- MAIN WORKSPACE -->
        <div class="study-workspace" :class="`layout-${layout}`">
            <!-- WHITEBOARD / SCREEN SHARE -->
            <main class="study-stage">
                <ScreenShareStage v-if="showScreen" :sharer="sharer" />

                <!-- Tetap mounted ketika screen sharing -->
                <Whiteboard
                    v-if="livekitRoom"
                    v-show="!showScreen"
                    class="study-whiteboard"
                    :room="livekitRoom"
                    :room-token="roomToken"
                    :room-id="room?.id"
                    :refresh-token="refreshRoomToken"
                />

                <p v-else-if="!showScreen" class="study-wait">
                    Connecting collaborative whiteboard...
                </p>
            </main>

            <!-- PARTICIPANTS -->
            <aside
                v-show="showParticipants"
                class="study-video"
                :class="`video-${galleryVariant}`"
                aria-label="Video peserta"
            >
                <ParticipantGallery
                    :participants="participants"
                    :view="view"
                    :variant="galleryVariant"
                    :pinned-id="view.pinnedId"
                    pinnable
                    @pin="pinParticipant"
                />
            </aside>
        </div>
    </section>
</template>

<style scoped>
/* ROOT */
.ms-study {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    gap: 8px;
}

/* HEADER */
.study-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: none;
    min-height: 34px;
    gap: 12px;
}

.study-title {
    display: flex;
    align-items: center;
    min-width: 0;
}

.study-title strong {
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
    color: var(--text-primary);
}

/* VIEW PICKER */
.layout-picker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
}

.layout-picker select {
    width: auto;
    max-width: 250px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-surface);
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}

.layout-picker select:focus-visible {
    outline: 2px solid var(--color-secondary, #4f5b2a);
    outline-offset: 2px;
}

/* MAIN WORKSPACE */
.study-workspace {
    display: grid;
    flex: 1;
    min-width: 0;
    min-height: 0;
    width: 100%;
    gap: 10px;
    overflow: hidden;
}

/* WHITEBOARD STAGE */
.study-stage {
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
}

.study-whiteboard {
    flex: 1;
    min-height: 0;
    min-width: 0;
}

.study-stage :deep(.ms-board) {
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
    min-width: 0;
}

.study-stage :deep(.ms-share-stage) {
    flex: 1;
    min-height: 0;
    min-width: 0;
}

/* VIDEO PANEL */
.study-video {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.study-video :deep(.ms-gallery) {
    width: 100%;
    height: 100%;
    min-height: 0;
    flex: 1;
}

/* STANDARD: WHITEBOARD + FILMSTRIP BELOW */
.layout-standard {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
        minmax(0, 1fr)
        clamp(95px, 18vh, 155px);
}

/* SIDE-BY-SIDE SPEAKER */
.layout-side-speaker {
    grid-template-columns:
        minmax(0, 1fr)
        clamp(240px, 33%, 420px);
    grid-template-rows: minmax(0, 1fr);
}

/* SIDE-BY-SIDE GALLERY */
.layout-side-gallery {
    grid-template-columns:
        minmax(0, 1fr)
        clamp(220px, 29%, 380px);
    grid-template-rows: minmax(0, 1fr);
}

/* SIDE-BY-SIDE DYNAMIC */
.layout-side-dynamic {
    grid-template-columns:
        minmax(0, 1fr)
        clamp(240px, 32%, 420px);
    grid-template-rows: minmax(0, 1fr);
}

/* FOCUS WHITEBOARD */
.layout-focus {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
}

.layout-focus .study-video {
    display: none;
}

/* LOADING */
.study-wait {
    margin: auto;
    color: var(--text-secondary);
    font-size: 13px;
}

/* TABLET */
@media (max-width: 900px) {
    .layout-side-speaker,
    .layout-side-gallery,
    .layout-side-dynamic {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows:
            minmax(0, 1fr)
            clamp(105px, 20vh, 150px);
    }

    .study-heading {
        gap: 8px;
    }

    .layout-picker select {
        max-width: 215px;
    }
}

/* MOBILE */
@media (max-width: 600px) {
    .ms-study {
        gap: 5px;
    }

    .study-heading {
        min-height: 32px;
    }

    .study-title strong {
        font-size: 11px;
    }

    .layout-picker {
        gap: 4px;
        font-size: 11px;
    }

    .layout-picker select {
        max-width: 175px;
        padding: 6px;
        font-size: 11px;
    }

    .study-workspace {
        gap: 6px;
    }

    .layout-standard,
    .layout-side-speaker,
    .layout-side-gallery,
    .layout-side-dynamic {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows:
            minmax(0, 1fr)
            105px;
    }
}

/* SHORT SCREENS */
@media (max-height: 550px) {
    .study-heading {
        min-height: 28px;
    }

    .layout-standard,
    .layout-side-speaker,
    .layout-side-gallery,
    .layout-side-dynamic {
        grid-template-rows:
            minmax(0, 1fr)
            85px;
    }
}
</style>
