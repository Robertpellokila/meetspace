<script setup>
import AccountControls from '../components/common/AccountControls.vue'
import { useErrorToast } from '../composables/useErrorToast.js'
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRoomPreferencesStore } from "../stores/roomPreferences";
import { useAppearanceStore } from "../stores/appearance";
import { roomModes } from "../config/roomModes";
import { themes } from "../config/themes";
import { useRouter } from "vue-router";
import api from "../services/api";


const preferences = useRoomPreferencesStore();
const appearance = useAppearanceStore();
const { selectedMode, selectedTheme, getSelectedMode, getSelectedTheme } =
    storeToRefs(preferences);
const { isDark } = storeToRefs(appearance);

const roomName = ref("");
const roomPassword = ref("");
const showRoomPassword = ref(false);
const modeOptions = Object.entries(roomModes);
const themeOptions = computed(() =>
    preferences.availableThemes.map(id => [id, themes[id]]),
);

const router = useRouter();

const loading = ref(false);

const error = ref("");

const activeFeatures = computed(() =>
    Object.entries(getSelectedMode.value?.features ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => ({
            key: name,
            label: name
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (letter) => letter.toUpperCase()),
        })),
);

const canCreateRoom = computed(() => roomName.value.trim().length > 0 && (!roomPassword.value || roomPassword.value.trim().length >= 6));

function chooseMode(mode) {
    preferences.setSelectedMode(mode);
}

function chooseTheme(theme) {
    preferences.setSelectedTheme(theme);
}

async function createRoom() {
    const name = roomName.value.trim();

    if (!canCreateRoom.value || loading.value) return;

    loading.value = true;
    error.value = "";

    try {
        const roomData = {
            name,
            mode: selectedMode.value,
            theme: selectedTheme.value,
            ...(roomPassword.value ? { password: roomPassword.value } : {}),
        };

        const response = await api.post("/rooms", roomData);

        const roomId = response.data.data.id;
        roomPassword.value = "";

        await router.push({
            name: "lobby",
            params: {
                roomId,
            },
        });
    } catch (err) {
        error.value = err;
    } finally {
        loading.value = false;
    }
}
useErrorToast(error)
</script>

