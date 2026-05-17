import { describe, expect, it } from 'vitest';

import { findFullTextLocatorMatch } from '../../lib/core/import/contextExcerptFullTextSearch.js';
import { createContextExcerptLocator } from '../../lib/core/import/contextExcerptLocator.js';
import { createContextExcerptQuoteLocator } from '../../lib/core/import/contextExcerptQuoteLocator.js';
import { canSkipFullTextLocatorSearch } from '../../lib/core/import/contextExcerptSearchGate.js';
import { findPreparedHighlightExcerptInLocator, prepareHighlightExcerptCandidate } from '../../lib/core/import/highlightExcerptMatch.js';

function createQuoteLocator(quote: string) {
  const locator = createContextExcerptQuoteLocator(quote);
  expect(locator).not.toBeNull();
  return locator!;
}

describe('context excerpt full text search', () => {
  it('skips full fallback search when no strong quote fragment exists in the body', () => {
    const bodyLocator = createContextExcerptLocator('The source body only discusses local notes and reading progress.');
    const quote = 'A completely unrelated Readwise highlight about serverless deployment.';
    const quoteLocator = createQuoteLocator(quote);

    expect(canSkipFullTextLocatorSearch(bodyLocator, quoteLocator)).toBe(true);
    expect(findFullTextLocatorMatch(bodyLocator, quote, quoteLocator)).toBeNull();
  });

  it('keeps exact and Markdown-normalized matches eligible for full search', () => {
    const bodyLocator = createContextExcerptLocator('Before [important sentence](https://example.com) after.');
    const quote = 'important sentence';
    const quoteLocator = createQuoteLocator(quote);

    expect(canSkipFullTextLocatorSearch(bodyLocator, quoteLocator)).toBe(false);
    expect(findFullTextLocatorMatch(bodyLocator, quote, quoteLocator)).toBe('[important sentence](https://example.com)');
  });

  it('keeps titleless Readwise highlight matching when the exported quote starts with a title line', () => {
    const bodyLocator = createContextExcerptLocator('Intro. The actual highlighted sentence is here. Outro.');
    const prepared = prepareHighlightExcerptCandidate({
      text: 'Exported title\nThe actual highlighted sentence is here.'
    });

    expect(findPreparedHighlightExcerptInLocator(bodyLocator, prepared)).toBe('The actual highlighted sentence is here.');
  });

  it('matches a whole-image Readwise highlight back to the source image markdown', () => {
    const bodyLocator = createContextExcerptLocator('Intro.\n\n![Cover](https://cdn.example.com/cover.jpg)\n\nOutro.');
    const prepared = prepareHighlightExcerptCandidate({
      text: '![Cover](https://cdn.example.com/cover.jpg)'
    });

    expect(findPreparedHighlightExcerptInLocator(bodyLocator, prepared)).toBe('![Cover](https://cdn.example.com/cover.jpg)');
  });
});
