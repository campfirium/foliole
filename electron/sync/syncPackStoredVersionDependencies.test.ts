import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('accepts a parent omitted from the pack when the main database has its body', async () => {
  const db = createFixture('{"content":"parent body"}');
  try {
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'child', parent_version_id: 'parent' }]);
    expect(db.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
      .toEqual([{ version_id: 'child' }, { version_id: 'parent' }]);
  } finally {
    db.close();
  }
});

it('accepts an omitted parent identity whose stored body has been reclaimed', async () => {
  const db = createFixture('{"content":null}');
  try {
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?')
      .get('child')).toEqual({ parent_version_id: 'parent' });
    expect(db.prepare('SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?')
      .get('parent')).toEqual({ body_text: null, snapshot_json: '{"content":null}' });
  } finally {
    db.close();
  }
});

it('accepts a legacy parent pointer to a retained identity without its body', async () => {
  const db = createFixture('{"content":null}');
  try {
    db.exec('DELETE FROM inc.node_sync_version_parents');
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT parent_version_id FROM node_sync_versions WHERE version_id = ?')
      .get('child')).toEqual({ parent_version_id: 'parent' });
  } finally {
    db.close();
  }
});

it('preserves a historical parent gap without inventing its identity or body', async () => {
  const db = createFixture('{"content":null}');
  try {
    db.exec('DELETE FROM node_sync_versions');
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT version_id FROM node_sync_versions').all()).toEqual([{ version_id: 'child' }]);
    expect(db.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
      .toEqual([{ parent_version_id: 'parent' }]);
  } finally {
    db.close();
  }
});

it('still requires the body of an omitted current version', async () => {
  const db = createFixture('{"content":null}');
  try {
    db.exec(`DELETE FROM inc.node_sync_versions;
      DELETE FROM inc.node_sync_version_parents;
      UPDATE inc.nodes SET current_version_id = 'parent';`);
    await expect(applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db)))
      .rejects.toThrow('sync_pack_node_current_version_missing:node-1');
  } finally {
    db.close();
  }
});

it('rejects a conflicting parent relation for a known version', async () => {
  const db = createFixture('{"content":"parent body"}');
  try {
    db.exec(`
      INSERT INTO node_sync_versions VALUES
        ('other', 'node-1', NULL, 'host', '2026-05-01', 'other-hash', 'other body', '{}');
      INSERT INTO node_sync_versions VALUES
        ('child', 'node-1', 'parent', 'host', '2026-05-02', 'child-hash', 'child body', '{}');
      INSERT INTO node_sync_version_parents VALUES ('child', 'other', 0);
    `);
    await expect(applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db)))
      .rejects.toThrow('sync_pack_node_version_parent_mismatch:child');
  } finally {
    db.close();
  }
});

it('adds a missing parent relation without receiving the known child body again', async () => {
  const db = createFixture('{"content":"parent body"}');
  try {
    db.exec(`
      INSERT INTO node_sync_versions VALUES
        ('child', 'node-1', 'parent', 'host', '2026-05-02', 'child-hash', 'child body', '{}');
      DELETE FROM inc.node_sync_versions;
    `);
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'child', parent_version_id: 'parent', ordinal: 0 }]);
    expect(db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('child'))
      .toEqual({ body_text: 'child body' });
  } finally {
    db.close();
  }
});

it('restores a reclaimed historical version body when the source resends that fact', async () => {
  const db = createFixture('{"content":null}');
  try {
    db.exec(`
      INSERT INTO inc.node_sync_versions VALUES
        ('parent', 'node-1', NULL, 'host', '2026-05-01',
         'parent-hash', 'parent body', '{"content":"parent body"}');
      INSERT INTO nodes VALUES ('node-1', 'child');
    `);
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?')
      .get('parent')).toEqual({ body_text: 'parent body', snapshot_json: '{"content":"parent body"}' });
  } finally {
    db.close();
  }
});

it('adds an edge for a reclaimed historical child while preserving its empty body', async () => {
  const db = createFixture('{"content":null}');
  try {
    db.exec(`INSERT INTO node_sync_versions VALUES
      ('child', 'node-1', 'parent', 'host', '2026-05-02', 'child-hash', NULL, '{"content":null}');
      DELETE FROM inc.node_sync_versions;
      UPDATE inc.nodes SET current_version_id = NULL;`);
    await applySyncPackNodeVersionsWithDbPort(createBetterSqliteDbPort(db));
    expect(db.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?')
      .get('child')).toEqual({ parent_version_id: 'parent' });
    expect(db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
      .get('child')).toEqual({ body_text: null });
  } finally {
    db.close();
  }
});

function createFixture(parentSnapshot: string) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT, parent_version_id TEXT,
      host_name TEXT, created_at TEXT, content_hash TEXT, body_text TEXT, snapshot_json TEXT
    );
    CREATE TABLE node_sync_version_parents (
      version_id TEXT, parent_version_id TEXT, ordinal INTEGER,
      PRIMARY KEY (version_id, parent_version_id)
    );
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, version_id TEXT);
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT);
    ATTACH DATABASE ':memory:' AS inc;
    CREATE TABLE inc.node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT, parent_version_id TEXT,
      host_name TEXT, created_at TEXT, content_hash TEXT, body_text TEXT, snapshot_json TEXT
    );
    CREATE TABLE inc.node_sync_version_parents (
      version_id TEXT, parent_version_id TEXT, ordinal INTEGER
    );
    CREATE TABLE inc.nodes (id TEXT PRIMARY KEY, current_version_id TEXT);
    CREATE TABLE inc.node_sync_tombstones (node_id TEXT PRIMARY KEY, version_id TEXT);
  `);
  db.prepare(`INSERT INTO node_sync_versions VALUES
    ('parent', 'node-1', NULL, 'host', '2026-05-01', 'parent-hash', NULL, ?)`)
    .run(parentSnapshot);
  db.exec(`
    INSERT INTO inc.node_sync_versions VALUES
      ('child', 'node-1', 'parent', 'host', '2026-05-02', 'child-hash', 'child body', '{}');
    INSERT INTO inc.node_sync_version_parents VALUES ('child', 'parent', 0);
    INSERT INTO inc.nodes VALUES ('node-1', 'child');
  `);
  return db;
}
