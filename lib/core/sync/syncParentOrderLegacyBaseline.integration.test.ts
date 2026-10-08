import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../database/nodeVersionRetentionSchemaStatements.js';
import { migrateParentOrderVersions } from '../database/parentOrderVersionMigration.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../database/syncGroupSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';
import { computeSyncContentHash } from '../database/syncState.js';

import { stageSyncIdentityParentOrderRecordMerge } from './syncIdentityParentOrderApply.js';
import { parentOrderFactPayload, parseParentOrderFact } from './syncParentOrderFact.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';

function legacyLibrary(order: string[]) {
  const sqlite = new Database(':memory:');
  for (const statement of [...SYNC_SCHEMA_STATEMENTS, ...SYNC_GROUP_SCHEMA_STATEMENTS,
    ...NODE_VERSION_RETENTION_SCHEMA_STATEMENTS]) sqlite.exec(statement);
  sqlite.exec(`CREATE TABLE parent_child_order (parent_id TEXT PRIMARY KEY,
    child_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE nodes (id TEXT, title TEXT, parent_id TEXT, deleted_at TEXT);
    INSERT INTO nodes VALUES ('a', 'A', 'folder', NULL), ('b', 'B', 'folder', NULL)`);
  const payload = { parent_id: 'folder', child_ids_json: JSON.stringify(order) };
  sqlite.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)')
    .run('folder', payload.child_ids_json, 'legacy-time');
  sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, content_hash,
    updated_at, sync_dirty, state_seq, last_modified_by_host_name)
    VALUES ('parent_child_order', 'folder', ?, 'legacy-time', 0,
      (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1), 'local')`)
    .run(computeSyncContentHash('parent_child_order', payload));
  migrateParentOrderVersions(sqlite);
  return { sqlite, payload, port: createBetterSqliteDbPort(sqlite) };
}

function snapshot(sqlite: Database.Database) {
  return {
    order: sqlite.prepare('SELECT * FROM parent_child_order').all(),
    head: sqlite.prepare('SELECT * FROM parent_order_heads').all(),
    states: sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all(),
    versions: sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all()
  };
}

async function receiveLegacyOrder(local: ReturnType<typeof legacyLibrary>,
  remote: ReturnType<typeof legacyLibrary>) {
  const fact = remote.sqlite.prepare(`SELECT * FROM sync_object_state
    WHERE object_type = 'order_version'`).get() as {
      object_type: string; object_id: string; content_hash: string;
      payload_json: string; updated_at: string; deleted_at: null;
    };
  const version = parseParentOrderFact(remote.sqlite.prepare('SELECT * FROM parent_order_versions').get());
  await applyParentOrderFactObject(local.port, { ...fact,
    payload_json: JSON.stringify(parentOrderFactPayload(version.parentId,
      version.version, version.createdAt)) });
  const state = remote.sqlite.prepare(`SELECT * FROM sync_object_state
    WHERE object_type = 'parent_child_order'`).get() as {
      content_hash: string; current_version_id: string; deleted_at: null;
    };
  const before = snapshot(local.sqlite);
  const merge = () => local.port.transaction((tx) =>
    stageSyncIdentityParentOrderRecordMerge(tx, { ...state, parent_id: 'folder',
      payload_json: JSON.stringify(remote.payload) }));
  return { before, merge };
}

it('rejects unrelated migrated roots without inventing ancestry or replacing the local order', async () => {
  const local = legacyLibrary(['a', 'b']);
  const remote = legacyLibrary(['a']);
  try {
    const { before, merge } = await receiveLegacyOrder(local, remote);
    await expect(merge()).rejects.toThrow('sync_parent_order_common_base_missing');
    expect(snapshot(local.sqlite)).toEqual(before);
    expect(before.versions).toHaveLength(2);
  } finally {
    local.sqlite.close();
    remote.sqlite.close();
  }
});

it('accepts the same legacy baseline through the same migration and receive paths', async () => {
  const local = legacyLibrary(['a', 'b']);
  const remote = legacyLibrary(['a', 'b']);
  try {
    const { before, merge } = await receiveLegacyOrder(local, remote);
    await expect(merge()).resolves.toMatchObject({ childIdsJson: '["a","b"]',
      version: { kind: 'baseline', order: ['a', 'b'], parentVersionIds: [] } });
    expect(snapshot(local.sqlite)).toEqual(before);
    expect(before.versions).toHaveLength(1);
  } finally {
    local.sqlite.close();
    remote.sqlite.close();
  }
});
