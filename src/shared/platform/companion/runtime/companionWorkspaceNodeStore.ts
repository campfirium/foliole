import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

export function loadCompanionWorkspaceNode(nodeId: string, storage: 'continuous' | 'chunked' = 'continuous') {
  return loadCompanionWorkspaceNodes([nodeId], storage).then((nodes) => nodes[0] ?? null);
}

export function loadCompanionWorkspaceNodes(nodeIds: readonly string[], storage: 'continuous' | 'chunked' = 'continuous') {
  if (nodeIds.length === 0) return Promise.resolve([]);
  return getIosCompanionDatabaseOwner().read((db) => db.transaction(async (tx) => {
    const nodes = [];
    for (const nodeId of nodeIds) {
      const node = await loadCompanionWorkspaceNodeFromDb(tx, nodeId, storage);
      if (node) nodes.push(node);
    }
    return nodes;
  }));
}
