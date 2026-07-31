import { describe, expect, it } from 'vitest';

import {
  isDevToolsToggleShortcut,
  shouldHandleDevToolsToggleShortcut
} from './useAppRuntimeHotkeys';

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

  it('handles DevTools only when renderer dev entries are enabled', () => {
    const event = {
      altKey: false,
      ctrlKey: true,
      key: 'i',
      metaKey: false,
      shiftKey: true
    };

    expect(shouldHandleDevToolsToggleShortcut(event, true)).toBe(true);
    expect(shouldHandleDevToolsToggleShortcut(event, false)).toBe(false);
  });
});
