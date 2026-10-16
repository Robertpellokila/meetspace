<script setup>
defineProps({ effects: { type: Array, default: () => [] }, muted: Boolean })
const emit = defineEmits(['send', 'mute', 'enable'])
</script>
<template>
  <section class="soundboard" aria-label="Efek suara room">
    <p>Pilih efek untuk dibunyikan ke semua peserta pada momen yang tepat.</p>
    <button class="mute" :aria-pressed="muted" @click="emit('mute')">{{ muted ? '🔇 Efek dimatikan di perangkat ini' : '🔊 Efek aktif di perangkat ini' }}</button>
    <button class="mute" @click="emit('enable')">▶ Aktifkan audio efek</button>
    <div class="sound-grid"><button v-for="effect in effects" :key="effect.id" @click="emit('send', effect.id)"><span>{{ effect.icon }}</span><strong>{{ effect.name }}</strong></button></div>
    <small>Suara tambahan diatur admin. Browser mungkin meminta kamu mengaktifkan audio terlebih dahulu.</small>
  </section>
</template>
<style scoped>
.soundboard{padding:15px;display:flex;flex-direction:column;gap:13px}.soundboard p{font-size:12px;color:var(--text-secondary);margin:0}.mute,.sound-grid button{border:2px solid var(--ms-line);border-radius:11px;background:var(--bg-elevated);color:var(--text-primary);font-weight:800;cursor:pointer;padding:10px}.mute{text-align:left;font-size:12px}.sound-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sound-grid button{display:grid;place-items:center;gap:4px;min-height:74px}.sound-grid button span{font-size:23px}.sound-grid button strong{font-size:11px}.sound-grid button:disabled{opacity:.55;cursor:not-allowed}.soundboard small{color:var(--text-secondary);font-size:10px}
</style>
