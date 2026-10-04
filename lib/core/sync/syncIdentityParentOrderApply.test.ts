import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';
import { computeSyncContentHash } from '../database/syncState.js';

import { persistSyncIdentityParentOrderMerges,
  stageSyncIdentityParentOrderMerges } from './syncIdentityParentOrderApply.js';
import { parentOrderFactStateStatement } from './syncParentOrderFact.js';
import { PARENT_ORDER_VERSION_SCHEMA, PARENT_ORDER_BASELINE_TIME,
  parentOrderBaselineVersionId } from './syncParentOrderVersionStore.js';


function putOrder(sqlite: Database.Database, schema: 'main' | 'inc', parentId: string,
  ids: string[]) {
  const childIdsJson = JSON.stringify(ids);
  const payload = { child_ids_json: childIdsJson, parent_id: parentId };
  const hash = computeSyncContentHash('parent_child_order', payload);
  sqlite.prepare(`INSERT INTO ${schema}.sync_object_state
    (object_type, object_id, content_hash, deleted_at, updated_at,
      sync_dirty, base_content_hash, state_seq, current_version_id, last_modified_by_host_name)
    VALUES ('parent_child_order', ?, ?, NULL, 'now', 0, NULL,
      (SELECT high_water + 1 FROM main.sync_state_sequence WHERE singleton_id = 1), ?, 'local')`)
    .run(parentId, hash, `${schema}-${parentId}`);
  sqlite.prepare(`INSERT INTO ${schema}.sync_objects
    (object_type, object_id, payload_json) VALUES ('parent_child_order', ?, ?)`)
    .run(parentId, JSON.stringify(payload));
  const baseId = parentOrderBaselineVersionId(parentId, []);
  const versions = [{ versionId: baseId, kind: 'baseline' as const, order: [],
    parentVersionIds: [] }, { versionId: `${schema}-${parentId}`, kind: 'membership' as const,
    order: ids, parentVersionIds: [baseId] }];
  for (const version of versions) {
    sqlite.prepare(`INSERT OR IGNORE INTO parent_order_versions VALUES (?, ?, ?, ?, ?, ?)`)
      .run(version.versionId, parentId, version.kind, JSON.stringify(version.order),
        JSON.stringify(version.parentVersionIds), PARENT_ORDER_BASELINE_TIME);
    const state = parentOrderFactStateStatement(parentId, version, PARENT_ORDER_BASELINE_TIME);
    sqlite.prepare(state.sql).run(...state.params);
  }
  if (schema === 'main') sqlite.prepare(`INSERT INTO parent_child_order
    (parent_id, child_ids_json, updated_at) VALUES (?, ?, 'now')`).run(parentId, childIdsJson);
}

function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.exec("ATTACH DATABASE ':memory:' AS inc");
  for (const statement of SYNC_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of PARENT_ORDER_VERSION_SCHEMA) sqlite.exec(statement);
  sqlite.exec(`CREATE TABLE inc.sync_object_state (object_type TEXT, object_id TEXT,
    content_hash TEXT, deleted_at TEXT, updated_at TEXT, sync_dirty INTEGER,
    base_content_hash TEXT, state_seq INTEGER, current_version_id TEXT,
    last_modified_by_host_name TEXT);
    CREATE TABLE inc.sync_objects (object_type TEXT, object_id TEXT, payload_json TEXT);
    CREATE TABLE main.sync_objects (object_type TEXT, object_id TEXT, payload_json TEXT);
    CREATE TABLE parent_child_order (parent_id TEXT PRIMARY KEY, child_ids_json TEXT,
      updated_at TEXT);
    CREATE TABLE nodes (id TEXT, title TEXT, parent_id TEXT, deleted_at TEXT);`);
  return sqlite;
}

