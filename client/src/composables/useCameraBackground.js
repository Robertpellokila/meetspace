import { ref } from 'vue'
import { Track } from 'livekit-client'
import { toast } from '../services/toast.js'

export function useCameraBackground(getRoom, loadLibrary=()=>import('@livekit/track-processors')) {
  const mode=ref('none'),busy=ref(false),supported=ref(null),imageName=ref('')
  let processor=null,track=null,imageUrl='',disposed=false,chain=Promise.resolve()
  function options(){return mode.value==='image'?{mode:'virtual-background',imagePath:imageUrl}:mode.value==='blur'?{mode:'background-blur',blurRadius:10}:{mode:'disabled'}}
  async function apply(){
    const camera=getRoom()?.localParticipant.getTrackPublication(Track.Source.Camera)?.track
    if(disposed || !camera)return
    if(track && track!==camera){await track.stopProcessor();processor=null;track=null}
    if(mode.value==='none'){
      if(processor){await camera.stopProcessor();processor=null;track=null}
      return
    }
    const lib=await loadLibrary()
    supported.value=lib.supportsBackgroundProcessors()
    if(!supported.value)throw Error('Browser ini belum mendukung background kamera. Gunakan browser desktop yang mendukung pemrosesan video.')
    if(disposed || camera!==getRoom()?.localParticipant.getTrackPublication(Track.Source.Camera)?.track)return
    if(!processor){
      const next=lib.BackgroundProcessor({...options(),maxFps:24})
      try{await camera.setProcessor(next,true)}catch(error){await camera.stopProcessor().catch(()=>{});await next.destroy().catch(()=>{});throw error}
      processor=next;track=camera
    } else await processor.switchTo(options())
    if(disposed){await camera.stopProcessor();processor=null;track=null}
  }
  function enqueue(fn){
    const job=chain.catch(()=>{}).then(async()=>{
      if(disposed)return
      busy.value=true
      try{const applied=await fn();if(!applied)await apply()}
      catch(error){
        mode.value='none'
        if(track)await track.stopProcessor().catch(()=>{})
        processor=null;track=null
        if(!disposed)toast.error(error)
      }finally{busy.value=false}
    })
    chain=job;return job
  }
  function setMode(value){return enqueue(async()=>{
    if(!['none','blur','image'].includes(value))return
    if(value==='image' && !imageUrl)throw Error('Tambahkan gambar background terlebih dahulu.')
    mode.value=value
  })}
  function sync(){return enqueue(async()=>{})}
  function addImage(file){return enqueue(async()=>{
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>5*1024*1024)throw Error('Gunakan gambar JPG, PNG, atau WebP maksimal 5 MB.')
    const bitmap=await createImageBitmap(file)
    try {
      if(bitmap.width*bitmap.height>40_000_000)throw Error('Resolusi gambar terlalu besar. Gunakan gambar maksimal 40 megapixel.')
      const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9))
      if(!blob)throw Error('Gambar belum bisa diproses.')
      const previous=imageUrl
      imageUrl=URL.createObjectURL(blob);imageName.value=file.name;mode.value='image'
      // The processor loads the new image before the previous object URL is released.
      try{await apply()}finally{if(previous)URL.revokeObjectURL(previous)}
      return true
    } finally {bitmap.close()}
  })}
  async function cleanup(){
    disposed=true;await chain.catch(()=>{})
    if(track)await track.stopProcessor().catch(()=>{})
    processor=null;track=null
    if(imageUrl)URL.revokeObjectURL(imageUrl)
    imageUrl='';imageName.value='';mode.value='none'
  }
  return {mode,busy,supported,imageName,setMode,addImage,sync,cleanup}
}
