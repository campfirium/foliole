// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { updateCommittedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlow } from './companionDailyFlow';
import { CompanionNodePriorityState } from './companionNodePriorityState';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const now = '2026-10-28T01:00:00.000Z';

it.each(['android', 'ios'] as const)('%s shares directory-prepared priorities with Flow and updates only committed changes', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    await library.owner.runWriter(async db => {
      for (const [id, parent, priority] of [['a', null, 2], ['b', null, 8], ['branch', 'a', null], ['leaf', 'branch', null]] as const) {
        await db.run(`INSERT INTO nodes (id,parent_id,priority,title,content,created_at,updated_at)
          VALUES (?,?,?,?,'Body',?,?)`, [id, parent, priority, id, now, now]);
      }
    });
    await refreshCompanionWorkspaceSnapshot();
    const paths = () => library.owner.read(async db => (await library.owner.readNodeIndex(db, 5)).paths);
    expect((await paths()).get('leaf')).toEqual(['a', 'branch', 'leaf']);
    const values = () => library.owner.read(db => library.owner.readNodePriorities(db, 5));
    expect((await values()).get('leaf')).toBe(2);
    expect(library.priorityReads).toEqual([]);
    await openCompanionDailyFlow({ now, mode: 'recommended' });
    expect(library.priorityReads).toEqual([]);
    const scope = { kind: 'nodes' as const, nodeIds: ['branch'], structure: true };
    await runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET parent_id='b' WHERE id='branch'");
    })), scope);
    expect((await values()).get('leaf')).toBe(8);
    expect((await paths()).get('leaf')).toEqual(['b', 'branch', 'leaf']);
    expect(library.priorityReads).toEqual([{ params: [JSON.stringify(['branch'])], rows: 1 }]);
    await expect(runCompanionHighValueMutationTask(() => library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET priority=0 WHERE id='branch'");
      throw new Error('rollback');
    })), scope)).rejects.toThrow('rollback');
    expect((await values()).get('leaf')).toBe(8);
    expect((await paths()).get('leaf')).toEqual(['b', 'branch', 'leaf']);
    expect(library.priorityReads).toHaveLength(1);
    await library.owner.runWriter(async db => {
      await db.transaction(tx => tx.run("UPDATE nodes SET priority=0 WHERE id='b'"));
      await updateCommittedCompanionWorkspace({ kind: 'nodes', nodeIds: ['b'] }, db);
    });
    expect((await values()).get('leaf')).toBe(0);
    const reads = library.priorityReads.length;
    await runCompanionHighValueMutationTask(async () => null,
      { kind: 'nodes', nodeIds: [], readingNodeIds: ['leaf'] });
    expect(library.priorityReads).toHaveLength(reads);
    await openCompanionDailyFlow({ now, mode: 'recommended' });
    expect(library.priorityReads).toHaveLength(reads);
    const previousPaths = await paths();
    library.owner.clearNodePriorities();
    await openCompanionDailyFlow({ now, mode: 'recommended' });
    expect(library.priorityReads).toHaveLength(reads);
    expect((await values()).get('leaf')).toBe(0);
    expect(library.priorityReads.at(-1)?.rows).toBeGreaterThan(1);
    expect(await paths()).not.toBe(previousPaths);
    expect((await paths()).get('leaf')).toEqual(['b', 'branch', 'leaf']);
  } finally { await library.close(); }
});

it('keeps failed refreshes unavailable and repairs every pending changed node', async () => {
  const library = createDisplayLibrary('android');
  const state = new CompanionNodePriorityState();
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    await library.owner.runWriter(async db => {
      await db.run(`INSERT INTO nodes (id,title,content,created_at,updated_at)
        VALUES ('a','A','Body',?,?),('b','B','Body',?,?)`, [now, now, now, now]);
      await state.read(db, 5);
      await db.run("UPDATE nodes SET priority=2 WHERE id='a'");
      const failing = { ...db, query: async () => { throw new Error('priority read failed'); } };
      await expect(state.refresh(failing, { kind: 'nodes', nodeIds: ['a'] })).rejects.toThrow('priority read failed');
      await expect(state.read(db, 5)).rejects.toThrow('priority read failed');
      await expect(state.readOrder(db)).rejects.toThrow('priority read failed');
      expect(() => state.readMetadata()).toThrow('priority read failed');
      await db.run("UPDATE nodes SET priority=8 WHERE id='b'");
      await state.refresh(db, { kind: 'nodes', nodeIds: ['b'] });
      const result = await state.read(db, 5);
      expect([result.get('a'), result.get('b')]).toEqual([2, 8]);
    });
  } finally { await library.close(); }
});
