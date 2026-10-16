import { test, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { RoomEvent, Track } from 'livekit-client'
import { useParticipants } from '../src/composables/useParticipants.js'
import { useScreenShare } from '../src/composables/useScreenShare.js'

const requests=[]
const disconnected=[]
let response, connect
mock.module('../src/services/api.js',{defaultExport:{post:async(path,body)=>{requests.push({path,body});return response()}}})
mock.module('../src/services/livekit.js',{namedExports:{connectToMeeting:async()=>connect(),disconnectFromMeeting:async room=>disconnected.push(room)}})
const {useLiveKitRoom}=await import('../src/composables/useLiveKitRoom.js')
const storage=new Map()
globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}
beforeEach(()=>{
  requests.length=0;disconnected.length=0;storage.clear()
  response=async()=>({data:{data:{serverUrl:'wss://test.invalid',token:'test',room:{id:'room'},isHost:false}}})
  connect=async()=>new EventEmitter()
})
function participant(identity,attributes={}) {
  return {identity,name:identity,attributes,isMicrophoneEnabled:false,publications:[],getTrackPublications(){return this.publications}}
}
function roomFixture() {
  const room=new EventEmitter()
  room.localParticipant=participant('host-owner')
  room.remoteParticipants=new Map([['guest-visitor',participant('guest-visitor',{'meetspace.handRaised':'true'})]])
  return room
}

test('participants include existing raised hands for late joiners and follow host lowering',()=>{
  const room=roomFixture(),state=useParticipants()
  state.attach(room)
  assert.equal(state.participants.value[0].isHost,true)
  assert.equal(state.participants.value[1].handRaised,true)
  room.remoteParticipants.get('guest-visitor').attributes['meetspace.handRaised']=''
  room.emit(RoomEvent.ParticipantAttributesChanged)
  assert.equal(state.participants.value[1].handRaised,false)
  state.detach()
  assert.equal(room.listenerCount(RoomEvent.ParticipantAttributesChanged),0)
  assert.deepEqual(state.participants.value,[])
})
test('host mute updates mic state even when the audio track is not subscribed',()=>{
  const room=roomFixture(),state=useParticipants()
  const guest=room.remoteParticipants.get('guest-visitor')
  guest.isMicrophoneEnabled=true
  state.attach(room)
  assert.equal(state.participants.value[1].audioTrack,null)
  assert.equal(state.participants.value[1].micMuted,false)
  guest.isMicrophoneEnabled=false
  room.emit(RoomEvent.TrackMuted)
  assert.equal(state.participants.value[1].micMuted,true)
  state.detach()
})
test('screen share starts, native browser stop clears it, and failed permission can retry',async()=>{
  const room=roomFixture(),state=useParticipants()
  state.attach(room)
  const screen=useScreenShare(state.participants,()=>room,state.sync)
  room.localParticipant.setScreenShareEnabled=async enabled=>{
    room.localParticipant.isScreenShareEnabled=enabled
    room.localParticipant.publications=enabled?[{source:Track.Source.ScreenShare,isMuted:false,track:{kind:'video'}}]:[]
    room.emit(enabled?RoomEvent.LocalTrackPublished:RoomEvent.LocalTrackUnpublished)
  }
  await screen.toggle()
  assert.equal(screen.isSharing.value,true)
  assert.equal(screen.sharer.value.id,'host-owner')
  await room.localParticipant.setScreenShareEnabled(false)
  assert.equal(screen.isSharing.value,false)
  assert.equal(screen.sharer.value,null)
  room.localParticipant.setScreenShareEnabled=async()=>{throw Error('Permission denied')}
  await assert.rejects(screen.toggle(),/Permission denied/)
  assert.equal(screen.busy.value,false)
  state.detach()
})
test('guest joins with stored approval, retaining the token response role',async()=>{
  sessionStorage.setItem('meetspace:approval:room',JSON.stringify({requestId:'request',guestSecret:'secret'}))
  const live=useLiveKitRoom()
  const result=await live.join('room','Visitor')
  assert.deepEqual(requests[0],{path:'/rooms/room/token',body:{participantName:'Visitor',requestId:'request',guestSecret:'secret'}})
  assert.equal(result.isHost,false)
  assert.equal(result.token,'test')
  assert.equal(live.token.value,'test')
  assert.equal(live.connection.value,result.livekitRoom)
  let reason
  live.onDisconnect(value=>{reason=value})
  result.livekitRoom.emit(RoomEvent.Disconnected,4)
  assert.equal(reason,4)
  assert.equal(live.connection.value,null)
  await live.leave()
  assert.equal(result.livekitRoom.listenerCount(RoomEvent.Disconnected),0)
})
test('pending approval failure never connects media',async()=>{
  let connected=false
  response=async()=>{throw Object.assign(Error('Forbidden'),{response:{data:{message:'Host approval required'}}})}
  connect=async()=>{connected=true}
  const live=useLiveKitRoom()
  await assert.rejects(live.join('room','Visitor'))
  assert.equal(connected,false)
  assert.equal(live.loading.value,false)
  assert.equal(live.error.value,'Host approval required')
})
test('leaving during connect disconnects only that session when it resolves',async()=>{
  let resolveConnect,started
  const connecting=new Promise(resolve=>{started=resolve})
  connect=()=>{started();return new Promise(resolve=>{resolveConnect=resolve})}
  const live=useLiveKitRoom(),pending=live.join('room','Visitor')
  await connecting
  await live.leave()
  const room=new EventEmitter()
  resolveConnect(room)
  assert.equal(await pending,null)
  assert.deepEqual(disconnected,[room])
  assert.equal(live.connection.value,null)
})

test('whiteboard token refresh reuses approval and never reconnects media',async()=>{
  let connections=0
  connect=async()=>{connections++;return new EventEmitter()}
  const live=useLiveKitRoom();await live.join('room','Visitor')
  response=async()=>({data:{data:{token:'renewed'}}})
  const [a,b]=await Promise.all([live.refreshToken(),live.refreshToken()])
  assert.equal(a,'renewed');assert.equal(b,'renewed')
  assert.equal(live.token.value,'renewed');assert.equal(connections,1);assert.equal(requests.length,2)
  await live.leave();assert.equal(live.token.value,'')
  await assert.rejects(live.refreshToken())
})

test('active speakers update on LiveKit events and muted participants never show as speaking',()=>{
  const room=roomFixture(),state=useParticipants(),guest=room.remoteParticipants.get('guest-visitor')
  state.attach(room)
  guest.isSpeaking=true;guest.isMicrophoneEnabled=true
  room.emit(RoomEvent.ActiveSpeakersChanged,[guest])
  assert.equal(state.participants.value[1].isSpeaking,true)
  guest.isMicrophoneEnabled=false;room.emit(RoomEvent.TrackMuted)
  assert.equal(state.participants.value[1].isSpeaking,false)
  guest.isMicrophoneEnabled=true;guest.isSpeaking=false;room.emit(RoomEvent.ActiveSpeakersChanged,[])
  assert.equal(state.participants.value[1].isSpeaking,false)
  state.detach();assert.equal(room.listenerCount(RoomEvent.ActiveSpeakersChanged),0)
})
