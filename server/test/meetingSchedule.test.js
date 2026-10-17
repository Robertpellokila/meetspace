import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextScheduledAt, meetingIcs } from '../src/services/meetingSchedule.service.js'

test('weekly schedule keeps local wall time across daylight-saving changes', () => {
  const schedule = { startsAt: Date.parse('2026-03-01T15:00:00Z'), durationMinutes: 60, repeat: 'weekly', timezone: 'America/New_York' }
  assert.equal(nextScheduledAt(schedule, Date.parse('2026-03-08T12:00:00Z')), Date.parse('2026-03-08T14:00:00Z'))
})

test('calendar exports a weekly event and a fifteen-minute reminder', () => {
  const room = { id: '11111111-1111-4111-8111-111111111111', name: 'Weekly planning', schedule: { startsAt: Date.parse('2026-03-01T15:00:00Z'), durationMinutes: 60, repeat: 'weekly', timezone: 'America/New_York' } }
  const calendar = meetingIcs(room, 'https://meetspace.example')
  assert.match(calendar, /RRULE:FREQ=WEEKLY/)
  assert.match(calendar, /TRIGGER:-PT15M/)
  assert.ok(calendar.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75))
})
