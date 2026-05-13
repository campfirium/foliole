// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { loadPreparedReadwiseImportRecord } from './readwisePreparedImport.js';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { force: true, recursive: true });
    tempRoot = '';
  }
});

it('uses the readwise full document title as the visible top heading and node title', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-prepared-import-'));
  const highlightDirectoryPath = path.join(tempRoot, 'Articles');
  const fullDocumentPath = path.join(tempRoot, 'Full Document Contents', 'Articles', 'Sample Article.md');
  await fs.mkdir(path.dirname(fullDocumentPath), { recursive: true });
  await fs.mkdir(highlightDirectoryPath, { recursive: true });
  await fs.writeFile(
    path.join(highlightDirectoryPath, 'Sample Article.md'),
    '# Highlight File Title\n\n## Highlights\nThis is the highlighted sentence. [...] (https://example.com)\n',
    'utf8'
  );
  await fs.writeFile(
    fullDocumentPath,
    '# Full Document Title\n\n## Metadata\n- Author: Someone\n\n## Full Document\nBefore the quote. This is the highlighted sentence. After the quote.\n',
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord(
    {
      adapterId: 'markdown_directory',
      filePath: fullDocumentPath,
      kind: 'markdown',
      mtimeMs: 0,
      sizeBytes: 0,
      sourceName: 'Sample Article.md'
    },
    {
      highlightDirectoryPath,
      highlightPolicy: 'reference_only',
      importedAt: '2026-03-26T01:00:00.000Z',
      kind: 'articles',
      readwiseConfig: createDefaultReadwiseReaderConfig()
    }
  );

  expect(prepared.nodeTitle).toBe('Full Document Title');
  expect(prepared.hideTitleHeading).toBe(false);
  expect(prepared.content).toMatch(/^---\nauthor: Someone\n---\n# Full Document Title\n\nBefore the quote/);
  expect(prepared.content).not.toContain('# Highlight File Title');
  expect(prepared.content).toContain('author: Someone');
  expect(prepared.content).toContain('Before the quote.');
});

it('falls back to the readwise full document title when the highlight file is absent', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-prepared-import-no-highlight-'));
  const highlightDirectoryPath = path.join(tempRoot, 'Articles');
  const fullDocumentPath = path.join(tempRoot, 'Full Document Contents', 'Articles', 'Sample Article.md');
  await fs.mkdir(path.dirname(fullDocumentPath), { recursive: true });
  await fs.mkdir(highlightDirectoryPath, { recursive: true });
  await fs.writeFile(
    fullDocumentPath,
    '# Full Document Title\n\n## Metadata\n- Author: Someone\n\n## Full Document\nBody only.\n',
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord(
    {
      adapterId: 'markdown_directory',
      filePath: fullDocumentPath,
      kind: 'markdown',
      mtimeMs: 0,
      sizeBytes: 0,
      sourceName: 'Sample Article.md'
    },
    {
      highlightDirectoryPath,
      highlightPolicy: 'reference_only',
      importedAt: '2026-03-26T01:00:00.000Z',
      kind: 'articles',
      readwiseConfig: createDefaultReadwiseReaderConfig()
    }
  );

  expect(prepared.nodeTitle).toBe('Full Document Title');
  expect(prepared.hideTitleHeading).toBe(false);
  expect(prepared.content).toMatch(/^---\nauthor: Someone\n---\n# Full Document Title\n\nBody only/);
  expect(prepared.content).toContain('Body only.');
});

it('lifts readwise full document body headings without creating body title headings', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-prepared-import-headings-'));
  const highlightDirectoryPath = path.join(tempRoot, 'Articles');
  const fullDocumentPath = path.join(tempRoot, 'Full Document Contents', 'Articles', 'Sample Article.md');
  await fs.mkdir(path.dirname(fullDocumentPath), { recursive: true });
  await fs.mkdir(highlightDirectoryPath, { recursive: true });
  await fs.writeFile(path.join(highlightDirectoryPath, 'Sample Article.md'), '# Highlight File Title\n', 'utf8');
  await fs.writeFile(
    fullDocumentPath,
    [
      '# Full Document Title',
      '',
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Intro.',
      '',
      '## Already body section',
      '',
      '#### **什么是 Pixel 认证**',
      '',
      '##### **账户关联国家/地区**',
      '',
      '```md',
      '### Code heading',
      '```',
      '',
      '    ### Indented code heading'
    ].join('\n'),
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord(
    {
      adapterId: 'markdown_directory',
      filePath: fullDocumentPath,
      kind: 'markdown',
      mtimeMs: 0,
      sizeBytes: 0,
      sourceName: 'Sample Article.md'
    },
    {
      highlightDirectoryPath,
      highlightPolicy: 'reference_only',
      importedAt: '2026-03-26T01:00:00.000Z',
      kind: 'articles',
      readwiseConfig: createDefaultReadwiseReaderConfig()
    }
  );

  expect(prepared.content).toContain('## Already body section');
  expect(prepared.content).toContain('### **什么是 Pixel 认证**');
  expect(prepared.content).toContain('#### **账户关联国家/地区**');
  expect(prepared.content).toContain('```md\n### Code heading\n```');
  expect(prepared.content).toContain('    ### Indented code heading');
  expect(prepared.hideTitleHeading).toBe(false);
});

it('splits default readwise bullet highlights without requiring a custom starter setting', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-prepared-import-bullets-'));
  const highlightDirectoryPath = path.join(tempRoot, 'Articles');
  const fullDocumentPath = path.join(tempRoot, 'Full Document Contents', 'Articles', 'Sample Article.md');
  await fs.mkdir(path.dirname(fullDocumentPath), { recursive: true });
  await fs.mkdir(highlightDirectoryPath, { recursive: true });
  await fs.writeFile(
    path.join(highlightDirectoryPath, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      '- This is the highlighted sentence. ([View Highlight](https://example.com/1))',
      '- Another matching excerpt. ([View Highlight](https://example.com/2))',
      '- Closing thought from the final highlight. ([View Highlight](https://example.com/3))'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    fullDocumentPath,
    [
      '## Full Document',
      'Before the quote. This is the highlighted sentence. After the quote.',
      '',
      'Another paragraph with Another matching excerpt. End.',
      '',
      'Closing thought from the final highlight.'
    ].join('\n'),
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord(
    {
      adapterId: 'markdown_directory',
      filePath: fullDocumentPath,
      kind: 'markdown',
      mtimeMs: 0,
      sizeBytes: 0,
      sourceName: 'Sample Article.md'
    },
    {
      highlightDirectoryPath,
      highlightPolicy: 'reference_only',
      importedAt: '2026-03-27T13:10:00.000Z',
      kind: 'articles',
      readwiseConfig: createDefaultReadwiseReaderConfig()
    }
  );

  expect(prepared.matchedHighlights).toMatchObject([
    {
      content: 'This is the highlighted sentence.',
      locatorText: 'Before the quote. This is the highlighted sentence. After the quote.'
    },
    {
      content: 'Another matching excerpt.',
      locatorText: 'Another paragraph with Another matching excerpt. End.'
    },
    { content: 'Closing thought from the final highlight.' }
  ]);
});
