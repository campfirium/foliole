// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { collectCompanionBatchSubtree, moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { loadCompanionWriteNodes } from '../shared/platform/companion/runtime/companionWriteNodes';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { buildWorkspaceMetadataMutation } from '../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../store/workspaceSnapshotSequentialReading';

import { buildCompanionTrashPreview } from './companionTrashPreview';

// Work-amplification check WA-046: counts only, never durations.
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

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
async function openLibrary(size: number) {
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'sub', kind: 'folder', parentNodeId: 'folder', title: 'Sub' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 's1', kind: 'topic', parentNodeId: 'sub', title: 's1' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 's1x', kind: 'item', parentNodeId: 's1', title: 's1x' });
  await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
}
beforeEach(() => openLibrary(400));
afterEach(async () => { await library.close(); });

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  // Neither the write, the refresh nor the index reads or orders the whole library.
  expect(reads.fullSnapshots).toBe(0);
  expect(reads.orderDerivations).toBe(0);
  const owner = getIosCompanionDatabaseOwner();
  const indexed = await owner.read(db => owner.readNodeOrder(db));
  const derived = await owner.readSnapshot(db => loadDerivedNodeOrderWithDbPort(db, undefined, true));
  expect(indexed).toEqual(derived);
  const complete = await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
  const facts = (value: WorkspaceSnapshot | null) => value && { nodesById: value.nodesById, nodeOrder: value.nodeOrder,
    activeNodeId: value.activeNodeId, trashedNodeIds: [...value.trashedNodeIds].sort(), trashedNodeDeletedAtById: value.trashedNodeDeletedAtById };
  expect(facts(snapshot)).toEqual(facts(complete));
}

it('moves a nested folder to Trash and shows it without reading the whole library', async () => {
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'sub' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.trashedNodeIds).toEqual(expect.arrayContaining(['sub', 's1', 's1x']));
  await expectCompleteReread(snapshot);
});

it('moves a selection to Trash and shows it without reading the whole library', async () => {
  const current = await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
  const targets = ['b', 'c'].map(id => ({ id, version: current!.nodesById[id]!.currentVersionId! }));
  await moveCompanionBatchToTrash(targets);
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.trashedNodeIds).toEqual(expect.arrayContaining(['b', 'c']));
  await expectCompleteReread(snapshot);
});

async function trashWriteRows(size: number) {
  await library.close();
  await openLibrary(size);
  sqlRecording.start({ label: 'trash-write', maxGroups: 2000 });
  try { await mutateCompanionWorkspace({ type: 'delete', nodeId: 'sub' }); }
  finally { sqlRecording.stop(); }
  return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
}

it('reads the same number of rows for a move to Trash however large the library is', async () => {
  expect(await trashWriteRows(2000)).toBe(await trashWriteRows(100));
});

it('builds the same Trash change from the narrow read as from the whole library', async () => {
  const owner = getIosCompanionDatabaseOwner();
  await owner.readSnapshot(async db => {
    const complete = (await loadIosCompanionWorkspaceSnapshot(db))!;
    const narrow = (await loadCompanionWriteNodes(db, ['sub'], { sequentialReading: true }))!;
    const now = '2026-11-21T00:00:00.000Z';
    const fromComplete = buildWorkspaceMetadataMutation({ type: 'delete', nodeId: 'sub' }, complete.nodesById, now);
    // Content projections never carry the Readwise lifecycle; version records take it from the stored version instead.
    const withoutLifecycle = (mutation: typeof fromComplete) => ({ ...mutation,
      nodes: mutation.nodes.map(node => { const copy = { ...node }; delete copy.readwiseRemoteLifecycle; return copy; }) });
    expect(withoutLifecycle(buildWorkspaceMetadataMutation({ type: 'delete', nodeId: 'sub' }, narrow, now)))
      .toEqual(withoutLifecycle(fromComplete));
    const after = { ...complete.nodesById, ...Object.fromEntries(fromComplete.nodes.map(node => [node.id, node])) };
    expect(maintainWorkspaceSnapshotSequentialReading({ before: complete.nodesById, after, changedNodeIds: ['sub'],
      nodeOrder: complete.nodeOrder, now })).toEqual([]);
    for (const id of Object.keys(narrow)) expect(narrow[id]).toEqual({ ...complete.nodesById[id], readwiseRemoteLifecycle: undefined });
    const batch = (await loadCompanionWriteNodes(db, ['b', 's1'], { sequentialReading: false }))!;
    const ids = (nodes: WorkspaceSnapshot['nodesById']) => collectCompanionBatchSubtree(nodes, ['b', 's1']).map(node => node.id);
    expect(ids(batch)).toEqual(ids(complete.nodesById));
  });
});

it('keeps the whole-library read when Sequential Reading is in reach', async () => {
  library.database.prepare('UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = ?').run('folder');
  const owner = getIosCompanionDatabaseOwner();
  expect(await owner.readSnapshot(db => loadCompanionWriteNodes(db, ['sub'], { sequentialReading: true }))).toBeNull();
  expect(await owner.readSnapshot(db => loadCompanionWriteNodes(db, ['sub'], { sequentialReading: false }))).not.toBeNull();
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'sub' });
  expect(reads.fullSnapshots).toBe(1);
});

it('previews exactly the visible result the committed move to Trash publishes', async () => {
  for (const roots of [['sub'], ['b', 'c']]) {
    const before = (await refreshCompanionWorkspaceAfterMutation())!;
    const preview = buildCompanionTrashPreview(before, roots, '2026-11-21T00:00:00.000Z');
    if (roots.length === 1) await mutateCompanionWorkspace({ type: 'delete', nodeId: roots[0]! });
    else await moveCompanionBatchToTrash(roots.map(id => ({ id, version: before.nodesById[id]!.currentVersionId! })));
    const after = (await refreshCompanionWorkspaceAfterMutation())!;
    const visible = (value: WorkspaceSnapshot) => ({ nodeOrder: value.nodeOrder, activeNodeId: value.activeNodeId,
      trashedNodeIds: [...value.trashedNodeIds].sort() });
    expect(visible(preview)).toEqual(visible(after));
  }
});
