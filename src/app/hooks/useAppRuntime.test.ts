import { describe, expect, it } from 'vitest';

import { isCommandPaletteToggleShortcut } from './useAppRuntime';

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
