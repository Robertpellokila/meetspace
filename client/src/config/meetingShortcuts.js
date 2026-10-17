export const meetingLayoutOrder = ['gallery', 'speaker', 'dynamic', 'multi', 'immersive']

export function isMeetingShortcutTarget(event) {
  const target = event.target
  return Boolean(target?.isContentEditable || target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]') || document.querySelector('dialog[open]'))
}

export function meetingShortcutKey(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat || isMeetingShortcutTarget(event)) return ''
  return event.code?.startsWith('Key') ? event.code.slice(3).toLowerCase() : ''
}
