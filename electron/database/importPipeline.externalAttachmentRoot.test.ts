// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { listNodeAttachments } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let root = '';
const imageBytes = (marker: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, marker]);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-root-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

async function seedFolder(relativePath: string, marker: number) {
  const folderPath = path.join(root, relativePath);
  const attachmentRoot = path.join(folderPath, 'attachments');
  await fs.mkdir(attachmentRoot, { recursive: true });
  await fs.writeFile(path.join(attachmentRoot, 'cover.png'), imageBytes(marker));
  const source = upsertDesktopSource({
    configRef: relativePath, rootPath: folderPath, sourceType: 'external',
    updatedAt: '2026-10-04T00:00:00.000Z'
  });
  openDatabaseConnection().driver.execute(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path,
      excluded_dirs_json, status, document_count, created_at, updated_at, source_ref)
     VALUES (?, ?, 'document_relative_first_then_fixed_root', ?, '[]', 'ready', 1, ?, ?, ?)`,
    [relativePath, folderPath, attachmentRoot, '2026-10-04T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z', source.source_ref]
  );
  return folderPath;
}

async function importNote(relativePath: string, destination = 'cover.png') {
  const filePath = path.join(root, relativePath, 'topic.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = `# Topic\n\n![Cover](${destination})`;
  await fs.writeFile(filePath, content);
  return runPreparedImport(createPreparedDesktopTextImport({
    content, degradedReason: null, fileName: 'topic.md', filePath,
    importedAt: '2026-10-04T00:01:00.000Z', kind: 'markdown'
  }));
}

async function expectImportedBytes(result: ReturnType<typeof runPreparedImport>, marker: number) {
  expect(result.resultStatus).toBe('imported');
  expect(result.nodeId).toBeTruthy();
  if (!result.nodeId) throw new Error('Missing imported node');
  const attachments = listNodeAttachments(result.nodeId);
  expect(attachments).toHaveLength(1);
  const expectedHash = createHash('sha256').update(imageBytes(marker)).digest('hex');
  expect(attachments[0]?.attachmentId).toBe(expectedHash);
  expect(await fs.readFile(resolveAttachmentStoragePath(expectedHash, undefined, 'image/png')))
    .toEqual(imageBytes(marker));
  const node = openDatabaseConnection().driver.queryOne<{ content: string }>(
    `SELECT ${buildNodeBodyContentSql('n')} AS content FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`, [result.nodeId]
  );
  expect(node?.content).toContain(`asset://${expectedHash}.png`);
}

it('imports bytes from BooksOld rather than a prefix sibling configured first', async () => {
  await seedFolder('Books', 1);
  await seedFolder('BooksOld', 2);
  await expectImportedBytes(await importNote('BooksOld'), 2);
});

it('imports bytes from the most specific containing folder configured after its parent', async () => {
  await seedFolder('Books', 1);
  await seedFolder('Books/Topics', 3);
  await expectImportedBytes(await importNote('Books/Topics'), 3);
});

it('degrades without attaching bytes from a prefix sibling when no folder contains the note', async () => {
  await seedFolder('Books', 1);
  const result = await importNote('BooksOld');
  expect(result.resultStatus).toBe('degraded');
  expect(result.degradedReason).toContain('Missing local image');
  if (!result.nodeId) throw new Error('Missing degraded node');
  expect(listNodeAttachments(result.nodeId)).toEqual([]);
});

it('keeps document-relative files ahead of a configured attachment root', async () => {
  const folder = await seedFolder('Books', 1);
  await fs.writeFile(path.join(folder, 'cover.png'), imageBytes(4));
  await expectImportedBytes(await importNote('Books'), 4);
});

it('recognizes child directory names beginning with two dots as descendants', async () => {
  await seedFolder('Books', 1);
  await expectImportedBytes(await importNote('Books/..notes'), 1);
});

it('keeps absolute image destinations independent of folder selection', async () => {
  await seedFolder('Books', 1);
  const absoluteImage = path.join(root, 'absolute.png');
  await fs.writeFile(absoluteImage, imageBytes(5));
  await expectImportedBytes(await importNote('BooksOld', absoluteImage), 5);
});

it('uses native path case comparison instead of lowercasing all folder paths', async () => {
  await seedFolder('Books', 1);
  const result = await importNote('books');
  if (process.platform === 'win32') {
    await expectImportedBytes(result, 1);
  } else {
    expect(result.resultStatus).toBe('degraded');
    if (!result.nodeId) throw new Error('Missing degraded node');
    expect(listNodeAttachments(result.nodeId)).toEqual([]);
  }
});
