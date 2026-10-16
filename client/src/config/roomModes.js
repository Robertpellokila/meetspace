import { allowedMoods } from './moods'
export const roomModes={
 professional:{name:'Professional Meeting',layout:'professional',defaultTheme:'midnight',moods:allowedMoods.professional,features:{screenShare:true,chat:true,reactions:true,raiseHand:true}},
 watchParty:{name:'Watch Party',layout:'watchParty',defaultTheme:'romantic',moods:allowedMoods.watchParty,features:{watchSync:true,chat:true,reactions:true,screenShare:true}},
 study:{name:'Study Room',layout:'study',defaultTheme:'focus',moods:allowedMoods.study,features:{whiteboard:true,screenShare:true,chat:true}},
 hangout:{name:'Hangout Room',layout:'hangout',defaultTheme:'vintageCafe',moods:allowedMoods.hangout,features:{chat:true,reactions:true,screenShare:true}},
 gameNight:{name:'Game Night',layout:'gameNight',defaultTheme:'arcade',moods:allowedMoods.gameNight,features:{chat:true,reactions:true,screenShare:true}}
}
