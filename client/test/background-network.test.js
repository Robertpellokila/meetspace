import {test,mock} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {RoomEvent,Track,VideoQuality} from 'livekit-client'
const errors=[]
mock.module('../src/services/toast.js',{namedExports:{toast:{error:e=>errors.push(e)}}})
const {useCameraBackground}=await import('../src/composables/useCameraBackground.js')
const {useConnectionHealth}=await import('../src/composables/useConnectionHealth.js')
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function backgroundFixture(){
  const calls=[],processor={switchTo:async opts=>calls.push(['switch',opts]),destroy:async()=>calls.push(['destroy'])}
  const camera={setProcessor:async p=>calls.push(['set',p]),stopProcessor:async()=>calls.push(['stop'])}
  const room={localParticipant:{getTrackPublication:()=>({track:camera})}}
  const library={supportsBackgroundProcessors:()=>true,BackgroundProcessor:opts=>{calls.push(['create',opts]);return processor}}
  return {calls,processor,camera,room,library}
}
test('background is processed on the published camera and stopped without stopping the camera',async()=>{
  const f=backgroundFixture(),state=useCameraBackground(()=>f.room,async()=>f.library)
  await state.setMode('blur');assert.equal(state.mode.value,'blur');assert.equal(f.calls[0][1].mode,'background-blur')
  await state.setMode('blur');assert.equal(f.calls.filter(([name])=>name==='create').length,1)
  await state.setMode('none');assert.equal(f.calls.at(-1)[0],'stop');assert.equal(state.mode.value,'none')
  await state.cleanup()
})
test('unsupported browser and failed attachment recover to no effect with a toast',async()=>{
  const f=backgroundFixture();f.library.supportsBackgroundProcessors=()=>false
  const state=useCameraBackground(()=>f.room,async()=>f.library)
  await state.setMode('blur');assert.equal(state.supported.value,false);assert.equal(state.mode.value,'none')
  f.library.supportsBackgroundProcessors=()=>true;f.camera.setProcessor=async()=>{throw Error('GPU unavailable')}
  await state.setMode('blur');assert.equal(state.mode.value,'none');assert.ok(errors.some(e=>e.message==='GPU unavailable'))
  await state.cleanup()
})
test('leaving while the processor loads cannot attach a late camera effect',async()=>{
  const f=backgroundFixture(),gate=deferred(),state=useCameraBackground(()=>f.room,()=>gate.promise)
  const setting=state.setMode('blur');await new Promise(r=>setImmediate(r))
  const leaving=state.cleanup();gate.resolve(f.library);await setting;await leaving
  assert.equal(f.calls.filter(([name])=>name==='set').length,0)
})
test('background preference can be selected while the camera is off and is applied when enabled',async()=>{
  const f=backgroundFixture();let enabled=false
  f.room.localParticipant.getTrackPublication=()=>enabled?{track:f.camera}:null
  const state=useCameraBackground(()=>f.room,async()=>f.library)
  await state.setMode('blur');assert.equal(f.calls.length,0)
  enabled=true;await state.sync();assert.equal(f.calls.filter(([name])=>name==='set').length,1)
  await state.cleanup()
})
function networkFixture(){
  const calls=[],room=new EventEmitter();let received=100,lost=1
  const report=()=>new Map([['pair',{type:'candidate-pair',state:'succeeded',nominated:true,currentRoundTripTime:.08}],['rtp',{id:'audio',type:'inbound-rtp',packetsReceived:received,packetsLost:lost,jitter:.015}]])
  const camera={restartTrack:async options=>calls.push(['camera',options]),setDegradationPreference:async()=>{}}
  const publication={kind:'video',source:Track.Source.Camera,setVideoQuality:q=>calls.push(['remote',q]),track:{sid:'remote',getRTCStatsReport:async()=>report()}}
  room.state='connected';room.localParticipant={connectionQuality:'excellent',getTrackPublications:()=>[],getTrackPublication:()=>({track:camera})}
  room.remoteParticipants=new Map([['guest',{getTrackPublications:()=>[publication]}]])
  room.getActiveDevice=()=> 'selected-camera'
  return {room,calls,advance(){received+=99;lost+=1}}
}
test('network metrics come from WebRTC samples, and loss uses interval deltas',async()=>{
  const f=networkFixture(),state=useConnectionHealth();state.attach(f.room)
  await new Promise(r=>setImmediate(r))
  assert.deepEqual(state.metrics.value,{rttMs:80,jitterMs:15,packetLoss:null})
  f.advance();await state.sample();assert.equal(state.metrics.value.packetLoss,1)
  f.room.localParticipant.connectionQuality='poor';f.room.emit(RoomEvent.ConnectionQualityChanged)
  assert.equal(state.quality.value,'poor')
  state.detach();assert.equal(state.metrics.value.rttMs,null);assert.equal(f.room.listenerCount(RoomEvent.ConnectionQualityChanged),0)
})
test('low data reduces camera capture and incoming video without muting microphone',async()=>{
  const f=networkFixture(),state=useConnectionHealth();state.attach(f.room)
  await state.setLowData(true)
  assert.ok(f.calls.some(([kind,value])=>kind==='remote'&&value===VideoQuality.LOW))
  assert.equal(f.calls.find(([kind])=>kind==='camera')[1].resolution.frameRate,15)
  await state.setLowData(false)
  assert.equal(f.calls.filter(([kind])=>kind==='camera').at(-1)[1].resolution.width,1280)
  assert.equal(state.lowData.value,false);state.detach()
})
