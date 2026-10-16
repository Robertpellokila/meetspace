<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'
import { roomModes } from '../../config/roomModes.js'

const items = ref([])
const loading = ref(false)
const busy = ref(false)
const deleting = ref('')
const form = ref({ id: '', name: '', mode: 'watchParty', url: '', enabled: true })
const sorted = computed(() => [...items.value].sort((a, b) => a.mode.localeCompare(b.mode) || a.name.localeCompare(b.name)))
function reset() { form.value = { id: '', name: '', mode: 'watchParty', url: '', enabled: true } }
function edit(item) { form.value = { id: item.id, name: item.name, mode: item.mode, url: item.url, enabled: item.enabled }; deleting.value = '' }
async function load() {
  loading.value = true
  try { items.value = (await api.get('/sound-effects/admin')).data.data || [] }
  catch (error) { toast.error(error) }
  finally { loading.value = false }
}
async function save() {
  if (busy.value) return
  busy.value = true
  const { id, ...payload } = form.value
  try {
    if (id) await api.patch(`/sound-effects/${id}`, payload)
    else await api.post('/sound-effects', payload)
    toast.success(id ? 'Efek suara diperbarui.' : 'Efek suara ditambahkan.')
    reset()
    await load()
  } catch (error) { toast.error(error) }
  finally { busy.value = false }
}
async function remove(item) {
  if (deleting.value !== item.id) { deleting.value = item.id; return }
  busy.value = true
  try {
    await api.delete(`/sound-effects/${item.id}`)
    toast.success('Efek suara dihapus.')
    if (form.value.id === item.id) reset()
    deleting.value = ''
    await load()
  } catch (error) { toast.error(error) }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section class="ms-card sound-admin">
    <header><div><h2>Sound effects setiap mode</h2><p>Tambahkan file audio HTTPS yang boleh dibunyikan peserta. Preset bawaan tetap tersedia.</p></div><button class="ms-button ms-button-outline" :disabled="loading" @click="load">{{ loading ? 'Memuat…' : 'Refresh ↻' }}</button></header>
    <form class="sound-form" @submit.prevent="save">
      <label>Nama efek<input v-model.trim="form.name" class="ms-input" maxlength="60" required placeholder="Contoh: Tepuk tangan" /></label>
      <label>Room mode<select v-model="form.mode" class="ms-input"><option v-for="(mode,id) in roomModes" :key="id" :value="id">{{ mode.name }}</option></select></label>
      <label class="wide">URL file audio HTTPS<input v-model.trim="form.url" class="ms-input" type="url" required placeholder="https://cdn.domain-anda.id/applause.mp3" /></label>
      <audio v-if="form.url" class="preview" :src="form.url" controls preload="none">Browser tidak mendukung audio ini.</audio>
      <label class="check"><input v-model="form.enabled" type="checkbox" /> Aktif</label>
      <div class="actions"><button class="ms-button ms-button-primary" :disabled="busy">{{ busy ? 'Menyimpan…' : form.id ? 'Simpan perubahan' : 'Tambah efek' }}</button><button v-if="form.id" class="ms-button ms-button-outline" type="button" @click="reset">Batal edit</button></div>
    </form>
    <p class="hint">Format: MP3, WAV, OGG, atau M4A. Gunakan hosting yang kamu kendalikan; browser setiap peserta akan mengunduh file dari URL ini. Suara diputar maksimal 8 detik.</p>
    <div class="sound-list"><article v-for="item in sorted" :key="item.id"><div><strong>♫ {{ item.name }}</strong><small>{{ roomModes[item.mode]?.name || item.mode }} · {{ item.enabled ? 'Aktif' : 'Nonaktif' }}</small><a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a></div><div><button class="ms-button ms-button-outline" :disabled="busy" @click="edit(item)">Edit</button><button class="ms-button ms-button-pink" :disabled="busy" @click="remove(item)">{{ deleting === item.id ? 'Yakin hapus?' : 'Hapus' }}</button></div></article><p v-if="!sorted.length">{{ loading ? 'Memuat suara…' : 'Belum ada efek suara tambahan.' }}</p></div>
  </section>
</template>
<style scoped>
.sound-admin{padding:28px}.sound-admin header{display:flex;justify-content:space-between;align-items:start;gap:15px}.sound-admin h2{margin:0 0 8px}.sound-admin p{color:var(--text-secondary);font-size:12px}.sound-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0 6px}.sound-form label{display:flex;flex-direction:column;gap:7px;font-weight:900;font-size:12px}.sound-form .wide{grid-column:1/-1}.sound-form .preview{grid-column:1/-1;width:min(100%,380px);height:38px}.sound-form .check{flex-direction:row;align-items:center}.sound-form .actions{display:flex;justify-content:end;gap:8px}.sound-list{margin-top:20px}.sound-list article{display:flex;justify-content:space-between;gap:15px;padding:13px 0;border-top:1px dashed var(--border-color)}.sound-list article>div:first-child{min-width:0;display:grid;gap:5px}.sound-list strong{font-size:13px}.sound-list small,.sound-list a{font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sound-list article>div:last-child{display:flex;gap:7px;align-items:center}.sound-list .ms-button{font-size:11px;padding:7px 10px}@media(max-width:650px){.sound-form{grid-template-columns:1fr}.sound-form .wide,.sound-form .preview{grid-column:auto}.sound-list article,.sound-admin header{flex-direction:column}}
</style>
