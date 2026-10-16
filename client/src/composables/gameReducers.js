// Host-coordinated reducers for Game Night's native games.
import {
  getCoupleQuestion,
  COUPLE_QUIZ_CATEGORIES,
} from "../config/coupleQuizQuestions.js";
import { quizCommit } from "./quizCommit.js";
import {
  TOD_CATEGORIES,
  getTodCard,
  getTodCardCount,
} from "../config/truthOrDareCards.js";
import {
  WYR_CATEGORIES,
  getWyrQuestion,
} from "../config/wouldYouRatherQuestions.js";
import { memoryDifficulty, memoryDeck } from "../config/memoryMatchDeck.js";

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const copy = (x) => JSON.parse(JSON.stringify(x));

function reduceTicTacToe({ state = {}, action, actor, participants = [] }) {
  const players = participants.slice(0, 2);
  if (players.length !== 2 || !players.includes(actor))
    throw new Error("Butuh dua pemain");
  const board =
    Array.isArray(state.board) && state.board.length === 9
      ? state.board.map((value) =>
          value === "X" || value === "O" ? value : null,
        )
      : Array(9).fill(null);
  const turn = Number.isInteger(state.turn) && state.turn >= 0 ? state.turn : 0;
  const round =
    Number.isInteger(state.round) && state.round > 0 ? state.round : 1;
  const scores = {
    X: Number.isInteger(state.scores?.X) ? state.scores.X : 0,
    O: Number.isInteger(state.scores?.O) ? state.scores.O : 0,
    draws: Number.isInteger(state.scores?.draws) ? state.scores.draws : 0,
  };
  const winner =
    state.winner === "X" || state.winner === "O" ? state.winner : null;
  const draw = Boolean(state.draw);
  if (action?.type === "next-round") {
    if (!winner && !draw) throw new Error("Ronde belum selesai");
    return {
      board: Array(9).fill(null),
      turn: 0,
      winner: null,
      draw: false,
      round: round + 1,
      scores,
    };
  }
  if (
    action?.type !== "make-move" ||
    !Number.isInteger(action.position) ||
    action.position < 0 ||
    action.position > 8
  )
    throw new Error("Aksi tidak valid");
  if (winner || draw || board[action.position])
    throw new Error("Langkah tidak tersedia");
  if (actor !== players[turn % 2]) throw new Error("Belum giliranmu");
  const mark = turn % 2 === 0 ? "X" : "O";
  board[action.position] = mark;
  const nextWinner = WIN_LINES.some(
    ([a, b, c]) => board[a] === mark && board[b] === mark && board[c] === mark,
  )
    ? mark
    : null;
  const nextDraw = !nextWinner && board.every(Boolean);
  if (nextWinner) scores[nextWinner]++;
  if (nextDraw) scores.draws++;
  return {
    board,
    turn: turn + 1,
    winner: nextWinner,
    draw: nextDraw,
    round,
    scores,
  };
}

