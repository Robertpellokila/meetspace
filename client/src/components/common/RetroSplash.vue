<script setup>
defineProps({label:{type:String,default:'Menyiapkan ruang untuk cerita baru…'}})
</script>
<template>
  <div class="retro-splash" role="status" aria-live="polite">
    <div class="splash-record" aria-hidden="true"><span>✦</span></div>
    <p class="splash-kicker">THE RETRO CLUB</p><h1>MeetSpace<span>®</span></h1><p>{{label}}</p>
    <div class="splash-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
  </div>
</template>
<style scoped>
.retro-splash{min-height:100dvh;display:flex;align-items:center;justify-content:center;flex-direction:column;background:var(--bg-app);color:var(--text-primary);background-image:radial-gradient(var(--pattern-dot) 1px,transparent 1px);background-size:22px 22px;padding:24px;text-align:center}.splash-record{width:126px;height:126px;border-radius:50%;background:repeating-radial-gradient(#292e29 0 4px,#424a3c 5px 6px);display:grid;place-items:center;box-shadow:6px 6px 0 var(--color-secondary);animation:spin 5s linear infinite}.splash-record span{display:grid;place-items:center;width:46px;height:46px;background:var(--color-accent-pink);color:#292e29;border-radius:50%;font-size:34px}.splash-kicker{letter-spacing:3px;font-size:11px;font-weight:900;margin:32px 0 0}h1{font-size:clamp(45px,9vw,68px);margin:8px 0}h1 span{font-family:var(--font-body);font-size:16px;vertical-align:top}p{color:var(--text-secondary)}.splash-bars{display:flex;gap:4px;height:24px;align-items:center}.splash-bars i{width:5px;height:9px;background:var(--color-primary);animation:equalize .8s alternate infinite}.splash-bars i:nth-child(2n){animation-delay:.2s;background:var(--color-accent-pink)}.splash-bars i:nth-child(3){animation-delay:.4s;background:var(--color-secondary)}@keyframes spin{to{transform:rotate(360deg)}}@keyframes equalize{to{height:24px}}
</style>
