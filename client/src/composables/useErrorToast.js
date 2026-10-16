import { watch } from 'vue'
import { toast } from '../services/toast.js'
export function useErrorToast(...sources) {
  sources.forEach(source => watch(source, message => { if(message) toast.error(message) }))
}
