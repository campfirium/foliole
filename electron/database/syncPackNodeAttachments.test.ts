// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-attachments-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { createAttachmentRecord, createNodeAttachmentLink } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-attachments-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function seedSyncedNode() {
  const driver = openDatabaseConnection().driver;
  const bodyHash = upsertTextBodyBlob(driver, 'node body', '2026-04-27T00:00:00.000Z');
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, opening_text,
       content, body_blob_hash, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?)`,
    ['node-1', 'Node 1', 'Node opening preview', 'node body', bodyHash,
      '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 0)`
  );
}

function readPackRows(packPath: string) {
  const entries = readStoredZipEntries(packPath);
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fsSync.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0)));
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      nodeAttachments: db.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all(),
      stateRows: db.prepare('SELECT object_type, object_id, state_seq FROM sync_object_state').all()
    };
  } finally {
    db.close();
  }
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

it('packs node attachment links through the changed node state', async () => {
  seedSyncedNode();
  createAttachmentRecord({
    createdAt: '2026-04-27T00:01:00.000Z',
    id: 'att-1',
    mimeType: 'image/png',
    originalName: 'cover.png',
    sizeBytes: 12
  });
  createNodeAttachmentLink({ attachmentId: 'att-1', nodeId: 'node-1', role: 'image' });

  const packPath = path.join(tempRoot, 'incoming-node-attachments.db');
  const result = await buildDesktopSyncPack({
    fromStateSeq: 1,
    outputPath: packPath,
    packId: 'pack-node-attachment-link'
  });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-node-attachment-link' });
  expect(readPackRows(packPath)).toEqual({
    nodeAttachments: [{ attachment_id: 'att-1', node_id: 'node-1', role: 'image' }],
    stateRows: [expect.objectContaining({ object_id: 'node-1', object_type: 'node' })]
  });
});
