import { isVisuallyInactiveWorkspaceListReadingTopic, type TopicFocusNode } from './workspaceListNode';

export function collectInactiveTopicBranchIds(
  rootIds: readonly string[],
  nodesById: Record<string, TopicFocusNode | undefined>,
  getChildren: (nodeId: string) => readonly string[]
) {
  const visited = new Set<string>();
  const branchIds = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return branchIds.has(nodeId);
    visited.add(nodeId);
    if (!isVisuallyInactiveWorkspaceListReadingTopic(nodesById[nodeId], nodesById)) return false;
    const allChildrenInactive = getChildren(nodeId).map(visit).every(Boolean);
    if (allChildrenInactive) branchIds.add(nodeId);
    return allChildrenInactive;
  };
  rootIds.forEach(visit);
  return branchIds;
}
