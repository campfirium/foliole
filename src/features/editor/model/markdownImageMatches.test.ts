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

  it('collects resolved local file image sources for preview rendering', () => {
    expect(collectImageMatches(0, '![Local](file:///vault/images/cover.png)')).toEqual([
      {
        attachmentId: null,
        alt: 'Local',
        display: 'block',
        from: 0,
        source: 'file:///vault/images/cover.png',
        to: 40
      }
    ]);
  });

  it('collects data url image sources for external preview rendering', () => {
    expect(collectImageMatches(0, '![Inline](data:image/png;base64,abc123)')).toEqual([
      {
        attachmentId: null,
        alt: 'Inline',
        display: 'block',
        from: 0,
        source: 'data:image/png;base64,abc123',
        to: 39
      }
    ]);
  });
});
