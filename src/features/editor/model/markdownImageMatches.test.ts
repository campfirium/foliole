import { describe, expect, it, vi } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectImageMatches, collectImageMatchesFromTree } from './markdownImageMatches';

describe('markdownImageMatches', () => {
  it('reads an Obsidian width suffix from standard markdown images', () => {
    expect(collectImageMatches(0, '![Cover|268](asset://hash-1.png)')[0]).toMatchObject({
      alt: 'Cover',
      displayWidth: 268,
      source: 'asset://hash-1.png'
    });
  });

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

  it('does not collect raw file image sources from ordinary markdown', () => {
    expect(collectImageMatches(0, '![Local](file:///vault/images/cover.png)')).toEqual([]);
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

  it('collects external document image protocol sources for external preview rendering', () => {
    const source = 'foliole-ext-image://resource/?documentPath=%2Fvault%2Ftopic.md&imageDestination=images%2Fcover.png';
    const markdown = `![Cover](${source})`;

    expect(collectImageMatches(0, markdown)).toEqual([
      {
        attachmentId: null,
        alt: 'Cover',
        display: 'block',
        from: 0,
        source,
        to: markdown.length
      }
    ]);
  });

});

describe('markdownImageMatches shared tree reuse', () => {
  it('collects shared-tree image matches without reparsing', () => {
    const references = new Map([['img', 'https://example.com/ref.png']]);
    const markdown = [
      '[![Cover](asset://hash-1.png)](https://example.com/post)',
      '![Ref][img]',
      '![[作揖]](asset://hash-2.png)'
    ].join('\n');
    const tree = folioleMarkdownParser.parse(markdown);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    expect(collectImageMatchesFromTree(tree, 0, markdown, references)).toEqual(
      collectImageMatches(0, markdown, references)
    );
    expect(parseSpy.mock.calls.filter(([source]) => source === markdown)).toHaveLength(1);
    parseSpy.mockRestore();
  });

  it('keeps a line-alone image block-rendered in a multi-line document', () => {
    const markdown = ['Intro text', '![Cover](https://example.com/a.png)', 'Tail text'].join('\n');
    const tree = folioleMarkdownParser.parse(markdown);

    expect(collectImageMatchesFromTree(tree, 0, markdown)[0]).toMatchObject({
      display: 'block',
      from: markdown.indexOf('![Cover]')
    });
  });
});

describe('markdownImageMatches local document images', () => {
  it('collects relative image sources only when a local document context opts in', () => {
    const markdown = '![Cover](images/cover.png)';

    expect(collectImageMatches(0, markdown)).toEqual([]);
    expect(collectImageMatches(0, markdown, new Map(), { allowRelativeImages: true })).toEqual([
      {
        attachmentId: null,
        alt: 'Cover',
        display: 'block',
        from: 0,
        source: 'images/cover.png',
        to: markdown.length
      }
    ]);
  });
});

describe('markdownImageMatches data url safety', () => {
  it('collects base64 svg data url image sources from exported markdown', () => {
    const markdown = '![取消高亮](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiPjwvc3ZnPg==)';

    expect(collectImageMatches(0, markdown)).toEqual([
      {
        attachmentId: null,
        alt: '取消高亮',
        display: 'block',
        from: 0,
        source: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiPjwvc3ZnPg==',
        to: markdown.length
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

describe('markdownImageMatches imported social attachments', () => {
  it('collects bracketed alt attachment images from imported social content', () => {
    expect(collectImageMatches(0, '请教老师，![[作揖]](asset://hash-1.png)  ')).toEqual([
      {
        attachmentId: 'hash-1',
        alt: '作揖',
        display: 'inline',
        from: 5,
        source: 'asset://hash-1.png',
        to: 32
      }
    ]);
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
      linkHref: 'https://example.com/cover.png',
      source: 'https://example.com/cover.png',
      to: markdown.length
    });
  });

  it('keeps the wrapping link href for linked attachment images', () => {
    const markdown = '[![Cover](asset://hash-1.png)](https://example.com/post)';

    expect(collectImageMatches(0, markdown)[0]).toMatchObject({
      attachmentId: 'hash-1',
      linkHref: 'https://example.com/post',
      source: 'asset://hash-1.png'
    });
  });

  it('keeps the wrapping link href when the image label has spacing and caption text', () => {
    const markdown = '[\n\n![image](asset://hash-1.png)\n\nimage1971×1242 140 KB](https://example.com/post)';

    expect(collectImageMatches(0, markdown)[0]).toMatchObject({
      attachmentId: 'hash-1',
      from: 0,
      linkHref: 'https://example.com/post',
      source: 'asset://hash-1.png',
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
