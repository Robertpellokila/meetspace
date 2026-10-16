<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import ParticipantTile from "./ParticipantTile.vue";
const props = defineProps({
    participants: { type: Array, default: () => [] },
    compact: Boolean,
    variant: { type: String, default: "" },
    emptyLabel: { type: String, default: "Menunggu peserta bergabung…" },
    pinnable: Boolean,
    pinnedId: String,
    view: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["pin"]);
const root = ref(null),
    width = ref(800),
    height = ref(400),
    page = ref(0);
let observer;
const mode = computed(
    () =>
        props.variant ||
        (props.compact ? "filmstrip" : props.view.layout || "gallery"),
);
const ordered = computed(() => {
    let people = props.participants.filter(
        (p) =>
            (!props.view.hideSelf || !p.isLocal) &&
            (!props.view.hideNoVideo || p.videoTrack),
    );
    const pinned = props.pinnedId || props.view.pinnedId;
    people = [...people].sort(
        (a, b) =>
            Number(b.id === pinned) - Number(a.id === pinned) ||
            (['speaker','dynamic','multi'].includes(mode.value) ? Number(b.isSpeaking) - Number(a.isSpeaking) : 0) ||
            Number(b.handRaised) - Number(a.handRaised),
    );
    return people;
});
const speaker = computed(() => ordered.value[0] || null);
const otherSpeakers = computed(() => ordered.value.slice(1));
const speakerMode = computed(() => mode.value === "speaker");
const filmstripMode = computed(() => mode.value === "filmstrip");
const capacity = computed(() => {
    if (mode.value === 'multi') return 4;
    if (filmstripMode.value)
        return Math.max(1, Math.min(8, Math.floor(width.value / 145)));
    const cols = Math.max(1, Math.floor(width.value / 135));
    const rows = Math.max(1, Math.floor(height.value / 115));
    return Math.max(1, Math.min(12, cols * rows));
});
const pages = computed(() =>
    Math.max(1, Math.ceil(ordered.value.length / capacity.value)),
);
const visible = computed(() =>
    ordered.value.slice(
        page.value * capacity.value,
        (page.value + 1) * capacity.value,
    ),
);
const columns = computed(() =>
    filmstripMode.value
        ? Math.max(1, visible.value.length)
        : Math.max(
              1,
              Math.min(
                  visible.value.length,
                  Math.ceil(
                      Math.sqrt(
                          (visible.value.length * width.value) /
                              Math.max(100, height.value),
                      ),
                  ),
              ),
          ),
);
watch([pages, mode, () => props.pinnedId, () => props.view.pinnedId], () => {
    page.value = Math.min(page.value, pages.value - 1);
});
watch([mode, () => props.pinnedId, () => props.view.pinnedId], () => {
    page.value = 0;
});
onMounted(() => {
    if (typeof ResizeObserver !== "undefined" && root.value) {
        observer = new ResizeObserver((entries) => {
            width.value = entries[0].contentRect.width;
            height.value = entries[0].contentRect.height;
        });
        observer.observe(root.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
    <section
        ref="root"
        class="ms-gallery"
        :style="compact ? {flex:'0 0 clamp(85px,18dvh,145px)',maxHeight:'35%'} : {}"
        :class="{
            filmstrip: filmstripMode,
            speaker: speakerMode,
            immersive: view.layout === 'immersive',
        }"
        aria-label="Kamera peserta"
    >
        <template v-if="speakerMode">
            <div class="speaker-main">
                <ParticipantTile
                    v-if="speaker"
                    :key="speaker.id"
                    :name="speaker.name"
                    :is-local="speaker.isLocal"
                    :video-track="speaker.videoTrack"
                    :hand-raised="speaker.handRaised"
                    :is-speaking="speaker.isSpeaking"
                    :pinnable="pinnable"
                    :pinned="(pinnedId || view.pinnedId) === speaker.id"
                    @pin="emit('pin', speaker.id)"
                />
                <div v-else class="ms-empty">{{ emptyLabel }}</div>
            </div>
            <div v-if="otherSpeakers.length" class="speaker-strip">
                <ParticipantTile
                    v-for="p in otherSpeakers"
                    :key="p.id"
                    :name="p.name"
                    :is-local="p.isLocal"
                    :video-track="p.videoTrack"
                    :hand-raised="p.handRaised"
                    :is-speaking="p.isSpeaking"
                    :pinnable="pinnable"
                    :pinned="(pinnedId || view.pinnedId) === p.id"
                    @pin="emit('pin', p.id)"
                />
            </div>
        </template>
        <template v-else>
            <div
                class="gallery-grid"
                :style="{
                    gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                    gridTemplateRows: `repeat(${Math.max(1, Math.ceil(visible.length / columns))},minmax(0,1fr))`,
                }"
            >
                <ParticipantTile
                    v-for="p in visible"
                    :key="p.id"
                    :name="p.name"
                    :is-local="p.isLocal"
                    :video-track="p.videoTrack"
                    :hand-raised="p.handRaised"
                    :is-speaking="p.isSpeaking"
                    :pinnable="pinnable"
                    :pinned="(pinnedId || view.pinnedId) === p.id"
                    @pin="emit('pin', p.id)"
                />
                <div v-if="!visible.length" class="ms-empty">
                    {{ emptyLabel }}
                </div>
            </div>
            <nav v-if="pages > 1" class="gallery-pages">
                <button :disabled="page === 0" @click="page--">←</button
                ><span>{{ page + 1 }} / {{ pages }}</span
                ><button :disabled="page >= pages - 1" @click="page++">
                    →
                </button>
            </nav>
        </template>
    </section>
</template>
<style scoped>
.ms-gallery {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    gap: 6px;
}
.gallery-grid {
    display: grid;
    flex: 1;
    min-height: 0;
    min-width: 0;
    gap: 6px;
}
.gallery-grid :deep(.ms-tile) {
    height: 100%;
    max-height: 100%;
    aspect-ratio: unset;
}
.ms-gallery.filmstrip .gallery-grid {
    grid-auto-flow: column;
}
.ms-gallery.filmstrip :deep(.ms-avatar) {
    width: 35px;
    height: 35px;
    font-size: 17px;
}
.ms-gallery.filmstrip :deep(.ms-tile-label) {
    font-size: 10px;
    padding: 2px 5px;
    bottom: 3px;
    left: 3px;
}
.ms-gallery.speaker .speaker-main {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
}
.ms-gallery.speaker .speaker-main :deep(.ms-tile) {
    height: 100%;
    aspect-ratio: unset;
}
.speaker-strip {
    display: flex;
    gap: 5px;
    min-height: 0;
    height: 25%;
    overflow-x: auto;
    flex: none;
}
.speaker-strip :deep(.ms-tile) {
    min-width: 90px;
    width: 145px;
    height: 100%;
    aspect-ratio: unset;
    flex: none;
}
.ms-empty {
    display: grid;
    place-items: center;
    color: var(--text-secondary);
    font-size: 12px;
    flex: 1;
    grid-column: 1/-1;
}
.gallery-pages {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 9px;
    font-size: 11px;
    flex: none;
    height: 23px;
}
.gallery-pages button {
    border: 1px solid var(--ms-line);
    background: var(--bg-surface);
    color: var(--text-primary);
    border-radius: 6px;
    padding: 1px 8px;
}
.gallery-pages button:disabled {
    opacity: 0.4;
}
@media (max-width: 800px) {
    .ms-gallery.speaker {
        flex-direction: row;
    }
    .speaker-strip {
        width: 30%;
        height: auto;
        flex-direction: column;
        overflow-y: auto;
    }
    .speaker-strip :deep(.ms-tile) {
        min-height: 80px;
        width: 100%;
        height: 90px;
    }
}
</style>
