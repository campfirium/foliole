import { describe, expect, it } from 'vitest';

import { isCommandPaletteToggleShortcut, isDevToolsToggleShortcut } from './useAppRuntime';

describe('isCommandPaletteToggleShortcut', () => {
  it('matches Ctrl/Cmd+P and rejects Ctrl/Cmd+K', () => {
    expect(
      isCommandPaletteToggleShortcut({
        altKey: false,
        ctrlKey: true,
        key: 'p',
        metaKey: false,
        shiftKey: false
      })
    ).toBe(true);

    expect(
      isCommandPaletteToggleShortcut({
        altKey: false,
        ctrlKey: false,
        key: 'P',
        metaKey: true,
        shiftKey: false
      })
    ).toBe(true);

    expect(
      isCommandPaletteToggleShortcut({
        altKey: false,
        ctrlKey: true,
        key: 'k',
        metaKey: false,
        shiftKey: false
      })
    ).toBe(false);
  });
});

describe('isDevToolsToggleShortcut', () => {
  it('matches Ctrl+Shift+I and rejects nearby combinations', () => {
    expect(
      isDevToolsToggleShortcut({
        altKey: false,
        ctrlKey: true,
        key: 'i',
        metaKey: false,
        shiftKey: true
      })
    ).toBe(true);

    expect(
      isDevToolsToggleShortcut({
        altKey: false,
        ctrlKey: true,
        key: 'i',
        metaKey: false,
        shiftKey: false
      })
    ).toBe(false);

    expect(
      isDevToolsToggleShortcut({
        altKey: true,
        ctrlKey: true,
        key: 'i',
        metaKey: false,
        shiftKey: true
      })
    ).toBe(false);
  });
});
