import { expect, it } from 'vitest';

import { extractGenericSidecarHighlights } from '../../lib/core/import/genericHighlightSidecarParsing';

it('extracts generic list highlights without relying on a source-specific heading', () => {
  const highlights = extractGenericSidecarHighlights(
    [
      '# #宝妈咨询#',
      '',
      '## Metadata',
      '- Author: [[weibo.com]]',
      '- Full Title: #宝妈咨询#',
      '- Category: #articles',
      '- URL: https://weibo.com/1990821721/NCCSgqft8',
      '',
      '## Full Document',
      '[[Full Document Contents/Articles/#宝妈咨询#.md|See full document content →]]',
      '',
      '## Saved passages',
      '- 滴耳液如何使用？每天早晚各一次。 ([View Highlight](https://read.readwise.io/read/01sample))'
    ].join('\n')
  );

  expect(highlights).toEqual([
    {
      text: '滴耳液如何使用？每天早晚各一次。'
    }
  ]);
});

it('drops metadata-like blocks when no highlights section exists', () => {
  expect(
    extractGenericSidecarHighlights(
      [
        'Author: [[weibo.com]] - Full Title: #宝妈咨询# - Category: #articles - URL: https://weibo.com',
        '',
        'Summary: This is generated context, not a selected passage.',
        '',
        'actual highlight'
      ].join('\n')
    )
  ).toEqual([{ text: 'actual highlight' }]);
});