it('stages root and nested parent additions without moving children to another parent', async () => {
  const sqlite = fixture();
  try {
    for (const [id, parentId] of [
      ['root-a', null], ['root-b', null], ['root-c', null],
      ['nested-a', 'folder'], ['nested-b', 'folder'], ['nested-c', 'folder'],
      ['moved', 'other']
    ] as const) sqlite.prepare(`INSERT INTO nodes VALUES (?, ?, ?, NULL)`)
      .run(id, id, parentId);
    putOrder(sqlite, 'main', ROOT_CHILD_ORDER_ID, ['root-a', 'root-b']);
    putOrder(sqlite, 'inc', ROOT_CHILD_ORDER_ID, ['root-a', 'root-c']);
    putOrder(sqlite, 'main', 'folder', ['nested-a', 'nested-b', 'moved']);
    putOrder(sqlite, 'inc', 'folder', ['nested-a', 'nested-c', 'moved']);
    const port = createBetterSqliteDbPort(sqlite);
    const staged = await stageSyncIdentityParentOrderMerges(port);
    const byParent = new Map(staged.map((merge) => [merge.parentId, merge]));
    expect([...byParent.keys()]).toEqual(['folder', ROOT_CHILD_ORDER_ID]);
    expect(JSON.parse(byParent.get(ROOT_CHILD_ORDER_ID)!.childIdsJson))
      .toEqual(['root-a', 'root-b', 'root-c']);
    expect(JSON.parse(byParent.get('folder')!.childIdsJson))
      .toEqual(['nested-a', 'nested-b', 'nested-c']);
    await port.transaction((tx) => persistSyncIdentityParentOrderMerges(tx, staged, 'local'));
    const saved = sqlite.prepare(`SELECT entity.parent_id, entity.child_ids_json,
      state.content_hash, state.base_content_hash, state.sync_dirty, state.state_seq, state.current_version_id
      FROM parent_child_order entity JOIN sync_object_state state
        ON state.object_type = 'parent_child_order' AND state.object_id = entity.parent_id
      ORDER BY entity.parent_id`).all() as Array<{ parent_id: string;
        child_ids_json: string; content_hash: string; base_content_hash: string;
        sync_dirty: number; state_seq: number }>;
    expect(saved.map((row) => [row.parent_id, JSON.parse(row.child_ids_json)]))
      .toEqual([['folder', ['nested-a', 'nested-b', 'nested-c']],
        [ROOT_CHILD_ORDER_ID, ['root-a', 'root-b', 'root-c']]]);
    for (const row of saved) {
      expect(row.sync_dirty).toBe(1);
      expect(row.state_seq).toBeGreaterThan(1);
      expect(row.content_hash).toBe(computeSyncContentHash('parent_child_order', {
        parent_id: row.parent_id, child_ids_json: row.child_ids_json
      }));
      expect(row.base_content_hash).not.toBe(row.content_hash);
    }
  } finally { sqlite.close(); }
});

it('filters a permanently deleted member only when a deletion fact exists', async () => {
  const sqlite = fixture();
  try {
    sqlite.prepare(`INSERT INTO nodes VALUES ('live', 'Live', NULL, NULL)`).run();
    putOrder(sqlite, 'main', ROOT_CHILD_ORDER_ID, ['live', 'gone']);
    putOrder(sqlite, 'inc', ROOT_CHILD_ORDER_ID, ['gone', 'live']);
    const port = createBetterSqliteDbPort(sqlite);
    await expect(stageSyncIdentityParentOrderMerges(port))
      .rejects.toThrow('sync_parent_order_member_missing');
    sqlite.prepare(`INSERT INTO sync_object_state
      (object_type, object_id, content_hash, deleted_at, updated_at,
        sync_dirty, base_content_hash, state_seq, last_modified_by_host_name)
      VALUES ('node', 'gone', 'hash', 'deleted', 'deleted', 0, NULL,
        (SELECT high_water + 1 FROM main.sync_state_sequence WHERE singleton_id = 1), 'local')`).run();
    const staged = await stageSyncIdentityParentOrderMerges(port);
    expect(staged.map((merge) => JSON.parse(merge.childIdsJson))).toEqual([['live']]);
  } finally { sqlite.close(); }
});

it('drops a deleted ghost even when both received orders are byte-identical', async () => {
  const sqlite = fixture();
  try {
    sqlite.prepare(`INSERT INTO nodes VALUES ('live', 'Live', NULL, NULL)`).run();
    putOrder(sqlite, 'main', ROOT_CHILD_ORDER_ID, ['gone', 'live']);
    putOrder(sqlite, 'inc', ROOT_CHILD_ORDER_ID, ['gone', 'live']);
    sqlite.prepare(`INSERT INTO inc.sync_object_state
      (object_type, object_id, content_hash, deleted_at, updated_at,
        sync_dirty, base_content_hash, state_seq, last_modified_by_host_name)
      VALUES ('node', 'gone', 'hash', 'deleted', 'deleted', 0, NULL,
        (SELECT high_water + 1 FROM main.sync_state_sequence WHERE singleton_id = 1), 'local')`).run();
    const staged = await stageSyncIdentityParentOrderMerges(createBetterSqliteDbPort(sqlite));
    expect(staged.map((merge) => JSON.parse(merge.childIdsJson))).toEqual([['live']]);
  } finally { sqlite.close(); }
});
