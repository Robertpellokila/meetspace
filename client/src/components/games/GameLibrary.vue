<script setup>
import { computed, ref } from "vue";

import {
  ALL_GAMES,
  GAME_CATEGORIES,
  GAME_STATUS,
  GAME_TYPES,
  filterGames,
} from "../../config/gameCatalog.js";

// Props dari GameLayout.vue
const props = defineProps({
  activeGameId: {
    type: String,
    default: "",
  },

  disabled: {
    type: Boolean,
    default: false,
  },

  playerCount: {
    type: Number,
    default: 2,
  },
});

// Event untuk parent GameLayout
const emit = defineEmits(["select-game"]);

// State
const searchQuery = ref("");
const activeCategory = ref("all");
const activeFilter = ref("all");

// Filter status
const STATUS_FILTERS = [
  {
    id: "all",
    label: "All",
  },
  {
    id: GAME_STATUS.AVAILABLE,
    label: "Available",
  },
  {
    id: GAME_STATUS.COMING_SOON,
    label: "Coming Soon",
  },
];

// Semua game setelah filtering
const filteredGames = computed(() => {
  return filterGames({
    category: activeCategory.value,
    search: searchQuery.value,
    status: activeFilter.value,
  });
});
const firstExternalId = computed(() =>
  filteredGames.value.find((game) => game.type !== GAME_TYPES.NATIVE)?.id,
);

// Statistik
const totalGames = computed(() => ALL_GAMES.length);

const availableGames = computed(() => {
  return ALL_GAMES.filter((game) => game.status === GAME_STATUS.AVAILABLE)
    .length;
});

const nativeGames = computed(() => {
  return ALL_GAMES.filter((game) => game.type === GAME_TYPES.NATIVE).length;
});

// Menentukan apakah game dapat dipilih
function canPlay(game) {
  return (
    !props.disabled &&
    game.status === GAME_STATUS.AVAILABLE &&
    props.playerCount >= game.minPlayers &&
    props.playerCount <= game.maxPlayers
  );
}

// Event memilih game
function selectGame(game) {
  if (!canPlay(game)) return;

  emit("select-game", game);
}

// Mengembalikan status game
function gameStatus(game) {
  if (game.status === GAME_STATUS.COMING_SOON) {
    return "Coming Soon";
  }

  if (game.status === GAME_STATUS.DISABLED) {
    return "Unavailable";
  }

  if (props.playerCount < game.minPlayers) {
    return `Needs ${game.minPlayers} players`;
  }

  if (props.playerCount > game.maxPlayers) {
    return `Max ${game.maxPlayers} players`;
  }

  return game.type === GAME_TYPES.NATIVE ? "Ready to Play" : "External Game";
}

// Text jumlah pemain
function playerLabel(game) {
  if (game.minPlayers === game.maxPlayers) {
    return `${game.minPlayers} Players`;
  }

  return `${game.minPlayers}–${game.maxPlayers} Players`;
}

// Reset search/filter
function resetFilters() {
  searchQuery.value = "";
  activeCategory.value = "all";
  activeFilter.value = "all";
}
</script>

