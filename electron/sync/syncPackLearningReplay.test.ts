import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FOREGROUND_TIME_SCHEMA } from '../../lib/core/database/foregroundTimeSchema.js';
import { applySyncPackStateRowsWithDbPort } from '../../lib/core/sync/syncPackStateRowsExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it.each(['node_reading', 'node_review'])('does not renumber an identical %s snapshot', async (type) => {
  const db = createFixture(type, 'same-hash');
  try {
    const port = createBetterSqliteDbPort(db);
    expect(await applySyncPackStateRowsWithDbPort(port, { objectTypes: [type] })).toBe(0);
    expect(readState(db, type)).toEqual({ content_hash: 'same-hash', state_seq: 7 });
    expect(await applySyncPackStateRowsWithDbPort(port, { objectTypes: [type] })).toBe(0);
    expect(readState(db, type)).toEqual({ content_hash: 'same-hash', state_seq: 7 });
  } finally {
    db.close();
  }
});

it.each(['node_reading', 'node_review'])('accepts a changed %s snapshot', async (type) => {
  const db = createFixture(type, 'new-hash');
  try {
    const port = createBetterSqliteDbPort(db);
    expect(await applySyncPackStateRowsWithDbPort(port, { objectTypes: [type] })).toBe(1);
    expect(readState(db, type)).toEqual({ content_hash: 'new-hash', state_seq: 8 });
  } finally {
    db.close();
  }
});

it.each(['node_reading', 'node_review'])('keeps a %s deletion even when its hash is unchanged', async (type) => {
  const db = createFixture(type, 'same-hash');
  try {
    db.prepare('UPDATE inc.sync_object_state SET deleted_at = ? WHERE object_type = ?')
      .run('2026-05-02T00:00:00Z', type);
    expect(await applySyncPackStateRowsWithDbPort(createBetterSqliteDbPort(db),
      { objectTypes: [type] })).toBe(1);
    expect(db.prepare('SELECT deleted_at, state_seq FROM sync_object_state WHERE object_type = ?')
      .get(type)).toEqual({ deleted_at: '2026-05-02T00:00:00Z', state_seq: 8 });
  } finally {
    db.close();
  }
});

function createFixture(type: string, incomingHash: string) {
  const db = new Database(':memory:');
  const incomingTime = incomingHash === 'same-hash'
    ? '2026-05-01T00:00:00Z' : '2026-05-02T00:00:00Z';
  db.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL,
      current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL,
      PRIMARY KEY (object_type, object_id)
    );
    CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, high_water INTEGER NOT NULL);
    INSERT INTO sync_state_sequence VALUES (1, 7);
    CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, last_handled_at TEXT, repetition_count INTEGER);
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, last_review_at TEXT, reps INTEGER);
    CREATE TABLE import_sources (source_fingerprint TEXT PRIMARY KEY);
    CREATE TABLE setting_records (
      key TEXT, scope TEXT, platform TEXT, form_factor TEXT, host_name TEXT,
      value_json TEXT, content_hash TEXT
    );
    ATTACH DATABASE ':memory:' AS inc;
    CREATE TABLE inc.sync_object_state (
      object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT,
      last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE inc.sync_objects (
      object_type TEXT, object_id TEXT, content_hash TEXT, payload_json TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE inc.nodes (id TEXT, current_version_id TEXT);
  `);
  for (const statement of FOREGROUND_TIME_SCHEMA) db.exec(statement);
  db.prepare(`INSERT INTO sync_object_state VALUES (?, 'node-1', 7, NULL,
    'same-hash', 'host-a', '2026-05-01T00:00:00Z', NULL, 0)`).run(type);
  db.prepare(`INSERT INTO inc.sync_object_state VALUES (?, 'node-1', 10, ?,
    'host-b', ?, NULL)`).run(type, incomingHash, incomingTime);
  const payload = type === 'node_review'
    ? { last_review_at: incomingTime, reps: 2 }
    : { last_handled_at: incomingTime, repetition_count: 2 };
  db.prepare(`INSERT INTO inc.sync_objects VALUES (?, 'node-1', ?, ?,
    ?, NULL)`).run(type, incomingHash, JSON.stringify(payload), incomingTime);
  db.prepare('INSERT INTO node_review VALUES (?, ?, ?)')
    .run('node-1', '2026-05-01T00:00:00Z', 2);
  db.prepare('INSERT INTO node_reading VALUES (?, ?, ?)')
    .run('node-1', '2026-05-01T00:00:00Z', 2);
  return db;
}

function readState(db: Database.Database, type: string) {
  return db.prepare('SELECT content_hash, state_seq FROM sync_object_state WHERE object_type = ?')
    .get(type);
}
