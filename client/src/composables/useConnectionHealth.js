import { ref } from 'vue'
import { RoomEvent, Track, VideoQuality } from 'livekit-client'
import { toast } from '../services/toast.js'

export function useConnectionHealth(){
  const quality=ref('unknown'),state=ref('disconnected'),lowData=ref(false),busy=ref(false)
  const metrics=ref({rttMs:null,jitterMs:null,packetLoss:null})
  let room=null,poller=null,sampling=false,generation=0
  const previous=new Map()
  function sync(){quality.value=room?.localParticipant.connectionQuality || 'unknown';state.value=room?.state || 'disconnected'}
  function remoteQuality(){
    if(!room)return
    for(const person of room.remoteParticipants.values())for(const pub of person.getTrackPublications()){
      if(pub.kind==='video')pub.setVideoQuality(lowData.value?(pub.source===Track.Source.ScreenShare?VideoQuality.MEDIUM:VideoQuality.LOW):VideoQuality.HIGH)
    }
  }
  async function cameraQuality(){
    const active=room,track=active?.localParticipant.getTrackPublication(Track.Source.Camera)?.track
    if(!track)return
    await track.restartTrack({resolution:lowData.value?{width:640,height:360,frameRate:15}:{width:1280,height:720,frameRate:30},deviceId:active.getActiveDevice('videoinput') || undefined})
    if(active===room)await track.setDegradationPreference('balanced')
  }
  async function setLowData(value){
    if(busy.value || !room)return
    busy.value=true;const old=lowData.value;lowData.value=Boolean(value)
    try{remoteQuality();await cameraQuality()}
    catch(error){lowData.value=old;remoteQuality();toast.error(error)}
    finally{busy.value=false}
  }
  function onLocalTrack(){if(lowData.value)void cameraQuality().catch(error=>toast.error(error))}
  async function sample(){
    if(!room || sampling)return
    sampling=true;const version=generation
    try {
      const people=[room.localParticipant,...room.remoteParticipants.values()]
      const tracks=people.flatMap(p=>p.getTrackPublications().map(pub=>pub.track).filter(Boolean))
      const reports=await Promise.all(tracks.map(async(track,index)=>({key:track.sid||String(index),report:await track.getRTCStatsReport?.()})))
      if(version!==generation)return
      let rtt=null,jitter=null,lost=0,received=0,hasDelta=false
      for(const {key,report} of reports)report?.forEach(stat=>{
        if(stat.type==='candidate-pair' && stat.state==='succeeded' && (stat.nominated || stat.selected) && Number.isFinite(stat.currentRoundTripTime))rtt=Math.max(rtt||0,stat.currentRoundTripTime*1000)
        if(stat.type==='inbound-rtp' && Number.isFinite(stat.packetsReceived)){
          if(Number.isFinite(stat.jitter))jitter=Math.max(jitter||0,stat.jitter*1000)
          const id=`${key}:${stat.id}`,old=previous.get(id)
          if(old && stat.packetsReceived>=old.received){hasDelta=true;received+=stat.packetsReceived-old.received;lost+=Math.max(0,(stat.packetsLost||0)-old.lost)}
          previous.set(id,{received:stat.packetsReceived,lost:stat.packetsLost||0})
        }
      })
      metrics.value={rttMs:rtt===null?null:Math.round(rtt),jitterMs:jitter===null?null:Math.round(jitter),packetLoss:hasDelta&&lost+received>0?Math.round(lost/(lost+received)*1000)/10:null}
    }catch{ /* Metrics may be unavailable during reconnect; never invent latency values. */ }
    finally{sampling=false}
  }
  const listeners=[[RoomEvent.ConnectionQualityChanged,sync],[RoomEvent.ConnectionStateChanged,sync],[RoomEvent.TrackPublished,remoteQuality],[RoomEvent.TrackSubscribed,remoteQuality],[RoomEvent.LocalTrackPublished,onLocalTrack]]
  function attach(value){detach();room=value;listeners.forEach(([event,fn])=>room.on(event,fn));sync();poller=setInterval(sample,5000);void sample()}
  function detach(){generation++;clearInterval(poller);if(room)listeners.forEach(([event,fn])=>room.off(event,fn));room=null;previous.clear();metrics.value={rttMs:null,jitterMs:null,packetLoss:null};state.value='disconnected';quality.value='unknown'}
  return {quality,state,lowData,busy,metrics,attach,detach,sample,setLowData}
}
