import { test, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { records, db, adminAuth } from '../testing/firestore.js'

mock.module('../src/config/firebase.js', { namedExports: { db, adminAuth } })
process.env.RATE_LIMIT_SECRET = 'test-rate-limit-secret-at-least-thirty-two-characters'

const { consumeRateLimits } = await import('../src/services/rateLimit.service.js')
const { default: authRouter } = await import('../src/routes/auth.js')
const app = express().use('/api/auth', authRouter)
let server, base
before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(() => records.clear())

test('counters are shared in Firestore and reject all rules atomically', async () => {
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } }
  const rules = [
    { scope: 'global', limit: 1, windowMs: 60_000 },
    { scope: 'room', limit: 3, windowMs: 60_000 },
  ]
  assert.equal((await consumeRateLimits(req, rules, 120_000)).allowed, true)
  const denied = await consumeRateLimits(req, rules, 120_001)
  assert.equal(denied.allowed, false)
  assert.equal(denied.retryAfterSeconds, 60)
  assert.deepEqual([...records.values()].map(value => value.count), [1, 1])
  assert.equal((await consumeRateLimits(req, rules, 180_000)).allowed, true)
  const other = { headers: {}, socket: { remoteAddress: '127.0.0.2' } }
  assert.equal((await consumeRateLimits(other, rules, 120_001)).allowed, true)
  assert.ok([...records.keys()].every(key => !key.includes('127.0.0.1')))
})

test('registration preflight returns 429 with Retry-After after twenty attempts', async () => {
  for (let index = 0; index < 20; index++) {
    const response = await fetch(`${base}/api/auth/registration-attempt`, { method: 'POST' })
    assert.equal(response.status, 200)
  }
  const response = await fetch(`${base}/api/auth/registration-attempt`, { method: 'POST' })
  assert.equal(response.status, 429)
  assert.ok(Number(response.headers.get('retry-after')) > 0)
  assert.equal((await response.json()).code, 'RATE_LIMITED')
})

test('registration preflight does not require a third-party email sender', async () => {
  const saved = { EMAIL_FROM: process.env.EMAIL_FROM, RESEND_API_KEY: process.env.RESEND_API_KEY }
  delete process.env.EMAIL_FROM
  delete process.env.RESEND_API_KEY
  try {
    const response = await fetch(`${base}/api/auth/registration-attempt`, { method: 'POST' })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).success, true)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('missing rate-limit secret fails closed instead of disabling protection', async () => {
  const saved = process.env.RATE_LIMIT_SECRET
  delete process.env.RATE_LIMIT_SECRET
  try {
    await assert.rejects(consumeRateLimits({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, [
      { scope: 'registration', limit: 5, windowMs: 60_000 },
    ]))
  } finally { process.env.RATE_LIMIT_SECRET = saved }
})

test('direct Node traffic cannot spoof Cloudflare IP header', async () => {
  const rules = [{ scope: 'spoof-check', limit: 1, windowMs: 60_000 }]
  const socket = { remoteAddress: '127.0.0.8' }
  const first = { headers: { 'cf-connecting-ip': '203.0.113.1' }, socket }
  const spoofed = { headers: { 'cf-connecting-ip': '203.0.113.2' }, socket }
  assert.equal((await consumeRateLimits(first, rules, 240_000)).allowed, true)
  assert.equal((await consumeRateLimits(spoofed, rules, 240_001)).allowed, false)
})
