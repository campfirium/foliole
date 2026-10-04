import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackStateRowsWithDbPort } from '../../lib/core/sync/syncPackStateRowsExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('writes clean local state rows from applyable sync pack rows', async () => {
  const port = createPort();

  await expect(applySyncPackStateRowsWithDbPort(port, {
    incomingAlias: 'incoming',
    objectTypes: ['node', 'setting']
  })).resolves.toBe(2);

  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('AS next_state_seq'));
  expect(port.run).toHaveBeenCalledWith(
    expect.stringContaining('last_modified_by_host_name, updated_at, deleted_at, 0 FROM numbered'),
    ['node', 'setting', 8]
  );
  expect(port.query).toHaveBeenCalledWith(
    expect.stringContaining('SELECT COUNT(*) AS count'),
    ['node', 'setting']
  );
});

it('does not replace an unrelated object when the next local sequence is occupied', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, high_water INTEGER);
      INSERT INTO sync_state_sequence VALUES (1, 1);
      CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER UNIQUE,
        current_version_id TEXT, content_hash TEXT, last_modified_by_host_name TEXT,
        updated_at TEXT, deleted_at TEXT, sync_dirty INTEGER,
        PRIMARY KEY (object_type, object_id));
      INSERT INTO sync_object_state VALUES
        ('setting', 'existing', 2, NULL, 'hash-old', 'host', '2026-01-01', NULL, 0);
      CREATE TABLE setting_records (key TEXT, scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, value_json TEXT, content_hash TEXT);
      CREATE TABLE node_reading (node_id TEXT, last_handled_at TEXT, repetition_count INTEGER);
      CREATE TABLE node_review (node_id TEXT, last_review_at TEXT, reps INTEGER);
      CREATE TABLE import_sources (source_fingerprint TEXT);
      ATTACH DATABASE ':memory:' AS inc;
      CREATE TABLE inc.sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER,
        content_hash TEXT, last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT);
      INSERT INTO inc.sync_object_state VALUES
        ('setting', 'incoming', 9, 'hash-new', 'peer', '2026-10-03', NULL);
      CREATE TABLE inc.sync_objects (object_type TEXT, object_id TEXT, payload_json TEXT);
      CREATE TABLE inc.nodes (id TEXT, current_version_id TEXT);`);
    const port = createBetterSqliteDbPort(db);
    await expect(applySyncPackStateRowsWithDbPort(port, { objectTypes: ['setting'] }))
      .rejects.toThrow();
    expect(db.prepare('SELECT object_id FROM sync_object_state').all())
      .toEqual([{ object_id: 'existing' }]);
  } finally {
    db.close();
  }
});

function createPort(): DbPort {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('AS next_state_seq')) return [{ next_state_seq: 8 }];
      return [{ count: 2 }];
    }),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: vi.fn()
  } as never;
}
