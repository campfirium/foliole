import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';

export function resolveFolderListLocationPath(node: Node, nodesById: Record<string, Node>) {
  const items = buildNodeBreadcrumbs(node.parentNodeId, toWorkspaceListNodesById(nodesById), Number.MAX_SAFE_INTEGER);
  if (items.length === 0) {
    return translate(getStoredAppLocale(), 'desktop.search.context.topLevel');
  }
  return items.map((item) => item.title).join(' / ');
}
