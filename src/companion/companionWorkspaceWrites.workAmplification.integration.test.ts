// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { addCompanionDiveSource, removeCompanionDiveSources } from '../shared/platform/companion/runtime/companionDiveSources';
import { changeCompanionIndexSource } from '../shared/platform/companion/runtime/companionIndexSources';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { loadCompanionWriteNodes } from '../shared/platform/companion/runtime/companionWriteNodes';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { saveCompanionSyncNodeReadingRecord, saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncStateWriters';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';

// Work-amplification check WA-047: everyday single-node writes on the phone, counted, never timed.
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

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
async function openLibrary(size: number, virtualFolders = true) {
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
  if (virtualFolders) {
    await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' });
    await mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index', title: 'index' });
    await changeCompanionIndexSource('index', 'c', 'add');
  }
  // A hand-ordered folder: its order comes from order sources, not from creation time.
  await writeIosCompanionDatabase(db => saveLocalCurrentParentOrderWithDbPort(db, { parentId: 'folder',
    childIds: ['c', 'a', 'gone', 'b'], now: '2026-11-21T00:00:00.000Z', hostName: 'Search' }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
}
beforeEach(() => openLibrary(100));
afterEach(async () => { await library?.close(); library = null; });

async function versions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

const WRITES: Record<string, () => Promise<unknown>> = {
  rename: () => mutateCompanionWorkspace({ type: 'rename', nodeId: 'a', title: 'Renamed' }),
  move: () => mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' }),
  'folder move': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'other', parentNodeId: 'folder' }),
  shelve: () => mutateCompanionWorkspace({ type: 'shelve', nodeId: 'b' }),
  priority: () => mutateCompanionWorkspace({ type: 'set-priority', nodeId: 'b', priority: 3 }),
  create: () => mutateCompanionWorkspace({ type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' }),
  restore: () => mutateCompanionWorkspace({ type: 'restore', nodeId: 'gone' }),
  'Dive creation': () => mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive-new', title: 'new', sourceId: 'a' }),
  'empty Dive creation': () => mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive-new', title: 'new', sourceId: null }),
  'Virtual folder creation': () => mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index-new', title: 'new' }),
  'Dive source addition': () => addCompanionDiveSource('dive', 'c'),
  'Dive source removal': () => removeCompanionDiveSources('dive', ['b']),
  'Virtual folder source addition': () => changeCompanionIndexSource('index', 'a', 'add'),
  'Virtual folder source removal': () => changeCompanionIndexSource('index', 'c', 'remove'),
  'batch move': async () => moveCompanionBatch(await versions(['a', 'b']), 'other'),
  'batch restore': async () => restoreCompanionBatchFromTrash(await versions(['gone'])),
  'scroll position': () => saveCompanionSyncNodeViewState({ nodeId: 'a', scrollTop: 120 }),
  'reading progress': () => saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: { intervalDurationMs: 1, intervalGrowthFactor: 2,
    lastHandledAt: '2026-11-21T00:00:00.000Z', nextAt: '2026-11-22T00:00:00.000Z', priority: 5, readingPosition: 3,
    repetitionCount: 1, state: 'active' } })
};

async function writeRows(size: number, write: () => Promise<unknown>, virtualFolders = true) {
  await openLibrary(size, virtualFolders);
  sqlRecording.start({ label: 'single-write', maxGroups: 2000 });
  try {
    await write();
    await refreshCompanionWorkspaceAfterMutation();
  } finally { sqlRecording.stop(); }
  return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
}

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  // Neither the write, the refresh nor the index reads or orders the whole library.
  expect(reads).toEqual({ fullSnapshots: 0, orderDerivations: 0 });
  const owner = getIosCompanionDatabaseOwner();
  const indexed = await owner.read(db => owner.readNodeOrder(db));
  expect(indexed).toEqual(await owner.readSnapshot(db => loadDerivedNodeOrderWithDbPort(db, undefined, true)));
  const complete = await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
  const facts = (value: WorkspaceSnapshot | null) => value && { ...value, trashedNodeIds: [...value.trashedNodeIds].sort() };
  expect(facts(snapshot)).toEqual(facts(complete));
}

