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

  it('registers create commands without reusing the macOS DevTools shortcut', () => {
    expect(matchesShortcutSet(
      keyEvent({ key: 'f', ctrlKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createFolder]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 't', metaKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createTopic]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'e', metaKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createItem]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'i', metaKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createItem]
    )).toBe(false);
  });

  it('registers toggle list on Ctrl or Cmd Shift L', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleList];

    expect(matchesShortcutSet(keyEvent({ key: 'l', ctrlKey: true, shiftKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'l', metaKey: true, shiftKey: true }), shortcuts)).toBe(true);
  });

  it('registers editor display mode on Ctrl or Cmd backslash', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleEditorDisplayMode];

    expect(matchesShortcutSet(keyEvent({ key: '\\', ctrlKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '\\', metaKey: true }), shortcuts)).toBe(true);
  });

  it('registers rename on F2', () => {
    expect(matchesShortcutSet(keyEvent({ key: 'F2' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.renameNode])).toBe(true);
  });

  it('registers review entry on Alt R with F1 as the auxiliary entry', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.startStudyMode];

    expect(matchesShortcutSet(keyEvent({ key: 'r', altKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'F1' }), shortcuts)).toBe(true);
  });

  it('registers reading review defaults on QWE with numeric fallbacks', () => {
    expect(matchesShortcutSet(keyEvent({ key: 'q' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewLater])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '1' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewLater])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'w' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: ' ' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '3' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'e' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewDismiss])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '4' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewDismiss])).toBe(true);
  });
});
