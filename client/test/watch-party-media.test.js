import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directVideoUrl, sharedVideoTime } from '../src/config/watchPartyMedia.js'
import { roomSoundEffects } from '../src/config/roomSoundEffects.js'

test('Watch Party accepts direct HTTPS video files and rejects webpages or insecure media', () => {
  assert.equal(directVideoUrl('https://media.meetspace.test/film.mp4?token=abc'), 'https://media.meetspace.test/film.mp4?token=abc')
  assert.equal(directVideoUrl('https://idlix.com/film'), '')
  assert.equal(directVideoUrl('http://media.meetspace.test/film.mp4'), '')
  assert.equal(directVideoUrl('https://media.meetspace.test/film.html'), '')
})

test('guest player advances from the host clock only while playing', () => {
  assert.equal(sharedVideoTime({ position: 12, playing: true, updatedAt: 1000 }, 3500), 14.5)
  assert.equal(sharedVideoTime({ position: 12, playing: false, updatedAt: 1000 }, 3500), 12)
  assert.equal(sharedVideoTime({ position: -5, playing: true, updatedAt: 1000 }, 3500), 0)
})

test('soundboard shows only active custom effects for the current mode', () => {
  const additions = [
    { id: 'one', mode: 'watchParty', name: 'Scene', url: 'https://media.meetspace.test/scene.mp3', enabled: true },
    { id: 'two', mode: 'hangout', name: 'Hello', url: 'https://media.meetspace.test/hello.mp3', enabled: true },
    { id: 'three', mode: 'watchParty', name: 'Hidden', url: 'https://media.meetspace.test/hidden.mp3', enabled: false },
  ]
  assert.ok(roomSoundEffects('watchParty', additions).some((effect) => effect.id === 'one'))
  assert.ok(!roomSoundEffects('watchParty', additions).some((effect) => effect.id === 'two' || effect.id === 'three'))
})
