import { shallowRef } from 'vue'
import { Track, RoomEvent } from 'livekit-client'

function publishedTrack(participant, source) {
  const publication = participant.getTrackPublications().find(p => p.source === source)
  return publication && !publication.isMuted ? (publication.track ?? null) : null
}
export function useParticipants() {
  const participants = shallowRef([])
  const events = [
    RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
    RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
    RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
    RoomEvent.ParticipantAttributesChanged, RoomEvent.ParticipantNameChanged,
    RoomEvent.ActiveSpeakersChanged, RoomEvent.ConnectionQualityChanged,
  ]
  let room = null
  const sync = () => {
    if (!room) return
    const people = [room.localParticipant, ...room.remoteParticipants.values()]
    participants.value = people.map(p => ({
      id: p.identity, name: p.name || 'Guest', isLocal: p === room.localParticipant,
      isHost: p.identity.startsWith('host-'),
      handRaised: p.attributes?.['meetspace.handRaised'] === 'true',
      isSpeaking: Boolean(p.isSpeaking && p.isMicrophoneEnabled),
      connectionQuality: p.connectionQuality || 'unknown',
      recording: p.identity.startsWith('host-') && p.attributes?.['meetspace.recording'] === 'true',
      videoTrack: publishedTrack(p, Track.Source.Camera),
      audioTrack: p === room.localParticipant ? null : publishedTrack(p, Track.Source.Microphone),
      screenTrack: publishedTrack(p, Track.Source.ScreenShare),
      screenAudioTrack: p === room.localParticipant ? null : publishedTrack(p, Track.Source.ScreenShareAudio),
      micMuted: !p.isMicrophoneEnabled,
    }))
  }
  function attach(livekitRoom) {
    detach()
    room = livekitRoom
    events.forEach(event => room.on(event, sync))
    sync()
  }
  function detach() {
    if (room) events.forEach(event => room.off(event, sync))
    room = null
    participants.value = []
  }
  return { participants, attach, detach, sync }
}
