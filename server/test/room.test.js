import { test, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { AccessToken, TrackSource } from 'livekit-server-sdk'

const roomId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
import {records,db,adminAuth} from '../testing/firestore.js'
const calls = []
let people = []
let removalFails = false
const roomPath = `rooms/${roomId}`
const requestPath = `${roomPath}/joinRequests/${requestId}`
mock.module('../src/config/firebase.js', { namedExports:{db,adminAuth} })
mock.module('livekit-server-sdk', { namedExports:{AccessToken,TrackSource,RoomServiceClient:class {
  async deleteRoom(id){calls.push(['delete',id]);if(removalFails)throw Error('Simulated outage')}
  async getParticipant(_room, identity) {return people.find(p=>p.identity===identity)}
  async listParticipants() {return people}
  async mutePublishedTrack(...args) {calls.push(['mute',...args])}
  async updateParticipant(...args) {calls.push(['update',...args])}
  async removeParticipant(...args) {
    assert.equal(records.get(requestPath).status,'revoked','approval must be revoked before disconnect')
    if(removalFails)throw Error('Simulated provider outage')
    calls.push(['remove',...args])
  }
} } })
process.env.LIVEKIT_URL='wss://test.invalid'
process.env.LIVEKIT_API_KEY='test-key'
process.env.LIVEKIT_API_SECRET='test-secret-at-least-thirty-two-characters'
const {default:router}=await import('../src/routes/room.js')
const app=express().use(express.json()).use('/api/rooms',router)
let server, base
before(async()=>{
  server=app.listen(0,'127.0.0.1')
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)})
  base=`http://127.0.0.1:${server.address().port}/api/rooms`
})
after(async()=>{await new Promise(resolve=>server.close(resolve))})
beforeEach(()=>{
  records.clear();calls.length=0;removalFails=false
  records.set('accounts/owner',{uid:'owner',access:'full'})
  records.set(roomPath,{id:roomId,name:'Professional test',mode:'professional',theme:'midnight',hostUid:'owner',status:'active'})
  people=[
    {identity:'host-owner',tracks:[{sid:'host-mic',source:TrackSource.MICROPHONE}]},
    {identity:`guest-${requestId}`,tracks:[{sid:'guest-mic',source:TrackSource.MICROPHONE},{sid:'screen-audio',source:TrackSource.SCREEN_SHARE_AUDIO},{sid:'camera',source:TrackSource.CAMERA}]},
  ]
})
async function request(path='',{method='GET',user,body,secret}={}) {
  const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:`Bearer ${user}`} : {}),...(secret?{'x-meetspace-guest-secret':secret}:{})},body:body?JSON.stringify(body):undefined})
  return {status:response.status,body:await response.json()}
}
const actionPath=`/${roomId}/participants/guest-${requestId}/actions`
function seedGuest(status='approved') {records.set(requestPath,{status,participantName:'Guest',createdAt:Date.now(),expiresAt:Date.now()+60000})}

