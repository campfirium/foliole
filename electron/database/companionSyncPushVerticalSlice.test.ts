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

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { saveJsonSetting } from './settingsStore.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

type SyncPushPayload = import('./companionSyncPushTypes.js').CompanionSyncPushPayload;

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-vertical-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  saveJsonSetting('device_id', 'desktop-test', '2026-08-12T00:00:00.000Z');
  insertDesktopBaseReview();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertDesktopBaseReview() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at
     ) VALUES ('node-1', 'topic', 'Review Topic', '', 'desktop#node-1', 'desktop', 0,
       '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'desktop-node-base', 'desktop', '2026-04-30T00:00:00.000Z', 0)`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#node-1', 'node-1', NULL, 'desktop',
       '2026-04-30T00:00:00.000Z', 'desktop-node-base', '{"id":"node-1","title":"Review Topic"}')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_review', 'node-1', 2, 'desktop-base', 'desktop', '2026-04-30T00:00:00.000Z', 0)`
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

function nodeVersionPush(): SyncPushPayload {
  const updatedAt = '2026-04-30T02:00:00.000Z';
  return {
    base: { ancestorVersionIds: [], kind: 'node_version', parentVersionId: null },
    clientOpId: 'node:android#1',
    contentHash: 'android-node-hash',
    identity: { objectId: 'node-android', objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify({
      ancestor_version_ids: [],
      content_hash: 'android-node-hash',
      device_id: 'android-device',
      object_id: 'node-android',
      object_type: 'node',
      parent_version_id: null,
      snapshot: {
        anchor_link: null,
        attachments: [],
        content: 'Android body',
        created_at: updatedAt,
        deleted_at: null,
        desired_retention: null,
        hide_title_heading: false,
        id: 'node-android',
        image_regions: null,
        is_title_manual: true,
        kind: 'topic',
        opening_text: null,
        parent_id: null,
        position: null,
        priority: null,
        reveal: null,
        title: 'Android topic',
        updated_at: updatedAt,
        virtual_filter: null
      },
      updated_at: updatedAt,
      version_created_at: updatedAt,
      version_id: 'android-device#1'
    }),
    updatedAt
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
      nodes: db.prepare('SELECT id, current_version_id, title FROM nodes').all(),
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
    const push = await applyCompanionSyncPushAsync([nodeReviewPush(), reviewLogPush()], 'android-device');
    const packPath = path.join(tempRoot, 'vertical-pack.syncpack');

    const pack = await buildDesktopSyncPack({
      outputPath: packPath,
      packId: 'pack-after-android-review-push',
      fromStateSeq: 2
    });

    expect(push.acks).toMatchObject([
      { identity: { objectType: 'node_review' }, stateSeq: 3, status: 'accepted' },
      { identity: { objectType: 'review_log' }, status: 'accepted' }
    ]);
    expect(pack).toMatchObject({ objectCount: 2, toStateSeq: 3 });
    expect(readPackRows(packPath)).toMatchObject({
      manifest: expect.objectContaining({ from_state_seq: 2, to_state_seq: 3 }),
      reviewLog: [{ grade: 3, node_id: 'node-1', op_id: 'op-android-1' }],
      stateRows: [
        { object_id: 'node-1', object_type: 'node', state_seq: 1 },
        { object_id: 'node-1', object_type: 'node_review', state_seq: 3 }
      ],
      syncObjects: [expect.objectContaining({
        object_id: 'node-1',
        object_type: 'node_review',
        payload_json: expect.stringContaining('last_review_at')
      })]
    });
  });

  it('packs accepted node version pushes for Android pull confirmation', async () => {
    const push = await applyCompanionSyncPushAsync([nodeVersionPush()], 'android-device');
    const packPath = path.join(tempRoot, 'node-version-pack.syncpack');

    const pack = await buildDesktopSyncPack({
      outputPath: packPath,
      packId: 'pack-after-android-node-push',
      fromStateSeq: 2
    });

    expect(push.acks).toMatchObject([
      { identity: { objectType: 'node' }, status: 'accepted', versionId: 'android-device#1' }
    ]);
    expect(pack).toMatchObject({ objectCount: 1, toStateSeq: 3 });
    expect(readPackRows(packPath)).toMatchObject({
      manifest: expect.objectContaining({ from_state_seq: 2, to_state_seq: 3 }),
      nodes: [{ current_version_id: 'android-device#1', id: 'node-android', title: 'Android topic' }],
      stateRows: [{ object_id: 'node-android', object_type: 'node', state_seq: 3 }]
    });
  });
});
