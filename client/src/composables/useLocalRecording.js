import { ref } from 'vue'
import { Track } from 'livekit-client'
import { notify, toast } from '../services/toast.js'

export function useLocalRecording(getRoom) {
  const recording=ref(false),busy=ref(false)
  let recorder=null,capture=null,context=null,closing=null,disposed=false
  async function release(){
    capture?.getTracks().forEach(track=>track.stop());capture=null
    if(context){const owned=context;context=null;await owned.close().catch(()=>{})}
  }
  async function clearIndicator(room){try{await room?.localParticipant.setAttributes({'meetspace.recording':''})}catch{ /* Disconnect removes the indicator too. */ }}
  async function stop(){
    if(closing){busy.value=true;if(recorder?.state==='recording')recorder.stop();return closing}
    return release()
  }
  async function start(){
    if(busy.value || recording.value || disposed)return
    busy.value=true
    const room=getRoom()
    try{
      if(!room)throw Error('Hubungkan ke room sebelum merekam.')
      if(!window.MediaRecorder || !navigator.mediaDevices?.getDisplayMedia)throw Error('Browser ini belum mendukung rekaman layar. Coba Chrome atau Edge di desktop.')
      // Only an explicit Record click opens the browser's capture chooser.
      capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true})
      if(disposed){await release();return}
      const tracks=[...capture.getVideoTracks()]
      const mic=room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
      const audio=[...capture.getAudioTracks(),...(mic?[mic]:[])]
      if(audio.length){
        context=new AudioContext();await context.resume()
        if(disposed){await release();return}
        const destination=context.createMediaStreamDestination()
        audio.forEach(track=>context.createMediaStreamSource(new MediaStream([track])).connect(destination))
        tracks.push(...destination.stream.getAudioTracks())
      }else toast.info('Rekaman ini tanpa audio. Untuk suara meeting, pilih tab dan aktifkan berbagi audio.')
      const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type))
      const active=new MediaRecorder(new MediaStream(tracks),mimeType?{mimeType}:{})
      recorder=active
      let chunks=[],size=0
      const stopped=new Promise(resolve=>{
        active.onstop=async()=>{
          busy.value=true;recording.value=false
          try{
            const blob=new Blob(chunks,{type:active.mimeType || 'video/webm'})
            chunks=[];recorder=null
            await release();await clearIndicator(room)
            if(blob.size){
              const href=URL.createObjectURL(blob),filename=`MeetSpace-${new Date().toISOString().replace(/[:.]/g,'-')}.${blob.type.includes('mp4')?'mp4':'webm'}`
              const link=document.createElement('a');link.href=href;link.download=filename;link.click()
              notify('Rekaman lokal siap. Simpan file sebelum menutup halaman.',{tone:'success',title:'Cerita tersimpan',duration:0,href,download:filename})
            }
          }catch(error){toast.error(error)}finally{closing=null;busy.value=false;resolve()}
        }
      })
      active.ondataavailable=event=>{
        if(event.data.size){chunks.push(event.data);size+=event.data.size
          if(size>=512*1024*1024){toast.info('Rekaman mencapai batas 512 MB dan disimpan otomatis.');void stop()}}
      }
      active.onerror=()=>{toast.error('Rekaman terhenti. Bagian yang tersedia akan disimpan.');void stop()}
      await room.localParticipant.setAttributes({'meetspace.recording':'true'})
      if(disposed){await release();recorder=null;await clearIndicator(room);return}
      active.start(1000);closing=stopped;recording.value=true
      capture.getVideoTracks()[0].addEventListener('ended',()=>{void stop()},{once:true})
      toast.info('Rekaman lokal aktif. Hanya tab/layar yang kamu pilih yang direkam.')
    }catch(error){
      if(error.name!=='NotAllowedError')toast.error(error)
      await release();recorder=null;closing=null;await clearIndicator(room)
    }finally{busy.value=false}
  }
  async function toggle(){if(busy.value)return;if(recording.value)await stop();else await start()}
  async function cleanup(){disposed=true;await stop()}
  return {recording,busy,toggle,cleanup}
}
