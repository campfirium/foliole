import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes, type MoveNodesInput } from '../database/nodeMutations.js';
import { withTransaction } from '../database/transaction.js';

import { resolveArticleIdsForSubtrees } from './mirrorArticleResolver.js';

/** Capture both saved scopes while the move owns the database transaction. */
export function moveNodesWithMirrorInputs(input: MoveNodesInput) {
  return withTransaction(openDatabaseConnection().driver, () => {
    const nodeIds = input.nodes.map((node) => node.nodeId);
    const articleIds = resolveArticleIdsForSubtrees(nodeIds);
    const result = moveNodes(input);
    for (const articleId of resolveArticleIdsForSubtrees(nodeIds)) articleIds.add(articleId);
    return { result, articleIds: [...articleIds] };
  });
}
