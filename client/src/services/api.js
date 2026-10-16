
import axios from 'axios'
import { awaitAuthReady, currentUser } from './auth.js'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
    || 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(async config => {
  await awaitAuthReady()
  // Whiteboard requests carry their own room-scoped LiveKit token.
  if (currentUser.value && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${await currentUser.value.getIdToken()}`
  }
  return config
})

export default api
