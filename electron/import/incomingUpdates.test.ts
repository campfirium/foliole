// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-incoming-updates-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { upsertKeepImportItemCache } from '../../lib/core/database/keepImportItemCache.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { clearPendingIncomingUpdate, loadPendingIncomingUpdate, loadPendingIncomingUpdateById,
  resolveIncomingUpdateTarget, upsertPendingIncomingUpdate } from './incomingUpdates.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-incoming-updates-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedImportedTopic(input: { importedAt: string; nodeId: string; sourceLocator: string }) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Imported topic',
    createdAt: input.importedAt,
    isTitleManual: false,
    kind: 'topic',
    nodeId: input.nodeId,
    parentNodeId: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Imported topic',
    updatedAt: input.importedAt
  });
  openDatabaseConnection().driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id, imported_at,
       degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `import-${input.nodeId}`,
      `source-${input.nodeId}`,
      'desktop_text_file',
      'markdown',
      path.basename(input.sourceLocator),
      input.sourceLocator,
      `content-${input.nodeId}`,
      'new',
      'imported',
      input.nodeId,
      input.importedAt,
      null,
      null
    ]
  );
}

it('targets the first live historical import when no mirror record exists', () => {
  const sourceLocator = path.join(tempRoot, 'Import', 'Memo', 'note.md');
  seedImportedTopic({
    importedAt: '2026-07-04T03:01:00.000Z',
    nodeId: 'node-original',
    sourceLocator
  });
  seedImportedTopic({
    importedAt: '2026-07-04T03:02:00.000Z',
    nodeId: 'node-duplicate',
    sourceLocator
  });

  expect(resolveIncomingUpdateTarget({
    relativePath: 'Memo/note.md',
    sourceLocator
  })).toEqual({
    sourcePath: 'Memo/note.md',
    topicId: 'node-original'
  });
});

const incoming = { importedAt: '2026-10-07T00:00:00.000Z', sourcePath: 'Memo/note.md', topicId: 'incoming-topic' };

async function prepareChunkedIncoming() {
  const connection = openDatabaseConnection();
  await createBetterSqliteDbPort(connection.sqlite).transaction(async (tx) => {
    await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
  });
  connection.sqlite.exec('DROP TABLE content_blob_data');
  return connection.driver;
}

it.each(['', '\ufeff中😀\0文'.repeat(350000)])('retains incoming identities, metadata and exact content across explicit chunked rewrites', async (content) => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: content });
  const before = loadPendingIncomingUpdateById(id);
  const driver = await prepareChunkedIncoming();
  expect(loadPendingIncomingUpdateById(id, 'chunked')).toEqual(before);
  expect(loadPendingIncomingUpdate(incoming.topicId, 'chunked')).toEqual(before);
  expect(loadPendingIncomingUpdateById('missing', 'chunked')).toBeNull();
  const later = '2026-10-07T01:00:00.000Z';
  expect(upsertPendingIncomingUpdate({ ...incoming, importedAt: later, updatedContent: content }, 'chunked')).toBe(id);
  expect(loadPendingIncomingUpdateById(id, 'chunked')).toEqual({ ...before, updatedAt: later });
  expect(driver.queryOne('SELECT updated_content, body_blob_hash FROM incoming_updates WHERE id = ?', [id]))
    .toEqual({ updated_content: '', body_blob_hash: hashTextBody(content) });
  const nextId = upsertPendingIncomingUpdate({ ...incoming, sourcePath: 'Another/note.md',
    importedAt: '2026-10-07T02:00:00.000Z', updatedContent: 'Another' }, 'chunked');
  expect(nextId).not.toBe(id);
  expect(loadPendingIncomingUpdate(incoming.topicId, 'chunked')?.id).toBe(nextId);
  upsertKeepImportItemCache(driver, { content, contentPreview: null, refreshedAt: later, ruleId: 'holder',
    sourceMtimeMs: 0, sourcePath: incoming.sourcePath, sourceSizeBytes: 0, title: 'Holder' }, 'chunked');
  clearPendingIncomingUpdate(id, 'chunked');
  expect(loadPendingIncomingUpdateById(id, 'chunked')).toBeNull();
  expect(driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hashTextBody(content)])).toBeDefined();
  clearPendingIncomingUpdate(nextId, 'chunked');
  expect(driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hashTextBody('Another')])).toBeUndefined();
});

it('rolls back incoming body adoption and the original pending record when the final UPSERT fails', async () => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Original' });
  const driver = await prepareChunkedIncoming();
  const before = loadPendingIncomingUpdateById(id, 'chunked');
  const bodies = driver.queryAll('SELECT * FROM content_bodies');
  const blobs = driver.queryAll('SELECT * FROM content_blobs');
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_incoming_write BEFORE UPDATE ON incoming_updates
    BEGIN SELECT RAISE(ABORT, 'incoming_write_rejected'); END`);
  const content = '\ufeff中😀\0文'.repeat(350000);
  expect(() => upsertPendingIncomingUpdate({ ...incoming, updatedContent: content }, 'chunked')).toThrow('incoming_write_rejected');
  expect(loadPendingIncomingUpdateById(id, 'chunked')).toEqual(before);
  expect(driver.queryAll('SELECT * FROM content_bodies')).toEqual(bodies);
  expect(driver.queryAll('SELECT * FROM content_blobs')).toEqual(blobs);
  expect(driver.queryOne('SELECT 1 FROM content_body_chunks WHERE hash = ?', [hashTextBody(content)])).toBeUndefined();
});

it('rejects missing and unavailable chunked incoming bodies without falling back to stale inline text', async () => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Original' });
  const driver = await prepareChunkedIncoming();
  const hash = hashTextBody('Original');
  driver.execute('DELETE FROM content_bodies WHERE hash = ?', [hash]);
  driver.execute('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)', [hash, Buffer.byteLength('Original')]);
  expect(() => loadPendingIncomingUpdateById(id, 'chunked')).toThrow('body_content_unavailable');
  driver.execute("UPDATE incoming_updates SET body_blob_hash = NULL, updated_content = 'stale inline' WHERE id = ?", [id]);
  expect(() => loadPendingIncomingUpdateById(id, 'chunked')).toThrow('body_content_unavailable');
  expect(() => loadPendingIncomingUpdate(incoming.topicId, 'chunked')).toThrow('body_content_unavailable');
  expect(loadPendingIncomingUpdateById(id)?.updatedContent).toBe('stale inline');
});

it('collects a replaced incoming body while preserving a replaced body shared by cache', async () => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const driver = await prepareChunkedIncoming();
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Unshared old' }, 'chunked');
  expect(upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Shared old' }, 'chunked')).toBe(id);
  expect(driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hashTextBody('Unshared old')])).toBeUndefined();
  expect(driver.queryOne('SELECT hash FROM content_blobs WHERE hash = ?', [hashTextBody('Unshared old')])).toBeUndefined();
  expect(driver.queryOne('SELECT hash FROM content_body_chunks WHERE hash = ?', [hashTextBody('Unshared old')])).toBeUndefined();
  upsertKeepImportItemCache(driver, { content: 'Shared old', contentPreview: null, refreshedAt: incoming.importedAt,
    ruleId: 'holder', sourceMtimeMs: 0, sourcePath: incoming.sourcePath, sourceSizeBytes: 0, title: 'Holder' }, 'chunked');
  expect(upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Replacement' }, 'chunked')).toBe(id);
  expect(driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hashTextBody('Shared old')])).toBeDefined();
  expect(loadPendingIncomingUpdateById(id, 'chunked')?.updatedContent).toBe('Replacement');
});
