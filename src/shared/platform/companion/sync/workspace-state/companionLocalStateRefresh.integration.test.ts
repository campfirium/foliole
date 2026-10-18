// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../../../../lib/core/database/workspaceSnapshot';
import {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeOpenState,
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncSettingRecord,
  saveCompanionSyncNodeReviewRecord
} from '../../../companionSyncStateWriters';
import { refreshCompanionWorkspaceAfterMutation } from '../../companionWorkspaceRepository';
import type { CapacitorCompanionDatabaseOwner } from '../../runtime/capacitorCompanionDatabaseOwner';
import { runCompanionSyncMutationTask } from '../mutation/companionSyncMutationRevision';

import { createDisplayLibrary } from './companionDisplaySnapshotConcurrency.testSupport';
import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

const review = {
  difficulty: 5.1, due: '2026-10-25T00:00:00.000Z', elapsedDays: 0, lapses: 0,
  lastReviewAt: '2026-10-18T00:00:00.000Z', reps: 1, scheduledDays: 7, stability: 7.2, state: 2 as const
};

async function openLibrary() {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
  await library.owner.runWriter(db => db.run(`INSERT INTO nodes (id, title, content, created_at, updated_at)
    VALUES ('a', 'A', 'Body A', 'now', 'now'), ('b', 'B', 'Body B', 'now', 'now')`));
  const baseline = await refreshCompanionWorkspaceAfterMutation();
  return { library, baseline, reads: library.fullDirectoryQueries() };
}

async function readComplete(): Promise<WorkspaceSnapshot | null> {
  return runtime.owner!.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
}

it('publishes a local grade without rereading the whole directory', async () => {
  const { library, reads } = await openLibrary();
  try {
    await saveCompanionSyncNodeReviewRecord({ nodeId: 'a', review });
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries(), 'grade must not trigger a full directory read').toBe(reads);
    expect(displayed?.nodesById.a?.review).toEqual((await readComplete())?.nodesById.a?.review);
    expect(displayed?.nodesById.a?.review?.due).toBe(review.due);
  } finally { await library.close(); }
});

it.each(['custom_css_snippets', 'handoff_reminder_settings'])(
  'persists %s without widening a reading, grade and active-node batch', async key => {
    const { library, reads, baseline } = await openLibrary();
    try {
      const valueJson = JSON.stringify(key === 'custom_css_snippets' ? { version: 1, snippets: [] } : { enabled: true });
      await saveCompanionSyncSettingRecord({ key, valueJson });
      expect(await refreshCompanionWorkspaceAfterMutation()).toEqual(baseline);
      expect(library.fullDirectoryQueries()).toBe(reads);
      expect(await library.owner.readSnapshot(db => db.query(
        'SELECT value_json FROM setting_records WHERE key = ?', [key]
      ))).toEqual([{ value_json: valueJson }]);
      await saveCompanionSyncNodeReviewRecord({ nodeId: 'b', review });
      await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: {
        intervalDurationMs: 1000, intervalGrowthFactor: 1,
        lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
        priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active'
      } });
      await saveCompanionSyncActiveViewState('b');
      await saveCompanionSyncSettingRecord({ key, valueJson });
      const displayed = await refreshCompanionWorkspaceAfterMutation();
      expect(library.fullDirectoryQueries()).toBe(reads);
      expect(displayed).toEqual(await readComplete());
      expect(displayed?.activeNodeId).toBe('b');
      expect(displayed?.nodesById.b?.review).toEqual(review);
      expect(displayed?.nodesById.a?.reading?.repetitionCount).toBe(1);
    } finally { await library.close(); }
  }
);

it('publishes opened and active node changes without rereading the whole directory', async () => {
  const { library, reads } = await openLibrary();
  try {
    await saveCompanionSyncNodeOpenState({ lastOpenedAt: '2026-10-18T01:00:00.000Z', nodeId: 'b' });
    await saveCompanionSyncActiveViewState('b');
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries(), 'open/active writes must not trigger a full directory read').toBe(reads);
    const complete = await readComplete();
    expect(displayed?.nodeOpenStateById).toEqual(complete?.nodeOpenStateById);
    expect(displayed?.activeNodeId).toBe('b');
    expect(displayed?.activeNodeId).toBe(complete?.activeNodeId);
  } finally { await library.close(); }
});

it('falls back to a complete read when the graded or active node was deleted meanwhile', async () => {
  const { library, reads } = await openLibrary();
  try {
    await library.owner.runWriter(db => db.run("UPDATE nodes SET deleted_at = 'now' WHERE id = 'b'"));
    await saveCompanionSyncNodeReviewRecord({ nodeId: 'b', review });
    await saveCompanionSyncActiveViewState('b');
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries()).toBe(reads + 1);
    const complete = await readComplete();
    expect(displayed?.trashedNodeIds).toEqual(complete?.trashedNodeIds);
    expect(displayed?.activeNodeId).toBe(complete?.activeNodeId);
  } finally { await library.close(); }
});

it('lets a registered full refresh govern a batch that also holds local state scopes', async () => {
  const { library, reads } = await openLibrary();
  try {
    await saveCompanionSyncNodeReviewRecord({ nodeId: 'a', review });
    await runCompanionSyncMutationTask(() => library.owner.runWriter(db => db.run(
      "UPDATE nodes SET title = 'Renamed' WHERE id = 'b'")));
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries()).toBe(reads + 1);
    expect(displayed?.nodesById.b?.title).toBe('Renamed');
    expect(displayed?.nodesById.a?.review?.due).toBe(review.due);
  } finally { await library.close(); }
});
