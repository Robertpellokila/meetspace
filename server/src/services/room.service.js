import { randomInt, randomUUID } from 'node:crypto'
import { db } from '../config/firebase.js'

const roomRef = id => db.collection('rooms').doc(id)
const codeRef = meetingId => db.collection('meetingCodes').doc(meetingId)

// Generate a cryptographically random 10-digit meeting code (not a room UUID).
export function generateMeetingId() {
  return String(randomInt(1_000_000_000, 10_000_000_000))
}

export function isMeetingId(value) {
  return typeof value === 'string' && /^\d{10}$/.test(value)
}

// In a caller-owned Firestore transaction, the caller MUST tx.get() the
// meetingCodes documents for ALL rooms BEFORE calling createRoom(). This is
// important for breakout transactions: Firestore prohibits reads after writes.
export async function createRoom(
  { name, mode, theme, hostUid, parentRoomId, passwordHash, meetingId, schedule, coHostUids },
  transaction = null,
) {
  const id = randomUUID()
  const room = {
    id, name, mode, theme, hostUid,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...(parentRoomId ? { parentRoomId } : {}),
    ...(passwordHash ? { passwordHash } : {}),
    ...(schedule ? { schedule } : {}),
    ...(mode === 'professional' ? { security: { locked: false, muteOnEntry: false, allowScreenShare: true, allowChat: true }, coHostUids: coHostUids || [] } : {}),
  }
  const ref = roomRef(id)

  if (transaction) {
    if (!isMeetingId(meetingId)) {
      throw new Error('Transactional createRoom requires a prechecked meetingId')
    }
    room.meetingId = meetingId
    transaction.create(ref, room)
    transaction.create(codeRef(meetingId), { roomId: id, createdAt: Date.now() })
    return room
  }

  // For regular rooms, reserve code atomically. Retry rare collisions.
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateMeetingId()
    const result = await db.runTransaction(async tx => {
      const index = await tx.get(codeRef(candidate))
      if (index.exists) return null
      const record = { ...room, meetingId: candidate }
      tx.create(ref, record)
      tx.create(codeRef(candidate), { roomId: id, createdAt: Date.now() })
      return record
    })
    if (result) return result
  }
  throw new Error('Unable to reserve unique Meeting ID')
}

export async function getRoomById(roomId) {
  const doc = await roomRef(roomId).get()
  return doc.exists ? doc.data() : null
}

export async function getRoomByMeetingId(meetingId) {
  if (!isMeetingId(meetingId)) return null
  const index = await codeRef(meetingId).get()
  if (!index.exists) return null
  const room = await getRoomById(index.data().roomId)
  return room?.status === 'active' && room.meetingId === meetingId ? room : null
}

// Rooms created before numeric IDs existed receive one when first opened.
// The room update and unique lookup document must commit together.
export async function ensureMeetingId(roomId) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateMeetingId()
    const room = await db.runTransaction(async tx => {
      const ref = roomRef(roomId)
      const snap = await tx.get(ref)
      if (!snap.exists || snap.data().status !== 'active') return snap.exists ? snap.data() : null
      if (isMeetingId(snap.data().meetingId)) return snap.data()
      const index = await tx.get(codeRef(candidate))
      if (index.exists) return undefined
      tx.update(ref, { meetingId: candidate })
      tx.create(codeRef(candidate), { roomId, createdAt: Date.now() })
      return { ...snap.data(), meetingId: candidate }
    })
    if (room !== undefined) return room
  }
  throw new Error('Unable to reserve unique Meeting ID')
}

// The first admitted connection starts the room clock, shared by every joiner.
export async function startRoom(roomId) {
  const ref = roomRef(roomId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists || snap.data().status !== 'active' || snap.data().sessionClosing) return null
    const room = snap.data()
    if (!room.startedAt) {
      room.startedAt = new Date().toISOString()
      tx.update(ref, { startedAt: room.startedAt })
    }
    return room
  })
}
