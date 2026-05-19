import { expect, it } from 'vitest';

import { formatAriaKeyShortcuts, formatShortcutSetLabel } from './shortcuts';

it('formats visual shortcut labels separately from aria key shortcuts', () => {
  const shortcuts = {
    primary: { ctrlKey: true, key: 'p' },
    secondary: { key: 'p', metaKey: true },
    tertiary: { altKey: true, key: 'p' }
  };

  expect(formatShortcutSetLabel(shortcuts)).toBe('Ctrl+P / Cmd+P / Alt+P');
  expect(formatAriaKeyShortcuts(shortcuts)).toBe('Control+P Meta+P Alt+P');
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
