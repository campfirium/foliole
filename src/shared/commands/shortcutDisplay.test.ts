import { expect, it } from 'vitest';

import {
  formatSerializedShortcutDisplayLabel,
  formatShortcutSetDisplayEntries,
  formatShortcutSetDisplayLabel,
  formatShortcutSetSearchLabel
} from './shortcutDisplay';

it('shows the current platform modifier for Ctrl and Cmd equivalent shortcuts', () => {
  const shortcuts = {
    primary: { ctrlKey: true, key: 'f' },
    secondary: { key: 'f', metaKey: true }
  };

  expect(formatShortcutSetDisplayLabel(shortcuts, 'Windows')).toBe('Ctrl+F');
  expect(formatShortcutSetDisplayLabel(shortcuts, 'Linux x86_64')).toBe('Ctrl+F');
  expect(formatShortcutSetDisplayLabel(shortcuts, 'MacIntel')).toBe('⌘ F');
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
    { label: '⇧ ⌘ L', slot: 'tertiary' }
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
    { label: '⌥ ⌘ E', slot: 'secondary' }
  ]);
});

it('uses Apple modifier order and symbols only on macOS', () => {
  expect(formatSerializedShortcutDisplayLabel('Cmd+Ctrl+Alt+Shift+ArrowLeft', 'MacIntel')).toBe('⌃ ⌥ ⇧ ⌘ ←');
  expect(formatSerializedShortcutDisplayLabel('Cmd+Ctrl+Alt+Shift+ArrowLeft', 'Win32')).toBe('Cmd+Ctrl+Alt+Shift+ArrowLeft');
});

it('builds word aliases independently from the visible symbols', () => {
  expect(formatShortcutSetSearchLabel({ primary: { key: 'c', metaKey: true, altKey: true } }))
    .toContain('Command Cmd Meta');
  expect(formatShortcutSetSearchLabel({ primary: { key: 'c', metaKey: true, altKey: true } }))
    .toContain('Option Alt');
});
