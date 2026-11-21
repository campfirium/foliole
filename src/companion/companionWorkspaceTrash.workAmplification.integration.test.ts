// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

// Work-amplification check WA-046: counts only, never durations.
const reads = vi.hoisted(() => ({ fullSnapshots: 0 }));

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

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(400, 16);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'sub', kind: 'folder', parentNodeId: 'folder', title: 'Sub' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 's1', kind: 'topic', parentNodeId: 'sub', title: 's1' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 's1x', kind: 'item', parentNodeId: 's1', title: 's1x' });
  await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
});
afterEach(async () => { await library.close(); });

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  const complete = await getIosCompanionDatabaseOwner().readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
  const facts = (value: WorkspaceSnapshot | null) => value && { nodesById: value.nodesById, nodeOrder: value.nodeOrder,
    activeNodeId: value.activeNodeId, trashedNodeIds: [...value.trashedNodeIds].sort(), trashedNodeDeletedAtById: value.trashedNodeDeletedAtById };
  expect(facts(snapshot)).toEqual(facts(complete));
}

it('moves a nested folder to Trash and shows it with at most one whole-library snapshot read', async () => {
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'sub' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.trashedNodeIds).toEqual(expect.arrayContaining(['sub', 's1', 's1x']));
  expect(reads.fullSnapshots).toBeLessThanOrEqual(1);
  await expectCompleteReread(snapshot);
});

it('moves a selection to Trash and shows it with at most one whole-library snapshot read', async () => {
  const current = await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
  const targets = ['b', 'c'].map(id => ({ id, version: current!.nodesById[id]!.currentVersionId! }));
  await moveCompanionBatchToTrash(targets);
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.trashedNodeIds).toEqual(expect.arrayContaining(['b', 'c']));
  expect(reads.fullSnapshots).toBeLessThanOrEqual(1);
  await expectCompleteReread(snapshot);
});
