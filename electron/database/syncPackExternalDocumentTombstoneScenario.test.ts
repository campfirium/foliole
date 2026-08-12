// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

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
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { replaceExternalDocumentsForFolder } from './externalDocuments.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-external-tombstone-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('advances the shared pack cursor for external document tombstone-only packs', async () => {
  const packs = await buildSourceCreateAndDeletePacks();
  const connection = openTargetDatabase();

  await applyPack(connection, extractIncomingPack(packs.created, 'external-create.db'), 0, 1);
  await applyPack(connection, extractIncomingPack(packs.deleted, 'external-delete.db'), 1, 2);

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

async function buildSourceCreateAndDeletePacks() {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture();
  const folder = createExternalFolder();
  replaceExternalDocumentsForFolder(folder, [createScannedDocument()], '2026-05-04T09:00:00.000Z');
  const created = await buildPack('external-delete-create', 'external-create.syncpack', 0, '2026-05-04T09:00:30.000Z');
  replaceExternalDocumentsForFolder(folder, [], '2026-05-04T09:05:00.000Z');
  const deleted = await buildPack('external-delete-tombstone', 'external-delete.syncpack', 1, '2026-05-04T09:05:30.000Z');
  closeDatabaseConnection();
  return { created, deleted };
}

async function buildPack(packId: string, fileName: string, fromStateSeq: number, createdAt: string) {
  const outputPath = path.join(tempRoot, fileName);
  await buildDesktopSyncPack({
    createdAt,
    fromDeviceId: 'desktop-source',
    fromStateSeq,
    outputPath,
    packId,
    toPeerId: 'android-target'
  });
  return outputPath;
}

function createScannedDocument() {
  return {
    absolutePath: '/library/doc.md',
    content: '# Doc\n\nBody',
    extension: 'md' as const,
    fileName: 'doc.md',
    modifiedAt: '2026-05-04T09:00:00.000Z',
    modifiedMs: 1000,
    relativePath: 'doc.md',
    sizeBytes: 10
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

function openTargetDatabase() {
  mockedAppDataDir = path.join(tempRoot, 'target-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().sqlite.exec(`
    CREATE TABLE sync_push_ack (
      client_op_id TEXT PRIMARY KEY NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER,
      status TEXT NOT NULL,
      acked_at TEXT NOT NULL
    )
  `);
  return openDatabaseConnection();
}

async function applyPack(
  connection: ReturnType<typeof openDatabaseConnection>,
  incomingPath: string,
  currentCursor: number,
  toStateSeq: number
) {
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-external-tombstone' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor,
      deviceId: 'android-target'
    })).resolves.toMatchObject({ applied: true, appliedObjectCount: 1, toStateSeq });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

function extractIncomingPack(syncPackPath: string, outputName: string) {
  const entries = readStoredZipEntries(syncPackPath);
  const incomingPath = path.join(tempRoot, outputName);
  fsSync.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0)));
  return incomingPath;
}

function readStoredZipEntries(filePath: string) {
  const buffer = fsSync.readFileSync(filePath);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.set(name, buffer.subarray(contentStart, contentStart + compressedSize));
    offset = contentStart + compressedSize;
  }
  return entries;
}
