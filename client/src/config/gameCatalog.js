import { reactive } from 'vue'

/**
 * MeetSpace Game Catalog
 *
 * type:
 *  - native   : Game Vue buatan MeetSpace
 *  - embedded : Game dari website eksternal
 *  - external : Game dibuka pada tab baru
 *
 * status:
 *  - available
 *  - coming-soon
 *  - disabled
 */

export const GAME_TYPES = {
  NATIVE: "native",
  EMBEDDED: "embedded",
  EXTERNAL: "external",
};

export const GAME_STATUS = {
  AVAILABLE: "available",
  COMING_SOON: "coming-soon",
  DISABLED: "disabled",
};

export const EXTERNAL_GAME_CATALOG = [
  {
    id: "playpager-word-puzzle",
    title: "Find the Word",
    subtitle: "Solve the word puzzle together",
    description: "Cari kata sambil berdiskusi. Host memainkan satu layar dan membagikan tab ke pasangan.",
    type: GAME_TYPES.EMBEDDED,
    category: "coop",
    tags: ["browser", "words", "couple"],
    icon: "🔤",
    coverGradient: "linear-gradient(135deg, #d9eee2, #f9e9b7)",
    minPlayers: 2,
    maxPlayers: 8,
    duration: "5–10 min",
    status: GAME_STATUS.AVAILABLE,
    embedUrl: "https://playpager.com/embed/wordpuzzle/index.html",
    url: "https://playpager.com/find-word-puzzle/",
    embedAllowed: true,
    allowedEmbedHosts: ["playpager.com"],
    allowedExternalHosts: ["playpager.com"],
    sharedScreenOnly: true,
    features: { multiplayer: false, turnBased: false, scoring: false, restart: true },
  },
  {
    id: "playpager-reversi",
    title: "Reversi Date",
    subtitle: "Take turns and outsmart each other",
    description: "Main bergantian di papan yang sama. Host bagikan tab; kontrol game eksternal tidak tersinkron otomatis.",
    type: GAME_TYPES.EMBEDDED,
    category: "competitive",
    tags: ["browser", "strategy", "couple"],
    icon: "⚫",
    coverGradient: "linear-gradient(135deg, #e6d4ae, #c5d8bc)",
    minPlayers: 2,
    maxPlayers: 2,
    duration: "10–20 min",
    status: GAME_STATUS.AVAILABLE,
    embedUrl: "https://playpager.com/embed/reversi/index.html",
    url: "https://playpager.com/othello-reversi/",
    embedAllowed: true,
    allowedEmbedHosts: ["playpager.com"],
    allowedExternalHosts: ["playpager.com"],
    sharedScreenOnly: true,
    features: { multiplayer: false, turnBased: true, scoring: false, restart: true },
  },
  {
    id: "playpager-checkers",
    title: "Checkers for Two",
    subtitle: "A cozy strategy duel",
    description: "Bermain berdua pada satu papan. Host bagikan tab agar peserta lain bisa mengikuti.",
    type: GAME_TYPES.EMBEDDED,
    category: "competitive",
    tags: ["browser", "strategy", "couple"],
    icon: "♟️",
    coverGradient: "linear-gradient(135deg, #f1d5b1, #e9b3af)",
    minPlayers: 2,
    maxPlayers: 2,
    duration: "10–20 min",
    status: GAME_STATUS.AVAILABLE,
    embedUrl: "https://playpager.com/embed/checkers/index.html",
    url: "https://playpager.com/checkers-online/",
    embedAllowed: true,
    allowedEmbedHosts: ["playpager.com"],
    allowedExternalHosts: ["playpager.com"],
    sharedScreenOnly: true,
    features: { multiplayer: false, turnBased: true, scoring: false, restart: true },
  },
];
export const GAME_CATEGORIES = [
  {
    id: "all",
    name: "All Games",
    icon: "🎮",
  },
  {
    id: "romantic",
    name: "Romantic",
    icon: "💕",
  },
  {
    id: "fun",
    name: "Fun",
    icon: "🎉",
  },
  {
    id: "competitive",
    name: "Competitive",
    icon: "🏆",
  },
  {
    id: "coop",
    name: "Co-op",
    icon: "🤝",
  },
];

