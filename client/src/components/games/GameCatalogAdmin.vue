<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'
import { ALL_GAMES, GAME_CATEGORIES, GAME_STATUS, applyGameCatalog } from '../../config/gameCatalog.js'

const loading = ref(false), saving = ref(''), editingId = ref(''), confirmId = ref('')
const games = computed(() => ALL_GAMES)
const native = computed(() => games.value.filter(game => game.type === 'native'))
const external = computed(() => games.value.filter(game => game.type !== 'native'))
const empty = () => ({ title: '', subtitle: '', description: '', category: 'fun', status: 'coming-soon', type: 'external', url: '', minPlayers: 1, maxPlayers: 8 })
const draft = ref(empty())
const valid = computed(() => draft.value.title.trim().length > 0 && draft.value.title.trim().length <= 80 && /^https:\/\//i.test(draft.value.url) && Number(draft.value.minPlayers) >= 1 && Number(draft.value.maxPlayers) >= Number(draft.value.minPlayers))

async function load() {
  loading.value = true
  try { applyGameCatalog((await api.get('/game-catalog')).data.data) }
  catch (error) { toast.error(error) }
  finally { loading.value = false }
}
async function setStatus(item, status) {
  if (saving.value) return
  saving.value = item.id
  try { await api.patch(`/game-catalog/${item.id}`, { status }); await load(); toast.success('Status game diperbarui.') }
  catch (error) { toast.error(error) }
  finally { saving.value = '' }
}
function edit(item) {
  editingId.value = item.id
  confirmId.value = ''
  draft.value = { title: item.title, subtitle: item.subtitle || '', description: item.description || '', category: item.category, status: item.status, type: item.type, url: item.type === 'embedded' ? (item.embedUrl || item.url || '') : (item.url || ''), minPlayers: item.minPlayers || 1, maxPlayers: item.maxPlayers || 8 }
}
function reset() { editingId.value = ''; confirmId.value = ''; draft.value = empty() }
async function save() {
  if (!valid.value || saving.value) return
  saving.value = editingId.value || 'new'
  try {
    const body = { ...draft.value, title: draft.value.title.trim(), subtitle: draft.value.subtitle.trim(), description: draft.value.description.trim(), minPlayers: Number(draft.value.minPlayers), maxPlayers: Number(draft.value.maxPlayers) }
    if (editingId.value) await api.patch(`/game-catalog/${editingId.value}`, body)
    else await api.post('/game-catalog', body)
    toast.success(editingId.value ? 'Game eksternal diperbarui.' : 'Game eksternal ditambahkan.')
    reset(); await load()
  } catch (error) { toast.error(error) }
  finally { saving.value = '' }
}
async function remove(item) {
  if (confirmId.value !== item.id) { confirmId.value = item.id; return }
  saving.value = item.id
  try { await api.delete(`/game-catalog/${item.id}`); if (editingId.value === item.id) reset(); await load(); toast.success('Game eksternal dihapus.') }
  catch (error) { toast.error(error) }
  finally { saving.value = ''; confirmId.value = '' }
}
onMounted(load)
</script>

<template>
  <section class="catalog-admin ms-card" aria-label="Kelola katalog Game Night">
    <header class="catalog-head"><div><span class="eyebrow">✦ GAME NIGHT / LIBRARY DESK</span><h2>Katalog permainan.</h2><p>Atur game native yang tersedia, lalu tambahkan game web yang boleh dibuka peserta.</p></div><button type="button" class="ms-button ms-button-outline" :disabled="loading" @click="load">{{ loading ? 'Memuat…' : 'Segarkan ↻' }}</button></header>
    <div class="catalog-grid"><div><h3>Game MeetSpace</h3><p class="subcopy">Komponen native tetap memakai kode yang sudah ada. Admin mengatur visibilitasnya.</p><article v-for="item in native" :key="item.id" class="catalog-item"><div class="catalog-icon">{{ item.icon }}</div><div><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></div><select class="ms-input" :value="item.status" :disabled="Boolean(saving)" :aria-label="`Status ${item.title}`" @change="setStatus(item,$event.target.value)"><option v-for="status in Object.values(GAME_STATUS)" :key="status" :value="status">{{ status }}</option></select></article><h3 class="external-title">Game web</h3><p class="subcopy">Iframe hanya untuk situs yang mengizinkan embed. Membuka URL yang sama di dua tab tidak otomatis membuat game menjadi multiplayer.</p><article v-for="item in external" :key="item.id" class="catalog-item"><div class="catalog-icon">{{ item.icon }}</div><div><strong>{{ item.title }}</strong><small>{{ item.status }} · {{ item.type==='embedded'?'iframe':'tab baru' }}</small><span class="url">{{ item.url }}</span></div><div class="item-actions"><button type="button" :disabled="Boolean(saving)" @click="edit(item)">Edit</button><button v-if="item.custom" type="button" class="danger" :disabled="Boolean(saving)" @click="remove(item)">{{ confirmId===item.id?'Yakin hapus?':'Hapus' }}</button></div></article></div>
      <form class="catalog-editor" @submit.prevent="save"><div class="editor-heading"><div><span class="eyebrow">{{ editingId ? 'EDIT GAME WEB' : 'GAME WEB BARU' }}</span><h3>{{ editingId ? 'Ubah game web' : 'Tambah game web' }}</h3></div><button v-if="editingId" type="button" @click="reset">Batal</button></div><label>Nama game<input v-model="draft.title" class="ms-input" maxlength="80" required /></label><label>Deskripsi singkat<input v-model="draft.subtitle" class="ms-input" maxlength="100" /></label><label>Penjelasan<textarea v-model="draft.description" class="ms-input" maxlength="240" rows="3" /></label><label>URL HTTPS<input v-model="draft.url" class="ms-input" type="url" placeholder="https://game.example/" required /></label><div class="form-pair"><label>Kategori<select v-model="draft.category" class="ms-input"><option v-for="item in GAME_CATEGORIES.filter(item=>item.id!=='all')" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label>Tampilan<select v-model="draft.type" class="ms-input"><option value="external">Tab baru</option><option value="embedded">Iframe</option></select></label></div><div class="form-pair"><label>Min. pemain<input v-model.number="draft.minPlayers" type="number" class="ms-input" min="1" max="24" /></label><label>Maks. pemain<input v-model.number="draft.maxPlayers" type="number" class="ms-input" min="1" max="24" /></label></div><label>Status<select v-model="draft.status" class="ms-input"><option v-for="status in Object.values(GAME_STATUS)" :key="status" :value="status">{{ status }}</option></select></label><button type="submit" class="ms-button ms-button-primary" :disabled="!valid || Boolean(saving)">{{ saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah game web' }}</button><small>Pastikan pemilik situs memberi izin embed sebelum memilih iframe. MeetSpace membatasi iframe ke domain URL yang kamu simpan.</small></form></div>
  </section>
</template>

<style scoped>
.catalog-admin{padding:28px;min-width:0}.catalog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.catalog-head h2{font-size:30px;margin:6px 0}.catalog-head p,.subcopy{margin:0;color:var(--text-secondary);font-size:13px}.eyebrow{font-size:10px;letter-spacing:1.8px;font-weight:950}.catalog-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:22px;margin-top:25px}.catalog-grid h3{font-size:22px;margin:0 0 7px}.external-title{margin-top:29px!important}.catalog-item{display:flex;gap:12px;align-items:center;padding:13px;margin:10px 0;border:2px solid var(--border-color);border-radius:12px;background:var(--bg-elevated)}.catalog-icon{font-size:23px;width:38px;flex:none}.catalog-item>div:nth-child(2){flex:1;min-width:0}.catalog-item strong,.catalog-item small,.catalog-item .url{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.catalog-item strong{font-size:13px}.catalog-item small,.url{font-size:11px;color:var(--text-secondary);margin-top:3px}.catalog-item select{width:130px;padding:7px;font-size:11px}.item-actions{display:flex;gap:8px}.item-actions button,.editor-heading button{border:0;background:transparent;text-decoration:underline;font-weight:900;color:var(--text-primary);font-size:11px;cursor:pointer}.item-actions .danger{color:#ad3d46}.catalog-editor{display:grid;align-content:start;gap:13px;padding:20px;border:2px solid var(--border-color);border-radius:14px;background:var(--bg-elevated)}.editor-heading{display:flex;justify-content:space-between;gap:10px}.catalog-editor label{display:grid;gap:6px;font-weight:900;font-size:12px}.catalog-editor textarea{resize:vertical}.form-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.catalog-editor>small{font-size:11px;color:var(--text-secondary)}@media(max-width:850px){.catalog-grid{grid-template-columns:1fr}}@media(max-width:560px){.catalog-admin{padding:17px}.catalog-head{display:block}.catalog-head button{margin-top:14px}.catalog-item{flex-wrap:wrap}.catalog-item>div:nth-child(2){min-width:calc(100% - 55px)}.catalog-item select,.catalog-item .item-actions{margin-left:50px}.form-pair{grid-template-columns:1fr}}
</style>
