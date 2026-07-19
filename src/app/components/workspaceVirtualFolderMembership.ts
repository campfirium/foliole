import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';

export function isManualVirtualFolder(node: Node | undefined): node is Node {
  return Boolean(node && isVirtualNode(node) && isManualVirtualNodeFilter(node.virtualFilter));
}

export function appendMissingTopicIds(currentIds: readonly string[], topicIds: readonly string[]) {
  const nextIds = [...currentIds];
  const seen = new Set(currentIds);
  topicIds.forEach((topicId) => {
    if (!seen.has(topicId)) {
      seen.add(topicId);
      nextIds.push(topicId);
    }
  });
  return nextIds;
}

export function listAvailableManualVirtualFolders(args: {
  nodeOrder: readonly string[];
  nodesById: Record<string, Node | undefined>;
  topicIds: readonly string[];
}) {
  return args.nodeOrder
    .map((nodeId) => args.nodesById[nodeId])
    .filter((node): node is Node => isManualVirtualFolder(node))
    .filter((folder) => args.topicIds.some((topicId) => !(folder.manualChildOrder ?? []).includes(topicId)));
}
