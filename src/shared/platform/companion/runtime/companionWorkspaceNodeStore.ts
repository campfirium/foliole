import { buildNodeBodyContentSql } from '../../../../../lib/core/database/nodeBodySql';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

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

export async function loadCompanionWorkspaceNodeFromDb(db: DbPort, nodeId: string) {
  const [row] = await db.query<WorkspaceNodeRowShape & DbRow>(
    `SELECT n.*, ${buildNodeBodyContentSql()} AS content
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND (n.body_blob_hash IS NULL OR cbd.hash IS NOT NULL)`, [nodeId]
  );
  if (!row) return null;
  const node = buildWorkspaceSnapshotNode(row);
  return node;
}
