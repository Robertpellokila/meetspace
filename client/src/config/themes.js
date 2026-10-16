// Compatibility layer for the existing roomPreferences store and CreateRoomPage.
// These are mood decorations, NOT light/dark appearance or global brand colors.
import { moods } from './moods'
export const themes = Object.fromEntries(Object.entries(moods).map(([id,m])=>[id,{
 name:m.name,icon:m.icon,primaryColor:m.accent,backgroundColor:'#F5EFE3',surfaceColor:'#D8C9A8',textColor:'#303826',borderRadius:'18px',pattern:m.pattern
}]))