for (const [name, write] of Object.entries(WRITES)) {
  it(`publishes a ${name} without reading or ordering the whole library`, async () => {
    await write();
    await expectCompleteReread(await refreshCompanionWorkspaceAfterMutation());
  });

  it(`reads the same number of rows for a ${name} however large the library is`, async () => {
    expect(await writeRows(400, write)).toBe(await writeRows(100, write));
  });
}

// The first Virtual folder also creates the Virtual root, which the refresh must name as well.
const firstIndex = () => mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index-new', title: 'new' });

it('publishes the first Virtual folder and its new root without reading or ordering the whole library', async () => {
  await openLibrary(100, false);
  const before = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(before.nodesById['special-virtual-root']).toBeUndefined();
  await firstIndex();
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot!.nodesById['index-new']!.parentNodeId).toBe('special-virtual-root');
  await expectCompleteReread(snapshot);
});

it('reads the same number of rows for the first Virtual folder however large the library is', async () => {
  expect(await writeRows(400, firstIndex, false)).toBe(await writeRows(100, firstIndex, false));
});

it('orders a restored subtree and a hand-ordered folder exactly as a complete reread does', async () => {
  const before = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(before.nodeOrder.filter(id => ['a', 'b', 'c'].includes(id))).toEqual(['c', 'a', 'b']);
  await mutateCompanionWorkspace({ type: 'restore', nodeId: 'gone' });
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'c', title: 'zzz' });
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'b', parentNodeId: 'other' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot!.nodeOrder.filter(id => ['a', 'b', 'c', 'gone', 'gx'].includes(id))).toEqual(['c', 'a', 'gone', 'gx', 'b']);
  await expectCompleteReread(snapshot);
});

it('builds the same change from the narrow read as from the whole library', async () => {
  const commands: WorkspaceMetadataCommand[] = [
    { type: 'rename', nodeId: 'a', title: 'Renamed' }, { type: 'move', nodeId: 'a', parentNodeId: 'other' },
    { type: 'shelve', nodeId: 'b' }, { type: 'restore', nodeId: 'gone' },
    { type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' },
    { type: 'create-dive', nodeId: 'dive-new', title: 'new', sourceId: 'a' },
    { type: 'create-index', nodeId: 'index-new', title: 'new' }
  ];
  const owner = getIosCompanionDatabaseOwner();
  await owner.readSnapshot(async db => {
    const complete = (await loadIosCompanionWorkspaceSnapshot(db))!;
    const now = '2026-11-21T00:00:00.000Z';
    // Content projections never carry the Readwise lifecycle; version records take it from the stored version instead.
    const withoutLifecycle = (mutation: ReturnType<typeof buildWorkspaceMetadataMutation>) => ({ ...mutation,
      nodes: mutation.nodes.map(node => { const copy = { ...node }; delete copy.readwiseRemoteLifecycle; return copy; }) });
    for (const command of commands) {
      const roots = ['rename', 'create', 'create-dive', 'create-index'].includes(command.type) ? [] : [command.nodeId];
      const paths = command.type === 'move' || command.type === 'create' ? [command.parentNodeId]
        : command.type === 'rename' || command.type === 'create-dive' || command.type === 'create-index' ? [command.nodeId] : [];
      const narrow = (await loadCompanionWriteNodes(db, roots, { sequentialReading: true, pathIds: paths }))!;
      expect(withoutLifecycle(buildWorkspaceMetadataMutation(command, narrow, now)))
        .toEqual(withoutLifecycle(buildWorkspaceMetadataMutation(command, complete.nodesById, now)));
    }
    // A move into its own subtree is refused from the narrow read as well.
    const narrow = (await loadCompanionWriteNodes(db, ['folder'], { sequentialReading: true, pathIds: ['a'] }))!;
    expect(() => buildWorkspaceMetadataMutation({ type: 'move', nodeId: 'folder', parentNodeId: 'a' }, narrow, now))
      .toThrow('node_parent');
  });
});

it('keeps the whole-library read and refresh when Sequential Reading is in reach of a move', async () => {
  library!.database.prepare('UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = ?').run('other');
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' });
  await refreshCompanionWorkspaceAfterMutation();
  expect(reads.fullSnapshots).toBe(2);
});