test('Create Room requires Firebase auth and validates the existing mode/mood catalog',async()=>{
  const body={name:'Team space',mode:'professional',theme:'focus'}
  assert.equal((await request('',{method:'POST',body})).status,401)
  assert.equal((await request('',{method:'POST',body,user:'invalid'})).status,401)
  assert.equal((await request('',{method:'POST',body:{...body,theme:'romantic'},user:'owner'})).status,400)
  const created=await request('',{method:'POST',body,user:'owner'})
  assert.equal(created.status,201)
  assert.equal(records.get(`rooms/${created.body.data.id}`).hostUid,'owner')
  assert.equal(created.body.data.hostUid,undefined)
})
test('guest admission requires the secret and host approval, then issues a scoped token',async()=>{
  const created=await request(`/${roomId}/join-requests`,{method:'POST',body:{participantName:'Visitor'}})
  assert.equal(created.status,201)
  const credentials=created.body.data
  const path=`/${roomId}/join-requests/${credentials.requestId}`
  assert.equal((await request(`${path}/status`,{secret:'a'.repeat(64)})).status,404)
  assert.equal((await request(`${path}/status`,{secret:credentials.guestSecret})).body.data.status,'pending')
  assert.equal((await request(`/${roomId}/token`,{method:'POST',body:credentials})).status,403)
  assert.equal((await request(path,{method:'PATCH',user:'other',body:{status:'approved'}})).status,403)
  assert.equal((await request(path,{method:'PATCH',user:'owner',body:{status:'approved'}})).status,200)
  assert.equal((await request(path,{method:'PATCH',user:'owner',body:{status:'rejected'}})).status,409)
  const token=await request(`/${roomId}/token`,{method:'POST',body:credentials})
  assert.equal(token.status,200)
  assert.equal(token.body.data.isHost,false)
  assert.equal(token.body.data.room.hostIdentity,'host-owner')
  const claims=JSON.parse(Buffer.from(token.body.data.token.split('.')[1],'base64url'))
  assert.equal(claims.sub,`guest-${credentials.requestId}`)
  assert.equal(claims.name,'Visitor')
  assert.equal(claims.video.room,roomId)
  assert.equal(claims.video.canUpdateOwnMetadata,true)
  assert.notEqual(claims.video.roomAdmin,true)
  records.get(`${roomPath}/joinRequests/${credentials.requestId}`).status='revoked'
  assert.equal((await request(`/${roomId}/token`,{method:'POST',body:credentials})).status,403)
})
test('host token uses the lobby name, keeps email private, and omits client admin grants',async()=>{
  const response=await request(`/${roomId}/token`,{method:'POST',user:'owner',body:{participantName:'Host Name'}})
  assert.equal(response.status,200)
  assert.equal(response.body.data.isHost,true)
  assert.equal(response.body.data.room.hostIdentity,'host-owner')
  const claims=JSON.parse(Buffer.from(response.body.data.token.split('.')[1],'base64url'))
  assert.equal(claims.name,'Host Name')
  assert.notEqual(claims.video.roomAdmin,true)
  assert.equal(response.body.data.room.hostUid,undefined)
})
test('expired admissions cannot be approved and do not fill the waiting room',async()=>{
  seedGuest('pending');records.get(requestPath).expiresAt=Date.now()-1
  const list=await request(`/${roomId}/join-requests`,{user:'owner'})
  assert.deepEqual(list.body.data,[])
  assert.equal((await request(`/${roomId}/join-requests/${requestId}`,{method:'PATCH',user:'owner',body:{status:'approved'}})).status,409)
})
test('moderation rejects anonymous users, other owners, host targets, and other modes',async()=>{
  for(const user of [undefined,'other']) {
    assert.equal((await request(actionPath,{method:'POST',user,body:{action:'mute'}})).status,user?403:401)
    assert.equal((await request(`/${roomId}/mute-all`,{method:'POST',user})).status,user?403:401)
  }
  assert.equal((await request(`/${roomId}/participants/host-owner/actions`,{method:'POST',user:'owner',body:{action:'remove'}})).status,400)
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'unmute'}})).status,400)
  records.get(roomPath).mode='study'
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'mute'}})).status,400)
  assert.equal(calls.length,0)
})
test('mute targets only microphone tracks; mute all excludes the host',async()=>{
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'mute'}})).status,200)
  assert.deepEqual(calls,[['mute',roomId,`guest-${requestId}`,'guest-mic',true]])
  calls.length=0
  assert.equal((await request(`/${roomId}/mute-all`,{method:'POST',user:'owner'})).status,200)
  assert.deepEqual(calls,[['mute',roomId,`guest-${requestId}`,'guest-mic',true]])
})
test('lower hand updates replicated participant attributes',async()=>{
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'lower-hand'}})).status,200)
  assert.deepEqual(calls,[['update',roomId,`guest-${requestId}`,{attributes:{'meetspace.handRaised':''}}]])
})
test('remove revokes approval before disconnecting and can retry provider failure',async()=>{
  seedGuest();removalFails=true
  const failed=await request(actionPath,{method:'POST',user:'owner',body:{action:'remove'}})
  assert.equal(failed.status,502)
  assert.match(failed.body.message,/Approval revoked/)
  assert.equal(records.get(requestPath).status,'revoked')
  removalFails=false
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'remove'}})).status,200)
  assert.equal(calls[0][0],'remove')
  assert.equal(typeof calls[0][3].revokeTokenTs,'bigint')
})
test('malformed identifiers and closed rooms fail without database path traversal',async()=>{
  assert.equal((await request('/invalid')).status,400)
  assert.equal((await request(`/${roomId}/token`,{method:'POST',body:{requestId:'x/y',guestSecret:'a'.repeat(64)}})).status,403)
  records.get(roomPath).status='closed'
  assert.equal((await request(`/${roomId}/my-role`,{user:'owner'})).status,404)
  assert.equal((await request(actionPath,{method:'POST',user:'owner',body:{action:'mute'}})).status,404)
})

