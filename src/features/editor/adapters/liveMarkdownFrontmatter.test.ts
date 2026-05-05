import { describe, expect, it } from 'vitest';

import { extractFrontmatterEntries, resolveFrontmatterBounds } from './liveMarkdownFrontmatter';

describe('liveMarkdownFrontmatter', () => {
  it('detects a top-level frontmatter block delimited by dashes', () => {
    expect(resolveFrontmatterBounds('---\nauthor: Jane\n---\n# Title')).toEqual({
      startLine: 1,
      endLine: 3
    });
  });

  it('ignores delimiter lines when they do not start the document', () => {
    expect(resolveFrontmatterBounds('# Title\n---\nauthor: Jane\n---')).toBeNull();
  });

  it('ignores an unfinished frontmatter block', () => {
    expect(resolveFrontmatterBounds('---\nauthor: Jane')).toBeNull();
  });

  it('extracts values and keeps list items under the current key', () => {
    expect(
      extractFrontmatterEntries('---\nauthor: [[Jane Doe]]\ntags:\n  - [[design]]\n  - writing\n---\n# Title')
    ).toEqual([
      { key: 'author', values: ['Jane Doe'] },
      { key: 'tags', values: ['design', 'writing'] }
    ]);
  });
});
