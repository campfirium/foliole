import {
  canMergeWorkspaceContentProjection, canMergeWorkspaceTrashProjection, mergeWorkspaceContentProjection
} from '../../../../lib/core/database/workspaceContentProjection.js';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import { normalizeWorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshotContract.js';
import type { WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import type { WorkspaceNodeAnchorKinds } from '../../../../lib/core/nodes/workspaceNodePriorityState.js';
import type { DbPort } from '../../../../lib/core/sync/dbPort.js';

import { mergeCompanionLearningSnapshot } from './companionLearningSnapshotRefresh.js';
import { mergeCompanionNodeViews } from './companionNodeViewProjection.js';
import { companionWorkspaceSnapshots, prepareCompanionWorkspaceIndex, registerCompanionWorkspaceRefresh } from './companionWorkspaceSnapshotStore.js';
import { timeCompanionActivity } from './runtime/companionActivityTiming.js';
import { attachOpenCompanionVirtualFolderResults } from './runtime/companionVirtualFolderResults.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { mergeCompanionLocalState } from './sync/workspace-state/companionLocalStateProjection.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

function readSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  return timeCompanionActivity('workspace-refresh', () => readWorkspaceSnapshot(input));
}

async function readWorkspaceSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  const owner = getIosCompanionDatabaseOwner();
  const revision = owner.nodePriorityRevision;
  let orderedNodeIds: readonly string[] | undefined;
  let anchorKinds: WorkspaceNodeAnchorKinds | undefined;
  const snapshot = await owner.readSnapshot(async db => {
    const scoped = input.current && input.scope.kind === 'nodes'
      ? await (!input.scope.structure ? readScoped : input.scope.trash ? readScopedTrash : noScopedRead)(db, input.current, input.scope)
      : null;
    // A move to Trash only drops the trashed subtree from the visible order, which the merge already did.
    if (scoped && input.scope.kind === 'nodes' && input.scope.structure && input.scope.trash) orderedNodeIds = scoped.nodeOrder;
    const next = scoped ?? await loadIosCompanionWorkspaceSnapshot(db, (ids, kinds) => { orderedNodeIds = ids; anchorKinds = kinds; });
    return next && attachOpenCompanionVirtualFolderResults(db, next);
  });
  if (snapshot) await prepareCompanionWorkspaceIndex(owner, snapshot, revision, orderedNodeIds, anchorKinds);
  return snapshot;
}

/** Returns null when the committed scope cannot be proven against this baseline. */
async function readScoped(db: DbPort, current: WorkspaceSnapshot, scope: NodeScope) {
  const reviewed = scope.reviewNodeIds ?? [];
  const reading = scope.readingNodeIds ?? [];
  if (!scope.nodeIds.length) {
    const learning = await mergeCompanionLearningSnapshot(db, current, reviewed, reading);
    return learning && mergeCompanionLocalState(db, learning, scope);
  }
  const roots = new Set([...scope.nodeIds, ...reviewed, ...reading]);
  let next = current;
  if (roots.size) {
    const { nodes, expected } = await loadScopedNodes(db, current, roots);
    if (!canMergeWorkspaceContentProjection(current, nodes, expected, reviewed, reading)) return null;
    next = await mergeCompanionNodeViews(db, mergeWorkspaceContentProjection(current, nodes), Object.keys(nodes));
  }
  return mergeCompanionLocalState(db, next, scope);
}

async function noScopedRead() { return null; }

/** A move to Trash only sets `deletedAt` on a named subtree, so it is merged instead of rereading the library. */
async function readScopedTrash(db: DbPort, current: WorkspaceSnapshot, scope: NodeScope) {
  if (!scope.nodeIds.length) return null;
  const reviewed = scope.reviewNodeIds ?? [];
  const reading = scope.readingNodeIds ?? [];
  const { nodes, expected } = await loadScopedNodes(db, current, new Set([...scope.nodeIds, ...reviewed, ...reading]));
  if (!canMergeWorkspaceTrashProjection(current, nodes, expected, reviewed, reading)) return null;
  // Trash membership, visible order and the active node derive from the merged nodes.
  const merged = normalizeWorkspaceSnapshot(mergeWorkspaceContentProjection(current, nodes));
  return mergeCompanionLocalState(db, await mergeCompanionNodeViews(db, merged, Object.keys(nodes)), scope);
}

async function loadScopedNodes(db: DbPort, current: WorkspaceSnapshot, roots: ReadonlySet<string>) {
  const projection = await loadCompanionContentProjection(db, [...roots]);
  const nodes = Object.fromEntries(Object.entries(projection).map(([id, node]) => {
    const lifecycle = current.nodesById[id]?.readwiseRemoteLifecycle;
    return [id, lifecycle !== undefined ? { ...node, readwiseRemoteLifecycle: lifecycle } : node];
  }));
  const expected = Object.values(current.nodesById)
    .filter(node => roots.has(node.id) || (node.parentNodeId !== null && roots.has(node.parentNodeId)))
    .map(node => node.id);
  return { nodes, expected };
}

export async function refreshCompanionWorkspaceSnapshot(scope?: WorkspaceRefreshScope) {
  if (scope) registerCompanionWorkspaceRefresh(scope);
  if (!companionWorkspaceSnapshots.getSnapshot()) companionWorkspaceSnapshots.register({ kind: 'full' });
  await companionWorkspaceSnapshots.refresh(readSnapshot);
  return companionWorkspaceSnapshots.getSnapshot();
}
