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
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(root, 'Full Document Contents', 'Articles', 'Sample Article.md'),
    `## Metadata
- Author: Someone

## Full Document
This is the highlighted sentence. Another matching excerpt.
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
    highlightSeparator: '\n\n',
    readwiseRootPath: root
  });

  expect(result.success).toBe(true);
  expect(result.checkedSourceCount).toBe(1);
  expect(result.samples[0]).toMatchObject({
    matched: true,
    sourceName: 'Sample Article'
  });
});
