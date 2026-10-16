const VIDEO_EXTENSIONS = /\.(mp4|webm|ogv|ogg)$/i

export function directVideoUrl(input) {
  try {
    const url = new URL(String(input || '').trim())
    if (url.protocol !== 'https:' || url.username || url.password || !VIDEO_EXTENSIONS.test(url.pathname)) return ''
    return url.href
  } catch { return '' }
}

export function sharedVideoTime(state, now) {
  const position = Number(state?.position)
  if (!Number.isFinite(position) || position < 0) return 0
  const elapsed = state?.playing && Number.isFinite(state.updatedAt)
    ? Math.max(0, Math.min(6 * 60 * 60, (now - state.updatedAt) / 1000)) : 0
  return Math.max(0, position + elapsed)
}
