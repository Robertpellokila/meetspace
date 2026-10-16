
<script setup>
import { watchEffect, onMounted, ref, watch } from 'vue'
import { useAppearanceStore } from './stores/appearance'
import { awaitAuthReady, currentUser } from './services/auth.js'
import { loadAccount } from './services/account.js'
import { toast } from './services/toast.js'
import RetroToasts from './components/common/RetroToasts.vue'
import RetroSplash from './components/common/RetroSplash.vue'

const appearance = useAppearanceStore()
const ready=ref(false)
watch(()=>currentUser.value?.uid,uid=>{if(uid)loadAccount().catch(toast.error)},{immediate:true})

watchEffect(() => {
  document.documentElement.setAttribute(
    'data-theme',
    appearance.theme
  )
})

onMounted(async () => {
  appearance.initializeTheme()
  await Promise.all([awaitAuthReady(),new Promise(resolve=>setTimeout(resolve,600))])
  ready.value=true
})
</script>

<template>
  <RetroToasts />
  <RetroSplash v-if="!ready" />
  <RouterView v-else :key="$route.path" />
</template>
