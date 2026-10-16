import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'

const uuid='11111111-1111-4111-8111-111111111111'
let lookups,pushed,errors,successes,lookup,clipboard
const router={push:async target=>{pushed.push(target)}}
mock.module('vue-router',{namedExports:{useRouter:()=>router}})
mock.module('../src/services/api.js',{defaultExport:{get:async path=>{lookups.push(path);return lookup(path)}}})
mock.module('../src/services/toast.js',{namedExports:{toast:{error:error=>errors.push(error),success:message=>successes.push(message)}}})
globalThis.window={location:{origin:'http://localhost:5173'}}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{clipboard=value}}}})
const url=new URL('../src/components/common/JoinSpaceForm.vue',import.meta.url)
const {descriptor}=parse(await readFile(url,'utf8'))
const compiled=compileScript(descriptor,{id:'join-id-test'}).content.replace(/from (["'])([^"']+)\1/g,(_,quote,path)=>`from '${path.startsWith('.')?new URL(path,url).href:import.meta.resolve(path)}'`)
const {default:JoinSpaceForm}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const {copyRoomInvite}=await import('../src/services/roomInvite.js')
const setup=()=>JoinSpaceForm.setup({},{expose(){}})
beforeEach(()=>{lookups=[];pushed=[];errors=[];successes=[];clipboard='';lookup=async()=>({data:{data:{roomId:uuid}}})})

test('numeric and formatted Meeting IDs resolve once and navigate to the existing lobby route',async()=>{
  const form=setup();form.invite.value='3411954496';await form.join()
  assert.deepEqual(lookups,['/rooms/by-code/3411954496'])
  assert.deepEqual(pushed,[{name:'lobby',params:{roomId:uuid}}])
  form.invite.value='341 195 4496';await form.join()
  assert.equal(lookups[1],'/rooms/by-code/3411954496')
  assert.equal(form.joiningByCode.value,false)
})

test('existing UUID and invitation link still open lobby directly',async()=>{
  const form=setup()
  form.invite.value=uuid;await form.join()
  form.invite.value=`http://localhost:5173/lobby/${uuid}`;await form.join()
  assert.equal(lookups.length,0)
  assert.deepEqual(pushed,[{name:'lobby',params:{roomId:uuid}},{name:'lobby',params:{roomId:uuid}}])
})

test('invalid and unknown numbers show retro toast and do not navigate',async()=>{
  const form=setup();form.invite.value='341195449';await form.join()
  assert.match(errors[0],/10 digit/)
  lookup=async()=>{throw Object.assign(Error('Not found'),{response:{status:404,data:{message:'Meeting tidak ditemukan'}}})}
  form.invite.value='3411954496';await form.join()
  assert.equal(errors.length,2)
  assert.deepEqual(pushed,[])
  assert.equal(form.joiningByCode.value,false)
})

test('copy Meeting ID uses 10 digits, while invite link still contains the room UUID',async()=>{
  await copyRoomInvite(uuid,'id','3411954496')
  assert.equal(clipboard,'3411954496')
  await copyRoomInvite(uuid)
  assert.equal(clipboard,`http://localhost:5173/lobby/${uuid}`)
  await copyRoomInvite(uuid,'id','')
  assert.match(errors[0],/belum tersedia/)
  assert.equal(clipboard,`http://localhost:5173/lobby/${uuid}`)
})
