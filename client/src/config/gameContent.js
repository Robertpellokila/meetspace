import { shallowRef } from 'vue'

// Room snapshots carry the active game's overrides so all players use the same
// questions even if an admin edits the bank during a meeting.
const records = shallowRef([])
export const gameContentRecords = records

export function applyGameContent(items, gameId = '') {
  if (!Array.isArray(items)) return
  const safe = items.filter(item => item && typeof item === 'object' && typeof item.id === 'string')
  records.value = gameId
    ? [...records.value.filter(item => item.gameId !== gameId), ...safe.filter(item => item.gameId === gameId)]
    : safe
}

export function gameContentForSession(gameId) {
  return records.value.filter(item => item.gameId === gameId).map(item => ({ ...item }))
}

export function mergeGameContent(gameId, category, defaults, kind = '') {
  const changes = records.value.filter(item => item.gameId === gameId && item.category === category && (!kind || item.kind === kind))
  const byId = new Map(changes.map(item => [item.id, item]))
  const builtins = defaults.flatMap(item => {
    const change = byId.get(item.id)
    if (change?.enabled === false) return []
    return [{ ...item, ...(change || {}) }]
  })
  const known = new Set(defaults.map(item => item.id))
  return [...builtins, ...changes.filter(item => !known.has(item.id) && item.enabled !== false).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))]
}
