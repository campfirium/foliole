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

it('keeps Space free while F acts as the primary shortcut for Good review grade', () => {
  const shortcuts = DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.gradeReviewGood];

  expect(matchesShortcutSet(keyEvent({ key: 'f' }), shortcuts)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: '3' }), shortcuts)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: ' ' }), shortcuts)).toBe(false);
  expect(matchesShortcutSet(keyEvent({ key: ' ' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.revealReviewAnswer])).toBe(false);
  expect(matchesShortcutSet(keyEvent({ key: 'Enter' }), DEFAULT_APP_COMMAND_SHORTCUTS[APP_COMMAND_IDS.revealReviewAnswer])).toBe(true);
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
