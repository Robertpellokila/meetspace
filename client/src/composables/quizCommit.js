/** Prototype commitment fingerprint. Non-cryptographic FNV-1a; not suitable for prizes/anti-cheat. */
export function quizCommit(questionId, answer, nonce) {
  const value = JSON.stringify([questionId, answer, nonce]); let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
