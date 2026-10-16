import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { db } from '../config/firebase.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../services/account.service.js'

const router = Router()
const collection = db.collection('gameCatalogOverrides')
const native = new Set(['couple-quiz', 'truth-or-dare', 'tic-tac-toe', 'would-you-rather', 'memory-match'])
const builtinExternal = new Set(['playpager-word-puzzle', 'playpager-reversi', 'playpager-checkers'])
const categories = new Set(['romantic', 'fun', 'competitive', 'coop'])
const statuses = new Set(['available', 'coming-soon', 'disabled'])
const validId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id)
const fail = (res, status, message) => res.status(status).json({ success: false, message })

function normalizeExternal(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const subtitle = typeof body?.subtitle === 'string' ? body.subtitle.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  if (!title || title.length > 80 || subtitle.length > 100 || description.length > 240 || !categories.has(body.category) || !statuses.has(body.status)) return null
  let url
  try { url = new URL(body.url) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || isIP(url.hostname) || /(?:^|\.)example\.(?:com|net|org)$/.test(url.hostname) || /(?:^|\.)(?:local|localhost|internal)$/.test(url.hostname)) return null
  const embedded = body.type === 'embedded'
  if (!embedded && body.type !== 'external') return null
  const minPlayers = Number(body.minPlayers)
  const maxPlayers = Number(body.maxPlayers)
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers) || minPlayers < 1 || maxPlayers > 24 || minPlayers > maxPlayers) return null
  return {
    title, subtitle, description, category: body.category, status: body.status, type: body.type,
    url: url.href, embedUrl: embedded ? url.href : '', embedAllowed: embedded,
    allowedEmbedHosts: embedded ? [url.hostname] : [], allowedExternalHosts: [url.hostname],
    minPlayers, maxPlayers, icon: '🕹️', coverGradient: 'linear-gradient(135deg, #BFDBFE, #DDD6FE)',
    duration: 'External', tags: ['browser'], component: null,
    features: { multiplayer: false, turnBased: false, scoring: false, restart: true },
  }
}

router.get('/', async (_req, res) => {
  try {
    const snap = await collection.limit(100).get()
    res.json({ success: true, data: snap.docs.map(doc => {
      const { updatedBy, ...publicGame } = doc.data()
      return publicGame
    }) })
  } catch (error) {
    console.error('Game catalog:', error)
    fail(res, 503, 'Katalog game belum bisa dimuat.')
  }
})

router.use(optionalAuth, requireAuth, requireAdmin)

router.post('/', async (req, res) => {
  try {
    const game = normalizeExternal(req.body)
    if (!game) return fail(res, 400, 'Konfigurasi game eksternal belum valid.')
    const count = await collection.where('custom', '==', true).count().get()
    if (count.data().count >= 20) return fail(res, 409, 'Batas game eksternal tambahan telah tercapai.')
    const now = Date.now()
    const entry = { ...game, id: `external-${randomUUID()}`, custom: true, createdAt: now, updatedAt: now, updatedBy: req.user.uid }
    await collection.doc(entry.id).create(entry)
    res.status(201).json({ success: true, data: entry })
  } catch (error) {
    console.error('Create catalog game:', error)
    fail(res, 503, 'Game belum tersimpan.')
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!validId(id)) return fail(res, 400, 'ID game tidak valid.')
    const target = collection.doc(id)
    const snap = await target.get()
    const now = Date.now()
    if (native.has(id)) {
      if (!statuses.has(req.body?.status)) return fail(res, 400, 'Status game tidak valid.')
      const entry = { id, status: req.body.status, createdAt: snap.exists ? snap.data().createdAt : now, updatedAt: now, updatedBy: req.user.uid }
      await target.set(entry)
      return res.json({ success: true, data: entry })
    }
    if (!builtinExternal.has(id) && !snap.exists) return fail(res, 404, 'Game tidak ditemukan.')
    const game = normalizeExternal(req.body)
    if (!game) return fail(res, 400, 'Konfigurasi game eksternal belum valid.')
    const entry = { ...game, id, custom: !builtinExternal.has(id), ...(builtinExternal.has(id) ? { sharedScreenOnly: true } : {}), createdAt: snap.exists ? snap.data().createdAt : now, updatedAt: now, updatedBy: req.user.uid }
    await target.set(entry)
    res.json({ success: true, data: entry })
  } catch (error) {
    console.error('Update catalog game:', error)
    fail(res, 503, 'Perubahan game belum tersimpan.')
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!validId(id) || native.has(id) || builtinExternal.has(id)) return fail(res, 400, 'Game bawaan tidak dapat dihapus; nonaktifkan statusnya.')
    const target = collection.doc(id)
    const snap = await target.get()
    if (!snap.exists || snap.data().custom !== true) return fail(res, 404, 'Game tidak ditemukan.')
    await target.delete()
    res.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Delete catalog game:', error)
    fail(res, 503, 'Game belum bisa dihapus.')
  }
})

export default router
