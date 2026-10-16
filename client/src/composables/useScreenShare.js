import { computed, ref } from 'vue'
export function useScreenShare(participants, getRoom, syncParticipants) {
  const busy = ref(false)
  const sharer = computed(() => participants.value.find(p => p.screenTrack) ?? null)
  const isSharing = computed(() => Boolean(participants.value.find(p => p.isLocal && p.screenTrack)))
  async function toggle() {
    const room = getRoom()
    if (!room || busy.value) return
    busy.value = true
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled)
      syncParticipants()
    } finally { busy.value = false }
  }
  // Screen-share stopped from the browser's native "Stop sharing" is captured
  // by LiveKit track events and useParticipants().
  return { busy, sharer, isSharing, toggle }
}
