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

  it('collects whole-line strong-wrapped ATX headings as compatibility headings', () => {
    const content = '**# Android Sync Performance Analysis**\nBody\n**### Later**';

    expect(collectMarkdownHeadingRanges(content)).toEqual([
      { contentFrom: 4, contentTo: 37, from: 0, level: 1, text: 'Android Sync Performance Analysis', to: 39 },
      { contentFrom: 51, contentTo: 56, from: 45, level: 3, text: 'Later', to: 58 }
    ]);
  });

  it('does not collect inline strong-wrapped hashes as compatibility headings', () => {
    expect(collectMarkdownHeadingRanges('Intro **# tag** text')).toEqual([]);
  });

  it('does not collect legacy setext headings', () => {
    const content = ['Title **One**', '===', 'Section', '---'].join('\n');

    expect(collectMarkdownHeadingRanges(content)).toEqual([]);
  });
});
