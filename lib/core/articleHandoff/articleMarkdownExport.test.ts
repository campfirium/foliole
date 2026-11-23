import { describe, expect, it } from 'vitest';

import { articleMarkdownFileName, renderArticleMarkdownExport } from './articleMarkdownExport';

describe('article Markdown export', () => {
  it('adds the title after frontmatter when the body has no level-one heading', () => {
    expect(renderArticleMarkdownExport({ title: ' 沿河走 ', markdown: '---\ntag: a\n---\n\n正文\r\n第二行\n' }))
      .toBe('---\ntag: a\n---\n\n# 沿河走\n\n正文\n第二行\n');
  });

  it('keeps an existing title heading and empty titles fall back to Untitled', () => {
    expect(renderArticleMarkdownExport({ title: 'Ignored', markdown: '\n# Own title\n\nBody' })).toBe('\n# Own title\n\nBody\n');
    expect(renderArticleMarkdownExport({ title: '  ', markdown: 'Body' })).toBe('# Untitled\n\nBody\n');
  });

  it('builds a safe Markdown file name from the title', () => {
    expect(articleMarkdownFileName('a/b: c?.')).toBe('a b c.md');
    expect(articleMarkdownFileName('...')).toBe('Untitled.md');
    expect(articleMarkdownFileName('长'.repeat(100))).toBe(`${'长'.repeat(80)}.md`);
  });
});
