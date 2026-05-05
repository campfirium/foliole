import { expect, it } from 'vitest';

import { transformReadwiseFullDocument } from '../../lib/core/import/readwiseReaderParsing';
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
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: 'Sample Article',
    tagKeyword: 'Tags:'
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
    highlightsHeading: '## Highlights',
    highlightSeparator: '---',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: 'Sample Article',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain('could not be matched');
});

it('moves metadata into Obsidian frontmatter and removes the full document heading', () => {
  expect(transformReadwiseFullDocument(FULL_DOCUMENT_MARKDOWN, ARTICLE_MARKDOWN)).toBe(`---
author: Someone
---

# Sample Article

Before the quote. This is the highlighted sentence. After the quote.

Another paragraph with Another matching excerpt. End.`);
});