function reduceCoupleQuiz({ state = {}, action, actor, participants = [] }) {
  const players = participants.slice(0, 2);
  if (players.length !== 2 || !players.includes(actor))
    throw new Error("Couple Quiz memerlukan dua pemain");
  const categories = COUPLE_QUIZ_CATEGORIES.map((c) => c.id);
  const initial = {
    category: "romantic",
    index: 0,
    phase: "answering",
    commits: {},
    reveals: {},
    scores: { [players[0]]: 0, [players[1]]: 0 },
    history: [],
  };
  const s = Object.keys(state || {}).length ? copy(state) : initial;
  if (
    !categories.includes(s.category) ||
    !Number.isInteger(s.index) ||
    s.index < 0
  )
    throw new Error("State quiz tidak valid");
  const q = getCoupleQuestion(s.category, s.index);
  if (!q) throw new Error("Bank soal tidak tersedia");
  if (!s.scores || !s.commits || !s.reveals)
    throw new Error("State quiz rusak");
  const both = (obj) =>
    players.every((id) => Object.prototype.hasOwnProperty.call(obj, id));
  if (action?.type === "set-category") {
    if (actor !== players[0])
      throw new Error("Hanya Player 1 dapat memilih kategori");
    if (!categories.includes(action.category))
      throw new Error("Kategori tidak ditemukan");
    if (Object.keys(s.commits).length && s.phase !== "results")
      throw new Error("Selesaikan pertanyaan saat ini terlebih dahulu");
    return { ...initial, category: action.category, scores: s.scores };
  }
  if (action?.type === "commit-answer") {
    if (s.phase !== "answering") throw new Error("Bukan fase menjawab");
    if (s.commits[actor]) throw new Error("Jawaban sudah dikunci");
    if (
      action.questionId !== q.id ||
      typeof action.commit !== "string" ||
      !/^[0-9a-f]{8}$/.test(action.commit)
    )
      throw new Error("Commit tidak valid");
    s.commits[actor] = action.commit;
    if (both(s.commits)) s.phase = "revealing";
    return s;
  }
  if (action?.type === "reveal-answer") {
    if (s.phase !== "revealing")
      throw new Error("Belum waktunya membuka jawaban");
    if (s.reveals[actor]) throw new Error("Jawaban sudah dibuka");
    if (
      action.questionId !== q.id ||
      !Number.isInteger(action.answer) ||
      action.answer < 0 ||
      action.answer > 3 ||
      typeof action.nonce !== "string" ||
      action.nonce.length < 20 ||
      action.nonce.length > 100
    )
      throw new Error("Reveal tidak valid");
    if (quizCommit(q.id, action.answer, action.nonce) !== s.commits[actor])
      throw new Error("Jawaban tidak cocok dengan yang dikunci");
    s.reveals[actor] = action.answer;
    if (both(s.reveals)) {
      s.phase = "results";
      const subject = players[s.index % 2];
      const guesser = players[(s.index + 1) % 2];
      const correct = s.reveals[subject] === s.reveals[guesser];
      if (correct) s.scores[guesser] = (s.scores[guesser] || 0) + 1;
      s.history = [
        ...(s.history || []).slice(-19),
        { questionId: q.id, subject, guesser, correct },
      ];
    }
    return s;
  }
  if (action?.type === "next-question") {
    if (s.phase !== "results") throw new Error("Pertanyaan belum selesai");
    return {
      ...s,
      index: s.index + 1,
      phase: "answering",
      commits: {},
      reveals: {},
    };
  }
  throw new Error("Aksi Couple Quiz tidak dikenal");
}

/** Deterministic host-side Truth or Dare reducer. No card text submitted by clients. */
function reduceTruthOrDare({ state = {}, action, actor, participants = [] }) {
  const players = [...new Set(participants)].slice(0, 8);
  if (players.length < 2 || !players.includes(actor))
    throw new Error("Truth or Dare perlu minimal dua pemain");
  const categories = TOD_CATEGORIES.map((c) => c.id);
  const initial = {
    category: "romantic",
    turn: 0,
    phase: "choosing",
    kind: null,
    cardIndex: null,
    used: {},
    scores: Object.fromEntries(players.map((id) => [id, 0])),
    skips: Object.fromEntries(players.map((id) => [id, 0])),
    completed: 0,
    lastResult: null,
  };
  const s = Object.keys(state || {}).length ? copy(state) : initial;
  if (
    !categories.includes(s.category) ||
    !Number.isSafeInteger(s.turn) ||
    s.turn < 0 ||
    !["choosing", "challenge", "result"].includes(s.phase) ||
    !s.used ||
    !s.scores ||
    !s.skips
  )
    throw new Error("State Truth or Dare tidak valid");
  const active = players[s.turn % players.length];
  if (action?.type === "tod-set-category") {
    if (actor !== players[0])
      throw new Error("Hanya pemain pertama yang boleh mengganti kategori");
    if (s.phase === "challenge")
      throw new Error("Selesaikan kartu saat ini sebelum mengganti kategori");
    if (!categories.includes(action.category))
      throw new Error("Kategori tidak dikenal");
    return {
      ...s,
      category: action.category,
      phase: "choosing",
      kind: null,
      cardIndex: null,
      lastResult: null,
    };
  }
  if (actor !== active) throw new Error("Bukan giliranmu");
  if (action?.type === "tod-choose") {
    if (s.phase !== "choosing" || !["truth", "dare"].includes(action.kind))
      throw new Error("Pilihan tidak valid");
    const key = `${s.category}:${action.kind}`;
    const index =
      Number.isSafeInteger(s.used[key]) && s.used[key] >= 0 ? s.used[key] : 0;
    if (!getTodCard(s.category, action.kind, index))
      throw new Error("Kartu tidak tersedia");
    s.used[key] = (index + 1) % getTodCardCount(s.category, action.kind);
    s.kind = action.kind;
    s.cardIndex = index;
    s.phase = "challenge";
    s.lastResult = null;
    return s;
  }
  if (action?.type === "tod-complete" || action?.type === "tod-skip") {
    if (s.phase !== "challenge" || !getTodCard(s.category, s.kind, s.cardIndex))
      throw new Error("Tidak ada tantangan aktif");
    const completed = action.type === "tod-complete";
    if (completed) {
      s.scores[actor] = (s.scores[actor] || 0) + 1;
      s.completed += 1;
    } else s.skips[actor] = (s.skips[actor] || 0) + 1;
    s.lastResult = {
      player: actor,
      completed,
      cardId: getTodCard(s.category, s.kind, s.cardIndex).id,
    };
    s.phase = "result";
    return s;
  }
  if (action?.type === "tod-next") {
    if (s.phase !== "result") throw new Error("Kartu belum selesai");
    return {
      ...s,
      turn: s.turn + 1,
      phase: "choosing",
      kind: null,
      cardIndex: null,
      lastResult: null,
    };
  }
  throw new Error("Aksi Truth or Dare tidak dikenal");
}

