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

const BULLET_ARTICLE_MARKDOWN = `# Sample Article

## Highlights
- This is the highlighted sentence.
    - Tags: [[tag-a]]

- Another matching excerpt.
    - Note: Keep this one

- Third highlight in the middle.

## Full Document
[[Full Document Contents/Articles/Sample Article.md|See full document content ->]]
`;

const BULLET_FULL_DOCUMENT_MARKDOWN = `## Full Document
This is the highlighted sentence.

Another matching excerpt.

Third highlight in the middle.
`;

const READWISE_LINK_ARTICLE_MARKDOWN = `# Open Minis：可能是 iOS 端最强 AI Agent

## Full Document
[[Full Document Contents/Articles/Open Minis：可能是 iOS 端最强 AI Agent.md|See full document content →]]

## Highlights
- **Manus**，它能在其云端运行虚拟机或者有头浏览器 ([View Highlight](https://read.readwise.io/read/01kmqchwa0njzfcec704bcw9dr))
- 这样你就可以在本地来让 AI 进行作业了 ([View Highlight](https://read.readwise.io/read/01kmqcm58rswn4j5kk5j3he32x))
- 但这终究有局限性 ([View Highlight](https://read.readwise.io/read/01kmqdywk5db23090s8pc6bk37))
`;

const READWISE_LINK_FULL_DOCUMENT_MARKDOWN = `## Full Document
前文。Manus，它能在其云端运行虚拟机或者有头浏览器。后文。

这样你就可以在本地来让 AI 进行作业了。

但这终究有局限性。
`;

const NON_BULLET_READWISE_LINK_ARTICLE_MARKDOWN = `# 小而美

## Highlights
盈利能力第一  [...](https://read.readwise.io/read/01a)

极简主义创业者以社区为基础创业  [...](https://read.readwise.io/read/01b)

他们量入为出，不过分地花钱  [...](https://read.readwise.io/read/01c)
`;

const NON_BULLET_READWISE_LINK_FULL_DOCUMENT_MARKDOWN = `## Full Document
盈利能力第一。

极简主义创业者以社区为基础创业。

他们量入为出，不过分地花钱。
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

it('supports list-style highlight blocks when each block starts with a marker', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: BULLET_ARTICLE_MARKDOWN,
    fullDocumentMarkdown: BULLET_FULL_DOCUMENT_MARKDOWN,
    highlightsHeading: '## Highlights',
    highlightSeparator: '-',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: 'Sample Article',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.detectedHighlightCount).toBe(3);
  expect(result.sampleCount).toBe(3);
  expect(result.samples).toMatchObject([
    { highlightText: 'This is the highlighted sentence.', matched: true },
    { highlightText: 'Another matching excerpt.', matched: true },
    { highlightText: 'Third highlight in the middle.', matched: true }
  ]);
});

it('ignores trailing Readwise view links when matching bullet highlights', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: READWISE_LINK_ARTICLE_MARKDOWN,
    fullDocumentMarkdown: READWISE_LINK_FULL_DOCUMENT_MARKDOWN,
    highlightsHeading: '## Highlights',
    highlightSeparator: '-',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: 'Open Minis',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.samples).toMatchObject([
    {
      excerpt: '前文。Manus，它能在其云端运行虚拟机或者有头浏览器。后文。 这样你就可以在本地来让 AI 进行作业了。 但这终究有局限性。',
      highlightText: 'Manus，它能在其云端运行虚拟机或者有头浏览器',
      matched: true
    },
    {
      highlightText: '这样你就可以在本地来让 AI 进行作业了',
      matched: true
    },
    {
      highlightText: '但这终究有局限性',
      matched: true
    }
  ]);
});

it('supports readwise list-style highlights with the default blank-line separator setting', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: READWISE_LINK_ARTICLE_MARKDOWN,
    fullDocumentMarkdown: READWISE_LINK_FULL_DOCUMENT_MARKDOWN,
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: 'Open Minis',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.detectedHighlightCount).toBe(3);
  expect(result.samples).toMatchObject([
    {
      highlightText: 'Manus，它能在其云端运行虚拟机或者有头浏览器',
      matched: true
    },
    {
      highlightText: '这样你就可以在本地来让 AI 进行作业了',
      matched: true
    },
    {
      highlightText: '但这终究有局限性',
      matched: true
    }
  ]);
});

it('falls back to blank-line split when separator is list-style but highlights are plain paragraphs', () => {
  const result = probeReadwiseArticleContent({
    articleMarkdown: NON_BULLET_READWISE_LINK_ARTICLE_MARKDOWN,
    fullDocumentMarkdown: NON_BULLET_READWISE_LINK_FULL_DOCUMENT_MARKDOWN,
    highlightsHeading: '## Highlights',
    highlightSeparator: '- ',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sourceName: '小而美',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.detectedHighlightCount).toBe(3);
  expect(result.sampleCount).toBe(3);
  expect(result.samples).toMatchObject([
    { highlightText: '盈利能力第一', matched: true },
    { highlightText: '极简主义创业者以社区为基础创业', matched: true },
    { highlightText: '他们量入为出，不过分地花钱', matched: true }
  ]);
});

it('moves metadata into Obsidian frontmatter and removes the full document heading', () => {
  expect(transformReadwiseFullDocument(FULL_DOCUMENT_MARKDOWN, ARTICLE_MARKDOWN)).toBe(`---
author: Someone
---

# Sample Article

Before the quote. This is the highlighted sentence. After the quote.

Another paragraph with Another matching excerpt. End.`);
});
