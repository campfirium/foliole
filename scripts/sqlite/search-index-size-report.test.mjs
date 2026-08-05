// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildSearchIndexSizeReport } from './search-index-size-report.mjs';

vi.setConfig({ testTimeout: 15_000 });

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-report-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('reports search index size drivers without reading document text', () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, body_blob_hash TEXT);
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      stored_size_bytes INTEGER NOT NULL
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE search_index_invalidations (
      id INTEGER PRIMARY KEY,
      invalidation_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE keep_import_item_cache (
      rule_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      content_preview TEXT
    );
    CREATE VIRTUAL TABLE node_search USING fts5(
      title,
      path,
      content,
      node_id UNINDEXED,
      updated_at UNINDEXED,
      tokenize = 'trigram'
    );
  `);
  db.prepare(
    'INSERT INTO node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run('A', '', 'same body secret', 'node-1', '2026-05-25T00:00:00.000Z');
  db.prepare(
    'INSERT INTO node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run('B', '', 'same body secret', 'node-2', '2026-05-25T00:00:00.000Z');
  db.prepare(
    'INSERT INTO node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run('B again', '', 'other body', 'node-2', '2026-05-25T00:01:00.000Z');
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'blob-used',
    'used body'
  );
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'blob-external',
    'external body'
  );
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'blob-shared',
    'shared body'
  );
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'blob-unreferenced',
    'unreferenced body'
  );
  db.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)').run(
    'blob-without-manifest',
    'without manifest'
  );
  db.prepare('INSERT INTO nodes (id, body_blob_hash) VALUES (?, ?)').run('node-1', 'blob-used');
  db.prepare('INSERT INTO nodes (id, body_blob_hash) VALUES (?, ?)').run('node-2', 'blob-shared');
  db.prepare('INSERT INTO external_documents (document_id, body_blob_hash) VALUES (?, ?)').run(
    'doc-1',
    'blob-external'
  );
  db.prepare('INSERT INTO external_documents (document_id, body_blob_hash) VALUES (?, ?)').run(
    'doc-2',
    'blob-shared'
  );
  for (const [hash, size] of [
    ['blob-used', 9],
    ['blob-external', 13],
    ['blob-shared', 11],
    ['blob-unreferenced', 17],
    ['blob-manifest-only', 19]
  ]) {
    db.prepare('INSERT INTO content_blobs (hash, kind, stored_size_bytes) VALUES (?, ?, ?)').run(
      hash,
      'text_body',
      size
    );
  }
  db.prepare(
    'INSERT INTO search_index_invalidations (invalidation_type, target_id, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    'node_workspace',
    'node-1',
    'completed',
    '2026-05-01T00:00:00.000Z',
    '2026-05-01T00:00:00.000Z',
    '2026-05-01T00:00:00.000Z'
  );
  db.prepare(
    'INSERT INTO search_index_invalidations (invalidation_type, target_id, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    'node_workspace',
    'node-2',
    'pending',
    '2026-05-02T00:00:00.000Z',
    '2026-05-02T00:00:00.000Z',
    null
  );
  db.prepare(
    'INSERT INTO keep_import_item_cache (rule_id, source_path, title, content, content_preview) VALUES (?, ?, ?, ?, ?)'
  ).run('rule', 'a.md', 'A', 'preview body', 'preview body');
  db.close();

  const report = buildSearchIndexSizeReport(dbPath);

  expect(report.nodeSearch).toMatchObject({
    totalRows: 3,
    distinctNodeIds: 2,
    duplicateNodeIdGroups: 1,
    duplicateNodeRows: 1,
    distinctContentCount: 2
  });
  expect(report.internalSearchIndexLocation).toBe('main');
  expect(report.nodeSearch.topDuplicatedContent[0]).toEqual({ contentBytes: 16, copies: 2 });
  expect(report.searchIndexInvalidations.byStatus).toEqual([
    { status: 'completed', rows: 1 },
    { status: 'pending', rows: 1 }
  ]);
  expect(report.keepImportItemCache).toMatchObject({
    rowsWhereContentEqualsPreview: 1,
    rowsWherePreviewIsPrefixOfContent: 0
  });
  expect(report.contentBlobData).toMatchObject({
    totalRows: 5,
    totalBytes: 66,
    referencedByNodes: 2,
    referencedByNodeBytes: 20,
    referencedByExternalDocuments: 2,
    referencedByExternalDocumentBytes: 24,
    knownOwnerRows: 3,
    knownOwnerBytes: 33,
    manifestCoveredRows: 4,
    manifestCoveredBytes: 50,
    manifestOnlyRows: 1,
    manifestOnlyBytes: 19,
    unreferencedByKnownOwnersRows: 2,
    unreferencedByKnownOwnersBytes: 33
  });
  expect(JSON.stringify(report)).not.toContain('same body secret');
});

it('marks internal search indexes as migrated when main FTS tables are gone', () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY)');
  db.close();

  const report = buildSearchIndexSizeReport(dbPath);

  expect(report.internalSearchIndexLocation).toBe('sidecar');
  expect(report.nodeSearch.totalRows).toBe(0);
});
