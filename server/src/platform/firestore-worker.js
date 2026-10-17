// Firestore's Node SDK generates protobuf functions at runtime, which Workers
// disallows. This small REST transport preserves the Firestore calls used by
// MeetSpace's existing Express routes, including atomic transactions.
import { getApps } from 'firebase-admin/app'

const API = 'https://firestore.googleapis.com/v1'
const DOCUMENT_ID = '__name__'

export class FieldPath {
  static documentId() { return DOCUMENT_ID }
}

export class AggregateField {
  static count() { return { op: 'count' } }
  static sum(field) { return { op: 'sum', field } }
}

function encode(value) {
  if (value === null) return { nullValue: null }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite Firestore number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (value && typeof value === 'object') return { mapValue: { fields: fields(value) } }
  throw new TypeError(`Unsupported Firestore value: ${typeof value}`)
}

function fields(data) {
  return Object.fromEntries(Object.entries(data || {})
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, encode(value)]))
}

function decode(value = {}) {
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return new Date(value.timestampValue)
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields)
  if ('referenceValue' in value) return value.referenceValue
  throw new TypeError('Unsupported Firestore REST value')
}

function decodeFields(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [name, decode(value)]))
}

class FirestoreRestError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export class RestFirestore {
  constructor(options = {}) {
    const credential = options.credential || getApps()[0]?.options?.credential
    const projectId = options.projectId || getApps()[0]?.options?.projectId || process.env.FIREBASE_PROJECT_ID
      || (process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id : null)
    if (!credential || !projectId) throw new Error('Firebase service account and project ID are required')
    this.credential = credential
    this.root = `projects/${encodeURIComponent(projectId)}/databases/(default)/documents`
  }

