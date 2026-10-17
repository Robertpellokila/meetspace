const WEEK = 7 * 24 * 60 * 60 * 1000

export function normalizeSchedule(value, now = Date.now()) {
  if (value === undefined || value === null) return null
  const startsAt = Number(value.startsAt)
  const durationMinutes = Number(value.durationMinutes)
  const repeat = value.repeat || 'none'
  const timezone = typeof value.timezone === 'string' ? value.timezone.trim() : ''
  if (!Number.isSafeInteger(startsAt) || startsAt < now - 5 * 60_000 || startsAt > now + 366 * 24 * 60 * 60_000 ||
    !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 ||
    !['none', 'weekly'].includes(repeat) || !timezone || timezone.length > 80) return null
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(startsAt)) }
  catch { return null }
  return { startsAt, durationMinutes, repeat, timezone }
}

export function nextScheduledAt(schedule, now = Date.now()) {
  if (!schedule) return null
  if (schedule.repeat !== 'weekly') return schedule.startsAt + schedule.durationMinutes * 60_000 >= now ? schedule.startsAt : null
  if (schedule.startsAt >= now) return schedule.startsAt
  const offset = (ms) => {
    const local = localDateTime(ms, schedule.timezone)
    const utc = Date.UTC(Number(local.slice(0, 4)), Number(local.slice(4, 6)) - 1, Number(local.slice(6, 8)), Number(local.slice(9, 11)), Number(local.slice(11, 13)), Number(local.slice(13, 15)))
    return utc - Math.floor(ms / 1000) * 1000
  }
  const originalOffset = offset(schedule.startsAt)
  let week = Math.max(0, Math.floor((now - schedule.startsAt) / WEEK))
  for (let attempts = 0; attempts < 3; attempts++, week++) {
    const base = schedule.startsAt + week * WEEK
    let candidate = base + originalOffset - offset(base)
    candidate = base + originalOffset - offset(candidate)
    if (candidate >= now) return candidate
  }
  return null
}

function localDateTime(ms, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const value = (type) => parts.find((part) => part.type === type)?.value || '00'
  return `${value('year')}${value('month')}${value('day')}T${value('hour')}${value('minute')}${value('second')}`
}
const utcDateTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const escapeText = (value) => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
function foldLine(line) {
  const rows = ['']
  for (const character of line) {
    const last = rows.length - 1
    if (Buffer.byteLength(rows[last] + character, 'utf8') > 75) rows.push(' ')
    rows[rows.length - 1] += character
  }
  return rows.join('\r\n')
}

export function meetingIcs(room, origin) {
  const schedule = room.schedule
  if (!schedule) return ''
  const lobby = new URL(`/lobby/${room.id}`, origin).href
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MeetSpace//Retro Club//ID', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${room.id}@meetspace`, `DTSTAMP:${utcDateTime(Date.now())}Z`,
    `DTSTART;TZID=${schedule.timezone}:${localDateTime(schedule.startsAt, schedule.timezone)}`,
    `DURATION:PT${schedule.durationMinutes}M`,
    ...(schedule.repeat === 'weekly' ? ['RRULE:FREQ=WEEKLY'] : []),
    `SUMMARY:${escapeText(room.name)}`, `DESCRIPTION:${escapeText(`MeetSpace meeting. Buka ${lobby} lalu tunggu persetujuan host.`)}`,
    `URL:${lobby}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`MeetSpace: ${room.name} dimulai 15 menit lagi.`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ]
  return lines.map(foldLine).join('\r\n')
}
