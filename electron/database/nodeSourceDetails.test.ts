// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-source-details-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { loadNodeSourceDetails } from '../../lib/core/database/nodeSourceDetails.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-source-details-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedPdfNodeWithMarkdownAndPdfSources() {
  const database = openDatabaseConnection().sqlite;
  database
    .prepare(
      `INSERT INTO nodes (
         id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
       ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?)`
    )
    .run('node-pdf', 'Paper', '# Paper\n\nExtracted PDF text.', '2026-04-24T00:00:00.000Z', '2026-04-24T00:00:00.000Z');
  database
    .prepare(
      `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, pdf_index_status, pdf_indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('pdf-1', 'paper.pdf', 'application/pdf', 1024, '2026-04-24T00:00:00.000Z', 'ready', '2026-04-24T00:03:00.000Z');
  database.prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)').run('node-pdf', 'pdf-1', 'reference');
  database
    .prepare(
      `INSERT INTO import_sources (
         source_fingerprint, provider, source_kind, source_name, source_locator,
         first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
       ) VALUES (?, 'desktop_text_file', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('markdown-source', 'markdown', 'Paper.md', '/imports/Paper.md', '2026-04-24T00:00:00.000Z', '2026-04-24T00:04:00.000Z', 'hash-md', 'node-pdf');
  database
    .prepare(
      `INSERT INTO import_sources (
         source_fingerprint, provider, source_kind, source_name, source_locator,
         first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
       ) VALUES (?, 'desktop_text_file', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('pdf-source', 'pdf', 'Paper.pdf', '/imports/Paper.pdf', '2026-04-24T00:00:00.000Z', '2026-04-24T00:02:00.000Z', 'hash-pdf', 'node-pdf');
}

it('prefers the pdf import source when a node also has a markdown source', () => {
  seedPdfNodeWithMarkdownAndPdfSources();

  const details = loadNodeSourceDetails(openDatabaseConnection().driver, 'node-pdf');

  expect(details?.importSource?.source_kind).toBe('pdf');
  expect(details?.importSource?.pdf_index_status).toBe('ready');
});

it('exposes Blob authority and represents missing Blob data as unavailable', () => {
  const connection = openDatabaseConnection();
  const hash = upsertTextBodyBlob(connection.driver, 'Blob authority', '2026-04-24T00:00:00.000Z');
  connection.driver.execute(
    `INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at)
     VALUES ('node-blob', 'topic', 'Blob', 'stale inline', ?, ?, ?)`,
    [hash, '2026-04-24T00:00:00.000Z', '2026-04-24T00:00:00.000Z']
  );

  expect(loadNodeSourceDetails(connection.driver, 'node-blob')).toMatchObject({
    sourceNodeBodyStatus: 'resolved', sourceNodeContent: 'Blob authority'
  });
  connection.driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(loadNodeSourceDetails(connection.driver, 'node-blob')).toMatchObject({
    sourceNodeBodyStatus: 'unavailable', sourceNodeContent: null
  });
});
