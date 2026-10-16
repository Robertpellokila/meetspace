import { Room, RoomEvent } from 'livekit-client'

let activeRoom = null

export async function connectToMeeting(serverUrl, token) {
  if (activeRoom) {
    await disconnectFromMeeting(activeRoom)
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults:{resolution:{width:1280,height:720,frameRate:30}},
    publishDefaults:{simulcast:true,videoCodec:'vp8',videoEncoding:{maxBitrate:1_500_000,maxFramerate:30},dtx:true,red:true},
  })

  try {
    await room.connect(serverUrl, token, {
      autoSubscribe: true,
    })

    activeRoom = room
    return room
  } catch (error) {
    await room.disconnect()
    throw error
  }
}

export function getActiveRoom() {
  return activeRoom
}

export async function disconnectFromMeeting(room = activeRoom) {
  if (room) {
    if (activeRoom === room) activeRoom = null
    await room.disconnect()
  }
}

export { RoomEvent }
