// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-push-vertical-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { applyCompanionSyncPush } from './companionSyncPushApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

type SyncPushPayload = import('./companionSyncPushApply.js').CompanionSyncPushPayload;

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-vertical-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertDesktopBaseReview();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertDesktopBaseReview() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'topic', 'Review Topic', '', '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_review', 'node-1', 1, 'desktop-base', 'desktop', '2026-04-30T00:00:00.000Z', 0)`
  );
}

function nodeReviewPush(): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-base', kind: 'content_hash' },
    clientOpId: 'node_review:node-1:12',
    contentHash: 'android-review-next',
    deletedAt: null,
    identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
    payloadJson: JSON.stringify({
      difficulty: 2,
      due: '2026-05-01T00:00:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review_at: '2026-04-30T01:00:00.000Z',
      reps: 1,
      scheduled_days: 1,
      stability: 3,
      state: 1
    }),
    updatedAt: '2026-04-30T01:00:00.000Z'
  };
}

function reviewLogPush(): SyncPushPayload {
  return {
    base: { kind: 'op_id', opId: 'op-android-1' },
    clientOpId: 'review_log:op-android-1',
    identity: { objectId: 'op-android-1', objectType: 'review_log', scope: 'workspace' },
    payloadJson: JSON.stringify({
      device_id: 'android-device',
      difficulty_after: 3,
      difficulty_before: 2,
      due_after: '2026-05-01T00:00:00.000Z',
      due_before: '2026-04-30T00:00:00.000Z',
      grade: 3,
      id: 'review-op-android-1',
      node_id: 'node-1',
      op_id: 'op-android-1',
      reviewed_at: '2026-04-30T01:00:00.000Z',
      scheduler_version: 'ts-fsrs@4',
      stability_after: 4,
      stability_before: 3
    })
  };
}

function readPackRows(packPath: string) {
  const entries = readStoredZipEntries(packPath);
  const incomingBytes = inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0));
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fsSync.writeFileSync(incomingPath, incomingBytes);
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      manifest: JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}'),
      reviewLog: db.prepare('SELECT op_id, node_id, grade FROM review_log').all(),
      stateRows: db.prepare('SELECT object_type, object_id, state_seq FROM sync_object_state').all(),
      syncObjects: db.prepare('SELECT object_type, object_id, payload_json FROM sync_objects').all()
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

describe('companion sync push vertical slice', () => {
  it('packs accepted node_review and review_log changes for Android pull confirmation', async () => {
    const push = applyCompanionSyncPush([nodeReviewPush(), reviewLogPush()]);
    const packPath = path.join(tempRoot, 'vertical-pack.syncpack');

    const pack = await buildDesktopSyncPack({
      outputPath: packPath,
      packId: 'pack-after-android-review-push',
      fromStateSeq: 1
    });

    expect(push.acks).toMatchObject([
      { identity: { objectType: 'node_review' }, stateSeq: 2, status: 'accepted' },
      { identity: { objectType: 'review_log' }, status: 'accepted' }
    ]);
    expect(pack).toMatchObject({ objectCount: 1, toStateSeq: 2 });
    expect(readPackRows(packPath)).toMatchObject({
      manifest: expect.objectContaining({ from_state_seq: 1, to_state_seq: 2 }),
      reviewLog: [{ grade: 3, node_id: 'node-1', op_id: 'op-android-1' }],
      stateRows: [{ object_id: 'node-1', object_type: 'node_review', state_seq: 2 }],
      syncObjects: [expect.objectContaining({
        object_id: 'node-1',
        object_type: 'node_review',
        payload_json: expect.stringContaining('last_review_at')
      })]
    });
  });
});
