import { ref, watch, toValue } from 'vue'
import api from '../services/api.js'
import { toast } from '../services/toast.js'

// One polling owner per lobby/meeting, independent of whether People is open.
export function useHostApprovals(roomId, enabled = true, onArrival = () => {}) {
  const requests = ref([]), busy = ref('')
  let session, timer, fetching
  const seen = new Set()
  async function refresh() {
    const active = session
    if (!active) return
    if (fetching?.session === active) return fetching.promise
    clearTimeout(timer)
    const task = { session: active }
    fetching = task
    task.promise = (async () => {
      try {
        const result = await api.get(`/rooms/${encodeURIComponent(toValue(roomId))}/join-requests`, { signal: active.signal })
        if (session !== active) return
        requests.value = result.data.data
        const arrivals = requests.value.filter(request => !seen.has(request.id))
        requests.value.forEach(request => seen.add(request.id))
        if (arrivals.length) onArrival(arrivals)
      } catch (error) {
        if (session === active) toast.error(error)
      } finally {
        if (fetching === task) fetching = null
        if (session === active) timer = setTimeout(refresh, 4000)
      }
    })()
    return task.promise
  }
  async function decide(id, status) {
    if (busy.value || !session) return
    const active = session
    busy.value = id
    try {
      await api.patch(`/rooms/${encodeURIComponent(toValue(roomId))}/join-requests/${encodeURIComponent(id)}`, { status }, { signal: active.signal })
      if (session !== active) return
      await fetching?.promise
      if (session !== active) return
      await refresh()
      if (session === active) toast.success(status === 'approved' ? 'Peserta diizinkan bergabung.' : 'Permintaan bergabung ditolak.')
    } catch (error) {
      if (session === active) { toast.error(error); await refresh() }
    } finally { busy.value = '' }
  }
  watch(() => [toValue(enabled), toValue(roomId)], ([active], _, onCleanup) => {
    if (!active) return
    session = new AbortController()
    void refresh()
    onCleanup(() => {
      const previous = session
      session = null
      previous?.abort()
      clearTimeout(timer)
      requests.value = []
    })
  }, { immediate: true })
  return { requests, busy, refresh, decide }
}
