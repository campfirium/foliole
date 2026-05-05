import { expect, it } from 'vitest';

import { probeReadwiseArticleContent } from '../../lib/core/import/readwiseReaderProbe';

const ARTICLE_MARKDOWN = `# Sample Article

## Highlights
This is the highlighted sentence. [...] (https://example.com)

Another matching excerpt. Tags: [[tag-a]] [[tag-b]]

## Full Document
[[Full Document Contents/Articles/Sample Article.md|See full document content ->]]
`;

const FULL_DOCUMENT_MARKDOWN = `## Metadata
- Author: Someone

## Full Document
Before the quote. This is the highlighted sentence. After the quote.

Another paragraph with Another matching excerpt. End.
`;

it('matches sampled highlights back to the full document content', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: ARTICLE_MARKDOWN,
    fullDocumentMarkdown: FULL_DOCUMENT_MARKDOWN,
    separator: '\n\n',
    sourceName: 'Sample Article'
  });

  expect(result.success).toBe(true);
  expect(result.sampleCount).toBe(2);
  expect(result.samples[0]).toMatchObject({
    highlightText: 'This is the highlighted sentence.',
    matched: true,
    sourceName: 'Sample Article'
  });
});

it('fails when the separator does not split the highlights correctly', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: ARTICLE_MARKDOWN,
    fullDocumentMarkdown: FULL_DOCUMENT_MARKDOWN,
    separator: '---',
    sourceName: 'Sample Article'
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain('could not be matched');
});
