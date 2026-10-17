import 'dotenv/config'
import { adminAuth } from '../src/config/firebase.js'

const uids = (process.env.ADMIN_UIDS || '').split(',').map(value => value.trim()).filter(Boolean)
if (!uids.length) {
  console.error('ADMIN_UIDS belum diisi. Tidak ada akun yang diubah.')
  process.exitCode = 1
} else {
  for (const uid of uids) {
    try {
      const user = await adminAuth.getUser(uid)
      const factors = user.multiFactor?.enrolledFactors || []
      if (!factors.length) {
        console.log(`${uid}: tidak ada MFA lama yang perlu dihapus.`)
      } else if (process.argv.includes('--apply')) {
        // Firebase Admin updateUser removes all enrolled second factors with null.
        await adminAuth.updateUser(uid, { multiFactor: { enrolledFactors: null } })
        console.log(`${uid}: ${factors.length} faktor MFA lama dihapus.`)
      } else {
        console.log(`${uid}: ${factors.length} faktor MFA lama terpasang. Jalankan dengan --apply untuk menghapusnya.`)
      }
    } catch (error) {
      console.error(`${uid}: gagal memeriksa/mengubah MFA (${error?.code || 'periksa kredensial Firebase'}).`)
      process.exitCode = 1
    }
  }
}
