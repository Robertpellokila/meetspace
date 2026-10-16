import { test, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { records, db, adminAuth } from '../testing/firestore.js'

mock.module('../src/config/firebase.js', { namedExports: { db, adminAuth } })
process.env.ADMIN_UIDS = 'admin'
const { default: router } = await import('../src/routes/soundEffects.js')
const app = express().use(express.json()).use('/sound-effects', router)
let server, base
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}` })
after(async () => { await new Promise((resolve) => server.close(resolve)) })
beforeEach(() => records.clear())
async function request(path, method = 'GET', body, user) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, body: await response.json() }
}
const effect = { name: 'Scene chime', mode: 'watchParty', url: 'https://media.meetspace.test/chime.mp3', enabled: true }

test('admin manages mode-specific sounds while public catalog hides disabled entries and admin metadata', async () => {
  assert.equal((await request('/sound-effects', 'POST', effect)).status, 401)
  assert.equal((await request('/sound-effects', 'POST', effect, 'owner')).status, 403)
  const created = await request('/sound-effects', 'POST', effect, 'admin')
  assert.equal(created.status, 201)
  assert.equal((await request('/sound-effects')).body.data[0].updatedBy, undefined)
  const id = created.body.data.id
  assert.equal((await request(`/sound-effects/${id}`, 'PATCH', { ...effect, enabled: false }, 'admin')).status, 200)
  assert.equal((await request('/sound-effects')).body.data.length, 0)
  assert.equal((await request('/sound-effects/admin', 'GET', undefined, 'admin')).body.data.length, 1)
  assert.equal((await request(`/sound-effects/${id}`, 'DELETE', undefined, 'admin')).status, 200)
})

test('sound URLs and room modes must be valid before saving', async () => {
  assert.equal((await request('/sound-effects', 'POST', { ...effect, mode: 'other' }, 'admin')).status, 400)
  assert.equal((await request('/sound-effects', 'POST', { ...effect, url: 'http://localhost/chime.mp3' }, 'admin')).status, 400)
  assert.equal((await request('/sound-effects', 'POST', { ...effect, url: 'https://media.meetspace.test/chime.html' }, 'admin')).status, 400)
})
