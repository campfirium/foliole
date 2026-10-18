// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const timestamp = '2026-10-16T02:00:00.000Z';
const nodeId = 'child-owner';
const records = (): NativeSyncObjectRecord[] => [
  record('node_open_state', nodeId, { node_id: nodeId, last_opened_at: timestamp }),
  record('node_review', nodeId, { node_id: nodeId, reps: 3, last_review_at: timestamp }),
  record('node_reading', nodeId, { node_id: nodeId, state: 'active', repetition_count: 2, last_handled_at: timestamp }),
  record('topic_daily_count', `2026-10-16:${nodeId}`, { day_key: '2026-10-16', node_id: nodeId }),
  record('import_source', 'source', { latest_node_id: nodeId, source_fingerprint: 'source' }),
  record('node_text_alternative', 'alternative', { node_id: nodeId, alternative_id: 'alternative',
    body_text: 'Retained alternative', source_version_id: 'source-version', status: 'available' }),
  order(nodeId), order(ROOT_CHILD_ORDER_ID)
];

function record(object_type: NativeSyncObjectRecord['object_type'], object_id: string,
  payload: Record<string, unknown>): NativeSyncObjectRecord {
  const payload_json = JSON.stringify(payload);
  return { object_type, object_id, payload_json, content_hash: hashText(payload_json),
    updated_at: timestamp, deleted_at: null };
}

function order(parentId: string): NativeSyncObjectRecord {
  const sources = [{ authorId: 'writer', counter: 1, childIds: ['child-a', 'child-b'] }];
  return { ...record('parent_child_order', parentId, currentParentOrderPayload(parentId, sources)),
    content_hash: currentParentOrderHash(parentId, sources) };
}

async function withDb<T>(path: string, work: (db: DbPort, sqlite: Database.Database) => Promise<T>) {
  const sqlite = new Database(path);
  try { return await work(createBetterSqliteDbPort(sqlite), sqlite); }
  finally { sqlite.close(); }
}

