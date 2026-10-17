import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

const state = { user: null, resetEmail: null, resetSettings: null, verificationUser: null, verificationSettings: null, provider: null }
const firebaseAuth = { get currentUser() { return state.user }, languageCode: '' }
const passwordUser = { email: 'member@example.test', emailVerified: true }
const googleUser = { email: 'google@example.test', emailVerified: true }
mock.module('../src/services/firebase.js', { namedExports: { firebaseAuth } })
mock.module('firebase/auth', { namedExports: {
  onAuthStateChanged: (_auth, listener) => { listener(null); return () => {} },
  signInWithEmailAndPassword: async () => ({ user: passwordUser }),
  signInWithPopup: async (_auth, provider) => { state.provider = provider; return { user: googleUser } },
  GoogleAuthProvider: class { setCustomParameters(parameters) { this.parameters = parameters } },
  createUserWithEmailAndPassword: async () => ({ user: passwordUser }),
  signOut: async () => { state.user = null },
  sendPasswordResetEmail: async (_auth, email, settings) => { state.resetEmail = email; state.resetSettings = settings; throw { code: 'auth/user-not-found' } },
  sendEmailVerification: async (user, settings) => { state.verificationUser = user; state.verificationSettings = settings },
  reload: async () => {},
} })
const auth = await import('../src/services/auth.js')
const { sendVerificationLink } = await import('../src/services/emailVerification.js')

test('later password logins complete without another email verification', async () => {
  assert.equal(await auth.login('member@example.test', 'password'), passwordUser)
  assert.equal(auth.currentUser.value, passwordUser)
})

test('Google sign-in uses the existing Firebase session', async () => {
  assert.equal(await auth.loginWithGoogle(), googleUser)
  assert.equal(state.provider.parameters.prompt, 'select_account')
  assert.equal(auth.currentUser.value, googleUser)
})

test('password reset keeps unknown emails private and returns to the app', async () => {
  const oldWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://meetspace.example' } }
  try {
    await auth.sendResetPasswordEmail('unknown@example.test')
    assert.equal(state.resetEmail, 'unknown@example.test')
    assert.equal(state.resetSettings.url, 'https://meetspace.example/login')
  } finally { globalThis.window = oldWindow }
})

test('signup verification uses the built-in Firebase email link without an extra sender', async () => {
  const user = { email: 'member@example.test', emailVerified: false }
  state.user = user
  try {
    assert.deepEqual(await sendVerificationLink(), { verified: false })
    assert.equal(state.verificationUser, user)
    assert.equal(state.verificationSettings, undefined)
    assert.equal(firebaseAuth.languageCode, 'id')
    user.emailVerified = true
    state.verificationUser = null
    assert.deepEqual(await sendVerificationLink(), { verified: true })
    assert.equal(state.verificationUser, null)
  } finally { state.user = null }
})