<template>
    <div class="create-page">
        <div class="ambient ambient-one" aria-hidden="true"></div>
        <div class="ambient ambient-two" aria-hidden="true"></div>

        <header class="topbar">
            <RouterLink to="/" class="brand" aria-label="MeetSpace home">
                <span class="brand-mark" aria-hidden="true">✦</span>
                <span>MeetSpace</span>
            </RouterLink>

            <div class="topbar-actions">
                <AccountControls />
                <span class="topbar-label">THE RETRO CLUB</span>
                <button
                    class="appearance-toggle ms-button ms-button-outline"
                    type="button"
                    :aria-label="
                        isDark ? 'Switch to light mode' : 'Switch to dark mode'
                    "
                    :aria-pressed="isDark"
                    @click="appearance.toggleTheme()"
                >
                    <span aria-hidden="true">{{ isDark ? "☀" : "☾" }}</span>
                    {{ isDark ? "Light mode" : "Dark mode" }}
                </button>
            </div>
        </header>

        <main class="main-content">
            <div class="page-heading">
                <span class="eyebrow">WELCOME TO THE GOOD OLD DAYS</span>
                <h1>Good times start here!</h1>
                <p>
                    From productive meetings to cozy movie nights. Create a
                    space that feels just right.
                </p>
            </div>

            <div class="workspace">
                <section
                    class="config-panel ms-card"
                    aria-label="Room configuration"
                >
                    <div class="section-header">
                        <span class="step-number">01</span>
                        <div>
                            <h2>Choose your experience</h2>
                            <p>Every moment deserves its own space.</p>
                        </div>
                    </div>

                    <div class="mode-grid">
                        <button
                            v-for="[id, mode] in modeOptions"
                            :key="id"
                            type="button"
                            class="mode-card"
                            :class="{ active: selectedMode === id }"
                            :aria-pressed="selectedMode === id"
                            @click="chooseMode(id)"
                        >
                            <span class="mode-icon" aria-hidden="true">
                                {{ id === "professional" ? "▦" : "▶" }}
                            </span>
                            <strong>{{ mode.name }}</strong>
                            <small>
                                {{
                                    id === "professional"
                                        ? "Meet, share & collaborate"
                                        : "Watch, relax & connect"
                                }}
                            </small>
                            <span
                                v-if="selectedMode === id"
                                class="selected-indicator"
                                aria-hidden="true"
                                >✓</span
                            >
                        </button>
                    </div>

                    <div class="section-divider"></div>

                    <div class="section-header">
                        <span class="step-number">02</span>
                        <div>
                            <h2>Name your space</h2>
                            <p>Give this moment a memorable name.</p>
                        </div>
                    </div>

                    <div class="input-group">
                        <label for="room-name">SPACE NAME</label>
                        <input
                            id="room-name"
                            v-model="roomName"
                            class="ms-input"
                            type="text"
                            maxlength="80"
                            autocomplete="off"
                            placeholder="e.g. Friday Movie Night"
                        />
                    </div>

                    <div class="input-group room-password">
                        <label for="room-password">PASSWORD ROOM · OPSIONAL</label>
                        <div class="password-field">
                            <input id="room-password" v-model="roomPassword" class="ms-input" :type="showRoomPassword ? 'text' : 'password'" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Minimal 6 karakter" aria-describedby="password-help" />
                            <button type="button" class="ms-button ms-button-outline" :aria-pressed="showRoomPassword" @click="showRoomPassword = !showRoomPassword">{{ showRoomPassword ? 'Sembunyikan' : 'Tampilkan' }}</button>
                        </div>
                        <small id="password-help">Kosongkan jika tidak perlu. Bagikan password terpisah dari undangan. Persetujuan host tetap diperlukan.</small>
                    </div>

                    <div class="section-divider"></div>

                    <div class="section-header">
                        <span class="step-number">03</span>
                        <div>
                            <h2>Set the mood</h2>
                            <p>Choose the atmosphere you love.</p>
                        </div>
                    </div>

                    <div class="theme-list">
                        <button
                            v-for="[id, theme] in themeOptions"
                            :key="id"
                            type="button"
                            class="theme-option"
                            :class="{ active: selectedTheme === id }"
                            :aria-pressed="selectedTheme === id"
                            @click="chooseTheme(id)"
                        >
                            <span
                                class="theme-swatch"
                                :class="`theme-swatch--${id}`"
                                aria-hidden="true"
                            >
                                <span class="swatch-dot"></span>
                            </span>
                            <span class="theme-information">
                                <strong>{{ theme.icon }} {{ theme.name }}</strong>
                                <small>{{
                                    id === "midnight"
                                        ? "Focused & professional"
                                        : "Warm & intimate"
                                }}</small>
                            </span>
                            <span class="theme-radio" aria-hidden="true">{{
                                selectedTheme === id ? "✓" : ""
                            }}</span>
                        </button>
                    </div>

                    <button
                        class="create-button ms-button ms-button-accent"
                        type="button"
                        :disabled="loading || !canCreateRoom"
                        @click="createRoom"
                    >
                        <span>
                            {{
                                loading
                                    ? "Creating your space..."
                                    : "Create My Space"
                            }}
                        </span>
                        <span v-if="!loading">→</span>
                    </button>

                    
                    <p class="helper-text">
                        Create your space, then invite guests from the lobby.
                    </p>
                </section>

                <section
                    class="preview-panel ms-card"
                    aria-label="Room preview"
                >
                    <div class="preview-header">
                        <div>
                            <span class="eyebrow">ON THE AIR</span>
                            <h2>A peek inside the room.</h2>
                        </div>
                        <span class="preview-badge ms-badge">DEMO</span>
                    </div>

                    <!-- Room themes change the preview atmosphere without replacing the retro brand palette. -->
                    <div
                        class="room-preview"
                        :class="`room-preview--${selectedTheme}`"
                    >
                        <div class="preview-topbar">
                            <span class="preview-logo">✦ MeetSpace</span>
                            <span class="preview-live"
                                ><span class="live-dot"></span>Room
                                preview</span
                            >
                        </div>
                        <div
                            class="preview-body"
                            :class="{
                                'preview-body--cinema':
                                    selectedMode === 'watchParty',
                            }"
                        >
                            <div class="preview-avatar" aria-hidden="true">
                                {{
                                    selectedMode === "professional" ? "▦" : "▶"
                                }}
                            </div>
                            <h3>
                                {{ roomName.trim() || "Your Untitled Space" }}
                            </h3>
                            <p>{{ getSelectedMode?.name }}</p>
                            <div class="preview-tags">
                                <span>{{
                                    getSelectedMode?.layout === "cinema"
                                        ? "Cinema Layout"
                                        : "Grid Layout"
                                }}</span>
                                <span>{{ getSelectedTheme?.name }}</span>
                            </div>
                        </div>
                        <div
                            class="preview-controlbar"
                            aria-label="Illustrative meeting controls"
                        >
                            <span title="Microphone">🎤</span>
                            <span title="Camera">📷</span>
                            <span title="Chat">💬</span>
                            <span
                                :title="
                                    selectedMode === 'watchParty'
                                        ? 'Watch together'
                                        : 'Share screen'
                                "
                            >
                                {{ selectedMode === "watchParty" ? "🎞" : "▣" }}
                            </span>
                            <span class="end-call" title="Leave meeting"
                                >☎</span
                            >
                        </div>
                    </div>

                    <div class="features-panel">
                        <h3>What's included</h3>
                        <div class="features-list">
                            <div
                                v-for="feature in activeFeatures"
                                :key="feature.key"
                                class="feature-item"
                            >
                                <span class="feature-check" aria-hidden="true"
                                    >✓</span
                                >
                                <span>{{ feature.label }}</span>
                            </div>
                        </div>
                    </div>
                    <p class="preview-note">
                        A preview of your room's mood and features. Choose your
                        camera and microphone settings in the lobby.
                    </p>
                </section>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* MEETSPACE — RETRO POP 70s / fully tokenized for light + dark */
