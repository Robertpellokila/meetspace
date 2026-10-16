import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { db } from '../config/firebase.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../services/account.service.js'
import { MODES } from '../config/roomCatalog.js'

const router = Router()
const collection = db.collection('soundEffects')
const fail = (res, status, message) => res.status(status).json({ success: false, message })

function normalize(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const mode = body?.mode
  if (!name || name.length > 60 || !MODES.includes(mode)) return null
  let url
  try { url = new URL(body.url) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 1024 ||
    !url.hostname.includes('.') || isIP(url.hostname) ||
    /(?:^|\.)(?:local|localhost|internal)$/.test(url.hostname) ||
    /(?:^|\.)example\.(?:com|net|org)$/.test(url.hostname) ||
    !/\.(?:mp3|wav|ogg|m4a)$/i.test(url.pathname)) return null
  return { name, mode, url: url.href, enabled: body.enabled !== false }
}

router.get('/', async (_req, res) => {
  try {
    const snap = await collection.limit(100).get()
    res.json({ success: true, data: snap.docs.map((doc) => {
      const { updatedBy, ...entry } = doc.data()
      return entry
    }).filter((entry) => entry.enabled) })
  } catch (error) {
    console.error('Sound effects catalog:', error)
    fail(res, 503, 'Daftar suara belum dapat dimuat.')
  }
})

router.use(optionalAuth, requireAuth, requireAdmin)

router.get('/admin', async (_req, res) => {
  try {
    const snap = await collection.limit(100).get()
    res.json({ success: true, data: snap.docs.map((doc) => doc.data()) })
  } catch (error) {
    console.error('Admin sound effects:', error)
    fail(res, 503, 'Daftar suara belum dapat dimuat.')
  }
})

router.post('/', async (req, res) => {
  const entry = normalize(req.body)
  if (!entry) return fail(res, 400, 'Nama, mode, atau URL audio HTTPS belum valid.')
  try {
    const snap = await collection.limit(100).get()
    if (snap.docs.length >= 100) return fail(res, 409, 'Batas 100 suara telah tercapai.')
    const now = Date.now()
    const sound = { id: randomUUID(), ...entry, createdAt: now, updatedAt: now, updatedBy: req.user.uid }
    await collection.doc(sound.id).create(sound)
    res.status(201).json({ success: true, data: sound })
  } catch (error) {
    console.error('Create sound effect:', error)
    fail(res, 503, 'Suara belum tersimpan.')
  }
})

router.patch('/:id', async (req, res) => {
  const entry = normalize(req.body)
  if (!entry || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return fail(res, 400, 'Data suara tidak valid.')
  try {
    const target = collection.doc(req.params.id)
    const snap = await target.get()
    if (!snap.exists) return fail(res, 404, 'Suara tidak ditemukan.')
    const sound = { ...snap.data(), ...entry, updatedAt: Date.now(), updatedBy: req.user.uid }
    await target.set(sound)
    res.json({ success: true, data: sound })
  } catch (error) {
    console.error('Update sound effect:', error)
    fail(res, 503, 'Suara belum diperbarui.')
  }
})

router.delete('/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return fail(res, 400, 'ID suara tidak valid.')
  try {
    const target = collection.doc(req.params.id)
    const snap = await target.get()
    if (!snap.exists) return fail(res, 404, 'Suara tidak ditemukan.')
    await target.delete()
    res.json({ success: true, data: { id: req.params.id } })
  } catch (error) {
    console.error('Delete sound effect:', error)
    fail(res, 503, 'Suara belum dihapus.')
  }
})

export default router
