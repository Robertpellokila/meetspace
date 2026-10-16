import { test, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { records, db, adminAuth } from '../testing/firestore.js'

mock.module('../src/config/firebase.js', { namedExports: { db, adminAuth } })
process.env.ADMIN_UIDS = 'admin'
const { default: router } = await import('../src/routes/gameCatalog.js')
const app = express().use(express.json()).use('/game-catalog', router)
let server, base
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}` })
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(() => records.clear())
async function request(path, method = 'GET', body, user) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, body: await response.json() }
}
const game = { title: 'Arcade Mini', subtitle: 'Main bersama', description: 'Game browser', category: 'fun', status: 'available', type: 'embedded', url: 'https://games.meetspace.test/play', minPlayers: 1, maxPlayers: 8 }

test('only admin can manage catalog and native settings cannot replace component code', async () => {
  assert.equal((await request('/game-catalog')).status, 200)
  assert.equal((await request('/game-catalog', 'POST', game)).status, 401)
  assert.equal((await request('/game-catalog', 'POST', game, 'owner')).status, 403)
  assert.equal((await request('/game-catalog/couple-quiz', 'PATCH', { status: 'available', component: 'Other' }, 'admin')).status, 200)
  assert.deepEqual(Object.keys(records.get('gameCatalogOverrides/couple-quiz')).sort(), ['createdAt', 'id', 'status', 'updatedAt', 'updatedBy'])
  assert.equal((await request('/game-catalog/couple-quiz', 'DELETE', null, 'admin')).status, 400)
})

test('external games require approved HTTPS URL and support create, update, delete', async () => {
  assert.equal((await request('/game-catalog', 'POST', { ...game, url: 'http://localhost:3000' }, 'admin')).status, 400)
  assert.equal((await request('/game-catalog', 'POST', { ...game, url: 'https://games.example.com/play' }, 'admin')).status, 400)
  const created = await request('/game-catalog', 'POST', game, 'admin')
  assert.equal(created.status, 201)
  const id = created.body.data.id
  assert.equal(created.body.data.allowedEmbedHosts[0], 'games.meetspace.test')
  assert.equal((await request('/game-catalog')).body.data.length, 1)
  assert.equal((await request('/game-catalog')).body.data[0].updatedBy, undefined)
  const changed = await request(`/game-catalog/${id}`, 'PATCH', { ...game, type: 'external', status: 'disabled' }, 'admin')
  assert.equal(changed.body.data.embedAllowed, false)
  assert.equal(changed.body.data.status, 'disabled')
  assert.equal((await request(`/game-catalog/${id}`, 'DELETE', null, 'admin')).status, 200)
  assert.deepEqual((await request('/game-catalog')).body.data, [])
})

test('built-in browser games can be edited but not deleted', async () => {
  const response = await request('/game-catalog/playpager-reversi', 'PATCH', {
    ...game, url: 'https://playpager.com/embed/reversi/index.html',
  }, 'admin')
  assert.equal(response.status, 200)
  assert.equal(response.body.data.custom, false)
  assert.equal(response.body.data.sharedScreenOnly, true)
  assert.equal((await request('/game-catalog/playpager-reversi', 'DELETE', null, 'admin')).status, 400)
})
