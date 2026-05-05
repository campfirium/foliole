import { describe, expect, it } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { extractFrontmatterEntries, projectMarkdownFrontmatter, resolveFrontmatterBounds } from './markdownFrontmatterProjection';

function collectNodeNames(text: string) {
  const names: string[] = [];
  const cursor = folioleMarkdownParser.parse(text).cursor();
  do {
    names.push(cursor.name);
  } while (cursor.next());
  return names;
}

describe('markdownFrontmatterProjection', () => {
  it('exposes frontmatter as an OB-like parser extension node', () => {
    const names = collectNodeNames('---\nauthor: Jane\n---\n# Title');

    expect(names).toContain('Frontmatter');
    expect(names).toContain('FrontmatterDelimiter');
    expect(names).toContain('FrontmatterContent');
  });

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
