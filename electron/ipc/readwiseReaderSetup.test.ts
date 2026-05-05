// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';

const tempRoots: string[] = [];

async function createReadwiseSampleRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-'));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'Articles', 'Sample Article.md'),
    `# Sample Article

## Highlights
This is the highlighted sentence.

Another matching excerpt.

Third highlight in the middle.

Closing thought from the final highlight.
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(root, 'Full Document Contents', 'Articles', 'Sample Article.md'),
    `## Metadata
- Author: Someone

## Full Document
This is the highlighted sentence. Another matching excerpt.

Third highlight in the middle. Closing thought from the final highlight.
`,
    'utf8'
  );

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
  expect(result.checkedSourceCount).toBe(1);
  expect(result.detectedHighlightCount).toBe(4);
  expect(result.samples).toMatchObject([
    { highlightText: 'This is the highlighted sentence.', matched: true, sourceName: 'Sample Article' },
    { highlightText: 'Another matching excerpt.', matched: true, sourceName: 'Sample Article' },
    { highlightText: 'Closing thought from the final highlight.', matched: true, sourceName: 'Sample Article' }
  ]);
});

it('detects multiple list-style highlights when the separator is a block prefix marker', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-setup-bullets-'));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'Articles', 'Sample Article.md'),
    `# Sample Article

## Highlights
- This is the highlighted sentence.
    - Tags: [[tag-a]]

- Another matching excerpt.
    - Note: Keep this one

- Closing thought from the final highlight.
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(root, 'Full Document Contents', 'Articles', 'Sample Article.md'),
    `## Full Document
This is the highlighted sentence.

Another matching excerpt.

Closing thought from the final highlight.
`,
    'utf8'
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
