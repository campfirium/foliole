import {
  HOME_NODE_ID,
  TRASH_NODE_ID,
  isHomeNode,
  isTrashNode,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceListChildrenIndex } from './workspaceListChildrenIndex';

interface FolderContentCounts {
  byFolderId: ReadonlyMap<string, number>;
  hasCycles: boolean;
  libraryTotal: number;
  subtreeTotals: Map<string, number>;
}

interface CountSource {
  index: WorkspaceListChildrenIndex;
  nodesById: WorkspaceListNodesById;
}

function ownCount(node: WorkspaceListNode | undefined) {
  return node && node.kind !== 'folder' ? 1 : 0;
}

export function isRegularNavigationFolder(node: WorkspaceListNode | undefined) {
  return node?.kind === 'folder' && !isVirtualRootNode(node) && !isVirtualNode(node);
}

function folderCount(id: string, total: number, libraryTotal: number, nodesById: WorkspaceListNodesById) {
  return id === HOME_NODE_ID || isHomeNode(nodesById[id]) ? libraryTotal : total;
}

function finishCycleTotals(
  nodesById: WorkspaceListNodesById,
  remainingChildren: Map<string, number>,
  subtreeTotals: Map<string, number>
) {
  // After the leaves are processed, each remaining component is a single cycle.
  for (const startId of remainingChildren.keys()) {
    const cycle = [startId];
    let id = nodesById[startId]?.parentNodeId;
    while (id && id !== startId) {
      cycle.push(id);
      id = nodesById[id]?.parentNodeId;
    }
    const total = cycle.reduce((sum, member) => sum + (subtreeTotals.get(member) ?? 0), 0);
    for (const member of cycle) {
      subtreeTotals.set(member, total);
      remainingChildren.delete(member);
    }
  }
}

function buildCounts(source: CountSource, folderIds: string[], trashCount: number): FolderContentCounts {
  const { index, nodesById } = source;
  const subtreeTotals = new Map<string, number>();
  const remainingChildren = new Map<string, number>();
  const ready: string[] = [];
  let libraryTotal = 0;
  for (const id of index.visibleNodeIds) {
    const own = ownCount(nodesById[id]);
    subtreeTotals.set(id, own);
    libraryTotal += own;
    const children = index.visibleChildrenByParent.get(id)?.length ?? 0;
    if (children > 0) remainingChildren.set(id, children);
    else ready.push(id);
  }
  for (const id of ready) {
    const parentId = nodesById[id]?.parentNodeId;
    if (!parentId || !subtreeTotals.has(parentId)) continue;
    subtreeTotals.set(parentId, subtreeTotals.get(parentId)! + subtreeTotals.get(id)!);
    const remaining = remainingChildren.get(parentId)! - 1;
    if (remaining === 0) {
      remainingChildren.delete(parentId);
      ready.push(parentId);
    } else remainingChildren.set(parentId, remaining);
  }
  const hasCycles = remainingChildren.size > 0;
  if (hasCycles) finishCycleTotals(nodesById, remainingChildren, subtreeTotals);
  const byFolderId = new Map(folderIds.map((id) => [
    id, folderCount(id, subtreeTotals.get(id) ?? 0, libraryTotal, nodesById)
  ]));
  byFolderId.set(TRASH_NODE_ID, trashCount);
  return { byFolderId, hasCycles, libraryTotal, subtreeTotals };
}

function addAncestorDelta(source: CountSource, nodeId: string, delta: number, changes: Map<string, number>) {
  let parentId = source.nodesById[nodeId]?.parentNodeId;
  while (parentId && source.index.visibleNodeIdSet.has(parentId)) {
    if (parentId === nodeId) return false;
    changes.set(parentId, (changes.get(parentId) ?? 0) + delta);
    parentId = source.nodesById[parentId]?.parentNodeId;
  }
  return true;
}

function applySingleChange(
  previousSource: CountSource,
  nextSource: CountSource,
  previous: FolderContentCounts,
  nodeId: string
) {
  if (previous.hasCycles) return null;
  const wasVisible = previousSource.index.visibleNodeIdSet.has(nodeId);
  const isVisible = nextSource.index.visibleNodeIdSet.has(nodeId);
  if (wasVisible !== isVisible && (
    previousSource.index.visibleChildrenByParent.has(nodeId) ||
    nextSource.index.visibleChildrenByParent.has(nodeId)
  )) return null;

  const before = wasVisible ? ownCount(previousSource.nodesById[nodeId]) : 0;
  const after = isVisible ? ownCount(nextSource.nodesById[nodeId]) : 0;
  const oldTotal = previous.subtreeTotals.get(nodeId) ?? 0;
  const newTotal = oldTotal + after - before;
  const deltas = new Map<string, number>();
  if (wasVisible && !addAncestorDelta(previousSource, nodeId, -oldTotal, deltas)) return null;
  if (isVisible && !addAncestorDelta(nextSource, nodeId, newTotal, deltas)) return null;

  // Only the current derivation owns subtree totals. Rows read the published folder map.
  const { subtreeTotals } = previous;
  if (isVisible) subtreeTotals.set(nodeId, newTotal);
  else subtreeTotals.delete(nodeId);
  const affectedIds = [nodeId];
  for (const [id, delta] of deltas) {
    if (!delta) continue;
    subtreeTotals.set(id, subtreeTotals.get(id)! + delta);
    affectedIds.push(id);
  }
  return { affectedIds, libraryTotal: previous.libraryTotal + after - before };
}

function updateFolderMap(
  previous: FolderContentCounts,
  source: CountSource,
  affectedIds: Iterable<string>,
  libraryTotal: number,
  trashCount: number
) {
  let updated: Map<string, number> | undefined;
  for (const id of affectedIds) {
    if (id === TRASH_NODE_ID) continue;
    const node = source.nodesById[id];
    const visibleFolder = source.index.visibleNodeIdSet.has(id) && isRegularNavigationFolder(node) && !isTrashNode(node);
    const next = visibleFolder
      ? folderCount(id, previous.subtreeTotals.get(id) ?? 0, libraryTotal, source.nodesById)
      : undefined;
    if (previous.byFolderId.get(id) === next) continue;
    updated ??= new Map(previous.byFolderId);
    if (next === undefined) updated.delete(id);
    else updated.set(id, next);
  }
  if (previous.byFolderId.get(TRASH_NODE_ID) !== trashCount) {
    updated ??= new Map(previous.byFolderId);
    updated.set(TRASH_NODE_ID, trashCount);
  }
  return updated ?? previous.byFolderId;
}

export function deriveFolderContentCounts(
  source: CountSource,
  folderIds: string[],
  trashCount: number,
  previous?: { source: CountSource; counts: FolderContentCounts }
): FolderContentCounts {
  const change = source.index.countChange;
  if (!previous || change === 'rebuild') return buildCounts(source, folderIds, trashCount);

  const counts = previous.counts;
  const update = change === 'none'
    ? { affectedIds: [], libraryTotal: counts.libraryTotal }
    : applySingleChange(previous.source, source, counts, change.nodeId);
  if (!update) return buildCounts(source, folderIds, trashCount);
  if (update.libraryTotal !== counts.libraryTotal) {
    for (const id of folderIds) {
      if (id === HOME_NODE_ID || isHomeNode(source.nodesById[id])) update.affectedIds.push(id);
    }
  }
  return {
    ...counts,
    libraryTotal: update.libraryTotal,
    byFolderId: updateFolderMap(counts, source, update.affectedIds, update.libraryTotal, trashCount)
  };
}
