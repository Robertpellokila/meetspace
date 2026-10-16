import {test,mock,beforeEach,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {EventEmitter} from 'node:events'
import {parse,compileScript} from '@vue/compiler-sfc'
import * as Vue from 'vue'
import {ConnectionState,RoomEvent} from 'livekit-client'
let mounts=[],unmounts=[],respond,model,calls,notices
const instances=[]
globalThis.window={addEventListener(){},removeEventListener(){},devicePixelRatio:2}
mock.module('vue',{namedExports:{computed:Vue.computed,ref:Vue.ref,reactive:Vue.reactive,watch:Vue.watch,nextTick:Vue.nextTick,onMounted:fn=>mounts.push(fn),onUnmounted:fn=>unmounts.push(fn)}})
mock.module('../src/services/api.js',{defaultExport:{request:async config=>{calls.push(config);return respond(config)}}})
mock.module('../src/services/toast.js',{namedExports:{toast:{error:e=>notices.push(e),success:m=>notices.push(m)},notify:(message,options)=>{notices.push({message,...options});return 'confirmation'},dismissToast:()=>{}}})
const url=new URL('../src/components/study/Whiteboard.vue',import.meta.url)
const {descriptor}=parse(await readFile(url,'utf8'))
const compiled=compileScript(descriptor,{id:'board-test'}).content.replace(/from (["'])([^"']+)\1/g,(_,quote,path)=>`from '${path.startsWith('.')?new URL(path,url).href:import.meta.resolve(path)}'`)
const {default:Whiteboard}=await import(`data:text/javascript;base64,${Buffer.from(compiled+'\n//# sourceURL=whiteboard-under-test.js').toString('base64')}`)
const clone=value=>JSON.parse(JSON.stringify(value))
const flush=()=>new Promise(resolve=>setImmediate(resolve))
beforeEach(()=>{
  model={version:0,control:{hostIdentity:'host-owner',writerIdentity:'host-owner',requests:[]},pages:[{id:'page-1',name:'Page 1',objects:[]}]};calls=[];notices=[]
  respond=async config=>{
    if(config.method==='POST'){
      const op=config.data.operation
      if(op.type==='add')model.pages[0].objects.push(clone(op.object))
      if(op.type==='remove')model.pages[0].objects=model.pages[0].objects.filter(o=>o.id!==op.id)
      if(op.type==='update')model.pages[0].objects=model.pages[0].objects.map(o=>o.id===op.object.id?clone(op.object):o)
      if(op.type==='page-add')model.pages.push({id:op.id,name:op.name,objects:[]})
      model.version++
    }
    return {data:{data:clone(model)}}
  }
})
afterEach(()=>{for(const {scope,callbacks} of instances.splice(0)){callbacks.forEach(fn=>fn());scope.stop()}})
async function board(identity='host-owner'){
  const room=new EventEmitter();room.state=ConnectionState.Connected;room.name='room';room.localParticipant={identity,publishData:async()=>{}}
  const props=Vue.reactive({room:Vue.markRaw(room),roomId:'room',roomToken:'room-token',refreshToken:null})
  mounts=[];unmounts=[]
  const scope=Vue.effectScope();const state=scope.run(()=>Whiteboard.setup(props,{expose(){}}))
  let strokes=0
  const context={setLineDash(){},closePath(){},setTransform(){},quadraticCurveTo(){},save(){},restore(){},beginPath(){},arc(){},fill(){strokes++},stroke(){strokes++},strokeRect(){strokes++},fillRect(){},clearRect(){},moveTo(){},lineTo(){},ellipse(){},fillText(){},measureText:()=>({width:10})}
  state.canvas.value={style:{},width:1200,height:700,getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:1200,height:700}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}}
  instances.push({scope,callbacks:unmounts.slice()});mounts.forEach(fn=>fn());await flush();await Vue.nextTick()
  return {state,props,room,strokes:()=>strokes}
}
const pointer=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){}})
test('pointer drawing paints immediately, saves, and becomes visible to another board',async()=>{
  const first=await board(),second=await board()
  assert.equal(first.state.canEdit.value,true)
  first.state.down(pointer(10,20));first.state.move(pointer(90,80))
  assert.ok(first.strokes()>0)
  first.state.up(pointer(90,80));await flush()
  assert.equal(first.state.currentPage.value.objects.length,1)
  assert.equal(calls.find(c=>c.method==='POST').headers.Authorization,'Bearer room-token')
  second.state.onData(new TextEncoder().encode('{"type":"commit"}'),{identity:'peer'},null,'meetspace.whiteboard.v2')
  await new Promise(resolve=>setTimeout(resolve,150))
  assert.deepEqual(clone(second.state.currentPage.value.objects),clone(first.state.currentPage.value.objects))
})
test('reconnect restores drawing and old snapshots cannot overwrite a newer board',async()=>{
  const {state,room}=await board()
  room.state=ConnectionState.Reconnecting;room.emit(RoomEvent.ConnectionStateChanged,room.state)
  assert.equal(state.canEdit.value,false)
  room.state=ConnectionState.Connected;room.emit(RoomEvent.ConnectionStateChanged,room.state);await flush()
  assert.equal(state.canEdit.value,true)
  state.acceptDocument({version:5,pages:[{id:'page-1',name:'Newest',objects:[]}]})
  state.acceptDocument({version:4,pages:[{id:'page-1',name:'Stale',objects:[]}]})
  assert.equal(state.currentPage.value.name,'Newest')
})
test('an expired room token is refreshed once and the original operation ID is retained',async()=>{
  const {state,props}=await board();let renewals=0
  props.refreshToken=async()=>{renewals++;props.roomToken='renewed';return 'renewed'}
  const success=respond
  respond=async config=>{if(config.headers.Authorization==='Bearer room-token')throw {response:{status:401}};return success(config)}
  assert.equal(await state.commit({type:'add',pageId:'page-1',object:{id:'s',type:'pen',color:'#4F5B2A',width:4,points:[{x:1,y:1}]}}),true)
  const posts=calls.filter(c=>c.method==='POST')
  assert.equal(renewals,1);assert.equal(posts.length,2);assert.equal(posts[0].data.id,posts[1].data.id)
  assert.equal(posts[1].headers.Authorization,'Bearer renewed')
})
test('text tools use the inline editor; failed page creation preserves the current page',async()=>{
  const {state}=await board()
  state.tool.value='sticky';state.down(pointer(30,40))
  assert.equal(state.editor.value.kind,'sticky')
  state.editor.value.text='Team note';await state.saveEditor()
  assert.equal(model.pages[0].objects[0].text,'Team note')
  const old=state.pageId.value
  const original=respond;respond=async config=>{if(config.method==='POST')throw Error('Storage unavailable');return original(config)}
  state.addPage();await flush()
  assert.equal(state.pageId.value,old)
  assert.ok(notices.some(n=>n instanceof Error))
})

