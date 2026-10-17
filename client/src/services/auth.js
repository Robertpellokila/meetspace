
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  reload,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

import { shallowRef, triggerRef } from 'vue'
import { firebaseAuth as auth } from './firebase.js'

export const currentUser = shallowRef(null)

let resolveReady

const authReady = new Promise((resolve) => {
  resolveReady = resolve
})

onAuthStateChanged(
  auth,
  (user) => {
    currentUser.value = user
    resolveReady()
  },
  (error) => {
    console.error('Firebase Auth Error:', error)
    currentUser.value = null
    resolveReady()
  }
)

export function awaitAuthReady() {
  return authReady
}

export async function logout() {
  await signOut(auth)
  currentUser.value = null
}

export async function login(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  currentUser.value = result.user
  return result.user
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(auth, provider)
  currentUser.value = result.user
  return result.user
}

export async function sendResetPasswordEmail(email) {
  auth.languageCode = 'id'
  try {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: false,
    })
  } catch (error) {
    // Older Firebase projects may still return user-not-found. Keep the
    // response indistinguishable from a registered address.
    if (error.code !== 'auth/user-not-found') throw error
  }
}

export async function register(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  currentUser.value = result.user
  return result.user
}

export async function refreshEmailVerification() {
  const user = auth.currentUser
  if (!user) return false
  await reload(user)
  await user.getIdToken(true)
  currentUser.value = user
  triggerRef(currentUser)
  return user.emailVerified
}
