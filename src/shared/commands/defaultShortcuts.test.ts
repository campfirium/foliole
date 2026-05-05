import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_COMMAND_SHORTCUTS } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
import { matchesShortcutSet } from './shortcuts';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

describe('default command shortcuts', () => {
  it('keeps priority mode available on Windows and macOS modifiers', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.enterPriorityMode];

    expect(matchesShortcutSet(keyEvent({ key: 'm', ctrlKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'm', metaKey: true }), shortcuts)).toBe(true);
  });

  it('keeps DevTools available on Windows and macOS modifiers', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleDevTools];

    expect(matchesShortcutSet(keyEvent({ key: 'i', ctrlKey: true, shiftKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'i', metaKey: true, altKey: true }), shortcuts)).toBe(true);
  });
});
