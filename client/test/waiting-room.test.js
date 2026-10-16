import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ref } from 'vue'

let mounted,unmounted,response,posts,emitted,bodies
const storage=new Map()
globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
mock.module('vue',{namedExports:{ref,onMounted:fn=>{mounted=fn},onUnmounted:fn=>{unmounted=fn}}})
mock.module('../src/composables/useErrorToast.js',{namedExports:{useErrorToast:()=>{}}})
mock.module('../src/services/api.js',{defaultExport:{get:async()=>response(),post:async(_path,body)=>{posts++;bodies.push(body);return {data:{data:{requestId:'request',guestSecret:'secret'}}}}}})
const source=await readFile(new URL('../src/components/meeting/GuestWaitingRoom.vue',import.meta.url),'utf8')
const {descriptor}=parse(source)
const compiled=compileScript(descriptor,{id:'waiting-room-test'}).content
  .replace(/from 'vue'/g,`from '${import.meta.resolve('vue')}'`)
  .replaceAll("from '../../services/api'",`from '${new URL('../src/services/api.js',import.meta.url).href}'`)
const rewritten=compiled.replaceAll("from '../../composables/useErrorToast.js'",`from '${new URL('../src/composables/useErrorToast.js',import.meta.url).href}'`)
const {default:WaitingRoom}=await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`)
beforeEach(()=>{storage.clear();posts=0;bodies=[];emitted=[];response=async()=>({data:{data:{status:'pending'}}})})
afterEach(()=>unmounted?.())
function setup(props={}){return WaitingRoom.setup({...props,roomId:'room',participantName:'Visitor',disabled:false},{expose(){},emit:(...args)=>emitted.push(args)})}

test('returning to lobby with approval waits for an explicit Join instead of rejoining after Leave',async()=>{
  sessionStorage.setItem('meetspace:approval:room',JSON.stringify({requestId:'request',guestSecret:'secret',participantName:'Visitor'}))
  response=async()=>({data:{data:{status:'approved'}}})
  const component=setup()
  await mounted()
  assert.equal(component.status.value,'approved')
  assert.equal(emitted.length,0)
  await component.requestAdmission()
  assert.equal(emitted[0][0],'approved')
  assert.equal(posts,0)
})
test('repeated clicks create one request and admission retains the original name',async()=>{
  const component=setup()
  await Promise.all([component.requestAdmission(),component.requestAdmission()])
  assert.equal(posts,1)
  assert.equal(component.status.value,'pending')
  const credentials=JSON.parse(sessionStorage.getItem('meetspace:approval:room'))
  assert.equal(credentials.participantName,'Visitor')
  response=async()=>({data:{data:{status:'approved'}}})
  await component.checkStatus(credentials)
  assert.equal(emitted[0][1].participantName,'Visitor')
})
test('an approval arriving after navigation cannot emit a join',async()=>{
  let finish
  response=()=>new Promise(resolve=>{finish=resolve})
  const component=setup()
  const pending=component.checkStatus({requestId:'request',guestSecret:'secret'})
  unmounted()
  finish({data:{data:{status:'approved'}}})
  await pending
  assert.equal(emitted.length,0)
})

test('room password is sent only for admission and never stored with guest credentials',async()=>{
  const component=setup({passwordProtected:true})
  component.password.value='A-retro-secret'
  await component.requestAdmission()
  assert.equal(bodies[0].password,'A-retro-secret')
  assert.equal(component.password.value,'')
  assert.ok(!sessionStorage.getItem('meetspace:approval:room').includes('A-retro-secret'))
  assert.equal(JSON.parse(sessionStorage.getItem('meetspace:approval:room')).password,undefined)
})
