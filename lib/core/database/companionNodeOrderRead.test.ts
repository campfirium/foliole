// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { COMPANION_CURRENT_SCHEMA_REPAIRS } from './companionCurrentSchemaRepairs.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

let db: Database.Database;
let orderReads = 0;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const column = db.prepare('SELECT name FROM pragma_table_info(?) WHERE name = ? LIMIT 1');
  for (const repair of COMPANION_CURRENT_SCHEMA_REPAIRS) {
    if (!column.get(repair.tableName, repair.columnName)) db.exec(repair.statement);
  }
  db.function('observe_parent_order', (value: string) => { orderReads += 1; return value; });
  orderReads = 0;
});
afterEach(() => { db.close(); });

function node(id: string, parent: string | null, deleted = false) {
  db.prepare('INSERT INTO nodes (id, parent_id, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, parent, id, '2026-01-01', '2026-01-01', deleted ? '2026-01-02' : null);
}

function order(parent: string, ids: string[]) {
  db.prepare('INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)')
    .run(parent, JSON.stringify(ids), '2026-01-01');
}

function readOrder() {
  return db.prepare(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceOrderedNodeIds.sql)
    .all().map(row => (row as { id: string }).id);
}

it('preserves explicit sibling order, unlisted children, nested folders and deleted-ancestor visibility', () => {
  node('root', null); node('other-root', null);
  node('a', 'root'); node('b', 'root'); node('c', 'root'); node('nested', 'b');
  node('deleted', 'root', true); node('hidden-child', 'deleted');
  order('parent-child-order:root', ['root', 'other-root']);
  order('root', ['b', 'missing', 'a', 'deleted']);
  expect(readOrder()).toEqual(['root', 'b', 'nested', 'a', 'c', 'other-root']);
});

it('reads each parent order once instead of once per sibling in a wide directory', () => {
  node('root', null);
  const children = Array.from({ length: 1000 }, (_, i) => `child-${String(i).padStart(4, '0')}`);
  db.transaction(() => { for (const id of children) node(id, 'root'); })();
  order('root', [...children].reverse());
  db.exec(`ALTER TABLE parent_child_order RENAME TO stored_parent_child_order;
    CREATE VIEW parent_child_order AS SELECT parent_id,
      observe_parent_order(child_ids_json) AS child_ids_json, updated_at FROM stored_parent_child_order`);
  expect(readOrder()).toEqual(['root', ...[...children].reverse()]);
  expect(orderReads).toBeLessThanOrEqual(2);
});