<template>
  <section class="game-library">
    <!-- HEADER -->
    <header class="library-header">
      <div class="header-copy">
        <div class="eyebrow">
          <span class="sparkle">✦</span>
          MEETSPACE GAME CLUB
        </div>

        <h2>
          Pick your
          <em>next adventure.</em>
        </h2>

        <p>
          Play, laugh, compete, and make memories together. Find your next
          favorite game!
        </p>
      </div>

      <div class="header-decoration" aria-hidden="true">
        <span class="decoration-star">✦</span>
        <span class="decoration-controller">🎮</span>
        <span class="decoration-heart">♥</span>
      </div>
    </header>

    <!-- GAME STATS -->
    <div class="library-stats">
      <div class="stat-card">
        <span class="stat-icon">🎮</span>
        <div>
          <strong>{{ totalGames }}</strong>
          <small>Total Games</small>
        </div>
      </div>

      <div class="stat-card">
        <span class="stat-icon">✦</span>
        <div>
          <strong>{{ availableGames }}</strong>
          <small>Available</small>
        </div>
      </div>

      <div class="stat-card">
        <span class="stat-icon">♥</span>
        <div>
          <strong>{{ nativeGames }}</strong>
          <small>MeetSpace Games</small>
        </div>
      </div>
    </div>

    <!-- FILTER AREA -->
    <div class="library-filters">
      <!-- SEARCH -->
      <div class="search-box">
        <span class="search-icon" aria-hidden="true">⌕</span>

        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search your next favorite game..."
          aria-label="Search games"
        />

        <button
          v-if="searchQuery"
          type="button"
          class="clear-search"
          aria-label="Clear search"
          @click="searchQuery = ''"
        >
          ×
        </button>
      </div>

      <!-- CATEGORY -->
      <div class="category-scroller">
        <div class="category-list">
          <button
            v-for="category in GAME_CATEGORIES"
            :key="category.id"
            type="button"
            class="category-button"
            :class="{
              selected: activeCategory === category.id,
            }"
            :aria-pressed="activeCategory === category.id"
            @click="activeCategory = category.id"
          >
            <span>{{ category.icon }}</span>
            {{ category.name }}
          </button>
        </div>
      </div>

      <!-- FILTER STATUS -->
      <div class="filter-bottom">
        <div class="status-filters">
          <button
            v-for="item in STATUS_FILTERS"
            :key="item.id"
            type="button"
            :class="{
              selected: activeFilter === item.id,
            }"
            :aria-pressed="activeFilter === item.id"
            @click="activeFilter = item.id"
          >
            {{ item.label }}
          </button>
        </div>

        <span class="results-count">
          {{ filteredGames.length }}
          {{ filteredGames.length === 1 ? "game" : "games" }} found
        </span>
      </div>
    </div>

    <!-- GAME CARDS -->
    <div v-if="filteredGames.length" class="games-grid">
      <template v-for="game in filteredGames" :key="game.id">
      <div v-if="game.id === firstExternalId" class="browser-section-label">
        <div><span>✦ BROWSER ARCADE</span><h3>Play a browser game together</h3></div>
        <p>Game ini terbuka langsung di MeetSpace. Host bagikan tab game agar pasangan melihat papan yang sama.</p>
      </div>
      <article
        class="game-card"
        :class="{
          'is-active': activeGameId === game.id,
          'is-unavailable': !canPlay(game),
        }"
      >
        <!-- COVER -->
        <div
          class="game-cover"
          :style="{
            background: game.coverGradient,
          }"
        >
          <div class="cover-decoration cover-one"></div>
          <div class="cover-decoration cover-two"></div>

          <span class="game-icon">
            {{ game.icon }}
          </span>

          <div class="game-type">
            {{
              game.type === GAME_TYPES.NATIVE
                ? "MEETSPACE ORIGINAL"
              : game.type === GAME_TYPES.EMBEDDED ? "BROWSER EMBED" : "EXTERNAL LINK"
            }}
          </div>

          <span v-if="activeGameId === game.id" class="active-label">
            ● SELECTED
          </span>

          <span
            v-else-if="game.status !== GAME_STATUS.AVAILABLE"
            class="coming-label"
          >
            {{ gameStatus(game) }}
          </span>
        </div>

        <!-- CONTENT -->
        <div class="game-content">
          <div class="game-heading">
            <h3>{{ game.title }}</h3>
            <span
              v-if="game.category === 'romantic'"
              class="category-heart"
              aria-label="Romantic game"
            >
              ♥
            </span>
          </div>

          <span class="game-subtitle">
            {{ game.subtitle }}
          </span>

          <p class="game-description">
            {{ game.description }}
          </p>

          <!-- META -->
          <div class="game-meta">
            <span>
              <span aria-hidden="true">♙</span>
              {{ playerLabel(game) }}
            </span>

            <span>
              <span aria-hidden="true">◷</span>
              {{ game.duration }}
            </span>
          </div>

          <!-- CATEGORY / TAG -->
          <div class="game-tags">
            <span class="category-tag">
              {{ game.category }}
            </span>

            <span v-if="game.features?.multiplayer" class="multiplayer-tag">
              ⚡ Multiplayer
            </span>
          </div>

          <!-- ACTION -->
          <button
            type="button"
            class="play-button"
            :class="{
              active: activeGameId === game.id,
            }"
            :disabled="!canPlay(game)"
            @click="selectGame(game)"
          >
            <template v-if="activeGameId === game.id">
              <span>✓ Selected</span>
            </template>

            <template v-else-if="canPlay(game)">
              <span>{{ game.type === GAME_TYPES.EMBEDDED ? "Embed & Play" : "Play Game" }}</span>
              <span aria-hidden="true">↗</span>
            </template>

            <template v-else>
              <span>{{ gameStatus(game) }}</span>
            </template>
          </button>
        </div>
      </article>
      </template>
    </div>

    <!-- EMPTY STATE -->
    <div v-else class="empty-state">
      <div class="empty-symbol">🎲</div>

      <h3>No games found!</h3>

      <p>
        We couldn't find a game matching your search. Try another category or
        keyword.
      </p>

      <button type="button" @click="resetFilters">↻ Reset Filters</button>
    </div>

    <!-- FOOTER -->
    <footer class="library-footer">
      <span>✦ MADE FOR GREAT MOMENTS</span>
      <span>More games coming soon ♥</span>
    </footer>
  </section>