test('read-only participants can send cursors but cannot draw or accept unauthorized previews',async()=>{
  const {state}=await board('guest-visitor')
  assert.equal(state.canEdit.value,false)
  state.down(pointer(20,30));state.up(pointer(40,50));await flush()
  assert.equal(calls.filter(c=>c.method==='POST').length,0)
  state.onData(new TextEncoder().encode(JSON.stringify({type:'cursor',point:{x:12,y:24},pageId:'page-1',color:'#4F5B2A'})),{identity:'guest-other',name:'Viewer'},null,'meetspace.whiteboard.v2')
  assert.equal(state.cursors['guest-other'].x,12)
  state.onData(new TextEncoder().encode(JSON.stringify({type:'preview',shape:{type:'pen',width:4,color:'#4F5B2A',points:[{x:1,y:1}]},pageId:'page-1'})),{identity:'guest-other'},null,'meetspace.whiteboard.v2')
  assert.equal(state.preview['guest-other'],undefined)
  state.acceptDocument({...clone(model),version:2,control:{...model.control,writerIdentity:'guest-visitor'}});await Vue.nextTick()
  assert.equal(state.canEdit.value,true)
  state.down(pointer(1,2));state.move(pointer(4,5))
  state.acceptDocument({...clone(model),version:3});await Vue.nextTick()
  state.up(pointer(8,9));await flush()
  assert.equal(calls.filter(c=>c.method==='POST').length,0)
})
test('canvas backs every CSS pixel with device pixels and fits the available area',async()=>{
  const {state}=await board()
  state.viewport.value={getBoundingClientRect:()=>({width:1000,height:350})}
  state.resizeCanvas()
  assert.deepEqual(state.canvasSize.value,{width:1000,height:350})
  assert.equal(state.canvas.value.width,2000);assert.equal(state.canvas.value.height,700)
  window.devicePixelRatio=3;state.resizeCanvas()
  assert.equal(state.canvas.value.width,3000);assert.equal(state.canvas.value.height,1050)
  window.devicePixelRatio=2
})

