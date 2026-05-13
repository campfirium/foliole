import { describe, expect, it } from 'vitest';

import { parseFrontmatterMetaFieldGroups } from './frontmatterMetaFieldsSetting';

describe('frontmatterMetaFieldsSetting', () => {
  it('parses comma-separated groups with alias fallback fields', () => {
    expect(parseFrontmatterMetaFieldGroups(' author | byline , , url|link|source_url ')).toEqual([
      ['author', 'byline'],
      ['url', 'link', 'source_url']
    ]);
  });

  it('keeps an empty parsed config empty so rendering can show only Details', () => {
    expect(parseFrontmatterMetaFieldGroups(' ,,, ')).toEqual([]);
  });
});
