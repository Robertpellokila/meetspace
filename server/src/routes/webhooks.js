import { Router, text } from 'express'
import { WebhookReceiver } from 'livekit-server-sdk'
import { recordUsage } from '../services/usage.service.js'
const router=Router()
router.post('/livekit',text({type:['application/webhook+json','application/json'],limit:'1mb'}),async(req,res)=>{
  let event
  try {
    const {LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret}=process.env
    if(!key || !secret)return res.sendStatus(503)
    event=await new WebhookReceiver(key,secret).receive(req.body,req.get('Authorization'))
  }catch{return res.sendStatus(401)}
  try{await recordUsage(event);res.sendStatus(200)}
  catch(error){console.error('Usage webhook:',error);res.sendStatus(503)}
})
export default router
