// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'),
    app_data_dir: path.join(tempRoot, 'data'),
    app_log_dir: path.join(tempRoot, 'logs')
  })
}));

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { setSearchIndexInvalidationScheduler } from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { markExternalDocumentsMissing, replaceExternalDocumentsForFolder, upsertExternalDocuments } from './externalDocuments.js';
import type { ScannedDocument } from './externalSearchCacheSupport.js';
import { upsertKeepImportItemCache } from './keepImportItemCache.js';

const createdAt = '2026-10-05T01:00:00.000Z';
const missingAt = '2026-10-05T02:00:00.000Z';
const documentId = 'atomic-folder:doc.md';
let wakes = 0;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-document-atomicity-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('atomicity-host');
  wakes = 0;
  setSearchIndexInvalidationScheduler(() => {
    expect(openDatabaseConnection().sqlite.inTransaction).toBe(false);
    wakes += 1;
  });
});

afterEach(async () => {
  setSearchIndexInvalidationScheduler(null);
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rolls back the body blob and business row when sync state creation fails', () => {
  installSyncStateFailureTrigger();

  expect(() => upsertExternalDocuments(createFolder(), [createDocument()], createdAt))
    .toThrow('forced external document state failure');

  expect(countRows('content_blobs')).toBe(0);
  expect(countRows('content_blob_data')).toBe(0);
  expect(countRows('external_documents')).toBe(0);
  expect(countExternalDocumentStates()).toBe(0);
  expect(wakes).toBe(0);
});

it('rolls back a tombstone business update when sync state replacement fails', () => {
  upsertExternalDocuments(createFolder(), [createDocument()], createdAt);
  const before = readDocumentAndState();
  installSyncStateFailureTrigger();
  wakes = 0;

  expect(() => markExternalDocumentsMissing([{ relativePath: 'doc.md' }], 'atomic-folder', missingAt))
    .toThrow('forced external document state failure');

  expect(readDocumentAndState()).toEqual(before);
  expect(wakes).toBe(0);
});

it('keeps the sync identity stable when only scan clocks and source stats change', () => {
  upsertExternalDocuments(createFolder(), [createDocument()], createdAt);
  const before = readDocumentAndState() as { content_hash: string; state_seq: number };
  upsertExternalDocuments(createFolder(), [{ ...createDocument(), modifiedAt: missingAt,
    modifiedMs: 2, sizeBytes: 99 }], missingAt);
  const after = readDocumentAndState() as { content_hash: string; state_seq: number };
  const row = openDatabaseConnection().driver.queryOne<
    Parameters<typeof buildCanonicalExternalDocumentPayload>[0] & DatabaseRow
  >(
    `SELECT document_id, folder_id, relative_path, file_name, extension, content_hash, title,
       body_blob_hash, reference_kind, reference_json FROM external_documents WHERE document_id = ?`,
    [documentId]
  )!;

  expect(after).toMatchObject({ content_hash: before.content_hash, state_seq: before.state_seq });
  expect(after.content_hash).toBe(computeSyncContentHash(
    'external_document', buildCanonicalExternalDocumentPayload(row)
  ));
});

function installSyncStateFailureTrigger() {
  openDatabaseConnection().sqlite.exec(`
    CREATE TRIGGER fail_external_document_state
    BEFORE INSERT ON sync_object_state
    WHEN NEW.object_type = 'external_document'
    BEGIN
      SELECT RAISE(ABORT, 'forced external document state failure');
    END
  `);
}

function countRows(tableName: 'content_blobs' | 'content_blob_data' | 'external_documents') {
  return (openDatabaseConnection().sqlite.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as {
    count: number;
  }).count;
}

function countExternalDocumentStates() {
  return (openDatabaseConnection().sqlite.prepare(
    "SELECT COUNT(*) AS count FROM sync_object_state WHERE object_type = 'external_document'"
  ).get() as { count: number }).count;
}

function readDocumentAndState() {
  return openDatabaseConnection().sqlite.prepare(
    `SELECT d.is_present, d.missing_at, d.updated_at, s.content_hash, s.deleted_at, s.state_seq
     FROM external_documents d
     JOIN sync_object_state s ON s.object_type = 'external_document' AND s.object_id = d.document_id
     WHERE d.document_id = ?`
  ).get(documentId);
}

function createFolder(): NativeExternalSearchFolder {
  return {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: createdAt,
    document_count: 0,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'atomic-folder',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: createdAt
  };
}

function createDocument(): ScannedDocument {
  return {
    absolutePath: '/library/doc.md',
    content: '# Atomic\n\nBody',
    extension: 'md',
    fileName: 'doc.md',
    modifiedAt: createdAt,
    modifiedMs: 1,
    relativePath: 'doc.md',
    sizeBytes: 14
  };
}


it('wakes existing background indexing after each committed external write', () => {
  upsertExternalDocuments(createFolder(), [createDocument()], createdAt);
  expect(wakes).toBe(1);
  replaceExternalDocumentsForFolder(createFolder(), [createDocument()], missingAt);
  expect(wakes).toBe(2);
  markExternalDocumentsMissing([{ relativePath: 'doc.md' }], 'atomic-folder', missingAt);
  expect(wakes).toBe(3);
  expect(readDocumentAndState()).toMatchObject({ is_present: 0 });
});

it('does not wake after an external folder replacement rolls back', () => {
  upsertExternalDocuments(createFolder(), [createDocument()], createdAt);
  wakes = 0;
  installSyncStateFailureTrigger();
  expect(() => replaceExternalDocumentsForFolder(createFolder(), [], missingAt))
    .toThrow('forced external document state failure');
  expect(wakes).toBe(0);
  expect(readDocumentAndState()).toMatchObject({ is_present: 1 });
});

function cacheInput() {
  return { ruleId: 'rule', sourcePath: 'source.md', title: 'Cache title', content: 'Cache body',
    contentPreview: 'Preview', sourceMtimeMs: 1, sourceSizeBytes: 10, refreshedAt: createdAt };
}

it('wakes only after committed cache writes, preserving no-op tracking and rollback behavior', () => {
  upsertKeepImportItemCache(cacheInput());
  expect(wakes).toBe(1);
  upsertKeepImportItemCache(cacheInput(), { requireTracking: true });
  expect(wakes).toBe(1);
  openDatabaseConnection().sqlite.prepare(`INSERT INTO keep_import_items
    (rule_id, source_path, source_mtime_ms, source_size_bytes, last_status, first_seen_at, last_seen_at)
    VALUES ('rule', 'source.md', 1, 10, 'blocked_deleted', ?, ?)`).run(createdAt, createdAt);
  upsertKeepImportItemCache(cacheInput(), { requireTracking: true });
  expect(wakes).toBe(2);
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_cache BEFORE UPDATE ON keep_import_item_cache
    BEGIN SELECT RAISE(ABORT, 'cache_failure'); END`);
  for (const requireTracking of [false, true]) {
    expect(() => upsertKeepImportItemCache({ ...cacheInput(), content: 'Rejected' }, { requireTracking }))
      .toThrow('cache_failure');
    expect(wakes).toBe(2);
  }
  expect(openDatabaseConnection().driver.queryOne('SELECT content FROM keep_import_item_cache'))
    .toEqual({ content: 'Cache body' });
});
