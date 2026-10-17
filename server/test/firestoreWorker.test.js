import test from 'node:test'
import assert from 'node:assert/strict'
import { RestFirestore, AggregateField, FieldPath } from '../src/platform/firestore-worker.js'

const root = 'projects/test-project/databases/(default)/documents'

function mockDatabase(responses) {
  const requests = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null, method: options.method })
    const answer = responses.shift()
    assert.ok(answer, `Unexpected Firestore request: ${url}`)
    return { ok: answer.status == null || answer.status < 400, status: answer.status || 200,
      json: async () => answer.body ?? {} }
  }
  const db = new RestFirestore({ projectId: 'test-project', credential: { getAccessToken: async () => ({ access_token: 'test-token' }) } })
  return { db, requests, restore: () => { globalThis.fetch = original } }
}

test('REST adapter reads nested documents and preserves Firestore value types', async () => {
  const mock = mockDatabase([
    { body: { name: `${root}/rooms/a`, fields: { count: { integerValue: '2' },
      metadata: { mapValue: { fields: { active: { booleanValue: true } } } },
      tags: { arrayValue: { values: [{ stringValue: 'retro' }] } },
    } } },
    { status: 404, body: { error: { message: 'missing' } } },
  ])
  try {
    const found = await mock.db.collection('rooms').doc('a').get()
    assert.equal(found.exists, true)
    assert.deepEqual(found.data(), { count: 2, metadata: { active: true }, tags: ['retro'] })
    assert.equal(found.ref.id, 'a')
    const missing = await mock.db.collection('rooms').doc('missing').get()
    assert.equal(missing.exists, false)
    assert.equal(missing.data(), undefined)
  } finally { mock.restore() }
})

test('REST adapter emits filtered queries, document cursors, and aggregates', async () => {
  const mock = mockDatabase([
    { body: [{ document: { name: `${root}/accounts/b`, fields: { email: { stringValue: 'b@example.com' } } } }] },
    { body: [{ result: { aggregateFields: { count: { integerValue: '3' }, durationMs: { integerValue: '4200' } } } }] },
  ])
  try {
    const query = mock.db.collection('accounts').where('access', '==', 'full')
      .orderBy(FieldPath.documentId()).startAfter('a').limit(51)
    const result = await query.get()
    assert.equal(result.docs[0].id, 'b')
    assert.equal(mock.requests[0].body.structuredQuery.where.fieldFilter.value.stringValue, 'full')
    assert.equal(mock.requests[0].body.structuredQuery.startAt.values[0].referenceValue, `${root}/accounts/a`)
    const aggregate = await mock.db.collection('usageSessions').aggregate({
      count: AggregateField.count(), durationMs: AggregateField.sum('durationMs'),
    }).get()
    assert.deepEqual(aggregate.data(), { count: 3, durationMs: 4200 })
    assert.equal(mock.requests[1].body.structuredAggregationQuery.aggregations[1].sum.field.fieldPath, 'durationMs')
  } finally { mock.restore() }
})

test('REST adapter commits transaction writes with create precondition and merge mask', async () => {
  const mock = mockDatabase([
    { body: { transaction: 'transaction-token' } },
    { body: [{ missing: `${root}/meetingCodes/1234567890` }] },
    { body: {} },
  ])
  try {
    const room = mock.db.collection('rooms').doc('room-a')
    const code = mock.db.collection('meetingCodes').doc('1234567890')
    const value = await mock.db.runTransaction(async tx => {
      const existing = await tx.get(code)
      assert.equal(existing.exists, false)
      tx.create(code, { roomId: room.id })
      tx.set(room, { status: 'active' }, { merge: true })
      return 'saved'
    })
    assert.equal(value, 'saved')
    const commit = mock.requests[2].body
    assert.equal(commit.transaction, 'transaction-token')
    assert.deepEqual(commit.writes[0].currentDocument, { exists: false })
    assert.deepEqual(commit.writes[1].updateMask.fieldPaths, ['status'])
  } finally { mock.restore() }
})
