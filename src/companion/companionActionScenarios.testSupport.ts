import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { addCompanionDiveSource, removeCompanionDiveSources } from '../shared/platform/companion/runtime/companionDiveSources';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { changeCompanionIndexSource } from '../shared/platform/companion/runtime/companionIndexSources';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveCompanionSyncNodeReadingRecord, saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncStateWriters';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

// Phone actions shared by the statement budget and the library scale checks. Each run prepares its own library,
// calls `startWrite` where the action starts and returns the refresh that follows it.

export type Phase = 'write' | 'refresh';
export const recording: { phase: Phase | null; onStart?: () => Promise<void> } = { phase: null };
export async function startWrite() {
  await recording.onStart?.();
  recording.phase = 'write';
}
export type ActionRun = () => Promise<{ refresh: () => Promise<unknown> }>;

export let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
export async function closeActionLibrary() {
  await library?.close();
  library = null;
}

let padding = 0;
/** Content the actions never touch. Zero keeps the fixture the statement budgets were audited against. */
export function setActionLibraryPadding(count: number) { padding = count; }

async function padLibrary() {
  for (let index = 0; index < padding; index++) {
    const folder = `filler-folder-${Math.floor(index / 50)}`;
    if (index % 50 === 0) await mutateCompanionWorkspace({ type: 'create', nodeId: folder, kind: 'folder', parentNodeId: null, title: folder });
    const nodeId = `filler-${index}`;
    await mutateCompanionWorkspace({ type: 'create', nodeId, kind: 'topic', parentNodeId: folder, title: nodeId });
    if (index % 10 === 1) await mutateCompanionWorkspace({ type: 'create', nodeId: `${nodeId}-item`, kind: 'item', parentNodeId: nodeId, title: nodeId });
    if (index % 20 === 3) await mutateCompanionWorkspace({ type: 'delete', nodeId });
  }
}

export async function openWorkspace() {
  library = await createSearchLibrary(padding || 100, 16);
  library.database.prepare("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES ('bulk','folder','bulk','','0','0')").run();
  library.database.prepare("UPDATE nodes SET parent_id = 'bulk' WHERE parent_id IS NULL AND id NOT LIKE 'special-%' AND id != 'bulk'").run();
  for (const id of ['folder', 'other']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'folder', parentNodeId: null, title: id });
  for (const id of ['a', 'b', 'c', 'gone', 'shelved']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'ax', kind: 'item', parentNodeId: 'a', title: 'ax' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'gone' });
  await mutateCompanionWorkspace({ type: 'shelve', nodeId: 'shelved' });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' });
  await mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index', title: 'index' });
  await changeCompanionIndexSource('index', 'c', 'add');
  await padLibrary();
  await writeIosCompanionDatabase(db => saveLocalCurrentParentOrderWithDbPort(db, { parentId: 'folder',
    childIds: ['c', 'a', 'gone', 'b', 'shelved'], now: '2026-11-21T00:00:00.000Z', hostName: 'Search' }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
}

export const flowNow = '2026-10-25T08:00:00.000Z';
export async function openReviewFlow(mode: 'review-first' | 'reading-only') {
  library = await createSearchLibrary(0);
  await padLibrary();
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, flowNow,
  ['a', 'b', 'c'], mode === 'review-first' ? 'item' : 'topic');
  const session = (await openCompanionDailyFlow({ now: flowNow, mode })).session;
  if (!session.currentNodeId) throw new Error('flow_without_current_node');
  return { ...session, isAnswerRevealed: true };
}
export const workspaceSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

const replayMove = (mode: 'undo' | 'redo') => async () => {
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' });
  const history = companionFlowHistoryKey('Search');
  if (mode === 'redo') await replayCompanionFlowHistory(history, 'undo', createEmptyReviewSession());
  await refreshCompanionWorkspaceAfterMutation();
  return () => replayCompanionFlowHistory(history, mode, createEmptyReviewSession());
};

export async function currentVersions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

