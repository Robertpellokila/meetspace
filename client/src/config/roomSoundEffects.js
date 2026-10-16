const sounds = {
  professional: [
    { id: 'chime', name: 'Gentle chime', icon: '🔔', tone: 'chime' },
    { id: 'applause', name: 'Celebration', icon: '🎉', tone: 'applause' },
  ],
  watchParty: [
    { id: 'chime', name: 'Scene chime', icon: '🎬', tone: 'chime' },
    { id: 'gasp', name: 'Plot twist', icon: '😮', tone: 'gasp' },
    { id: 'applause', name: 'Celebration', icon: '🎉', tone: 'applause' },
  ],
  study: [
    { id: 'chime', name: 'Break chime', icon: '🔔', tone: 'chime' },
  ],
  hangout: [
    { id: 'chime', name: 'Hello', icon: '👋', tone: 'chime' },
    { id: 'gasp', name: 'Surprise', icon: '😮', tone: 'gasp' },
    { id: 'applause', name: 'Celebration', icon: '🎉', tone: 'applause' },
  ],
  gameNight: [
    { id: 'chime', name: 'Your turn', icon: '🔔', tone: 'chime' },
    { id: 'buzzer', name: 'Buzzer', icon: '📣', tone: 'buzzer' },
    { id: 'applause', name: 'Win jingle', icon: '🏆', tone: 'applause' },
  ],
}

export function roomSoundEffects(mode, custom = []) {
  return [...(sounds[mode] || []), ...custom.filter((item) => item.enabled && item.mode === mode).map((item) => ({
    id: item.id, name: item.name, icon: '♫', url: item.url,
  }))]
}
