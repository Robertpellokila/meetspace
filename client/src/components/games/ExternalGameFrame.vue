<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  game: {
    type: Object,
    required: true,
  },
  reloadKey: {
    type: [String, Number],
    default: 0,
  },
  allowFullscreen: {
    type: Boolean,
    default: true,
  },
  timeoutMs: {
    type: Number,
    default: 15000,
  },
});

const emit = defineEmits(["load", "error", "open-external", "retry"]);

const iframeRef = ref(null);
const frameKey = ref(0);
const loading = ref(true);
const showingHelp = ref(false);
const timedOut = ref(false);
const frameLoaded = ref(false);

let loadingTimer = null;

const title = computed(() => props.game?.title || "External Game");

const rawUrl = computed(() => props.game?.embedUrl || props.game?.url || "");

// Only exact HTTPS hosts explicitly approved
// in the catalog may be embedded.
const validation = computed(() => {
  if (props.game?.embedAllowed !== true) {
    return {
      valid: false,
      reason: "Game ini belum mendapatkan izin embed.",
    };
  }

  const hosts = props.game?.allowedEmbedHosts;

  if (!Array.isArray(hosts) || !hosts.length) {
    return {
      valid: false,
      reason: "Daftar domain embed belum dikonfigurasi.",
    };
  }

  try {
    const url = new URL(rawUrl.value);

    if (url.protocol !== "https:") {
      return {
        valid: false,
        reason: "Game harus menggunakan HTTPS.",
      };
    }

    if (url.username || url.password) {
      return {
        valid: false,
        reason: "Alamat game tidak valid.",
      };
    }

    if (
      !hosts.some(
        (host) =>
          typeof host === "string" &&
          host.toLowerCase() === url.hostname.toLowerCase(),
      )
    ) {
      return {
        valid: false,
        reason: "Domain game tidak ada dalam allowlist.",
      };
    }

    return {
      valid: true,
      url: url.href,
      reason: "",
    };
  } catch {
    return {
      valid: false,
      reason: "URL game tidak valid.",
    };
  }
});

const embedUrl = computed(() =>
  validation.value.valid ? validation.value.url : "",
);
const providerHostname = computed(() =>
  embedUrl.value ? new URL(embedUrl.value).hostname : "",
);
const sandboxPermissions = computed(() => {
  const base = "allow-scripts allow-forms allow-pointer-lock";
  // Third-party HTML5 games often use their own storage. Same-origin access is
  // safe here only while the frame stays on a different origin from MeetSpace.
  return embedUrl.value && new URL(embedUrl.value).origin !== window.location.origin
    ? `${base} allow-same-origin`
    : base;
});

// External-tab URL is independently checked.
// Do not open arbitrary javascript: or data: URLs.
const externalUrl = computed(() => {
  const value = props.game?.url || props.game?.embedUrl || "";

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.username || url.password) {
      return "";
    }

    const allowedHosts = props.game?.allowedExternalHosts;

    // Prefer an explicit navigation allowlist.
    // Fall back to verified embed hosts.
    const hosts = Array.isArray(allowedHosts)
      ? allowedHosts
      : props.game?.allowedEmbedHosts || [];

    if (
      !hosts.some(
        (host) =>
          typeof host === "string" &&
          host.toLowerCase() === url.hostname.toLowerCase(),
      )
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
});

const isInvalid = computed(() => !validation.value.valid);

