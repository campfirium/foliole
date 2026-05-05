import { describe, expect, it } from 'vitest';

import { extractFrontmatterEntries, projectMarkdownFrontmatter, resolveFrontmatterBounds } from './markdownFrontmatterProjection';

describe('markdownFrontmatterProjection', () => {
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
      extractFrontmatterEntries('---\nauthor: [[Jane Doe|Jane]]\ntags:\n  - [[design]]\n  - ![[assets/card|Card]]\n---\n# Title')
    ).toEqual([
      { key: 'author', values: ['Jane'] },
      { key: 'tags', values: ['design', 'Card'] }
    ]);
  });

  it('summarizes entries for frontmatter rendering', () => {
    expect(projectMarkdownFrontmatter('---\nauthor: Jane\ntags:\n  - notes\n---\n# Title').summary).toBe('Jane  ·  notes');
  });
});
