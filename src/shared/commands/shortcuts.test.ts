import { expect, it } from 'vitest';

import { formatAriaKeyShortcuts, formatShortcutSetLabel, matchesShortcut } from './shortcuts';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

it('formats visual shortcut labels separately from aria key shortcuts', () => {
  const shortcuts = {
    primary: { ctrlKey: true, key: 'p' },
    secondary: { key: 'p', metaKey: true }
  };

  expect(formatShortcutSetLabel(shortcuts)).toBe('Ctrl+P / Cmd+P');
  expect(formatAriaKeyShortcuts(shortcuts)).toBe('Control+P Meta+P');
});

it('formats non-letter keys for aria key shortcuts', () => {
  expect(formatAriaKeyShortcuts({ primary: { key: ' ' }, secondary: { key: 'Escape', shiftKey: true } })).toBe(
    'Space Shift+Escape'
  );
});

it('omits empty aria key shortcuts', () => {
  expect(formatAriaKeyShortcuts(undefined)).toBeUndefined();
  expect(formatAriaKeyShortcuts({})).toBeUndefined();
});

it.each([
  ['Ω', 'KeyZ', { altKey: true, key: 'z' }],
  ['≈', 'KeyX', { altKey: true, key: 'x' }],
  ['Å', 'KeyA', { altKey: true, key: 'a', shiftKey: true }],
  ['a', 'KeyA', { altKey: true, key: 'a' }]
])('matches Alt-modified letter %s by physical code %s', (key, code, shortcut) => {
  const shiftKey = 'shiftKey' in shortcut && shortcut.shiftKey;
  expect(matchesShortcut(keyEvent({ altKey: true, code, key, shiftKey }), shortcut)).toBe(true);
});

it('does not fall back to the produced character for Alt-modified letters', () => {
  const shortcut = { altKey: true, key: 'a' };

  expect(matchesShortcut(keyEvent({ altKey: true, code: 'KeyQ', key: 'a' }), shortcut)).toBe(false);
  expect(matchesShortcut(keyEvent({ altKey: true, key: 'a' }), shortcut)).toBe(false);
});

it('matches Ctrl-modified letters by physical code when macOS exposes a control character key', () => {
  expect(matchesShortcut(keyEvent({ code: 'KeyM', ctrlKey: true, key: 'Enter' }), {
    ctrlKey: true,
    key: 'm'
  })).toBe(true);
  expect(matchesShortcut(keyEvent({ code: 'KeyN', ctrlKey: true, key: 'Enter' }), {
    ctrlKey: true,
    key: 'm'
  })).toBe(false);
});

it('keeps event.key matching for non-Alt letters and Alt-modified symbols', () => {
  expect(matchesShortcut(keyEvent({ code: 'KeyQ', key: 'a' }), { key: 'a' })).toBe(true);
  expect(matchesShortcut(keyEvent({ altKey: true, code: 'BracketLeft', key: '[' }), {
    altKey: true,
    key: '['
  })).toBe(true);
});
