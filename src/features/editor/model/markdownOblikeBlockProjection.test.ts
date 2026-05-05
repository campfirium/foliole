import { describe, expect, it } from 'vitest';

import { collectMarkdownCalloutPrefixRanges } from './markdownOblikeBlockProjection';

describe('markdownOblikeBlockProjection', () => {
  it('collects callout prefixes only from blockquote markers', () => {
    const text = '> [!note] Title\n[!warning] Plain text';

    expect(collectMarkdownCalloutPrefixRanges(text)).toEqual([
      {
        from: 2,
        kind: 'note',
        lineFrom: 0,
        markerText: 'Note',
        to: 10
      }
    ]);
  });
});