  async request(path, body, method = 'POST') {
    const token = await this.credential.getAccessToken()
    const response = await fetch(`${API}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status === 404 && method === 'GET') return null
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new FirestoreRestError(response.status,
      result.error?.message || `Firestore request failed (${response.status})`, result.error?.status)
    return result
  }

  collection(path) { return new RestQuery(this, path) }

  async runTransaction(callback) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { transaction } = await this.request(`${this.root}:beginTransaction`, {})
      const tx = new RestTransaction(this, transaction)
      try {
        const value = await callback(tx)
        if (tx.writes.length) {
          await this.request(`${this.root}:commit`, { transaction, writes: tx.writes })
        } else {
          await this.request(`${this.root}:rollback`, { transaction })
        }
        return value
      } catch (error) {
        await this.request(`${this.root}:rollback`, { transaction }).catch(() => {})
        if (error.status === 409 && attempt < 4) continue
        throw error
      }
    }
  }
}

class RestDocument {
  constructor(db, path) {
    this.db = db
    this.path = path
    this.id = path.split('/').at(-1)
  }
  get name() { return `${this.db.root}/${this.path.split('/').map(encodeURIComponent).join('/')}` }
  collection(name) { return new RestQuery(this.db, `${this.path}/${name}`) }
  async get() {
    const document = await this.db.request(this.name, undefined, 'GET')
    return new RestSnapshot(this, document)
  }
  async set(data, options = {}) { return this.db.request(`${this.db.root}:commit`, { writes: [writeFor(this, 'set', data, options)] }) }
  async create(data) { return this.db.request(`${this.db.root}:commit`, { writes: [writeFor(this, 'create', data)] }) }
  async update(data) { return this.db.request(`${this.db.root}:commit`, { writes: [writeFor(this, 'update', data)] }) }
  async delete() { return this.db.request(`${this.db.root}:commit`, { writes: [{ delete: this.name }] }) }
}

class RestSnapshot {
  constructor(ref, document) {
    this.ref = ref
    this.id = ref.id
    this.exists = Boolean(document)
    this.value = document ? decodeFields(document.fields) : undefined
  }
  data() { return this.value }
}

function writeFor(ref, kind, data, options = {}) {
  const write = { update: { name: ref.name, fields: fields(data) } }
  if (kind === 'create') write.currentDocument = { exists: false }
  if (kind === 'update') write.currentDocument = { exists: true }
  if (kind === 'update' || options.merge) {
    write.updateMask = { fieldPaths: Object.keys(data).filter(key => data[key] !== undefined) }
  }
  return write
}

class RestQuery {
  constructor(db, path, filters = [], ordering = [], maximum = null, cursor = null) {
    this.db = db
    this.path = path
    this.filters = filters
    this.ordering = ordering
    this.maximum = maximum
    this.cursor = cursor
  }
  doc(id) { return new RestDocument(this.db, `${this.path}/${id}`) }
  clone(changes) { return new RestQuery(this.db, this.path, this.filters, this.ordering, this.maximum, this.cursor).assign(changes) }
  assign(changes) { Object.assign(this, changes); return this }
  where(field, operator, value) {
    if (operator !== '==') throw new TypeError('Unsupported Firestore query operator')
    return this.clone({ filters: [...this.filters, { field, value }] })
  }
  orderBy(field, direction = 'asc') {
    return this.clone({ ordering: [...this.ordering, { field, direction }] })
  }
  limit(count) { return this.clone({ maximum: count }) }
  startAfter(value) { return this.clone({ cursor: value }) }
  count() { return new RestAggregate(this, { count: AggregateField.count() }) }
  aggregate(spec) { return new RestAggregate(this, spec) }

  structuredQuery() {
    const segments = this.path.split('/')
    const collectionId = segments.pop()
    const where = this.filters.map(({ field, value }) => value === null
      ? { unaryFilter: { field: { fieldPath: field }, op: 'IS_NULL' } }
      : { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) } })
    const structured = {
      from: [{ collectionId }],
      ...(where.length ? { where: where.length === 1 ? where[0] : { compositeFilter: { op: 'AND', filters: where } } } : {}),
      ...(this.ordering.length ? { orderBy: this.ordering.map(({ field, direction }) => ({ field: { fieldPath: field }, direction: direction.toLowerCase() === 'desc' ? 'DESCENDING' : 'ASCENDING' })) } : {}),
      ...(this.maximum != null ? { limit: this.maximum } : {}),
    }
    if (this.cursor != null) {
      const first = this.ordering[0]?.field
      if (!first) throw new TypeError('startAfter requires orderBy')
      const value = first === DOCUMENT_ID
        ? { referenceValue: `${this.db.root}/${this.path}/${this.cursor}` }
        : encode(this.cursor)
      structured.startAt = { values: [value], before: false }
    }
    return { parent: `${this.db.root}${segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : ''}`, structured }
  }

  async get() {
    const { parent, structured } = this.structuredQuery()
    const rows = await this.db.request(`${parent}:runQuery`, { structuredQuery: structured })
    const docs = rows.filter(row => row.document).map(row => {
      const path = row.document.name.slice(this.db.root.length + 1)
      return new RestSnapshot(new RestDocument(this.db, path), row.document)
    })
    return { docs, empty: docs.length === 0, size: docs.length }
  }
}

class RestAggregate {
  constructor(query, spec) { this.query = query; this.spec = spec }
  async get() {
    const { parent, structured } = this.query.structuredQuery()
    const aggregations = Object.entries(this.spec).map(([alias, operation]) => ({ alias,
      ...(operation.op === 'count' ? { count: {} } : { sum: { field: { fieldPath: operation.field } } }),
    }))
    const rows = await this.query.db.request(`${parent}:runAggregationQuery`, {
      structuredAggregationQuery: { structuredQuery: structured, aggregations },
    })
    const aggregate = rows.find(row => row.result)?.result?.aggregateFields || {}
    return { data: () => Object.fromEntries(Object.keys(this.spec).map(alias => [alias, aggregate[alias] ? decode(aggregate[alias]) : 0])) }
  }
}

class RestTransaction {
  constructor(db, token) { this.db = db; this.token = token; this.writes = []; this.writing = false }
  async get(ref) {
    if (this.writing) throw new Error('Firestore transaction reads must precede writes')
    const rows = await this.db.request(`${this.db.root}:batchGet`, { documents: [ref.name], transaction: this.token })
    return new RestSnapshot(ref, rows.find(row => row.found)?.found || null)
  }
  set(ref, data, options) { this.writing = true; this.writes.push(writeFor(ref, 'set', data, options)); return this }
  create(ref, data) { this.writing = true; this.writes.push(writeFor(ref, 'create', data)); return this }
  update(ref, data) { this.writing = true; this.writes.push(writeFor(ref, 'update', data)); return this }
  delete(ref) { this.writing = true; this.writes.push({ delete: ref.name }); return this }
}

let singleton
export function getFirestore() { return singleton ??= new RestFirestore() }
export function initializeFirestore() { return getFirestore() }
