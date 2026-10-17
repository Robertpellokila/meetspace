import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

function configuration() {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, LIVEKIT_URL: serverUrl } = process.env
  if (!key || !secret || !serverUrl) throw new Error('Missing LiveKit configuration')
  return { key, secret, serverUrl }
}

export function guestPermission(security = {}) {
  return {
    canSubscribe: true,
    canPublish: true,
    // LiveKit data is also used by whiteboard, reactions and soundboard.
    // Chat visibility is controlled in the client until chat moves to a server relay.
    canPublishData: true,
    canUpdateOwnMetadata: true,
    canPublishSources: security.allowScreenShare === false
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
      : [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  }
}

export function participantPermission(security = {}) {
  const { canUpdateOwnMetadata, ...permission } = guestPermission(security)
  return { ...permission, canUpdateMetadata: canUpdateOwnMetadata }
}

export async function createLiveKitToken({roomId, participantName, identity, mode, security, isModerator = false, attributes}) {
  const { key, secret, serverUrl } = configuration()
  const at = new AccessToken(key, secret, { identity, name:participantName, ttl:'10m', attributes })
  at.addGrant({ roomJoin:true, room:roomId,
    ...(isModerator ? {canPublish:true,canSubscribe:true,canPublishData:true,canUpdateOwnMetadata:true} : guestPermission(security)) })
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
