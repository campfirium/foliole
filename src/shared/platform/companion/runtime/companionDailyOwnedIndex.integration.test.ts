// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { loadDailyFlowLearningFromNodeIndex } from '../../../../../lib/core/flow/dailyFlowLearningSnapshot';
import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
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

async function generate(library: Library) {
  const reads = library.flowNodeReads.length;
  const prepared = await library.owner.read(async db => library.owner.readNodeMetadata(db) !== null);
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const opened = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  const rows = await library.owner.read(db => db.query('SELECT * FROM daily_flow_entries ORDER BY order_key'));
  expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(opened.session);
  expect(library.flowNodeReads.length - reads).toBe(prepared ? 0 : 1);
  return { session: opened.session, rows };
}

it.each(['android', 'ios'] as const)('%s keeps complete membership after same-count replacement, rollback and fresh learning writes', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    await library.owner.runWriter(async db => {
      for (const id of ['keep', 'old']) await db.run(`INSERT INTO nodes
        (id,title,content,created_at,updated_at) VALUES (?,?,'Complete body',?,?)`, [id, id, now, now]);
      await db.run("INSERT INTO node_reading (node_id,last_handled_at,next_at,repetition_count) VALUES ('keep',?,?,1)", [now, now]);
    });
    await refreshCompanionWorkspaceSnapshot();
    expect((await generate(library)).rows.map(row => row.node_id).sort()).toEqual(['keep', 'old']);
    const scope = { kind: 'nodes' as const, nodeIds: ['old', 'new'] };
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("DELETE FROM nodes WHERE id='old'");
      await tx.run(`INSERT INTO nodes (id,title,content,created_at,updated_at)
        VALUES ('new','New','Complete new body',?,?)`, [now, now]);
    })), scope);
    const changed = await generate(library);
    expect(changed.rows.map(row => row.node_id).sort()).toEqual(['keep', 'new']);
    await expect(runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("DELETE FROM nodes WHERE id='new'");
      throw new Error('replacement rejected');
    })), scope)).rejects.toThrow('replacement rejected');
    expect(await generate(library)).toEqual(changed);
    const index = await library.owner.read(async db => library.owner.readNodeMetadata(db));
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.run(
      "UPDATE node_reading SET repetition_count=8 WHERE node_id='keep'")),
    { kind: 'nodes', nodeIds: [], readingNodeIds: ['keep'] });
    await library.owner.read(async db => {
      expect(library.owner.readNodeMetadata(db)).toBe(index);
      const snapshot = await loadDailyFlowLearningFromNodeIndex(db, 'display-fixture', index!);
      expect(snapshot.nodesById.keep?.reading?.repetitionCount).toBe(8);
      expect(snapshot.nodesById.old).toBeUndefined();
      expect(snapshot.nodesById.new?.hasContent).toBe(true);
    });
    const fresh = await generate(library);
    library.owner.clearNodePriorities();
    expect(await generate(library)).toEqual(fresh);
  } finally { await library.close(); runtime.owner = null; }
});
