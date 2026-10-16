import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { syncAccount } from '../services/account.service.js'
const router=Router()
router.use(optionalAuth,requireAuth)
router.get('/',async(req,res)=>{
  try{res.json({success:true,data:await syncAccount(req.user)})}
  catch(error){console.error('Account:',error);res.status(503).json({success:false,message:'Data akun belum bisa dimuat. Coba lagi sebentar.'})}
})
export default router
