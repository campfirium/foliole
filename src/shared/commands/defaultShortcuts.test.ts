import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_COMMAND_SHORTCUTS, getPlatformDefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
import { matchesShortcutSet } from './shortcuts';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

it('uses Cmd for Ctrl-only default shortcuts on macOS', () => {
  const macShortcuts = getPlatformDefaultCommandShortcuts('MacIntel');

  expect(matchesShortcutSet(
    keyEvent({ key: 'n', metaKey: true }),
    macShortcuts[APP_COMMAND_IDS.createTopic]
  )).toBe(true);
  expect(matchesShortcutSet(
    keyEvent({ key: 'n', ctrlKey: true }),
    macShortcuts[APP_COMMAND_IDS.createTopic]
  )).toBe(false);
  expect(matchesShortcutSet(
    keyEvent({ key: 'o', metaKey: true }),
    macShortcuts[APP_COMMAND_IDS.importSingleFile]
  )).toBe(true);
});

it('uses the host-specific global capture default in the unified shortcut map', () => {
  expect(getPlatformDefaultCommandShortcuts('MacIntel')[APP_COMMAND_IDS.globalCaptureToInbox]).toEqual({
    primary: { key: 'c', metaKey: true, shiftKey: true }
  });
  expect(getPlatformDefaultCommandShortcuts('Win32')[APP_COMMAND_IDS.globalCaptureToInbox]).toEqual({
    primary: { key: 'c', altKey: true, shiftKey: true }
  });
});

it('deduplicates existing Ctrl and Cmd default pairs on macOS', () => {
  const macShortcuts = getPlatformDefaultCommandShortcuts('MacIntel');

  expect(macShortcuts[APP_COMMAND_IDS.undo]).toEqual({ primary: { key: 'z', metaKey: true } });
  expect(macShortcuts[APP_COMMAND_IDS.redo]).toEqual({
    primary: { key: 'z', metaKey: true, shiftKey: true },
    tertiary: { key: 'y', metaKey: true }
  });
});

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

  it('registers create commands on the Windows default shortcut set', () => {
    expect(matchesShortcutSet(
      keyEvent({ key: 'f', ctrlKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createFolder]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'n', ctrlKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createTopic]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'n', ctrlKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createItem]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'i', metaKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.createItem]
    )).toBe(false);
  });

  it('registers import commands on the Windows default shortcut set', () => {
    expect(matchesShortcutSet(
      keyEvent({ key: 'o', ctrlKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.importSingleFile]
    )).toBe(true);
    expect(matchesShortcutSet(
      keyEvent({ key: 'v', ctrlKey: true, altKey: true }),
      DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.clipboardImport]
    )).toBe(true);
  });
});

describe('workspace default command shortcuts', () => {
  it('registers toggle list on left bracket with modifier fallbacks', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleList];

    expect(matchesShortcutSet(keyEvent({ key: '[' }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'l', ctrlKey: true, shiftKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'l', metaKey: true, shiftKey: true }), shortcuts)).toBe(true);
  });

  it('registers bracket sidebar shortcuts', () => {
    expect(matchesShortcutSet(keyEvent({ key: ']' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleRightSidebar])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '\\' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleBothSidebars])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '\\', ctrlKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleBothSidebars])).toBe(false);
  });

  it('registers editor display mode on Ctrl or Cmd backslash', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.toggleEditorDisplayMode];

    expect(matchesShortcutSet(keyEvent({ key: '\\', ctrlKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '\\', metaKey: true }), shortcuts)).toBe(true);
  });

  it('registers rename on F2', () => {
    expect(matchesShortcutSet(keyEvent({ key: 'F2' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.renameNode])).toBe(true);
  });

  it('keeps immersive reading on F11 only when browser-reserved shortcuts are available to the app', () => {
    const desktopShortcuts = getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: true });
    const webShortcuts = getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: false });

    expect(matchesShortcutSet(keyEvent({ key: 'F11' }), desktopShortcuts[APP_COMMAND_IDS.toggleImmersiveMode])).toBe(true);
    expect(webShortcuts[APP_COMMAND_IDS.toggleImmersiveMode]).toBeUndefined();
  });

  it('registers review entry on Alt R with F1 as the auxiliary entry', () => {
    const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.startStudyMode];

    expect(matchesShortcutSet(keyEvent({ key: 'r', altKey: true }), shortcuts)).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'F1' }), shortcuts)).toBe(true);
  });
});

describe('review default command shortcuts', () => {
  it('registers reading review defaults without consuming QWE navigation keys', () => {
    expect(matchesShortcutSet(keyEvent({ key: 'q' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewSoon])).toBe(false);
    expect(matchesShortcutSet(keyEvent({ key: '1' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewSoon])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'q' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewLater])).toBe(false);
    expect(matchesShortcutSet(keyEvent({ key: '2' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewLater])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'j', ctrlKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewPostpone])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'j', metaKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewPostpone])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'w' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(false);
    expect(matchesShortcutSet(keyEvent({ key: 'f' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: '3' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: ' ' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewRead])).toBe(false);
    expect(matchesShortcutSet(keyEvent({ key: ' ' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.reviewScrollReadingDown])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: ' ', shiftKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.reviewScrollReadingUp])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'e' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewDismiss])).toBe(false);
    expect(matchesShortcutSet(keyEvent({ key: '4' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewDismiss])).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 'r' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.readingReviewDismiss])).toBe(true);
  });

  it('registers review game navigation defaults', () => {
    const cases = [
      ['w', APP_COMMAND_IDS.reviewNavigateParent],
      ['a', APP_COMMAND_IDS.reviewNavigateBack],
      ['s', APP_COMMAND_IDS.reviewNavigateDown],
      ['d', APP_COMMAND_IDS.reviewNavigateForward],
      ['q', APP_COMMAND_IDS.reviewNavigatePreviousSibling],
      ['e', APP_COMMAND_IDS.reviewNavigateNextSibling]
    ] as const;
    expect(cases.every(([key, id]) => matchesShortcutSet(keyEvent({ key }), DEFAULT_APP_COMMAND_SHORTCUTS[id]))).toBe(true);
    expect(matchesShortcutSet(keyEvent({ key: 't', altKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.deleteReviewSourceTopic])).toBe(true);
  });
});

it('keeps F as the primary review action while Space stays free', () => {
  const revealShortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.revealReviewAnswer];
  const goodShortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.gradeReviewGood];

  expect(matchesShortcutSet(keyEvent({ key: 'f' }), revealShortcuts)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: 'Enter' }), revealShortcuts)).toBe(false);
  expect(matchesShortcutSet(keyEvent({ key: ' ' }), revealShortcuts)).toBe(false);
  expect(matchesShortcutSet(keyEvent({ key: 'f' }), goodShortcuts)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: '3' }), goodShortcuts)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: ' ' }), goodShortcuts)).toBe(false);
});

it('registers app undo and redo without editor-only modifiers', () => {
  expect(matchesShortcutSet(keyEvent({ key: 'z', ctrlKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.undo])).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: 'z', metaKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.undo])).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.redo])).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: 'z', metaKey: true, shiftKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.redo])).toBe(true);
});

it('registers core selection annotation shortcuts on Alt Z, Alt X, and Alt A', () => {
  const cases = [['z', APP_COMMAND_IDS.createSelectionHighlight], ['x', APP_COMMAND_IDS.createSelectionCloze], ['a', APP_COMMAND_IDS.addSelectionNote]] as const;
  expect(cases.every(([key, id]) => matchesShortcutSet(keyEvent({ key, altKey: true }), DEFAULT_APP_COMMAND_SHORTCUTS[id]))).toBe(true);
});
