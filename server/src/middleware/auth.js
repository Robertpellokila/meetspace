import { adminAuth } from '../config/firebase.js'

const invalidSessionCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled',
])
const rejectSession = (res, expired = false) => res.status(401).json({
  success: false,
  code: expired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
  message: expired
    ? 'Sesi login sudah kedaluwarsa. Silakan masuk kembali.'
    : 'Sesi login tidak valid. Silakan keluar lalu masuk kembali.',
})

export async function optionalAuth(req, res, next) {
  const value = req.headers.authorization ?? ''
  req.user = null
  if (!value) return next()
  const token = /^Bearer\s+(\S+)$/i.exec(value)?.[1]
  if (!token) return rejectSession(res)
  try {
    req.user = await adminAuth.verifyIdToken(token)
  } catch (error) {
    // Configuration/credential failures are server problems, not expired logins.
    // Some SDK versions wrap public-key network failures as argument errors.
    const keyFetchFailed = /error fetching public keys|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT/i.test(error?.message || '')
    if (invalidSessionCodes.has(error?.code) && !keyFetchFailed) {
      return rejectSession(res, error.code === 'auth/id-token-expired')
    }
    const code = typeof error?.code === 'string' && /^[a-z0-9_/-]{1,80}$/i.test(error.code)
      ? error.code : 'verification-unavailable'
    // Never log the bearer token or credential contents.
    console.error(`[Firebase Admin] ${code}: periksa kredensial, project ID, dan koneksi server.`)
    return res.status(503).json({
      success: false,
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'Server belum dapat memverifikasi sesi. Hubungi admin untuk memeriksa konfigurasi Firebase Admin.',
    })
  }
  next()
}
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ success:false, code:'AUTH_REQUIRED', message:'Silakan masuk untuk melanjutkan.' })
  next()
}
