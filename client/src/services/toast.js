import { shallowRef } from 'vue'
export const toasts = shallowRef([])
const timers = new Map()
const recent = new Map()
const messages = {
  'auth/email-already-in-use':'Email ini sudah terdaftar. Pilih Masuk untuk menggunakan akunmu.',
  'auth/invalid-credential':'Email atau kata sandi belum cocok. Periksa lalu coba lagi.',
  'auth/wrong-password':'Email atau kata sandi belum cocok. Periksa lalu coba lagi.',
  'auth/user-not-found':'Email atau kata sandi belum cocok. Periksa lalu coba lagi.',
  'auth/weak-password':'Gunakan kata sandi yang lebih kuat, minimal 6 karakter.',
  'auth/invalid-email':'Format email belum benar. Periksa alamat emailmu.',
  'auth/too-many-requests':'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.',
  'auth/network-request-failed':'Koneksi terputus. Periksa internet lalu coba lagi.',
  'auth/operation-not-allowed':'Metode autentikasi ini belum aktif di Firebase. Hubungi pengelola MeetSpace.',
  'auth/user-disabled':'Akun ini dinonaktifkan. Hubungi admin.',
  'auth/multi-factor-auth-required':'Akun ini masih memakai MFA lama di Firebase. Admin project perlu menghapus faktor lama sebelum login tanpa kode.',
  'auth/popup-closed-by-user':'Jendela Google ditutup sebelum login selesai.',
  'auth/popup-blocked':'Browser memblokir popup Google. Izinkan popup untuk situs ini lalu coba lagi.',
  'auth/account-exists-with-different-credential':'Email ini sudah memakai cara login lain. Masuk dengan cara yang sebelumnya digunakan.',
  'auth/maximum-second-factor-count-exceeded':'Batas metode keamanan akun sudah tercapai. Hubungi admin.',
  'auth/unauthorized-continue-uri':'Domain aplikasi belum diizinkan untuk link reset. Hubungi admin untuk menambahkan domain di Firebase Authentication.',
  'auth/invalid-continue-uri':'Link kembali reset tidak valid. Hubungi admin untuk memeriksa konfigurasi domain.',
  'auth/expired-action-code':'Link reset sudah kedaluwarsa. Minta link baru dari halaman Login.',
  'auth/invalid-action-code':'Link reset tidak valid atau sudah digunakan. Minta link baru dari halaman Login.',
  'NotAllowedError':'Izin kamera, mikrofon, atau layar belum diberikan. Periksa izin browser.',
  'NotFoundError':'Perangkat tidak ditemukan. Sambungkan kamera atau mikrofon lalu coba lagi.',
  'NotReadableError':'Perangkat sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.',
}
export function errorMessage(error) {
  const raw = typeof error === 'string' ? error : error?.response?.data?.message || error?.message || ''
  const code = error?.code || raw.match(/auth\/[a-z-]+/)?.[0] || error?.name
  if (messages[code]) return messages[code]
  // Our API deliberately returns actionable partial-failure messages (e.g. retry
  // disconnection after revoking approval). Preserve these instead of hiding them.
  if(error?.response?.data?.success===false && typeof raw==='string' && raw.length<=240 && !/stack|firebase:|ENOTFOUND|ECONNREFUSED/i.test(raw))return raw
  if (error?.response?.status >= 500) return 'Layanan belum bisa memproses permintaan. Coba lagi sebentar atau hubungi admin.'
  if (error?.code === 'ERR_NETWORK' || /network error|failed to fetch/i.test(raw)) return 'Tidak dapat terhubung ke layanan. Periksa koneksi lalu coba lagi.'
  if (/permission.*denied|permission was denied/i.test(raw)) return messages.NotAllowedError
  return raw && !/firebase:|stack|undefined|null|credential|ENOTFOUND|ECONNREFUSED/i.test(raw) ? raw.slice(0,240) : 'Ada kendala saat memproses permintaan. Silakan coba lagi.'
}
export function dismissToast(id) {
  const item=toasts.value.find(item=>item.id===id)
  if(item?.href?.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(item.href),1000)
  clearTimeout(timers.get(id)); timers.delete(id)
  toasts.value = toasts.value.filter(item => item.id !== id)
}
export function notify(message, { tone='info', title, duration=6500, href, download, actions=[] }={}) {
  const key = `${tone}:${message}`
  if (!href && !actions.length && Date.now() - (recent.get(key) || 0) < 4000) return
  recent.set(key,Date.now())
  if (recent.size > 100) recent.delete(recent.keys().next().value)
  const id=crypto.randomUUID()
  const item={id,message,tone,title:title || {error:'Ada yang perlu dicek',success:'Berhasil!',info:'Kabar dari klub'}[tone],href,download,actions}
  if(toasts.value.length>=4)dismissToast(toasts.value[0].id)
  toasts.value=[...toasts.value,item]
  if(duration>0) timers.set(id,setTimeout(()=>dismissToast(id),duration))
  return id
}
export async function runToastAction(id, action) {
  const item=toasts.value.find(item=>item.id===id)
  if(!item || !item.actions.includes(action))return
  dismissToast(id)
  try{await action.run?.()}catch(error){toast.error(error)}
}
export const toast = {
  error: error => notify(errorMessage(error),{tone:'error',duration:9000}),
  success: message => notify(message,{tone:'success'}),
  info: message => notify(message),
}