.create-page {
    --retro-ink: var(--text-primary, #283b32);
    --retro-line: var(--border-color, #283b32);
    --retro-mint: var(--color-primary, #59b292);
    --retro-yellow: var(--color-secondary, #ffc94d);
    --retro-cream: var(--color-accent-cream, #fae7cb);
    --retro-pink: var(--color-accent-pink, #fa6781);
    --retro-paper: var(--bg-app, #fae7cb);
    --retro-card: var(--bg-surface, #fff9eb);
    --retro-subtle: var(--bg-elevated, #f1e2ca);
    --retro-shadow: var(--shadow-card);
    min-height: 100vh;
    position: relative;
    isolation: isolate;
    overflow: clip;
    background-color: var(--retro-paper);
    background-image: radial-gradient(var(--pattern-dot) 1px, transparent 1px);
    background-size: 22px 22px;
    color: var(--retro-ink);
    font-family: var(--font-body);
    transition:
        background-color 0.25s ease,
        color 0.25s ease;
}
.create-page *,
.create-page *::before,
.create-page *::after {
    box-sizing: border-box;
}
.create-page button,
.create-page input {
    font: inherit;
}
.create-page button {
    cursor: pointer;
}
.create-page a:focus-visible,
.create-page button:focus-visible,
.create-page input:focus-visible {
    outline: 3px dashed var(--retro-pink);
    outline-offset: 4px;
}
.ambient {
    position: absolute;
    z-index: -1;
    width: 380px;
    height: 380px;
    border: 24px solid var(--retro-ink);
    border-radius: 50%;
    opacity: 0.075;
    pointer-events: none;
}
.ambient::after {
    content: "";
    position: absolute;
    inset: 50px;
    border: 14px solid currentColor;
    border-radius: 50%;
}
.ambient-one {
    top: 115px;
    left: -260px;
    color: var(--retro-mint);
}
.ambient-two {
    bottom: -210px;
    right: -170px;
    color: var(--retro-pink);
}
.topbar {
    position: relative;
    z-index: 2;
    max-width: 1240px;
    margin: 0 auto;
    padding: 24px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}
.brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    font-weight: 1000;
    font-size: clamp(22px, 3vw, 28px);
    letter-spacing: -1.3px;
    color: var(--retro-ink);
    text-shadow: 2px 2px 0 var(--retro-yellow);
}
.brand-mark {
    display: grid;
    place-items: center;
    width: 45px;
    height: 45px;
    color: #27372e;
    background: var(--retro-yellow);
    border: 3px solid var(--retro-line);
    border-radius: 50%;
    box-shadow: 3px 3px 0 var(--retro-line);
    font-size: 27px;
    transform: rotate(-12deg);
}
.topbar-actions {
    display: flex;
    align-items: center;
    gap: 17px;
}
.topbar-label {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 2px;
    text-transform: uppercase;
}
.appearance-toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 11px 16px;
    color: var(--retro-ink);
    background: var(--retro-card);
    border: 2px solid var(--retro-line);
    border-radius: 100px;
    font-size: 12px;
    font-weight: 900;
    box-shadow: 3px 4px 0 var(--retro-line);
    transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        background 0.2s ease;
}
.appearance-toggle:hover {
    background: var(--retro-yellow);
    transform: translateY(-2px);
}
.appearance-toggle:active {
    transform: translate(3px, 4px);
    box-shadow: none;
}
.main-content {
    max-width: 1240px;
    padding: 42px 32px 110px;
    margin: 0 auto;
}
.page-heading {
    position: relative;
    padding: 8px 0 13px 21px;
    margin-bottom: 45px;
    border-left: 8px solid var(--retro-pink);
}
.eyebrow {
    display: inline-block;
    padding: 6px 11px;
    background: var(--retro-yellow);
    color: #292e29;
    border: 2px solid var(--retro-line);
    border-radius: 50px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
}
.page-heading h1 {
    font-family: var(--font-display);
    margin: 16px 0 10px;
    font-weight: 1000;
    font-size: clamp(39px, 6vw, 72px);
    line-height: 1.02;
    letter-spacing: -3px;
    max-width: 850px;
    text-shadow: 4px 4px 0 var(--retro-mint);
}
.page-heading p {
    max-width: 580px;
    margin: 17px 0 0;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.75;
}
.workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    align-items: start;
    gap: 28px;
}
.config-panel,
.preview-panel {
    min-width: 0;
    padding: 28px;
    background: var(--retro-card);
    border: 3px solid var(--retro-line);
    border-radius: var(--radius-xl);
    box-shadow: 8px 9px 0 var(--shadow-color);
}
.section-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
}
.step-number {
    display: grid;
    flex: 0 0 42px;
    place-items: center;
    height: 42px;
    border-radius: 50%;
    background: var(--retro-pink);
    color: #292e29;
    border: 2px solid var(--retro-line);
    font-size: 15px;
    font-weight: 1000;
    box-shadow: 2px 3px 0 var(--retro-line);
}
.section-header h2,
.preview-header h2 {
    font-family: var(--font-display);
    margin: 0 0 6px;
    font-weight: 1000;
    font-size: 20px;
    letter-spacing: -0.5px;
}
.section-header p,
.preview-note {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.6;
}
.mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}
.mode-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    min-height: 168px;
    padding: 19px;
    border: 2px solid var(--retro-line);
    border-radius: 17px;
    background: var(--retro-subtle);
    color: var(--retro-ink);
    text-align: left;
    box-shadow: 3px 4px 0 var(--retro-line);
    transition: 0.18s ease;
}
.mode-card:nth-child(even) {
    background: color-mix(in srgb, var(--retro-pink) 22%, var(--retro-card));
}
.mode-card:hover {
    transform: translateY(-3px);
    box-shadow: 4px 7px 0 var(--retro-line);
}
.mode-card:active {
    transform: translate(3px, 4px);
    box-shadow: none;
}
.mode-card.active {
    background: color-mix(in srgb, var(--retro-mint) 45%, var(--retro-card));
    outline: 3px solid var(--retro-yellow);
    outline-offset: -7px;
}
.mode-icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    color: #27372e;
    background: var(--retro-yellow);
    border: 2px solid var(--retro-line);
    border-radius: 50%;
    font-size: 24px;
}
.mode-card strong {
    font-size: 15px;
    font-weight: 1000;
}
.mode-card small {
    color: var(--text-secondary);
    line-height: 1.4;
    font-size: 12px;
}
.selected-indicator {
    position: absolute;
    top: 15px;
    right: 15px;
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    border: 2px solid var(--retro-line);
    border-radius: 50%;
    color: #292e29;
    background: var(--retro-yellow);
    font-weight: 1000;
}
.section-divider {
    height: 0;
    margin: 34px 0;
    border-top: 3px dashed
        color-mix(in srgb, var(--retro-line) 50%, transparent);
}
.input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.input-group label {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 1000;
    letter-spacing: 2px;
}
.input-group input {
    width: 100%;
    padding: 17px 18px;
    background: var(--retro-card);
    color: var(--retro-ink);
    border: 2px solid var(--retro-line);
    border-radius: var(--radius-md);
    box-shadow: 3px 3px 0 var(--shadow-color);
    outline: none;
}
.input-group input::placeholder {
    color: var(--text-secondary);
    opacity: 0.8;
}
.input-group input:focus {
    background: var(--retro-card);
    border-color: var(--retro-mint);
    box-shadow: 0 0 0 3px var(--retro-yellow);
}
.theme-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.theme-option {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    padding: 12px;
    border: 2px solid var(--retro-line);
    border-radius: 15px;
    background: var(--retro-subtle);
    color: var(--retro-ink);
    text-align: left;
    box-shadow: 3px 3px 0 var(--retro-line);
    transition: transform 0.15s ease;
}
.theme-option:hover {
    transform: translateY(-2px);
}
.theme-option.active {
    background: color-mix(in srgb, var(--retro-yellow) 35%, var(--retro-card));
}
.theme-swatch {
    position: relative;
    display: grid;
    flex: 0 0 52px;
    place-items: center;
    width: 52px;
    height: 52px;
    border: 2px solid #292e29;
    border-radius: 12px;
    background: repeating-linear-gradient(
        145deg,
        #243c36 0 10px,
        #59b292 10px 20px
    );
}
.theme-swatch--romantic {
    background: repeating-linear-gradient(
        145deg,
        #fa6781 0 10px,
        #fae7cb 10px 20px
    );
}
.swatch-dot {
    width: 22px;
    height: 22px;
    border: 3px solid #292e29;
    border-radius: 50%;
    background: #ffc94d;
}
.theme-swatch--romantic .swatch-dot {
    background: #59b292;
}
.theme-information {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
}
.theme-information strong {
    font-size: 14px;
    font-weight: 1000;
}
.theme-information small {
    font-size: 12px;
    color: var(--text-secondary);
}
.theme-radio {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 2px solid var(--retro-line);
    border-radius: 50%;
    font-weight: 1000;
    color: #292e29;
    background: var(--retro-card);
}
.theme-option.active .theme-radio {
    background: var(--retro-yellow);
}
.create-button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-top: 30px;
    padding: 18px 21px;
    border: 3px solid var(--retro-line);
    border-radius: 13px;
    color: #27372e;
    background: var(--retro-mint);
    font-weight: 1000;
    font-size: 16px;
    box-shadow: 5px 6px 0 var(--retro-line);
    transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
}
.create-button:not(:disabled):hover {
    background: var(--retro-yellow);
    transform: translateY(-2px);
}
.create-button:not(:disabled):active {
    transform: translate(5px, 6px);
    box-shadow: none;
}
.create-button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
}
.helper-text {
    margin: 18px 0 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: 11px;
}
.preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 23px;
}
.preview-header h2 {
    margin-top: 10px;
}
.preview-badge {
    flex: none;
    padding: 8px 12px;
    border: 2px solid var(--retro-line);
    border-radius: 50px;
    background: var(--retro-pink);
    color: #292e29;
    font-size: 10px;
    font-weight: 1000;
    letter-spacing: 1px;
    transform: rotate(6deg);
}
.room-preview {
    --mood-glow: #ffc94d;
    --mood-tint: #59b292;
    overflow: hidden;
    border: 3px solid var(--retro-line);
    border-radius: 24px;
    background: var(--retro-subtle);
    box-shadow: 4px 5px 0 var(--retro-line);
}
.room-preview--romantic {
    --mood-glow: #fa6781;
    --mood-tint: #fae7cb;
}
.preview-topbar {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 15px;
    background: var(--retro-yellow);
    border-bottom: 3px solid var(--retro-line);
    color: #27372e;
    font-size: 11px;
}
.preview-logo {
    font-size: 12px;
    font-weight: 1000;
}
.preview-live {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 800;
}
.live-dot {
    width: 9px;
    height: 9px;
    border: 2px solid #27372e;
    border-radius: 50%;
    background: var(--retro-pink);
}
.preview-body {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 297px;
    padding: 48px 20px;
    text-align: center;
    isolation: isolate;
    background: var(--retro-card);
}
.preview-body::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    background: repeating-radial-gradient(
        circle at 50% 45%,
        transparent 0 21px,
        color-mix(in srgb, var(--mood-tint) 27%, transparent) 22px 28px,
        transparent 29px 44px
    );
    opacity: 0.8;
}
.preview-body::after {
    content: "";
    position: absolute;
    z-index: -1;
    bottom: 0;
    width: 100%;
    height: 10px;
    background: repeating-linear-gradient(
        90deg,
        var(--mood-glow) 0 24px,
        var(--mood-tint) 24px 48px
    );
}
.preview-avatar {
    display: grid;
    place-items: center;
    width: 88px;
    height: 88px;
    margin-bottom: 23px;
    border: 3px solid var(--retro-line);
    border-radius: 50%;
    background: var(--mood-glow);
    color: #292e29;
    box-shadow: 5px 5px 0 var(--retro-line);
    font-size: 34px;
    transform: rotate(-7deg);
}
.preview-body h3 {
    margin: 0 0 9px;
    max-width: 100%;
    color: var(--retro-ink);
    font-size: 23px;
    font-weight: 1000;
    letter-spacing: -0.6px;
    overflow-wrap: anywhere;
}
.preview-body p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
}
.preview-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
}
.preview-tags span {
    padding: 7px 12px;
    color: #292e29;
    background: var(--retro-cream);
    border: 2px solid var(--retro-line);
    border-radius: 50px;
    font-size: 11px;
    font-weight: 800;
}
.preview-controlbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 11px;
    padding: 18px;
    background: var(--retro-mint);
    border-top: 3px solid var(--retro-line);
}
.preview-controlbar span {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 2px solid #27372e;
    border-radius: 12px;
    color: #27372e;
    background: var(--retro-cream);
    box-shadow: 2px 3px 0 #27372e;
    font-size: 17px;
}
.preview-controlbar .end-call {
    color: #292e29;
    background: var(--retro-pink);
}
.features-panel {
    margin-top: 32px;
}
.features-panel h3 {
    margin: 0 0 17px;
    font-size: 16px;
    font-weight: 1000;
}
.features-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.feature-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
}
.feature-check {
    display: grid;
    flex: 0 0 22px;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 2px solid var(--retro-line);
    border-radius: 50%;
    background: var(--retro-yellow);
    color: #292e29;
    font-weight: 1000;
}
.preview-note {
    margin-top: 27px;
    text-align: center;
}
@media (max-width: 880px) {
    .workspace {
        grid-template-columns: 1fr;
    }
    .main-content {
        padding: 32px 20px 75px;
    }
    .topbar {
        padding: 20px;
    }
}
@media (max-width: 480px) {
    .config-panel,
    .preview-panel {
        padding: 19px;
        box-shadow: 5px 6px 0 var(--retro-line);
    }
    .mode-grid,
    .features-list {
        grid-template-columns: 1fr;
    }
    .topbar-label {
        display: none;
    }
    .page-heading h1 {
        letter-spacing: -2px;
    }
    .preview-header {
        align-items: flex-start;
    }
    .topbar {
        gap: 8px;
    }
    .appearance-toggle {
        padding: 9px 11px;
    }
}
@media (prefers-reduced-motion: reduce) {
    .create-page *,
    .create-page *::before,
    .create-page *::after {
        transition: none !important;
        animation: none !important;
    }
}
</style>
