// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-scenario-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  buildCanonicalExternalDocumentPayload,
  buildCanonicalExternalFolderPayload
} from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-scenario-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

function readingRecord(overrides: Partial<NativeSyncObjectRecord> = {}): NativeSyncObjectRecord {
  return {
    content_hash: 'reading-hash-1',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      interval_duration_ms: 1000,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-04-21T16:00:00.000Z',
      next_at: '2026-04-22T16:00:00.000Z',
      priority: 2,
      reading_position: 7,
      repetition_count: 3,
      state: 'active'
    }),
    updated_at: '2026-04-21T16:00:00.000Z',
    ...overrides
  };
}

function reviewRecord(overrides: Partial<NativeSyncObjectRecord> = {}): NativeSyncObjectRecord {
  return {
    content_hash: 'review-hash-1',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      difficulty: 4.25,
      due: '2026-04-24T16:00:00.000Z',
      elapsed_days: 2,
      lapses: 0,
      last_review_at: '2026-04-21T16:00:00.000Z',
      reps: 3,
      scheduled_days: 3,
      stability: 7.5,
      state: 2
    }),
    updated_at: '2026-04-21T16:00:00.000Z',
    ...overrides
  };
}

function importSourceRecord(): NativeSyncObjectRecord {
  return {
    content_hash: 'import-source-hash-1',
    deleted_at: null,
    object_id: 'source-1',
    object_type: 'import_source',
    payload_json: JSON.stringify({
      first_imported_at: '2026-04-21T10:00:00.000Z',
      last_content_fingerprint: 'document-hash-1',
      last_imported_at: '2026-04-21T16:00:00.000Z',
      latest_node_id: 'node-1',
      provider: 'manual',
      source_kind: 'markdown',
      source_locator: '/docs/article.md',
      source_name: 'article.md'
    }),
    updated_at: '2026-04-21T16:00:00.000Z'
  };
}

function externalDocumentRecord(overrides: Partial<NativeSyncObjectRecord> = {}): NativeSyncObjectRecord {
  const payload = buildCanonicalExternalDocumentPayload({
    body_blob_hash: 'blob-document-1', content_hash: 'body-content-hash',
    document_id: 'folder-1:article.md', extension: '.md', file_name: 'article.md', folder_id: 'folder-1',
    reference_json: null, reference_kind: 'local_path', relative_path: 'article.md', title: 'Imported Article'
  });
  return {
    content_hash: computeSyncContentHash('external_document', payload),
    deleted_at: null,
    object_id: 'folder-1:article.md',
    object_type: 'external_document',
    payload_json: JSON.stringify(payload),
    updated_at: '2026-04-21T16:00:00.000Z',
    ...overrides
  };
}

it('covers reading and review state apply, idempotency, stale ignore, and fresh update', async () => {
  insertNode('node-1');
  const initialRecords = [readingRecord(), reviewRecord()];

  await expect(applySyncObjectsAsync(initialRecords)).resolves.toEqual(['node_reading:node-1', 'node_review:node-1']);
  await expect(applySyncObjectsAsync(initialRecords)).resolves.toEqual([]);
  await expect(applySyncObjectsAsync([
    readingRecord({
      content_hash: 'reading-stale',
      payload_json: JSON.stringify({ next_at: '2026-04-20T16:00:00.000Z', state: 'done' }),
      updated_at: '2026-04-20T16:00:00.000Z'
    })
  ])).resolves.toEqual([]);
  await expect(applySyncObjectsAsync([
    reviewRecord({
      content_hash: 'review-hash-2',
      payload_json: JSON.stringify({
        difficulty: 3.5,
        due: '2026-04-28T16:00:00.000Z',
        elapsed_days: 4,
        lapses: 1,
        last_review_at: '2026-04-25T16:00:00.000Z',
        reps: 4,
        scheduled_days: 5,
        stability: 8,
        state: 3
      }),
      updated_at: '2026-04-25T16:00:00.000Z'
    })
  ])).resolves.toEqual(['node_review:node-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ next_at: string; state: string }>(
    'SELECT next_at, state FROM node_reading WHERE node_id = ?',
    ['node-1']
  )).toEqual({ next_at: '2026-04-22T16:00:00.000Z', state: 'active' });
  expect(driver.queryOne<{ due: string; lapses: number; reps: number; state: number }>(
    'SELECT due, lapses, reps, state FROM node_review WHERE node_id = ?',
    ['node-1']
  )).toEqual({ due: '2026-04-28T16:00:00.000Z', lapses: 1, reps: 4, state: 3 });
  expect(driver.queryOne<{ dirty: number; hash: string }>(
    `SELECT sync_dirty AS dirty, content_hash AS hash FROM sync_object_state
     WHERE object_type = 'node_review' AND object_id = ?`,
    ['node-1']
  )).toEqual({ dirty: 0, hash: 'review-hash-2' });
});

