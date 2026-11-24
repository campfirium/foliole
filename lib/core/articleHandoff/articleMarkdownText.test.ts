import { describe, expect, it } from 'vitest';

import { renderArticleMarkdownText } from './articleMarkdownText';

describe('article Markdown text', () => {
  it('adds the title after frontmatter when the body has no level-one heading', () => {
    expect(renderArticleMarkdownText({ title: ' 沿河走 ', markdown: '---\ntag: a\n---\n\n正文\r\n第二行\n' }))
      .toBe('---\ntag: a\n---\n\n# 沿河走\n\n正文\n第二行\n');
  });

  it('keeps an existing title heading and empty titles fall back to Untitled', () => {
    expect(renderArticleMarkdownText({ title: 'Ignored', markdown: '\n# Own title\n\nBody' })).toBe('\n# Own title\n\nBody\n');
    expect(renderArticleMarkdownText({ title: '  ', markdown: 'Body' })).toBe('# Untitled\n\nBody\n');
  });
});
