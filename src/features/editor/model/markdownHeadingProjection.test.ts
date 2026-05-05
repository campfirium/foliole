import { describe, expect, it } from 'vitest';

import { collectMarkdownHeadingRanges } from './markdownHeadingProjection';

describe('markdownHeadingProjection', () => {
  it('collects parser-backed heading ranges outside fenced code', () => {
    const content = ['# Intro', '```md', '## Hidden', '```', '## Visible'].join('\n');

    expect(collectMarkdownHeadingRanges(content)).toEqual([
      { contentFrom: 2, contentTo: 7, from: 0, level: 1, text: 'Intro', to: 7 },
      { contentFrom: 31, contentTo: 38, from: 28, level: 2, text: 'Visible', to: 38 }
    ]);
  });

  it('normalizes inline link and emphasis syntax from heading text', () => {
    const content = '### [Linked](https://example.com) **detail**';

    expect(collectMarkdownHeadingRanges(content)[0]?.text).toBe('Linked detail');
  });

  it('collects parser-backed setext heading ranges', () => {
    const content = ['Title **One**', '===', 'Section', '---'].join('\n');

    expect(collectMarkdownHeadingRanges(content)).toEqual([
      { contentFrom: 0, contentTo: 13, from: 0, level: 1, text: 'Title One', to: 17 },
      { contentFrom: 18, contentTo: 25, from: 18, level: 2, text: 'Section', to: 29 }
    ]);
  });
});
