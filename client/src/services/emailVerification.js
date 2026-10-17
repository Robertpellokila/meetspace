import { sendEmailVerification } from 'firebase/auth'
import { currentUser } from './auth.js'
import { firebaseAuth } from './firebase.js'

export async function sendVerificationLink() {
  const user = firebaseAuth.currentUser || currentUser.value
  if (!user) throw new Error('Masuk dahulu untuk mengirim link verifikasi email.')
  if (user.emailVerified) return { verified: true }
  firebaseAuth.languageCode = 'id'
  await sendEmailVerification(user)
  return { verified: false }
}
