// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../database/syncStateSequenceSchemaStatements.js';

import { backfillOrphanSyncTombstones } from './syncOrphanTombstoneBackfill.js';

it('assigns old orphan deletions durable new-epoch positions in bounded batches', async () => {
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
      INSERT INTO nodes VALUES ('live');`);
    sqlite.exec(SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS.join(';\n'));
    const insert = sqlite.prepare(`INSERT INTO node_sync_tombstones VALUES (?, 'hash', 'Mac', 'then')`);
    for (let index = 0; index < 130; index++) insert.run(`deleted-${index}`);
    insert.run('live');
    const db = createBetterSqliteDbPort(sqlite);
    const epoch = sqlite.prepare('SELECT source_epoch FROM sync_state_sequence').pluck().get();
    expect(await backfillOrphanSyncTombstones(db)).toBe(130);
    expect(await backfillOrphanSyncTombstones(db)).toBe(0);
    expect(sqlite.prepare(`SELECT COUNT(*) FROM sync_object_state
      WHERE deleted_at = 'then'`).pluck().get()).toBe(130);
    expect(sqlite.prepare('SELECT high_water FROM sync_state_sequence').pluck().get()).toBe(139);
    expect(sqlite.prepare('SELECT source_epoch FROM sync_state_sequence').pluck().get()).toBe(epoch);
    expect(sqlite.prepare(`SELECT COUNT(*) FROM sync_object_state
      WHERE object_id = 'live'`).pluck().get()).toBe(0);
  } finally { sqlite.close(); }
});
