import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../config/firebase.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../services/account.service.js'

const router = Router()
const collection = db.collection('gameContent')
const categories = {
  'couple-quiz': ['romantic', 'funny', 'deep-talk', 'know-me'],
  'truth-or-dare': ['romantic', 'funny', 'deep-talk'],
  'would-you-rather': ['romantic', 'funny', 'deep'],
}
const validId = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value)
const ref = (gameId, id) => collection.doc(`${gameId}__${id}`)
const fail = (res, status, message) => res.status(status).json({ success: false, message })
async function withinPacketLimit(gameId, next) {
  const docs = await collection.where('gameId', '==', gameId).get()
  const projected = docs.docs.map(doc => doc.data()).filter(item => item.id !== next.id)
  projected.push(next)
  return Buffer.byteLength(JSON.stringify(projected), 'utf8') <= 15_000
}

function normalize(body) {
  const gameId = body?.gameId
  const category = body?.category
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!categories[gameId]?.includes(category) || text.length < 5 || text.length > 280) return null
  const kind = gameId === 'truth-or-dare' ? body.kind : undefined
  if (gameId === 'truth-or-dare' && !['truth', 'dare'].includes(kind)) return null
  const count = gameId === 'couple-quiz' ? 4 : gameId === 'would-you-rather' ? 2 : 0
  const options = count ? body.options : undefined
  if (count && (!Array.isArray(options) || options.length !== count || options.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 100))) return null
  return { gameId, category, text, ...(kind ? { kind } : {}), ...(count ? { options: options.map(value => value.trim()) } : {}), enabled: body.enabled !== false }
}

router.get('/', async (_req, res) => {
  try {
    const snap = await collection.orderBy('createdAt', 'asc').limit(500).get()
    res.json({ success: true, data: snap.docs.map(doc => {
      const { id, gameId, category, kind, text, options, enabled, createdAt } = doc.data()
      return { id, gameId, category, ...(kind ? { kind } : {}), ...(text ? { text } : {}), ...(options ? { options } : {}), enabled, createdAt }
    }) })
  } catch (error) {
    console.error('Game content:', error)
    fail(res, 503, 'Konten game belum bisa dimuat.')
  }
})

router.use(optionalAuth, requireAuth, requireAdmin)

router.post('/', async (req, res) => {
  try {
    const data = normalize(req.body)
    if (!data) return fail(res, 400, 'Isi, kategori, atau pilihan pertanyaan belum valid.')
    const count = await collection.where('gameId', '==', data.gameId).count().get()
    if (count.data().count >= 120) return fail(res, 409, 'Batas konten tambahan untuk game ini telah tercapai.')
    const now = Date.now()
    const entry = { ...data, id: `custom-${randomUUID()}`, createdAt: now, updatedAt: now, updatedBy: req.user.uid }
    if (!await withinPacketLimit(data.gameId, entry)) return fail(res, 409, 'Bank pertanyaan game ini terlalu besar untuk disinkronkan.')
    await ref(data.gameId, entry.id).create(entry)
    res.status(201).json({ success: true, data: entry })
  } catch (error) {
    console.error('Create game content:', error)
    fail(res, 503, 'Konten game belum tersimpan.')
  }
})

router.patch('/:gameId/:id', async (req, res) => {
  try {
    const { gameId, id } = req.params
    if (!categories[gameId] || !validId(id) || req.body?.gameId !== gameId) return fail(res, 400, 'ID game tidak valid.')
    const data = normalize(req.body)
    if (!data) return fail(res, 400, 'Isi, kategori, atau pilihan pertanyaan belum valid.')
    const target = ref(gameId, id)
    const existing = await target.get()
    const now = Date.now()
    const entry = { ...data, id, createdAt: existing.exists ? existing.data().createdAt : now, updatedAt: now, updatedBy: req.user.uid }
    if (!await withinPacketLimit(gameId, entry)) return fail(res, 409, 'Bank pertanyaan game ini terlalu besar untuk disinkronkan.')
    await target.set(entry)
    res.json({ success: true, data: entry })
  } catch (error) {
    console.error('Update game content:', error)
    fail(res, 503, 'Perubahan konten game belum tersimpan.')
  }
})

router.delete('/:gameId/:id', async (req, res) => {
  try {
    const { gameId, id } = req.params
    if (!categories[gameId] || !validId(id)) return fail(res, 400, 'ID game tidak valid.')
    const target = ref(gameId, id)
    if (id.startsWith('custom-')) {
      const snap = await target.get()
      if (!snap.exists) return fail(res, 404, 'Konten tidak ditemukan.')
      await target.delete()
    } else {
      // Built-in questions live in the client bundle. A tombstone hides one
      // without making an old deployed client fail to import its default bank.
      const snap = await target.get()
      const now = Date.now()
      const category = snap.exists ? snap.data().category : req.query.category
      const kind = snap.exists ? snap.data().kind : req.query.kind
      if (!categories[gameId].includes(category) || (gameId === 'truth-or-dare' && !['truth', 'dare'].includes(kind))) return fail(res, 400, 'Kategori pertanyaan bawaan diperlukan untuk menyembunyikannya.')
      await target.set({ ...(snap.exists ? snap.data() : {}), id, gameId, category, ...(kind ? { kind } : {}), enabled: false, createdAt: snap.exists ? snap.data().createdAt : now, updatedAt: now, updatedBy: req.user.uid })
    }
    res.json({ success: true, data: { id, gameId } })
  } catch (error) {
    console.error('Delete game content:', error)
    fail(res, 503, 'Konten game belum bisa dihapus.')
  }
})

export default router
