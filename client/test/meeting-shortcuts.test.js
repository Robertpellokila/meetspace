import test from 'node:test'
import assert from 'node:assert/strict'
import { isMeetingShortcutTarget, meetingShortcutKey, meetingLayoutOrder } from '../src/config/meetingShortcuts.js'

test('meeting shortcuts use physical keys and stop while typing or a dialog is open', () => {
  const oldDocument = globalThis.document
  let dialogOpen = false
  globalThis.document = { querySelector: () => dialogOpen ? {} : null }
  try {
    const target = { closest: () => null, isContentEditable: false }
    const event = { altKey: true, ctrlKey: false, metaKey: false, repeat: false, code: 'KeyG', target }
    assert.equal(meetingShortcutKey(event), 'g')
    assert.equal(meetingShortcutKey({ ...event, repeat: true }), '')
    assert.equal(meetingShortcutKey({ ...event, ctrlKey: true }), '')
    assert.equal(isMeetingShortcutTarget({ target: { closest: () => ({ tagName: 'INPUT' }) } }), true)
    assert.equal(meetingShortcutKey({ ...event, target: { closest: () => ({ tagName: 'TEXTAREA' }) } }), '')
    dialogOpen = true
    assert.equal(meetingShortcutKey(event), '')
    assert.deepEqual(meetingLayoutOrder, ['gallery', 'speaker', 'dynamic', 'multi', 'immersive'])
  } finally { globalThis.document = oldDocument }
})
