import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { db } from '../config/firebase.js'

const collection = db.collection('rateLimits')

function clientIp(req) {
  const cloudflareIp = req.headers['cf-connecting-ip']
  // The Worker receives this header from Cloudflare. A directly exposed Node
  // server must use its socket address instead of trusting a client-supplied header.
  const candidate = process.env.RATE_LIMIT_TRUST_CF_IP === 'true' && typeof cloudflareIp === 'string'
    ? cloudflareIp : req.socket?.remoteAddress
  return isIP(candidate || '') ? candidate : null
}

export async function consumeRateLimits(req, rules, now = Date.now()) {
  const secret = process.env.RATE_LIMIT_SECRET
  const ip = clientIp(req)
  if (!secret || secret.length < 32 || !ip) throw new Error('Rate limit identity/configuration unavailable')
  const entries = rules.map(({ scope, limit, windowMs }) => {
    const slot = Math.floor(now / windowMs)
    const key = createHmac('sha256', secret).update(`${scope}:${ip}:${slot}`).digest('hex')
    return { ref: collection.doc(key), limit, resetAt: (slot + 1) * windowMs }
  })
  return db.runTransaction(async tx => {
    const snapshots = await Promise.all(entries.map(({ ref }) => tx.get(ref)))
    const denied = entries.find((entry, index) => (snapshots[index].data()?.count || 0) >= entry.limit)
    if (denied) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((denied.resetAt - now) / 1000)) }
    entries.forEach((entry, index) => tx.set(entry.ref, {
      count: (snapshots[index].data()?.count || 0) + 1,
      resetAt: entry.resetAt,
      expiresAt: new Date(entry.resetAt + 24 * 60 * 60_000),
    }))
    return { allowed: true }
  })
}

export function rateLimit(rules) {
  return async (req, res, next) => {
    try {
      const result = await consumeRateLimits(req, typeof rules === 'function' ? rules(req) : rules)
      if (result.allowed) return next()
      res.set('Retry-After', String(result.retryAfterSeconds))
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' })
    } catch (error) {
      console.error('Rate limit unavailable:', error?.message)
      return res.status(503).json({ success: false, code: 'RATE_LIMIT_UNAVAILABLE', message: 'Perlindungan permintaan belum tersedia. Coba lagi sebentar.' })
    }
  }
}
