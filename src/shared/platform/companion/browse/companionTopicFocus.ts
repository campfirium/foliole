import { VIRTUAL_REMOVED_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { collectInactiveTopicBranchIds } from '../../../../features/nodes/model/inactiveTopicBranches';
import { selectCanonicalVisibleNodeIds } from '../../../workspaceCanonicalSelectors';
import type { CompanionFolderView } from '../../companionBrowseLists';

function filterTopicFocusRows<T extends { nodeId: string }>(
  snapshot: WorkspaceSnapshot,
  rows: T[],
  branchNodeIds: readonly string[]
): T[] {
  if (rows.length === 0) return rows;
  const { nodesById } = snapshot;
  const childrenByParent = new Map<string, string[]>();
  for (const nodeId of branchNodeIds) {
    const node = nodesById[nodeId];
    if (!node?.parentNodeId || node.kind === 'folder') continue;
    const children = childrenByParent.get(node.parentNodeId);
    if (children) children.push(nodeId);
    else childrenByParent.set(node.parentNodeId, [nodeId]);
  }
  const hidden = collectInactiveTopicBranchIds(
    rows.map(({ nodeId }) => nodeId), nodesById, (nodeId) => childrenByParent.get(nodeId) ?? []
  );
  return hidden.size ? rows.filter(({ nodeId }) => !hidden.has(nodeId)) : rows;
}

export function applyCompanionFolderTopicFocus(snapshot: WorkspaceSnapshot | null, folder: CompanionFolderView | null) {
  if (!snapshot || !folder || folder.nodeId === VIRTUAL_SHELVED_NODE_ID) return folder;
  const nodeIds = folder.nodeId === VIRTUAL_REMOVED_NODE_ID || snapshot.nodesById[folder.nodeId]?.virtualFilter
    ? folder.items.map(({ nodeId }) => nodeId)
    : selectCanonicalVisibleNodeIds(snapshot);
  const items = filterTopicFocusRows(snapshot, folder.items, nodeIds);
  return items === folder.items ? folder : { ...folder, items };
}

export function applyCompanionRecentTopicFocus<T extends { nodeId: string }>(snapshot: WorkspaceSnapshot | null, rows: T[]) {
  return snapshot ? filterTopicFocusRows(snapshot, rows, selectCanonicalVisibleNodeIds(snapshot)) : rows;
}
