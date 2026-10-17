import { Router } from 'express'
import { rateLimit } from '../services/rateLimit.service.js'

const router = Router()

// This protects the MeetSpace registration form. Firebase also enforces its own
// account-creation quota; direct Firebase calls require an Identity Platform
// beforeCreate blocking function for a custom, non-bypassable policy.
router.post('/registration-attempt', rateLimit([
  { scope: 'registration', limit: 20, windowMs: 60 * 60_000 },
]), (_req, res) => res.json({ success: true }))

export default router
