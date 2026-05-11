// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';

const tempRoots: string[] = [];

async function writeTextFile(filePath: string, content: string) {
  await fs.writeFile(filePath, content, 'utf8');
}

async function createReadwiseArticlePair(
  root: string,
  input: {
    category?: string;
    fullDocumentMarkdown: string;
    sidecarMarkdown?: string;
    title: string;
  }
) {
  const category = input.category ?? 'Articles';
  await fs.mkdir(path.join(root, category), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', category), { recursive: true });
  if (input.sidecarMarkdown) {
    await writeTextFile(path.join(root, category, `${input.title}.md`), input.sidecarMarkdown);
  }
  await writeTextFile(path.join(root, 'Full Document Contents', category, `${input.title}.md`), input.fullDocumentMarkdown);
}

async function createReadwiseSampleRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-'));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });

  await createReadwiseArticlePair(root, {
    fullDocumentMarkdown: `## Full Document
Body only.
`,
    sidecarMarkdown: `# No Highlights

Body only.
`,
    title: 'No Highlights'
  });
  await createReadwiseArticlePair(root, {
    fullDocumentMarkdown: `## Full Document
This article was saved without highlights.
`,
    title: 'Article Without Highlight Sidecar'
  });
  await createReadwiseArticlePair(root, {
    fullDocumentMarkdown: `## Full Document
Second article highlight.
`,
    sidecarMarkdown: `# Second Highlighted Article

## Highlights
Second article highlight.
`,
    title: 'Second Highlighted Article'
  });
  await createReadwiseArticlePair(root, {
    fullDocumentMarkdown: `## Metadata
- Author: Someone

## Full Document
This is the highlighted sentence. Another matching excerpt.

Third highlight in the middle. Closing thought from the final highlight.
`,
    sidecarMarkdown: `# Sample Article

## Highlights
This is the highlighted sentence.

Another matching excerpt.

Third highlight in the middle.

Closing thought from the final highlight.
`,
    title: 'Sample Article'
  });

  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('reads sampled article files and returns matched detection samples', async () => {
  const root = await createReadwiseSampleRoot();

  const result = await inspectReadwiseReaderSetup({
    articleDirectoryPath: path.join(root, 'Articles'),
    fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Articles'),
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.checkedSourceCount).toBe(3);
  expect(result.totalArticleCount).toBe(4);
  expect(result.highlightedArticleCount).toBe(2);
  expect(result.detectedHighlightCount).toBe(5);
  expect(result.samples).toMatchObject([
    { highlightText: 'This is the highlighted sentence.', matched: true },
    { highlightText: 'Another matching excerpt.', matched: true },
    { highlightText: 'Closing thought from the final highlight.', matched: true }
  ]);
});

it('detects multiple list-style highlights when the separator is a block prefix marker', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-bullets-'));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });

  await writeTextFile(
    path.join(root, 'Articles', 'Sample Article.md'),
    `# Sample Article

## Highlights
- This is the highlighted sentence.
    - Tags: [[tag-a]]

- Another matching excerpt.
    - Note: Keep this one

- Closing thought from the final highlight.
`
  );
  await writeTextFile(
    path.join(root, 'Full Document Contents', 'Articles', 'Sample Article.md'),
    `## Full Document
This is the highlighted sentence.

Another matching excerpt.

Closing thought from the final highlight.
`
  );

  const result = await inspectReadwiseReaderSetup({
    articleDirectoryPath: path.join(root, 'Articles'),
    fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Articles'),
    highlightsHeading: '## Highlights',
    highlightSeparator: '-',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.detectedHighlightCount).toBe(3);
  expect(result.matchedHighlightCount).toBe(3);
  expect(result.samples).toMatchObject([
    { highlightText: 'This is the highlighted sentence.', matched: true, sourceName: 'Sample Article' },
    { highlightText: 'Another matching excerpt.', matched: true, sourceName: 'Sample Article' },
    { highlightText: 'Closing thought from the final highlight.', matched: true, sourceName: 'Sample Article' }
  ]);
});

it('counts full document articles even when no highlight sidecars exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-empty-sidecars-'));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });
  await writeTextFile(path.join(root, 'Full Document Contents', 'Articles', 'Saved Article.md'), '## Full Document\nSaved article.\n');

  const result = await inspectReadwiseReaderSetup({
    articleDirectoryPath: path.join(root, 'Articles'),
    fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Articles'),
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(false);
  expect(result.checkedSourceCount).toBe(0);
  expect(result.totalArticleCount).toBe(1);
  expect(result.highlightedArticleCount).toBe(0);
});

it('counts Readwise setup across all category folders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-categories-'));
  tempRoots.push(root);

  await Promise.all(
    ['Articles', 'Books', 'Tweets', 'Podcasts'].flatMap((category) => [
      fs.mkdir(path.join(root, category), { recursive: true }),
      fs.mkdir(path.join(root, 'Full Document Contents', category), { recursive: true })
    ])
  );
  await createReadwiseArticlePair(root, {
    fullDocumentMarkdown: '## Full Document\nArticle highlight.\n',
    sidecarMarkdown: '# Article\n\n## Highlights\nArticle highlight.\n',
    title: 'Article'
  });
  await createReadwiseArticlePair(root, {
    category: 'Books',
    fullDocumentMarkdown: '## Full Document\nBook highlight.\n',
    sidecarMarkdown: '# Book\n\n## Highlights\nBook highlight.\n',
    title: 'Book'
  });
  await createReadwiseArticlePair(root, {
    category: 'Tweets',
    fullDocumentMarkdown: '## Full Document\nTweet without highlights.\n',
    title: 'Tweet'
  });
  await createReadwiseArticlePair(root, {
    category: 'Podcasts',
    fullDocumentMarkdown: '## Full Document\nPodcast without highlights.\n',
    title: 'Podcast'
  });

  const result = await inspectReadwiseReaderSetup({
    articleDirectoryPath: path.join(root, 'Articles'),
    fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Articles'),
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sources: ['Articles', 'Books', 'Tweets', 'Podcasts'].map((category) => ({
      articleDirectoryPath: path.join(root, category),
      fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', category),
      label: category
    })),
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.checkedSourceCount).toBe(2);
  expect(result.totalArticleCount).toBe(4);
  expect(result.highlightedArticleCount).toBe(2);
  expect(result.detectedHighlightCount).toBe(2);
});
