import {test} from 'node:test'
import assert from 'node:assert/strict'
import {errorMessage,notify,toasts,dismissToast,runToastAction} from '../src/services/toast.js'
test('Firebase and device errors become readable messages, without raw codes',()=>{
  assert.match(errorMessage({code:'auth/email-already-in-use'}),/sudah terdaftar/)
  assert.match(errorMessage('Firebase: Error (auth/email-already-in-use).'),/sudah terdaftar/)
  assert.match(errorMessage({name:'NotAllowedError',message:'Permission denied'}),/Izin/)
  assert.match(errorMessage({code:'ERR_NETWORK'}),/koneksi/)
  assert.doesNotMatch(errorMessage({response:{status:500,data:{message:'secret stack trace'}}}),/secret|stack/)
  assert.equal(errorMessage({response:{status:502,data:{success:false,message:'Approval revoked, but disconnection failed. Retry Remove.'}}}),'Approval revoked, but disconnection failed. Retry Remove.')
})
test('duplicate notifications are suppressed and visible notifications are bounded',()=>{
  notify('Unique test',{duration:0});notify('Unique test',{duration:0})
  assert.equal(toasts.value.length,1)
  for(let i=0;i<5;i++)notify(`Notice ${i}`,{duration:0})
  assert.equal(toasts.value.length,4)
  toasts.value.forEach(item=>dismissToast(item.id))
  assert.equal(toasts.value.length,0)
})

test('confirmation actions run once and closing a toast does not perform the action',async()=>{
  let calls=0
  const action={label:'Hapus',run:()=>calls++}
  const first=notify('Delete test',{duration:0,actions:[action]})
  dismissToast(first);await runToastAction(first,action);assert.equal(calls,0)
  const second=notify('Delete test',{duration:0,actions:[action]})
  await runToastAction(second,action);await runToastAction(second,action);assert.equal(calls,1)
})
