import { deriveScopedVisibleNodeOrder, loadParentOrderSourcesWithDbPort } from '../../../../lib/core/database/parentChildOrder.js';
import {
  canMergeWorkspaceContentProjection, canMergeWorkspaceMetadataProjection, canMergeWorkspaceTrashProjection,
  mergeWorkspaceContentProjection, workspaceMetadataOrderParents
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
import { markWholeLibraryWork } from './runtime/companionWholeLibraryWork.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { mergeCompanionLocalState } from './sync/workspace-state/companionLocalStateProjection.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

function readSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  return timeCompanionActivity('workspace-refresh', () => readWorkspaceSnapshot(input));
}

const readTotals = { reads: 0, queueMs: 0, readMs: 0 };

/** Running totals of snapshot reads: a caller diffs two calls to see what its refresh waited for and read. */
export function companionWorkspaceReadTotals() {
  return { ...readTotals };
}

async function readWorkspaceSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  const owner = getIosCompanionDatabaseOwner();
  const revision = owner.nodePriorityRevision;
  let orderedNodeIds: readonly string[] | undefined;
  let anchorKinds: WorkspaceNodeAnchorKinds | undefined;
  const requestedAt = performance.now();
  let startedAt = requestedAt;
  try {
    const snapshot = await owner.readSnapshot(async db => {
      startedAt = performance.now();
      const scoped = input.current && input.scope.kind === 'nodes'
        ? await (input.scope.metadata ? readScopedMetadata : !input.scope.structure ? readScoped
          : input.scope.trash ? readScopedTrash : noScopedRead)(db, input.current, input.scope)
        : null;
      // The structural merges already derived the visible order.
      if (scoped && input.scope.kind === 'nodes' && (input.scope.metadata || (input.scope.structure && input.scope.trash))) {
        orderedNodeIds = scoped.nodeOrder;
      }
      if (!scoped) markWholeLibraryWork('full-refresh');
      const next = scoped ?? await loadIosCompanionWorkspaceSnapshot(db, (ids, kinds) => { orderedNodeIds = ids; anchorKinds = kinds; });
      return next && attachOpenCompanionVirtualFolderResults(db, next);
    });
    if (snapshot) await prepareCompanionWorkspaceIndex(owner, snapshot, revision, orderedNodeIds, anchorKinds);
    return snapshot;
  } finally {
    // The wait before the read starts covers both the owner queue and the serialized snapshot connection.
    readTotals.reads += 1;
    readTotals.queueMs += startedAt - requestedAt;
    readTotals.readMs += performance.now() - startedAt;
  }
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

/**
 * A metadata write names every node it changed, so it is merged and only the parents it touches are ordered
 * again; every other parent keeps its order from the baseline.
 */
async function readScopedMetadata(db: DbPort, current: WorkspaceSnapshot, scope: NodeScope) {
  if (!scope.nodeIds.length) return null;
  const reviewed = scope.reviewNodeIds ?? [];
  const reading = scope.readingNodeIds ?? [];
  const roots = new Set([...scope.nodeIds, ...reviewed, ...reading]);
  // Children keep their projection unless a named node appears, disappears or changes visibility; a move or a
  // rename keeps them as they are, so only the named nodes are read and the cost does not grow with the subtree.
  // A named node hidden in the baseline (a restore) is bound to change visibility, so its children are read at once.
  const exact = !hiddenInBaseline(current, roots);
  let { nodes, expected } = await loadScopedNodes(db, current, roots, exact);
  if (exact && changesChildVisibility(current, nodes)) {
    ({ nodes, expected } = await loadScopedNodes(db, current, roots));
  }
  if (!canMergeWorkspaceMetadataProjection(current, nodes, expected, reviewed, reading)) return null;
  // A node created on this phone has no Readwise source.
  for (const [id, node] of Object.entries(nodes)) if (!current.nodesById[id]) nodes[id] = { ...node, readwiseRemoteLifecycle: null };
  const merged = mergeWorkspaceContentProjection(current, nodes);
  const parents = workspaceMetadataOrderParents(current, merged.nodesById, nodes);
  const nodeOrder = parents.size ? deriveScopedVisibleNodeOrder(Object.values(merged.nodesById).map(node => ({
    id: node.id, parent_id: node.parentNodeId, title: node.title, created_at: node.createdAt, deleted_at: node.deletedAt ?? null
  })), current.nodeOrder, parents, await loadParentOrderSourcesWithDbPort(db, [...parents])) : current.nodeOrder;
  // The projection is authoritative for the named nodes, so their earlier Trash facts must not outlive a restore.
  const named = new Set(Object.keys(nodes));
  const next = normalizeWorkspaceSnapshot({ ...merged, nodeOrder, trashedNodeIds: merged.trashedNodeIds.filter(id => !named.has(id)),
    trashedNodeDeletedAtById: Object.fromEntries(Object.entries(merged.trashedNodeDeletedAtById ?? {}).filter(([id]) => !named.has(id))) });
  return mergeCompanionLocalState(db, await mergeCompanionNodeViews(db, next, Object.keys(nodes)), scope);
}

/** Whether a named node exists in the baseline but is in Trash or outside the visible order. */
function hiddenInBaseline(current: WorkspaceSnapshot, roots: ReadonlySet<string>) {
  const visible = new Set(current.nodeOrder);
  return [...roots].some(id => current.nodesById[id] && (current.nodesById[id]!.deletedAt || !visible.has(id)));
}

/** Whether a named node's children may project differently: Trash state or visibility of an existing node changed. */
function changesChildVisibility(current: WorkspaceSnapshot, nodes: WorkspaceSnapshot['nodesById']) {
  const visible = new Set(current.nodeOrder);
  return Object.values(nodes).some(node => {
    const previous = current.nodesById[node.id];
    if (!previous) return false;
    if ((previous.deletedAt ?? null) !== (node.deletedAt ?? null)) return true;
    const parentVisible = node.parentNodeId === null || (visible.has(node.parentNodeId) && !nodes[node.parentNodeId]?.deletedAt);
    return visible.has(node.id) !== (parentVisible && !node.deletedAt);
  });
}

async function loadScopedNodes(db: DbPort, current: WorkspaceSnapshot, roots: ReadonlySet<string>, exact = false) {
  const projection = await loadCompanionContentProjection(db, [...roots], exact);
  const nodes = Object.fromEntries(Object.entries(projection).map(([id, node]) => {
    const lifecycle = current.nodesById[id]?.readwiseRemoteLifecycle;
    return [id, lifecycle !== undefined ? { ...node, readwiseRemoteLifecycle: lifecycle } : node];
  }));
  const expected = Object.values(current.nodesById)
    .filter(node => roots.has(node.id) || (!exact && node.parentNodeId !== null && roots.has(node.parentNodeId)))
    .map(node => node.id);
  return { nodes, expected };
}

export async function refreshCompanionWorkspaceSnapshot(scope?: WorkspaceRefreshScope) {
  if (scope) registerCompanionWorkspaceRefresh(scope);
  if (!companionWorkspaceSnapshots.getSnapshot()) companionWorkspaceSnapshots.register({ kind: 'full' });
  await companionWorkspaceSnapshots.refresh(readSnapshot);
  return companionWorkspaceSnapshots.getSnapshot();
}
