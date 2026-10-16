import { computed, onScopeDispose, ref, unref, watch } from 'vue'
import { RoomEvent } from 'livekit-client'
import api from '../services/api.js'
import { toast } from '../services/toast.js'
import { roomSoundEffects } from '../config/roomSoundEffects.js'

const TOPIC = 'meetspace.sound.v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const COOLDOWN = 1600

export function useRoomSoundEffects(room, mode) {
  const custom = ref([])
  const muted = ref(false)
  const effects = computed(() => roomSoundEffects(unref(mode), custom.value))
  let attached = null
  let audioContext = null
  let currentAudio = null
  let lastSent = 0
  const lastReceived = new Map()

  async function enable() {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
      await audioContext.resume()
      return true
    } catch { return false }
  }

  async function load() {
    try { custom.value = (await api.get('/sound-effects')).data.data || [] }
    catch { custom.value = [] } // Preset bawaan tetap tersedia saat katalog offline.
  }

  function tone(frequency, at, duration, type = 'sine') {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.02)
  }

  async function play(effect) {
    if (muted.value || !effect) return
    if (effect.url) {
      try {
        currentAudio?.pause()
        currentAudio = new Audio(effect.url)
        currentAudio.volume = 0.45
        await currentAudio.play()
        const playing = currentAudio
        setTimeout(() => { if (currentAudio === playing) playing.pause() }, 8000)
      } catch { /* Browser may require a user gesture or the URL may be unavailable. */ }
      return
    }
    try {
      if (!await enable()) return
      const at = audioContext.currentTime
      const notes = effect.tone === 'buzzer' ? [[210, 0], [175, 0.15]]
        : effect.tone === 'gasp' ? [[310, 0], [470, 0.12], [620, 0.24]]
          : effect.tone === 'applause' ? [[540, 0], [660, 0.11], [790, 0.22], [990, 0.34]]
            : [[520, 0], [780, 0.16], [1040, 0.32]]
      notes.forEach(([frequency, delay]) => tone(frequency, at + delay, effect.tone === 'buzzer' ? 0.13 : 0.21, effect.tone === 'buzzer' ? 'square' : 'sine'))
    } catch { /* Audio may be blocked until the participant interacts with the page. */ }
  }

  function onData(payload, participant, _kind, topic) {
    if (topic !== TOPIC || !participant || payload.byteLength > 256) return
    let packet
    try { packet = JSON.parse(decoder.decode(payload)) } catch { return }
    if (packet?.v !== 1 || typeof packet.id !== 'string') return
    const effect = effects.value.find((item) => item.id === packet.id)
    if (!effect || Date.now() - (lastReceived.get(participant.identity) || 0) < COOLDOWN) return
    lastReceived.set(participant.identity, Date.now())
    void play(effect)
  }

  function attach(next) {
    if (attached === next) return
    attached?.off(RoomEvent.DataReceived, onData)
    attached = next || null
    attached?.on(RoomEvent.DataReceived, onData)
  }

  async function send(id) {
    const effect = effects.value.find((item) => item.id === id)
    if (!effect || !attached || Date.now() - lastSent < COOLDOWN) return
    lastSent = Date.now()
    void play(effect)
    try { await attached.localParticipant.publishData(encoder.encode(JSON.stringify({ v: 1, id })), { reliable: true, topic: TOPIC }) }
    catch { toast.error('Efek suara belum terkirim. Periksa koneksi meeting.') }
  }

  watch(room, attach, { immediate: true })
  void load()
  onScopeDispose(() => {
    attach(null)
    currentAudio?.pause()
    void audioContext?.close()
  })
  return { effects, muted, send, enable, reload: load }
}
