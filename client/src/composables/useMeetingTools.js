import { ref, onBeforeUnmount } from 'vue'
import { Room } from 'livekit-client'
import { toast } from '../services/toast.js'
export function useMeetingTools(getRoom) {
  const devices=ref([]),deviceBusy=ref(false),selectedDevices=ref({})
  async function refreshDevices(){
    try{
      devices.value=await Room.getLocalDevices(undefined,false)
      const room=getRoom()
      selectedDevices.value=Object.fromEntries(['audioinput','videoinput','audiooutput'].map(kind=>[kind,room?.getActiveDevice(kind) || 'default']))
    }catch(error){toast.error(error)}
  }
  async function switchDevice(kind,id){
    const room=getRoom()
    if(!room || deviceBusy.value)return
    deviceBusy.value=true
    try{const switched=await room.switchActiveDevice(kind,id);if(!switched)throw Error('Perangkat belum bisa digunakan. Coba pilihan lain.');selectedDevices.value={...selectedDevices.value,[kind]:id};toast.success('Perangkat berhasil diganti.')}
    catch(error){toast.error(error)}finally{deviceBusy.value=false}
  }
  async function fullscreen(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else throw Error('Fullscreen belum didukung browser ini.')}
    catch(error){toast.error(error)}
  }
  navigator.mediaDevices?.addEventListener('devicechange',refreshDevices)
  onBeforeUnmount(()=>navigator.mediaDevices?.removeEventListener('devicechange',refreshDevices))
  return {devices,deviceBusy,selectedDevices,refreshDevices,switchDevice,fullscreen}
}
