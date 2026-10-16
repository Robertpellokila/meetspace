export const MOOD_SOUND_CHOICES = Object.freeze([
  { id: 'mood', label: 'Sesuai mood', icon: '✦' },
  { id: 'rain', label: 'Hujan lembut', icon: '☂' },
  { id: 'forest', label: 'Angin hutan', icon: '❧' },
  { id: 'cafe', label: 'Kafe tenang', icon: '☕' },
  { id: 'warm', label: 'Nada hangat', icon: '♥' },
  { id: 'cinema', label: 'Proyektor retro', icon: '▣' },
  { id: 'arcade', label: 'Arcade pelan', icon: '✚' },
  { id: 'focus', label: 'Focus noise', icon: '◎' },
])

export const MOOD_DEFAULT_SOUND = Object.freeze({
  midnight: 'rain',
  romantic: 'warm',
  cozyCinema: 'cinema',
  vintageCafe: 'cafe',
  goldenHour: 'warm',
  forestRetreat: 'forest',
  arcade: 'arcade',
  focus: 'focus',
})

export function soundForMood(mood) {
  return MOOD_DEFAULT_SOUND[mood] || 'focus'
}
