import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import './assets/styles/token.css'
import './assets/styles/global.css'
import './assets/styles/component.css'

const pinia = createPinia()

createApp(App).use(router).use(pinia).mount('#app')
