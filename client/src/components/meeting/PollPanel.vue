<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'

const props = defineProps({ roomId: { type: String, required: true }, isHost: Boolean })
const polls = ref([]), question = ref(''), options = ref(['', '']), selected = ref({}), busy = ref(''), loading = ref(false)
let timer, stopped = false
function credentials() {
  try { return JSON.parse(sessionStorage.getItem(`meetspace:approval:${props.roomId}`) || '{}') || {} } catch { return {} }
}
async function refresh() {
  if (stopped) return
  clearTimeout(timer)
  loading.value = true
  try {
    const c = credentials()
    const response = await api.get(`/rooms/${props.roomId}/polls`, { headers: { 'x-meetspace-request-id': c.requestId, 'x-meetspace-guest-secret': c.guestSecret } })
    if (!stopped) polls.value = response.data.data
  } catch (error) { if (!stopped) toast.error(error) }
  finally { loading.value = false; if (!stopped) timer = setTimeout(refresh, 5000) }
}
async function create() {
  if (busy.value) return
  busy.value = 'create'
  try {
    await api.post(`/rooms/${props.roomId}/polls`, { question: question.value, options: options.value })
    question.value = ''; options.value = ['', '']; await refresh(); toast.success('Draf polling dibuat.')
  } catch (error) { toast.error(error) } finally { busy.value = '' }
}
async function setStatus(poll, status) {
  busy.value = poll.id
  try { await api.patch(`/rooms/${props.roomId}/polls/${poll.id}`, { status }); await refresh(); toast.success(status === 'open' ? 'Polling dibuka.' : 'Polling ditutup.') }
  catch (error) { toast.error(error) } finally { busy.value = '' }
}
async function vote(poll) {
  busy.value = poll.id
  try { await api.post(`/rooms/${props.roomId}/polls/${poll.id}/vote`, { ...credentials(), option: Number(selected.value[poll.id]) }); await refresh(); toast.success('Jawaban tersimpan.') }
  catch (error) { toast.error(error) } finally { busy.value = '' }
}
onMounted(refresh)
onUnmounted(() => { stopped = true; clearTimeout(timer) })
</script>
<template>
  <section class="poll-panel">
    <p v-if="isHost">Buat pertanyaan, buka saat siap, lalu tutup untuk melihat hasil akhir bersama.</p>
    <form v-if="isHost" @submit.prevent="create"><label>Pertanyaan<input v-model="question" minlength="5" maxlength="200" required placeholder="Apa yang tim pilih?" /></label><label v-for="(_,i) in options" :key="i">Pilihan {{i+1}}<input v-model="options[i]" maxlength="100" required /></label><div class="poll-actions"><button type="button" :disabled="options.length>=6" @click="options.push('')">+ Pilihan</button><button type="button" :disabled="options.length<=2" @click="options.pop()">− Pilihan</button></div><button type="submit" :disabled="!!busy">Simpan draf</button></form>
    <article v-for="poll in polls" :key="poll.id" class="poll-card"><small>{{poll.status==='draft'?'Draf':poll.status==='open'?'● Sedang dibuka':'Ditutup'}}</small><h3>{{poll.question}}</h3><template v-if="poll.status==='open' && !isHost && !poll.voted"><label v-for="(option,i) in poll.options" :key="i" class="poll-choice"><input v-model="selected[poll.id]" type="radio" :name="poll.id" :value="i" /> {{option}}</label><button :disabled="busy===poll.id || selected[poll.id]===undefined" @click="vote(poll)">Kirim jawaban</button></template><div v-else-if="poll.status!=='draft'"><small v-if="poll.voted">✓ Jawabanmu tersimpan</small><div v-for="(option,i) in poll.options" :key="i" class="poll-result"><span>{{option}}</span><strong>{{poll.counts?.[i] || 0}}</strong></div></div><div v-if="isHost && poll.status!=='closed'" class="poll-actions"><button :disabled="!!busy" @click="setStatus(poll,poll.status==='draft'?'open':'closed')">{{poll.status==='draft'?'Buka polling':'Tutup polling'}}</button></div></article>
    <p v-if="!polls.length">{{loading?'Memuat polling…':'Belum ada polling.'}}</p>
  </section>
</template>
<style scoped>
.poll-panel{padding:16px;display:grid;gap:14px}.poll-panel p{font-size:12px;line-height:1.5;color:var(--text-secondary)}form,.poll-card{display:grid;gap:10px;padding:13px;border:2px solid var(--border-color);border-radius:11px;background:var(--bg-elevated)}label{display:grid;gap:5px;font-size:11px;font-weight:800}input:not([type=radio]){min-width:0;padding:9px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-surface);color:var(--text-primary)}button{padding:8px 10px;border:2px solid var(--border-color);border-radius:8px;background:var(--color-secondary);color:#292e29;font-weight:900;font-size:11px;cursor:pointer}button:disabled{opacity:.5}.poll-actions{display:flex;gap:6px}.poll-card h3{font-size:15px;margin:0;overflow-wrap:anywhere}.poll-card small{font-size:10px;color:var(--text-secondary)}.poll-choice{display:flex;align-items:center;padding:7px;border:1px solid var(--border-color);border-radius:7px}.poll-result{display:flex;justify-content:space-between;gap:5px;font-size:12px;margin-bottom:6px}
</style>
