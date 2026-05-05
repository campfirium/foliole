// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-local-image-import-inbox-tests';
let mockedDocumentsDir = '/tmp/foliole-local-image-import-inbox-documents';

vi.mock('electron', () => ({
  shell: {
    trashItem: vi.fn(async (filePath: string) => {
      await fs.rm(filePath, { force: true, recursive: true });
    })
  }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listAttachmentNodeLinks, listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runManagedInboxImport } from './importDirectory.js';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=',
  'base64'
);

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-local-image-import-inbox-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function countAttachments() {
  const row = openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get() as { count: number };
  return row.count;
}

function readImportedNode(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT parent_id, title, content FROM nodes WHERE id = ?')
    .get(nodeId) as { content: string; parent_id: string | null; title: string };
}

it('imports a png dropped into the managed inbox as a visible inbox child', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox');
  const sourcePath = path.join(managedRoot, 'cover.png');
  await fs.mkdir(managedRoot, { recursive: true });
  await fs.writeFile(sourcePath, PNG_BYTES);

  const result = await runManagedInboxImport(managedRoot);

  expect(result).toEqual(expect.objectContaining({ consumed_count: 1, discovered_count: 1, failed_count: 0, imported_count: 1 }));
  expect(result.entries[0]).toEqual(
    expect.objectContaining({
      adapter: 'markdown_directory',
      duplicate_semantic: 'new',
      result_status: 'imported',
      source_kind: 'markdown',
      source_name: 'cover.png'
    })
  );

  const importedNode = readImportedNode(result.entries[0]?.node_id as string);
  expect(importedNode.parent_id).toBe('special-inbox');
  expect(importedNode.title).toBe('cover');
  expect(importedNode.content).toMatch(/^!\[cover\]\(asset:\/\/.+\.png\)$/);
  expect(listNodeAttachments(result.entries[0]?.node_id as string)).toHaveLength(1);
  await expect(fs.stat(sourcePath)).rejects.toThrow();
});

it('reuses the same attachment record when the same image enters the managed inbox twice', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox-repeat');
  const sourcePath = path.join(managedRoot, 'repeat.png');
  await fs.mkdir(managedRoot, { recursive: true });

  await fs.writeFile(sourcePath, PNG_BYTES);
  const firstImport = await runManagedInboxImport(managedRoot);

  await fs.writeFile(sourcePath, PNG_BYTES);
  const secondImport = await runManagedInboxImport(managedRoot);

  expect(firstImport).toEqual(expect.objectContaining({ imported_count: 1, failed_count: 0 }));
  expect(secondImport).toEqual(expect.objectContaining({ imported_count: 1, failed_count: 0 }));
  expect(countAttachments()).toBe(1);

  const attachmentId = listNodeAttachments(firstImport.entries[0]?.node_id as string)[0]?.attachmentId;
  const expectedLinks = [
    { attachmentId, nodeId: firstImport.entries[0]?.node_id as string, role: 'image' },
    { attachmentId, nodeId: secondImport.entries[0]?.node_id as string, role: 'image' }
  ].sort((left, right) => left.nodeId.localeCompare(right.nodeId));

  expect(attachmentId).toBeTruthy();
  expect(listAttachmentNodeLinks(attachmentId as string)).toEqual(expectedLinks);
});

it('returns an explicit failed result for unsupported image types in managed inbox import', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox-unsupported');
  const sourcePath = path.join(managedRoot, 'vector.svg');
  await fs.mkdir(managedRoot, { recursive: true });
  await fs.writeFile(sourcePath, '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');

  const result = await runManagedInboxImport(managedRoot);

  expect(result).toEqual(expect.objectContaining({ consumed_count: 0, discovered_count: 1, failed_count: 1, imported_count: 0 }));
  expect(result.entries[0]).toEqual(
    expect.objectContaining({
      failure_reason: 'Only png, jpg, jpeg, webp, and gif images are supported.',
      result_status: 'failed',
      source_kind: 'markdown',
      source_name: 'vector.svg'
    })
  );
  await expect(fs.readFile(sourcePath, 'utf8')).resolves.toContain('<svg');
});

it('returns an explicit failed result for corrupted supported image files in managed inbox import', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox-corrupted');
  const sourcePath = path.join(managedRoot, 'broken.png');
  await fs.mkdir(managedRoot, { recursive: true });
  await fs.writeFile(sourcePath, 'not-a-real-png', 'utf8');

  const result = await runManagedInboxImport(managedRoot);

  expect(result).toEqual(expect.objectContaining({ consumed_count: 0, discovered_count: 1, failed_count: 1, imported_count: 0 }));
  expect(result.entries[0]).toEqual(
    expect.objectContaining({
      failure_reason: 'The image file is invalid or corrupted.',
      result_status: 'failed',
      source_name: 'broken.png'
    })
  );
  await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('not-a-real-png');
});