const workspace = (write: () => Promise<unknown>, prepare?: () => Promise<() => Promise<unknown>>) => async () => {
  await openWorkspace();
  const run = prepare ? await prepare() : write;
  await startWrite();
  await run();
  return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
};

export const ACTIONS: Record<string, ActionRun> = {
  rename: workspace(() => mutateCompanionWorkspace({ type: 'rename', nodeId: 'a', title: 'Renamed' })),
  move: workspace(() => mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' })),
  'folder move': workspace(() => mutateCompanionWorkspace({ type: 'move', nodeId: 'other', parentNodeId: 'folder' })),
  'batch move': workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['a', 'b']);
    return () => moveCompanionBatch(versions, 'other');
  }),
  create: workspace(() => mutateCompanionWorkspace({ type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' })),
  'move to Trash': workspace(() => mutateCompanionWorkspace({ type: 'delete', nodeId: 'b' })),
  'batch move to Trash': workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['b', 'c']);
    return () => moveCompanionBatchToTrash(versions);
  }),
  restore: workspace(() => mutateCompanionWorkspace({ type: 'restore', nodeId: 'gone' })),
  'batch restore': workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['gone']);
    return () => restoreCompanionBatchFromTrash(versions);
  }),
  shelve: workspace(() => mutateCompanionWorkspace({ type: 'shelve', nodeId: 'b' })),
  unshelve: workspace(() => mutateCompanionWorkspace({ type: 'unshelve', nodeId: 'shelved' })),
  priority: workspace(() => mutateCompanionWorkspace({ type: 'set-priority', nodeId: 'b', priority: 3 })),
  'undo move': workspace(() => Promise.resolve(), replayMove('undo')),
  'redo move': workspace(() => Promise.resolve(), replayMove('redo')),
  'Dive creation': workspace(() => mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive-new', title: 'new', sourceId: 'a' })),
  'Virtual folder creation': workspace(() => mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index-new', title: 'new' })),
  'Dive source addition': workspace(() => addCompanionDiveSource('dive', 'c')),
  'Dive source removal': workspace(() => removeCompanionDiveSources('dive', ['b'])),
  'Virtual folder source addition': workspace(() => changeCompanionIndexSource('index', 'a', 'add')),
  'Virtual folder source removal': workspace(() => changeCompanionIndexSource('index', 'c', 'remove')),
  'Dive to Virtual folder conversion': workspace(() => convertCompanionDiveDirectory('dive', 'index', JSON.stringify(DIVE_NODE_FILTER))),
  'Virtual folder to Dive conversion': workspace(() => convertCompanionDiveDirectory('index', 'dive', JSON.stringify(createManualVirtualNodeFilter()))),
  'reading progress': workspace(() => saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: {
    intervalDurationMs: 1, intervalGrowthFactor: 2, lastHandledAt: '2026-11-21T00:00:00.000Z', nextAt: '2026-11-22T00:00:00.000Z',
    priority: 5, readingPosition: 3, repetitionCount: 1, state: 'active' } })),
  'scroll position': workspace(() => saveCompanionSyncNodeViewState({ nodeId: 'a', scrollTop: 120 })),
  'body save': async () => {
    await openWorkspace();
    const source = await readCompanionContentSource('a', 'editor');
    await startWrite();
    await saveCompanionContentEdit({ nodeId: 'a', baseVersionId: source.versionId, versionId: 'body-edit',
      content: 'Edited on the phone', updatedAt: '2026-11-21T00:00:01.000Z' });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation(undefined, 'a') };
  },
  grade: async () => {
    const session = await openReviewFlow('review-first');
    const snapshot = await workspaceSnapshot();
    await startWrite();
    await persistFlowMutation({ action: 'grade', grade: 3, nodeId: session.currentNodeId!, now: flowNow, snapshot,
      history: { key: 'flow_history:daily', mode: 'review-first', session } });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
  },
  'topic Read': async () => {
    const session = await openReviewFlow('reading-only');
    const snapshot = await workspaceSnapshot();
    await startWrite();
    await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now: flowNow, snapshot,
      history: { key: 'flow_history:daily', mode: 'reading-only', session } });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
  }
};
