
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

import { ref } from 'vue'
import { firebaseAuth as auth } from './firebase.js'

export const currentUser = ref(null)

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

export async function register(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  currentUser.value = result.user
  return result.user
}
