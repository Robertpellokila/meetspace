import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { AggregateField, FieldPath } from 'firebase-admin/firestore'
import { db } from '../config/firebase.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { requireAdmin, isAdmin } from '../services/account.service.js'
import { MODES } from '../config/roomCatalog.js'
const router=Router()
router.use(optionalAuth,requireAuth,requireAdmin)
router.get('/overview',async(req,res)=>{
  try {
    const accounts=db.collection('accounts'),rooms=db.collection('rooms'),sessions=db.collection('usageSessions')
    const [users,pending,full,totalRooms,activeRooms,active,usage,lastEvent,recent,audit,...modes]=await Promise.all([
      accounts.count().get(),accounts.where('access','==','pending').count().get(),accounts.where('access','==','full').count().get(),
      rooms.count().get(),db.collection('liveRooms').where('active','==',true).count().get(),
      sessions.where('endedAt','==',null).count().get(),
      sessions.aggregate({sessions:AggregateField.count(),durationMs:AggregateField.sum('durationMs')}).get(),
      db.collection('stats').doc('livekit').get(),sessions.orderBy('startedAt','desc').limit(25).get(),
      db.collection('adminAudit').orderBy('createdAt','desc').limit(10).get(),
      ...MODES.map(mode=>rooms.where('mode','==',mode).count().get()),
    ])
    res.json({success:true,data:{users:users.data().count,pending:pending.data().count,full:full.data().count,
      rooms:totalRooms.data().count,activeRooms:activeRooms.data().count,activeParticipants:active.data().count,
      ...usage.data(),lastEventAt:lastEvent.data()?.lastEventAt || null,
      modes:MODES.map((mode,i)=>({mode,count:modes[i].data().count})),
      recent:recent.docs.map(doc=>({id:doc.id,...doc.data()})),audit:audit.docs.map(doc=>({id:doc.id,...doc.data()}))}})
  }catch(error){console.error('Admin overview:',error);res.status(503).json({success:false,message:'Statistik belum bisa dimuat. Coba lagi sebentar.'})}
})
router.get('/users',async(req,res)=>{
  try{
    let query=db.collection('accounts')
    if(req.query.email)query=query.where('email','==',String(req.query.email).trim().toLowerCase().slice(0,254))
    query=query.orderBy(FieldPath.documentId()).limit(51)
    if(req.query.cursor){const cursor=String(req.query.cursor);if(cursor.includes('/') || cursor.length>128)return res.sendStatus(400);query=query.startAfter(cursor)}
    const result=await query.get(),page=result.docs.slice(0,50)
    res.json({success:true,data:{users:page.map(doc=>({...doc.data(),uid:doc.id,role:isAdmin(doc.id)?'admin':'member',access:isAdmin(doc.id)?'full':doc.data().access})),nextCursor:result.docs.length>50?page.at(-1).id:null}})
  }catch(error){console.error('Admin users:',error);res.status(503).json({success:false,message:'Daftar akun belum bisa dimuat.'})}
})
router.patch('/users/:uid/access',async(req,res)=>{
  try{
    const {uid}=req.params,access=req.body?.access
    if(!uid || uid.includes('/') || uid.length>128 || !['pending','full'].includes(access))return res.status(400).json({success:false,message:'Pilihan akses tidak valid.'})
    if(isAdmin(uid))return res.status(403).json({success:false,message:'Akses admin dikelola melalui konfigurasi server.'})
    const ref=db.collection('accounts').doc(uid)
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref)
      if(!snap.exists)return false
      if(snap.data().access===access)return true
      const now=Date.now()
      tx.update(ref,{access,accessUpdatedAt:now,accessUpdatedBy:req.user.uid})
      tx.set(db.collection('adminAudit').doc(randomUUID()),{actorUid:req.user.uid,subjectUid:uid,email:snap.data().email || '',before:snap.data().access,after:access,createdAt:now})
      return true
    })
    if(!result)return res.status(404).json({success:false,message:'Akun tidak ditemukan.'})
    res.json({success:true,data:{uid,access}})
  }catch(error){console.error('Admin access:',error);res.status(503).json({success:false,message:'Perubahan akses belum tersimpan. Coba lagi.'})}
})
export default router
