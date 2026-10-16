<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../services/api.js'
import { toast } from '../../services/toast.js'

const invite = ref('')
const joiningByCode = ref(false)
const router = useRouter()
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function join() {
  if (joiningByCode.value) return
  const raw = invite.value.trim()
  let id = raw
  try {
    const url = new URL(raw, window.location.origin)
    id = url.pathname.match(/^\/(?:lobby|meeting)\/([^/]+)\/?$/)?.[1] || raw
  } catch { /* A plain ID is also accepted. */ }

  if (roomIdPattern.test(id)) {
    await router.push({ name: 'lobby', params: { roomId: id } })
    return
  }
  if (!/^[\d\s-]+$/.test(id)) {
    toast.error('Tempel tautan MeetSpace, UUID room, atau Meeting ID 10 digit.')
    return
  }
  const code = id.replace(/\D/g, '')
  if (!/^\d{10}$/.test(code)) {
    toast.error('Masukkan Meeting ID 10 digit.')
    return
  }
  joiningByCode.value = true
  try {
    const response = await api.get(`/rooms/by-code/${code}`)
    await router.push({ name: 'lobby', params: { roomId: response.data.data.roomId } })
  } catch (error) {
    toast.error(error)
  } finally {
    joiningByCode.value = false
  }
}
</script>

<template>
  <form class="join-form" @submit.prevent="join">
    <label for="invite-link">Sudah punya undangan?</label>
    <div>
      <input id="invite-link" v-model="invite" class="ms-input" placeholder="Tautan, UUID, atau Meeting ID 10 digit" autocomplete="off" required />
      <button class="ms-button ms-button-primary" :disabled="joiningByCode">{{ joiningByCode ? 'Mencari…' : 'Gabung ↗' }}</button>
    </div>
    <small>Masukkan 10 angka dari host atau tempel tautan undangan. Persetujuan host tetap diperlukan.</small>
  </form>
</template>

<style scoped>
.join-form{display:grid;gap:10px}.join-form label{font-weight:900;font-size:15px}.join-form>div{display:flex;gap:10px}.join-form input{min-width:0}.join-form button{white-space:nowrap}.join-form small{font-size:12px;color:var(--text-secondary)}@media(max-width:420px){.join-form>div{flex-direction:column}}
</style>
