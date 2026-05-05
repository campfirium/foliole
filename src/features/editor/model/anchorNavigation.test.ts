import { describe, expect, it } from 'vitest';

import { findAnchorSelection } from './anchorNavigation';

function expectDirectTextLocatorSelection() {
  const content = 'Alpha Beta Gamma';
  expect(
    findAnchorSelection(content, {
      id: 'anchor-3',
      kind: 'highlight',
      locator: {
        from: content.indexOf('Beta'),
        originalText: 'Beta',
        to: content.indexOf('Beta') + 'Beta'.length
      }
    })
  ).toEqual({
    from: content.indexOf('Beta'),
    to: content.indexOf('Beta') + 'Beta'.length
  });
}

function expectStoredTextLocatorSelectionWithoutRematch() {
  const content = 'Start Alpha Beta Gamma';
  expect(
    findAnchorSelection(content, {
      id: 'anchor-3',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    })
  ).toEqual({
    from: 6,
    to: 10
  });
}

function expectPureMarkdownWithoutLocatorReturnsNull() {
  expect(findAnchorSelection('Alpha Beta Gamma', { id: 'anchor-4', kind: 'highlight' })).toBeNull();
}

function expectTextLocatorUsesStoredRangeEvenWhenTextNoLongerMatches() {
  const content = 'Start Legacy End';
  expect(
    findAnchorSelection(content, {
      id: 'anchor-5',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: 'Beta',
        to: 4
      }
    })
  ).toEqual({
    from: 0,
    to: 4
  });
}

function expectUnresolvedZeroWidthTextLocatorFallsBackToStoredPosition() {
  expect(
    findAnchorSelection('Alpha  Gamma', {
      id: 'anchor-6',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 6
      }
    })
  ).toEqual({
    from: 6,
    to: 6
  });
}

describe('anchorNavigation', () => {
  it('uses text locator directly against plain markdown content', () => {
    expectDirectTextLocatorSelection();
  });

  it('uses stored text locator positions without re-matching the document', () => {
    expectStoredTextLocatorSelectionWithoutRematch();
  });

  it('returns null when runtime navigation receives no locator', () => {
    expectPureMarkdownWithoutLocatorReturnsNull();
  });

  it('keeps using the stored text locator range when the text no longer matches', () => {
    expectTextLocatorUsesStoredRangeEvenWhenTextNoLongerMatches();
  });

  it('falls back to the stored zero-width position when an unresolved text locator has no matching text anymore', () => {
    expectUnresolvedZeroWidthTextLocatorFallsBackToStoredPosition();
  });
});
