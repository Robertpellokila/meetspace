import {test,mock} from 'node:test'
import assert from 'node:assert/strict'
import {resolveMood,moods} from '../src/config/moods.js'
mock.module('../src/services/api.js',{defaultExport:{get:async()=>{throw Error('offline')}}})
const {useMeetingTimer}=await import('../src/composables/useMeetingTimer.js')
globalThis.document={addEventListener(){},removeEventListener(){}}
test('late joiners see the same elapsed time despite different device clocks',()=>{
  let tick=1000
  const perf=mock.method(performance,'now',()=>tick)
  const wall=mock.method(Date,'now',()=>9999999999999)
  try{
    const host=useMeetingTimer('room'),guest=useMeetingTimer('room'),start=Date.parse('2026-10-15T00:00:00Z')
    host.synchronize(start,{serverNow:start,receivedAt:1000,roundTripMs:0})
    tick=121000
    wall.mock.mockImplementation(()=>100)
    guest.synchronize(start,{serverNow:start+120000,receivedAt:121000,roundTripMs:0})
    host.updateTimer();guest.updateTimer()
    assert.equal(host.elapsed.value,'02:00');assert.equal(guest.elapsed.value,host.elapsed.value)
    tick+=3600000;host.updateTimer();guest.updateTimer()
    assert.equal(host.elapsed.value,'01:02:00');assert.equal(guest.elapsed.value,host.elapsed.value)
  }finally{perf.mock.restore();wall.mock.restore()}
})
test('invalid clock data stays unavailable instead of inventing a per-participant timer',()=>{
  const timer=useMeetingTimer('room')
  assert.equal(timer.synchronize(undefined,{serverNow:Date.now()}),false)
  assert.equal(timer.synchronize('2026-10-15',{}),false)
  assert.equal(timer.elapsed.value,'--:--')
})
test('every stored room mood is used by default, and local overrides can be reset',()=>{
  for(const mood of Object.keys(moods))assert.equal(resolveMood(mood,'default'),mood)
  assert.equal(resolveMood('forestRetreat','romantic'),'romantic')
  assert.equal(resolveMood('forestRetreat','default'),'forestRetreat')
  assert.equal(resolveMood('forestRetreat','invalid'),'forestRetreat')
})
