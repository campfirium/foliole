import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

const INBOX_NODE_ID = 'special-inbox';

type ArticleNode = WorkspaceSnapshot['nodesById'][string];

function resolveOwningArticleId(snapshot: WorkspaceSnapshot, node: ArticleNode, trashedNodeIds: Set<string>) {
  let current: ArticleNode | undefined = node;
  let ownerId: string | null = null;
  while (current && !trashedNodeIds.has(current.id)) {
    if (current.anchorLink === null && current.kind === 'topic') {
      ownerId = current.id;
    }
    if (!current.parentNodeId || current.parentNodeId === INBOX_NODE_ID) {
      return ownerId;
    }
    current = snapshot.nodesById[current.parentNodeId];
  }
  return ownerId;
}

export function collectArticleData(snapshot: WorkspaceSnapshot) {
  const trashedNodeIds = new Set(snapshot.trashedNodeIds);
  const orderedIds = new Map(snapshot.nodeOrder.map((nodeId, index) => [nodeId, index]));
  const manualTopicsByArticleId = new Map<string, ArticleNode[]>();
  const articles = Object.values(snapshot.nodesById)
    .filter((node) => node.id !== INBOX_NODE_ID && node.anchorLink === null && node.kind === 'topic' && !trashedNodeIds.has(node.id))
    .filter((node) => {
      const articleId = resolveOwningArticleId(snapshot, node, trashedNodeIds);
      if (!articleId) {
        return false;
      }
      if (articleId !== node.id) {
        manualTopicsByArticleId.set(articleId, [...(manualTopicsByArticleId.get(articleId) ?? []), node]);
        return false;
      }
      return true;
    })
    .sort((left, right) => (orderedIds.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderedIds.get(right.id) ?? Number.MAX_SAFE_INTEGER));

  for (const [articleId, topics] of manualTopicsByArticleId) {
    manualTopicsByArticleId.set(
      articleId,
      topics.sort((left, right) => (orderedIds.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderedIds.get(right.id) ?? Number.MAX_SAFE_INTEGER))
    );
  }

  return { articles, manualTopicsByArticleId };
}
