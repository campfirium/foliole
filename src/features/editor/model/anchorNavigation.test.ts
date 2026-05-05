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

function expectRecoveredStaleTextLocatorSelection() {
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
    from: content.indexOf('Beta'),
    to: content.indexOf('Beta') + 'Beta'.length
  });
}

function expectPureMarkdownWithoutLocatorReturnsNull() {
  expect(findAnchorSelection('Alpha Beta Gamma', { id: 'anchor-4', kind: 'highlight' })).toBeNull();
}

function expectTextLocatorDoesNotFallBackToLegacyInlineMarkup() {
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
  ).toBeNull();
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

  it('recovers stale text locators when the original text moved to one unique place', () => {
    expectRecoveredStaleTextLocatorSelection();
  });

  it('returns null when runtime navigation receives no locator', () => {
    expectPureMarkdownWithoutLocatorReturnsNull();
  });

  it('returns null when a text locator no longer resolves against the current plain-text content', () => {
    expectTextLocatorDoesNotFallBackToLegacyInlineMarkup();
  });

  it('falls back to the stored zero-width position when an unresolved text locator has no matching text anymore', () => {
    expectUnresolvedZeroWidthTextLocatorFallsBackToStoredPosition();
  });
});
