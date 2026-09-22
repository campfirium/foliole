import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshotContract';
import { createVirtualNodeResultResolver } from '../../../../../lib/core/nodes/virtualNodeResults';
import { selectCanonicalTrashedNodeIds, selectCanonicalVisibleNodeIds } from '../../../workspaceCanonicalSelectors';
import type { CompanionExternalDirectory } from '../../companionExternalDocuments';

interface DirectoryCounts {
  countChildren: (parentNodeId: string, mode: 'trash' | 'visible') => number;
  countVirtualResults: (nodeId: string) => number | null;
  trashCount: number;
}

interface CachedDirectoryCounts {
  nodeOrder: WorkspaceSnapshot['nodeOrder'];
  result: DirectoryCounts;
  trashedNodeDeletedAtById: WorkspaceSnapshot['trashedNodeDeletedAtById'];
  trashedNodeIds: WorkspaceSnapshot['trashedNodeIds'];
  virtualResultIdsByNodeId: WorkspaceSnapshot['virtualResultIdsByNodeId'];
}

const directoryCounts = new WeakMap<WorkspaceSnapshot['nodesById'], CachedDirectoryCounts>();
const externalCounts = new WeakMap<CompanionExternalDirectory['entries'], Map<string, Map<string, number>>>();

function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countParents(snapshot: WorkspaceSnapshot, nodeIds: string[]) {
  const counts = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const parentNodeId = snapshot.nodesById[nodeId]?.parentNodeId;
    if (parentNodeId !== null && parentNodeId !== undefined) increment(counts, parentNodeId);
  }
  return counts;
}

function buildDirectoryCounts(source: WorkspaceSnapshot): DirectoryCounts {
  const snapshot = normalizeWorkspaceSnapshot(source);
  const visibleIds = selectCanonicalVisibleNodeIds(snapshot);
  const trashIds = selectCanonicalTrashedNodeIds(snapshot);
  const visibleCounts = countParents(snapshot, visibleIds);
  const trashCounts = countParents(snapshot, trashIds);
  const virtualCounts = new Map<string, number | null>();
  let resolveVirtualResults: ReturnType<typeof createVirtualNodeResultResolver> | undefined;
  return {
    countChildren: (parentNodeId, mode) => (mode === 'trash' ? trashCounts : visibleCounts).get(parentNodeId) ?? 0,
    countVirtualResults: (nodeId) => {
      if (virtualCounts.has(nodeId)) return virtualCounts.get(nodeId)!;
      const node = snapshot.nodesById[nodeId];
      if (!node?.virtualFilter) return null;
      const suppliedResults = snapshot.virtualResultIdsByNodeId?.[nodeId];
      if (!suppliedResults) {
        resolveVirtualResults ??= createVirtualNodeResultResolver({ nodeOrder: visibleIds, nodesById: snapshot.nodesById });
      }
      const count = (suppliedResults ?? resolveVirtualResults!({
        activeNodeId: nodeId, filter: node.virtualFilter, manualChildOrder: node.manualChildOrder
      })).length;
      virtualCounts.set(nodeId, count);
      return count;
    },
    trashCount: trashIds.length
  };
}

export function resolveCompanionDirectoryCounts(snapshot: WorkspaceSnapshot): DirectoryCounts {
  const cached = directoryCounts.get(snapshot.nodesById);
  if (cached && cached.nodeOrder === snapshot.nodeOrder &&
    cached.trashedNodeIds === snapshot.trashedNodeIds &&
    cached.trashedNodeDeletedAtById === snapshot.trashedNodeDeletedAtById &&
    cached.virtualResultIdsByNodeId === snapshot.virtualResultIdsByNodeId) return cached.result;
  const result = buildDirectoryCounts(snapshot);
  directoryCounts.set(snapshot.nodesById, {
    nodeOrder: snapshot.nodeOrder,
    result,
    trashedNodeDeletedAtById: snapshot.trashedNodeDeletedAtById,
    trashedNodeIds: snapshot.trashedNodeIds,
    virtualResultIdsByNodeId: snapshot.virtualResultIdsByNodeId
  });
  return result;
}

function buildExternalCounts(entries: CompanionExternalDirectory['entries']) {
  const folders = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    let paths = folders.get(entry.folderId);
    if (!paths) folders.set(entry.folderId, paths = new Map());
    increment(paths, '');
    for (let index = entry.relativePath.indexOf('/'); index >= 0; index = entry.relativePath.indexOf('/', index + 1)) {
      increment(paths, entry.relativePath.slice(0, index + 1));
    }
  }
  return folders;
}

export function countCompanionExternalDirectoryEntries(
  entries: CompanionExternalDirectory['entries'], folderId: string, directoryPath = ''
) {
  let counts = externalCounts.get(entries);
  if (!counts) {
    counts = buildExternalCounts(entries);
    externalCounts.set(entries, counts);
  }
  return counts.get(folderId)?.get(directoryPath ? `${directoryPath}/` : '') ?? 0;
}
