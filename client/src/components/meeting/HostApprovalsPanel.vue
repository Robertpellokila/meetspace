<script setup>
import { computed } from 'vue'
import { useHostApprovals } from '../../composables/useHostApprovals.js'
const props=defineProps({roomId:{type:String,required:true},approvals:{type:Object,default:null}})
const local=useHostApprovals(()=>props.roomId,()=>!props.approvals)
const requests=computed(()=>props.approvals?.requests ?? local.requests.value)
const busy=computed(()=>props.approvals?.busy ?? local.busy.value)
const decide=(id,status)=>(props.approvals || local).decide(id,status)
</script>
<template><section class="approval-card"><h3>✦ Waiting Room <span>({{requests.length}})</span></h3>
<p v-if="!requests.length">No guests waiting.</p>
<div v-for="r in requests" :key="r.id" class="guest"><strong>{{r.participantName}}</strong><div><button :disabled="Boolean(busy)" @click="decide(r.id,'approved')">Admit</button><button :disabled="Boolean(busy)" class="reject" @click="decide(r.id,'rejected')">Reject</button></div></div>
</section></template>
<style scoped>.approval-card{border:3px solid #4F5B2A;border-radius:18px;padding:18px;background:var(--bg-surface,#FFFCF7);color:var(--text-primary,#303826);box-shadow:4px 5px 0 #B8892D}h3{margin:0 0 12px}h3 span{color:#B8892D}.guest{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px dashed #4F5B2A}.guest div{display:flex;gap:7px}button{border:2px solid #4F5B2A;border-radius:9px;background:#4F5B2A;color:#F5EFE3;padding:7px 10px;font-weight:800;cursor:pointer}.reject{background:#B64D4D;border-color:#B64D4D}p{font-size:13px}</style>
