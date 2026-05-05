import { describe, expect, it } from 'vitest';

import { collectAnchorTextSegments } from './anchorTagSegments';

describe('anchorTagSegments', () => {
  it('tracks active highlights across overlapping ranges', () => {
    const content = 'X<highlight id="1">12<highlight id="2">34</highlight id="1">56</highlight id="2">Y';
    const segments = collectAnchorTextSegments(content).filter((segment) => segment.to > segment.from);
    const highlightedText = segments
      .filter((segment) => segment.activeHighlightCount > 0)
      .map((segment) => content.slice(segment.from, segment.to))
      .join('');

    expect(highlightedText).toContain('12');
    expect(highlightedText).toContain('34');
    expect(highlightedText).toContain('56');
  });
});
