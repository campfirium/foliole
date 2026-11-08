// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqlite3Driver } from '../../../../../../electron/database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../../../../../../electron/database/importedNodeDeletionVersions.js';
import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { deleteNodesPermanently } from '../../../../../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../../../../../lib/core/database/workspaceSearchSidecar.js';
import type { DbParams, DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

const bad = vi.hoisted(() => ({ globalId: null as string | null }));
vi.mock('../../../../../../lib/core/sync/requestSyncObjectFacts.js', async original => {
  const actual = await original<typeof import('../../../../../../lib/core/sync/requestSyncObjectFacts.js')>();
  return { ...actual, finishReceivedNode: (...args: Parameters<typeof actual.finishReceivedNode>) => {
    if (args[1].globalId === bad.globalId) throw new Error('test_object_rejected');
    return actual.finishReceivedNode(...args);
  }, finishReceivedNodes: (...args: Parameters<typeof actual.finishReceivedNodes>) => {
    if (args[1].some(input => input.globalId === bad.globalId)) throw new Error('test_object_rejected');
    return actual.finishReceivedNodes(...args);
  } };
});

const NODES = 60;
const PRUNE = /DELETE FROM node_reading_host_state\s+WHERE node_id NOT IN \(SELECT id FROM nodes\)/u;
const SHARED = [/INSERT INTO node_version_local_proof_state/u, /SELECT 1 FROM sync_group_devices peer JOIN sync_group_local_state/u];
let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { bad.globalId = null; await host?.close(); host = undefined; });

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

function permanentlyDeleteSourceNodes(adoption: NonNullable<typeof host>, nodeIds: string[]) {
  const source = new Database(adoption.fixture.rightSnapshot.databasePath);
  try {
    const driver = createBetterSqlite3Driver(source);
    source.exec("ATTACH DATABASE ':memory:' AS search");
    initializeWorkspaceSearchSidecar({ sqlite: source, driver });
    const deletedAt = '2026-10-07T00:00:00.000Z';
    prepareImportedNodeDeletionVersions(driver, nodeIds, deletedAt);
    deleteNodesPermanently(driver, { nodeIds, deletedAt });
    return source.prepare('SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id').all();
  } finally { source.close(); }
}

it('bounds deletion follow-up calls while completing a mixed first adoption', async () => {
  const adoption = await adopt(1);
  const nodeIds = Array.from({ length: 24 }, (_, index) => `deleted-${index}`);
  for (const nodeId of nodeIds) {
    await adoption.fixture.right.seed({ nodeId, title: 'Deleted', content: 'Original body' });
  }
  const expected = permanentlyDeleteSourceNodes(adoption, nodeIds);
  const original = native.db!;
  let calls = 0;
  const count = (port: DbPort): DbPort => ({
    run: (sql, params) => { calls++; return port.run(sql, params); },
    query: (sql, params) => { calls++; return port.query(sql, params) as never; },
    transaction: execute => port.transaction(tx => execute(count(tx)))
  });
  native.db = count(original);
  try { await adoption.sync(); }
  finally { native.db = original; }
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(receivedIds(adoption)).toHaveLength(1);
  expect(expected).toHaveLength(nodeIds.length);
  expect(adoption.sqlite.prepare('SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id').all())
    .toEqual(expected);
  expect(adoption.sqlite.prepare(`SELECT count(*) AS count FROM node_sync_versions
    WHERE object_id IN (SELECT value FROM json_each(?)) AND body_text IS NOT NULL`).get(JSON.stringify(nodeIds)))
    .toEqual({ count: 0 });
  expect(calls).toBeLessThanOrEqual(890); // The unbatched release takes 938 calls for these facts.
});

it('preserves shared text while releasing a batch of deletions after adoption', async () => {
  const adoption = await adopt(1);
  const deletedIds = ['delete-first', 'delete-second'];
  for (const nodeId of [...deletedIds, 'keep-shared']) {
    await adoption.fixture.right.seed({ nodeId, title: 'Shared', content: 'Shared body' });
  }
  await adoption.sync();
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  const expected = permanentlyDeleteSourceNodes(adoption, deletedIds);
  await adoption.sync();
  await adoption.restart();
  await adoption.sync();

  expect(adoption.sqlite.prepare('SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id').all())
    .toEqual(expected);
  expect(adoption.sqlite.prepare(`SELECT id, content FROM nodes WHERE id IN ('delete-first', 'delete-second', 'keep-shared')`).all())
    .toEqual([{ id: 'keep-shared', content: 'Shared body' }]);
  expect(adoption.sqlite.prepare(`SELECT version_id FROM node_sync_versions
    WHERE object_id IN ('delete-first', 'delete-second') AND body_text IS NOT NULL`).all()).toEqual([]);
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
  bad.globalId = 't326-complete-00007';
  await expect(adoption.sync()).rejects.toThrow('test_object_rejected');
  const received = receivedIds(adoption);
  expect(received).not.toContain('t326-complete-00007');
  expect(received).toHaveLength(NODES - 1);
  expect(await loadSyncGroupLocalAdoption(adoption.db)).not.toBeNull();
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
