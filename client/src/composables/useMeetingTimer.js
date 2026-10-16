import { ref } from 'vue'
import api from '../services/api.js'

export function useMeetingTimer(roomId) {
  const elapsed=ref('--:--')
  let startedAt=0,serverAt=0,receivedAt=0,ticker=null,poller=null,generation=0
  const pad=n=>String(n).padStart(2,'0')
  function updateTimer(){
    if(!startedAt || !serverAt){elapsed.value='--:--';return}
    const seconds=Math.max(0,Math.floor((serverAt+performance.now()-receivedAt-startedAt)/1000))
    const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60
    elapsed.value=hours>0?`${pad(hours)}:${pad(minutes)}:${pad(secs)}`:`${pad(minutes)}:${pad(secs)}`
  }
  function synchronize(start,clock){
    const time=typeof start==='number'?start:Date.parse(start)
    if(!Number.isFinite(time) || !Number.isFinite(clock?.serverNow))return false
    startedAt=time
    // Compensate for device-clock differences and estimated response transit time.
    serverAt=clock.serverNow+Math.max(0,clock.roundTripMs || 0)/2
    receivedAt=clock.receivedAt ?? performance.now()
    updateTimer()
    return true
  }
  async function refresh(){
    const version=generation,sentAt=performance.now()
    try{
      const response=await api.get(`/rooms/${encodeURIComponent(roomId)}`)
      const now=performance.now()
      if(version===generation)synchronize(response.data.data.startedAt,{serverNow:response.data.serverNow,receivedAt:now,roundTripMs:now-sentAt})
    }catch{ /* Keep the last synchronized clock during a transient outage. */ }
  }
  function onVisible(){if(document.visibilityState==='visible')void refresh()}
  function stop(){generation++;clearInterval(ticker);clearInterval(poller);document.removeEventListener('visibilitychange',onVisible)}
  function startMeetingTimer(start,clock){
    stop();startedAt=0;serverAt=0;elapsed.value='--:--'
    if(!synchronize(start,clock))void refresh()
    ticker=setInterval(updateTimer,250)
    poller=setInterval(refresh,60000)
    document.addEventListener('visibilitychange',onVisible)
  }
  return {elapsed,startMeetingTimer,stop,synchronize,updateTimer}
}
