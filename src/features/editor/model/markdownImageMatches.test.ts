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

  it('does not collect unsafe data url image sources', () => {
    expect(collectImageMatches(0, '![Inline](data:text/html;base64,PGgxPk5vPC9oMT4=)')).toEqual([]);
  });

  it('collects parser-backed image URLs without title suffixes', () => {
    expect(collectImageMatches(0, '![Cover](https://example.com/a.png "Title")')).toEqual([
      {
        attachmentId: null,
        alt: 'Cover',
        display: 'block',
        from: 0,
        source: 'https://example.com/a.png',
        to: 43
      }
    ]);
  });

  it('normalizes inline markdown syntax from alt text', () => {
    expect(collectImageMatches(0, '![A **cover**](https://example.com/a.png)')[0]?.alt).toBe('A cover');
  });
});

describe('markdownImageMatches replacement ranges', () => {
  it('keeps long remote image URLs in the replaced image range', () => {
    const markdown =
      '![](https://blogger.googleusercontent.com/img/a/AVvXsEirin5hAeSxqCjJv3rlWgT_Smo1F9zNEpgaSGCFvriRr04MP9CAtwSjNN_l0yn3JtqoIyKvRgFQiZMKUIFRxRDbf2lLdkdofabTTQsYMdr5J48aL-jE5X62pop2uChw-Ccl3Ws-rAP3bX8f8ytnMI2reMPJZIlfsjbB1hYWmVx)';

    expect(collectImageMatches(0, markdown)[0]).toMatchObject({
      from: 0,
      source: 'https://blogger.googleusercontent.com/img/a/AVvXsEirin5hAeSxqCjJv3rlWgT_Smo1F9zNEpgaSGCFvriRr04MP9CAtwSjNN_l0yn3JtqoIyKvRgFQiZMKUIFRxRDbf2lLdkdofabTTQsYMdr5J48aL-jE5X62pop2uChw-Ccl3Ws-rAP3bX8f8ytnMI2reMPJZIlfsjbB1hYWmVx',
      to: markdown.length
    });
  });

  it('replaces the full wrapping link when the link label is only an image', () => {
    const markdown = '[![](https://example.com/cover.png)](https://example.com/cover.png)';

    expect(collectImageMatches(0, markdown)[0]).toMatchObject({
      from: 0,
      source: 'https://example.com/cover.png',
      to: markdown.length
    });
  });

  it('does not collect image syntax inside inline code', () => {
    expect(collectImageMatches(0, '`![No](https://example.com/a.png)`')).toEqual([]);
  });
});

describe('reference-style markdownImageMatches', () => {
  it('collects reference-style images from shared reference definitions', () => {
    const references = new Map([['img', 'https://example.com/a.png']]);

    expect(collectImageMatches(0, '![A **cover**][img]', references)).toEqual([
      {
        attachmentId: null,
        alt: 'A cover',
        display: 'block',
        from: 0,
        source: 'https://example.com/a.png',
        to: 19
      }
    ]);
  });
});
