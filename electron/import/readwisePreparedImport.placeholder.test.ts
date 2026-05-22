// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { loadPreparedReadwiseImportRecord } from './readwisePreparedImport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-placeholder-import-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps sidecar highlights in file placeholder topic content', async () => {
  const fullDocumentDir = path.join(tempRoot, 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  const filePath = path.join(fullDocumentDir, 'PDF Topic.md');
  await fs.writeFile(
    filePath,
    [
      '# PDF Topic',
      '',
      '## Metadata',
      '- Summary: PDF summary.',
      '- URL: https://readwise.io/topic',
      '',
      '## Full Document',
      'Full text of this document omitted because this document is a PDF',
      '',
      '[Download original file ->](https://readwise.io/raw.pdf)'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, 'PDF Topic.md'),
    '# PDF Topic\n\n## Highlights\nFirst PDF highlight.\n\nSecond PDF highlight.\n',
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord(
    { adapterId: 'markdown_directory', filePath, kind: 'markdown', mtimeMs: 1, sizeBytes: 10, sourceName: 'PDF Topic.md' },
    {
      highlightDirectoryPath: highlightDir,
      highlightPolicy: 'reference_only',
      importedAt: '2026-05-22T00:00:00.000Z',
      kind: 'articles',
      readwiseConfig: createDefaultReadwiseReaderConfig()
    }
  );

  expect(prepared.content).toMatch(/^---\nurl: https:\/\/readwise\.io\/topic\n---/u);
  expect(prepared.content).toContain('## Summary\nPDF summary.\n\n## Highlights');
  expect(prepared.content).toContain('## Highlights\n2 highlights');
  expect(prepared.content).toContain('First PDF highlight.');
  expect(prepared.content).toContain('Second PDF highlight.');
});
