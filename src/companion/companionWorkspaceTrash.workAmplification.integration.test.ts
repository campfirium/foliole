// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { resolveCompanionDirectoryCounts } from '../shared/platform/companion/browse/companionDirectoryCounts';
import { watchCompanionWorkspaceRefreshDegradations } from '../shared/platform/companion/companionWorkspaceRefreshDegradation.testSupport';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { collectCompanionBatchSubtree, moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { loadCompanionWriteNodes } from '../shared/platform/companion/runtime/companionWriteNodes';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { resolveCompanionFolderViewByNodeId } from '../shared/platform/companionBrowseLists';
import { buildWorkspaceMetadataMutation } from '../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../store/workspaceSnapshotSequentialReading';

import { buildCompanionCreatePreview, buildCompanionTrashPreview } from './companionWorkspacePreview';

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
  degradations.reset();
}
const degradations = watchCompanionWorkspaceRefreshDegradations();
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

it('moves a folder in a Sequential Reading folder to Trash without reading the whole library', async () => {
  library.database.prepare('UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = ?').run('folder');
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'sub' });
  await expectCompleteReread(await refreshCompanionWorkspaceAfterMutation());
});

it('keeps the whole-library read when a Sequential Reading topic is in reach', async () => {
  // A topic source orders its items by the whole library's order.
  library.database.prepare('UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = ?').run('s1');
  const owner = getIosCompanionDatabaseOwner();
  expect(await owner.readSnapshot(db => loadCompanionWriteNodes(db, ['s1x'], { sequentialReading: true }))).toBeNull();
  expect(await owner.readSnapshot(db => loadCompanionWriteNodes(db, ['s1x'], { sequentialReading: false }))).not.toBeNull();
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 's1x' });
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

it('previews exactly the visible result the committed creation publishes', async () => {
  for (const command of [{ type: 'create', nodeId: 'new-topic', kind: 'topic', parentNodeId: 'sub', title: 'New topic' },
    { type: 'create', nodeId: 'new-folder', kind: 'folder', parentNodeId: null, title: 'New folder' }] as const) {
    const before = (await refreshCompanionWorkspaceAfterMutation())!;
    const preview = buildCompanionCreatePreview(before, command, '2026-11-21T00:00:00.000Z');
    await mutateCompanionWorkspace(command);
    const after = (await refreshCompanionWorkspaceAfterMutation())!;
    const visible = (value: WorkspaceSnapshot) => {
      const { kind, title, parentNodeId, deletedAt } = value.nodesById[command.nodeId]!;
      return { nodeOrder: value.nodeOrder, activeNodeId: value.activeNodeId, node: { kind, title, parentNodeId, deletedAt: deletedAt ?? null } };
    };
    expect(visible(preview)).toEqual(visible(after));
  }
});

it('previews exactly the visible result the committed Dive and Virtual folder creations publish', async () => {
  // The first Virtual folder also creates the Virtual root; the second finds it in place.
  for (const command of [{ type: 'create-dive', nodeId: 'new-dive', title: 'New dive', sourceId: 'a' },
    { type: 'create-dive', nodeId: 'empty-dive', title: 'Empty dive', sourceId: null },
    { type: 'create-index', nodeId: 'node-index', title: 'New index' },
    { type: 'create-index', nodeId: 'node-index-2', title: 'Second index' }] as const) {
    const before = (await refreshCompanionWorkspaceAfterMutation())!;
    if (command.nodeId === 'node-index') expect(before.nodesById[VIRTUAL_ROOT_NODE_ID]).toBeUndefined();
    // Folder views order by time, so the preview takes the clock the way the phone does.
    const preview = buildCompanionCreatePreview(before, command, new Date().toISOString());
    expect(preview).not.toBe(before);
    await mutateCompanionWorkspace(command);
    const after = (await refreshCompanionWorkspaceAfterMutation())!;
    const visible = (value: WorkspaceSnapshot) => {
      const pick = (id: string) => {
        const node = value.nodesById[id];
        // A stored empty member order reads back as absent; both show no members.
        return node && { kind: node.kind, title: node.title, parentNodeId: node.parentNodeId, deletedAt: node.deletedAt ?? null,
          virtualFilter: node.virtualFilter ?? null, manualChildOrder: node.manualChildOrder?.length ? node.manualChildOrder : null };
      };
      const counts = resolveCompanionDirectoryCounts(value);
      return { nodeOrder: value.nodeOrder, activeNodeId: value.activeNodeId, node: pick(command.nodeId),
        virtualRoot: pick(VIRTUAL_ROOT_NODE_ID), results: counts.countVirtualResults(command.nodeId),
        virtualRootChildren: counts.countChildren(VIRTUAL_ROOT_NODE_ID, 'visible'),
        items: resolveCompanionFolderViewByNodeId(value, command.nodeId)?.items.map(item => item.nodeId) ?? null,
        virtualRootItems: resolveCompanionFolderViewByNodeId(value, VIRTUAL_ROOT_NODE_ID)?.items.map(item => item.nodeId) ?? null };
    };
    expect(visible(preview)).toEqual(visible(after));
  }
});
