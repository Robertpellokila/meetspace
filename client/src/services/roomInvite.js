import { toast } from './toast.js'

export async function copyRoomInvite(roomId, kind = 'link', meetingId = '') {
  try {
    if (kind === 'id' && !/^\d{10}$/.test(String(meetingId))) {
      toast.error('Meeting ID belum tersedia. Muat ulang room lalu coba lagi.')
      return
    }
    const value = kind === 'id' ? String(meetingId) : new URL(`/lobby/${roomId}`, window.location.origin).href
    await navigator.clipboard.writeText(value)
    toast.success(kind === 'id' ? 'Meeting ID tersalin.' : 'Undangan room tersalin.')
  } catch {
    toast.error('Belum bisa menyalin. Buka lobby untuk menyalin ID atau alamat room secara manual.')
  }
}
