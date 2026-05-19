import { describe, expect, it } from 'vitest';

import {
  collectReadwiseOriginalFilePlaceholderRanges,
  collectReadwiseOriginalFilePlaceholderRangesFromLines
} from './readwiseOriginalFilePlaceholder';

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

  it('collects placeholders from editor viewport lines without requiring the full document', () => {
    const lines = [
      { from: 10_000, text: 'Full text of this document omitted because this document is an EPUB' },
      { from: 10_066, text: '' },
      { from: 10_067, text: '[Download original file →](https://readwise.io/reader/document_raw_content/2)' }
    ];

    expect(collectReadwiseOriginalFilePlaceholderRangesFromLines(lines)).toEqual([
      {
        from: 10_000,
        hiddenRanges: [{ from: 10_067, to: 10_144 }],
        kind: 'EPUB',
        sourceLabel: 'readwise.io/reader/document_raw_content/2',
        to: 10_067
      }
    ]);
  });
});
