// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-readwise-markdown-images-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { resetRemoteImagePipelineForTests } from '../attachments/remoteImagePipeline.js';
import { loadPreparedReadwiseImportRecord } from '../import/readwisePreparedImport.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-readwise-markdown-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  resetRemoteImagePipelineForTests();
  vi.stubGlobal('fetch', vi.fn());
  initializeDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function parseAnchorLink(value: string | null) {
  return JSON.parse(value ?? '{}') as {
    locator?: { from: number; originalText: string; to: number };
  };
}

it('keeps imported sidecar highlight locators aligned after local image rewrite', async () => {
  const sourceRoot = await fs.mkdtemp(path.join(tempRoot, 'markdown-highlight-images-'));
  const imagePath = path.join(sourceRoot, 'cover.png');
  const sourceMarkdownPath = path.join(sourceRoot, 'readwise.md');
  await fs.writeFile(imagePath, Buffer.from('cover-image'));
  await fs.writeFile(
    sourceMarkdownPath,
    ['![Cover](cover.png)', '', '大罗SEO target sentence.', '', '![Remote](https://example.com/remote.png)'].join('\n')
  );

  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: await fs.readFile(sourceMarkdownPath, 'utf8'),
      fileName: 'readwise.md',
      filePath: sourceMarkdownPath,
      highlightSidecar: [{ text: '大罗SEO target sentence.' }],
      importedAt: '2026-05-13T00:00:00.000Z',
      kind: 'markdown',
      sourceProfile: 'body_with_highlight_sidecar'
    })
  );
  const nodeRow = openDatabaseConnection().sqlite
    .prepare('SELECT content FROM nodes WHERE id = ?')
    .get(imported.nodeId as string) as { content: string };
  const childRow = openDatabaseConnection().sqlite
    .prepare('SELECT anchor_link FROM nodes WHERE parent_id = ?')
    .get(imported.nodeId as string) as { anchor_link: string | null };
  const locator = parseAnchorLink(childRow.anchor_link).locator;

  expect(nodeRow.content).toContain('![Cover](asset://');
  expect(locator).toMatchObject({ originalText: '大罗SEO target sentence.' });
  expect(locator ? nodeRow.content.slice(locator.from, locator.to) : null).toBe('大罗SEO target sentence.');
});

it('matches readwise highlights before remote image localization and remaps after image rewrite', async () => {
  const readwiseRoot = await fs.mkdtemp(path.join(tempRoot, 'readwise-images-'));
  const fullDir = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightDir = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(fullDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDir, 'list.md'),
    ['# Article', '', 'GitHubDaily unrelated.', '', '![Avatar](https://cdn.example.com/avatar.png)', '', '大罗SEO target sentence.'].join('\n')
  );
  await fs.writeFile(
    path.join(highlightDir, 'list.md'),
    ['# Article', '', '## Highlights', '', '- ![Avatar](https://cdn.example.com/avatar.png)', '  大罗SEO target sentence.'].join('\n')
  );

  const prepared = await loadPreparedReadwiseImportRecord({
    adapterId: 'markdown_directory',
    filePath: path.join(fullDir, 'list.md'),
    kind: 'markdown',
    mtimeMs: 1,
    sizeBytes: 1,
    sourceName: 'list.md'
  }, {
    highlightDirectoryPath: highlightDir,
    highlightPolicy: 'reference_only',
    importedAt: '2026-05-13T00:00:00.000Z',
    kind: 'articles',
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const imported = runPreparedImport(prepared);
  const nodeRow = openDatabaseConnection().sqlite
    .prepare('SELECT content FROM nodes WHERE id = ?')
    .get(imported.nodeId as string) as { content: string };
  const childRow = openDatabaseConnection().sqlite
    .prepare('SELECT content, anchor_link FROM nodes WHERE parent_id = ?')
    .get(imported.nodeId as string) as { anchor_link: string | null; content: string };
  const locator = parseAnchorLink(childRow.anchor_link).locator;

  expect(fetch).not.toHaveBeenCalled();
  expect(nodeRow.content).toContain('![Avatar](https://cdn.example.com/avatar.png)');
  expect(childRow.content).toContain('![Avatar](https://cdn.example.com/avatar.png)');
  expect(locator?.originalText).toContain('![Avatar](https://cdn.example.com/avatar.png)');
  expect(locator ? nodeRow.content.slice(locator.from, locator.to) : null).toBe(locator?.originalText);

  const rewrittenContent = nodeRow.content.replace(
    '![Avatar](https://cdn.example.com/avatar.png)',
    '![Avatar](asset://attachment-avatar.png)'
  );
  applyParentContentChange({
    driver: openDatabaseConnection().driver,
    nextContent: rewrittenContent,
    nodeId: imported.nodeId as string,
    previousContent: nodeRow.content,
    updatedAt: '2026-05-13T00:00:01.000Z'
  });
  const remappedChildRow = openDatabaseConnection().sqlite
    .prepare('SELECT anchor_link FROM nodes WHERE parent_id = ?')
    .get(imported.nodeId as string) as { anchor_link: string | null };
  const remappedLocator = parseAnchorLink(remappedChildRow.anchor_link).locator;
  expect(remappedLocator ? rewrittenContent.slice(remappedLocator.from, remappedLocator.to) : null).toBe(
    remappedLocator?.originalText
  );
  expect(remappedLocator?.originalText).toContain('![Avatar](asset://attachment-avatar.png)');
});
