import { expect, it } from 'vitest';

import { formatShortcutSetDisplayEntries, formatShortcutSetDisplayLabel } from './shortcutDisplay';

it('shows the current platform modifier for Ctrl and Cmd equivalent shortcuts', () => {
  const shortcuts = {
    primary: { ctrlKey: true, key: 'f' },
    secondary: { key: 'f', metaKey: true }
  };

  expect(formatShortcutSetDisplayLabel(shortcuts, 'Windows')).toBe('Ctrl+F');
  expect(formatShortcutSetDisplayLabel(shortcuts, 'MacIntel')).toBe('Cmd+F');
});

it('keeps real alternate shortcuts while folding platform equivalents', () => {
  const shortcuts = {
    primary: { key: '[' },
    secondary: { ctrlKey: true, key: 'l', shiftKey: true },
    tertiary: { key: 'l', metaKey: true, shiftKey: true }
  };

  expect(formatShortcutSetDisplayEntries(shortcuts, 'Windows')).toEqual([
    { label: '[', slot: 'primary' },
    { label: 'Ctrl+Shift+L', slot: 'secondary' }
  ]);
  expect(formatShortcutSetDisplayEntries(shortcuts, 'MacIntel')).toEqual([
    { label: '[', slot: 'primary' },
    { label: 'Cmd+Shift+L', slot: 'tertiary' }
  ]);
});

it('hides non-current platform shortcuts even when their keys differ', () => {
  const shortcuts = {
    primary: { altKey: true, ctrlKey: true, key: 'i' },
    secondary: { altKey: true, key: 'e', metaKey: true }
  };

  expect(formatShortcutSetDisplayEntries(shortcuts, 'Windows')).toEqual([
    { label: 'Ctrl+Alt+I', slot: 'primary' }
  ]);
  expect(formatShortcutSetDisplayEntries(shortcuts, 'MacIntel')).toEqual([
    { label: 'Cmd+Alt+E', slot: 'secondary' }
  ]);
});
