import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const credential = creds ? cert(JSON.parse(creds)) : applicationDefault()
  initializeApp({ credential })
}
export const adminAuth = getAuth()
export const db = getFirestore()

