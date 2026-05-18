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
import { resolveAttachmentResource, resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

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
  const parenthesizedImagePath = path.join(rootDir, 'Mood Board (Final).png');
  const spacedEmbedPath = path.join(rootDir, 'Pasted image 2026-03-30 100000.png');
  const sourceMarkdownPath = path.join(rootDir, 'note.md');

  await fs.mkdir(subdirectoryPath, { recursive: true });
  await fs.writeFile(relativeImagePath, Buffer.from('cover-image'));
  await fs.writeFile(nestedImagePath, Buffer.from('chart-image'));
  await fs.writeFile(absoluteImagePath, Buffer.from('absolute-image'));
  await fs.writeFile(parenthesizedImagePath, Buffer.from('parenthesized-image'));
  await fs.writeFile(spacedEmbedPath, Buffer.from('obsidian-embed-image'));
  await fs.writeFile(
    sourceMarkdownPath,
    [
      '# Imported',
      '',
      'Relative image: ![Cover](cover.png)',
      'Nested image: ![Chart](images/chart.webp)',
      `Absolute image: ![Absolute](${absoluteImagePath})`,
      'Parenthesized image: ![Mood Board](Mood Board (Final).png)',
      'Obsidian image embed: ![[Pasted image 2026-03-30 100000.png]]',
      'Obsidian nested embed: ![[images/chart.webp|Chart alias]]',
      'Obsidian note embed: ![[Linked note]]',
      'Inline data image: ![Inline data](data:image/png;base64,cG5n)',
      'Remote image: ![Remote](https://example.com/remote.png)',
      'Missing image: ![Missing](missing.png)'
    ].join('\n')
  );

  return {
    absoluteImagePath,
    sourceMarkdownPath
  };
}

function expectAttachmentSyncRows(count: number) {
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(DISTINCT object_id) AS count FROM sync_object_state WHERE object_type = 'attachment'")
    .get()).toEqual({ count });
  expect(openDatabaseConnection().sqlite
    .prepare('SELECT COUNT(*) AS count FROM attachment_blobs')
    .get()).toEqual({ count });
}

