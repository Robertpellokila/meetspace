import { db } from '../config/firebase.js'

export function mergeParticipantSession(previous, event) {
  const time=Number(event.createdAt)*1000
  const joinedAt=Number(event.participant?.joinedAt)*1000
  const start=event.event==='participant_joined'?time:joinedAt>0?joinedAt:time
  const startedAt=Math.min(previous?.startedAt ?? start,start)
  const endedAt=event.event==='participant_left' ? Math.max(previous?.endedAt || 0,time) : previous?.endedAt ?? null
  return {startedAt,endedAt,durationMs:endedAt===null?0:Math.max(0,endedAt-startedAt)}
}
export async function recordUsage(event) {
  if(!['participant_joined','participant_left','room_started','room_finished'].includes(event.event))return
  if(!event.id || !event.room?.name || !event.room?.sid || !Number(event.createdAt))return
  // Provider identifiers are not accepted as arbitrary Firestore paths.
  if([event.id,event.room.sid,event.room.name,event.participant?.sid].some(id=>id && /\//.test(id)))return
  const roomRef=db.collection('rooms').doc(event.room.name)
  const room=await roomRef.get()
  if(!room.exists)return
  const dedupe=db.collection('usageEvents').doc(event.id)
  const time=Number(event.createdAt)*1000
  await db.runTransaction(async tx=>{
    if((await tx.get(dedupe)).exists)return
    if(event.event.startsWith('participant_') && event.participant?.sid){
      const ref=db.collection('usageSessions').doc(`${event.room.sid}_${event.participant.sid}`)
      const old=await tx.get(ref)
      const liveRoom=await tx.get(db.collection('liveRooms').doc(event.room.sid))
      const session=mergeParticipantSession(old.exists?old.data():null,event)
      // A delayed join must not reopen a room already marked finished.
      if(liveRoom.data()?.endedAt != null){
        session.endedAt=liveRoom.data().endedAt
        session.durationMs=Math.max(0,session.endedAt-session.startedAt)
      }
      tx.set(ref,{...session,roomId:room.id,roomSid:event.room.sid,roomName:room.data().name,
        mode:room.data().mode,hostUid:room.data().hostUid,identity:event.participant.identity,
        participantName:event.participant.name || 'Guest',updatedAt:time})
    }else{
      const ref=db.collection('liveRooms').doc(event.room.sid)
      const old=await tx.get(ref)
      const endedAt=event.event==='room_finished'?time:old.data()?.endedAt ?? null
      tx.set(ref,{roomId:room.id,roomName:room.data().name,startedAt:Math.min(old.data()?.startedAt ?? time,time),
        endedAt,active:endedAt===null})
    }
    tx.set(dedupe,{event:event.event,receivedAt:Date.now(),expiresAt:new Date(Date.now()+7*86400000)})
    tx.set(db.collection('stats').doc('livekit'),{lastEventAt:Date.now()},{merge:true})
  })
  // Closing events also finalize any session whose participant_left event was missed.
  if(event.event==='room_finished'){
    const sessions=await db.collection('usageSessions').where('roomSid','==',event.room.sid).get()
    await Promise.all(sessions.docs.map(doc=>db.runTransaction(async tx=>{
      const current=await tx.get(doc.ref),data=current.data()
      if(data.endedAt===null)tx.update(doc.ref,{endedAt:time,durationMs:Math.max(0,time-data.startedAt),updatedAt:time})
    })))
  }
}
