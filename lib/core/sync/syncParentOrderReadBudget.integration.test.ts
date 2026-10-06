// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { ZodError } from 'zod';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';
import { computeSyncContentHash } from '../database/syncState.js';

import type { DbParams, DbPort, DbRow } from './dbPort.js';
import { stageSyncIdentityParentOrderRecordMerge } from './syncIdentityParentOrderApply.js';
import { resolveParentOrderHeads } from './syncParentOrderResolve.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { insertParentOrderVersion, PARENT_ORDER_VERSION_SCHEMA } from './syncParentOrderVersionStore.js';

function boundedReads(db: DbPort): DbPort {
  return {
    run: (sql, params) => db.run(sql, params),
    async query<T extends DbRow>(sql: string, params: DbParams = []) {
      const rows = await db.query<T>(sql, params);
      const bytes = rows.reduce((total, row) => total + Object.values(row).reduce<number>((size, value) =>
        size + (typeof value === 'string' ? Buffer.byteLength(value) : 0), 0), 0);
      if (bytes > 64 * 1024) throw new Error('parent_order_body_read_budget_exceeded');
      return rows;
    },
    transaction: (execute) => db.transaction((tx) => execute(boundedReads(tx)))
  };
}

async function fixture() {
  const sqlite = new Database(':memory:');
  for (const sql of [...SYNC_SCHEMA_STATEMENTS, ...PARENT_ORDER_VERSION_SCHEMA]) sqlite.exec(sql);
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, parent_id TEXT, deleted_at TEXT);
    CREATE TABLE parent_child_order (parent_id TEXT PRIMARY KEY, child_ids_json TEXT, updated_at TEXT)`);
  const db = createBetterSqliteDbPort(sqlite);
  const ids = Array.from({ length: 240 }, (_, index) => `child-${String(index).padStart(5, '0')}`);
  for (const id of ids) sqlite.prepare("INSERT INTO nodes VALUES (?, ?, 'folder', NULL)").run(id, id);
  const versions: ParentOrderVersion[] = [{ versionId: 'base', kind: 'baseline', order: [], parentVersionIds: [] }];
  for (let index = 1; index <= ids.length; index += 1) versions.push({ versionId: `member-${index}`,
    kind: 'membership', order: ids.slice(0, index), parentVersionIds: [versions.at(-1)!.versionId] });
  for (const version of versions) await insertParentOrderVersion(db, 'folder', version, '2026-10-07');
  return { sqlite, db, ids, versions };
}

function incomingOrder(sqlite: Database.Database, version: ParentOrderVersion, local: ParentOrderVersion) {
  const payload = (order: readonly string[]) => ({ parent_id: 'folder', child_ids_json: JSON.stringify(order) });
  sqlite.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)').run('folder', JSON.stringify(local.order), 'now');
  sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
    content_hash, updated_at, current_version_id, sync_dirty, last_modified_by_host_name)
    VALUES ('parent_child_order', 'folder',
      (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1), ?, 'now', ?, 0, 'local')`)
    .run(computeSyncContentHash('parent_child_order', payload(local.order)), local.versionId);
  return { parent_id: 'folder', payload_json: JSON.stringify(payload(version.order)), deleted_at: null,
    content_hash: computeSyncContentHash('parent_child_order', payload(version.order)), current_version_id: version.versionId };
}

function history(sqlite: Database.Database) {
  return sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all();
}

it('resolves a long membership chain without loading its complete snapshot collection', async () => {
  const f = await fixture();
  try {
    const head = f.versions.at(-1)!;
    const record = incomingOrder(f.sqlite, head, head);
    const before = history(f.sqlite);
    const expected = resolveParentOrderHeads({ versions: f.versions, headIds: [head.versionId],
      members: new Set(f.ids), compareAdded: (a, b) => a.localeCompare(b) });
    const result = await stageSyncIdentityParentOrderRecordMerge(boundedReads(f.db), record);
    expect(result).toMatchObject({ childIdsJson: JSON.stringify(expected.order), version: expected.version });
    expect(result?.version).toEqual(head);
    expect(history(f.sqlite)).toEqual(before);
  } finally { f.sqlite.close(); }
});

