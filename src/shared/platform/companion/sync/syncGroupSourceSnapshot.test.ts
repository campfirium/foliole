// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncStateSequenceSchemaStatements.js';

const runtime = vi.hoisted(() => ({ port: null as unknown }));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    runWriter: (task: (port: unknown) => Promise<unknown>) => task(runtime.port)
  })
}));

import { createCompanionSyncGroupSourceSnapshot } from './syncGroupSourceSnapshot.js';

it('captures old orphan tombstones after assigning durable source positions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-snapshot-test-'));
  const target = path.join(root, 'cache', 'foliole-provider-source-test.db').replaceAll(path.sep, '/');
  await fs.mkdir(path.dirname(target));
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY);
      CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL,
        host_name TEXT NOT NULL, deleted_at TEXT NOT NULL);
      CREATE TABLE sync_object_state (object_type TEXT NOT NULL, object_id TEXT NOT NULL,
        state_seq INTEGER NOT NULL, content_hash TEXT NOT NULL,
        last_modified_by_host_name TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        PRIMARY KEY (object_type, object_id));
      INSERT INTO sync_object_state VALUES ('node', 'old', 9, 'hash', 'Mac', 'now', NULL);
      INSERT INTO node_sync_tombstones VALUES ('deleted', 'hash', 'Mac', 'then');`);
    sqlite.exec(SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS.join(';\n'));
    runtime.port = createBetterSqliteDbPort(sqlite);
    await expect(createCompanionSyncGroupSourceSnapshot({ target_path: target }))
      .resolves.toEqual({ snapshot_path: target });
    const snapshot = new Database(target, { readonly: true });
    try {
      expect(snapshot.prepare(`SELECT state_seq FROM sync_object_state
        WHERE object_type = 'node' AND object_id = 'deleted'`).pluck().get()).toBe(10);
      expect(snapshot.prepare('SELECT high_water FROM sync_state_sequence').pluck().get()).toBe(10);
    } finally { snapshot.close(); }
  } finally {
    sqlite.close();
    await fs.rm(root, { force: true, recursive: true });
  }
});
