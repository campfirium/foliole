import { describe, expect, it } from 'vitest';

import { collectAnchorCoverageSegments, createAnchorKey } from './anchorRecords';

describe('anchorTagSegments', () => {
  it('tracks active highlights across overlapping ranges', () => {
    const content = 'X<highlight id="1">12<highlight id="2">34</highlight id="1">56</highlight id="2">Y';
    const segments = collectAnchorCoverageSegments(content).filter((segment) => segment.to > segment.from);
    const highlightedText = segments
      .filter((segment) => segment.activeHighlightCount > 0)
      .map((segment) => content.slice(segment.from, segment.to))
      .join('');

    expect(highlightedText).toContain('12');
    expect(highlightedText).toContain('34');
    expect(highlightedText).toContain('56');
  });

  it('ignores hidden anchors when collecting visible segments', () => {
    const content = 'A<cloze id="1">B</cloze id="1">C<highlight id="2">D</highlight id="2">E';
    const hiddenAnchorKeys = new Set([createAnchorKey({ id: '1', kind: 'cloze' })]);
    const segments = collectAnchorCoverageSegments(content, hiddenAnchorKeys).filter((segment) => segment.to > segment.from);

    const clozeText = segments
      .filter((segment) => segment.activeClozeCount > 0)
      .map((segment) => content.slice(segment.from, segment.to))
      .join('');
    const highlightText = segments
      .filter((segment) => segment.activeHighlightCount > 0)
      .map((segment) => content.slice(segment.from, segment.to))
      .join('');

    expect(clozeText).toBe('');
    expect(highlightText).toBe('D');
  });
});
