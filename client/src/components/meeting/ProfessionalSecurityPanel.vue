<script setup>
import { onMounted, ref } from 'vue'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'

const props = defineProps({ roomId: { type: String, required: true }, participants: { type: Array, default: () => [] }, isOwner: Boolean })
const security = ref(null)
const cohosts = ref([])
const busy = ref('')

async function refresh() {
  try {
    const response = await api.get(`/rooms/${props.roomId}/security`)
    security.value = response.data.data
    cohosts.value = response.data.data.coHostIdentities || []
  } catch (error) { toast.error(error) }
}
async function change(key, value) {
  if (busy.value) return
  busy.value = key
  try {
    const response = await api.patch(`/rooms/${props.roomId}/security`, { [key]: value })
    security.value = { ...security.value, ...response.data.data }
    toast.success('Pengaturan Security tersimpan.')
  } catch (error) { toast.error(error); await refresh() }
  finally { busy.value = '' }
}
async function setCoHost(identity, grant) {
  if (busy.value) return
  busy.value = identity
  try {
    await api.post(`/rooms/${props.roomId}/cohosts/${encodeURIComponent(identity)}`, { grant })
    await refresh()
    toast.success(grant ? 'Co-host ditambahkan.' : 'Peran co-host dicabut.')
  } catch (error) { toast.error(error) }
  finally { busy.value = '' }
}
onMounted(refresh)
</script>
<template>
  <section class="security-panel">
    <p>Aturan ini berlaku untuk seluruh peserta Professional Room. Co-host dapat membantu moderasi; hanya pemilik room yang dapat mengangkat co-host dan mengakhiri room.</p>
    <template v-if="security">
      <label v-for="item in [
        ['locked','Kunci meeting','Tolak permintaan bergabung baru'],
        ['muteOnEntry','Mute saat bergabung','Mic awal peserta dimatikan; peserta dapat menyalakannya kembali'],
        ['allowScreenShare','Izinkan share screen','Berlaku juga untuk peserta yang sudah terhubung'],
        ['allowChat','Izinkan chat','Pesan peserta baru ditolak oleh server saat dimatikan']
      ]" :key="item[0]" class="security-option">
        <input type="checkbox" :checked="security[item[0]]" :disabled="!!busy" @change="change(item[0],$event.target.checked)" />
        <span><strong>{{item[1]}}</strong><small>{{item[2]}}</small></span>
      </label>
      <p>Chat dikirim melalui server; whiteboard dan reaksi tetap aktif ketika chat dimatikan.</p>
      <template v-if="isOwner"><h3>♧ Co-host</h3><p>Peserta cukup login dan disetujui masuk ke room ini. Akses penuh dari admin hanya diperlukan untuk membuat room sendiri.</p>
        <div v-for="participant in participants.filter(p=>!p.isLocal && !p.id.startsWith('host-'))" :key="participant.id" class="cohost-row">
          <span>{{participant.name}}</span><button :disabled="!!busy" @click="setCoHost(participant.id,!cohosts.includes(participant.id))">{{cohosts.includes(participant.id)?'Cabut co-host':'Jadikan co-host'}}</button>
        </div>
      </template>
    </template>
    <p v-else>Memuat pengaturan…</p>
  </section>
</template>
<style scoped>
.security-panel{padding:16px;display:grid;gap:12px}.security-panel p{font-size:12px;line-height:1.5;color:var(--text-secondary);margin:0}.security-option{display:flex;align-items:start;gap:10px;padding:11px;border:2px solid var(--border-color);border-radius:11px;background:var(--bg-elevated);cursor:pointer}.security-option input{margin-top:3px;accent-color:var(--color-primary)}.security-option span{display:grid;gap:3px}.security-option strong,.cohost-row{font-size:12px}.security-option small{font-size:10px;color:var(--text-secondary)}h3{font-size:16px;margin:12px 0 0}.cohost-row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-bottom:1px dashed var(--border-color)}button{padding:7px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-elevated);color:var(--text-primary);font-weight:800;font-size:10px}button:disabled{opacity:.5}
</style>