export function reduceGameAction(context) {
  if (context?.gameId === "tic-tac-toe") return reduceTicTacToe(context);
  if (context?.gameId === "couple-quiz") return reduceCoupleQuiz(context);
  if (context?.gameId === "truth-or-dare") return reduceTruthOrDare(context);
  if (context?.gameId === "would-you-rather")
    return reduceWouldYouRather(context);
  if (context?.gameId === "memory-match") return reduceMemoryMatch(context);
  throw new Error(`Reducer ${context?.gameId || "unknown"} belum tersedia`);
}

/** Host-coordinated Would You Rather: commit/reveal so votes stay hidden until everyone commits. */
function reduceWouldYouRather({
  state = {},
  action,
  actor,
  participants = [],
}) {
  const players = [...new Set(participants)].slice(0, 8);
  if (players.length < 2 || !players.includes(actor))
    throw new Error("Would You Rather perlu minimal 2 pemain");
  const initial = {
    category: "romantic",
    index: 0,
    phase: "voting",
    commits: {},
    reveals: {},
    history: [],
  };
  const s = Object.keys(state || {}).length ? copy(state) : initial;
  if (
    !WYR_CATEGORIES.some((c) => c.id === s.category) ||
    !Number.isSafeInteger(s.index) ||
    s.index < 0 ||
    !["voting", "revealing", "results"].includes(s.phase) ||
    !s.commits ||
    typeof s.commits !== "object" ||
    !s.reveals ||
    typeof s.reveals !== "object"
  ) {
    throw new Error("State Would You Rather tidak valid");
  }
  const question = getWyrQuestion(s.category, s.index);
  if (!question) throw new Error("Pertanyaan tidak ditemukan");
  const both = (obj) =>
    players.every((id) => Object.prototype.hasOwnProperty.call(obj, id));
  if (action?.type === "wyr-set-category") {
    if (actor !== players[0])
      throw new Error("Hanya pemain pertama dapat mengganti kategori");
    if (s.phase !== "results" && Object.keys(s.commits).length)
      throw new Error("Selesaikan voting aktif terlebih dahulu");
    if (!WYR_CATEGORIES.some((c) => c.id === action.category))
      throw new Error("Kategori tidak valid");
    return { ...initial, category: action.category, history: s.history || [] };
  }
  if (action?.type === "wyr-commit") {
    if (s.phase !== "voting") throw new Error("Fase voting telah berakhir");
    if (Object.prototype.hasOwnProperty.call(s.commits, actor))
      throw new Error("Suara sudah dikunci");
    if (
      action.questionId !== question.id ||
      typeof action.commit !== "string" ||
      !/^[0-9a-f]{8}$/.test(action.commit)
    ) {
      throw new Error("Commit tidak valid");
    }
    s.commits[actor] = action.commit;
    if (both(s.commits)) s.phase = "revealing";
    return s;
  }
  if (action?.type === "wyr-reveal") {
    if (s.phase !== "revealing") throw new Error("Bukan fase reveal");
    if (
      !Object.prototype.hasOwnProperty.call(s.commits, actor) ||
      Object.prototype.hasOwnProperty.call(s.reveals, actor)
    )
      throw new Error("Reveal tidak diizinkan");
    if (
      action.questionId !== question.id ||
      ![0, 1].includes(action.choice) ||
      typeof action.nonce !== "string" ||
      action.nonce.length < 20 ||
      action.nonce.length > 100 ||
      quizCommit(question.id, action.choice, action.nonce) !== s.commits[actor]
    ) {
      throw new Error("Reveal tidak cocok dengan vote yang dikunci");
    }
    s.reveals[actor] = action.choice;
    if (both(s.reveals)) {
      s.phase = "results";
      s.history = [
        ...(s.history || []).slice(-19),
        {
          questionId: question.id,
          counts: [
            players.filter((id) => s.reveals[id] === 0).length,
            players.filter((id) => s.reveals[id] === 1).length,
          ],
        },
      ];
    }
    return s;
  }
  if (action?.type === "wyr-next") {
    if (s.phase !== "results") throw new Error("Belum semua peserta reveal");
    return {
      ...s,
      index: s.index + 1,
      phase: "voting",
      commits: {},
      reveals: {},
    };
  }
  throw new Error("Aksi Would You Rather tidak dikenal");
}

