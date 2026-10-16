import { test,before,beforeEach,after,mock } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import express from 'express'
import { AccessToken } from 'livekit-server-sdk'
import {records,db,adminAuth} from '../testing/firestore.js'
mock.module('../src/config/firebase.js',{namedExports:{db,adminAuth}})
const {recordUsage,mergeParticipantSession}=await import('../src/services/usage.service.js')
const {default:webhooks}=await import('../src/routes/webhooks.js')
process.env.LIVEKIT_API_KEY='test-key'
process.env.LIVEKIT_API_SECRET='test-secret-with-at-least-thirty-two-characters'
const event=(kind,time,id=kind)=>({id,event:kind,createdAt:String(time),room:{name:'room',sid:'RM_1'},participant:{sid:'PA_1',identity:'guest-test',name:'Guest',joinedAt:'100'}})
let server,base
before(async()=>{server=express().use('/webhooks',webhooks).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/webhooks/livekit`})
after(async()=>{await new Promise(resolve=>server.close(resolve))})
beforeEach(()=>{records.clear();records.set('rooms/room',{name:'Test room',mode:'professional',hostUid:'owner'})})
test('participant sessions handle duplicate and out-of-order events without counting duration twice',async()=>{
  await recordUsage(event('participant_left',160))
  await recordUsage(event('participant_joined',100))
  await recordUsage(event('participant_left',160))
  const session=records.get('usageSessions/RM_1_PA_1')
  assert.equal(session.startedAt,100000)
  assert.equal(session.endedAt,160000)
  assert.equal(session.durationMs,60000)
  assert.equal([...records.keys()].filter(key=>key.startsWith('usageSessions/')).length,1)
  assert.equal(mergeParticipantSession(null,event('participant_joined',100)).durationMs,0)
})
test('finished rooms close orphan sessions and delayed joins cannot reopen them',async()=>{
  await recordUsage(event('participant_joined',100))
  await recordUsage(event('room_finished',200))
  assert.equal(records.get('usageSessions/RM_1_PA_1').durationMs,100000)
  const delayed=event('participant_joined',150,'delayed');delayed.participant.sid='PA_2'
  await recordUsage(delayed)
  await recordUsage(event('room_started',90))
  assert.equal(records.get('usageSessions/RM_1_PA_2').endedAt,200000)
  assert.equal(records.get('liveRooms/RM_1').active,false)
  assert.equal(records.get('liveRooms/RM_1').startedAt,90000)
})
test('unknown rooms and path injection events do not create analytics records',async()=>{
  const unknown=event('participant_joined',100);unknown.room.name='unknown'
  await recordUsage(unknown)
  await recordUsage(event('participant_joined',100,'unsafe/path'))
  assert.equal(records.size,1)
})
test('webhooks require a valid signature bound to the exact request body',async()=>{
  const body=JSON.stringify(event('participant_joined',100))
  const token=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET)
  token.sha256=createHash('sha256').update(body).digest('base64')
  const jwt=await token.toJwt()
  const send=(text,auth)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/webhook+json',...(auth?{Authorization:auth}:{})},body:text})
  assert.equal((await send(body)).status,401)
  assert.equal((await send(body+' ',jwt)).status,401)
  assert.equal((await send(body,jwt)).status,200)
  assert.equal(records.get('usageSessions/RM_1_PA_1').startedAt,100000)
})
