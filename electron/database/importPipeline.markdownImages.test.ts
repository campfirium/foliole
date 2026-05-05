// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-markdown-images-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { buildAttachmentAssetUrl } from '../attachments/attachmentAssetUrl.js';
import { resolveAttachmentResource } from '../attachments/resourceResolver.js';

import { listNodeAttachments } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-markdown-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createMarkdownImportFixture(rootDir: string) {
  const relativeImagePath = path.join(rootDir, 'cover.png');
  const subdirectoryPath = path.join(rootDir, 'images');
  const nestedImagePath = path.join(subdirectoryPath, 'chart.webp');
  const absoluteImagePath = path.join(rootDir, 'absolute.jpg');
  const spacedEmbedPath = path.join(rootDir, 'Pasted image 2026-03-30 100000.png');
  const sourceMarkdownPath = path.join(rootDir, 'note.md');

  await fs.mkdir(subdirectoryPath, { recursive: true });
  await fs.writeFile(relativeImagePath, Buffer.from('cover-image'));
  await fs.writeFile(nestedImagePath, Buffer.from('chart-image'));
  await fs.writeFile(absoluteImagePath, Buffer.from('absolute-image'));
  await fs.writeFile(spacedEmbedPath, Buffer.from('obsidian-embed-image'));
  await fs.writeFile(
    sourceMarkdownPath,
    [
      '# Imported',
      '',
      'Relative image: ![Cover](cover.png)',
      'Nested image: ![Chart](images/chart.webp)',
      `Absolute image: ![Absolute](${absoluteImagePath})`,
      'Obsidian image embed: ![[Pasted image 2026-03-30 100000.png]]',
      'Obsidian nested embed: ![[images/chart.webp|Chart alias]]',
      'Obsidian note embed: ![[Linked note]]',
      'Remote image: ![Remote](https://example.com/remote.png)',
      'Missing image: ![Missing](missing.png)'
    ].join('\n')
  );

  return {
    absoluteImagePath,
    sourceMarkdownPath
  };
}

it('routes local markdown images into attachments, leaves remote links unchanged, and degrades missing files visibly', async () => {
  const sourceRoot = await fs.mkdtemp(path.join(tempRoot, 'markdown-images-'));
  const { absoluteImagePath, sourceMarkdownPath } = await createMarkdownImportFixture(sourceRoot);
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: await fs.readFile(sourceMarkdownPath, 'utf8'),
      degradedReason: null,
      fileName: 'note.md',
      filePath: sourceMarkdownPath,
      importedAt: '2026-03-22T10:30:00.000Z',
      kind: 'markdown'
    })
  );
  const nodeId = imported.nodeId as string;
  const nodeRow = openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get(nodeId) as { content: string };
  const persistedRun = openDatabaseConnection().sqlite
    .prepare('SELECT result_status, degraded_reason FROM import_runs WHERE id = ?')
    .get(imported.importId) as { degraded_reason: string | null; result_status: string };
  const attachments = listNodeAttachments(nodeId);

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('Markdown local image import degraded:');
  expect(persistedRun).toEqual({
    degraded_reason: imported.degradedReason,
    result_status: 'degraded'
  });
  expect(nodeRow.content).toContain('![Cover](attachment://');
  expect(nodeRow.content).toContain('![Chart](attachment://');
  expect(nodeRow.content).toContain('![Absolute](attachment://');
  expect(nodeRow.content).toContain('![Pasted image 2026-03-30 100000](attachment://');
  expect(nodeRow.content).toContain('![Chart alias](attachment://');
  expect(nodeRow.content).toContain('![[Linked note]]');
  expect(nodeRow.content).toContain('![Remote](https://example.com/remote.png)');
  expect(nodeRow.content).toContain('[Missing local image:');
  expect(nodeRow.content).not.toContain('cover.png)');
  expect(nodeRow.content).not.toContain('images/chart.webp)');
  expect(nodeRow.content).not.toContain(`${absoluteImagePath})`);
  expect(nodeRow.content).not.toContain('![[Pasted image 2026-03-30 100000.png]]');
  expect(attachments).toHaveLength(4);
  expect(new Set(attachments.map((entry) => entry.attachment.originalName))).toEqual(
    new Set(['absolute.jpg', 'chart.webp', 'cover.png', 'Pasted image 2026-03-30 100000.png'])
  );

  await fs.rm(sourceRoot, { recursive: true, force: true });

  for (const entry of attachments) {
    expect(resolveAttachmentResource(entry.attachmentId, mockedAppDataDir)).toEqual({
      mime_type: entry.attachment.mimeType,
      resource_url: buildAttachmentAssetUrl(entry.attachmentId),
      status: 'ready'
    });
  }
});
