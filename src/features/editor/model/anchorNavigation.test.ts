import { describe, expect, it } from 'vitest';

import { findAnchorSelection } from './anchorNavigation';

function expectBasicHighlightSelection() {
  const content = 'A<highlight id="1">BC</highlight id="1">D';
  expect(findAnchorSelection(content, { id: '1', kind: 'highlight' })).toEqual({
    from: content.indexOf('BC'),
    to: content.indexOf('BC') + 2
  });
}

function expectOverlappingSelections() {
  const content = 'X<highlight id="1">12<highlight id="2">34</highlight id="1">56</highlight id="2">Y';
  const first = findAnchorSelection(content, { id: '1', kind: 'highlight' });
  const second = findAnchorSelection(content, { id: '2', kind: 'highlight' });
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(first!.from).toBe(content.indexOf('12'));
  expect(second!.from).toBe(content.indexOf('34'));
  expect(first!.to).toBeGreaterThan(first!.from);
  expect(second!.to).toBeGreaterThan(second!.from);
}

function expectZeroWidthSelectionForEmptyAnchor() {
  const content = 'A<highlight id="anchor-1"></highlight id="anchor-1">D';
  expect(findAnchorSelection(content, { id: 'anchor-1', kind: 'highlight' })).toEqual({
    from: content.indexOf('</highlight id="anchor-1">'),
    to: content.indexOf('</highlight id="anchor-1">')
  });
}

function expectOpaqueClozeSelection() {
  const content = 'A<cloze id="anchor-2">BC</cloze id="anchor-2">D';
  expect(findAnchorSelection(content, { id: 'anchor-2', kind: 'cloze' })).toEqual({
    from: content.indexOf('BC'),
    to: content.indexOf('BC') + 2
  });
}

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

describe('anchorNavigation', () => {
  it('finds selection range for basic anchor pair', expectBasicHighlightSelection);
  it('finds selection range for overlapping anchors', expectOverlappingSelections);
  it('returns a zero-width selection for empty anchors so navigation can still land nearby', () => {
    expectZeroWidthSelectionForEmptyAnchor();
  });

  it('finds selection range for opaque cloze ids', () => {
    expectOpaqueClozeSelection();
  });

  it('uses text locator directly when the document no longer contains anchor tags', () => {
    expectDirectTextLocatorSelection();
  });

  it('recovers stale text locators when the original text moved to one unique place', () => {
    expectRecoveredStaleTextLocatorSelection();
  });

  it('does not fall back to legacy anchor parsing when pure markdown has no locator', () => {
    expectPureMarkdownWithoutLocatorReturnsNull();
  });
});
