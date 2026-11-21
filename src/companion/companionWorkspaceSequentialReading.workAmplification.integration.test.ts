// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncStateWriters';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../store/workspaceSnapshotSequentialReading';

// Work-amplification check WA-056: phone writes in reach of a Sequential Reading folder, counted, never timed.
// The folder is maintained from a bounded read (its children and the subtrees of its done or dismissed topics), so the
// write, the refresh and the index neither read nor order the whole library. A Sequential Reading topic orders its items
// by the whole library's order and keeps one whole-library read; companionWorkspaceWrites.workAmplification counts it.
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
afterEach(async () => { await library?.close(); library = null; });

const sequentialReading = (state: 'active' | 'locked' | 'done') => ({ intervalDurationMs: 1, intervalGrowthFactor: 2,
  lastHandledAt: '2026-11-21T00:00:00.000Z', nextAt: '2026-11-22T00:00:00.000Z', priority: 5, readingPosition: 0,
  repetitionCount: 0, state });

async function versions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  expect(reads).toEqual({ fullSnapshots: 0, orderDerivations: 0 });
  const owner = getIosCompanionDatabaseOwner();
  const indexed = await owner.read(db => owner.readNodeOrder(db));
  expect(indexed).toEqual(await owner.readSnapshot(db => loadDerivedNodeOrderWithDbPort(db, undefined, true)));
  const complete = await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
  const facts = (value: WorkspaceSnapshot | null) => value && { ...value, trashedNodeIds: [...value.trashedNodeIds].sort() };
  expect(facts(snapshot)).toEqual(facts(complete));
}

// A Sequential Reading folder as a Readwise 'books' folder holds it: topics with bodies, the first one done, then one active
// and the rest locked. When `held`, an unread item below the done topic still holds the folder's slot, so all are locked.
async function openBooks(size: number, held = false) {
  await library?.close();
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  for (const id of ['folder', 'other']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'folder', parentNodeId: null, title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'c', kind: 'topic', parentNodeId: 'folder', title: 'c' });
  const base = (await refreshCompanionWorkspaceAfterMutation())!.nodesById.folder!;
  const topic = (id: string, parentNodeId: string): WorkspaceNodeSnapshot =>
    ({ ...base, id, kind: 'topic', parentNodeId, title: id, content: 'Reading content' });
  const definitions = [{ ...base, id: 'books', kind: 'folder' as const, parentNodeId: null, title: 'books' },
    ...['b1', 'b2', 'b3', 'b4', 'b5'].map(id => topic(id, 'books')), topic('b1x', 'b1'), topic('b5x', 'b5')];
  const records = await Promise.all(definitions.map(node => toWorkspaceNativeNodeVersion({ ...node, currentVersionId: null }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }), { kind: 'business' });
  // A sync publishes the nodes it applied.
  await refreshCompanionWorkspaceAfterMutation(null);
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'b1', reading: sequentialReading('done') });
  if (!held) await saveCompanionSyncNodeReadingRecord({ nodeId: 'b1x', reading: sequentialReading('done') });
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'b2', reading: sequentialReading(held ? 'locked' : 'active') });
  for (const id of ['b3', 'b4', 'b5', 'b5x']) await saveCompanionSyncNodeReadingRecord({ nodeId: id, reading: sequentialReading('locked') });
  library!.database.prepare('UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = ?').run('books');
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
}

const BOOKS_WRITES: Record<string, () => Promise<unknown>> = {
  'move out of': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'b2', parentNodeId: 'other' }),
  'move a locked subtree out of': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'b5', parentNodeId: 'other' }),
  'move into': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'c', parentNodeId: 'books' }),
  'move within': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'b3', parentNodeId: 'b4' }),
  'shelve in': () => mutateCompanionWorkspace({ type: 'shelve', nodeId: 'b2' }),
  'move the done topic out of': () => mutateCompanionWorkspace({ type: 'move', nodeId: 'b1', parentNodeId: 'other' }),
  'batch move out of': async () => moveCompanionBatch(await versions(['b2', 'b3']), 'other')
};

