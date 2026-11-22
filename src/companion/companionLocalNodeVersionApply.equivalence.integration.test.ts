// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { settleCompanionNodeVersionCollections } from '../shared/platform/companion/runtime/companionNodeHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncStateWriters';
import type { WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

// T835: a local edit stored through the local write path leaves the database exactly as the remote apply chain did.
const path = vi.hoisted(() => ({ legacy: false, uuid: 0, remoteApplies: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companionUuid', () => ({
  createCompanionUuid: () => `00000000-0000-4000-8000-${String(++path.uuid).padStart(12, '0')}`
}));
vi.mock('../../lib/core/sync/syncNodeApplyExecutor', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/syncNodeApplyExecutor')>();
  return { ...original, applySyncNodesWithDbPort: (...args: Parameters<typeof original.applySyncNodesWithDbPort>) => {
    if (!path.legacy) path.remoteApplies += 1;
    return original.applySyncNodesWithDbPort(...args);
  } };
});
vi.mock('../../lib/core/sync/localNodeVersionApply', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/localNodeVersionApply')>();
  const { applySyncNodesWithDbPort } = await import('../../lib/core/sync/syncNodeApplyExecutor');
  return { ...original, applyLocalNodeVersionsWithDbPort: (...args: Parameters<typeof original.applyLocalNodeVersionsWithDbPort>) =>
    path.legacy ? applySyncNodesWithDbPort(args[0], args[1], { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: args[2] })
      : original.applyLocalNodeVersionsWithDbPort(...args) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; vi.useRealTimers(); vi.restoreAllMocks(); });

const reading = (state: 'active' | 'locked') => ({ intervalDurationMs: 1, intervalGrowthFactor: 2,
  lastHandledAt: '2026-11-21T00:00:00.000Z', nextAt: '2026-11-22T00:00:00.000Z', priority: 5, readingPosition: 0,
  repetitionCount: 0, state });

// An edit, an undo or redo of the latest edit, or a batch action on the named nodes.
type Step = WorkspaceMetadataCommand | { type: 'undo' | 'redo' }
  | { type: 'batch-move'; nodeIds: string[]; parentNodeId: string } | { type: 'batch-trash' | 'batch-restore'; nodeIds: string[] };

async function versions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

async function runStep(step: Step) {
  switch (step.type) {
    case 'undo': case 'redo':
      return replayCompanionFlowHistory(companionFlowHistoryKey('Search'), step.type, createEmptyReviewSession());
    case 'batch-move': return moveCompanionBatch(await versions(step.nodeIds), step.parentNodeId);
    case 'batch-trash': return moveCompanionBatchToTrash(await versions(step.nodeIds));
    case 'batch-restore': return restoreCompanionBatchFromTrash(await versions(step.nodeIds));
    default: return mutateCompanionWorkspace(step);
  }
}

async function run(legacy: boolean, commands: Step[]) {
  await library?.close();
  path.legacy = true;
  path.uuid = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T00:00:00.000Z'));
  let random = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() =>
    `00000000-0000-4000-9000-${String(++random).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`);
  library = await createSearchLibrary(40, 64);
  for (const id of ['folder', 'other']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'folder', parentNodeId: null, title: id });
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'ax', kind: 'item', parentNodeId: 'a', title: 'ax' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'gone', kind: 'topic', parentNodeId: 'other', title: 'gone' });
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: reading('active') });
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'gone', reading: reading('active') });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'gone' });
  await refreshCompanionWorkspaceAfterMutation(null);
  await settleCompanionNodeVersionCollections();
  const before = dump(library.database);
  path.legacy = legacy;
  path.remoteApplies = 0;
  for (const command of commands) {
    vi.setSystemTime(new Date(Date.now() + 1000));
    await runStep(command);
  }
  await settleCompanionNodeVersionCollections();
  // The fixture stamps its own rows with the real clock, so only what the commands changed is compared.
  const after = dump(library.database);
  return Object.fromEntries(Object.keys(after).map(table => {
    const was = new Set(before[table] ?? []);
    const now = new Set(after[table]);
    return [table, { added: after[table]!.filter(row => !was.has(row)), removed: [...was].filter(row => !now.has(row)) }];
  }));
}

function dump(database: Awaited<ReturnType<typeof createSearchLibrary>>['database']) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => {
    const rows = database.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
    // Folder backup revisions and the library epoch are random; article registrations use SQLite's own clock.
    return [name, rows.map(row => JSON.stringify(row, (key, value: unknown) =>
      key === 'registered_at' || key.endsWith('_epoch') ? null : row.key === 'folder_backup_source_revision' && key === 'value' ? 'revision'
        : value instanceof Uint8Array || Buffer.isBuffer(value) ? Buffer.from(value as Uint8Array).toString('base64') : value)).sort()];
  }));
}

const SCENARIOS: Record<string, Step[]> = {
  move: [{ type: 'move', nodeId: 'a', parentNodeId: 'other' }],
  'folder move': [{ type: 'move', nodeId: 'folder', parentNodeId: 'other' }],
  rename: [{ type: 'rename', nodeId: 'b', title: 'Renamed' }],
  create: [{ type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' }],
  'move to Trash': [{ type: 'delete', nodeId: 'a' }],
  restore: [{ type: 'restore', nodeId: 'gone' }],
  shelve: [{ type: 'shelve', nodeId: 'b' }, { type: 'unshelve', nodeId: 'b' }],
  priority: [{ type: 'set-priority', nodeId: 'c', priority: 2 }],
  'Dive creation': [{ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' }],
  'Virtual folder creation': [{ type: 'create-index', nodeId: 'index', title: 'index' }],
  'several edits': [{ type: 'move', nodeId: 'b', parentNodeId: 'other' }, { type: 'rename', nodeId: 'b', title: 'x' },
    { type: 'delete', nodeId: 'b' }, { type: 'restore', nodeId: 'b' }],
  'undo and redo of a move': [{ type: 'move', nodeId: 'a', parentNodeId: 'other' }, { type: 'undo' }, { type: 'redo' }],
  'undo of a move to Trash': [{ type: 'delete', nodeId: 'a' }, { type: 'undo' }],
  'undo and redo of a restore': [{ type: 'restore', nodeId: 'gone' }, { type: 'undo' }, { type: 'redo' }],
  'undo of a rename': [{ type: 'rename', nodeId: 'b', title: 'Renamed' }, { type: 'undo' }],
  'batch move': [{ type: 'batch-move', nodeIds: ['a', 'b'], parentNodeId: 'other' }],
  'batch move to Trash': [{ type: 'batch-trash', nodeIds: ['b', 'c'] }],
  'batch restore': [{ type: 'batch-restore', nodeIds: ['gone'] }],
  'undo and redo of a batch move': [{ type: 'batch-move', nodeIds: ['a', 'b'], parentNodeId: 'other' }, { type: 'undo' }, { type: 'redo' }]
};

for (const [name, commands] of Object.entries(SCENARIOS)) {
  it(`stores a ${name} exactly as the remote apply chain does`, async () => {
    const legacy = await run(true, commands);
    const local = await run(false, commands);
    // Every command took the local write path rather than falling back to the remote apply chain.
    expect(path.remoteApplies).toBe(0);
    for (const table of Object.keys(legacy)) expect({ table, rows: local[table] }).toEqual({ table, rows: legacy[table] });
  });
}
