// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-android-payload-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionDocumentResourceQueryDefinitions.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-android-payload-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-25T08:00:00.000Z', '2026-04-25T08:00:00.000Z']
  );
}

it('accepts Android-exported numeric strings without importing device-private reading position', async () => {
  insertNode('node-1');

  await applySyncObjectsAsync([{
    content_hash: 'hash-reading',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      interval_duration_ms: '2500',
      interval_growth_factor: '1.75',
      last_handled_at: '2026-04-25T08:00:00.000Z',
      next_at: '2026-04-25T09:00:00.000Z',
      priority: '3',
      reading_position: '42',
      repetition_count: '5',
      state: 'active'
    }),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    interval_duration_ms: number;
    interval_growth_factor: number;
  }>('SELECT interval_duration_ms, interval_growth_factor FROM node_reading WHERE node_id = ?', ['node-1']))
    .toEqual({ interval_duration_ms: 2500, interval_growth_factor: 1.75 });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM node_reading_host_state WHERE node_id = ?',
    ['node-1']
  )).toEqual({ count: 0 });
});

it('accepts Android-exported numeric strings when applying pdf page text', async () => {
  const id = 'a'.repeat(64);
  insertNode('pdf-topic');
  openDatabaseConnection().driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?',
    [JSON.stringify([{ storage_key: `${id}.pdf`, original_name: 'sample.pdf', role: 'reference' }]), 'pdf-topic']);

  await applySyncObjectsAsync([{
    content_hash: 'hash-pdf-page',
    deleted_at: null,
    object_id: `${id}:3`,
    object_type: 'pdf_page_text',
    payload_json: JSON.stringify({
      attachment_id: id,
      page: '3',
      page_height: '1200.5',
      page_width: '800.25',
      text: 'page text'
    }),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{ page: number; page_height: number; page_width: number }>(
    'SELECT page, page_height, page_width FROM pdf_page_text WHERE attachment_id = ?',
    [id]
  )).toEqual({ page: 3, page_height: 1200.5, page_width: 800.25 });
});

it('accepts Android-exported numeric strings when applying external documents', async () => {
  const bodyHash = upsertTextBodyBlob(openDatabaseConnection().driver, 'body', '2026-04-25T08:00:00.000Z');
  const referenceJson = JSON.stringify({
    connection_ref: 'connection', reader_url: 'https://readwise.io/reader/read/remote-1',
    remote_document_id: 'remote-1', source_url: 'https://example.com/remote-1'
  });
  const payload = buildCanonicalExternalDocumentPayload({ body_blob_hash: bodyHash,
    content_hash: 'body-content-hash', document_id: 'document-1', extension: '.md', file_name: 'doc.md',
    folder_id: 'folder-1', reference_json: referenceJson, reference_kind: 'readwise_remote',
    relative_path: 'doc.md', title: 'Remote title' });
  await applySyncObjectsAsync([{
    content_hash: computeSyncContentHash('external_document', payload),
    deleted_at: null,
    object_id: 'document-1',
    object_type: 'external_document',
    payload_json: JSON.stringify(payload),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    body_blob_hash: string;
    is_present: number;
    reference_json: string | null;
    reference_kind: string;
    source_modified_ms: number;
    source_size_bytes: number;
  }>(`SELECT body_blob_hash, is_present, reference_json, reference_kind, source_modified_ms, source_size_bytes
       FROM external_documents WHERE document_id = ?`, ['document-1']))
    .toEqual({
      body_blob_hash: bodyHash,
      is_present: 1,
      reference_json: referenceJson,
      reference_kind: 'readwise_remote',
      source_modified_ms: 0,
      source_size_bytes: 0
    });

  const queries = ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS;
  expect(openDatabaseConnection().sqlite.prepare(queries.externalDocumentById.sql).get('document-1'))
    .toMatchObject({ content: 'body', document_id: 'document-1', reference_kind: 'readwise_remote' });
  expect(openDatabaseConnection().sqlite.prepare(queries.externalSearchFolders.sql).all())
    .toContainEqual({ document_count: 1, folder_path: 'Readwise', id: 'folder-1' });
  expect(openDatabaseConnection().sqlite.prepare(queries.externalDocumentDirectoryEntries.sql).all())
    .toContainEqual(expect.objectContaining({ document_id: 'document-1', title: 'Remote title' }));
});
