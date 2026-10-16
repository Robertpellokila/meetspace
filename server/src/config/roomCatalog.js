// Keep mode IDs and mood IDs consistent with the frontend catalog.
export const MODES = ['professional', 'watchParty', 'study', 'hangout', 'gameNight']
export const MOODS = {
  midnight: { name:'Midnight Office' }, romantic: { name:'Romantic Night' },
  cozyCinema: { name:'Cozy Cinema' }, vintageCafe: { name:'Vintage Café' },
  goldenHour: { name:'Golden Hour' }, forestRetreat: { name:'Forest Retreat' },
  arcade: { name:'Retro Arcade' }, focus: { name:'Focus Studio' },
}
export const ALLOWED_MOODS = {
  professional:['midnight','goldenHour','focus'],
  watchParty:['romantic','cozyCinema','goldenHour'],
  study:['focus','vintageCafe','forestRetreat'],
  hangout:['vintageCafe','romantic','goldenHour','forestRetreat'],
  gameNight:['arcade','goldenHour','cozyCinema'],
}
export function validRoom(mode, theme) {
  return MODES.includes(mode) && Object.hasOwn(MOODS, theme) && ALLOWED_MOODS[mode].includes(theme)
}
