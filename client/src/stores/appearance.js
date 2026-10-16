
import { defineStore } from 'pinia'

export const useAppearanceStore = defineStore('appearance', {
  state: () => ({
    theme: 'light',
  }),

  getters: {
    isDark: (state) => state.theme === 'dark',
  },

  actions: {
    setTheme(theme) {
      if (!['light', 'dark'].includes(theme)) return

      this.theme = theme

      localStorage.setItem(
        'meetspace-appearance',
        theme
      )
    },

    toggleTheme() {
      const nextTheme =
        this.theme === 'light' ? 'dark' : 'light'

      this.setTheme(nextTheme)
    },

    initializeTheme() {
      const saved = localStorage.getItem(
        'meetspace-appearance'
      )

      if (saved === 'light' || saved === 'dark') {
        this.theme = saved
      } else {
        this.theme = window.matchMedia(
          '(prefers-color-scheme: dark)'
        ).matches ? 'dark' : 'light'
      }
    },
  },
})
