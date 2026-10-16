import { defineStore } from 'pinia'
export const useMeetingStore = defineStore('meeting', {
  state: () => ({ room: null, connected: false, micEnabled: false, cameraEnabled: false, sharingScreen: false }),
  actions: {
    setRoom(room) { this.room = room },
    reset() { this.room = null; this.connected = false; this.micEnabled = false; this.cameraEnabled = false; this.sharingScreen = false },
  },
})
