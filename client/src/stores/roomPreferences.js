import { defineStore } from 'pinia'
import { roomModes } from '../config/roomModes'
import { themes } from '../config/themes'
export const useRoomPreferencesStore=defineStore('roomPreferences',{
 state:()=>({selectedMode:'professional',selectedTheme:'midnight'}),
 getters:{getSelectedMode:s=>roomModes[s.selectedMode],getSelectedTheme:s=>themes[s.selectedTheme],availableThemes:s=>roomModes[s.selectedMode]?.moods ?? []},
 actions:{
  setSelectedMode(mode){if(!roomModes[mode])return;this.selectedMode=mode;this.selectedTheme=roomModes[mode].defaultTheme},
  setSelectedTheme(theme){if(this.availableThemes.includes(theme) && themes[theme])this.selectedTheme=theme},
 }
})
