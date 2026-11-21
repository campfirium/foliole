// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey, readCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { loadCompanionHistoryReplayNodes } from '../shared/platform/companion/runtime/companionNodeHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncStateWriters';
import { getWorkspaceHistoryTopEntry } from '../store/workspaceActionHistoryState';
import { resolveWorkspaceMetadataHistory, type WorkspaceNodeMetadataHistoryEntry } from '../store/workspaceNodeMetadataHistory';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

// Work-amplification check for phone undo and redo of node changes, following the single-write check
// in companionWorkspaceWrites.workAmplification: counted, never timed.
const reads = vi.hoisted(() => ({ fullSnapshots: 0, orderDerivations: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore', async importOriginal => {
  const original = await importOriginal<typeof import('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore')>();
  return { ...original, loadIosCompanionWorkspaceSnapshot: (...args: Parameters<typeof original.loadIosCompanionWorkspaceSnapshot>) => {
    reads.fullSnapshots += 1;
    return original.loadIosCompanionWorkspaceSnapshot(...args);
  } };
});
vi.mock('../../lib/core/database/parentChildOrder', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/database/parentChildOrder')>();
  return { ...original, loadDerivedNodeOrderWithDbPort: (...args: Parameters<typeof original.loadDerivedNodeOrderWithDbPort>) => {
    reads.orderDerivations += 1;
    return original.loadDerivedNodeOrderWithDbPort(...args);
  } };
});

const key = companionFlowHistoryKey('Search');
const replay = (mode: 'undo' | 'redo') => replayCompanionFlowHistory(key, mode, createEmptyReviewSession());
const now = '2026-11-21T00:00:00.000Z';

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
async function openLibrary(size: number) {
  await library?.close();
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  // Topics live in a folder as they do in the app, so the root keeps a handful of folders however large the library is.
  library.database.prepare("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES ('bulk','folder','bulk','','0','0')").run();
  library.database.prepare("UPDATE nodes SET parent_id = 'bulk' WHERE parent_id IS NULL AND id NOT LIKE 'special-%' AND id != 'bulk'").run();
  for (const id of ['folder', 'other']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'folder', parentNodeId: null, title: id });
  for (const id of ['a', 'b', 'c', 'gone']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'ax', kind: 'item', parentNodeId: 'a', title: 'ax' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'gx', kind: 'item', parentNodeId: 'gone', title: 'gx' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'gone' });
  // A hand-ordered folder: its order comes from order sources, not from creation time.
  await writeIosCompanionDatabase(db => saveLocalCurrentParentOrderWithDbPort(db, { parentId: 'folder',
    childIds: ['c', 'a', 'gone', 'b'], now, hostName: 'Search' }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
}
beforeEach(() => openLibrary(100));
afterEach(async () => { await library?.close(); library = null; });

async function versions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

// Moving a subtree out of a Sequential Reading source saves the readings it unlocks with the change.
async function moveOutOfSequentialReading() {
  const base = (await refreshCompanionWorkspaceAfterMutation())!.nodesById.folder!;
  const definitions: WorkspaceNodeSnapshot[] = [
    { ...base, id: 'source', kind: 'folder', parentNodeId: null, title: 'source', sequentialReadingEnabled: true },
    { ...base, id: 'moved', kind: 'folder', parentNodeId: 'source', title: 'moved' },
    { ...base, id: 'locked', kind: 'topic', parentNodeId: 'moved', title: 'locked', content: 'Reading content' }
  ];
  const records = await Promise.all(definitions.map(node => toWorkspaceNativeNodeVersion({ ...node, currentVersionId: null }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }), { kind: 'business' });
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'locked', reading: { state: 'locked', intervalDurationMs: 1000,
    intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now, priority: 5, readingPosition: 17, repetitionCount: 2 } });
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'moved', parentNodeId: 'other' });
}

