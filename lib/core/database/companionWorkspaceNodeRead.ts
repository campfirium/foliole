import type { DbPort, DbRow } from '../sync/dbPort.js';

import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from './workspaceSnapshotHelpers.js';

export async function loadCompanionWorkspaceNodeFromDb(db: DbPort, nodeId: string) {
  const [row] = await db.query<WorkspaceNodeRowShape & DbRow>(
    'SELECT n.* FROM nodes n WHERE n.id = ?', [nodeId]
  );
  if (!row) return null;
  const node = buildWorkspaceSnapshotNode(row);
  return node;
}
