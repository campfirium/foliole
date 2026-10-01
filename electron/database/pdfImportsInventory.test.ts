// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-pdf-import-inventory-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadPdfImportsInventory } from './pdfImportsInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-import-inventory-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { deletedAt?: string | null; id: string }) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, null, input.id, '', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', input.deletedAt ?? null);
}

function insertImportSource(input: {
  latestNodeId: string | null;
  sourceFingerprint: string;
  sourceKind?: string;
  sourceLocator: string;
  sourceName: string;
}) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO import_sources (
         source_fingerprint,
         provider,
         source_kind,
         source_name,
         source_locator,
         first_imported_at,
         last_imported_at,
         last_content_fingerprint,
         latest_node_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.sourceFingerprint,
      'desktop_text_file',
      input.sourceKind ?? 'pdf',
      input.sourceName,
      input.sourceLocator,
      '2026-04-01T00:00:00.000Z',
      '2026-04-02T00:00:00.000Z',
      'content-fp',
      input.latestNodeId
    );
}

function insertPdfIndexState(input: {
  id: string;
  indexedAt?: string | null;
  status: 'failed' | 'indexing' | 'pending' | 'ready' | null;
}) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO pdf_index_state (attachment_id, status, indexed_at) VALUES (?, ?, ?)`
    )
    .run(input.id, input.status, input.indexedAt ?? null);
}

function linkReferenceAttachment(nodeId: string, attachmentId: string) {
  openDatabaseConnection().sqlite
    .prepare(`UPDATE nodes SET resource_references = ? WHERE id = ?`)
    .run(JSON.stringify([{ storage_key: `${attachmentId}.pdf`, role: 'reference', original_name: 'active.pdf' }]), nodeId);
}

it('marks inventory entries as deleted when latest node was removed', () => {
  insertNode({ deletedAt: '2026-04-03T00:00:00.000Z', id: 'node-deleted' });
  insertImportSource({
    latestNodeId: 'node-deleted',
    sourceFingerprint: 'source-deleted',
    sourceLocator: '/tmp/deleted.pdf',
    sourceName: 'deleted.pdf'
  });

  expect(loadPdfImportsInventory()).toEqual([
    {
      lastImportedAt: '2026-04-02T00:00:00.000Z',
      latestNodeId: 'node-deleted',
      nodeStatus: 'deleted',
      pdfIndexedAt: null,
      pdfIndexStatus: null,
      sourceFingerprint: 'source-deleted',
      sourceLocator: '/tmp/deleted.pdf',
      sourceName: 'deleted.pdf'
    }
  ]);
});

it('uses the current node-owned PDF resource status rather than stale local index state', () => {
  insertNode({ id: 'node-active' });
  insertImportSource({
    latestNodeId: 'node-active',
    sourceFingerprint: 'source-active',
    sourceLocator: '/tmp/active.pdf',
    sourceName: 'active.pdf'
  });
  insertPdfIndexState({
    id: 'a'.repeat(64),
    status: 'failed'
  });
  insertPdfIndexState({
    id: 'b'.repeat(64),
    status: 'pending'
  });
  linkReferenceAttachment('node-active', 'b'.repeat(64));

  expect(loadPdfImportsInventory()).toEqual([
    {
      lastImportedAt: '2026-04-02T00:00:00.000Z',
      latestNodeId: 'node-active',
      nodeStatus: 'generated',
      pdfIndexedAt: null,
      pdfIndexStatus: 'pending',
      sourceFingerprint: 'source-active',
      sourceLocator: '/tmp/active.pdf',
      sourceName: 'active.pdf'
    }
  ]);
});
