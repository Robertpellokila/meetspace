<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'
import { COUPLE_QUIZ_CATEGORIES, COUPLE_QUIZ_QUESTIONS } from '../../config/coupleQuizQuestions.js'
import { TOD_CATEGORIES, TOD_CARD_BANK } from '../../config/truthOrDareCards.js'
import { WYR_CATEGORIES, WYR_QUESTION_BANK } from '../../config/wouldYouRatherQuestions.js'

const games = [
  { id: 'couple-quiz', label: 'Couple Quiz', icon: '💕', categories: COUPLE_QUIZ_CATEGORIES, choices: 4 },
  { id: 'truth-or-dare', label: 'Truth or Dare', icon: '💌', categories: TOD_CATEGORIES, choices: 0 },
  { id: 'would-you-rather', label: 'Would You Rather', icon: '🤔', categories: WYR_CATEGORIES, choices: 2 },
]
const gameId = ref('couple-quiz')
const category = ref('romantic')
const kind = ref('truth')
const entries = ref([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref('')
const confirmId = ref('')
const draft = ref({ text: '', options: ['', '', '', ''] })
const game = computed(() => games.find(item => item.id === gameId.value))
const categories = computed(() => game.value.categories)

function defaults() {
  if (gameId.value === 'couple-quiz') return (COUPLE_QUIZ_QUESTIONS[category.value] || []).map(([id, text, options]) => ({ id, gameId: gameId.value, category: category.value, text, options }))
  if (gameId.value === 'truth-or-dare') return TOD_CARD_BANK[category.value]?.[kind.value] || []
  return WYR_QUESTION_BANK[category.value] || []
}
const rows = computed(() => {
  const base = defaults()
  const selected = entries.value.filter(item => item.gameId === gameId.value && item.category === category.value && (gameId.value !== 'truth-or-dare' || item.kind === kind.value))
  const byId = new Map(selected.map(item => [item.id, item]))
  const original = base.map(item => ({ ...item, ...byId.get(item.id), builtin: true }))
  const ids = new Set(base.map(item => item.id))
  return [...original, ...selected.filter(item => !ids.has(item.id)).map(item => ({ ...item, builtin: false }))]
})
const valid = computed(() => draft.value.text.trim().length >= 5 && draft.value.text.trim().length <= 280 && draft.value.options.slice(0, game.value.choices).every(option => option.trim().length >= 1 && option.trim().length <= 100))

async function load() {
  loading.value = true
  try { entries.value = (await api.get('/game-content')).data.data }
  catch (error) { toast.error(error) }
  finally { loading.value = false }
}
function reset() { editingId.value = ''; confirmId.value = ''; draft.value = { text: '', options: ['', '', '', ''] } }
function edit(item) { editingId.value = item.id; confirmId.value = ''; draft.value = { text: item.text || '', options: [...(item.options || []), '', '', '', ''].slice(0, 4) } }
function body(enabled = true) { return { gameId: gameId.value, category: category.value, ...(gameId.value === 'truth-or-dare' ? { kind: kind.value } : {}), text: draft.value.text.trim(), ...(game.value.choices ? { options: draft.value.options.slice(0, game.value.choices).map(value => value.trim()) } : {}), enabled } }
async function save() {
  if (!valid.value || saving.value) return
  saving.value = true
  try {
    if (editingId.value) await api.patch(`/game-content/${gameId.value}/${editingId.value}`, body())
    else await api.post('/game-content', body())
    toast.success(editingId.value ? 'Pertanyaan diperbarui.' : 'Pertanyaan ditambahkan.')
    reset(); await load()
  } catch (error) { toast.error(error) }
  finally { saving.value = false }
}
async function setEnabled(item, enabled) {
  saving.value = true
  try {
    await api.patch(`/game-content/${gameId.value}/${item.id}`, { ...item, gameId: gameId.value, enabled })
    toast.success(enabled ? 'Pertanyaan diaktifkan.' : 'Pertanyaan disembunyikan.')
    await load()
  } catch (error) { toast.error(error) }
  finally { saving.value = false }
}
async function remove(item) {
  if (confirmId.value !== item.id) { confirmId.value = item.id; return }
  saving.value = true
  try {
    if (item.builtin) await api.patch(`/game-content/${gameId.value}/${item.id}`, { ...item, gameId: gameId.value, enabled: false })
    else await api.delete(`/game-content/${gameId.value}/${item.id}`)
    toast.success(item.builtin ? 'Pertanyaan bawaan disembunyikan.' : 'Pertanyaan dihapus.')
    if (editingId.value === item.id) reset()
    confirmId.value = ''; await load()
  } catch (error) { toast.error(error) }
  finally { saving.value = false }
}

// A local draft generator works without a paid AI service. The admin edits
// and reviews the draft before saving; it never publishes automatically.
const prompts = {
  'couple-quiz': [
    ['Apa kegiatan baru yang paling ingin kita coba bersama?', ['Memasak resep baru', 'Jalan ke tempat baru', 'Belajar bahasa', 'Membuat kerajinan']],
    ['Cara mana yang paling membuatmu merasa dihargai?', ['Ucapan terima kasih', 'Waktu berdua', 'Bantuan kecil', 'Kejutan sederhana']],
    ['Di akhir pekan bebas, apa pilihanmu?', ['Piknik', 'Menonton film', 'Mencoba kafe', 'Beristirahat di rumah']],
  ],
  'truth-or-dare': {
    truth: ['Apa momen kecil minggu ini yang membuatmu senang?', 'Apa hal baru tentang dirimu yang ingin orang lain tahu?', 'Kapan kamu merasa paling berani mencoba sesuatu?'],
    dare: ['Berikan pujian spesifik kepada satu peserta.', 'Tunjukkan benda di dekatmu dan ceritakan kisahnya.', 'Buat salam unik untuk seluruh peserta.'],
  },
  'would-you-rather': [
    ['Jika punya satu sore bebas, kamu memilih?', ['Menjelajah tempat baru', 'Menikmati waktu tenang']],
    ['Untuk belajar keterampilan baru, kamu memilih?', ['Belajar bersama teman', 'Mencoba sendiri dahulu']],
    ['Saat merayakan kabar baik, kamu memilih?', ['Acara kecil bersama', 'Petualangan spontan']],
  ],
}
let seed = 0
function generateDraft() {
  reset()
  const source = gameId.value === 'truth-or-dare' ? prompts[gameId.value][kind.value] : prompts[gameId.value]
  const sample = source[seed++ % source.length]
  draft.value = { text: Array.isArray(sample) ? sample[0] : sample, options: Array.isArray(sample) ? [...sample[1], '', ''].slice(0, 4) : ['', '', '', ''] }
  toast.info('Draf dibuat. Tinjau dan ubah sebelum menyimpan.')
}
watch(gameId, () => { category.value = categories.value[0].id; kind.value = 'truth'; reset() })
watch([category, kind], reset)
onMounted(load)
</script>

<template>
  <section class="game-admin ms-card" aria-label="Kelola konten Game Night">
    <header class="game-admin-head"><div><span class="eyebrow">✦ GAME NIGHT / CONTENT DESK</span><h2>Bank pertanyaan.</h2><p>Kelola pertanyaan yang muncul di permainan berikutnya. Sesi yang sedang berjalan memakai bank soal saat game dimulai.</p></div><button type="button" class="ms-button ms-button-outline" :disabled="loading" @click="load">{{ loading ? 'Memuat…' : 'Segarkan ↻' }}</button></header>
    <div class="game-admin-picker"><label>Permainan<select v-model="gameId" class="ms-input"><option v-for="item in games" :key="item.id" :value="item.id">{{ item.icon }} {{ item.label }}</option></select></label><label>Kategori<select v-model="category" class="ms-input"><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.icon }} {{ item.title }}</option></select></label><label v-if="gameId==='truth-or-dare'">Jenis kartu<select v-model="kind" class="ms-input"><option value="truth">Truth</option><option value="dare">Dare</option></select></label></div>
    <div class="game-admin-grid"><div class="game-admin-list"><div class="list-title"><strong>{{ rows.length }} konten</strong><span>Konten bawaan bisa diedit atau disembunyikan.</span></div><p v-if="loading" role="status">Memuat bank soal…</p><p v-else-if="!rows.length">Belum ada konten. Buat pertanyaan pertama di sebelah kanan.</p><article v-for="item in rows" :key="item.id" class="question-card" :class="{ muted:item.enabled===false }"><div><small>{{ item.builtin ? 'BAWAAN' : 'TAMBAHAN' }} · {{ item.enabled===false ? 'NONAKTIF' : 'AKTIF' }}</small><strong>{{ item.text || 'Pertanyaan tersembunyi' }}</strong><p v-if="item.options?.length">{{ item.options.join(' · ') }}</p></div><div class="question-actions"><button type="button" :disabled="saving" @click="edit(item)">Edit</button><button type="button" :disabled="saving" @click="setEnabled(item,item.enabled===false)">{{ item.enabled===false ? 'Aktifkan' : 'Sembunyikan' }}</button><button type="button" class="danger" :disabled="saving" @click="remove(item)">{{ confirmId===item.id ? 'Yakin hapus?' : 'Hapus' }}</button></div></article></div><form class="game-admin-editor" @submit.prevent="save"><div class="editor-title"><div><span class="eyebrow">{{ editingId ? 'EDIT KONTEN' : 'KONTEN BARU' }}</span><h3>{{ editingId ? 'Ubah pertanyaan' : 'Tulis pertanyaan' }}</h3></div><button v-if="editingId" type="button" @click="reset">Batal</button></div><label>{{ gameId==='truth-or-dare' ? 'Isi kartu' : 'Pertanyaan' }}<textarea v-model="draft.text" class="ms-input" rows="4" maxlength="280" placeholder="Tulis pertanyaan yang jelas dan nyaman dijawab…" /></label><label v-for="(_,index) in game.choices" :key="index">Pilihan {{ index+1 }}<input v-model="draft.options[index]" class="ms-input" maxlength="100" :placeholder="`Pilihan ${index+1}`" /></label><div class="editor-actions"><button type="button" class="ms-button ms-button-outline" @click="generateDraft">✦ Generate draf</button><button type="submit" class="ms-button ms-button-primary" :disabled="!valid || saving">{{ saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah pertanyaan' }}</button></div><small>Draf lokal dibuat dari contoh terkurasi dan perlu ditinjau sebelum disimpan.</small></form></div>
  </section>
</template>

<style scoped>
.game-admin{padding:28px;min-width:0}.game-admin-head,.list-title,.editor-title,.editor-actions{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.game-admin-head h2{margin:6px 0;font-size:30px}.game-admin-head p{margin:0;color:var(--text-secondary);font-size:13px;max-width:620px}.eyebrow{font-size:10px;font-weight:950;letter-spacing:1.8px}.game-admin-picker{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.game-admin-picker label,.game-admin-editor label{display:grid;gap:7px;font-size:12px;font-weight:900}.game-admin-picker label{min-width:190px}.game-admin-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:18px}.game-admin-list{min-height:260px;max-height:560px;overflow:auto;padding-right:5px}.list-title{padding:0 3px 12px;border-bottom:2px solid var(--border-color)}.list-title span{font-size:11px;color:var(--text-secondary)}.question-card{margin:10px 0;padding:14px;border:2px solid var(--border-color);border-radius:12px;background:var(--bg-elevated)}.question-card.muted{opacity:.7}.question-card small,.question-card strong{display:block}.question-card small{font-size:10px;letter-spacing:1px;margin-bottom:8px}.question-card strong{font-size:14px;line-height:1.4}.question-card p{font-size:11px;color:var(--text-secondary);margin:7px 0 0}.question-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:11px}.question-actions button,.editor-title button{border:0;background:transparent;color:var(--text-primary);text-decoration:underline;font-weight:900;font-size:11px;cursor:pointer}.question-actions .danger{color:#ad3d46}.game-admin-editor{display:grid;align-content:start;gap:15px;padding:20px;border:2px solid var(--border-color);border-radius:14px;background:var(--bg-elevated)}.game-admin-editor h3{margin:4px 0 0;font-size:21px}.game-admin-editor textarea{resize:vertical}.editor-actions{align-items:center;flex-wrap:wrap}.game-admin-editor>small{font-size:11px;color:var(--text-secondary)}@media(max-width:800px){.game-admin-grid{grid-template-columns:1fr}.game-admin-list{max-height:380px}}@media(max-width:520px){.game-admin{padding:17px}.game-admin-head{display:block}.game-admin-head button{margin-top:14px}.game-admin-picker label{flex:1 1 100%}.editor-actions .ms-button{width:100%}}
</style>
