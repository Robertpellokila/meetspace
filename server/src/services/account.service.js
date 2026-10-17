import { db } from '../config/firebase.js'

export const isAdmin = uid => Boolean(uid && (process.env.ADMIN_UIDS || '').split(',').map(s=>s.trim()).filter(Boolean).includes(uid))
export const hasVerifiedEmail = user => user?.email_verified === true
export const hasPrivilegedSession = hasVerifiedEmail
export const privilegedSessionMessage = () => 'Verifikasi alamat emailmu sebelum memakai akses host.'
export async function getAccount(uid) {
  const snap=await db.collection('accounts').doc(uid).get()
  const data=snap.exists?snap.data():{uid,access:'pending'}
  return {...data,uid,role:isAdmin(uid)?'admin':'member',access:isAdmin(uid)?'full':data.access==='full'?'full':'pending'}
}
export async function syncAccount(user) {
  const ref=db.collection('accounts').doc(user.uid)
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref)
    const now=Date.now()
    const profile={uid:user.uid,email:(user.email || '').toLowerCase(),displayName:user.name || '',lastSeenAt:now,...(isAdmin(user.uid)?{access:'full'}:{})}
    if(!snap.exists)tx.set(ref,{access:'pending',...profile,createdAt:now})
    else tx.update(ref,profile)
  })
  return getAccount(user.uid)
}
export async function requireFullAccess(req,res,next) {
  try {
    if(!hasVerifiedEmail(req.user))return res.status(403).json({success:false,code:'EMAIL_NOT_VERIFIED',message:'Buka link verifikasi dari emailmu sebelum membuat room.'})
    const account=await getAccount(req.user.uid)
    if(account.access!=='full')return res.status(403).json({success:false,message:'Akses membuat room belum aktif. Tunggu persetujuan admin di halaman Akun.'})
    req.account=account
    next()
  }catch(error){console.error('Account access:',error);res.status(503).json({success:false,message:'Status akses belum dapat diperiksa. Coba lagi sebentar.'})}
}
export function requireAdmin(req,res,next) {
  if(!isAdmin(req.user?.uid))return res.status(403).json({success:false,message:'Halaman ini hanya untuk admin.'})
  if(!hasVerifiedEmail(req.user))return res.status(403).json({success:false,code:'EMAIL_NOT_VERIFIED',message:'Verifikasi alamat emailmu sebelum membuka dashboard admin.'})
  next()
}
