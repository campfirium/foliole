import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNode, type WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';

export function resolveFolderListLocationPath(node: Node, nodesById: Record<string, Node>) {
  const ancestors: WorkspaceListNodesById = {};
  const visited = new Set<string>();
  let cursorId = node.parentNodeId;
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const ancestor = nodesById[cursorId];
    if (!ancestor) break;
    ancestors[cursorId] = toWorkspaceListNode(ancestor);
    cursorId = ancestor.parentNodeId;
  }
  const items = buildNodeBreadcrumbs(node.parentNodeId, ancestors, Number.MAX_SAFE_INTEGER);
  if (items.length === 0) {
    return translate(getStoredAppLocale(), 'desktop.search.context.topLevel');
  }
  return items.map((item) => item.title).join(' / ');
}
