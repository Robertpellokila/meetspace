import { shallowRef, ref, watch } from 'vue'
import { currentUser } from './auth.js'
import api from './api.js'
export const account=shallowRef(null)
export const accountLoading=ref(false)
let request=null,loadedAt=0,generation=0
watch(()=>currentUser.value?.uid,()=>{generation++;account.value=null;request=null;loadedAt=0;accountLoading.value=false},{flush:'sync'})
export async function loadAccount(force=false) {
  const uid=currentUser.value?.uid,version=generation
  if(!uid)return null
  if(request)return request
  if(!force && account.value?.uid===uid && Date.now()-loadedAt<60000)return account.value
  accountLoading.value=true
  request=api.get('/account').then(response=>{
    if(generation!==version)return null
    account.value=response.data.data;loadedAt=Date.now();return account.value
  }).finally(()=>{if(generation===version){accountLoading.value=false;request=null}})
  return request
}