it('preserves superseded user facts and automatic merge ancestry while reading membership history incrementally', async () => {
  const f = await fixture();
  try {
    const head = f.versions.at(-1)!;
    const left: ParentOrderVersion = { versionId: 'user-a', kind: 'user',
      order: [f.ids[1]!, f.ids[0]!, ...f.ids.slice(2)], parentVersionIds: [head.versionId] };
    const right: ParentOrderVersion = { versionId: 'user-b', kind: 'user',
      order: [f.ids[2]!, f.ids[0]!, f.ids[1]!, ...f.ids.slice(3)], parentVersionIds: [head.versionId] };
    const merged: ParentOrderVersion = { versionId: 'merged-ab', kind: 'merge', order: left.order,
      parentVersionIds: [left.versionId, right.versionId] };
    const later: ParentOrderVersion = { versionId: 'user-z', kind: 'user', order: right.order,
      parentVersionIds: [merged.versionId] };
    for (const version of [left, right, merged, later]) {
      f.versions.push(version);
      await insertParentOrderVersion(f.db, 'folder', version, '2026-10-07');
    }
    const record = incomingOrder(f.sqlite, later, merged);
    const before = history(f.sqlite);
    const expected = resolveParentOrderHeads({ versions: f.versions,
      headIds: [merged.versionId, later.versionId], members: new Set(f.ids), compareAdded: (a, b) => a.localeCompare(b) });
    const result = await stageSyncIdentityParentOrderRecordMerge(boundedReads(f.db), record);
    expect(result).toMatchObject({ childIdsJson: JSON.stringify(expected.order), version: expected.version });
    expect(result?.version).toEqual(later);
    expect(history(f.sqlite)).toEqual(before);
  } finally { f.sqlite.close(); }
});

it('still rejects a malformed intermediate snapshot that does not contribute to the selected order', async () => {
  const f = await fixture();
  try {
    const head = f.versions.at(-1)!;
    const record = incomingOrder(f.sqlite, head, head);
    f.sqlite.prepare("UPDATE parent_order_versions SET child_ids_json = '[\"duplicate\",\"duplicate\"]' WHERE version_id = 'member-5'").run();
    const before = history(f.sqlite);
    await expect(stageSyncIdentityParentOrderRecordMerge(boundedReads(f.db), record))
      .rejects.toBeInstanceOf(ZodError);
    expect(history(f.sqlite)).toEqual(before);
  } finally { f.sqlite.close(); }
});

it('reports an absent incoming head before lineage resolution and preserves persisted state', async () => {
  const f = await fixture();
  try {
    const head = f.versions.at(-1)!;
    const record = incomingOrder(f.sqlite, { ...head, versionId: 'missing' }, head);
    const before = history(f.sqlite);
    await expect(stageSyncIdentityParentOrderRecordMerge(boundedReads(f.db), record))
      .rejects.toThrow('sync_parent_order_head_unproven');
    expect(history(f.sqlite)).toEqual(before);
    expect(f.sqlite.prepare('SELECT child_ids_json FROM parent_child_order').get())
      .toEqual({ child_ids_json: JSON.stringify(head.order) });
  } finally { f.sqlite.close(); }
});

it('validates unused snapshots before rejecting independent roots without a real common base', async () => {
  const f = await fixture();
  try {
    const head = f.versions.at(-1)!;
    const independent: ParentOrderVersion = { versionId: 'independent', kind: 'baseline',
      order: head.order, parentVersionIds: [] };
    await insertParentOrderVersion(f.db, 'folder', independent, '2026-10-07');
    const record = incomingOrder(f.sqlite, independent, head);
    f.sqlite.prepare("UPDATE parent_order_versions SET child_ids_json = '[\"duplicate\",\"duplicate\"]' WHERE version_id = 'member-5'").run();
    const before = history(f.sqlite);
    await expect(stageSyncIdentityParentOrderRecordMerge(boundedReads(f.db), record))
      .rejects.toBeInstanceOf(ZodError);
    expect(history(f.sqlite)).toEqual(before);
  } finally { f.sqlite.close(); }
});
