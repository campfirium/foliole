import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

export function loadCompanionWorkspaceNode(nodeId: string) {
  return loadCompanionWorkspaceNodes([nodeId]).then((nodes) => nodes[0] ?? null);
}

export function loadCompanionWorkspaceNodes(nodeIds: readonly string[]) {
  if (nodeIds.length === 0) return Promise.resolve([]);
  return getIosCompanionDatabaseOwner().read((db) => db.transaction(async (tx) => {
    const nodes = [];
    for (const nodeId of nodeIds) {
      const node = await loadCompanionWorkspaceNodeFromDb(tx, nodeId);
      if (node) nodes.push(node);
    }
    return nodes;
  }));
}
