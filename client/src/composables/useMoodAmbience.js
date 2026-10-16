import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { MOOD_SOUND_CHOICES, soundForMood } from '../config/moodSounds.js'

// Ambient audio is deliberately local: it never enters the microphone or LiveKit.
export function useMoodAmbience(mood) {
  const choice = ref('mood')
  const volume = ref(35)
  const playing = ref(false)
  const currentSound = computed(() => choice.value === 'mood' ? soundForMood(mood.value) : choice.value)
  const currentLabel = computed(() => MOOD_SOUND_CHOICES.find(item => item.id === currentSound.value)?.label || 'Suara suasana')
  let context = null
  let master = null
  let sources = []
  let intervals = []
  let timeouts = []
  let generation = 0

  function clearSound() {
    intervals.forEach(clearInterval)
    intervals = []
    timeouts.forEach(clearTimeout)
    timeouts = []
    sources.forEach(source => {
      try { source.stop() } catch { /* Already stopped. */ }
      source.disconnect()
    })
    sources = []
  }

  function addNoise(color, frequency, level) {
    const seconds = 2
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate)
    const samples = buffer.getChannelData(0)
    let previous = 0
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1
      previous = (previous + white * 0.02) / 1.02
      samples[i] = color === 'brown' ? previous * 3.5 : white
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    source.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = frequency
    gain.gain.value = level
    source.connect(filter).connect(gain).connect(master)
    source.start()
    sources.push(source)
  }

  function addHum(frequency, level) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.value = level
    oscillator.connect(gain).connect(master)
    oscillator.start()
    sources.push(oscillator)
  }

  function note(frequency, duration = 0.5, type = 'sine', level = 0.08) {
    if (!context || context.state === 'closed') return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(level, now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(master)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }

  function rebuild() {
    if (!context || !master || !playing.value) return
    clearSound()
    switch (currentSound.value) {
      case 'rain':
        addNoise('white', 1600, 0.22)
        addNoise('brown', 420, 0.13)
        break
      case 'forest':
        addNoise('brown', 720, 0.26)
        intervals.push(setInterval(() => {
          note(930, 0.28, 'sine', 0.035)
          const timer = setTimeout(() => {
            timeouts = timeouts.filter(item => item !== timer)
            if (playing.value && currentSound.value === 'forest') note(1240, 0.22, 'sine', 0.025)
          }, 170)
          timeouts.push(timer)
        }, 4800))
        break
      case 'cafe':
        addNoise('brown', 580, 0.2)
        addHum(110, 0.025)
        intervals.push(setInterval(() => note(740, 0.45, 'sine', 0.02), 6600))
        break
      case 'warm':
        addNoise('brown', 330, 0.07)
        addHum(130.81, 0.016)
        intervals.push(setInterval(() => { note(261.63, 1.6, 'sine', 0.045); note(329.63, 1.6, 'sine', 0.035); note(392, 1.6, 'sine', 0.025) }, 5300))
        note(261.63, 1.6, 'sine', 0.045)
        break
      case 'cinema':
        addNoise('brown', 430, 0.21)
        addHum(55, 0.055)
        break
      case 'arcade': {
        const tones = [261.63, 329.63, 392, 329.63, 440, 392, 329.63, 293.66]
        let index = 0
        intervals.push(setInterval(() => note(tones[index++ % tones.length], 0.16, 'triangle', 0.038), 720))
        note(tones[0], 0.16, 'triangle', 0.038)
        break
      }
      default:
        addNoise('brown', 510, 0.26)
    }
  }

  async function start() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) throw new Error('Browser ini belum mendukung audio suasana.')
    const requested = ++generation
    if (!context) {
      context = new AudioContextClass()
      master = context.createGain()
      master.connect(context.destination)
    }
    await context.resume()
    if (requested !== generation) return
    master.gain.value = Number(volume.value) / 100
    playing.value = true
    rebuild()
  }

  function stop() {
    generation++
    playing.value = false
    clearSound()
    const oldContext = context
    context = null
    master = null
    if (oldContext && oldContext.state !== 'closed') void oldContext.close().catch(() => {})
  }

  async function toggle() {
    if (playing.value) { stop(); return }
    try { await start() }
    catch (error) { stop(); throw error }
  }

  function select(value) {
    if (!MOOD_SOUND_CHOICES.some(item => item.id === value)) return
    choice.value = value
  }

  function setVolume(value) {
    volume.value = Math.max(0, Math.min(100, Number(value) || 0))
    if (master && context?.state === 'running') master.gain.setTargetAtTime(volume.value / 100, context.currentTime, 0.04)
  }

  watch(currentSound, () => { if (playing.value) rebuild() })
  onBeforeUnmount(stop)
  return { choice, volume, playing, currentSound, currentLabel, toggle, select, setVolume, stop }
}