/** What the whole-library maintenance would decide for the same write, keyed by node. */
async function wholeLibraryReadings(write: string) {
  const owner = getIosCompanionDatabaseOwner();
  const complete = (await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db)))!;
  const now = '2026-11-21T00:00:00.000Z';
  const commands: WorkspaceMetadataCommand[] = write === 'batch move out of'
    ? [{ type: 'move', nodeId: 'b2', parentNodeId: 'other' }, { type: 'move', nodeId: 'b3', parentNodeId: 'other' }]
    : [BOOKS_COMMANDS[write]!];
  let after = complete.nodesById;
  for (const command of commands) {
    after = { ...after, ...Object.fromEntries(buildWorkspaceMetadataMutation(command, after, now).nodes.map(node => [node.id, node])) };
  }
  return Object.fromEntries(maintainWorkspaceSnapshotSequentialReading({ before: complete.nodesById, after,
    changedNodeIds: commands.map(command => command.nodeId), nodeOrder: complete.nodeOrder, now })
    .map(change => [change.nodeId, change.afterReading?.state ?? null]));
}

const BOOKS_COMMANDS: Record<string, WorkspaceMetadataCommand> = {
  'move out of': { type: 'move', nodeId: 'b2', parentNodeId: 'other' },
  'move a locked subtree out of': { type: 'move', nodeId: 'b5', parentNodeId: 'other' },
  'move into': { type: 'move', nodeId: 'c', parentNodeId: 'books' },
  'move within': { type: 'move', nodeId: 'b3', parentNodeId: 'b4' },
  'shelve in': { type: 'shelve', nodeId: 'b2' },
  'move the done topic out of': { type: 'move', nodeId: 'b1', parentNodeId: 'other' }
};

for (const [name, write] of Object.entries(BOOKS_WRITES)) for (const held of [false, true]) {
  it(`maintains a Sequential Reading folder${held ? ' with a held slot' : ''} without reading the library for a ${name} it`, async () => {
    await openBooks(100, held);
    const expected = await wholeLibraryReadings(name);
    reads.fullSnapshots = 0;
    reads.orderDerivations = 0;
    await write();
    const snapshot = await refreshCompanionWorkspaceAfterMutation();
    // The narrow write decides the same reading states as the whole-library maintenance.
    expect(Object.fromEntries(Object.keys(expected).map(id => [id, snapshot!.nodesById[id]!.reading?.state ?? null]))).toEqual(expected);
    await expectCompleteReread(snapshot);
  });

  it(`reads the same number of rows for a ${name} a Sequential Reading folder${held ? ' with a held slot' : ''} however large the library is`, async () => {
    const rows = async (size: number) => {
      await openBooks(size, held);
      sqlRecording.start({ label: 'books-write', maxGroups: 2000 });
      try {
        await write();
        await refreshCompanionWorkspaceAfterMutation();
      } finally { sqlRecording.stop(); }
      return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
    };
    expect(await rows(400)).toBe(await rows(100));
  });
}

it('changes reading states for the Sequential Reading folder writes it counts', async () => {
  // Guards the count tests above from passing on writes that leave every reading as it was.
  const changes: Record<string, Record<string, string | null>> = {};
  for (const held of [false, true]) for (const name of ['move out of', 'move the done topic out of', 'batch move out of']) {
    await openBooks(100, held);
    changes[`${held ? 'held ' : ''}${name}`] = await wholeLibraryReadings(name);
  }
  expect(changes).toEqual({
    // The next locked topic takes the slot; a locked topic moved out of the folder is unlocked.
    'move out of': { b3: 'active' }, 'move the done topic out of': {}, 'batch move out of': { b4: 'active', b3: 'active' },
    // The item below the done topic holds the slot until the done topic leaves the folder.
    'held move out of': { b2: 'active' }, 'held move the done topic out of': { b2: 'active' },
    'held batch move out of': { b2: 'active', b3: 'active' }
  });
});