function expectImportedMarkdownImageContent(nodeRow: { body_blob_data: string; body_blob_hash: string; content: string }) {
  expect(nodeRow.content).toContain('![Cover](asset://');
  expect(nodeRow.content).toContain('![Chart](asset://');
  expect(nodeRow.content).toContain('![Absolute](asset://');
  expect(nodeRow.content).toContain('![Mood Board](asset://');
  expect(nodeRow.content).toContain('![Pasted image 2026-03-30 100000](asset://');
  expect(nodeRow.content).toContain('![Chart alias](asset://');
  expect(nodeRow.content).toContain('![[Linked note]]');
  expect(nodeRow.content).toContain('![Inline data](data:image/png;base64,cG5n)');
  expect(nodeRow.content).toContain('![Remote](https://example.com/remote.png)');
  expect(nodeRow.content).toContain('[Missing local image:');
  expect(nodeRow.content).toContain('asset://');
  expect(nodeRow.content).toContain('.png)');
  expect(nodeRow.content).toContain('.webp)');
  expect(nodeRow.content).toContain('.jpg)');
  expect(nodeRow.content).not.toContain('![[Pasted image 2026-03-30 100000.png]]');
  expect(nodeRow.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(nodeRow.body_blob_data).toBe(nodeRow.content);
}

async function expectStoredAttachmentFiles(args: {
  assetsDir: string;
  attachments: ReturnType<typeof listNodeAttachments>;
}) {
  for (const entry of args.attachments) {
    const expectedStoragePath = resolveAttachmentStoragePath(entry.attachmentId, args.assetsDir, entry.attachment.originalName);

    await expect(fs.access(expectedStoragePath)).resolves.toBeUndefined();
    await expect(fs.access(path.join(args.assetsDir, entry.attachmentId))).rejects.toThrow();
    expect(resolveAttachmentResource(entry.attachmentId, args.assetsDir)).toEqual({
      mime_type: entry.attachment.mimeType,
      resource_url: buildAttachmentAssetUrl(entry.attachmentId),
      status: 'ready'
    });
  }
}

it('routes local markdown images into attachments, leaves remote links unchanged, and degrades missing files visibly', async () => {
  const sourceRoot = await fs.mkdtemp(path.join(tempRoot, 'markdown-images-'));
  const { sourceMarkdownPath } = await createMarkdownImportFixture(sourceRoot);
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
  const nodeRow = openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?`
    )
    .get(nodeId) as { body_blob_data: string; body_blob_hash: string; content: string };
  const persistedRun = openDatabaseConnection().sqlite
    .prepare('SELECT result_status, degraded_reason FROM import_runs WHERE id = ?')
    .get(imported.importId) as { degraded_reason: string | null; result_status: string };
  const attachments = listNodeAttachments(nodeId);
  const assetsDir = path.join(mockedAppDataDir, 'Foliole', 'Assets');

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('Markdown local image import degraded:');
  expect(persistedRun).toEqual({
    degraded_reason: imported.degradedReason,
    result_status: 'degraded'
  });
  expectImportedMarkdownImageContent(nodeRow);
  expect(attachments).toHaveLength(5);
  expect(new Set(attachments.map((entry) => entry.attachment.originalName))).toEqual(
    new Set(['absolute.jpg', 'chart.webp', 'cover.png', 'Mood Board (Final).png', 'Pasted image 2026-03-30 100000.png'])
  );
  expectAttachmentSyncRows(5);

  await fs.rm(sourceRoot, { recursive: true, force: true });

  await expectStoredAttachmentFiles({ assetsDir, attachments });
});

it('compacts consecutive small data-url markdown images during import', () => {
  const smallPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: `![Up](${smallPngDataUrl})\n![Down](${smallPngDataUrl})`,
      degradedReason: null,
      fileName: 'small-icons.md',
      filePath: path.join(tempRoot, 'small-icons.md'),
      importedAt: '2026-05-18T10:10:00.000Z',
      kind: 'markdown'
    })
  );

  const nodeRow = openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get(imported.nodeId as string) as { content: string };
  expect(nodeRow.content).toBe(`![Up](${smallPngDataUrl}) ![Down](${smallPngDataUrl})`);
});

it('resolves obsidian image embeds from the configured external attachment folder during import', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(tempRoot, 'external-vault-'));
  const noteDir = path.join(vaultRoot, 'ir');
  const attachmentDir = path.join(vaultRoot, 'assets');
  const sourceMarkdownPath = path.join(noteDir, 'note.md');
  await fs.mkdir(noteDir, { recursive: true });
  await fs.mkdir(attachmentDir, { recursive: true });
  await fs.writeFile(path.join(attachmentDir, 'Pasted image 20260421082325.png'), Buffer.from('external-attachment-image'));
  await fs.writeFile(sourceMarkdownPath, '# Imported\n\n![[Pasted image 20260421082325.png]]');

  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO external_search_folders (
      id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status, document_count, indexed_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'folder-1',
    vaultRoot,
    'document_relative_first_then_fixed_root',
    attachmentDir,
    '[]',
    'ready',
    1,
    null,
    null,
    '2026-04-21T00:00:00.000Z',
    '2026-04-21T00:00:00.000Z'
  );

  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: await fs.readFile(sourceMarkdownPath, 'utf8'),
      degradedReason: null,
      fileName: 'note.md',
      filePath: sourceMarkdownPath,
      importedAt: '2026-04-21T00:35:11.508Z',
      kind: 'markdown'
    })
  );

  const nodeRow = openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get(imported.nodeId as string) as { content: string };
  expect(imported.resultStatus).toBe('imported');
  expect(nodeRow.content).toContain('![Pasted image 20260421082325](asset://');
  expect(nodeRow.content).not.toContain('[Missing local image:');
  expect(listNodeAttachments(imported.nodeId as string)).toHaveLength(1);
});