function stopTimer() {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

function startLoading() {
  stopTimer();

  loading.value = true;
  showingHelp.value = false;
  timedOut.value = false;
  frameLoaded.value = false;

  if (!validation.value.valid) {
    loading.value = false;
    return;
  }

  loadingTimer = setTimeout(
    () => {
      if (!frameLoaded.value) {
        timedOut.value = true;
        loading.value = false;
        showingHelp.value = true;

        emit("error", {
          type: "timeout",
          message: "Game membutuhkan waktu terlalu lama untuk dimuat.",
          game: props.game,
        });
      }
    },
    Math.max(3000, props.timeoutMs),
  );
}

function handleLoad() {
  stopTimer();

  frameLoaded.value = true;
  loading.value = false;

  emit("load", {
    game: props.game,
    note: "Iframe load event received; game availability is not verified.",
  });
}

function handleError() {
  stopTimer();

  loading.value = false;
  showingHelp.value = true;

  emit("error", {
    type: "iframe",
    message: "Game eksternal gagal dimuat.",
    game: props.game,
  });
}

function retry() {
  if (!validation.value.valid) return;

  frameKey.value++;
  startLoading();

  emit("retry", props.game);
}

function openExternal() {
  if (!externalUrl.value) return;

  // Event originates from a user click.
  window.open(externalUrl.value, "_blank", "noopener,noreferrer");

  emit("open-external", props.game);
}

watch(
  () => [
    props.game?.id,
    props.game?.url,
    props.game?.embedUrl,
    props.game?.embedAllowed,
    JSON.stringify(props.game?.allowedEmbedHosts || []),
    props.reloadKey,
  ],
  () => {
    frameKey.value++;
    startLoading();
  },
  { immediate: true },
);

onBeforeUnmount(stopTimer);
</script>

<template>
  <section class="external-frame">
    <!-- INVALID / BLOCKED CONFIG -->
    <div v-if="isInvalid" class="frame-state" role="alert">
      <div class="state-icon">🛡️</div>

      <h3>Embedded game unavailable</h3>

      <p>{{ validation.reason }}</p>

      <p class="state-note">
        Game hanya bisa dijalankan melalui iframe jika domain dan izin embed
        telah diverifikasi.
      </p>

      <button
        v-if="externalUrl"
        type="button"
        class="retro-button primary"
        @click="openExternal"
      >
        Open in New Tab ↗
      </button>
    </div>

    <template v-else>
      <div class="frame-viewport">
        <iframe
          :key="`${game.id}-${frameKey}`"
          ref="iframeRef"
          class="game-iframe"
          :src="embedUrl"
          :title="`${title} — External game`"
          loading="eager"
          allow="fullscreen; gamepad"
          :allowfullscreen="allowFullscreen"
          :sandbox="sandboxPermissions"
          referrerpolicy="strict-origin-when-cross-origin"
          @load="handleLoad"
          @error="handleError"
        ></iframe>

        <div v-if="loading" class="loading-overlay" role="status">
          <div class="spinner"></div>
          <strong>Loading {{ title }}...</strong>
          <p>Connecting to the external game.</p>
        </div>

        <div v-if="timedOut || showingHelp" class="help-banner" role="status">
          <span>
            {{
              timedOut
                ? "Game loading timed out."
                : "Trouble opening this game?"
            }}
          </span>

          <div class="help-actions">
            <button type="button" @click="retry">↻ Retry</button>

            <button v-if="externalUrl" type="button" @click="openExternal">
              Open in New Tab ↗
            </button>

            <button v-if="!timedOut" type="button" @click="showingHelp = false">
              Close
            </button>
          </div>
        </div>
      </div>

      <footer class="frame-footer">
        <div class="provider">
          <span class="provider-icon">🌐</span>
          <span>
            {{ game.sharedScreenOnly ? "Bagikan tab ini ke pasangan" : "External game" }}
            <small>{{ providerHostname }}{{ game.sharedScreenOnly ? " · satu layar" : "" }}</small>
          </span>
        </div>

        <div class="footer-actions">
          <button
            type="button"
            title="Having trouble with this game?"
            @click="showingHelp = !showingHelp"
          >
            Help
          </button>

          <button type="button" title="Reload game" @click="retry">
            ↻ Reload
          </button>

          <button
            v-if="externalUrl"
            type="button"
            title="Open in a new tab"
            @click="openExternal"
          >
            ↗ Open
          </button>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.external-frame {
  --ef-ink: var(--text-primary, #303826);
  --ef-line: var(--border-color, #4f5b2a);
  --ef-olive: var(--color-secondary, #4f5b2a);
  --ef-paper: var(--bg-surface, #fffcf7);
  --ef-soft: var(--bg-elevated, #eee6d7);
  --ef-muted: var(--text-secondary, #77756d);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--ef-ink);
  background: var(--ef-paper);
  container-type: inline-size;
}

.frame-viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}

.game-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: white;
}

.loading-overlay {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px;
  text-align: center;
  background: var(--ef-paper);
  pointer-events: none;
}

.loading-overlay strong {
  font-size: 15px;
  font-weight: 950;
}

.loading-overlay p {
  margin: 0;
  color: var(--ef-muted);
  font-size: 12px;
}

.spinner {
  width: 38px;
  height: 38px;
  border: 4px solid var(--ef-soft);
  border-top-color: var(--ef-olive);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.frame-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  gap: 13px;
  padding: 30px;
  text-align: center;
}

.state-icon {
  font-size: 52px;
  line-height: 1;
}

.frame-state h3 {
  margin: 0;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(19px, 4vw, 27px);
}

.frame-state p {
  margin: 0;
  max-width: 390px;
  color: var(--ef-muted);
  font-size: 12px;
  line-height: 1.7;
}

.frame-state .state-note {
  font-size: 11px;
}

.retro-button {
  padding: 11px 18px;
  border: 2px solid var(--ef-line);
  border-radius: 10px;
  background: var(--ef-paper);
  color: var(--ef-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--ef-line);
}

.retro-button.primary {
  background: var(--ef-olive);
  color: #fff;
}

.help-banner {
  position: absolute;
  z-index: 5;
  bottom: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 2px solid var(--ef-line);
  border-radius: 12px;
  background: var(--ef-paper);
  box-shadow: 3px 3px 0 var(--ef-line);
  font-size: 11px;
  font-weight: 800;
}

.help-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.help-actions button,
.footer-actions button {
  padding: 7px 10px;
  border: 1px solid var(--ef-line);
  border-radius: 7px;
  background: var(--ef-soft);
  color: var(--ef-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.help-actions button:hover,
.footer-actions button:hover {
  background: var(--color-sand, #d8c9a8);
}

.frame-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: none;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--ef-line);
  background: var(--ef-soft);
}

.provider {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.provider-icon {
  font-size: 21px;
}

.provider > span:last-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 11px;
  font-weight: 900;
}

.provider small {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ef-muted);
  font-size: 9px;
  font-weight: 600;
}

.footer-actions {
  display: flex;
  gap: 6px;
  flex: none;
}

/* RESPONSIVE */
@container (max-width: 540px) {
  .help-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .help-actions {
    justify-content: flex-start;
  }

  .frame-footer {
    padding: 6px 8px;
    gap: 7px;
  }

  .footer-actions button {
    padding: 6px;
    font-size: 10px;
  }

  .provider small {
    max-width: 110px;
  }
}

@container (max-width: 330px) {
  .provider-icon {
    display: none;
  }

  .footer-actions {
    gap: 3px;
  }

  .footer-actions button {
    padding: 5px;
  }

  .help-banner {
    bottom: 6px;
    left: 6px;
    right: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
