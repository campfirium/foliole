import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes, type MoveNodesInput } from '../database/nodeMutations.js';
import { withTransaction } from '../database/transaction.js';

import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';

function captureMovedArticleIds(nodeIds: string[]) {
  const sqlite = openDatabaseConnection().sqlite;
  const articleIds = new Set<string>();
  const descendants = sqlite.prepare(`WITH RECURSIVE subtree AS (
    SELECT id FROM nodes WHERE id = ?
    UNION
    SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id
  ) SELECT id FROM subtree`);
  for (const nodeId of nodeIds) {
    for (const row of descendants.all(nodeId) as Array<{ id: string }>) {
      for (const articleId of resolveArticleIdsFromNodeId(row.id)) articleIds.add(articleId);
    }
  }
  return articleIds;
}

/** Capture both saved scopes while the move owns the database transaction. */
export function moveNodesWithMirrorInputs(input: MoveNodesInput) {
  return withTransaction(openDatabaseConnection().driver, () => {
    const nodeIds = input.nodes.map((node) => node.nodeId);
    const articleIds = captureMovedArticleIds(nodeIds);
    const result = moveNodes(input);
    for (const articleId of captureMovedArticleIds(nodeIds)) articleIds.add(articleId);
    return { result, articleIds: [...articleIds] };
  });
}