/** Memory Match shared state. Timer is elapsed wall-clock time (not a countdown).
 * Mismatch is resolved only by a reducer action after a host-clock deadline,
 * so late joiners see the exact same visible cards.
 */
export function reduceMemoryMatch({
  state = {},
  action,
  actor,
  participants = [],
}) {
  const players = [...new Set(participants)].slice(0, 2);
  if (players.length !== 2 || !players.includes(actor))
    throw new Error("Memory Match membutuhkan dua pemain");
  const fresh = !state || Object.keys(state).length === 0;
  const s = fresh
    ? {
        difficulty: "easy",
        seed: 1,
        deck: memoryDeck("easy", 1),
        revealed: [],
        matched: [],
        turn: 0,
        phase: "playing",
        scores: { [players[0]]: 0, [players[1]]: 0 },
        moves: 0,
        startedAt: null,
        finishedAt: null,
        resolveAt: null,
      }
    : copy(state);
  const conf = memoryDifficulty(s.difficulty);
  if (
    !conf ||
    !Array.isArray(s.deck) ||
    s.deck.length !== conf.pairs * 2 ||
    !Array.isArray(s.revealed) ||
    !Array.isArray(s.matched) ||
    !["playing", "mismatch", "finished"].includes(s.phase) ||
    !Number.isSafeInteger(s.turn) ||
    s.turn < 0 ||
    !s.scores
  )
    throw new Error("Memory Match state invalid");
  const host = players[0],
    current = players[s.turn % players.length];
  if (action?.type === "mm-set-difficulty") {
    if (actor !== host)
      throw new Error("Hanya host/pemain pertama dapat mengubah difficulty");
    const difficulty = memoryDifficulty(action.difficulty);
    const seed = action.seed;
    if (
      !difficulty ||
      !Number.isSafeInteger(seed) ||
      seed < 1 ||
      seed > 0xffffffff
    )
      throw new Error("Difficulty atau seed tidak valid");
    return {
      difficulty: difficulty.id,
      seed,
      deck: memoryDeck(difficulty.id, seed),
      revealed: [],
      matched: [],
      turn: 0,
      phase: "playing",
      scores: { [players[0]]: 0, [players[1]]: 0 },
      moves: 0,
      startedAt: null,
      finishedAt: null,
      resolveAt: null,
    };
  }
  if (action?.type === "mm-resolve") {
    if (actor !== host) throw new Error("Hanya host dapat menutup kartu yang tidak cocok");
    if (s.phase !== "mismatch" || !Number.isFinite(s.resolveAt))
      throw new Error("Tidak ada kartu untuk ditutup");
    if (Date.now() < s.resolveAt) throw new Error("Tunggu animasi selesai");
    return {
      ...s,
      revealed: [],
      phase: "playing",
      resolveAt: null,
      turn: s.turn + 1,
    };
  }
  if (action?.type !== "mm-flip")
    throw new Error("Aksi Memory Match tidak dikenal");
  if (actor !== current) throw new Error("Belum giliranmu");
  if (s.phase !== "playing")
    throw new Error("Tidak bisa membuka kartu sekarang");
  const i = action.index;
  if (
    !Number.isInteger(i) ||
    i < 0 ||
    i >= s.deck.length ||
    s.matched.includes(i) ||
    s.revealed.includes(i) ||
    s.revealed.length >= 2
  )
    throw new Error("Kartu tidak dapat dipilih");
  if (s.startedAt === null) s.startedAt = Date.now();
  s.revealed.push(i);
  if (s.revealed.length === 2) {
    s.moves++;
    const [a, b] = s.revealed;
    if (s.deck[a] === s.deck[b]) {
      s.matched.push(a, b);
      s.revealed = [];
      s.scores[actor] = (s.scores[actor] || 0) + 1;
      if (s.matched.length === s.deck.length) {
        s.phase = "finished";
        s.finishedAt = Date.now();
      }
      // Match gives the current player another attempt.
    } else {
      s.phase = "mismatch";
      s.resolveAt = Date.now() + 1200;
    }
  }
  return s;
}
