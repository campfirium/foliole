// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { handleParentOrderCommand } from './storageParentOrderCommands.js';

let sqlite: Database.Database;
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ sqlite, driver: createBetterSqlite3Driver(sqlite) })
}));
vi.mock('../database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: () => 'Mac' }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

beforeEach(() => { sqlite = new Database(':memory:'); initializeDatabaseSchema(sqlite); });
afterEach(() => sqlite.close());

function seed(parentId: string) {
  const nodeParent = parentId === ROOT_CHILD_ORDER_ID ? null : parentId;
  for (const id of nodeParent ? [nodeParent, 'elsewhere'] : ['elsewhere']) {
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES (?, 'folder', ?, 'now', 'now')`).run(id, id);
  }
  for (const id of ['a', 'b', 'c', 'gone', 'moved']) {
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, parent_id, deleted_at, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, ?, 'now', 'now')`).run(id, id,
    id === 'moved' ? 'elsewhere' : nodeParent, id === 'gone' ? 'now' : null);
  }
  sqlite.prepare(`INSERT INTO parent_child_order VALUES (?, ?, 'now')`)
    .run(parentId, JSON.stringify(parentId === ROOT_CHILD_ORDER_ID ? ['a', 'c', 'b', 'elsewhere'] : ['a', 'c', 'b']));
  sqlite.prepare(`INSERT INTO parent_order_versions VALUES (?, ?, 'user', ?, '[]', ?)`)
    .run('saved', parentId, JSON.stringify(['b', 'gone', 'a', 'moved']), '2026-10-04T00:00:00Z');
}

it.each([ROOT_CHILD_ORDER_ID, 'folder'])('reads and restores the saved arrangement for %s', async (parentId) => {
  seed(parentId);
  await expect(handleParentOrderCommand(NATIVE_COMMANDS.readParentOrderHistory,
    { parentId, limit: 1 }, null)).resolves.toMatchObject({ versions: [
    { versionId: 'saved', order: ['b', 'gone', 'a', 'moved'], kind: 'user' }
  ], nextAfter: null });
  await expect(handleParentOrderCommand(NATIVE_COMMANDS.restoreParentOrderSnapshot,
    { parentId, versionId: 'saved' }, null)).resolves.toEqual({ changed: true });
  expect(sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(parentId)).toEqual({ child_ids_json: JSON.stringify(parentId === ROOT_CHILD_ORDER_ID ? ['b', 'elsewhere', 'a', 'c'] : ['b', 'a', 'c']) });
  const head = sqlite.prepare(`SELECT version_id, kind FROM parent_order_versions
    WHERE version_id = (SELECT version_id FROM parent_order_heads WHERE parent_id = ?)`).get(parentId);
  expect(head).toMatchObject({ kind: 'user' });
  expect(head).not.toMatchObject({ version_id: 'saved' });
  expect(sqlite.prepare('SELECT parent_id, deleted_at FROM nodes WHERE id = ?').get('gone'))
    .toMatchObject({ deleted_at: 'now' });
  expect(sqlite.prepare('SELECT parent_id FROM nodes WHERE id = ?').get('moved'))
    .toEqual({ parent_id: 'elsewhere' });
});

it('rejects invalid page bounds and a snapshot from another parent without changing the order', async () => {
  seed(ROOT_CHILD_ORDER_ID);
  await expect(handleParentOrderCommand(NATIVE_COMMANDS.readParentOrderHistory,
    { parentId: ROOT_CHILD_ORDER_ID, limit: 129 }, null)).rejects.toThrow();
  await expect(handleParentOrderCommand(NATIVE_COMMANDS.restoreParentOrderSnapshot,
    { parentId: 'other', versionId: 'saved' }, null)).rejects.toThrow('sync_parent_order_snapshot_missing');
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM parent_order_versions').get()).toEqual({ count: 1 });
});
