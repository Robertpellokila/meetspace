import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { effectScope, nextTick, ref } from 'vue'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useGameSync } from '../src/composables/useGameSync.js'
import { reduceGameAction } from '../src/composables/gameReducers.js'

function linkedRooms() {
  const all = new Map()
  function add(identity) {
    const room = new EventEmitter()
    room.state = ConnectionState.Connected
    room.remoteParticipants = new Map()
    room.localParticipant = {
      identity,
      publishData: async (data, options) => {
        for (const [otherId, other] of all) {
          if (otherId !== identity && (!options.destinationIdentities?.length || options.destinationIdentities.includes(otherId))) {
            other.emit(RoomEvent.DataReceived, data, { identity }, undefined, options.topic)
          }
        }
      },
    }
    for (const [otherId, other] of all) {
      room.remoteParticipants.set(otherId, { identity: otherId })
      other.remoteParticipants.set(identity, { identity })
      other.emit(RoomEvent.ParticipantConnected, { identity })
    }
    all.set(identity, room)
    return room
  }
  return add
}
const flush = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }

test('host starts, guests receive snapshots, actions and pause stay shared', async () => {
  const add = linkedRooms()
  const hostRoom = add('host-a')
  const guestRoom = add('guest-b')
  const hostId = ref('host-a')
  const hostScope = effectScope(), guestScope = effectScope()
  const host = hostScope.run(() => useGameSync({ room: ref(hostRoom), hostIdentity: hostId, reduceAction: reduceGameAction }))
  const guest = guestScope.run(() => useGameSync({ room: ref(guestRoom), hostIdentity: hostId, reduceAction: reduceGameAction }))
  try {
    assert.equal(host.isHost.value, true)
    assert.equal(guest.isHost.value, false)
    assert.equal(await host.startGame('tic-tac-toe', host.participants.value), true)
    await flush()
    assert.equal(guest.gameId.value, 'tic-tac-toe')
    assert.deepEqual(guest.session.value.players, ['host-a', 'guest-b'])
    assert.equal(await guest.dispatchAction({ type: 'make-move', position: 1 }), true)
    await flush()
    assert.equal(host.gameState.value.board, undefined) // host plays X first
    assert.equal(await host.dispatchAction({ type: 'make-move', position: 0 }), true)
    await flush()
    assert.equal(guest.gameState.value.board[0], 'X')
    assert.equal(await guest.dispatchAction({ type: 'make-move', position: 1 }), true)
    await flush()
    assert.equal(host.gameState.value.board[1], 'O')
    assert.equal(guest.gameState.value.board[1], 'O')
    await host.setPaused(true)
    await flush()
    assert.equal(guest.gamePaused.value, true)
    assert.equal(await guest.dispatchAction({ type: 'make-move', position: 2 }), false)
    await host.setPaused(false)
    await flush()
    assert.equal(guest.gamePaused.value, false)
    await host.endGame()
    await flush()
    assert.equal(guest.session.value, null)
  } finally { hostScope.stop(); guestScope.stop() }
})

test('late participant requests the current game state from the host', async () => {
  const add = linkedRooms()
  const hostRoom = add('host-a')
  const hostId = ref('host-a')
  const hostScope = effectScope(), guestScope = effectScope()
  const host = hostScope.run(() => useGameSync({ room: ref(hostRoom), hostIdentity: hostId, reduceAction: reduceGameAction }))
  try {
    add('guest-b')
    await host.startGame('tic-tac-toe', host.participants.value)
    await host.dispatchAction({ type: 'make-move', position: 4 })
    const guestRoom = add('guest-c')
    const guest = guestScope.run(() => useGameSync({ room: ref(guestRoom), hostIdentity: hostId, reduceAction: reduceGameAction }))
    await flush()
    assert.equal(guest.gameState.value.board[4], 'X')
    assert.equal(guest.session.value.players.includes('guest-c'), false)
  } finally { hostScope.stop(); guestScope.stop() }
})

test('Watch Party shares host video, play/pause/seek and restores playback for a late guest', async () => {
  const add = linkedRooms()
  const hostRoom = add('host-a')
  const guestRoom = add('guest-b')
  const hostId = ref('host-a')
  const hostScope = effectScope(), guestScope = effectScope(), lateScope = effectScope()
  const host = hostScope.run(() => useGameSync({ room: ref(hostRoom), hostIdentity: hostId }))
  const guest = guestScope.run(() => useGameSync({ room: ref(guestRoom), hostIdentity: hostId }))
  try {
    assert.equal(await host.startGame('watch-party', host.participants.value), true)
    await host.updateHostState({ url: 'https://media.meetspace.test/film.mp4', position: 0, playing: true, updatedAt: Date.now() })
    await flush()
    assert.equal(guest.gameState.value.url, 'https://media.meetspace.test/film.mp4')
    assert.equal(guest.gameState.value.playing, true)
    await host.updateHostState({ ...host.gameState.value, position: 120, playing: false, updatedAt: Date.now() })
    await flush()
    assert.equal(guest.gameState.value.position, 120)
    assert.equal(guest.gameState.value.playing, false)
    const lateRoom = add('guest-c')
    const late = lateScope.run(() => useGameSync({ room: ref(lateRoom), hostIdentity: hostId }))
    await flush()
    assert.equal(late.gameState.value.position, 120)
    assert.equal(late.gameState.value.url, guest.gameState.value.url)
  } finally { hostScope.stop(); guestScope.stop(); lateScope.stop() }
})
