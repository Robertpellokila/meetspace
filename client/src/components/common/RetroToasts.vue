<script setup>
import { toasts, dismissToast, runToastAction } from '../../services/toast.js'
</script>
<template>
  <div class="toast-stack" aria-label="Notifikasi">
    <TransitionGroup name="toast">
      <section v-for="item in toasts" :key="item.id" class="retro-toast" :class="item.tone" :role="item.tone==='error'?'alert':'status'" :aria-live="item.tone==='error'?'assertive':'polite'">
        <span class="toast-symbol" aria-hidden="true">{{item.tone==='error'?'!':item.tone==='success'?'✓':'✦'}}</span>
        <div><strong>{{item.title}}</strong><p>{{item.message}}</p><a v-if="item.href" :href="item.href" :download="item.download" class="ms-button ms-button-primary">Unduh rekaman ↓</a><div v-if="item.actions.length" class="toast-actions"><button v-for="action in item.actions" :key="action.label" type="button" class="ms-button" :class="action.danger?'ms-button-pink':'ms-button-outline'" @click="runToastAction(item.id,action)">{{action.label}}</button></div></div>
        <button aria-label="Tutup notifikasi" @click="dismissToast(item.id)">×</button>
      </section>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.toast-stack{position:fixed;right:24px;top:24px;width:min(430px,calc(100vw - 32px));z-index:10000;display:grid;gap:14px;pointer-events:none}.retro-toast{pointer-events:auto;display:grid;grid-template-columns:36px 1fr 24px;gap:12px;padding:18px;background:var(--bg-surface);border:2px solid var(--border-color);border-radius:16px;box-shadow:5px 5px 0 var(--shadow-color);color:var(--text-primary)}.toast-symbol{display:grid;place-items:center;border:2px solid var(--border-color);border-radius:50%;width:34px;height:34px;background:var(--color-secondary);color:#292e29;font-weight:1000}.error .toast-symbol{background:var(--color-accent-pink)}.success .toast-symbol{background:var(--color-primary)}strong{font-family:var(--font-display);font-size:18px}p{margin:5px 0 0;font-size:14px;overflow-wrap:anywhere}button{align-self:start;background:none;border:0;color:inherit;font-size:24px;line-height:1}.toast-enter-active,.toast-leave-active{transition:opacity .2s,transform .2s}.toast-enter-from,.toast-leave-to{opacity:0;transform:translateX(16px)}a{margin-top:12px}@media(max-width:600px){.toast-stack{top:16px;right:16px}}
.toast-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.toast-actions button{font-size:12px;line-height:1.5;padding:8px 12px}
</style>
