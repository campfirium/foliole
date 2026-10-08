import type { DatabaseDriver, DatabaseRow } from './driver.js';

export { buildNodeBodyContentSql } from './nodeBodySql.js';

export interface NodeBodyRow extends DatabaseRow {
  body_blob_data?: unknown;
  body_blob_hash: string | null;
  content: string;
}

export type NodeBodyResolution = {
  bodyBlobHash: string | null;
  content: string;
  source: 'node';
  status: 'resolved';
};

export class NodeBodyUnavailableError extends Error {
  readonly nodeIds: string[];

  constructor(nodeIds: string[]) {
    super(`node_body_unavailable:${nodeIds.join(',')}`);
    this.name = 'NodeBodyUnavailableError';
    this.nodeIds = nodeIds;
  }
}

export function resolveNodeBody(row: NodeBodyRow): NodeBodyResolution {
  const bodyBlobHash = row.body_blob_hash?.trim() || null;
  return { bodyBlobHash, content: row.content, source: 'node', status: 'resolved' };
}

export function requireResolvedNodeBody(row: NodeBodyRow) {
  return resolveNodeBody(row);
}

export function loadNodeBodyResolution(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<NodeBodyRow>(
    'SELECT content, body_blob_hash FROM nodes WHERE id = ?',
    [nodeId]
  );
  return row ? resolveNodeBody(row) : null;
}
