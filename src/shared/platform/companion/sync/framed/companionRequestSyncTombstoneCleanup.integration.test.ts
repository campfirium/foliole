// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../../../../electron/database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../../../../../../electron/database/importedNodeDeletionVersions.js';
import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { deleteNodesPermanently } from '../../../../../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../../../../../lib/core/database/workspaceSearchSidecar.js';
import type { DbParams, DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

async function adopt() {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.invoke('seed_complete_inventory', { count: 1, bodyBytes: 400 });
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

function observeDatabaseCalls(port: DbPort, onCall: (deletedId?: string, sql?: string, params?: DbParams) => void): DbPort {
  return {
    run: (sql, params) => {
      onCall(/^DELETE FROM/u.test(sql) && params?.length === 1 ? String(params[0]) : undefined, sql);
      return port.run(sql, params);
    },
    query: (sql, params) => { onCall(undefined, sql, params); return port.query(sql, params) as never; },
    transaction: execute => port.transaction(tx => execute(observeDatabaseCalls(tx, onCall)))
  };
}

function observeTombstoneRead(reads: string[][], sql?: string, params?: DbParams) {
  if (!sql || !params || !/SELECT (?:node_id, )?version_id, parent_version_id, deleted_at\s+FROM node_sync_tombstones/u.test(sql)) return;
  reads.push(sql.includes('json_each') ? JSON.parse(String(params[0])) as string[] : [String(params[0])]);
}

it('bounds deletion follow-up calls while completing a mixed first adoption', async () => {
  const adoption = await adopt();
  const nodeIds = Array.from({ length: 24 }, (_, index) => `deleted-${index}`);
  for (const nodeId of nodeIds) {
    await adoption.fixture.right.seed({ nodeId, title: 'Deleted', content: 'Original body' });
  }
  const expected = permanentlyDeleteSourceNodes(adoption, nodeIds);
  const original = native.db!;
  let calls = 0;
  let localDeletes = 0;
  const reads: string[][] = [];
  let pulls = 0;
  native.post.mockImplementation(input => {
    if (input.url.includes('request=pulls')) pulls++;
    return adoption.post(input);
  });
  native.db = observeDatabaseCalls(original, (deletedId, sql, params) => {
    calls++;
    observeTombstoneRead(reads, sql, params);
    if (deletedId && nodeIds.includes(deletedId)) localDeletes++;
  });
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
  expect(localDeletes).toBe(0);
  expect(pulls).toBeGreaterThan(1);
  expect(reads).toHaveLength(pulls);
  expect(reads.flat().sort()).toEqual([...nodeIds, ...receivedIds(adoption), 'special-inbox'].sort());
  await adoption.restart();
  expect(adoption.sqlite.prepare('SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id').all())
    .toEqual(expected);
  expect(calls).toBeLessThanOrEqual(890); // The unbatched release takes 938 calls for these facts.
});

it('preserves shared text while releasing a batch of deletions after adoption', async () => {
  const adoption = await adopt();
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

function rejectOrphanCleanup(adoption: NonNullable<typeof host>, orphan: string) {
  const hostName = JSON.parse(String(adoption.sqlite.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get())) as string;
  adoption.sqlite.prepare(`INSERT INTO node_view_state (node_id, host_name, scroll_top, updated_at)
    VALUES (?, ?, 123, '2026-10-07T00:00:00.000Z')`).run(orphan, hostName);
  adoption.sqlite.exec(`CREATE TRIGGER reject_orphan_cleanup BEFORE DELETE ON node_view_state
    WHEN OLD.node_id = '${orphan}' BEGIN SELECT RAISE(ABORT, 'orphan_cleanup_rejected'); END`);
}

it('cleans only existing rows in ordinary sync and retries a failed orphan cleanup after reopening', async () => {
  const adoption = await adopt();
  const present = 'delete-with-local-node';
  const orphan = 'delete-with-orphan-position';
  const absent = 'delete-without-local-rows';
  await adoption.fixture.right.seed({ nodeId: present, title: 'Existing', content: 'Keep until deleted' });
  await adoption.sync();
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(adoption.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').pluck().get(present)).toBe(present);
  for (const nodeId of [orphan, absent]) {
    await adoption.fixture.right.seed({ nodeId, title: 'Deleted', content: 'Original body' });
  }
  const expected = permanentlyDeleteSourceNodes(adoption, [present, orphan, absent]);
  rejectOrphanCleanup(adoption, orphan);
  const positions = () => adoption.sqlite.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().all(orphan);
  const deletions = () => adoption.sqlite.prepare(
    'SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id'
  ).all();
  const original = native.db!;
  const localDeletes: Array<[string, string]> = [];
  const reads: string[][] = [];
  native.db = observeDatabaseCalls(original, (deletedId, sql, params) => {
    observeTombstoneRead(reads, sql, params);
    if (deletedId && sql && [present, orphan, absent].includes(deletedId)) localDeletes.push([deletedId, sql]);
  });
  try {
    const partial = await adoption.sync();
    expect(partial.remainingStructureChangeCount).toBeGreaterThan(0);
  } finally { native.db = original; }
  expect(reads).toHaveLength(1);
  expect(reads.flat().sort()).toEqual([present, orphan, absent].sort());
  expect(localDeletes.filter(([id]) => id === absent)).toEqual([]);
  expect(localDeletes.filter(([id]) => id === orphan).map(([, sql]) => sql)).toEqual([
    'DELETE FROM node_view_state WHERE node_id = ?'
  ]);
  expect(localDeletes).toContainEqual([present, 'DELETE FROM nodes WHERE id = ?']);
  expect(adoption.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').pluck().get(present)).toBeUndefined();
  const accepted = expected.filter(row => (row as { node_id: string }).node_id !== orphan);
  expect(deletions()).toEqual(accepted);
  expect(positions()).toEqual([123]);

  await adoption.restart();
  expect(positions()).toEqual([123]);
  expect(deletions()).toEqual(accepted);
  adoption.sqlite.exec('DROP TRIGGER reject_orphan_cleanup');
  const resumed = await adoption.sync();
  expect(resumed.remainingStructureChangeCount).toBe(0);
  await adoption.restart();
  expect(deletions()).toEqual(expected);
  expect(positions()).toEqual([]);
});

it('resumes an interrupted first adoption after a batch of deletion facts has committed', async () => {
  const adoption = await adopt();
  const nodeIds = Array.from({ length: 60 }, (_, index) => `interrupted-deletion-${index}`);
  for (const nodeId of nodeIds) await adoption.fixture.right.seed({ nodeId, title: 'Deleted', content: 'Original body' });
  const expected = permanentlyDeleteSourceNodes(adoption, nodeIds);
  const deletions = () => adoption.sqlite.prepare(
    'SELECT node_id, version_id, content_hash FROM node_sync_tombstones ORDER BY node_id'
  ).all();
  native.post.mockImplementation(input => {
    if (input.url.includes('request=pulls') && deletions().length > 0) throw new Error('fixture_interrupted_deletion_pull');
    return adoption.post(input);
  });
  await expect(adoption.sync()).rejects.toThrow('fixture_interrupted_deletion_pull');
  const partial = deletions();
  expect(partial.length).toBeGreaterThan(0);
  expect(partial.length).toBeLessThan(nodeIds.length);
  await adoption.restart();
  expect(deletions()).toEqual(partial);
  native.post.mockImplementation(adoption.post);

  const resumed = await adoption.sync();
  expect(resumed.remainingStructureChangeCount).toBe(0);
  await adoption.restart();
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  expect(deletions()).toEqual(expected);
});
