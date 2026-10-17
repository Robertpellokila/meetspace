
import {
  createRouter,
  createWebHistory,
} from 'vue-router'

import {
  awaitAuthReady,
  currentUser,
  refreshEmailVerification,
} from '../services/auth'

import HomePage from '../views/HomePage.vue'
import LoginPage from '../views/LoginPage.vue'
import CreateRoomPage from '../views/CreateRoomPage.vue'
import LobbyPage from '../views/LobbyPage.vue'
import { loadAccount } from '../services/account.js'
import { toast } from '../services/toast.js'

const router = createRouter({
  history: createWebHistory(),

  routes: [
    {path:'/account',name:'account',component:()=>import('../views/AccountPage.vue'),meta:{requiresAuth:true}},
    {path:'/admin',name:'admin',component:()=>import('../views/AdminPage.vue'),meta:{requiresAuth:true,requiresAdmin:true}},
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
    },
    {
      path: '/create-room',
      name: 'create-room',
      component: CreateRoomPage,
      meta: {
        requiresAuth: true, requiresFullAccess:true,
      },
    },
    {
      path: '/lobby/:roomId',
      name: 'lobby',
      component: LobbyPage,
    },
    {
      path: '/meeting/:roomId',
      name: 'meeting',
      component: ()=>import('../views/MeetingPage.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  await awaitAuthReady()

  // Halaman ini hanya untuk pengguna login
  if (to.meta.requiresAuth && !currentUser.value) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  // Pengguna yang sudah login tidak perlu login lagi
  if (to.name === 'login' && currentUser.value) {
    return { name: 'account' }
  }
  if ((to.name === 'lobby' || to.name === 'meeting') && currentUser.value && !currentUser.value.emailVerified) {
    try {
      if (!(await refreshEmailVerification())) {
        toast.info('Buka link verifikasi dari emailmu sebelum bergabung memakai akun ini.')
        return { name: 'account' }
      }
    } catch (error) { toast.error(error); return { name: 'account' } }
  }
  if(to.meta.requiresAdmin || to.meta.requiresFullAccess){
    try{
      if(!currentUser.value.emailVerified && !(await refreshEmailVerification())){
        toast.info('Verifikasi alamat emailmu sebelum memakai fitur host atau admin.')
        return {name:'account'}
      }
      const profile=await loadAccount(true)
      if(to.meta.requiresAdmin && profile?.role!=='admin'){toast.error('Halaman ini hanya untuk admin.');return {name:'account'}}
      if(to.meta.requiresFullAccess && profile?.access!=='full'){toast.info('Akses membuat room menunggu persetujuan admin.');return {name:'account'}}
    }catch(error){toast.error(error);return {name:'account'}}
  }
})

export default router
