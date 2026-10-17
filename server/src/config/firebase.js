import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, initializeFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const credential = creds ? cert(JSON.parse(creds)) : applicationDefault()
  initializeApp({ credential })
}
export const adminAuth = getAuth()
// Worker builds replace firebase-admin/firestore with the REST adapter.
// Local Node deployments keep the Admin SDK; they can opt into its REST mode.
let firestore
function currentDb() {
  firestore ??= process.env.FIRESTORE_PREFER_REST === 'true'
    ? initializeFirestore(getApps()[0], { preferRest: true })
    : getFirestore()
  return firestore
}

// Some route modules keep collection references at module scope. Defer the
// actual Firestore client until a request, where Workers permits randomness.
export const db = new Proxy({}, {
  get(_target, property) {
    if (property === 'collection') return name => new Proxy({}, {
      get(_collection, member) {
        const actual = currentDb().collection(name)
        const value = actual[member]
        return typeof value === 'function' ? value.bind(actual) : value
      },
    })
    const actual = currentDb()
    const value = actual[property]
    return typeof value === 'function' ? value.bind(actual) : value
  },
})

