import { describe, expect, it } from 'vitest';

import { collectReadwiseOriginalFilePlaceholderRanges } from './readwiseOriginalFilePlaceholder';

describe('collectReadwiseOriginalFilePlaceholderRanges', () => {
  it('collects the omitted body and download link as one editor attachment range', () => {
    const source = [
      '# Book One',
      '',
      'author: [[readwise.io]]',
      '',
      'Full text of this document omitted because this document is a PDF',
      '',
      '[Download original file →](https://readwise.io/reader/document_raw_content/1)',
      '',
      'After'
    ].join('\n');

    expect(collectReadwiseOriginalFilePlaceholderRanges(source)).toEqual([
      {
        from: source.indexOf('Full text'),
        hiddenRanges: [
          {
            from: source.indexOf('[Download original file'),
            to: source.indexOf('[Download original file') + '[Download original file →](https://readwise.io/reader/document_raw_content/1)'.length
          }
        ],
        kind: 'PDF',
        sourceLabel: 'readwise.io/reader/document_raw_content/1',
        to: source.indexOf('Full text') + 'Full text of this document omitted because this document is a PDF'.length
      }
    ]);
  });
});