test('new accounts can request admission but cannot create rooms or mint host tokens',async()=>{
  records.delete('accounts/owner')
  assert.equal((await request('',{method:'POST',user:'owner',body:{name:'Denied',mode:'professional',theme:'focus'}})).status,403)
  assert.equal((await request(`/${roomId}/token`,{method:'POST',user:'owner'})).status,403)
  assert.equal((await request(`/${roomId}/join-requests`,{method:'POST',user:'other',body:{participantName:'New member'}})).status,201)
})
test('breakouts enforce owner, admission, capacity and parent room binding',async()=>{
  assert.equal((await request(`/${roomId}/breakouts`,{method:'POST',user:'other',body:{count:2}})).status,403)
  assert.equal((await request(`/${roomId}/breakouts`)).status,403)
  const created=await request(`/${roomId}/breakouts`,{method:'POST',user:'owner',body:{count:2}})
  assert.equal(created.status,201)
  const child=created.body.data[0]
  assert.equal((await request(`/${roomId}/breakouts`,{method:'POST',user:'owner',body:{count:5}})).status,409)
  assert.equal((await request(`/${child.id}/breakouts`,{method:'POST',user:'owner',body:{count:1}})).status,400)
  const admission=await request(`/${roomId}/join-requests`,{method:'POST',body:{participantName:'Visitor'}})
  const credentials=admission.body.data
  const joinPath=`/${roomId}/breakouts/${child.id}/join`
  assert.equal((await request(joinPath,{method:'POST',body:credentials})).status,403)
  await request(`/${roomId}/join-requests/${credentials.requestId}`,{method:'PATCH',user:'owner',body:{status:'approved'}})
  const moved=await request(joinPath,{method:'POST',body:credentials})
  assert.equal(moved.status,200)
  assert.equal((await request(`/${child.id}/token`,{method:'POST',body:moved.body.data})).status,200)
  assert.equal((await request(`/${child.id}/breakouts/${roomId}/join`,{method:'POST',user:'owner'})).status,404)
  records.get(`${roomPath}/joinRequests/${credentials.requestId}`).status='revoked'
  assert.equal((await request(`/${child.id}/token`,{method:'POST',body:moved.body.data})).status,403)
})
test('end closes parent and children before media disconnection and supports retry',async()=>{
  const created=await request(`/${roomId}/breakouts`,{method:'POST',user:'owner',body:{count:2}})
  assert.equal((await request(`/${roomId}/end`,{method:'POST',user:'other'})).status,403)
  removalFails=true
  assert.equal((await request(`/${roomId}/end`,{method:'POST',user:'owner'})).status,502)
  for(const id of [roomId,...created.body.data.map(room=>room.id)])assert.equal(records.get(`rooms/${id}`).status,'closed')
  assert.equal((await request(`/${roomId}/token`,{method:'POST',user:'owner'})).status,404)
  removalFails=false
  assert.equal((await request(`/${roomId}/end`,{method:'POST',user:'owner'})).status,200)
})

test('the room clock starts only on admission and stays shared across later joins',async()=>{
  assert.equal(records.get(roomPath).startedAt,undefined)
  await request(`/${roomId}/token`,{method:'POST',body:{}})
  assert.equal(records.get(roomPath).startedAt,undefined)
  const first=await request(`/${roomId}/token`,{method:'POST',user:'owner'})
  const start=first.body.data.room.startedAt
  assert.ok(Number.isFinite(Date.parse(start)))
  assert.ok(Number.isFinite(first.body.data.serverNow))
  const second=await request(`/${roomId}/token`,{method:'POST',user:'owner'})
  assert.equal(second.body.data.room.startedAt,start)
  const publicRoom=await request(`/${roomId}`)
  assert.equal(publicRoom.body.data.startedAt,start)
  assert.ok(Number.isFinite(publicRoom.body.serverNow))
  assert.equal(publicRoom.body.data.hostUid,undefined)
})

