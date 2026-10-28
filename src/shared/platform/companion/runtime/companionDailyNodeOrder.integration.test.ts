// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { updateCommittedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlow } from './companionDailyFlow';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const now = '2026-10-28T08:00:00.000Z';
type Library = ReturnType<typeof createDisplayLibrary>;

async function openLibrary(platform: 'android' | 'ios', order = ['c', 'a', 'b']) {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  await library.owner.open({ expectedHostName: 'display-fixture', now });
  await library.owner.runWriter(async db => {
    for (const id of ['a', 'b', 'c']) await db.run(`INSERT INTO nodes
      (id,title,content,priority,created_at,updated_at) VALUES (?,?,'Complete body',0,?,?)`, [id,id,now,now]);
    await db.run(`INSERT OR REPLACE INTO parent_child_order (parent_id,child_ids_json,updated_at)
      VALUES ('parent-child-order:root',?,?)`, [JSON.stringify(order),now]);
  });
  return library;
}

async function generate(library: Library) {
  runtime.owner = library.owner;
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const result = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  const rows = await library.owner.read(db => db.query<{ node_id: string }>(
    'SELECT node_id FROM daily_flow_entries ORDER BY order_key'));
  expect(result.session.currentNodeId).toBe(rows[0]?.node_id ?? null);
  expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(result.session);
  return rows.map(row => row.node_id);
}

async function rootOrder(library: Library, ids: string[], reject = false) {
  return runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
    await tx.run("UPDATE parent_child_order SET child_ids_json = ? WHERE parent_id = 'parent-child-order:root'", [JSON.stringify(ids)]);
    if (reject) throw new Error('order rejected');
  })), { kind: 'nodes', nodeIds: [], structure: true });
}

