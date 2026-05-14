// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeQuoteText } from '../../lib/core/import/contextExcerptQuoteLocator.js';
import { createContextExcerptLocator } from '../../lib/core/import/controlledContextMatch.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../../lib/core/import/highlightExcerptMatch.js';

function findLocatorText(content: string, text: string) {
  return findPreparedHighlightExcerptInLocator(createContextExcerptLocator(content), prepareHighlightExcerptCandidate({ text }));
}

it('matches forum highlights after reader actions are removed and link labels span lines', () => {
  const source = [
    '#####  [Re: How to change main icon of Total Commander?关于如何更改主图标的 Total Commander？](https://ghisler.ch/board/viewtopic.php?p=390930#p390930)',
    '',
    ' [Post](https://ghisler.ch/board/viewtopic.php?p=390930#p390930)  by **[\\*tomek](javascript:pasteN(\'tomek\'))** » 2020-08-03, 15:59 UTC  ',
    '',
    '由 **\\*tomek** » 2020-08-03, 15:59 UTC 发表',
    '',
    '**[SOLVED][已解决]**',
    '',
    'I tried to use ICLView plugin, but although it is good for viewing, editing is very hard.  ',
    '',
    '我尝试使用 ICLView 插件，但虽然它对于查看很好，编辑却非常困难。',
    '',
    'After restart Total Commander had the new icon.  ',
    '',
    '重启后，Total Commander 有了新的图标。'
  ].join('\n');
  const quote = [
    '[Re: How to change main icon of Total Commander? ',
    '  关于如何更改主图标的 Total Commander？](https://ghisler.ch/board/viewtopic.php/./viewtopic.php?p=390930#p390930)',
    '  [Post](https://ghisler.ch/board/viewtopic.php/./viewtopic.php?p=390930#p390930) by **[*tomek](javascript:pasteN(\'tomek\'))** » 2020-08-03, 15:59 UTC ',
    '  由 ***tomek** » 2020-08-03, 15:59 UTC 发表',
    '  **[SOLVED] [已解决]** ',
    '  I tried to use ICLView plugin, but although it is good for viewing, editing is very hard. ',
    '  我尝试使用 ICLView 插件，但虽然它对于查看很好，编辑却非常困难。 ',
    '  After restart Total Commander had the new icon. ',
    '  重启后，Total Commander 有了新的图标'
  ].join('\n');

  const match = findLocatorText(source, quote);

  expect(match).toBe(source.slice(0, -1));
  expect(normalizeQuoteText(match ?? '')).toContain('Re: How to change main icon of Total Commander?');
  expect(normalizeQuoteText(match ?? '')).toContain('重启后，Total Commander 有了新的图标');
});

it('does not choose between duplicate cross-line link labels', () => {
  const target = [
    '[Re: How to change main icon?关于如何更改主图标？](https://example.com/a)',
    '',
    'Body sentence.'
  ].join('\n');
  const source = [target, '', target].join('\n');
  const quote = [
    '[Re: How to change main icon?',
    '关于如何更改主图标？](https://example.com/a)',
    'Body sentence.'
  ].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});

it('keeps quote markdown normalization bounded for malformed brackets and image links', () => {
  const malformed = `${'['.repeat(4096)} plain text`;

  expect(normalizeQuoteText('![alt\ntext](image.png)\nReal sentence.')).toBe('Real sentence.');
  expect(normalizeQuoteText('Standalone [ bracket remains.')).toBe('Standalone [ bracket remains.');
  expect(normalizeQuoteText(malformed)).toContain('plain text');
});
