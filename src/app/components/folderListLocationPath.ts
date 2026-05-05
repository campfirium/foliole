import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export function resolveFolderListLocationPath(node: Node, nodesById: Record<string, Node>) {
  const items = buildNodeBreadcrumbs(node.parentNodeId, nodesById as WorkspaceListNodesById, Number.MAX_SAFE_INTEGER);
  if (items.length === 0) {
    return 'Top level';
  }
  return items.map((item) => item.title).join(' / ');
}
