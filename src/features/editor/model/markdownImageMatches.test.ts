import { describe, expect, it } from 'vitest';

import { collectImageMatches } from './markdownImageMatches';

describe('markdownImageMatches', () => {
  it('collects supported markdown image sources', () => {
    expect(collectImageMatches(10, 'text ![Web](https://example.com/a.png)')).toEqual([
      {
        attachmentId: null,
        alt: 'Web',
        display: 'inline',
        from: 15,
        source: 'https://example.com/a.png',
        to: 48
      }
    ]);
  });
});
