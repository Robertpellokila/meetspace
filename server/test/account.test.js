import { test,before,beforeEach,after,mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {records,db,adminAuth} from '../testing/firestore.js'
mock.module('../src/config/firebase.js',{namedExports:{db,adminAuth}})
process.env.ADMIN_UIDS='admin'
const {default:accountRouter}=await import('../src/routes/account.js')
const {default:adminRouter}=await import('../src/routes/admin.js')
const app=express().use(express.json()).use('/account',accountRouter).use('/admin',adminRouter)
let server,base
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`})
after(async()=>{await new Promise(resolve=>server.close(resolve))})
beforeEach(()=>records.clear())
async function request(path,user,body){const res=await fetch(base+path,{method:body?'PATCH':'GET',headers:{'Content-Type':'application/json',...(user?{Authorization:`Bearer ${user}`}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()}}
test('registration defaults pending; profile sync preserves grants and admin is server-controlled',async()=>{
  assert.equal((await request('/account')).status,401)
  const member=await request('/account','owner')
  assert.equal(member.body.data.access,'pending')
  records.get('accounts/owner').access='full'
  records.get('accounts/owner').role='admin'
  const synced=await request('/account','owner')
  assert.equal(synced.body.data.access,'full')
  assert.equal(synced.body.data.role,'member')
  assert.equal((await request('/admin/users','owner')).status,403)
  const admin=await request('/account','admin')
  assert.equal(admin.body.data.role,'admin')
  assert.equal(admin.body.data.access,'full')
})
test('only admins can grant/revoke and each real transition records an audit',async()=>{
  await request('/account','owner')
  assert.equal((await request('/admin/users/owner/access','other',{access:'full'})).status,403)
  assert.equal((await request('/admin/users/owner/access','admin',{access:'admin'})).status,400)
  assert.equal((await request('/admin/users/admin/access','admin',{access:'pending'})).status,403)
  assert.equal((await request('/admin/users/missing/access','admin',{access:'full'})).status,404)
  assert.equal((await request('/admin/users/owner/access','admin',{access:'full',role:'admin'})).status,200)
  await request('/admin/users/owner/access','admin',{access:'full'})
  assert.equal([...records.keys()].filter(key=>key.startsWith('adminAudit/')).length,1)
  await request('/admin/users/owner/access','admin',{access:'pending'})
  const audit=[...records.entries()].filter(([key])=>key.startsWith('adminAudit/')).map(([,value])=>value)
  assert.equal(audit.length,2)
  assert.equal(audit[1].actorUid,'admin')
  assert.equal(records.get('accounts/owner').access,'pending')
})
test('admin list paginates and statistics report persisted usage, never fabricated sessions',async()=>{
  for(let i=0;i<52;i++)records.set(`accounts/member${String(i).padStart(2,'0')}`,{access:'pending',email:`m${i}@example.test`})
  const first=await request('/admin/users','admin')
  assert.equal(first.body.data.users.length,50)
  const second=await request(`/admin/users?cursor=${first.body.data.nextCursor}`,'admin')
  assert.equal(second.body.data.users.length,2)
  const filtered=await request('/admin/users?email=m1%40example.test','admin')
  assert.equal(filtered.body.data.users.length,1)
  records.set('usageSessions/test',{startedAt:1000,endedAt:61000,durationMs:60000})
  records.set('rooms/test',{mode:'professional'})
  const overview=await request('/admin/overview','admin')
  assert.equal(overview.status,200)
  assert.equal(overview.body.data.users,52)
  assert.equal(overview.body.data.durationMs,60000)
  assert.equal(overview.body.data.activeParticipants,0)
  assert.equal(overview.body.data.lastEventAt,null)
})
