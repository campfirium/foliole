// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { readNodeImageSources } from '../database/nodeImageSources.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { backupSqliteDatabase, restoreSqliteDatabase } from '../database/sqliteBackupRestore.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';

import { readAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { recoverArticleImageAttachment } from './recoverArticleImageAttachment.js';
import { configureRemoteImageFetchTransportForTests, importRemoteImageAttachment, resetRemoteImagePipelineForTests } from './remoteImagePipeline.js';

const sourceUrl = 'https://example.com/image.png';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let tempRoot = '';
const transport = vi.fn();

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-recovery-'));
  appData = path.join(tempRoot, 'data');
  initializeDatabase();
  resetRemoteImagePipelineForTests();
  transport.mockReset().mockImplementation(async () => new Response(png, { status: 200 }));
  configureRemoteImageFetchTransportForTests(transport);
  saveNode('article', 'Initial body');
});

afterEach(async () => {
  resetRemoteImagePipelineForTests();
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveNode(nodeId: string, content: string, imageSources?: Record<string, string>) {
  upsertNodeSnapshot({ nodeId, content, parentNodeId: null, kind: 'topic', title: nodeId,
    isTitleManual: true, hideTitleHeading: false, anchorLink: null, reveal: null,
    createdAt: '2026-09-19T00:00:00.000Z', updatedAt: new Date().toISOString(), position: 0,
    ...(imageSources ? { imageSources } : {}) });
}

async function localized() {
  const imported = await importRemoteImageAttachment({ nodeId: 'article', sourceUrl });
  if (imported.status !== 'imported') throw new Error(imported.message);
  const content = `![caption](asset://${imported.storage_key})`;
  saveNode('article', content);
  return { imported, content, file: path.join(readAttachmentLibraryPathSnapshot()!.assetsDir, imported.storage_key) };
}

it('persists original source across a stale renderer write and database reopen', async () => {
  const { imported, content } = await localized();
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadWorkspaceNodeDocument('article')).toMatchObject({ content, imageSources: { [imported.storage_key]: sourceUrl } });
  const version = openDatabaseConnection().driver.queryOne<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM node_sync_versions WHERE object_id = 'article' ORDER BY created_at DESC LIMIT 1"
  );
  expect(version?.snapshot_json).toContain(sourceUrl);
});

it('restores missing bytes without changing the article when the source is unchanged', async () => {
  const { imported, content, file } = await localized();
  await fs.unlink(file);
  const result = await recoverArticleImageAttachment({ nodeId: 'article', sourceUrl: '', recoverStorageKey: imported.storage_key, expectedContent: content });
  expect(result).toMatchObject({ status: 'imported', storage_key: imported.storage_key, recovered_content: content });
  expect(new Uint8Array(await fs.readFile(file))).toEqual(png);
  expect(loadWorkspaceNodeDocument('article')?.content).toBe(content);
});

it('accepts changed remote bytes and updates only the requesting article', async () => {
  const { imported, content, file } = await localized();
  saveNode('sibling', content, { [imported.storage_key]: sourceUrl });
  await fs.unlink(file);
  transport.mockImplementation(async () => new Response(new Uint8Array([...png, 1]), { status: 200 }));
  const result = await recoverArticleImageAttachment({ nodeId: 'article', sourceUrl: '', recoverStorageKey: imported.storage_key, expectedContent: content });
  expect(result.status).toBe('imported');
  if (result.status !== 'imported') return;
  expect(result.storage_key).not.toBe(imported.storage_key);
  expect(loadWorkspaceNodeDocument('article')?.content).toContain(result.storage_key);
  expect(readNodeImageSources('article')).toEqual({ [result.storage_key]: sourceUrl });
  expect(loadWorkspaceNodeDocument('sibling')).toMatchObject({ content, imageSources: { [imported.storage_key]: sourceUrl } });
});

it('preserves article and registration after a failed recovery', async () => {
  const { imported, content, file } = await localized();
  await fs.unlink(file);
  transport.mockRejectedValue(new Error('offline'));
  expect(await recoverArticleImageAttachment({ nodeId: 'article', sourceUrl: '', recoverStorageKey: imported.storage_key, expectedContent: content })).toMatchObject({ status: 'error' });
  expect(loadWorkspaceNodeDocument('article')).toMatchObject({ content, imageSources: { [imported.storage_key]: sourceUrl } });
});

it('restores article sources from a consistent SQLite backup', async () => {
  const { imported, content } = await localized();
  const connection = openDatabaseConnection();
  const backup = path.join(tempRoot, 'backup.db');
  await backupSqliteDatabase({ sourcePath: connection.dbPath, destinationPath: backup, sourceDatabase: connection.sqlite });
  connection.driver.execute("UPDATE nodes SET image_sources = NULL WHERE id = 'article'");
  const targetPath = connection.dbPath;
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await restoreSqliteDatabase({ sourcePath: backup, targetPath });
  initializeDatabase();
  expect(loadWorkspaceNodeDocument('article')).toMatchObject({ content, imageSources: { [imported.storage_key]: sourceUrl } });
});
