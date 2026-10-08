import { describe, expect, it } from 'vitest';

import {
  extractUniqueArticleTitleHeading,
  replaceUniqueArticleTitleHeading
} from './articleTitleHeading';

describe('articleTitleHeading', () => {
  it('extracts a unique level-one heading outside frontmatter and fences', () => {
    const content = ['---', 'title: Meta', '---', '', '```md', '# Code', '```', '', '# Article title'].join('\n');

    expect(extractUniqueArticleTitleHeading(content)).toEqual({
      lineIndex: 8,
      title: 'Article title'
    });
  });

  it('rejects multiple level-one headings', () => {
    expect(extractUniqueArticleTitleHeading('# One\n\n# Two')).toBeNull();
  });

  it('reads the first 100 Unicode title characters without changing the body', () => {
    const content = `# ${'😀'.repeat(101)}\n\nBody`;
    expect(extractUniqueArticleTitleHeading(content)).toEqual({ lineIndex: 0, title: '😀'.repeat(100) });
    expect(content).toBe(`# ${'😀'.repeat(101)}\n\nBody`);
  });

  it('rewrites only the unique article heading', () => {
    expect(replaceUniqueArticleTitleHeading('# Old title\n\nBody', 'New title')).toBe('# New title\n\nBody');
  });
});