</template>

<style scoped>
.game-library {
  --game-ink: var(--text-primary, #303826);
  --game-line: var(--border-color, #4f5b2a);
  --game-paper: var(--bg-surface, #fffcf7);
  --game-muted: var(--text-secondary, #77756d);
  --game-olive: var(--color-secondary, #4f5b2a);
  --game-gold: var(--color-gold, #b8892d);
  --game-sand: var(--color-sand, #d8c9a8);

  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--game-ink);
  padding: 15px 18px 24px;
  gap: 22px;
  scrollbar-width: thin;
  container-type: inline-size;
}

/* HEADER */
.library-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 160px;
  padding: 25px 28px;
  overflow: hidden;

  border: 2px solid var(--game-line);
  border-radius: 20px;
  background: var(--bg-elevated, #eee6d7);
  box-shadow: 5px 5px 0 var(--game-line);
}

.header-copy {
  position: relative;
  z-index: 2;
  max-width: 610px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.5px;
  color: var(--game-olive);
}

.sparkle {
  font-size: 17px;
}

.library-header h2 {
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(25px, 3.5vw, 38px);
  line-height: 1.1;
  letter-spacing: -1px;
  margin: 0 0 12px;
}

.library-header h2 em {
  font-style: normal;
  color: var(--game-olive);
  text-decoration: underline;
  text-decoration-color: var(--game-gold);
  text-decoration-thickness: 4px;
  text-underline-offset: 6px;
}

.library-header p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--game-muted);
  max-width: 450px;
}

.header-decoration {
  position: absolute;
  right: 25px;
  top: 50%;
  transform: translateY(-50%);
  width: 130px;
  height: 130px;
}

.decoration-controller {
  position: absolute;
  top: 30px;
  left: 15px;
  font-size: 75px;
  transform: rotate(-15deg);
  filter: drop-shadow(3px 5px 0 #30382625);
}

.decoration-star {
  position: absolute;
  right: 0;
  top: 0;
  color: var(--game-gold);
  font-size: 27px;
}

.decoration-heart {
  position: absolute;
  bottom: 0;
  left: 0;
  font-size: 24px;
  color: #d95b7f;
}

/* STATS */
.library-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 13px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 17px;

  background: var(--game-paper);
  border: 2px solid var(--game-line);
  border-radius: 15px;
  box-shadow: 3px 3px 0 var(--game-line);
}

.stat-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--bg-elevated, #eee6d7);
  font-size: 21px;
}

.stat-card > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-card strong {
  font-size: 23px;
  line-height: 1;
  font-weight: 950;
}

.stat-card small {
  font-size: 10px;
  color: var(--game-muted);
  font-weight: 700;
}

/* FILTERS */
.library-filters {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-box input {
  width: 100%;
  border: 2px solid var(--game-line);
  border-radius: 13px;
  background: var(--game-paper);
  color: var(--game-ink);
  padding: 15px 42px;
  font-size: 12px;
  outline: none;
}

.search-box input:focus {
  border-color: var(--game-gold);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--game-gold) 20%, transparent);
}

.search-icon {
  position: absolute;
  left: 15px;
  font-size: 23px;
  color: var(--game-muted);
  pointer-events: none;
}

.clear-search {
  position: absolute;
  right: 12px;
  border: none;
  background: transparent;
  font-size: 23px;
  color: var(--game-muted);
  cursor: pointer;
}

/* CATEGORIES */
.category-scroller {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
}

.category-list {
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  padding: 3px 3px 8px;
}

.category-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 10px 15px;
  border: 2px solid var(--game-line);
  border-radius: 30px;
  background: var(--game-paper);
  color: var(--game-ink);
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
  transition: 150ms ease;
}

.category-button:hover {
  transform: translateY(-2px);
  background: var(--bg-hover, #eee6d7);
}

.category-button.selected {
  background: var(--game-olive);
  color: var(--color-primary, #fff);
  border-color: var(--game-olive);
}

/* STATUS FILTERS */
.filter-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.status-filters {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-filters button {
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--game-muted);
  padding: 7px 11px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.status-filters button.selected {
  background: var(--bg-elevated, #eee6d7);
  color: var(--game-ink);
}

.results-count {
  font-size: 11px;
  font-weight: 750;
  color: var(--game-muted);
}

/* GAME GRID */
.games-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 18px;
  padding: 3px 5px 6px 2px;
}
.browser-section-label {
  grid-column: 1 / -1;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
  padding: 13px 16px;
  border: 2px solid var(--game-line);
  border-radius: 12px;
  background: var(--game-soft, var(--bg-elevated));
}
.browser-section-label span {
  color: var(--game-gold);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 1.5px;
}
.browser-section-label h3 {
  margin: 2px 0 0;
  font: 900 clamp(17px, 2vw, 23px)/1.15 var(--font-display, Georgia, serif);
}
.browser-section-label p {
  max-width: 380px;
  margin: 0;
  color: var(--game-muted);
  font-size: 11px;
  line-height: 1.45;
}
@media (max-width: 700px) {
  .browser-section-label { align-items: start; flex-direction: column; gap: 5px; }
}

.game-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 2px solid var(--game-line);
  border-radius: 17px;
  background: var(--game-paper);
  box-shadow: 4px 4px 0 var(--game-line);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.game-card:hover {
  transform: translateY(-4px);
  box-shadow: 5px 8px 0 var(--game-line);
}

.game-card.is-active {
  outline: 3px solid var(--game-gold);
  outline-offset: 2px;
}

.game-card.is-unavailable {
  opacity: 0.78;
}

/* COVER */
.game-cover {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 155px;
  overflow: hidden;
  isolation: isolate;
}

.cover-decoration {
  position: absolute;
  width: 120px;
  height: 120px;
  border: 3px solid #30382620;
  border-radius: 50%;
  pointer-events: none;
}

.cover-one {
  top: -65px;
  left: -40px;
}

.cover-two {
  bottom: -80px;
  right: -25px;
  width: 160px;
  height: 160px;
}

.game-icon {
  position: relative;
  z-index: 1;
  font-size: 65px;
  line-height: 1;
  filter: drop-shadow(3px 5px 0 #30382625);
  transition: transform 180ms ease;
}

.game-card:hover .game-icon {
  transform: rotate(-8deg) scale(1.08);
}

.game-type,
.active-label,
.coming-label {
  position: absolute;
  z-index: 2;
  padding: 6px 9px;
  border: 2px solid #303826;
  border-radius: 7px;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.5px;
  color: #303826;
  background: #fffcf7;
}

.game-type {
  top: 10px;
  left: 10px;
}

.active-label,
.coming-label {
  right: 10px;
  bottom: 10px;
}

.active-label {
  background: #d9f5d5;
}

.coming-label {
  background: #ffe0b2;
}

/* CONTENT */
.game-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 9px;
  padding: 17px;
}

.game-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.game-heading h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  font-weight: 950;
}

.category-heart {
  color: #d95b7f;
  font-size: 17px;
}

.game-subtitle {
  font-size: 11px;
  font-weight: 850;
  color: var(--game-olive);
}

.game-description {
  flex: 1;
  min-height: 43px;
  margin: 0;
  font-size: 11px;
  line-height: 1.65;
  color: var(--game-muted);
}

.game-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 7px;
  border-top: 1px dashed var(--game-line);
}

.game-meta span {
  font-size: 10px;
  font-weight: 700;
  color: var(--game-ink);
}

.game-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.category-tag,
.multiplayer-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 8px;
  border-radius: 20px;
  font-size: 9px;
  font-weight: 850;
}

.category-tag {
  color: var(--game-ink);
  background: var(--bg-elevated, #eee6d7);
  text-transform: capitalize;
}

.multiplayer-tag {
  color: #166534;
  background: #dcfce7;
}

/* PLAY BUTTON */
.play-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 43px;
  padding: 11px 13px;

  border: 2px solid var(--game-line);
  border-radius: 10px;
  background: var(--game-olive);
  color: var(--color-primary, #fff);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: 150ms ease;
}

.play-button:not(:disabled):hover {
  filter: brightness(1.16);
  transform: translateY(-1px);
}

.play-button.active {
  background: var(--game-gold);
  color: #303826;
}

.play-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* EMPTY */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 240px;
  gap: 12px;
  padding: 30px;
  border: 2px dashed var(--game-line);
  border-radius: 16px;
  background: var(--game-paper);
}

.empty-symbol {
  font-size: 57px;
}

.empty-state h3 {
  margin: 0;
  font-size: 19px;
}

.empty-state p {
  max-width: 330px;
  margin: 0;
  font-size: 12px;
  color: var(--game-muted);
}

.empty-state button {
  padding: 10px 16px;
  border: 2px solid var(--game-line);
  border-radius: 10px;
  background: var(--game-olive);
  color: #fff;
  font-weight: 850;
  cursor: pointer;
}

/* FOOTER */
.library-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-top: 1px dashed var(--game-line);
  color: var(--game-muted);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.6px;
}

