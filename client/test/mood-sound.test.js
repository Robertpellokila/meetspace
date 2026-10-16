import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moods } from '../src/config/moods.js'
import { MOOD_SOUND_CHOICES, soundForMood } from '../src/config/moodSounds.js'

test('every room mood resolves to an available ambient sound', () => {
  const choices = new Set(MOOD_SOUND_CHOICES.map(item => item.id))
  for (const mood of Object.keys(moods)) {
    assert.ok(choices.has(soundForMood(mood)), `${mood} has no playable sound`)
  }
  assert.equal(soundForMood('unknown'), 'focus')
})
