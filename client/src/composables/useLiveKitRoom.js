import { ref, shallowRef } from 'vue'
import { RoomEvent } from 'livekit-client'
import api from '../services/api.js'
import { connectToMeeting, disconnectFromMeeting } from '../services/livekit.js'

export function useLiveKitRoom() {
  const connection = shallowRef(null)
  const loading = ref(false)
  const error = ref('')
  const token = ref('')
  let activeRoomId=null, activeName='', refreshing=null
  let current = null
  let cancelled = false
  const listeners = new Set()
  function onDisconnect(fn) { listeners.add(fn); return () => listeners.delete(fn) }
  const disconnected = reason => { connection.value = null; listeners.forEach(fn => fn(reason)) }
  async function requestToken(roomId, participantName) {
    let approval = {}
    try { approval = JSON.parse(sessionStorage.getItem(`meetspace:approval:${roomId}`) || '{}') || {} } catch { /* ignore invalid storage */ }
    const sentAt=performance.now()
    const response=await api.post(`/rooms/${encodeURIComponent(roomId)}/token`,{
      participantName,requestId:approval.requestId,guestSecret:approval.guestSecret,
    })
    const receivedAt=performance.now()
    return {...response.data.data,clock:{serverNow:response.data.data.serverNow,receivedAt,roundTripMs:receivedAt-sentAt}}
  }
  async function refreshToken() {
    if(cancelled || !activeRoomId)throw Error('Hubungkan kembali ke meeting untuk membuka whiteboard.')
    if(refreshing)return refreshing
    refreshing=requestToken(activeRoomId,activeName).then(result=>{
      if(cancelled)throw Error('Sesi meeting sudah ditutup.')
      token.value=result.token
      return result.token
    }).finally(()=>{refreshing=null})
    return refreshing
  }
  async function join(roomId, participantName) {
    loading.value = true
    error.value = ''
    cancelled = false
    try {
      const result = await requestToken(roomId,participantName)
      if (cancelled) return null
      const { serverUrl, room, isHost, clock } = result
      const livekitRoom = await connectToMeeting(serverUrl, result.token)
      if (cancelled) { await disconnectFromMeeting(livekitRoom); return null }
      current = livekitRoom
      connection.value = livekitRoom
      token.value=result.token
      activeRoomId=roomId;activeName=participantName
      livekitRoom.on(RoomEvent.Disconnected, disconnected)
      return { livekitRoom, room, isHost, token:result.token, clock }
    } catch (e) {
      error.value = e.response?.data?.message || e.message || 'Unable to join'
      throw e
    } finally { loading.value = false }
  }
  async function leave() {
    cancelled = true
    token.value='';activeRoomId=null
    if (current) current.off(RoomEvent.Disconnected, disconnected)
    const previous = current
    current = null
    connection.value = null
    if (previous) await disconnectFromMeeting(previous)
  }
  return { connection, loading, error, token, refreshToken, join, leave, onDisconnect }
}
