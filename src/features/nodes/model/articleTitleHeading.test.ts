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

  it('rewrites only the unique article heading', () => {
    expect(replaceUniqueArticleTitleHeading('# Old title\n\nBody', 'New title')).toBe('# New title\n\nBody');
  });
});