it.each(['android', 'ios'] as const)('%s reuses the prepared directory order for the first complete daily list', async platform => {
  const library = await openLibrary(platform);
  try {
    const snapshot = await refreshCompanionWorkspaceSnapshot();
    expect(snapshot?.nodeOrder.filter(id => id !== 'special-inbox')).toEqual(['c', 'a', 'b']);
    const reads = library.nodeOrderReads.length;
    expect(await generate(library)).toEqual(['c', 'a', 'b']);
    expect(library.nodeOrderReads).toHaveLength(reads);
    await runCompanionHighValueMutationTask(async () => null, { kind: 'nodes', nodeIds: [], readingNodeIds: ['a'] });
    expect(await generate(library)).toEqual(['c', 'a', 'b']);
    expect(library.nodeOrderReads).toHaveLength(reads);
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s observes root-only order commits and keeps the prior order after rollback', async platform => {
  const library = await openLibrary(platform);
  try {
    await refreshCompanionWorkspaceSnapshot();
    const reads = library.nodeOrderReads.length;
    await rootOrder(library, ['b', 'c', 'a']);
    expect(await generate(library)).toEqual(['b', 'c', 'a']);
    expect(library.nodeOrderReads).toHaveLength(reads + 1);
    await expect(rootOrder(library, ['a', 'b', 'c'], true)).rejects.toThrow('order rejected');
    expect(await generate(library)).toEqual(['b', 'c', 'a']);
    expect(library.nodeOrderReads).toHaveLength(reads + 1);
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s detects parent and visibility changes in node-scoped commits', async platform => {
  const library = await openLibrary(platform);
  try {
    await refreshCompanionWorkspaceSnapshot();
    const update = (sql: string, nodeId: string) => runCompanionHighValueMutationTask(
      () => library.owner.runWriter(db => db.transaction(tx => tx.run(sql))), { kind: 'nodes', nodeIds: [nodeId] });
    await update("UPDATE nodes SET parent_id='b' WHERE id='a'", 'a');
    expect(await generate(library)).toEqual(['c', 'b', 'a']);
    await update("UPDATE nodes SET deleted_at='deleted' WHERE id='b'", 'b');
    expect(await generate(library)).toEqual(['c']);
    await update("UPDATE nodes SET deleted_at=NULL WHERE id='b'", 'b');
    expect(await generate(library)).toEqual(['c', 'b', 'a']);
    const reads = library.nodeOrderReads.length;
    await update("UPDATE nodes SET title='Changed title' WHERE id='a'", 'a');
    expect(await generate(library)).toEqual(['c', 'b', 'a']);
    expect(library.nodeOrderReads).toHaveLength(reads);
    await update(`INSERT INTO nodes (id,title,content,priority,created_at,updated_at)
      VALUES ('d','D','Body',0,'2026-01-01','now')`, 'd');
    await update(`INSERT INTO nodes (id,title,content,priority,created_at,updated_at)
      VALUES ('e','E','Body',0,'2026-01-01','now')`, 'e');
    expect(await generate(library)).toEqual(['c', 'b', 'a', 'd', 'e']);
    await update("UPDATE nodes SET created_at='2025-01-01' WHERE id='e'", 'e');
    expect(await generate(library)).toEqual(['c', 'b', 'a', 'e', 'd']);
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s rejects an older prepared order after a concurrent root-only commit', async platform => {
  const library = await openLibrary(platform);
  let pending: ReturnType<typeof refreshCompanionWorkspaceSnapshot> | undefined;
  try {
    library.hold();
    pending = refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    await library.reading.promise;
    // Sync commits update the index before a deferred display notification is released.
    await library.owner.runWriter(async db => {
      await db.transaction(tx => tx.run("UPDATE parent_child_order SET child_ids_json='[\"b\",\"c\",\"a\"]' WHERE parent_id='parent-child-order:root'"));
      await updateCommittedCompanionWorkspace({ kind: 'nodes', nodeIds: [], structure: true }, db);
    });
    library.release.resolve();
    const older = await pending;
    expect(older?.nodeOrder.filter(id => id !== 'special-inbox')).toEqual(['c', 'a', 'b']);
    expect(await generate(library)).toEqual(['b', 'c', 'a']);
    const reads = library.nodeOrderReads.length;
    expect(await generate(library)).toEqual(['b', 'c', 'a']);
    expect(library.nodeOrderReads).toHaveLength(reads);
  } finally {
    library.release.resolve(); await pending?.catch(() => undefined);
    await library.close(); runtime.owner = null;
  }
});

it.each(['android', 'ios'] as const)('%s isolates equal IDs in different libraries and rebuilds after clearing', async platform => {
  const first = await openLibrary(platform);
  let second: Library | undefined;
  try {
    expect(await generate(first)).toEqual(['c', 'a', 'b']);
    second = await openLibrary(platform, ['b', 'a', 'c']);
    await refreshCompanionWorkspaceSnapshot();
    expect(await generate(second)).toEqual(['b', 'a', 'c']);
    expect(await generate(first)).toEqual(['c', 'a', 'b']);
    const reads = first.nodeOrderReads.length;
    first.owner.clearNodePriorities();
    expect(await generate(first)).toEqual(['c', 'a', 'b']);
    expect(first.nodeOrderReads).toHaveLength(reads + 1);
  } finally { await second?.close(); await first.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s keeps disconnected display-only members out of the durable daily list', async platform => {
  const library = await openLibrary(platform);
  try {
    await library.owner.runWriter(async db => {
      // Malformed facts distinguish the directory normalizer from the root-reachable SQL order.
      await db.run('PRAGMA foreign_keys = OFF');
      try {
        await db.run(`INSERT INTO nodes (id,parent_id,title,content,priority,created_at,updated_at)
          VALUES ('orphan','absent','Orphan','Body',0,'2026-01-01','2026-01-01'),
          ('cycle-a','cycle-b','Cycle A','Body',0,'2026-01-01','2026-01-01'),('cycle-b','cycle-a','Cycle B','Body',0,'2026-01-01','2026-01-01')`);
      } finally { await db.run('PRAGMA foreign_keys = ON'); }
    });
    const snapshot = await refreshCompanionWorkspaceSnapshot();
    expect(snapshot?.nodeOrder).toEqual(expect.arrayContaining(['orphan', 'cycle-a', 'cycle-b']));
    const reads = library.nodeOrderReads.length;
    expect(await generate(library)).toEqual(['c', 'a', 'b']);
    expect(library.nodeOrderReads).toHaveLength(reads);
  } finally { await library.close(); runtime.owner = null; }
});
