import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_GAMES, getGameById, filterGames, applyGameCatalog } from '../src/config/gameCatalog.js'
import { applyGameContent } from '../src/config/gameContent.js'
import { getCoupleQuestion } from '../src/config/coupleQuizQuestions.js'
import { getTodCard, getTodCardCount } from '../src/config/truthOrDareCards.js'
import { getWyrQuestion } from '../src/config/wouldYouRatherQuestions.js'
import { reduceGameAction } from '../src/composables/gameReducers.js'
import { quizCommit } from '../src/composables/quizCommit.js'

const players = ['host-a', 'guest-b']
const play = (gameId, state, action, actor = players[0]) => reduceGameAction({ gameId, state, action, actor, participants: players })

test('catalog imports, finds each native game, and filters by category', () => {
  assert.equal(ALL_GAMES.length, 11)
  for (const id of ['couple-quiz', 'truth-or-dare', 'tic-tac-toe', 'would-you-rather', 'memory-match', 'date-bingo', 'emoji-decode', 'story-chain']) assert.equal(getGameById(id)?.status, 'available')
  for (const id of ['playpager-word-puzzle', 'playpager-reversi', 'playpager-checkers']) {
    const game = getGameById(id)
    assert.equal(game?.status, 'available')
    assert.equal(game?.embedAllowed, true)
    assert.equal(new URL(game.embedUrl).hostname, game.allowedEmbedHosts[0])
    assert.equal(game.sharedScreenOnly, true)
  }
  assert.ok(filterGames({ category: 'romantic' }).length >= 2)
})

test('admin catalog status and external games update the existing library functions', () => {
  applyGameCatalog([
    { id: 'couple-quiz', status: 'disabled', component: 'Untrusted' },
    { id: 'external-new', custom: true, type: 'external', status: 'available', title: 'Web game', subtitle: 'Browser', description: '', category: 'fun', tags: ['browser'], minPlayers: 1, maxPlayers: 8, url: 'https://game.meetspace.test/' },
  ])
  assert.equal(getGameById('couple-quiz').status, 'disabled')
  assert.equal(getGameById('couple-quiz').component, 'CoupleQuiz')
  assert.equal(getGameById('external-new').title, 'Web game')
  assert.ok(filterGames({ category: 'fun' }).some(item => item.id === 'external-new'))
  applyGameCatalog([])
})

test('admin question overrides add, hide and restore content in the live getters', () => {
  const original = getCoupleQuestion('romantic', 0)
  applyGameContent([{ id: original.id, gameId: 'couple-quiz', category: 'romantic', text: 'Pertanyaan baru dari admin?', options: ['A', 'B', 'C', 'D'], enabled: true }])
  assert.equal(getCoupleQuestion('romantic', 0).text, 'Pertanyaan baru dari admin?')
  applyGameContent([{ id: original.id, gameId: 'couple-quiz', category: 'romantic', enabled: false }])
  assert.notEqual(getCoupleQuestion('romantic', 0).id, original.id)
  applyGameContent([
    { id: 'custom-123', gameId: 'truth-or-dare', category: 'romantic', kind: 'truth', text: 'Apa pengalaman yang paling lucu?', enabled: true },
    { id: 'custom-456', gameId: 'would-you-rather', category: 'romantic', text: 'Pilih mana?', options: ['A', 'B'], enabled: true },
  ])
  assert.equal(getTodCardCount('romantic', 'truth'), 9)
  assert.equal(getTodCard('romantic', 'truth', 8).id, 'custom-123')
  assert.equal(getWyrQuestion('romantic', 10).id, 'custom-456')
  applyGameContent([])
  assert.equal(getCoupleQuestion('romantic', 0).id, original.id)
})

test('the existing native reducers can advance a legal round', () => {
  let state = play('tic-tac-toe', {}, { type: 'make-move', position: 0 })
  assert.equal(state.board[0], 'X')
  assert.throws(() => play('tic-tac-toe', state, { type: 'make-move', position: 1 }), /giliranmu/)

  state = play('truth-or-dare', {}, { type: 'tod-choose', kind: 'truth' })
  assert.equal(state.phase, 'challenge')
  state = play('truth-or-dare', state, { type: 'tod-complete' })
  assert.equal(state.scores[players[0]], 1)

  const couple = getCoupleQuestion('romantic', 0)
  const nonceA = 'a'.repeat(24), nonceB = 'b'.repeat(24)
  state = play('couple-quiz', {}, { type: 'commit-answer', questionId: couple.id, commit: quizCommit(couple.id, 0, nonceA) })
  state = play('couple-quiz', state, { type: 'commit-answer', questionId: couple.id, commit: quizCommit(couple.id, 0, nonceB) }, players[1])
  assert.equal(state.phase, 'revealing')
  state = play('couple-quiz', state, { type: 'reveal-answer', questionId: couple.id, answer: 0, nonce: nonceA })
  state = play('couple-quiz', state, { type: 'reveal-answer', questionId: couple.id, answer: 0, nonce: nonceB }, players[1])
  assert.equal(state.phase, 'results')

  const wyr = getWyrQuestion('romantic', 0)
  state = play('would-you-rather', {}, { type: 'wyr-commit', questionId: wyr.id, commit: quizCommit(wyr.id, 0, nonceA) })
  state = play('would-you-rather', state, { type: 'wyr-commit', questionId: wyr.id, commit: quizCommit(wyr.id, 1, nonceB) }, players[1])
  assert.equal(state.phase, 'revealing')
  state = play('would-you-rather', state, { type: 'wyr-reveal', questionId: wyr.id, choice: 0, nonce: nonceA })
  state = play('would-you-rather', state, { type: 'wyr-reveal', questionId: wyr.id, choice: 1, nonce: nonceB }, players[1])
  assert.equal(state.phase, 'results')

  state = play('memory-match', {}, { type: 'mm-set-difficulty', difficulty: 'easy', seed: 12 })
  assert.ok(state.deck.length > 0)
  state = play('memory-match', state, { type: 'mm-flip', index: 0 })
  assert.equal(state.revealed.length, 1)
})

test('couple mini-games share valid turns and reject moves from the wrong player', () => {
  let state = play('date-bingo', {}, { type: 'bingo-toggle', index: 0 })
  assert.equal(state.marked[0], players[0])
  assert.throws(() => play('date-bingo', state, { type: 'bingo-toggle', index: 0 }, players[1]), /pasanganmu/)
  state = play('date-bingo', state, { type: 'bingo-new' })
  assert.deepEqual(state.marked, {})

  state = play('emoji-decode', {}, { type: 'emoji-guess', choice: 1 })
  assert.equal(state.phase, 'guessing')
  assert.throws(() => play('emoji-decode', state, { type: 'emoji-guess', choice: 0 }), /tidak tersedia/)
  state = play('emoji-decode', state, { type: 'emoji-guess', choice: 0 }, players[1])
  assert.equal(state.phase, 'results')
  assert.equal(state.scores[players[1]], 1)
  state = play('emoji-decode', state, { type: 'emoji-next' })
  assert.equal(state.index, 1)

  state = play('story-chain', {}, { type: 'story-add', text: 'Kami menemukan sebuah peta.' })
  assert.throws(() => play('story-chain', state, { type: 'story-add', text: 'Lanjut.' }), /giliranmu/)
  state = play('story-chain', state, { type: 'story-add', text: 'Lalu kami berangkat bersama.' }, players[1])
  assert.equal(state.lines.length, 2)
  assert.throws(() => play('story-chain', state, { type: 'story-add', text: 'x'.repeat(121) }), /120 karakter/)
})