const CHANGES: Record<string, () => Promise<unknown>> = {
  create: () => mutateCompanionWorkspace({ type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' }),
  restore: () => mutateCompanionWorkspace({ type: 'restore', nodeId: 'gone' }),
  move: () => mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' }),
  'move to Trash': () => mutateCompanionWorkspace({ type: 'delete', nodeId: 'a' }),
  rename: () => mutateCompanionWorkspace({ type: 'rename', nodeId: 'c', title: 'zzz' }),
  'batch move': async () => moveCompanionBatch(await versions(['a', 'b']), 'other'),
  'move out of Sequential Reading': moveOutOfSequentialReading
};

// Prepares the library so the next replay in `mode` reverses or repeats the change, with the counters cleared.
async function prepare(size: number, change: () => Promise<unknown>, mode: 'undo' | 'redo') {
  await openLibrary(size);
  await change();
  if (mode === 'redo') await replay('undo');
  await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
}

async function replayRows(size: number, change: () => Promise<unknown>, mode: 'undo' | 'redo') {
  await prepare(size, change, mode);
  sqlRecording.start({ label: 'history-replay', maxGroups: 2000 });
  try {
    await replay(mode);
    await refreshCompanionWorkspaceAfterMutation();
  } finally { sqlRecording.stop(); }
  return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
}

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  // Neither the replay, the refresh nor the index reads or orders the whole library.
  expect(reads).toEqual({ fullSnapshots: 0, orderDerivations: 0 });
  const owner = getIosCompanionDatabaseOwner();
  const indexed = await owner.read(db => owner.readNodeOrder(db));
  expect(indexed).toEqual(await owner.readSnapshot(db => loadDerivedNodeOrderWithDbPort(db, undefined, true)));
  const complete = await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
  const facts = (value: WorkspaceSnapshot | null) => value && { ...value, trashedNodeIds: [...value.trashedNodeIds].sort() };
  expect(facts(snapshot)).toEqual(facts(complete));
}

for (const [name, change] of Object.entries(CHANGES)) {
  for (const mode of ['undo', 'redo'] as const) {
    it(`publishes the ${mode} of a ${name} without reading or ordering the whole library`, async () => {
      await prepare(100, change, mode);
      await replay(mode);
      await expectCompleteReread(await refreshCompanionWorkspaceAfterMutation());
    });

    it(`reads the same number of rows for the ${mode} of a ${name} however large the library is`, async () => {
      expect(await replayRows(400, change, mode)).toBe(await replayRows(100, change, mode));
    });
  }
}

it('resolves the same replay from the narrow read as from the whole library', async () => {
  // Content projections never carry the Readwise lifecycle; version records take it from the stored version instead.
  const withoutLifecycle = (nodes: WorkspaceNodeSnapshot[]) => nodes.map(node => {
    const copy = { ...node };
    delete copy.readwiseRemoteLifecycle;
    return copy;
  });
  const resolve = (mode: 'undo' | 'redo') => getIosCompanionDatabaseOwner().readSnapshot(async db => {
    const entry = getWorkspaceHistoryTopEntry(await readCompanionFlowHistory(db, key), mode) as WorkspaceNodeMetadataHistoryEntry;
    expect(entry.type).toBe('nodes.change');
    const complete = (await loadIosCompanionWorkspaceSnapshot(db))!.nodesById;
    const narrow = (await loadCompanionHistoryReplayNodes(db, entry))!;
    expect(withoutLifecycle(resolveWorkspaceMetadataHistory(entry, mode, narrow, now)))
      .toEqual(withoutLifecycle(resolveWorkspaceMetadataHistory(entry, mode, complete, now)));
  });
  for (const change of Object.values(CHANGES)) {
    await openLibrary(100);
    await change();
    await resolve('undo');
    await replay('undo');
    await resolve('redo');
  }
});

it('refuses a replay whose subtree changed from the narrow read as well', async () => {
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'a' });
  // A child added under the trashed subtree after the move makes its saved subtree stale.
  const base = (await refreshCompanionWorkspaceAfterMutation())!.nodesById.ax!;
  const record = await toWorkspaceNativeNodeVersion({ ...base, id: 'late', title: 'late', currentVersionId: null }, 'remote');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }), { kind: 'business' });
  await expect(replay('undo')).rejects.toThrow('workspace_history_subtree_changed');
});
