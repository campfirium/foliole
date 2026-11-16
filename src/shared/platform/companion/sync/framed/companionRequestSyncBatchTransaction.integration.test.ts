// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../../../../electron/database/betterSqlite3Driver.js';
import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { readParentChildOrder } from '../../../../../../lib/core/database/parentChildOrder.js';
import type { DbParams, DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

const NODES = 60;
const PRUNE = /DELETE FROM node_reading_host_state\s+WHERE node_id NOT IN \(SELECT id FROM nodes\)/u;
const SHARED = [/INSERT INTO node_version_local_proof_state/u, /SELECT 1 FROM sync_group_devices peer JOIN sync_group_local_state/u];
let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

function counted(inner: DbPort, counts: { transactions: number; prunes: number; shared: number }): DbPort {
  const inside = (tx: DbPort): DbPort => ({
    run: (sql: string, params?: DbParams) => {
      if (PRUNE.test(sql)) counts.prunes += 1;
      if (SHARED.some(pattern => pattern.test(sql))) counts.shared += 1;
      return tx.run(sql, params);
    },
    query: (sql: string, params?: DbParams) => {
      if (SHARED.some(pattern => pattern.test(sql))) counts.shared += 1;
      return tx.query(sql, params) as never;
    },
    transaction: execute => tx.transaction(nested => execute(inside(nested)))
  });
  return { ...inside(inner), transaction: execute => { counts.transactions += 1; return inner.transaction(tx => execute(inside(tx))); } };
}

async function adopt(count = NODES) {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.invoke('seed_complete_inventory', { count, bodyBytes: 400 });
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  return host;
}

function receivedIds(adoption: NonNullable<typeof host>) {
  return readDesktopFramedSyncLibraryEvidence(adoption.fixture.leftSnapshot.databasePath).nodes
    .map(node => (node as { id: string }).id).filter(id => id.startsWith('t326-complete-'));
}

it('resumes a folder split over pulls without reading or writing a materialized order', async () => {
  const adoption = await adopt(NODES);
  const parentId = 't326-complete-00000';
  const readOrder = () => readParentChildOrder(createBetterSqlite3Driver(adoption.sqlite), parentId).childIds;
  const observed: string[] = [];
  const materialization = /SELECT id, title, created_at AS createdAt FROM nodes|INSERT INTO parent_child_orders/u;
  const observe = (db: DbPort): DbPort => ({
    run: (sql, params) => { if (materialization.test(sql)) observed.push(sql); return db.run(sql, params); },
    query: (sql, params) => { if (materialization.test(sql)) observed.push(sql); return db.query(sql, params) as never; },
    transaction: execute => db.transaction(tx => execute(observe(tx)))
  });
  let pulls = 0;
  native.post.mockImplementation(input => {
    if (input.url.includes('request=pulls') && ++pulls === 2) throw new Error('fixture_stop_after_one_batch');
    return adoption.post(input);
  });
  const first = native.db!;
  native.db = observe(first);
  try { await expect(adoption.sync()).rejects.toThrow('fixture_stop_after_one_batch'); }
  finally { native.db = first; }
  const partial = readOrder();
  expect(partial.length).toBeGreaterThan(0);
  expect(partial.length).toBeLessThan(NODES - 1);
  await adoption.restart();
  expect(readOrder()).toEqual(partial);
  native.post.mockImplementation(adoption.post);
  const reopened = native.db!;
  native.db = observe(reopened);
  try { await adoption.sync(); }
  finally { native.db = reopened; }
  const source = new Database(adoption.fixture.rightSnapshot.databasePath, { readonly: true });
  try { expect(readOrder()).toEqual(readParentChildOrder(createBetterSqlite3Driver(source), parentId).childIds); }
  finally { source.close(); }
  expect(readOrder()).toHaveLength(NODES - 1);
  expect(observed).toEqual([]);
});

it('applies each pulled batch in one transaction and prunes visibility once per batch', { meta: { calibratedMs: 20000 } }, async () => {
  const adoption = await adopt();
  const counts = { transactions: 0, prunes: 0, shared: 0 };
  const original = native.db!;
  const post = native.post.getMockImplementation()!;
  let pulls = 0;
  native.post.mockImplementation(async input => { if (input.url.includes('request=pulls')) pulls += 1; return post(input); });
  native.db = counted(original, counts);
  await adoption.sync();
  native.db = original;
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(receivedIds(adoption)).toHaveLength(NODES);
  expect(pulls).toBeGreaterThan(0);
  expect(counts.prunes).toBeLessThanOrEqual(pulls);
  expect(counts.transactions).toBeLessThan(NODES / 2);
  // Sender checks and source-revision bookkeeping run once per pulled batch, not once per object.
  expect(counts.shared).toBeLessThanOrEqual(SHARED.length * (pulls + 2));
});

it('keeps the rest of a batch when one received object cannot be applied', { meta: { calibratedMs: 20000 } }, async () => {
  const adoption = await adopt();
  adoption.sqlite.exec(`CREATE TRIGGER reject_received_note BEFORE INSERT ON nodes
    WHEN NEW.id = 't326-complete-00007' BEGIN SELECT RAISE(ABORT, 'received_note_rejected'); END`);
  await adoption.sync();
  const received = receivedIds(adoption);
  expect(received).not.toContain('t326-complete-00007');
  expect(received).toHaveLength(NODES - 1);
  expect(await loadSyncGroupLocalAdoption(adoption.db)).not.toBeNull();
  adoption.sqlite.exec('DROP TRIGGER reject_received_note');
  await adoption.restart();
  await adoption.sync();
  expect(receivedIds(adoption)).toHaveLength(NODES);
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
});

it('receives a large first adoption in at most twelve database calls per node', { meta: { calibratedMs: 20000 } }, async () => {
  const nodes = 200;
  const adoption = await adopt(nodes);
  let calls = 0;
  const original = native.db!;
  const counting = (port: DbPort): DbPort => ({
    run: (sql: string, params?: DbParams) => { calls += 1; return port.run(sql, params); },
    query: (sql: string, params?: DbParams) => { calls += 1; return port.query(sql, params) as never; },
    transaction: execute => port.transaction(tx => execute(counting(tx)))
  });
  native.db = counting(original);
  await adoption.sync();
  native.db = original;
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(receivedIds(adoption)).toHaveLength(nodes);
  // Every call crosses the native bridge on phones; per-node work must be read and written per batch.
  expect(calls / nodes).toBeLessThanOrEqual(12);
});