/* RESPONSIVE */
@container (max-width: 900px) {
  .games-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 560px) {
  .game-library {
    padding: 12px;
    gap: 15px;
  }

  .library-header {
    min-height: 140px;
    padding: 19px;
  }

  .header-decoration {
    opacity: 0.15;
    right: -10px;
  }

  .library-header h2 {
    font-size: 25px;
  }

  .library-stats {
    gap: 7px;
  }

  .stat-card {
    padding: 9px;
    gap: 6px;
    box-shadow: 2px 2px 0 var(--game-line);
  }

  .stat-icon {
    width: 30px;
    height: 30px;
    font-size: 15px;
  }

  .stat-card strong {
    font-size: 18px;
  }

  .stat-card small {
    font-size: 9px;
  }

  .games-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .game-cover {
    min-height: 115px;
  }

  .game-icon {
    font-size: 45px;
  }

  .game-content {
    padding: 11px;
  }

  .game-heading h3 {
    font-size: 14px;
  }

  .game-type {
    font-size: 7px;
    padding: 4px;
  }
}

@container (max-width: 380px) {
  .games-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .library-header h2 {
    font-size: 22px;
  }

  .library-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stat-card {
    flex-direction: column;
    text-align: center;
  }

  .stat-icon {
    display: none;
  }

  .stat-card strong {
    font-size: 19px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    animation: none !important;
  }
}
</style>
