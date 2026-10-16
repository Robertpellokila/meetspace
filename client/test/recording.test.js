import {test,beforeEach,mock} from 'node:test'
import assert from 'node:assert/strict'
const notices=[],downloads=[]
mock.module('../src/services/toast.js',{namedExports:{notify:(message,options)=>notices.push({message,...options}),toast:{error:error=>notices.push({error}),info:message=>notices.push({message})}}})
const {useLocalRecording}=await import('../src/composables/useLocalRecording.js')
let display,video,audio,mic,attributes,room,choose
function track(kind){return {kind,stopped:false,handlers:{},stop(){this.stopped=true},addEventListener(event,fn){this.handlers[event]=fn}}}
class Stream{constructor(tracks){this.tracks=tracks}getTracks(){return this.tracks}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video')}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio')}}
class Recorder{
  static isTypeSupported(){return true}
  constructor(){this.state='inactive';this.mimeType='video/webm'}
  start(){this.state='recording'}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['recorded video'])});this.onstop()})}
}
globalThis.MediaStream=Stream;globalThis.MediaRecorder=Recorder;globalThis.window={MediaRecorder:Recorder}
globalThis.AudioContext=class{resume(){return Promise.resolve()}close(){return Promise.resolve()}createMediaStreamDestination(){return {stream:new Stream([track('audio')])}}createMediaStreamSource(){return {connect(){}}}}
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getDisplayMedia:()=>choose()}},configurable:true})
globalThis.document={createElement:()=>({click(){downloads.push({href:this.href,filename:this.download})}})}
beforeEach(()=>{
  notices.length=0;downloads.length=0;attributes=[]
  video=track('video');audio=track('audio');mic=track('audio');display=new Stream([video,audio]);choose=async()=>display
  room={localParticipant:{getTrackPublication:()=>({track:{mediaStreamTrack:mic}}),setAttributes:async value=>attributes.push(value)}}
})
test('stop saves a local recording, clears the indicator, and preserves the meeting mic',async()=>{
  const recording=useLocalRecording(()=>room)
  await recording.toggle()
  assert.equal(recording.recording.value,true)
  assert.equal(attributes[0]['meetspace.recording'],'true')
  await recording.toggle()
  assert.equal(recording.recording.value,false)
  assert.equal(recording.busy.value,false)
  assert.equal(video.stopped,true);assert.equal(audio.stopped,true);assert.equal(mic.stopped,false)
  assert.equal(attributes.at(-1)['meetspace.recording'],'')
  assert.equal(downloads.length,1)
  assert.match(downloads[0].filename,/\.webm$/)
  assert.equal(notices.find(n=>n.href)?.duration,0)
  URL.revokeObjectURL(downloads[0].href)
})
test('browser stop and navigation cleanup finalize once without discarding the file',async()=>{
  const recording=useLocalRecording(()=>room);await recording.toggle()
  video.handlers.ended()
  await recording.cleanup()
  assert.equal(downloads.length,1)
  assert.equal(mic.stopped,false)
  await recording.toggle();assert.equal(recording.recording.value,false)
  URL.revokeObjectURL(downloads[0].href)
})
test('cancelled capture never starts recording or downloads a file',async()=>{
  choose=async()=>{throw Object.assign(Error('cancelled'),{name:'NotAllowedError'})}
  const recording=useLocalRecording(()=>room);await recording.toggle()
  assert.equal(recording.recording.value,false);assert.equal(recording.busy.value,false)
  assert.equal(downloads.length,0);assert.equal(notices.filter(n=>n.error).length,0)
})
test('navigation during capture selection stops late tracks and never publishes recording state',async()=>{
  let resolve;choose=()=>new Promise(done=>{resolve=done})
  const recording=useLocalRecording(()=>room),pending=recording.toggle()
  await recording.cleanup();resolve(display);await pending
  assert.equal(video.stopped,true);assert.equal(audio.stopped,true)
  assert.equal(attributes.length,0);assert.equal(downloads.length,0)
})
test('navigation during indicator publication clears it without starting capture',async()=>{
  let resolve
  room.localParticipant.setAttributes=value=>{attributes.push(value);return value['meetspace.recording']==='true'?new Promise(done=>{resolve=done}):Promise.resolve()}
  const recording=useLocalRecording(()=>room),pending=recording.toggle()
  await new Promise(done=>setImmediate(done))
  await recording.cleanup();resolve();await pending
  assert.equal(recording.recording.value,false)
  assert.equal(attributes.at(-1)['meetspace.recording'],'')
  assert.equal(downloads.length,0)
})