test('reactive shapes can be selected, moved, erased, undone and redone without DataCloneError',async()=>{
  const {state}=await board()
  state.down(pointer(300,300));state.move(pointer(340,320));state.up(pointer(360,340));await flush()
  state.tool.value='select';state.down(pointer(330,320));state.move(pointer(430,420));state.up(pointer(430,420));await flush()
  assert.equal(model.pages[0].objects[0].points[0].x,400)
  await state.undo();assert.equal(model.pages[0].objects[0].points[0].x,300)
  await state.redo();assert.equal(model.pages[0].objects[0].points[0].x,400)
  state.tool.value='eraser';state.down(pointer(430,420));await flush()
  assert.equal(model.pages[0].objects.length,0)
  await state.undo();assert.equal(model.pages[0].objects.length,1)
})
test('failed drawing remains visible and retry preserves operation identity without duplication',async()=>{
  const {state}=await board(),success=respond
  respond=async config=>{if(config.method==='POST')throw Error('Offline');return success(config)}
  state.down(pointer(10,20));state.up(pointer(40,60));await flush()
  assert.equal(state.visibleObjects().length,1)
  assert.equal(state.failedCount.value,1)
  const id=calls.find(c=>c.method==='POST').data.id
  respond=success;state.retryUnsaved();await flush()
  assert.equal(model.pages[0].objects.length,1)
  assert.equal(state.outbox.length,0)
  assert.equal(calls.filter(c=>c.method==='POST').at(-1).data.id,id)
})
test('cancelled pan or selection releases the pointer so the next pen stroke draws normally',async()=>{
  const {state}=await board()
  state.tool.value='hand';state.down(pointer(1,2));state.cancelGesture()
  state.tool.value='pen';state.down(pointer(50,60));state.move(pointer(100,120));state.up(pointer(100,120));await flush()
  assert.equal(model.pages[0].objects[0].points.length,2)
  state.tool.value='select';state.down(pointer(75,90));state.cancelGesture()
  state.tool.value='pen';state.down(pointer(150,160));state.move(pointer(200,220));state.up(pointer(200,220));await flush()
  assert.equal(model.pages[0].objects.length,2)
})

test('fit drawing reveals existing objects outside a small viewport without changing stored coordinates',async()=>{
  model.pages[0].objects=[{id:'far',type:'rectangle',x:1600,y:900,x2:1900,y2:1100,color:'#4F5B2A',width:4}]
  const {state}=await board('guest-visitor')
  state.viewport.value={getBoundingClientRect:()=>({width:390,height:450})};state.resizeCanvas();state.fitDrawing()
  const {x,y,zoom}=state.camera
  assert.ok(1600*zoom+x>=0);assert.ok(1900*zoom+x<=390)
  assert.ok(900*zoom+y>=0);assert.ok(1100*zoom+y<=450)
  assert.equal(model.pages[0].objects[0].x,1600)
})
