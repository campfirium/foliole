import { loadCompanionWorkspaceNodeListFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';

export function loadCompanionWorkspaceNode(nodeId: string) {
  return loadCompanionWorkspaceNodes([nodeId]).then((nodes) => nodes[0] ?? null);
}

export function loadCompanionWorkspaceNodes(nodeIds: readonly string[]) {
  if (nodeIds.length === 0) return Promise.resolve([]);
  // One statement reads a consistent state without an explicit transaction.
  return getIosCompanionDatabaseOwner().read(db => loadCompanionWorkspaceNodeListFromDb(db, nodeIds));
}
