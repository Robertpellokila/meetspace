import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

function configuration() {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, LIVEKIT_URL: serverUrl } = process.env
  if (!key || !secret || !serverUrl) throw new Error('Missing LiveKit configuration')
  return { key, secret, serverUrl }
}

export async function createLiveKitToken({roomId, participantName, identity, mode}) {
  const { key, secret, serverUrl } = configuration()
  const at = new AccessToken(key, secret, { identity, name:participantName, ttl:'10m' })
  at.addGrant({ roomJoin:true, room:roomId, canPublish:true, canSubscribe:true,
    canPublishData:true, canUpdateOwnMetadata:true })
  // Host moderation goes through the API's Firebase ownership checks.
  return { token:await at.toJwt(), serverUrl, participantId:identity }
}

export function getLiveKitRoomService() {
  const { key, secret, serverUrl } = configuration()
  const url = new URL(serverUrl)
  if (url.protocol === 'wss:') url.protocol = 'https:'
  if (url.protocol === 'ws:') url.protocol = 'http:'
  return new RoomServiceClient(url.toString(), key, secret)
}

export async function muteParticipant(service, roomId, participant) {
  const tracks = participant.tracks.filter(track => track.source === TrackSource.MICROPHONE && !track.muted)
  await Promise.all(tracks.map(track => service.mutePublishedTrack(roomId, participant.identity, track.sid, true)))
}
