import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';


import { advanceParentOrderHead, insertParentOrderVersion,
  PARENT_ORDER_VERSION_SCHEMA, readParentOrderVersion,
  readParentOrderVersionPage } from './syncParentOrderVersionStore.js';

it('stores immutable ancestry, the current head and loser snapshots', async () => {
  const sqlite = new Database(':memory:');
  for (const statement of SYNC_SCHEMA_STATEMENTS) sqlite.exec(statement);
  try {
    for (const statement of PARENT_ORDER_VERSION_SCHEMA) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const base = { versionId: 'base', kind: 'baseline' as const,
      order: ['a', 'b'], parentVersionIds: [] };
    const left = { versionId: 'left', kind: 'user' as const,
      order: ['b', 'a'], parentVersionIds: ['base'] };
    const right = { versionId: 'right', kind: 'user' as const,
      order: ['a', 'b'], parentVersionIds: ['base'] };
    expect(await insertParentOrderVersion(port, 'root', base, 'now')).toBe(true);
    expect(await insertParentOrderVersion(port, 'root', left, 'now')).toBe(true);
    expect(await insertParentOrderVersion(port, 'root', right, 'now')).toBe(true);
    expect(await insertParentOrderVersion(port, 'root', left, 'now')).toBe(false);
    await advanceParentOrderHead(port, 'root', 'left');
    expect(await readParentOrderVersion(port, 'right')).toMatchObject({ parentId: 'root',
      ...right });
    expect((await readParentOrderVersionPage(port, 'root', '', 2)).nextAfter).toBe('left');
    expect((await readParentOrderVersionPage(port, 'root', 'left', 2)).versions)
      .toEqual([{ parentId: 'root', createdAt: 'now', ...right }]);
    expect(sqlite.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?')
      .pluck().get('root')).toBe('left');
    await expect(insertParentOrderVersion(port, 'root', { ...left, order: ['a', 'b'] }, 'now'))
      .rejects.toThrow('sync_parent_order_fact_collision');
    await expect(insertParentOrderVersion(port, 'root', left, 'later'))
      .rejects.toThrow('sync_parent_order_fact_collision');
    await expect(insertParentOrderVersion(port, 'root', { ...left,
      versionId: 'orphan', parentVersionIds: ['missing'] }, 'now'))
      .rejects.toThrow('sync_parent_order_lineage_unproven');
    await expect(advanceParentOrderHead(port, 'other', 'left'))
      .rejects.toThrow('sync_parent_order_head_unproven');
  } finally { sqlite.close(); }
});

it('caps a version page by encoded bytes and refuses an oversized single snapshot', async () => {
  const sqlite = new Database(':memory:');
  for (const statement of SYNC_SCHEMA_STATEMENTS) sqlite.exec(statement);
  try {
    for (const statement of PARENT_ORDER_VERSION_SCHEMA) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const order = Array.from({ length: 120 }, (_, index) => `member-${index}-${'x'.repeat(100)}`);
    for (let index = 0; index < 8; index += 1) {
      await insertParentOrderVersion(port, 'root', { versionId: `v${index}`,
        kind: 'user', order, parentVersionIds: [] }, 'now');
    }
    const first = await readParentOrderVersionPage(port, 'root');
    expect(first.versions.length).toBeGreaterThan(0);
    expect(first.versions.length).toBeLessThan(8);
    expect(first.nextAfter).toBe(first.versions.at(-1)?.versionId);
    await insertParentOrderVersion(port, 'root', { versionId: 'z', kind: 'user',
      order: ['x'.repeat(65536)], parentVersionIds: [] }, 'now');
    await expect(readParentOrderVersionPage(port, 'root', 'v7'))
      .rejects.toThrow('sync_parent_order_page_item_too_large');
  } finally { sqlite.close(); }
});
