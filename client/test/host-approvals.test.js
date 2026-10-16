import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref, nextTick } from 'vue'
let data, get, calls, notices, scopes=[]
mock.module('../src/services/api.js',{defaultExport:{get:async(path,options)=>{calls.push({path,options});return get()},patch:async(path)=>{data=data.filter(r=>!path.includes(r.id))}}})
mock.module('../src/services/toast.js',{namedExports:{toast:{error:e=>notices.push(e),success:m=>notices.push(m)}}})
const {useHostApprovals}=await import('../src/composables/useHostApprovals.js')
const flush=()=>new Promise(resolve=>setImmediate(resolve))
beforeEach(()=>{data=[];calls=[];notices=[];get=async()=>({data:{data:[...data]}})})
afterEach(()=>{scopes.forEach(scope=>scope.stop());scopes=[]})
function setup(enabled=true){const arrivals=[],scope=effectScope();scopes.push(scope);const state=scope.run(()=>useHostApprovals('room',enabled,rows=>arrivals.push(rows)));return {state,arrivals,scope}}
test('host notices each request once with People closed, admits it, and stops polling on leave',async()=>{
  const {state,arrivals,scope}=setup();await flush()
  data=[{id:'first',participantName:'A'}];await state.refresh();await state.refresh()
  assert.equal(arrivals.length,1)
  data.push({id:'second',participantName:'B'});await state.refresh()
  assert.deepEqual(arrivals[1].map(r=>r.id),['second'])
  await state.decide('first','approved');assert.deepEqual(state.requests.value.map(r=>r.id),['second'])
  const signal=calls.at(-1).options.signal
  scope.stop();assert.equal(signal.aborted,true)
  const count=calls.length;await state.refresh();assert.equal(calls.length,count)
})
test('guests never poll and a late response after leave cannot notify',async()=>{
  const enabled=ref(false),{state,arrivals,scope}=setup(enabled)
  assert.equal(calls.length,0)
  let finish;get=()=>new Promise(resolve=>{finish=resolve})
  enabled.value=true;await nextTick();scope.stop()
  finish({data:{data:[{id:'late',participantName:'Late guest'}]}});await flush()
  assert.equal(arrivals.length,0);assert.deepEqual(state.requests.value,[])
})
test('re-enabling monitoring replaces an aborted request without losing the poller',async()=>{
  const enabled=ref(true);let finish
  get=()=>new Promise(resolve=>{finish=resolve})
  const {state,arrivals}=setup(enabled)
  enabled.value=false;await nextTick()
  get=async()=>({data:{data:[{id:'current',participantName:'Current guest'}]}})
  enabled.value=true;await nextTick();await flush()
  finish({data:{data:[{id:'old',participantName:'Old guest'}]}});await flush()
  assert.deepEqual(state.requests.value.map(r=>r.id),['current'])
  assert.equal(arrivals.length,1)
})
