export const moods = {
  midnight:{icon:'☾',tileRadius:'6px',avatarRadius:'8px',frameStyle:'solid',name:'Midnight Office',accent:'#4F5B2A',pattern:'stripes'},
  romantic:{icon:'♥',tileRadius:'30px 30px 12px 12px',avatarRadius:'35% 35% 50% 50%',frameStyle:'solid',name:'Romantic Night',accent:'#B8892D',pattern:'hearts'},
  cozyCinema:{icon:'▣',tileRadius:'8px',avatarRadius:'12px',frameStyle:'double',name:'Cozy Cinema',accent:'#B8892D',pattern:'spotlight'},
  vintageCafe:{icon:'☕',tileRadius:'24px 8px 24px 8px',avatarRadius:'25%',frameStyle:'solid',name:'Vintage Café',accent:'#D8C9A8',pattern:'coffee'},
  goldenHour:{icon:'☀',tileRadius:'28px',avatarRadius:'50%',frameStyle:'solid',name:'Golden Hour',accent:'#B8892D',pattern:'sunburst'},
  forestRetreat:{icon:'❧',tileRadius:'32px 6px 32px 6px',avatarRadius:'50% 12% 50% 12%',frameStyle:'solid',name:'Forest Retreat',accent:'#4F5B2A',pattern:'leaves'},
  arcade:{icon:'✚',tileRadius:'2px',avatarRadius:'0',frameStyle:'dashed',name:'Retro Arcade',accent:'#B8892D',pattern:'pixel'},
  focus:{icon:'◎',tileRadius:'12px',avatarRadius:'50%',frameStyle:'solid',name:'Focus Studio',accent:'#4F5B2A',pattern:'dots'},
}
export const allowedMoods={
  professional:['midnight','goldenHour','focus'],
  watchParty:['romantic','cozyCinema','goldenHour'],
  study:['focus','vintageCafe','forestRetreat'],
  hangout:['vintageCafe','romantic','goldenHour','forestRetreat'],
  gameNight:['arcade','goldenHour','cozyCinema'],
}

export function resolveMood(roomMood, override='default') {
  return Object.hasOwn(moods,override)?override:Object.hasOwn(moods,roomMood)?roomMood:'focus'
}