test('password rooms verify admission on the server, keep approval mandatory, and never expose password material',async()=>{
  const password='Club-retro-2026'
  const created=await request('',{method:'POST',user:'owner',body:{name:'Private club',mode:'study',theme:'forestRetreat',password}})
  assert.equal(created.status,201)
  const id=created.body.data.id, stored=records.get(`rooms/${id}`)
  assert.equal(created.body.data.passwordProtected,true)
  assert.match(stored.passwordHash,/^scrypt:/)
  assert.ok(!stored.passwordHash.includes(password))
  for(const supplied of [undefined,'wrong password',null,{invalid:true}]){
    assert.equal((await request(`/${id}/join-requests`,{method:'POST',body:{participantName:'Guest',password:supplied}})).status,403)
  }
  assert.equal([...records.keys()].filter(key=>key.startsWith(`rooms/${id}/joinRequests/`)).length,0)
  const admission=await request(`/${id}/join-requests`,{method:'POST',body:{participantName:'Guest',password}})
  assert.equal(admission.status,201)
  assert.equal((await request(`/${id}/token`,{method:'POST',body:{password}})).status,403)
  assert.equal((await request(`/${id}/token`,{method:'POST',body:admission.body.data})).status,403)
  await request(`/${id}/join-requests/${admission.body.data.requestId}`,{method:'PATCH',user:'owner',body:{status:'approved'}})
  const token=await request(`/${id}/token`,{method:'POST',body:admission.body.data})
  assert.equal(token.status,200)
  const host=await request(`/${id}/token`,{method:'POST',user:'owner'})
  assert.equal(host.status,200)
  for(const response of [created,await request(`/${id}`),token,host]){
    assert.ok(!JSON.stringify(response.body).includes(stored.passwordHash))
    assert.ok(!JSON.stringify(response.body).includes(password))
    assert.equal((response.body.data.room || response.body.data).passwordProtected,true)
  }
})
test('password validation and all five mode/mood combinations remain compatible with unprotected rooms',async()=>{
  for(const password of ['short',123,null,'x'.repeat(129),'      ']){
    assert.equal((await request('',{method:'POST',user:'owner',body:{name:'Room',mode:'study',theme:'focus',password}})).status,400)
  }
  for(const [mode,theme] of [['professional','midnight'],['study','focus'],['watchParty','romantic'],['hangout','vintageCafe'],['gameNight','arcade']]){
    const created=await request('',{method:'POST',user:'owner',body:{name:'Mode test',mode,theme}})
    assert.equal(created.status,201)
    assert.equal(created.body.data.passwordProtected,false)
    assert.equal((await request(`/${created.body.data.id}/join-requests`,{method:'POST',body:{participantName:'Guest'}})).status,201)
  }
})

test('breakouts inherit parent password for direct admission while approved parent guests can move',async()=>{
  const password='Retro-breakouts'
  const created=await request('',{method:'POST',user:'owner',body:{name:'Protected team',mode:'professional',theme:'focus',password}})
  const parent=created.body.data.id
  const children=await request(`/${parent}/breakouts`,{method:'POST',user:'owner',body:{count:1}})
  assert.equal(children.status,201)
  const child=children.body.data[0].id
  assert.equal((await request(`/${child}/join-requests`,{method:'POST',body:{participantName:'Outsider'}})).status,403)
  assert.equal((await request(`/${child}`)).body.data.passwordProtected,true)
  const admission=await request(`/${parent}/join-requests`,{method:'POST',body:{participantName:'Member',password}})
  await request(`/${parent}/join-requests/${admission.body.data.requestId}`,{method:'PATCH',user:'owner',body:{status:'approved'}})
  const move=await request(`/${parent}/breakouts/${child}/join`,{method:'POST',body:admission.body.data})
  assert.equal(move.status,200)
  assert.equal((await request(`/${child}/token`,{method:'POST',body:move.body.data})).status,200)
})

test('a new room gets a unique 10-digit Meeting ID that resolves to its UUID without granting access',async()=>{
  const first=await request('',{method:'POST',user:'owner',body:{name:'First',mode:'study',theme:'focus'}})
  const second=await request('',{method:'POST',user:'owner',body:{name:'Second',mode:'study',theme:'focus'}})
  assert.equal(first.status,201);assert.equal(second.status,201)
  const code=first.body.data.meetingId
  assert.match(code,/^\d{10}$/)
  assert.notEqual(code,second.body.data.meetingId)
  assert.equal(records.get(`meetingCodes/${code}`).roomId,first.body.data.id)
  const found=await request(`/by-code/${code}`)
  assert.equal(found.status,200)
  assert.deepEqual(found.body.data,{roomId:first.body.data.id,meetingId:code})
  assert.equal((await request(`/${first.body.data.id}/token`,{method:'POST',body:{meetingId:code}})).status,403)
  assert.equal((await request(`/by-code/${'0'.repeat(10)}`)).status,404)
  assert.equal((await request('/by-code/12345')).status,400)
  records.get(`rooms/${first.body.data.id}`).status='ended'
  assert.equal((await request(`/by-code/${code}`)).status,404)
})

test('an older active room gets one durable Meeting ID when opened',async()=>{
  const first=await request(`/${roomId}`)
  assert.equal(first.status,200)
  const code=first.body.data.meetingId
  assert.match(code,/^\d{10}$/)
  const second=await request(`/${roomId}`)
  assert.equal(second.body.data.meetingId,code)
  assert.equal((await request(`/by-code/${code}`)).body.data.roomId,roomId)
  const token=await request(`/${roomId}/token`,{method:'POST',user:'owner'})
  assert.equal(token.body.data.room.meetingId,code)
})

test('a direct host join gives an older room its Meeting ID; forged code records do not resolve',async()=>{
  const token=await request(`/${roomId}/token`,{method:'POST',user:'owner'})
  assert.match(token.body.data.room.meetingId,/^\d{10}$/)
  records.set('meetingCodes/3411954496',{roomId})
  assert.equal((await request('/by-code/3411954496')).status,404)
})
