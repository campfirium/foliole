// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { CURRENT_PARENT_ORDER_SCHEMA, PARENT_ORDER_PAYLOAD_SQL } from '../../lib/core/database/currentParentOrderSchema.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { PARENT_CHILD_ORDER_SCHEMA_SQL } from '../../lib/core/database/numberedMigrationParentChildOrder.js';
import { readParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { PARENT_CHILD_ORDER_MEMBER_SCHEMA } from '../../lib/core/database/parentChildOrderMembers.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash } from '../../lib/core/sync/currentParentOrder.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const now = '2026-11-16T00:00:00.000Z';
const config = { expectedHostName: 'fixture', now };
const retired = (db: Database.Database) => db.prepare(`SELECT name FROM sqlite_master WHERE name IN
  ('parent_child_order', 'parent_child_order_members', 'parent_order_projection_pending')
  OR name GLOB 'trg_parent_order_node_*' ORDER BY name`).pluck().all();

function seedPreviousVersion(db: Database.Database, version: number) {
  for (const sql of [PARENT_CHILD_ORDER_SCHEMA_SQL, ...PARENT_CHILD_ORDER_MEMBER_SCHEMA, ...CURRENT_PARENT_ORDER_SCHEMA]) db.exec(sql);
  db.exec(`INSERT INTO nodes (id, parent_id, title, created_at, updated_at) VALUES
    ('folder', NULL, 'Folder', '${now}', '${now}'), ('a', 'folder', 'A', '${now}', '${now}'),
    ('b', 'folder', 'B', '${now}', '${now}');
    INSERT INTO parent_child_order VALUES ('folder', '["a","b"]', '${now}');`);
  const source = { authorId: 'writer', counter: 7, childIds: ['b', 'late', 'a'] };
  db.prepare('INSERT INTO parent_order_sources VALUES (?, ?, ?, ?)').run('folder', source.authorId, source.counter, JSON.stringify(source.childIds));
  upsertSyncObjectState(createBetterSqlite3Driver(db), { objectType: 'parent_child_order', objectId: 'folder',
    contentHash: currentParentOrderHash('folder', [source]), lastModifiedByHostName: 'fixture', updatedAt: now });
  db.pragma(`user_version = ${version}`);
}

function evidence(db: Database.Database) {
  return { sources: db.prepare('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id').all(),
    payload: db.prepare(PARENT_ORDER_PAYLOAD_SQL).pluck().get('folder'),
    order: readParentChildOrder(createBetterSqlite3Driver(db), 'folder').childIds };
}

it.each(['desktop', 'companion'] as const)('retires stale projection storage atomically and preserves live order on %s', async host => {
  const artifacts = path.resolve('.tmp/artifacts/T742-11');
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(path.join(artifacts, 'upgrade-'));
  const file = path.join(root, 'library.db');
  let db = new Database(file);
  try {
    const initialize = async (allowCreate: boolean, beforeVersionCommit?: () => void) => {
      const options = beforeVersionCommit ? { beforeVersionCommit } : {};
      if (host === 'desktop') initializeDatabaseSchema(db, options);
      else await bootstrapCompanionDatabase(createBetterSqliteDbPort(db), { ...config, allowCreate, ...options });
    };
    await initialize(true);
    expect(retired(db)).toEqual([]);
    const currentVersion = host === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION;
    seedPreviousVersion(db, currentVersion - 1);
    const before = evidence(db);
    expect(before.order).toEqual(['b', 'a']);
    const originalSchema = retired(db);
    expect(originalSchema).toHaveLength(6);
    await expect(initialize(false, () => { throw new Error('interrupted upgrade'); })).rejects.toThrow('interrupted upgrade');
    expect(db.pragma('user_version', { simple: true })).toBe(currentVersion - 1);
    expect(retired(db)).toEqual(originalSchema);
    expect(evidence(db)).toEqual(before);
    await initialize(false);
    db.close();
    db = new Database(file);
    await initialize(false);
    expect(db.pragma('user_version', { simple: true })).toBe(currentVersion);
    expect(retired(db)).toEqual([]);
    expect(evidence(db)).toEqual(before);
    db.prepare("INSERT INTO nodes (id,parent_id,title,created_at,updated_at) VALUES ('late','folder','Late',?,?)").run(now, now);
    expect(evidence(db)).toEqual({ ...before, order: ['b', 'late', 'a'] });
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
