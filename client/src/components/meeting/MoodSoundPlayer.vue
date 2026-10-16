<script setup>
import { toRef } from 'vue'
import { MOOD_SOUND_CHOICES } from '../../config/moodSounds.js'
import { useMoodAmbience } from '../../composables/useMoodAmbience.js'
import { toast } from '../../services/toast.js'

const props = defineProps({ mood: { type: String, required: true } })
const sound = useMoodAmbience(toRef(props, 'mood'))

async function toggle() {
  try { await sound.toggle() }
  catch (error) { toast.error(error) }
}
</script>

<template>
  <div class="mood-player" aria-label="Suara suasana meeting">
    <button class="play-sound" type="button" :aria-pressed="sound.playing.value" :title="`${sound.playing.value ? 'Hentikan' : 'Putar'} ${sound.currentLabel.value}`" @click="toggle">
      <span aria-hidden="true">{{ sound.playing.value ? 'Ⅱ' : '♫' }}</span>
      <span class="sound-label">{{ sound.playing.value ? sound.currentLabel.value : 'Sound' }}</span>
    </button>
    <details class="sound-options">
      <summary aria-label="Pilih suara suasana">⌄</summary>
      <div class="sound-menu">
        <strong>♫ Suara suasana</strong>
        <label>Suara
          <select :value="sound.choice.value" @change="sound.select($event.target.value)">
            <option v-for="item in MOOD_SOUND_CHOICES" :key="item.id" :value="item.id">{{ item.icon }} {{ item.label }}</option>
          </select>
        </label>
        <small v-if="sound.choice.value === 'mood'">Mood ini: {{ sound.currentLabel.value }}</small>
        <label>Volume · {{ sound.volume.value }}%
          <input type="range" min="0" max="100" :value="sound.volume.value" @input="sound.setVolume($event.target.value)" />
        </label>
        <button type="button" class="menu-play" :aria-pressed="sound.playing.value" @click="toggle">{{ sound.playing.value ? 'Ⅱ Hentikan suara' : '♫ Putar suara' }}</button>
        <small>Hanya terdengar di perangkatmu; tidak dikirim ke peserta.</small>
      </div>
    </details>
  </div>
</template>

<style scoped>
.mood-player{display:flex;align-items:stretch;position:relative;flex:none;font-size:11px;font-weight:850}
.play-sound,.sound-options summary{border:2px solid var(--ms-line);background:var(--bg-elevated);color:var(--text-primary);cursor:pointer;box-shadow:2px 3px 0 var(--ms-line)}
.play-sound{display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:10px 0 0 10px;max-width:135px}
.play-sound[aria-pressed=true]{background:var(--color-secondary);color:var(--color-primary)}
.play-sound>span:first-child{font-size:16px}.sound-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sound-options summary{list-style:none;display:grid;place-items:center;height:100%;width:28px;border-left:0;border-radius:0 10px 10px 0;font-size:16px}
.sound-options summary::-webkit-details-marker{display:none}
.sound-menu{position:absolute;right:0;top:calc(100% + 9px);z-index:50;width:min(280px,90vw);display:grid;gap:11px;padding:14px;border:2px solid var(--ms-line);border-radius:12px;background:var(--bg-surface);box-shadow:4px 5px 0 var(--ms-line)}
.sound-menu strong{font-family:var(--font-display,Georgia,serif);font-size:17px}.sound-menu label{display:grid;gap:6px;font-size:11px}.sound-menu select{width:100%;min-width:0;padding:8px;border:2px solid var(--ms-line);border-radius:7px;background:var(--bg-app);color:var(--text-primary)}.sound-menu input{width:100%;accent-color:var(--ms-line)}.sound-menu small{line-height:1.4;color:var(--text-secondary);font-size:10px}.menu-play{padding:8px;border:2px solid var(--ms-line);border-radius:8px;background:var(--bg-elevated);color:var(--text-primary);font-weight:850;cursor:pointer}
@media(max-width:700px){.sound-label{display:none}.play-sound{padding:6px 8px}.sound-options summary{width:22px}.sound-menu{right:-48px}}
</style>
