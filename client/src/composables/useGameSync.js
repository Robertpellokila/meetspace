import { computed, onScopeDispose, ref, shallowRef, unref, watch } from 'vue'
import { ConnectionState, RoomEvent } from 'livekit-client'

const TOPIC = 'meetspace.game.v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MAX_BYTES = 24_000
const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * Host-coordinated live game state. NOT a security boundary:
 * verify actions, host identity, membership and outcomes on the server for competitive games.
 *
 * @param {{room: import('vue').Ref<any>, hostIdentity: import('vue').Ref<string>,
 *  reduceAction?: (context: {gameId:string,state:any,action:any,actor:string,participants:string[]}) => any}} options
 */
export function useGameSync({ room, hostIdentity, reduceAction } = {}) {
  const session = shallowRef(null)
  const connected = ref(false)
  const syncing = ref(false)
  const lastError = ref('')
  const participants = ref([])
  const localIdentity = ref('')
  const eventLog = ref([])
  const clockOffsetMs = ref(0)
  const isHost = computed(() => !!localIdentity.value && localIdentity.value === unref(hostIdentity))
  const gameId = computed(() => session.value?.gameId || '')
  const gameState = computed(() => session.value?.state || {})
  const gamePaused = computed(() => Boolean(session.value?.paused))
  const revision = computed(() => session.value?.revision ?? 0)
  let attached = null
  let requestedAt = 0
  let requestTimer = null
  const seen = new Set()

  function identities() {
    if (!attached) return []
    return [attached.localParticipant.identity, ...attached.remoteParticipants.keys()]
  }

  function updatePresence() {
    connected.value = attached?.state === ConnectionState.Connected
    localIdentity.value = attached?.localParticipant?.identity || ''
    participants.value = identities()
  }

  function log(message) {
    eventLog.value = [...eventLog.value.slice(-19), { at: Date.now(), message }]
  }

  async function transmit(packet, destinationIdentities = []) {
    if (!attached || !connected.value) return false
    const body = { protocol: 1, ...packet, id: randomId(), sentAt: Date.now() }
    const encoded = encoder.encode(JSON.stringify(body))
    if (encoded.byteLength > MAX_BYTES) {
      lastError.value = 'Data game terlalu besar untuk DataChannel.'
      return false
    }
    try {
      await attached.localParticipant.publishData(encoded, {
        reliable: true,
        topic: TOPIC,
        ...(destinationIdentities.length ? { destinationIdentities } : {}),
      })
      return true
    } catch (error) {
      lastError.value = error?.message || 'Gagal mengirim data game.'
      return false
    }
  }

  function snapshot() {
    if (!isHost.value || !session.value) return null
    return clone(session.value)
  }

  async function broadcastSnapshot(target = null) {
    const current = snapshot()
    if (!current) return false
    return transmit({ kind: 'snapshot', session: current }, target ? [target] : [])
  }

  // Host owns revision order. Reject packets from anyone else.
  function acceptSnapshot(incoming, sender, sentAt) {
    if (sender !== unref(hostIdentity)) return
    if (!incoming || typeof incoming !== 'object') return
    if (typeof incoming.gameId !== 'string' || typeof incoming.sessionId !== 'string') return
    if (!Number.isSafeInteger(incoming.revision) || incoming.revision < 0) return
    if (!incoming.state || typeof incoming.state !== 'object' || Array.isArray(incoming.state)) return
    const previous = session.value
    // Session ID changes on host restart/new game. Revision only orders within a session.
    if (previous?.sessionId === incoming.sessionId && incoming.revision <= previous.revision) return
    if (JSON.stringify(incoming).length > 20_000) return
    session.value = clone(incoming)
    if (Number.isFinite(sentAt)) clockOffsetMs.value = sentAt - Date.now()
    syncing.value = false
    clearTimeout(requestTimer)
    requestTimer = null
    lastError.value = ''
  }

  async function requestSnapshot() {
    if (!connected.value || isHost.value) return false
    const host = unref(hostIdentity)
    if (!host) {
      lastError.value = 'Identitas host belum tersedia.'
      return false
    }
    if (Date.now() - requestedAt < 700) return false
    requestedAt = Date.now()
    syncing.value = true
    clearTimeout(requestTimer)
    requestTimer = setTimeout(() => { syncing.value = false }, 5500)
    return transmit({ kind: 'snapshot-request' }, [host])
  }

  async function startGame(nextGameId, players = identities(), content = []) {
    if (!isHost.value || !connected.value) return false
    if (typeof nextGameId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(nextGameId)) return false
    const unique = [...new Set(players.filter(id => identities().includes(id)))]
    const next = {
      sessionId: randomId(), gameId: nextGameId, revision: 0,
      paused: false, players: unique, state: {}, content: clone(content), startedAt: Date.now(),
    }
    if (encoder.encode(JSON.stringify({ protocol: 1, kind: 'snapshot', session: next, id: randomId(), sentAt: Date.now() })).byteLength > MAX_BYTES) {
      lastError.value = 'Bank pertanyaan terlalu besar untuk sinkronisasi game.'
      return false
    }
    session.value = next
    log(`Game dimulai: ${nextGameId}`)
    await broadcastSnapshot()
    return true
  }

  async function updateHostState(nextState, { paused = session.value?.paused } = {}) {
    if (!isHost.value || !connected.value || !session.value) return false
    if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) return false
    const next = {
      ...session.value, state: clone(nextState), paused: Boolean(paused),
      revision: session.value.revision + 1,
    }
    if (JSON.stringify(next).length > 20_000) return false
    session.value = next
    return broadcastSnapshot()
  }

  async function setPaused(paused) {
    if (!isHost.value || !session.value) return false
    return updateHostState(session.value.state, { paused })
  }

  async function restartGame() {
    if (!isHost.value || !session.value) return false
    return startGame(session.value.gameId, session.value.players, session.value.content || [])
  }

  async function endGame() {
    if (!isHost.value || !connected.value) return false
    session.value = null
    await transmit({ kind: 'end-game' })
    return true
  }

  async function dispatchAction(action) {
    if (!connected.value || !session.value || session.value.paused) return false
    if (!action || typeof action !== 'object' || Array.isArray(action)) return false
    if (JSON.stringify(action).length > 4000) return false
    if (!session.value.players.includes(localIdentity.value)) return false
    if (isHost.value) return applyAction(action, localIdentity.value)
    return transmit({ kind: 'action', sessionId: session.value.sessionId, action }, [unref(hostIdentity)])
  }

  async function applyAction(action, actor) {
    if (!isHost.value || !session.value || session.value.paused) return false
    if (!session.value.players.includes(actor) || !identities().includes(actor)) return false
    if (typeof reduceAction !== 'function') {
      lastError.value = 'Reducer game belum terpasang. Langkah belum diterapkan.'
      return false
    }
    try {
      const nextState = reduceAction({
        gameId: session.value.gameId, state: clone(session.value.state), action: clone(action),
        actor, participants: [...session.value.players],
      })
      if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) return false
      return updateHostState(nextState)
    } catch (error) {
      lastError.value = error?.message || 'Aksi ditolak.'
      return false
    }
  }

  function onData(payload, participant, _kind, topic) {
    if (topic !== TOPIC || !participant || payload.byteLength > MAX_BYTES) return
    let packet
    try { packet = JSON.parse(decoder.decode(payload)) } catch { return }
    if (!packet || packet.protocol !== 1 || typeof packet.id !== 'string') return
    if (seen.has(packet.id)) return
    seen.add(packet.id)
    if (seen.size > 500) seen.clear()
    const sender = participant.identity
    if (packet.kind === 'snapshot-request') {
      if (isHost.value && identities().includes(sender)) void broadcastSnapshot(sender)
    } else if (packet.kind === 'snapshot') {
      if (!isHost.value) acceptSnapshot(packet.session, sender, packet.sentAt)
    } else if (packet.kind === 'end-game') {
      if (sender === unref(hostIdentity) && !isHost.value) {
        session.value = null
        syncing.value = false
      }
    } else if (packet.kind === 'action') {
      if (isHost.value && packet.sessionId === session.value?.sessionId) {
        void applyAction(packet.action, sender)
      }
    }
  }

  function onPresence() { updatePresence() }
  function onReconnected() {
    updatePresence()
    if (connected.value) {
      if (isHost.value) {
        if (session.value) void broadcastSnapshot()
        else void transmit({ kind: 'end-game' })
      }
      else void requestSnapshot()
    }
  }
  function onDisconnect() { updatePresence(); syncing.value = false }
  function detach() {
    if (!attached) return
    attached.off(RoomEvent.DataReceived, onData)
    attached.off(RoomEvent.ParticipantConnected, onPresence)
    attached.off(RoomEvent.ParticipantDisconnected, onPresence)
    attached.off(RoomEvent.Connected, onReconnected)
    attached.off(RoomEvent.Reconnected, onReconnected)
    attached.off(RoomEvent.ConnectionStateChanged, onReconnected)
    attached.off(RoomEvent.Disconnected, onDisconnect)
    attached = null
    connected.value = false
    localIdentity.value = ''
    participants.value = []
    clearTimeout(requestTimer)
  }
  function attach(nextRoom) {
    if (attached === nextRoom) return
    detach()
    session.value = null
    seen.clear()
    attached = nextRoom || null
    if (!attached) return
    attached.on(RoomEvent.DataReceived, onData)
    attached.on(RoomEvent.ParticipantConnected, onPresence)
    attached.on(RoomEvent.ParticipantDisconnected, onPresence)
    attached.on(RoomEvent.Connected, onReconnected)
    attached.on(RoomEvent.Reconnected, onReconnected)
    attached.on(RoomEvent.ConnectionStateChanged, onReconnected)
    attached.on(RoomEvent.Disconnected, onDisconnect)
    onReconnected()
  }

  const stopRoom = watch(() => unref(room), attach, { immediate: true })
  const stopHost = watch(() => unref(hostIdentity), () => {
    if (connected.value && !isHost.value) void requestSnapshot()
  })
  onScopeDispose(() => {
    stopRoom(); stopHost(); detach()
  })

  return {
    session, gameId, gameState, gamePaused, revision,
    connected, syncing, lastError, participants, localIdentity, isHost, eventLog, clockOffsetMs,
    startGame, dispatchAction, updateHostState, setPaused, restartGame, endGame, requestSnapshot,
  }
}
