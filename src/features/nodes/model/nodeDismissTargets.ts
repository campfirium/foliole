import { prepareWorkspaceNodeChildrenIndex } from './workspaceNodeChildrenIndex';

export type NodeDismissTargets = string[] | { topicRootId: string };
type TopicStructure = Record<string, { id: string; parentNodeId: string | null; kind?: string } | undefined>;

export function collectTopicDismissIds(rootNodeId: string, nodes: TopicStructure) {
  if (nodes[rootNodeId]?.kind !== 'topic') return [];
  const index = prepareWorkspaceNodeChildrenIndex(nodes);
  const ids = [rootNodeId];
  for (let cursor = 0; cursor < ids.length; cursor++) {
    const id = ids[cursor];
    if (!id) continue;
    for (const child of index.children.get(id) ?? []) ids.push(child.id);
  }
  return ids;
}
