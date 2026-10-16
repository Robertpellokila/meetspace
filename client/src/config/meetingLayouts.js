import ProfessionalLayout from '../components/room-layouts/ProfessionalLayout.vue'
import WatchPartyLayout from '../components/room-layouts/WatchPartyLayout.vue'
import StudyLayout from '../components/room-layouts/StudyLayout.vue'
import HangoutLayout from '../components/room-layouts/HangoutLayout.vue'
import GameNightLayout from '../components/room-layouts/GameNightLayout.vue'

export const meetingLayouts = {
  professional: ProfessionalLayout,
  watchParty: WatchPartyLayout,
  study: StudyLayout,
  hangout: HangoutLayout,
  gameNight: GameNightLayout,
}
