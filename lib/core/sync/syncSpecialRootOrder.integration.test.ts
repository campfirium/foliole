// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { bootstrapCompanionDatabase } from '../database/companionDatabaseLifecycle.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../database/specialNodeIds.js';
import { computeSyncContentHash } from '../database/syncState.js';

import { applyFramedSyncObjectStateRecord } from './framedSyncObjectStateFact.js';
import { stageSyncIdentityParentOrderRecordMerge } from './syncIdentityParentOrderApply.js';
import { parentOrderFactPayload } from './syncParentOrderFact.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';
import { parentOrderBaselineVersionId, PARENT_ORDER_BASELINE_TIME } from './syncParentOrderVersionStore.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-special-root-order-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'companion.db'));
  const db = createBetterSqliteDbPort(sqlite);
  await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'Companion', now: '2026-10-07' });
  return { db, sqlite };
}

async function receiveOrder(db: ReturnType<typeof createBetterSqliteDbPort>, ids: string[]) {
  const version = { versionId: parentOrderBaselineVersionId(ROOT_CHILD_ORDER_ID, ids),
    kind: 'baseline' as const, order: ids, parentVersionIds: [] };
  const payload = parentOrderFactPayload(ROOT_CHILD_ORDER_ID, version, PARENT_ORDER_BASELINE_TIME);
  await db.transaction((tx) => applyParentOrderFactObject(tx, { object_type: 'order_version',
    object_id: version.versionId, payload_json: JSON.stringify(payload),
    content_hash: computeSyncContentHash('order_version', payload), deleted_at: null,
    updated_at: PARENT_ORDER_BASELINE_TIME }));
  const order = { child_ids_json: JSON.stringify(ids), parent_id: ROOT_CHILD_ORDER_ID };
  return { object_type: 'parent_child_order', object_id: ROOT_CHILD_ORDER_ID,
    content_hash: computeSyncContentHash('parent_child_order', order),
    payload_json: JSON.stringify(order), current_version_id: version.versionId,
    deleted_at: null, updated_at: PARENT_ORDER_BASELINE_TIME } satisfies Parameters<typeof applyFramedSyncObjectStateRecord>[1];
}

it('materializes a referenced special root while preserving the original order identity and hash', async () => {
  const { db, sqlite } = await fixture();
  try {
    const record = await receiveOrder(db, [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
    await db.transaction((tx) => applyFramedSyncObjectStateRecord(tx, record));
    expect(sqlite.prepare('SELECT kind, title, current_version_id FROM nodes WHERE id = ?')
      .get(VIRTUAL_ROOT_NODE_ID)).toEqual({ kind: 'folder', title: 'Virtual', current_version_id: null });
    expect(sqlite.prepare(`SELECT current_version_id, content_hash FROM sync_object_state
      WHERE object_type = 'parent_child_order' AND object_id = ?`).get(ROOT_CHILD_ORDER_ID))
      .toEqual({ current_version_id: record.current_version_id, content_hash: record.content_hash });
    expect(sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(0);
  } finally { sqlite.close(); }
});

it.each(['missing-ordinary', 'constructor', 'toString'])('rejects missing ordinary member %s and rolls back the special root', async (id) => {
  const { db, sqlite } = await fixture();
  try {
    const record = await receiveOrder(db, [VIRTUAL_ROOT_NODE_ID, id]);
    const before = sqlite.prepare('SELECT * FROM nodes').all();
    await expect(db.transaction((tx) => applyFramedSyncObjectStateRecord(tx, record)))
      .rejects.toThrow('sync_parent_order_member_missing');
    expect(sqlite.prepare('SELECT * FROM nodes').all()).toEqual(before);
    expect(sqlite.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
  } finally { sqlite.close(); }
});

it.each(['renamed', 'moved', 'deleted'])('does not overwrite an existing %s special root', async (state) => {
  const { db, sqlite } = await fixture();
  try {
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, parent_id, deleted_at, created_at, updated_at)
      VALUES (?, 'folder', 'Existing title', ?, ?, 'original', 'original')`).run(
      VIRTUAL_ROOT_NODE_ID, state === 'moved' ? INBOX_NODE_ID : null, state === 'deleted' ? 'original' : null
    );
    const before = sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get(VIRTUAL_ROOT_NODE_ID);
    const record = await receiveOrder(db, [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
    await db.transaction((tx) => applyFramedSyncObjectStateRecord(tx, record));
    expect(sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get(VIRTUAL_ROOT_NODE_ID)).toEqual(before);
  } finally { sqlite.close(); }
});

it('does not create an unreferenced special root', async () => {
  const { db, sqlite } = await fixture();
  try {
    const record = await receiveOrder(db, [INBOX_NODE_ID]);
    await db.transaction((tx) => applyFramedSyncObjectStateRecord(tx, record));
    expect(sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(VIRTUAL_ROOT_NODE_ID)).toBeUndefined();
  } finally { sqlite.close(); }
});

it('keeps missing common ancestry rejected and rolls back the new root', async () => {
  const { db, sqlite } = await fixture();
  try {
    const local = await receiveOrder(db, [INBOX_NODE_ID]);
    await db.transaction((tx) => applyFramedSyncObjectStateRecord(tx, local));
    const incoming = await receiveOrder(db, [VIRTUAL_ROOT_NODE_ID]);
    const before = sqlite.prepare('SELECT * FROM parent_child_order').all();
    await expect(db.transaction((tx) => stageSyncIdentityParentOrderRecordMerge(tx, {
      ...incoming, parent_id: incoming.object_id
    }))).rejects.toThrow('sync_parent_order_common_base_missing');
    expect(sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(VIRTUAL_ROOT_NODE_ID)).toBeUndefined();
    expect(sqlite.prepare('SELECT * FROM parent_child_order').all()).toEqual(before);
  } finally { sqlite.close(); }
});
