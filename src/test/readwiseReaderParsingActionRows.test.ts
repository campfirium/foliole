import { expect, it } from 'vitest';

import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings';

it('removes reader action rows without changing note and tag parsing', () => {
  const markdown = [
    '# Forum Sample',
    '',
    '## Highlights',
    '- [Re: How to change main icon?](https://example.com/post)',
    '  • [Quote](https://example.com/posting.php?mode=quote&p=1)',
    '  • [](javascript:void(0);)',
    '  Body sentence stays.',
    '  Note: keep this note',
    '  Tags: [[forum]]'
  ].join('\n');

  const highlights = extractReadwiseSidecarHighlights(markdown, createDefaultReadwiseReaderConfig());

  expect(highlights).toEqual([
    {
      note: 'keep this note',
      text: [
        '[Re: How to change main icon?](https://example.com/post)',
        '  Body sentence stays.'
      ].join('\n')
    }
  ]);
});

it('keeps reader-looking text when it is not a whole action row', () => {
  const markdown = [
    '# Forum Sample',
    '',
    '## Highlights',
    '- The word Quote is part of this sentence.',
    '  Inline [](javascript:void(0);) also stays because the whole line is not an action.'
  ].join('\n');

  const highlights = extractReadwiseSidecarHighlights(markdown, createDefaultReadwiseReaderConfig());

  expect(highlights[0]?.text).toContain('The word Quote is part of this sentence.');
  expect(highlights[0]?.text).toContain('Inline [](javascript:void(0);) also stays');
});

it('keeps image-only highlights as sidecar highlight content', () => {
  const markdown = [
    '# Image Sample',
    '',
    '## Highlights',
    '- ![](https://cdn.example.com/cover.jpg) ([View Highlight](https://read.readwise.io/read/01image))'
  ].join('\n');

  const highlights = extractReadwiseSidecarHighlights(markdown, createDefaultReadwiseReaderConfig());

  expect(highlights).toEqual([
    {
      note: null,
      text: '![](https://cdn.example.com/cover.jpg)'
    }
  ]);
});

it('keeps image-only highlights with alt text as sidecar highlight content', () => {
  const markdown = [
    '# Image Sample',
    '',
    '## Highlights',
    '- ![Cover](https://cdn.example.com/cover.jpg) ([View Highlight](https://read.readwise.io/read/01image))'
  ].join('\n');

  const highlights = extractReadwiseSidecarHighlights(markdown, createDefaultReadwiseReaderConfig());

  expect(highlights).toEqual([
    {
      note: null,
      text: '![Cover](https://cdn.example.com/cover.jpg)'
    }
  ]);
});
