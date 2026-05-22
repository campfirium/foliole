// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { appendFilePlaceholderHighlights, isOriginalFilePlaceholderContent } from '../../lib/core/import/filePlaceholderContent.js';

describe('file placeholder content', () => {
  it('appends highlight count and searchable highlights to PDF placeholders', () => {
    const content = appendFilePlaceholderHighlights(
      [
        '---',
        'summary: Short YAML summary.',
        'url: https://example.com',
        '---',
        '# PDF Topic',
        '',
        'Full text of this document omitted because this document is a PDF',
        '',
        '[Download original file ->](https://readwise.io/raw.pdf)'
      ].join('\n'),
      [
        { note: null, text: 'First PDF highlight.' },
        { note: null, text: 'Second PDF highlight.\nwith continuation.' }
      ],
      { summary: 'A readable summary for the placeholder.' }
    );

    expect(content).toMatch(/^---\nurl: https:\/\/example\.com\n---/u);
    expect(content).toContain('## Summary\nA readable summary for the placeholder.\n\n## Highlights');
    expect(content).toContain('## Highlights\n2 highlights');
    expect(content).toContain('- First PDF highlight.');
    expect(content).toContain('- Second PDF highlight.\n  with continuation.');
  });

  it('leaves ordinary imported content unchanged', () => {
    expect(appendFilePlaceholderHighlights('Plain body.', [{ note: null, text: 'Hidden quote.' }])).toBe('Plain body.');
    expect(isOriginalFilePlaceholderContent('Full text of this document omitted because this document is an EPUB')).toBe(true);
  });
});
