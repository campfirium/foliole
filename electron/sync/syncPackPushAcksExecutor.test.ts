import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { clearConfirmedSyncPushAcksWithDbPort } from '../../lib/core/sync/syncPackPushAcksExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('clears confirmed push acks using the attached pack and to-state cursor', async () => {
  const port = {
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null }))
  } as unknown as DbPort;

  await clearConfirmedSyncPushAcksWithDbPort(port, {
    incomingAlias: 'incoming',
    toStateSeq: 12
  });

  expect(port.run).toHaveBeenNthCalledWith(1, expect.stringContaining('JOIN incoming.sync_object_state incoming'));
  expect(port.run).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM sync_push_ack'));
});

it('keeps ack-suppressed dirty state when the pack does not prove the pushed content exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-acks-'));
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const sqlite = new Database(':memory:');
  const incoming = new Database(incomingPath);
  try {
    sqlite.exec(`
      CREATE TABLE sync_object_state (
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        sync_dirty INTEGER NOT NULL
      );
      CREATE TABLE sync_push_ack (
        client_op_id TEXT PRIMARY KEY NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        state_seq INTEGER,
        status TEXT NOT NULL,
        acked_at TEXT NOT NULL
      );
      INSERT INTO sync_object_state VALUES ('node_review', 'node-1', 'android-review-hash', 1);
      INSERT INTO sync_push_ack VALUES (
        'node_review:node-1:4', 'node_review', 'node-1', 7, 'accepted', '2026-07-08T00:00:00.000Z'
      );
    `);
    incoming.exec(`
      CREATE TABLE sync_object_state (
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        state_seq INTEGER NOT NULL,
        content_hash TEXT NOT NULL
      );
      INSERT INTO sync_object_state VALUES ('node_review', 'node-1', 8, 'restored-desktop-hash');
    `);
    sqlite.exec(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS incoming`);

    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(sqlite), {
      incomingAlias: 'incoming',
      toStateSeq: 12
    });

    expect(sqlite.prepare('SELECT sync_dirty FROM sync_object_state').get()).toEqual({ sync_dirty: 1 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM sync_push_ack').get()).toEqual({ count: 1 });
  } finally {
    sqlite.close();
    incoming.close();
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

it('clears ack-suppressed dirty state when the pack proves the pushed content exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-acks-'));
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const sqlite = new Database(':memory:');
  const incoming = new Database(incomingPath);
  try {
    sqlite.exec(`
      CREATE TABLE sync_object_state (
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        sync_dirty INTEGER NOT NULL
      );
      CREATE TABLE sync_push_ack (
        client_op_id TEXT PRIMARY KEY NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        state_seq INTEGER,
        status TEXT NOT NULL,
        acked_at TEXT NOT NULL
      );
      INSERT INTO sync_object_state VALUES ('node_review', 'node-1', 'android-review-hash', 1);
      INSERT INTO sync_push_ack VALUES (
        'node_review:node-1:4', 'node_review', 'node-1', 7, 'accepted', '2026-07-08T00:00:00.000Z'
      );
    `);
    incoming.exec(`
      CREATE TABLE sync_object_state (
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        state_seq INTEGER NOT NULL,
        content_hash TEXT NOT NULL
      );
      INSERT INTO sync_object_state VALUES ('node_review', 'node-1', 8, 'android-review-hash');
    `);
    sqlite.exec(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS incoming`);

    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(sqlite), {
      incomingAlias: 'incoming',
      toStateSeq: 12
    });

    expect(sqlite.prepare('SELECT sync_dirty FROM sync_object_state').get()).toEqual({ sync_dirty: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM sync_push_ack').get()).toEqual({ count: 0 });
  } finally {
    sqlite.close();
    incoming.close();
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});
