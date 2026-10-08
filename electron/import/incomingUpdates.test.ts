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

import { upsertKeepImportItemCache } from '../../lib/core/database/keepImportItemCache.js';
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

it.each(['', '\ufeff中😀\0文'.repeat(60000)])('retains incoming identities, metadata and exact full text across replacements', (content) => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const connection = openDatabaseConnection();
  connection.sqlite.exec('DROP TABLE content_blob_data');
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: content });
  const before = loadPendingIncomingUpdateById(id);
  expect(before?.updatedContent).toBe(content);
  expect(loadPendingIncomingUpdate(incoming.topicId)).toEqual(before);
  expect(loadPendingIncomingUpdateById('missing')).toBeNull();
  const later = '2026-10-07T01:00:00.000Z';
  expect(upsertPendingIncomingUpdate({ ...incoming, importedAt: later, updatedContent: content })).toBe(id);
  expect(loadPendingIncomingUpdateById(id)).toEqual({ ...before, updatedAt: later });
  expect(connection.driver.queryOne('SELECT updated_content FROM incoming_updates WHERE id = ?', [id]))
    .toEqual({ updated_content: content });
  const nextId = upsertPendingIncomingUpdate({ ...incoming, sourcePath: 'Another/note.md',
    importedAt: '2026-10-07T02:00:00.000Z', updatedContent: 'Another' });
  expect(nextId).not.toBe(id);
  expect(loadPendingIncomingUpdate(incoming.topicId)?.id).toBe(nextId);
  upsertKeepImportItemCache(connection.driver, { content, contentPreview: null, refreshedAt: later, ruleId: 'holder',
    sourceMtimeMs: 0, sourcePath: incoming.sourcePath, sourceSizeBytes: 0, title: 'Holder' });
  clearPendingIncomingUpdate(id);
  expect(loadPendingIncomingUpdateById(id)).toBeNull();
  expect(connection.driver.queryOne('SELECT content FROM keep_import_item_cache WHERE rule_id = ?', ['holder']))
    .toEqual({ content });
  expect(loadPendingIncomingUpdateById(nextId)?.updatedContent).toBe('Another');
  clearPendingIncomingUpdate(nextId);
  expect(loadPendingIncomingUpdate(incoming.topicId)).toBeNull();
});

it('rolls back the original full pending record when the final UPSERT fails', () => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Original' });
  const before = loadPendingIncomingUpdateById(id);
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_incoming_write BEFORE UPDATE ON incoming_updates
    BEGIN SELECT RAISE(ABORT, 'incoming_write_rejected'); END`);
  expect(() => upsertPendingIncomingUpdate({ ...incoming, updatedContent: '\ufeff中😀\0文'.repeat(60000) }))
    .toThrow('incoming_write_rejected');
  expect(loadPendingIncomingUpdateById(id)).toEqual(before);
});

it('replaces one pending body independently of another source cache with the same full text', () => {
  seedImportedTopic({ importedAt: incoming.importedAt, nodeId: incoming.topicId, sourceLocator: '/source/note.md' });
  const driver = openDatabaseConnection().driver;
  const id = upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Shared old' });
  upsertKeepImportItemCache(driver, { content: 'Shared old', contentPreview: null, refreshedAt: incoming.importedAt,
    ruleId: 'holder', sourceMtimeMs: 0, sourcePath: incoming.sourcePath, sourceSizeBytes: 0, title: 'Holder' });
  expect(upsertPendingIncomingUpdate({ ...incoming, updatedContent: 'Replacement' })).toBe(id);
  expect(driver.queryOne('SELECT content FROM keep_import_item_cache WHERE rule_id = ?', ['holder']))
    .toEqual({ content: 'Shared old' });
  expect(loadPendingIncomingUpdateById(id)?.updatedContent).toBe('Replacement');
});