it('covers imported article source and external document presence transitions', async () => {
  await expect(applySyncObjectsAsync([importSourceRecord(), externalDocumentRecord()])).resolves.toEqual([
    'import_source:source-1',
    'external_document:folder-1:article.md'
  ]);
  await expect(applySyncObjectsAsync([importSourceRecord(), externalDocumentRecord()])).resolves.toEqual([]);
  await expect(applySyncObjectsAsync([
    externalDocumentRecord({
      content_hash: computeSyncContentHash('external_document',
        buildCanonicalSyncTombstone('folder-1:article.md')),
      deleted_at: '2026-04-22T16:00:00.000Z',
      payload_json: null,
      updated_at: '2026-04-22T16:00:00.000Z'
    })
  ])).resolves.toEqual(['external_document:folder-1:article.md']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ latest_node_id: string; source_name: string }>(
    'SELECT latest_node_id, source_name FROM import_sources WHERE source_fingerprint = ?',
    ['source-1']
  )).toEqual({ latest_node_id: 'node-1', source_name: 'article.md' });
  expect(driver.queryOne<{ body_blob_hash: string; is_present: number; missing_at: string }>(
    'SELECT body_blob_hash, is_present, missing_at FROM external_documents WHERE document_id = ?',
    ['folder-1:article.md']
  )).toEqual({
    body_blob_hash: 'blob-document-1',
    is_present: 0,
    missing_at: '2026-04-22T16:00:00.000Z'
  });
  expect(driver.queryOne<{ deleted_at: string; dirty: number }>(
    `SELECT deleted_at, sync_dirty AS dirty FROM sync_object_state
     WHERE object_type = 'external_document' AND object_id = ?`,
    ['folder-1:article.md']
  )).toEqual({ deleted_at: '2026-04-22T16:00:00.000Z', dirty: 0 });
});

it('rejects tampered external resources without blocking another object', async () => {
  const document = buildCanonicalExternalDocumentPayload({ body_blob_hash: null,
    content_hash: 'body-hash', document_id: 'folder-1:tampered.md', extension: 'md',
    file_name: 'tampered.md', folder_id: 'folder-1', reference_json: null,
    reference_kind: 'local_path', relative_path: 'tampered.md', title: 'Original' });
  const folder = buildCanonicalExternalFolderPayload({ attachment_mode: 'document_relative',
    excluded_dirs_json: '[]', host_name: 'desktop', host_platform: 'darwin',
    id: 'folder-1', source_ref: 'source-1' });
  const applied = await applySyncObjectsAsync([
    { content_hash: computeSyncContentHash('external_document', document), deleted_at: null,
      object_id: document.document_id, object_type: 'external_document',
      payload_json: JSON.stringify({ ...document, title: 'Tampered' }), updated_at: '2026-04-22' },
    { content_hash: computeSyncContentHash('external_folder', folder), deleted_at: null,
      object_id: folder.id, object_type: 'external_folder',
      payload_json: JSON.stringify({ ...folder, excluded_dirs_json: '["tampered"]' }), updated_at: '2026-04-22' },
    importSourceRecord()
  ]);
  expect(applied).toEqual(['import_source:source-1']);
  expect(openDatabaseConnection().driver.queryOne('SELECT document_id FROM external_documents')).toBeUndefined();
  expect(openDatabaseConnection().driver.queryOne('SELECT id FROM external_search_folders')).toBeUndefined();
});
