import {test,before,beforeEach,after,mock} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {AccessToken} from 'livekit-server-sdk'
import {records,db} from '../testing/firestore.js'
mock.module('../src/config/firebase.js',{namedExports:{db}})
process.env.LIVEKIT_API_KEY='test-key';process.env.LIVEKIT_API_SECRET='test-secret-at-least-thirty-two-characters'
const {default:router}=await import('../src/routes/whiteboard.routes.js')
let server,base,hostToken,guestToken
before(async()=>{
  server=express().use('/api/whiteboards',router).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/whiteboards`
  hostToken=await token('host-owner');guestToken=await token('guest-visitor')
})
after(async()=>{await new Promise(resolve=>server.close(resolve))})
beforeEach(()=>{records.clear();records.set('rooms/study-room',{id:'study-room',mode:'study',hostUid:'owner',status:'active'});records.set('rooms/study-room/joinRequests/visitor',{status:'approved',expiresAt:Date.now()+60000})})
async function token(identity,room='study-room',ttl='10m'){const at=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity,ttl});at.addGrant({roomJoin:true,room,canPublishData:true});return at.toJwt()}
async function request(auth,{room='study-room',operation,id='operation-1'}={}){const res=await fetch(`${base}/${room}${operation?'/operations':''}`,{method:operation?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:operation?JSON.stringify({id,operation}):undefined});return {status:res.status,body:await res.json()}}
const pen={id:'stroke-1',type:'pen',width:4,color:'#4F5B2A',points:[{x:20,y:30},{x:80,y:90}]}
test('whiteboard requires a room-scoped token and an active approved membership',async()=>{
  assert.equal((await request()).status,401)
  assert.equal((await request('invalid')).status,401)
  assert.equal((await request(await token('host-owner','other-room'))).status,403)
  assert.equal((await request(hostToken)).status,200)
  assert.equal((await request(guestToken)).status,200)
  records.get('rooms/study-room/joinRequests/visitor').status='revoked'
  assert.equal((await request(guestToken)).status,403)
  assert.equal((await request(guestToken,{operation:{type:'add',pageId:'page-1',object:pen}})).status,403)
  records.get('rooms/study-room').status='closed'
  assert.equal((await request(hostToken)).status,404)
})
test('a saved drawing is readable by another participant and retries do not duplicate it',async()=>{
  const op={type:'add',pageId:'page-1',object:pen}
  const saved=await request(hostToken,{operation:op})
  assert.equal(saved.status,200);assert.equal(saved.body.data.version,1)
  assert.deepEqual((await request(guestToken)).body.data.pages[0].objects,[pen])
  assert.equal((await request(hostToken,{operation:op})).body.data.version,1)
  assert.equal(records.get('meetingWhiteboards/study-room').pages[0].objects.length,1)
})
test('page edits and clear persist, while deleting the final page is rejected',async()=>{
  let i=0
  const apply=operation=>request(hostToken,{id:`op-${i++}`,operation})
  assert.equal((await apply({type:'page-delete',id:'page-1'})).status,400)
  await apply({type:'page-add',id:'notes',name:'Notes'})
  await apply({type:'page-rename',id:'notes',name:'Team notes'})
  await apply({type:'add',pageId:'notes',object:{id:'note',type:'sticky',color:'#4F5B2A',width:4,x:12,y:12,text:'Hello team'}})
  assert.equal((await request(guestToken)).body.data.pages[1].objects[0].text,'Hello team')
  await apply({type:'page-clear',pageId:'notes'})
  assert.equal((await request(guestToken)).body.data.pages[1].objects.length,0)
  await apply({type:'page-delete',id:'notes'})
  assert.equal((await request(guestToken)).body.data.pages.length,1)
})
test('invalid shapes and oversized requests cannot corrupt the shared board',async()=>{
  for(const object of [{...pen,width:-1},{...pen,points:[]},{...pen,points:Array(1001).fill({x:0,y:0})}])
    assert.equal((await request(hostToken,{operation:{type:'add',pageId:'page-1',object}})).status,400)
  assert.equal(records.has('meetingWhiteboards/study-room'),false)
  const huge=await request(hostToken,{operation:{type:'add',pageId:'page-1',object:{...pen,extra:'x'.repeat(90000)}}})
  assert.equal(huge.status,413)
  assert.equal(huge.body.success,false)
})

async function control(auth,action,identity){
  const response=await fetch(`${base}/study-room/control`,{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({action,identity})})
  return {status:response.status,body:await response.json()}
}
test('only the host grants a requested turn; exactly one writer can persist changes',async()=>{
  const op={type:'add',pageId:'page-1',object:pen}
  assert.equal((await request(guestToken,{operation:op})).status,403)
  assert.equal((await control(guestToken,'grant','guest-visitor')).status,403)
  assert.equal((await control(hostToken,'grant','guest-visitor')).status,409)
  await control(guestToken,'request');await control(guestToken,'request')
  assert.equal((await request(hostToken)).body.data.control.requests.length,1)
  const granted=await control(hostToken,'grant','guest-visitor')
  assert.equal(granted.status,200)
  assert.equal(granted.body.data.control.writerIdentity,'guest-visitor')
  assert.equal((await request(hostToken,{operation:op})).status,403)
  assert.equal((await request(guestToken,{operation:op})).status,200)
  await control(hostToken,'reclaim')
  assert.equal((await request(guestToken,{id:'stale',operation:{type:'page-clear',pageId:'page-1'}})).status,403)
  assert.equal((await request(hostToken)).body.data.pages[0].objects.length,1)
  assert.equal((await request(hostToken,{id:'host-again',operation:{type:'page-clear',pageId:'page-1'}})).status,200)
})
test('cancel, deny, release and revoked admission keep drawing access bound to the host decision',async()=>{
  await control(guestToken,'request');await control(guestToken,'cancel')
  assert.equal((await control(hostToken,'grant','guest-visitor')).status,409)
  await control(guestToken,'request');await control(hostToken,'deny','guest-visitor')
  assert.equal((await request(hostToken)).body.data.control.requests.length,0)
  await control(guestToken,'request');await control(hostToken,'grant','guest-visitor')
  assert.equal((await control(guestToken,'release')).body.data.control.writerIdentity,'host-owner')
  await control(guestToken,'request')
  records.get('rooms/study-room/joinRequests/visitor').status='revoked'
  assert.equal((await control(hostToken,'grant','guest-visitor')).status,403)
  assert.equal((await control(guestToken,'request')).status,403)
  assert.equal((await request(hostToken)).body.data.control.writerIdentity,'host-owner')
})

test('new infinite-board shapes and move updates persist for a second participant',async()=>{
  for(const type of ['diamond','line','arrow','rectangle','circle']){
    const object={id:type,type,color:'#4F5B2A',width:4,x:-50,y:-20,x2:1600,y2:900}
    assert.equal((await request(hostToken,{id:`add-${type}`,operation:{type:'add',pageId:'page-1',object}})).status,200)
    object.x+=100
    assert.equal((await request(hostToken,{id:`move-${type}`,operation:{type:'update',pageId:'page-1',object}})).status,200)
    const other=await request(guestToken)
    assert.equal(other.body.data.pages[0].objects.find(o=>o.id===type).x,50)
  }
})