it('transfers every child with its node, preserves concurrent text, and relays child deletions over HTTP', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const { left, right, leftSnapshot: a, rightSnapshot: b } = fixture;
  const round = () => left.invoke('round', { input: { kind: 'request_reconcile', peerOrigin: b.origin,
    peer: { deviceId: b.deviceId, libraryEpoch: `${b.deviceId}-epoch` } } });
  try {
    await left.seed({ nodeId, content: 'Original', title: 'Owner' });
    for (const child of ['child-a', 'child-b']) await left.seed({ nodeId: child, parentNodeId: nodeId, content: child, title: child });
    await withDb(a.databasePath, async db => {
      for (const state of records()) await applySyncObjectInTransaction(db, state);
      await assertGrouped(db);
    });
    expect(await round()).toMatchObject({ complete: true });
    await withDb(b.databasePath, async (db, sqlite) => {
      await assertGrouped(db);
      expect(sqlite.prepare('SELECT reps FROM node_review WHERE node_id = ?').get(nodeId)).toEqual({ reps: 3 });
      expect(sqlite.prepare('SELECT body_text FROM node_text_alternatives WHERE alternative_id = ?').get('alternative'))
        .toEqual({ body_text: 'Retained alternative' });
    });
    await concurrentChanges(fixture, round);
    await withDb(b.databasePath, async db => {
      for (const state of records().filter(state => !['topic_daily_count', 'parent_child_order'].includes(state.object_type))) {
        await applySyncObjectInTransaction(db, { ...state, content_hash: 'd'.repeat(64),
          updated_at: '2026-10-16T04:00:00.000Z', deleted_at: '2026-10-16T04:00:00.000Z', payload_json: null });
      }
    });
    expect(await round()).toMatchObject({ complete: true });
    for (const device of [a, b]) await withDb(device.databasePath, async (db, sqlite) => {
      expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('Concurrent body');
      expect(sqlite.prepare('SELECT * FROM node_open_state WHERE node_id = ?').get(nodeId)).toBeUndefined();
      expect(sqlite.prepare('SELECT * FROM import_sources WHERE source_fingerprint = ?').get('source')).toBeUndefined();
      const entries = await readFramedSyncInventory(db);
      expect(entries.filter(entry => ['node_open_state', 'node_reading', 'node_review', 'import_source',
        'node_text_alternative'].includes(entry.objectType))).toEqual([]);
    });
    const third = await fixture.startThird();
    try {
      expect(await third.process.invoke('round', { input: { kind: 'request_reconcile', peerOrigin: a.origin,
        peer: { deviceId: a.deviceId, libraryEpoch: `${a.deviceId}-epoch` } } })).toMatchObject({ complete: true });
      await withDb(third.snapshot.databasePath, async (db, sqlite) => {
        expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('Concurrent body');
        expect(sqlite.prepare("SELECT node_id FROM sync_node_child_owners WHERE object_type = 'import_source'").pluck().get())
          .toBe(nodeId);
        expect((await readFramedSyncInventory(db)).find(entry => entry.objectType === 'import_source')).toBeUndefined();
      });
    } finally { await third.process.close(); }
  } finally {
    await Promise.allSettled([left.close(), right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

async function assertGrouped(db: DbPort) {
  expect(await db.query('SELECT * FROM sync_node_child_owners ORDER BY object_type')).toEqual([
    {object_type: 'import_source', object_id: 'source', node_id: nodeId},
    {object_type: 'node_text_alternative', object_id: 'alternative', node_id: nodeId}
  ]);
  const entries = await readFramedSyncInventory(db);
  const owner = entries.find(entry => entry.objectType === 'node' && entry.globalId === nodeId);
  expect(owner?.stateFactIds?.map(id => JSON.parse(id)[0]).sort()).toEqual(
    ['import_source', 'node_open_state', 'node_reading', 'node_review', 'node_text_alternative', 'parent_child_order', 'topic_daily_count']);
  expect(entries.filter(entry => records().some(state => state.object_type === entry.objectType)))
    .toEqual([expect.objectContaining({ objectType: 'parent_child_order', globalId: ROOT_CHILD_ORDER_ID })]);
}

async function concurrentChanges(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>,
  round: () => Promise<unknown>) {
  const { left, leftSnapshot: a, rightSnapshot: b } = fixture;
  const baseVersionId = await withDb(a.databasePath, async (_db, sqlite) =>
    sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(nodeId));
  await left.invoke('local_content_edit', { nodeId, baseVersionId, versionId: 'concurrent-text',
    content: 'Concurrent body', hostName: 'writer', updatedAt: '2026-10-16T03:00:00.000Z' });
  await withDb(b.databasePath, async db => {
    const updates = [
      record('node_open_state', nodeId, { node_id: nodeId, last_opened_at: '2026-10-16T03:00:00.000Z' }),
      record('node_review', nodeId, { node_id: nodeId, reps: 4, last_review_at: '2026-10-16T03:00:00.000Z' }),
      record('node_reading', nodeId, { node_id: nodeId, state: 'done', repetition_count: 3,
        last_handled_at: '2026-10-16T03:00:00.000Z' }),
      record('import_source', 'source', { latest_node_id: nodeId, source_name: 'Reimported' })
    ];
    const sources = [{ authorId: 'other-writer', counter: 2, childIds: ['child-b', 'child-a'] }];
    updates.push({ ...record('parent_child_order', nodeId, currentParentOrderPayload(nodeId, sources)),
      content_hash: currentParentOrderHash(nodeId, sources) });
    for (const state of updates) await applySyncObjectInTransaction(db,
      { ...state, updated_at: '2026-10-16T03:00:00.000Z' });
  });
  expect(await round()).toMatchObject({ complete: true });
  for (const device of [a, b]) await withDb(device.databasePath, async (_db, sqlite) => {
    expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('Concurrent body');
    expect(sqlite.prepare('SELECT reps FROM node_review WHERE node_id = ?').pluck().get(nodeId)).toBe(4);
    expect(sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(nodeId))
      .toBe(JSON.stringify(['child-b', 'child-a']));
    expect(sqlite.prepare("SELECT count(*) FROM parent_order_sources WHERE parent_id = ? AND author_id IN ('writer', 'other-writer')").pluck().get(nodeId)).toBe(2);
    expect(sqlite.prepare('SELECT state FROM node_reading WHERE node_id = ?').pluck().get(nodeId)).toBe('done');
    expect(sqlite.prepare('SELECT last_opened_at FROM node_open_state WHERE node_id = ?').pluck().get(nodeId))
      .toBe('2026-10-16T03:00:00.000Z');
    expect(sqlite.prepare('SELECT source_name FROM import_sources WHERE source_fingerprint = ?').pluck().get('source'))
      .toBe('Reimported');
  });
}
