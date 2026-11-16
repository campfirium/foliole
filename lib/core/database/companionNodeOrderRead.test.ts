// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { COMPANION_CURRENT_SCHEMA_REPAIRS } from './companionCurrentSchemaRepairs.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';
import { loadDerivedNodeOrderWithDbPort } from './parentChildOrder.js';

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
  db.prepare("INSERT INTO parent_order_sources VALUES (?, 'fixture', 1, ?)")
    .run(parent, JSON.stringify(ids));
}

function readOrder() {
  return loadDerivedNodeOrderWithDbPort(createBetterSqliteDbPort(db), undefined, true);
}

it('preserves explicit sibling order, unlisted children, nested folders and deleted-ancestor visibility', async () => {
  node('root', null); node('other-root', null);
  node('a', 'root'); node('b', 'root'); node('c', 'root'); node('nested', 'b');
  node('deleted', 'root', true); node('hidden-child', 'deleted');
  order('parent-child-order:root', ['root', 'other-root']);
  order('root', ['b', 'missing', 'a', 'deleted']);
  expect(await readOrder()).toEqual(['root', 'b', 'nested', 'a', 'c', 'other-root']);
});

it('reads each parent order once instead of once per sibling in a wide directory', async () => {
  node('root', null);
  const children = Array.from({ length: 1000 }, (_, i) => `child-${String(i).padStart(4, '0')}`);
  db.transaction(() => { for (const id of children) node(id, 'root'); })();
  order('root', [...children].reverse());
  db.exec(`ALTER TABLE parent_order_sources RENAME TO stored_parent_order_sources;
    CREATE VIEW parent_order_sources AS SELECT parent_id, author_id, counter,
      observe_parent_order(child_ids_json) AS child_ids_json FROM stored_parent_order_sources`);
  expect(await readOrder()).toEqual(['root', ...[...children].reverse()]);
  expect(orderReads).toBeLessThanOrEqual(2);
});


it('excludes missing parents and cycles while retaining literal sibling order and live roots', async () => {
  node('root', null); node('other-root', null);
  node('a', 'root'); node('b', 'root'); node('unlisted', 'root'); node('leaf', 'a');
  // Deliberately malformed parent links exercise the read boundary, not normal writes.
  db.pragma('foreign_keys = OFF');
  node('orphan', 'absent'); node('orphan-child', 'orphan');
  node('cycle-a', 'cycle-b'); node('cycle-b', 'cycle-a'); node('self', 'self');
  db.pragma('foreign_keys = ON');
  node('deleted', 'root', true); node('hidden', 'deleted'); node('hidden-leaf', 'hidden');
  node('deleted-root', null, true); node('hidden-root-child', 'deleted-root');
  order('parent-child-order:root', ['other-root', 'root', 'absent']);
  order('root', ['b', 'missing', 'a', 'deleted', 'other-root']);
  order('a', ['leaf']);
  expect(await readOrder()).toEqual(['other-root', 'root', 'b', 'a', 'leaf', 'unlisted']);
  db.prepare("UPDATE nodes SET deleted_at = NULL WHERE id = 'deleted'").run();
  expect(await readOrder()).toEqual(['other-root', 'root', 'b', 'a', 'leaf', 'deleted', 'hidden', 'hidden-leaf', 'unlisted']);
  db.prepare("UPDATE nodes SET parent_id = 'other-root' WHERE id = 'a'").run();
  expect(await readOrder()).toEqual(['other-root', 'a', 'leaf', 'root', 'b', 'deleted', 'hidden', 'hidden-leaf', 'unlisted']);
});
