// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-external-tombstone-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { replaceExternalDocumentsForFolder } from './externalDocuments.js';

let tempRoot = '';
const originalBody = '\ufeff---\r\n中文😀\0\r\n---\r\n' + '中😀'.repeat(149_000);
const identitySql = `SELECT object_id, content_hash, deleted_at FROM sync_object_state
  WHERE object_type = 'external_document' AND object_id = 'folder-delete:doc.md'`;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-external-tombstone-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies an external document deletion after its complete body through request snapshots', async () => {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture();
  const folder = createExternalFolder();
  const files = createDesktopFramedSyncFiles(path.join(tempRoot, 'requests'));
  await withRequestSyncFiles(files, async created => {
    replaceExternalDocumentsForFolder(folder, [createScannedDocument()], '2026-05-04T09:00:00.000Z');
    const originalIdentity = openDatabaseConnection().sqlite.prepare(identitySql).get();
    const originalDocument = openDatabaseConnection().sqlite.prepare(
      "SELECT document_id, content, body_blob_hash, content_hash FROM external_documents WHERE document_id = 'folder-delete:doc.md'"
    ).get();
    await writeSnapshot(created);
    await withRequestSyncFiles(files, async deleted => {
      replaceExternalDocumentsForFolder(folder, [], '2026-05-04T09:05:00.000Z');
      await writeSnapshot(deleted);
      closeDatabaseConnection();
      mockedAppDataDir = path.join(tempRoot, 'target-app-data');
      const connection = openDatabaseConnection();
      initializeDatabaseConnection(connection);
      const port = createBetterSqliteDbPort(connection.sqlite);
      for (const request of [created, created, deleted]) {
        await applyFramedFactSources(port, [async function* () { yield* request.readFacts(); }], {
          requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob)
        });
        if (request === created) assertOriginalDocument(connection.dbPath, originalIdentity, originalDocument);
      }
      expect(connection.sqlite.prepare(
        `SELECT is_present, missing_at, updated_at FROM external_documents WHERE document_id = ?`
      ).get('folder-delete:doc.md')).toEqual({
        is_present: 0,
        missing_at: '2026-05-04T09:05:00.000Z',
        updated_at: '2026-05-04T09:05:00.000Z'
      });
      expect(connection.sqlite.prepare(
        `SELECT state_seq, deleted_at, sync_dirty
         FROM sync_object_state WHERE object_type = 'external_document' AND object_id = ?`
      ).get('folder-delete:doc.md')).toEqual({
        deleted_at: '2026-05-04T09:05:00.000Z',
        state_seq: 2,
        sync_dirty: 0
      });
    });
  });
});

async function writeSnapshot(request: RequestSyncFiles) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const entry = await readFramedSyncInventoryEntry(port, {
    objectType: 'external_document', globalId: 'folder-delete:doc.md'
  });
  if (!entry) throw new Error('test_external_document_inventory_missing');
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  if (!difference) throw new Error('test_external_document_difference_missing');
  await writeRequestSyncSnapshot(port, difference, request);
}

function createScannedDocument() {
  return {
    absolutePath: '/library/doc.md',
    content: originalBody,
    extension: 'md' as const,
    fileName: 'doc.md',
    modifiedAt: '2026-05-04T09:00:00.000Z',
    modifiedMs: 1000,
    relativePath: 'doc.md',
    sizeBytes: Buffer.byteLength(originalBody)
  };
}

function createExternalFolder(): NativeExternalSearchFolder {
  return {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: '2026-05-04T09:00:00.000Z',
    document_count: 0,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-delete',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: '2026-05-04T09:00:00.000Z'
  };
}

function assertOriginalDocument(databasePath: string, identity: unknown, document: unknown) {
  const reopened = new Database(databasePath, { readonly: true });
  try {
    expect(reopened.prepare(identitySql).get()).toEqual(identity);
    expect(reopened.prepare(`SELECT document_id, content, body_blob_hash, content_hash
      FROM external_documents WHERE document_id = 'folder-delete:doc.md'`).get()).toEqual(document);
    expect(reopened.prepare("SELECT content FROM external_documents WHERE document_id = 'folder-delete:doc.md'")
      .pluck().get()).toBe(originalBody);
  } finally { reopened.close(); }
}
