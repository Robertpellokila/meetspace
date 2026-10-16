import { test, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { records, db, adminAuth } from '../testing/firestore.js'

mock.module('../src/config/firebase.js', { namedExports: { db, adminAuth } })
process.env.ADMIN_UIDS = 'admin'
const { default: router } = await import('../src/routes/gameContent.js')
const app = express().use(express.json()).use('/game-content', router)
let server, base
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}` })
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(() => records.clear())
async function request(path, method = 'GET', body, user) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, body: await response.json() }
}
const question = { gameId: 'couple-quiz', category: 'romantic', text: 'Apa acara akhir pekan favoritmu?', options: ['Piknik', 'Film', 'Makan malam', 'Jalan-jalan'] }

test('public can read game content, but only admins can change it', async () => {
  assert.deepEqual((await request('/game-content')).body.data, [])
  assert.equal((await request('/game-content', 'POST', question)).status, 401)
  assert.equal((await request('/game-content', 'POST', question, 'owner')).status, 403)
  assert.equal((await request('/game-content', 'POST', { ...question, options: ['one'] }, 'admin')).status, 400)
  assert.equal((await request('/game-content', 'POST', { ...question, gameId: 'unknown' }, 'admin')).status, 400)
})

test('admin can create, edit, hide, restore and delete a custom question', async () => {
  const created = await request('/game-content', 'POST', question, 'admin')
  assert.equal(created.status, 201)
  const id = created.body.data.id
  assert.match(id, /^custom-/)
  assert.equal((await request('/game-content')).body.data[0].text, question.text)
  assert.equal((await request('/game-content')).body.data[0].updatedBy, undefined)
  const edited = await request(`/game-content/couple-quiz/${id}`, 'PATCH', { ...question, text: 'Apa pilihan acara akhir pekanmu?', enabled: false }, 'admin')
  assert.equal(edited.status, 200)
  assert.equal(edited.body.data.enabled, false)
  const restored = await request(`/game-content/couple-quiz/${id}`, 'PATCH', { ...question, enabled: true }, 'admin')
  assert.equal(restored.body.data.enabled, true)
  assert.equal((await request(`/game-content/couple-quiz/${id}`, 'DELETE', null, 'admin')).status, 200)
  assert.deepEqual((await request('/game-content')).body.data, [])
})

test('built-in overrides retain their ID, and malformed content cannot be stored', async () => {
  const override = await request('/game-content/couple-quiz/r1', 'PATCH', { ...question, enabled: false }, 'admin')
  assert.equal(override.status, 200)
  assert.equal(override.body.data.id, 'r1')
  assert.equal(override.body.data.enabled, false)
  assert.equal((await request('/game-content/couple-quiz/r1', 'PATCH', { ...question, category: 'other' }, 'admin')).status, 400)
  assert.equal((await request('/game-content/couple-quiz/r1', 'PATCH', question, 'owner')).status, 403)
  assert.equal((await request('/game-content')).body.data.length, 1)
  assert.equal((await request('/game-content/couple-quiz/r2?category=romantic', 'DELETE', null, 'admin')).status, 200)
  assert.equal((await request('/game-content')).body.data.find(item => item.id === 'r2').category, 'romantic')
})
