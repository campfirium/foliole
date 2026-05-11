// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { inspectReadwiseSources } from './readwiseReaderSetupScan.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('counts existing Readwise categories when another category folder is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-missing-category-'));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, 'Articles'), { recursive: true });
  await fs.mkdir(path.join(root, 'Full Document Contents', 'Articles'), { recursive: true });
  await fs.writeFile(path.join(root, 'Articles', 'Article.md'), '# Article\n\n## Highlights\nUseful highlight.\n', 'utf8');
  await fs.writeFile(path.join(root, 'Full Document Contents', 'Articles', 'Article.md'), '## Full Document\nUseful highlight.\n', 'utf8');

  const result = await inspectReadwiseSources({
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    sources: [
      {
        articleDirectoryPath: path.join(root, 'Articles'),
        fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Articles'),
        label: 'Articles'
      },
      {
        articleDirectoryPath: path.join(root, 'Tweets'),
        fullDocumentDirectoryPath: path.join(root, 'Full Document Contents', 'Tweets'),
        label: 'Tweets'
      }
    ],
    tagKeyword: 'Tags:'
  });

  expect(result.success).toBe(true);
  expect(result.totalArticleCount).toBe(1);
  expect(result.highlightedArticleCount).toBe(1);
});