export const GAME_CATALOG = [
  {
    id: "couple-quiz",
    title: "Couple Quiz",
    subtitle: "How well do you know each other?",
    description:
      "Jawab pertanyaan seru dan temukan seberapa baik kalian saling mengenal.",

    type: GAME_TYPES.NATIVE,
    component: "CoupleQuiz",

    category: "romantic",
    tags: ["couple", "quiz", "romantic"],

    icon: "💕",
    coverGradient: "linear-gradient(135deg, #FBCFE8, #FDA4AF)",

    minPlayers: 2,
    maxPlayers: 2,
    duration: "5–15 min",

    status: GAME_STATUS.AVAILABLE,

    features: {
      multiplayer: true,
      turnBased: true,
      scoring: true,
      restart: true,
    },
  },

  {
    id: "truth-or-dare",
    title: "Truth or Dare",
    subtitle: "Questions, dares, and surprises",
    description:
      "Pilih Truth atau Dare dan dapatkan tantangan seru bersama pasangan.",

    type: GAME_TYPES.NATIVE,
    component: "TruthOrDare",

    category: "romantic",
    tags: ["couple", "questions", "party"],

    icon: "💌",
    coverGradient: "linear-gradient(135deg, #FDE68A, #FDBA74)",

    minPlayers: 2,
    maxPlayers: 8,
    duration: "10–30 min",

    status: GAME_STATUS.AVAILABLE,

    features: {
      multiplayer: true,
      turnBased: true,
      scoring: false,
      restart: true,
    },
  },

  {
    id: "tic-tac-toe",
    title: "Tic Tac Toe",
    subtitle: "Classic X versus O",
    description: "Tantang pasanganmu dalam permainan strategi klasik.",

    type: GAME_TYPES.NATIVE,
    component: "TicTacToe",

    category: "competitive",
    tags: ["strategy", "classic", "quick"],

    icon: "⭕",
    coverGradient: "linear-gradient(135deg, #BFDBFE, #C4B5FD)",

    minPlayers: 2,
    maxPlayers: 2,
    duration: "2–5 min",

    status: GAME_STATUS.AVAILABLE,

    features: {
      multiplayer: true,
      turnBased: true,
      scoring: true,
      restart: true,
    },
  },

  {
    id: "would-you-rather",
    title: "Would You Rather?",
    subtitle: "Choose between two possibilities",
    description:
      "Pilih salah satu dari dua pilihan menarik dan diskusikan alasannya.",

    type: GAME_TYPES.NATIVE,
    component: "WouldYouRather",

    category: "fun",
    tags: ["questions", "couple", "conversation"],

    icon: "🤔",
    coverGradient: "linear-gradient(135deg, #BBF7D0, #A7F3D0)",

    minPlayers: 2,
    maxPlayers: 8,
    duration: "5–15 min",

    status: GAME_STATUS.AVAILABLE,

    features: {
      multiplayer: true,
      turnBased: false,
      scoring: false,
      restart: true,
    },
  },

  {
    id: "memory-match",
    title: "Memory Match",
    subtitle: "Find matching cards",
    description: "Uji ingatanmu dengan mencari pasangan kartu tersembunyi.",

    type: GAME_TYPES.NATIVE,
    component: "MemoryMatch",

    category: "coop",
    tags: ["memory", "puzzle", "cards"],

    icon: "🧩",
    coverGradient: "linear-gradient(135deg, #DDD6FE, #FBCFE8)",

    minPlayers: 2,
    maxPlayers: 2,
    duration: "5–10 min",

    status: GAME_STATUS.AVAILABLE,

    features: {
      multiplayer: true,
      turnBased: true,
      scoring: true,
      restart: true,
    },
  },
];

/**
 * Katalog game eksternal.
 *
 * Tambahkan hanya URL yang:
 * 1. Sudah diverifikasi aman.
 * 2. Diizinkan oleh penyedia untuk di-embed.
 * 3. Memiliki izin penggunaan yang sesuai.
 *
 * Membuka iframe yang sama di dua browser
 * tidak otomatis membuat game menjadi multiplayer.
 */

/**
 * Semua game digabungkan untuk Game Library.
 */
export const ALL_GAMES = reactive([...GAME_CATALOG, ...EXTERNAL_GAME_CATALOG]);

export function applyGameCatalog(overrides) {
  if (!Array.isArray(overrides)) return
  const base = [...GAME_CATALOG, ...EXTERNAL_GAME_CATALOG]
  const byId = new Map(overrides.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
  const merged = base.map(game => {
    const change = byId.get(game.id)
    return change ? { ...game, ...change, ...(game.type === GAME_TYPES.NATIVE ? { type: GAME_TYPES.NATIVE, component: game.component } : {}) } : game
  })
  const builtins = new Set(base.map(game => game.id))
  merged.push(...overrides.filter(item => item?.custom === true && !builtins.has(item.id)))
  ALL_GAMES.splice(0, ALL_GAMES.length, ...merged)
}

/**
 * Mengambil game berdasarkan ID.
 */
export function getGameById(gameId) {
  return ALL_GAMES.find((game) => game.id === gameId) ?? null;
}

/**
 * Mengambil game sesuai kategori.
 */
export function getGamesByCategory(category = "all") {
  if (category === "all") {
    return ALL_GAMES;
  }

  return ALL_GAMES.filter((game) => game.category === category);
}

/**
 * Mencari game berdasarkan teks.
 */
export function searchGames(query = "") {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return ALL_GAMES;
  }

  return ALL_GAMES.filter((game) => {
    const searchableText = [
      game.title,
      game.subtitle,
      game.description,
      game.category,
      ...(game.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(keyword);
  });
}

/**
 * Mengambil game berdasarkan kategori + pencarian.
 */
export function filterGames({
  category = "all",
  search = "",
  status = "all",
} = {}) {
  const keyword = search.trim().toLowerCase();

  return ALL_GAMES.filter((game) => {
    const categoryMatch = category === "all" || game.category === category;

    const statusMatch = status === "all" || game.status === status;

    const searchMatch =
      !keyword ||
      [game.title, game.subtitle, game.description, ...(game.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    return categoryMatch && statusMatch && searchMatch;
  });
}
