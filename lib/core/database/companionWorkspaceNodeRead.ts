import type { DbPort, DbRow } from '../sync/dbPort.js';

import { loadNodeBodyResolutionWithPort } from './nodeBodyResolutionWithPort.js';
import { buildNodeBodyContentSql } from './nodeBodySql.js';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from './workspaceSnapshotHelpers.js';

export function loadCompanionWorkspaceNodeFromDb(db: DbPort, nodeId: string,
  storage: 'continuous' | 'chunked' = 'continuous') {
  return storage === 'chunked' ? db.transaction((tx) => readWorkspaceNode(tx, nodeId, storage))
    : readWorkspaceNode(db, nodeId, storage);
}

async function readWorkspaceNode(db: DbPort, nodeId: string,
  storage: 'continuous' | 'chunked' = 'continuous') {
  if (storage === 'chunked') {
    const [row] = await db.query<WorkspaceNodeRowShape & DbRow>('SELECT n.* FROM nodes n WHERE n.id = ?', [nodeId]);
    if (!row) return null;
    if (row.kind === 'folder' && row.body_blob_hash === null && row.content === '') {
      return buildWorkspaceSnapshotNode(row);
    }
    const body = await loadNodeBodyResolutionWithPort(db, nodeId, 'chunked');
    if (body?.status !== 'resolved') return null;
    return buildWorkspaceSnapshotNode({ ...row, content: body.content });
  }
  const [row] = await db.query<WorkspaceNodeRowShape & DbRow>(
    `SELECT n.*, ${buildNodeBodyContentSql()} AS content
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND (n.body_blob_hash IS NULL OR cbd.hash IS NOT NULL)`, [nodeId]
  );
  if (!row) return null;
  const node = buildWorkspaceSnapshotNode(row);
  return node;
}
